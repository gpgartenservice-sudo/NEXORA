import { router } from 'expo-router';
import { Check, Link2, Mail, MessageCircle, Send, Share } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionChip } from '@/components/ui/action-chip';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import type { Customer } from '@/features/crm/crm-provider';
import { usePlan, useProGate } from '@/features/plan/plan-provider';
import { copyText } from '@/features/social/copy-text';

import { DirectMail } from './direct-mail';
import { documentMessage, formatDay, mailtoUrl, whatsappNumber, whatsappUrl } from './document-logic';
import { useDocuments, type StoredDocument } from './documents-provider';
import { mailLogFor, type MailLogEntry } from './mail-api';
import { offerUrl } from './offer-link';
import { pdfSupported, preparePdf, type PreparedPdf } from './save-pdf';
import { canShareFile, openWith, shareFile, type Delivery } from './send-document';
import { WEB_URL } from './web-url';

type Props = {
  doc: StoredDocument;
  customer: Customer;
  /** Steht der Auftrag schon auf "Angebot verschickt"? */
  offerSent: boolean;
  onMarkOfferSent: () => Promise<{ error?: string }>;
};

type Message = { tone: 'info' | 'success' | 'error'; text: string };

const WHERE = {
  finder: 'Das PDF ist im Finder markiert (Downloads › NEXORA)',
  download: 'Das PDF wurde heruntergeladen',
};

/**
 * Angebot/Rechnung selbst verschicken: E-Mail oder WhatsApp öffnen sich mit
 * fertigem Text, das PDF liegt zum Anhängen bereit. Danach lässt sich das
 * Angebot als verschickt markieren.
 */
export function SendPanel({ doc, customer, offerSent, onMarkOfferSent }: Props) {
  const [pdf, setPdf] = useState<PreparedPdf | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [marking, setMarking] = useState(false);
  const [direct, setDirect] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [log, setLog] = useState<MailLogEntry[]>([]);
  const { logoFor, shareOffer } = useDocuments();
  const { pro } = usePlan();
  const gate = useProGate();

  // bisher direkt verschickt?
  useEffect(() => {
    let active = true;
    mailLogFor(doc.id).then((list) => active && setLog(list));
    return () => {
      active = false;
    };
  }, [doc.id]);

  // PDF vorab erzeugen, damit E-Mail/WhatsApp sofort beim Klick aufgehen
  useEffect(() => {
    if (!pdfSupported) return;
    let active = true;
    logoFor(doc)
      .then((logo) => preparePdf(doc, logo))
      .then(
      (p) => active && setPdf(p),
      (e) =>
        active &&
        setMessage({ tone: 'error', text: `Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}` }),
    );
    return () => {
      active = false;
    };
  }, [doc, logoFor]);

  if (!pdfSupported) {
    return <Notice>Verschicken geht hier gerade nicht.</Notice>;
  }

  const isOffer = doc.kind === 'offer';
  const text = documentMessage({ ...doc, customerName: customer.name });
  // aktuelle Kontaktdaten des Kunden (nicht die vom Erstellen des Dokuments)
  const email = customer.email;
  const hasPhone = !!whatsappNumber(customer.phone);
  const share = !!pdf && canShareFile(pdf);

  const report = (result: Delivery, opened: string, attach: string) => {
    if (result.error) setMessage({ tone: 'error', text: result.error });
    else if (result.message) setMessage({ tone: 'success', text: result.message });
    else if (result.pdf) setMessage({ tone: 'info', text: `${opened} ${WHERE[result.pdf]} – ${attach}` });
    else setMessage(null);
  };

  const viaMail = async () => {
    if (!pdf) return;
    report(
      await openWith(pdf, mailtoUrl(email, text.subject, text.body)),
      `Dein E-Mail-Programm öffnet sich mit fertigem Text${email ? ` an ${email}` : ''}.`,
      'zieh es einfach in die E-Mail.',
    );
  };

  const viaWhatsApp = async () => {
    if (!pdf) return;
    report(
      await openWith(pdf, whatsappUrl(customer.phone, text.chat)),
      'WhatsApp öffnet sich mit fertigem Text.',
      'zieh es einfach in den Chat.',
    );
  };

  const viaShare = async () => {
    if (!pdf) return;
    const result = await shareFile(pdf, text.body, text.subject);
    setMessage(
      result.error
        ? { tone: 'error', text: result.error }
        : result.message
          ? { tone: 'success', text: result.message }
          : null,
    );
  };

  /** Angebots-Link anlegen (bleibt danach gleich) */
  const makeLink = async (): Promise<{ url?: string; error?: string }> => {
    if (!WEB_URL)
      return {
        error:
          'Für Online-Angebote muss NEXORA im Internet stehen (EXPO_PUBLIC_WEB_URL in der .env – Anleitung: supabase/README.md, Abschnitt 9).',
      };
    const { token, error } = await shareOffer(doc.id);
    if (error || !token) return { error: error ?? 'Der Link konnte nicht erstellt werden.' };
    const url = offerUrl(WEB_URL, token);
    setLink(url);
    return { url };
  };

  const copyLink = async () => {
    const { url, error } = await makeLink();
    if (error || !url) return setMessage({ tone: 'error', text: error ?? 'Der Link konnte nicht erstellt werden.' });
    // Zwischenablage nicht erlaubt? Der Link steht trotzdem unten.
    const copied = await copyText(url);
    setMessage({
      tone: 'success',
      text: copied
        ? 'Link kopiert – füg ihn z. B. in WhatsApp ein. Dein Kunde kann das Angebot damit ansehen und annehmen.'
        : 'Link erstellt – kopier ihn unten. Dein Kunde kann das Angebot damit ansehen und annehmen.',
    });
  };

  const markSent = async () => {
    setMarking(true);
    const { error } = await onMarkOfferSent();
    setMarking(false);
    setMessage(
      error
        ? { tone: 'error', text: error }
        : { tone: 'success', text: 'Erledigt – der Auftrag steht jetzt auf „Angebot verschickt“.' },
    );
  };

  const missing =
    !email && !hasPhone
      ? 'Beim Kunden sind keine E-Mail-Adresse und keine Handynummer hinterlegt – den Empfänger wählst du dann im Mail-Programm bzw. in WhatsApp selbst.'
      : !email
        ? 'Beim Kunden ist keine E-Mail-Adresse hinterlegt – du trägst sie dann im Mail-Programm ein.'
        : !hasPhone
          ? 'Beim Kunden ist keine Handynummer hinterlegt – in WhatsApp wählst du den Kontakt dann selbst.'
          : null;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Verschicken an {customer.name}</Text>
      <View style={styles.actions}>
        <ActionChip icon={Mail} label="E-Mail" accessibilityLabel="Per E-Mail senden" onPress={viaMail} disabled={!pdf} />
        <ActionChip
          icon={MessageCircle}
          label="WhatsApp"
          accessibilityLabel="Per WhatsApp senden"
          onPress={viaWhatsApp}
          disabled={!pdf}
        />
        {share && <ActionChip icon={Share} label="Teilen …" onPress={viaShare} />}
        <ActionChip
          icon={Send}
          label={pro ? 'Direkt senden' : 'Direkt senden · Pro'}
          accessibilityLabel="Direkt aus NEXORA senden"
          onPress={() => gate('direct_mail') && setDirect((v) => !v)}
          active={direct}
          disabled={!pdf}
        />
        {isOffer && (
          <ActionChip
            icon={Link2}
            label={pro ? 'Link zum Annehmen' : 'Link zum Annehmen · Pro'}
            accessibilityLabel="Link zum Online-Annehmen"
            onPress={() => gate('offer_link') && void copyLink()}
          />
        )}
      </View>
      {direct && pdf && (
        <DirectMail
          defaultTo={email}
          subject={text.subject}
          body={text.body}
          attachment={async () => ({ bytes: pdf.bytes, fileName: pdf.fileName })}
          attachmentName={pdf.fileName}
          kind={doc.kind}
          documentId={doc.id}
          offerLink={isOffer ? makeLink : undefined}
          onSent={async ({ to }) => {
            setLog((l) => [
              { id: `neu-${l.length}`, document_id: doc.id, kind: doc.kind, to_email: to, subject: text.subject, created_at: new Date().toISOString() },
              ...l,
            ]);
            if (isOffer && !offerSent) await onMarkOfferSent();
          }}
        />
      )}
      {link && (
        <Text style={styles.link} selectable testID="offer-link">
          {link}
        </Text>
      )}
      {log.length > 0 && (
        <View style={styles.log}>
          {log.map((l) => (
            <Text key={l.id} style={styles.hint}>
              ✓ Direkt verschickt am {formatDay(l.created_at.slice(0, 10))} an {l.to_email}
            </Text>
          ))}
        </View>
      )}
      <Text style={styles.hint}>
        Text und Betreff sind schon fertig – du schickst selbst ab.
        {share ? ' Über „Teilen …“ hängt dein Mac das PDF direkt an (z. B. Mail, Nachrichten, AirDrop).' : ''}
      </Text>
      {missing && (
        <View style={styles.missing}>
          <Text style={styles.hint}>{missing}</Text>
          <TextLink label="Kontaktdaten ergänzen →" emphasis onPress={() => router.push(`/kunden/${customer.id}`)} />
        </View>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      {isOffer && !offerSent && (
        <View style={styles.mark}>
          <Text style={styles.markText}>Verschickt? Dann setz den Auftrag auf „Angebot verschickt“.</Text>
          <ActionChip icon={Check} label={marking ? 'Speichert …' : 'Als verschickt markieren'} onPress={markSent} disabled={marking} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  title: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hint: { color: Colors.textFaint, fontSize: 13, lineHeight: 18 },
  missing: { gap: Spacing.xs },
  mark: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  markText: { color: Colors.textMuted, fontSize: 13, lineHeight: 18, flexShrink: 1 },
  link: { color: Colors.accent, fontSize: 13, lineHeight: 18 },
  log: { gap: 2 },
});
