import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import { formatDay, formatMoney, sellerName, todayIso, type Seller } from '@/features/documents/document-logic';
import type { LogoImage } from '@/features/documents/logo-logic';
import { A4, drawFooter, drawLetterhead, INK, LINE, M, MUTED, safe, wrap } from '@/features/documents/pdf';

import { reminderText, STAGES, totalFees, type DunningKind, type Followup, type InvoiceLike } from './dunning-logic';

export type ReminderPdf = {
  kind: DunningKind;
  doc: InvoiceLike;
  /** bisherige Erinnerungen/Mahnungen (für Bezug und Gebühren) */
  history: Followup[];
  fee: number;
  newDueOn: string;
  /** aktuelle Firmendaten (Absender, Bankverbindung) */
  seller: Seller;
  logo?: LogoImage | null;
  customerName?: string | null;
  /** Datum des Schreibens JJJJ-MM-TT */
  createdOn?: string;
};

/** Zahlungserinnerung bzw. Mahnung als PDF – im gleichen Briefkopf wie die Rechnung. */
export async function renderReminderPdf(input: ReminderPdf): Promise<Uint8Array> {
  const { kind, doc, history, fee, newDueOn, seller: s, logo, createdOn = todayIso() } = input;
  const stage = STAGES.find((x) => x.kind === kind)!;
  const t = reminderText({ ...input, seller: s });
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const name = sellerName(s);
  pdf.setTitle(`${stage.label} – Rechnung ${doc.number}`);
  pdf.setAuthor(name);
  pdf.setCreator('Lunaxora');
  pdf.setLanguage('de-DE');

  const page = pdf.addPage([A4.w, A4.h]);
  const right = A4.w - M.right;
  const width = right - M.left;
  const text = (p: PDFPage, value: string, x: number, y: number, size = 10, font: PDFFont = regular, color = INK) =>
    p.drawText(safe(value), { x, y, size, font, color });
  const textRight = (
    p: PDFPage,
    value: string,
    xRight: number,
    y: number,
    size = 10,
    font: PDFFont = regular,
    color = INK,
  ) => text(p, value, xRight - font.widthOfTextAtSize(safe(value), size), y, size, font, color);

  // Kopf: Briefkopf links, Titel und Angaben rechts
  await drawLetterhead(pdf, page, s, logo, regular, bold);
  textRight(page, stage.title, right, A4.h - 62, kind === 'dunning2' ? 16 : 17, bold);
  const meta: [string, string][] = [
    ['Datum', formatDay(createdOn)],
    ['Rechnungsnr.', doc.number],
    ['Rechnungsdatum', formatDay(doc.issued_on)],
    ['Zahlbar bis', formatDay(newDueOn)],
  ];
  meta.forEach(([label, value], i) => {
    const y = A4.h - 84 - i * 13;
    textRight(page, value, right, y, 9, bold);
    textRight(page, label, right - 110, y, 9, regular, MUTED);
  });

  // Anschrift (wie auf der Rechnung, DIN 5008)
  const addressTop = A4.h - 127.6;
  const returnLine = [name, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  text(page, returnLine, M.left, addressTop - 10, 7, regular, MUTED);
  page.drawLine({
    start: { x: M.left, y: addressTop - 13 },
    end: { x: M.left + 240, y: addressTop - 13 },
    thickness: 0.4,
    color: LINE,
  });
  const b = doc.data.buyer;
  const buyerLines = [b.company, input.customerName || b.name, ...(b.address ?? '').split(/\n|,\s*/)].filter(
    (l) => l && l.trim(),
  ) as string[];
  buyerLines.slice(0, 6).forEach((l, i) => text(page, l.trim(), M.left, addressTop - 30 - i * 13, 10.5));

  // Betreff + Text
  let y = A4.h - 290;
  text(page, t.subject, M.left, y, 13, bold);
  y -= 24;
  text(page, t.greeting, M.left, y, 10);
  y -= 20;
  for (const paragraph of t.paragraphs) {
    for (const line of wrap(paragraph, regular, 10, width)) {
      text(page, line, M.left, y, 10);
      y -= 14;
    }
    y -= 8;
  }

  // Aufstellung
  y -= 4;
  const fees = totalFees(history, fee);
  const rows: [string, number, boolean][] = [
    [`Rechnung ${doc.number} vom ${formatDay(doc.issued_on)}`, doc.total, false],
  ];
  for (const h of history.filter((x) => x.kind !== kind && Number(x.fee) > 0))
    rows.push([
      `Mahngebühr (${STAGES.find((x) => x.kind === h.kind)?.label ?? ''} vom ${formatDay(h.sent_on)})`,
      Number(h.fee),
      false,
    ]);
  if (fee > 0) rows.push([`Mahngebühr (${stage.label})`, fee, false]);
  for (const [label, value] of rows) {
    text(page, label, M.left, y, 10);
    textRight(page, formatMoney(value), right, y, 10);
    y -= 8;
    page.drawLine({ start: { x: M.left, y }, end: { x: right, y }, thickness: 0.4, color: LINE });
    y -= 14;
  }
  page.drawRectangle({ x: M.left - 6, y: y - 8, width: width + 12, height: 24, color: rgb(0.93, 0.99, 0.96) });
  text(page, fees > 0 ? 'Offener Gesamtbetrag' : 'Offener Betrag', M.left, y, 11, bold);
  textRight(page, formatMoney(doc.total + fees), right, y, 11, bold);
  y -= 34;

  // Bankverbindung
  if (s.iban) {
    const bank = `Bankverbindung: ${[s.owner_name || name, s.bank_name, `IBAN ${s.iban}`, s.bic ? `BIC ${s.bic}` : ''].filter(Boolean).join(' · ')}`;
    for (const line of wrap(bank, regular, 9.5, width)) {
      text(page, line, M.left, y, 9.5);
      y -= 13;
    }
    text(page, `Verwendungszweck: ${doc.number}`, M.left, y, 9.5);
    y -= 22;
  }

  text(page, 'Mit freundlichen Grüßen', M.left, y, 10);
  text(page, s.owner_name || name, M.left, y - 16, 10, bold);
  drawFooter(page, s, regular);
  return pdf.save();
}
