import { Paperclip, Send } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Radius, Spacing } from '@/constants/theme';

import { sellerName } from './document-logic';
import { useDocuments } from './documents-provider';
import { sendMail, type MailKind } from './mail-api';
import { splitRecipients, validEmail } from './mail-logic';
import { withOfferLink } from './offer-link';

type Props = {
  defaultTo: string | null;
  subject: string;
  body: string;
  /** PDF für den Anhang – wird erst beim Senden erzeugt */
  attachment?: () => Promise<{ bytes: Uint8Array; fileName: string } | null>;
  attachmentName?: string | null;
  kind: MailKind;
  documentId?: string | null;
  /** Angebot: Link zum Online-Annehmen anbieten */
  offerLink?: () => Promise<{ url?: string; error?: string }>;
  onSent?: (info: { to: string }) => void | Promise<void>;
};

/** E-Mail direkt aus der App verschicken – Text anpassen, PDF hängt dran. */
export function DirectMail({
  defaultTo,
  subject: s0,
  body: b0,
  attachment,
  attachmentName,
  kind,
  documentId,
  offerLink,
  onSent,
}: Props) {
  const { seller } = useDocuments();
  const [to, setTo] = useState(defaultTo ?? '');
  const [subject, setSubject] = useState(s0);
  const [body, setBody] = useState(b0);
  const [withLink, setWithLink] = useState(!!offerLink);
  const [errors, setErrors] = useState<{ to?: string; subject?: string; body?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const from = sellerName(seller) || 'Lunaxora';
  const replyTo = seller.email && validEmail(seller.email) ? seller.email : null;

  const send = async () => {
    const recipients = splitRecipients(to);
    const next = {
      to: !recipients.length
        ? 'An wen soll die E-Mail gehen?'
        : !recipients.every(validEmail)
          ? 'Bitte eine gültige E-Mail-Adresse eingeben.'
          : recipients.length > 3
            ? 'Höchstens 3 Empfänger.'
            : undefined,
      subject: subject.trim() ? undefined : 'Bitte einen Betreff eingeben.',
      body: body.trim() ? undefined : 'Bitte einen Text eingeben.',
    };
    setErrors(next);
    if (next.to || next.subject || next.body) return;
    setSending(true);
    setFailure(null);
    let text = body.trim();
    if (offerLink && withLink) {
      const link = await offerLink();
      if (link.error || !link.url) {
        setSending(false);
        return setFailure(link.error ?? 'Der Link konnte nicht erstellt werden.');
      }
      text = withOfferLink(text, link.url);
    }
    let file: { bytes: Uint8Array; fileName: string } | null = null;
    if (attachment) {
      try {
        file = await attachment();
      } catch (e) {
        setSending(false);
        return setFailure(`Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}`);
      }
    }
    const result = await sendMail({
      to: recipients.join(', '),
      subject: subject.trim(),
      text,
      fromName: from,
      replyTo,
      attachment: file,
      documentId,
      kind,
    });
    setSending(false);
    if (result.error) return setFailure(result.error);
    setSentTo(recipients.join(', '));
    await onSent?.({ to: recipients.join(', ') });
  };

  if (sentTo) {
    return (
      <Notice tone="success">
        {`Gesendet an ${sentTo}${attachmentName ? ` – mit ${attachmentName}` : ''}. Antworten landen ${replyTo ? `bei ${replyTo}` : 'bei der E-Mail-Adresse deines Kontos'}.`}
      </Notice>
    );
  }

  return (
    <View style={styles.wrap} testID="direct-mail">
      <TextField
        label="An"
        value={to}
        onChangeText={(v) => {
          setTo(v);
          setErrors((e) => ({ ...e, to: undefined }));
        }}
        error={errors.to}
        placeholder="kunde@beispiel.de"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextField
        label="Betreff"
        value={subject}
        onChangeText={(v) => {
          setSubject(v);
          setErrors((e) => ({ ...e, subject: undefined }));
        }}
        error={errors.subject}
        maxLength={200}
      />
      <TextField
        label="Nachricht"
        value={body}
        onChangeText={(v) => {
          setBody(v);
          setErrors((e) => ({ ...e, body: undefined }));
        }}
        error={errors.body}
        multiline
        style={styles.multiline}
        maxLength={15000}
      />
      {offerLink && <ToggleRow label="Link zum Online-Annehmen einfügen" value={withLink} onChange={setWithLink} />}
      <View style={styles.info}>
        {attachmentName && (
          <View style={styles.infoRow}>
            <Paperclip size={14} color={Colors.textMuted} />
            <Text style={styles.infoText}>{attachmentName} wird angehängt</Text>
          </View>
        )}
        <Text style={styles.infoText}>
          Absender: {from} · Antworten gehen an {replyTo ?? 'die E-Mail-Adresse deines Kontos'}
        </Text>
      </View>
      {failure && <Notice tone="error">{failure}</Notice>}
      <Button label={sending ? 'Wird gesendet …' : 'Jetzt senden'} onPress={() => void send()} loading={sending} />
      <View style={styles.hintRow}>
        <Send size={13} color={Colors.textFaint} />
        <Text style={styles.hint}>Geht direkt an den Kunden – ohne Mail-Programm.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    backgroundColor: Colors.surfaceRaised,
  },
  multiline: { minHeight: 180, paddingVertical: Spacing.md, textAlignVertical: 'top' },
  info: { gap: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoText: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  hint: { color: Colors.textFaint, fontSize: 12 },
});
