/**
 * Verschicken von Angeboten, Rechnungen und Mahnungen am Handy (iPhone/Android).
 * Mac/Browser: send-document.ts.
 *
 * - E-Mail: Die Mail-App öffnet sich mit Empfänger, Betreff, Text – und dem
 *   PDF schon im Anhang. Ohne eingerichtete Mail-App: Teilen-Menü.
 * - WhatsApp: Der Text wird kopiert, das Teilen-Menü geht mit dem PDF auf –
 *   dort WhatsApp und den Kontakt wählen, Text einfügen.
 * - Teilen: Teilen-Menü mit dem PDF.
 */
import * as Clipboard from 'expo-clipboard';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';

import { writeTempFile } from '@/lib/files.native';

import type { PreparedPdf } from './save-pdf';
import { parseMailto, whatsappText } from './share-logic';

export function isDesktop(): boolean {
  return false;
}

/** Am Handy gibt es immer ein Teilen-Menü */
export function canShareFile(_pdf: PreparedPdf): boolean {
  return true;
}

export type Delivery = { error?: string; pdf?: 'finder' | 'download'; message?: string; note?: string };

const failed = (e: unknown): Delivery => {
  console.warn('[Verschicken]', e);
  return { error: `Das hat nicht geklappt.\n\nTechnische Details: ${String(e)}` };
};

async function sharePdf(pdf: PreparedPdf, title: string) {
  const uri = await writeTempFile(pdf.bytes, pdf.fileName);
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: title });
}

/** E-Mail (Mail-App mit Anhang) bzw. WhatsApp (Text kopiert + Teilen-Menü) */
/** opts.from: Absender – am Handy wählt die Mail-App das Konto selbst */
export async function openWith(pdf: PreparedPdf, url: string, _opts: { from?: string | null } = {}): Promise<Delivery> {
  try {
    const mail = parseMailto(url);
    if (mail) {
      if (await MailComposer.isAvailableAsync()) {
        const uri = await writeTempFile(pdf.bytes, pdf.fileName);
        await MailComposer.composeAsync({
          recipients: mail.to,
          subject: mail.subject,
          body: mail.body,
          attachments: [uri],
        });
        return { message: 'Die E-Mail ist vorbereitet – das PDF hängt schon dran.' };
      }
      // keine Mail-App eingerichtet: Text kopieren + Teilen-Menü
      await Clipboard.setStringAsync(mail.body);
      await sharePdf(pdf, mail.subject || pdf.fileName);
      return { message: 'Keine Mail-App eingerichtet: Der Text ist kopiert – PDF über das Teilen-Menü verschicken.' };
    }
    const text = whatsappText(url);
    if (text !== null) {
      await Clipboard.setStringAsync(text);
      await sharePdf(pdf, pdf.fileName);
      return { message: 'Der Text ist kopiert – in WhatsApp den Kontakt wählen und den Text einfügen.' };
    }
    await sharePdf(pdf, pdf.fileName);
    return {};
  } catch (e) {
    return failed(e);
  }
}

/** Teilen-Menü mit dem PDF als Anhang (Mail, Nachrichten, AirDrop, WhatsApp …). */
export async function shareFile(pdf: PreparedPdf, text: string, title: string): Promise<Delivery> {
  try {
    if (text) await Clipboard.setStringAsync(text);
    await sharePdf(pdf, title);
    return text ? { message: 'Der Text ist kopiert – du kannst ihn in die Nachricht einfügen.' } : {};
  } catch (e) {
    return failed(e);
  }
}
