import { router } from 'expo-router';
import { Check, Mail, MessageCircle, Share } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ActionChip } from '@/components/ui/action-chip';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import type { Customer } from '@/features/crm/crm-provider';

import { documentMessage, mailtoUrl, whatsappNumber, whatsappUrl } from './document-logic';
import { useDocuments, type StoredDocument } from './documents-provider';
import { pdfSupported, preparePdf, type PreparedPdf } from './save-pdf';
import { canShareFile, openWith, shareFile, type Delivery } from './send-document';

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
  const { logoFor } = useDocuments();

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
    return <Notice>Verschicken gibt es im Moment nur auf dem Mac. Am Handy folgt es bald.</Notice>;
  }

  const isOffer = doc.kind === 'offer';
  const text = documentMessage({ ...doc, customerName: customer.name });
  // aktuelle Kontaktdaten des Kunden (nicht die vom Erstellen des Dokuments)
  const email = customer.email;
  const hasPhone = !!whatsappNumber(customer.phone);
  const share = !!pdf && canShareFile(pdf);

  const report = (result: Delivery, opened: string, attach: string) => {
    if (result.error) setMessage({ tone: 'error', text: result.error });
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
    const { error } = await shareFile(pdf, text.body, text.subject);
    setMessage(error ? { tone: 'error', text: error } : null);
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
      </View>
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
});
