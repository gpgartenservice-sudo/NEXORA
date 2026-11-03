import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import { formatDay, formatMoney, sellerName, todayIso, type Seller } from '@/features/documents/document-logic';
import type { LogoImage } from '@/features/documents/logo-logic';
import { A4, drawFooter, drawLetterhead, INK, LINE, M, MUTED, safe, wrap } from '@/features/documents/pdf';

/**
 * Jahresübersicht für die Steuerberatung: Einnahmen, Ausgaben nach
 * Kategorie, Gewinn, Umsatzsteuer und die Rechnungen des Jahres.
 * Eine Arbeitshilfe – keine Steuererklärung.
 */
export type TaxYearPdf = {
  seller: Seller;
  logo?: LogoImage | null;
  year: number;
  /** bis heute (laufendes Jahr) */
  partial: boolean;
  totals: { income: number; expenses: number; profit: number };
  categories: { label: string; amount: number }[];
  vat: { collected: number; input: number; payable: number } | null;
  invoices: {
    number: string;
    issued_on: string;
    customer: string;
    net: number;
    vat: number;
    gross: number;
    paid_at: string | null;
  }[];
  receipts: number;
  createdOn?: string;
};

export async function renderTaxYearPdf(input: TaxYearPdf): Promise<Uint8Array> {
  const { seller, logo, year, partial, totals, categories, vat, invoices, receipts, createdOn = todayIso() } = input;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const name = sellerName(seller);
  pdf.setTitle(`Jahresübersicht ${year}`);
  pdf.setAuthor(seller.owner_name || name);
  pdf.setCreator('NEXORA');
  pdf.setLanguage('de-DE');

  const right = A4.w - M.right;
  const width = right - M.left;
  let page = pdf.addPage([A4.w, A4.h]);
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

  await drawLetterhead(pdf, page, seller, logo, regular, bold);
  textRight(page, `JAHRESÜBERSICHT ${year}`, right, A4.h - 62, 16, bold);
  textRight(
    page,
    partial ? `Stand: ${formatDay(createdOn)}` : `Kalenderjahr ${year}`,
    right,
    A4.h - 84,
    9,
    regular,
    MUTED,
  );
  textRight(page, `Erstellt am ${formatDay(createdOn)}`, right, A4.h - 97, 9, regular, MUTED);

  let y = A4.h - 190;
  const newPageIfNeeded = (need: number) => {
    if (y - need > M.bottom + 30) return;
    drawFooter(page, seller, regular);
    page = pdf.addPage([A4.w, A4.h]);
    y = A4.h - 70;
  };
  const row = (label: string, value: string, strong = false, indent = 0) => {
    newPageIfNeeded(20);
    text(page, label, M.left + indent, y, 10, strong ? bold : regular);
    textRight(page, value, right, y, 10, strong ? bold : regular);
    y -= 8;
    page.drawLine({ start: { x: M.left, y }, end: { x: right, y }, thickness: 0.4, color: LINE });
    y -= 13;
  };
  const heading = (t: string) => {
    newPageIfNeeded(40);
    y -= 6;
    text(page, t, M.left, y, 12, bold);
    y -= 18;
  };

  const intro = `Übersicht der Einnahmen und Ausgaben aus selbstständiger Tätigkeit${partial ? ` vom 1. Januar bis heute` : ''} – erstellt mit NEXORA als Arbeitshilfe für die Steuerberatung. Einnahmen = abgeschlossene Aufträge (Monatsverträge anteilig), Ausgaben = allgemeine Ausgaben und Ausgaben bei Aufträgen.`;
  for (const line of wrap(intro, regular, 10, width)) {
    text(page, line, M.left, y, 10);
    y -= 14;
  }
  y -= 8;

  heading('Ergebnis');
  row('Einnahmen', formatMoney(totals.income));
  row('Ausgaben', formatMoney(totals.expenses));
  page.drawRectangle({ x: M.left - 6, y: y - 8, width: width + 12, height: 24, color: rgb(0.93, 0.99, 0.96) });
  text(page, 'Gewinn (vor Steuern)', M.left, y, 11, bold);
  textRight(page, formatMoney(totals.profit), right, y, 11, bold);
  y -= 34;

  if (categories.length) {
    heading('Ausgaben nach Kategorie');
    for (const c of categories) row(c.label, formatMoney(c.amount));
  }

  heading('Umsatzsteuer');
  if (vat) {
    row('Auf Rechnungen ausgewiesen', formatMoney(vat.collected));
    row('Vorsteuer aus Ausgaben (soweit erfasst)', formatMoney(vat.input));
    row('Differenz (Zahllast, geschätzt)', formatMoney(vat.payable), true);
  } else {
    for (const line of wrap(
      'Kleinunternehmer nach § 19 UStG – keine Umsatzsteuer auf den Rechnungen.',
      regular,
      10,
      width,
    )) {
      text(page, line, M.left, y, 10);
      y -= 14;
    }
    y -= 6;
  }

  heading(`Rechnungen ${year} (${invoices.length})`);
  if (!invoices.length) {
    text(page, 'Keine Rechnungen in diesem Jahr.', M.left, y, 10, regular, MUTED);
    y -= 20;
  } else {
    const cols = [M.left, M.left + 78, M.left + 140];
    newPageIfNeeded(20);
    text(page, 'Nummer', cols[0], y, 8.5, bold, MUTED);
    text(page, 'Datum', cols[1], y, 8.5, bold, MUTED);
    text(page, 'Kunde', cols[2], y, 8.5, bold, MUTED);
    textRight(page, 'Netto', right - 150, y, 8.5, bold, MUTED);
    textRight(page, 'USt', right - 85, y, 8.5, bold, MUTED);
    textRight(page, 'Brutto', right, y, 8.5, bold, MUTED);
    y -= 14;
    for (const inv of invoices) {
      newPageIfNeeded(18);
      text(page, inv.number, cols[0], y, 9);
      text(page, formatDay(inv.issued_on), cols[1], y, 9);
      const customer = wrap(inv.customer, regular, 9, right - 200 - cols[2])[0] ?? '';
      text(page, customer, cols[2], y, 9);
      textRight(page, formatMoney(inv.net), right - 150, y, 9);
      textRight(page, formatMoney(inv.vat), right - 85, y, 9);
      textRight(page, formatMoney(inv.gross), right, y, 9);
      y -= 6;
      page.drawLine({ start: { x: M.left, y }, end: { x: right, y }, thickness: 0.3, color: LINE });
      y -= 11;
    }
    y -= 6;
  }

  newPageIfNeeded(60);
  const note = `${receipts} ${receipts === 1 ? 'Beleg ist' : 'Belege sind'} in NEXORA gespeichert (im ZIP-Export als Dateien dabei). Alle Angaben ohne Gewähr – die Steuerberatung prüft und ergänzt (z. B. Abschreibungen, private Anteile, Zahlungszeitpunkte).`;
  for (const line of wrap(note, regular, 9, width)) {
    text(page, line, M.left, y, 9, regular, MUTED);
    y -= 13;
  }
  drawFooter(page, seller, regular);
  return pdf.save();
}
