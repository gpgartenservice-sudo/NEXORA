import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import { formatDay, formatMoney, sellerName, todayIso, type Seller } from '@/features/documents/document-logic';
import type { LogoImage } from '@/features/documents/logo-logic';
import { A4, drawLetterhead, INK, LINE, M, MUTED, safe, wrap } from '@/features/documents/pdf';

import { monthLabel, sumUp, type MonthSummary } from './finance-logic';

/**
 * Einkommensnachweis als PDF: Einnahmen, Ausgaben und Einkommen pro Monat –
 * z. B. für Versicherung, Vermieter oder Bank. Selbst erstellt, keine
 * Bescheinigung.
 */
export type IncomeProof = {
  seller: Seller;
  logo?: LogoImage | null;
  rows: MonthSummary[];
  /** Erstellungsdatum JJJJ-MM-TT */
  createdOn?: string;
};

export async function renderIncomeProofPdf({ seller, logo, rows, createdOn = todayIso() }: IncomeProof): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const name = sellerName(seller);
  const person = seller.owner_name || name;
  const from = rows[0]?.month;
  const to = rows[rows.length - 1]?.month;
  const range = from === to ? monthLabel(from) : `${monthLabel(from)} bis ${monthLabel(to)}`;
  pdf.setTitle(`Einkommensnachweis ${range}`);
  pdf.setAuthor(person);
  pdf.setCreator('Lunaxora');
  pdf.setLanguage('de-DE');

  const page = pdf.addPage([A4.w, A4.h]);
  const right = A4.w - M.right;
  const width = right - M.left;
  const text = (p: PDFPage, value: string, x: number, y: number, size = 10, font: PDFFont = regular, color = INK) =>
    p.drawText(safe(value), { x, y, size, font, color });
  const textRight = (p: PDFPage, value: string, xRight: number, y: number, size = 10, font: PDFFont = regular, color = INK) =>
    text(p, value, xRight - font.widthOfTextAtSize(safe(value), size), y, size, font, color);

  await drawLetterhead(pdf, page, seller, logo, regular, bold);
  textRight(page, 'EINKOMMENSNACHWEIS', right, A4.h - 62, 16, bold);
  textRight(page, `Zeitraum: ${range}`, right, A4.h - 84, 9, regular, MUTED);
  textRight(page, `Erstellt am ${formatDay(createdOn)}`, right, A4.h - 97, 9, regular, MUTED);

  // Einleitung
  let y = A4.h - 200;
  text(page, `Einnahmen und Ausgaben aus selbstständiger Tätigkeit`, M.left, y, 13, bold);
  y -= 20;
  const intro = `${person}${seller.company_name && seller.company_name !== person ? ` (${seller.company_name})` : ''} – Übersicht der monatlichen Einnahmen, Ausgaben und des daraus entstandenen Einkommens im Zeitraum ${range}.`;
  for (const line of wrap(intro, regular, 10, width)) {
    text(page, line, M.left, y, 10);
    y -= 14;
  }

  // Tabelle
  y -= 14;
  const col = { month: M.left + 8, income: right - 230, expenses: right - 120, profit: right - 8 };
  page.drawRectangle({ x: M.left, y: y - 6, width, height: 20, color: LINE, opacity: 0.45 });
  text(page, 'Monat', col.month, y, 9, bold, MUTED);
  textRight(page, 'Einnahmen', col.income, y, 9, bold, MUTED);
  textRight(page, 'Ausgaben', col.expenses, y, 9, bold, MUTED);
  textRight(page, 'Einkommen', col.profit, y, 9, bold, MUTED);
  y -= 22;
  for (const r of rows) {
    text(page, monthLabel(r.month), col.month, y, 10);
    textRight(page, formatMoney(r.income), col.income, y, 10);
    textRight(page, formatMoney(r.expenses), col.expenses, y, 10);
    textRight(page, formatMoney(r.profit), col.profit, y, 10, bold);
    page.drawLine({ start: { x: M.left, y: y - 7 }, end: { x: right, y: y - 7 }, thickness: 0.4, color: LINE });
    y -= 20;
  }
  const sum = sumUp(rows);
  const avg = rows.length ? Math.round((sum.profit / rows.length) * 100) / 100 : 0;
  y -= 4;
  text(page, 'Summe', col.month, y, 10, bold);
  textRight(page, formatMoney(sum.income), col.income, y, 10, bold);
  textRight(page, formatMoney(sum.expenses), col.expenses, y, 10, bold);
  textRight(page, formatMoney(sum.profit), col.profit, y, 10, bold);
  y -= 24;
  page.drawRectangle({ x: M.left, y: y - 8, width, height: 24, color: LINE, opacity: 0.35 });
  text(page, `Durchschnittliches Einkommen pro Monat (${rows.length} ${rows.length === 1 ? 'Monat' : 'Monate'})`, col.month, y, 10.5, bold);
  textRight(page, formatMoney(avg), col.profit, y, 11, bold);

  // Erläuterung
  y -= 40;
  const notes = [
    'Einnahmen: abgeschlossene Aufträge im Monat der Ausführung; laufende Verträge mit ihrem Monatsbetrag. Ausgaben: Betriebsausgaben laut eigener Aufzeichnung (einmalige und wiederkehrende). Einkommen = Einnahmen minus Ausgaben. Alle Beträge in Euro.',
    seller.small_business
      ? 'Kleinunternehmer gemäß § 19 UStG – die Beträge enthalten keine Umsatzsteuer.'
      : 'Einnahmen ohne Umsatzsteuer (Nettobeträge der Aufträge).',
  ];
  for (const n of notes) {
    for (const line of wrap(n, regular, 8.5, width)) {
      text(page, line, M.left, y, 8.5, regular, MUTED);
      y -= 11.5;
    }
    y -= 4;
  }

  // Bestätigung + Unterschrift
  y -= 24;
  text(page, 'Ich versichere, dass die Angaben vollständig und richtig sind.', M.left, y, 10);
  y -= 50;
  page.drawLine({ start: { x: M.left, y }, end: { x: M.left + 200, y }, thickness: 0.6, color: INK });
  page.drawLine({ start: { x: right - 200, y }, end: { x: right, y }, thickness: 0.6, color: INK });
  text(page, `Ort, Datum${seller.city ? ` (${seller.city}, ${formatDay(createdOn)})` : ''}`, M.left, y - 12, 8.5, regular, MUTED);
  text(page, `Unterschrift ${person}`, right - 200, y - 12, 8.5, regular, MUTED);

  // Fußzeile
  page.drawLine({ start: { x: M.left, y: M.bottom + 6 }, end: { x: right, y: M.bottom + 6 }, thickness: 0.4, color: LINE });
  text(
    page,
    'Selbst erstellte Übersicht (Lunaxora) – keine Bescheinigung des Finanzamts oder einer Steuerberatung.',
    M.left,
    M.bottom - 6,
    7.5,
    regular,
    MUTED,
  );
  return pdf.save();
}

/** z. B. "Einkommensnachweis_2026-08_bis_2026-10.pdf" */
export function incomeProofFileName(rows: MonthSummary[]): string {
  const from = rows[0]?.month ?? '';
  const to = rows[rows.length - 1]?.month ?? '';
  return `Einkommensnachweis_${from === to ? from : `${from}_bis_${to}`}.pdf`;
}
