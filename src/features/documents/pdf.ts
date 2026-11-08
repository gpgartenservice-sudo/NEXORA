import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import { formatDay, formatMoney, sellerName, type DocumentData, type DocumentKind, type Seller } from './document-logic';
import { base64ToBytes, fitInto, type LogoImage } from './logo-logic';
import { BRANDING_TEXT, pdfBranding } from './pdf-branding';

/**
 * Erzeugt das PDF für ein Angebot oder eine Rechnung (DIN-A4, Anschrift
 * passend für Fensterumschläge nach DIN 5008).
 *
 * Läuft komplett auf dem Gerät – ohne Server.
 */

export type IssuedDocument = {
  kind: DocumentKind;
  number: string;
  issued_on: string;
  due_on: string | null;
  data: DocumentData;
};

export const A4 = { w: 595.28, h: 841.89 };
export const M = { left: 62, right: 57, bottom: 70 }; // Ränder in pt
export const INK = rgb(0.08, 0.08, 0.09);
export const MUTED = rgb(0.42, 0.42, 0.45);
export const LINE = rgb(0.85, 0.85, 0.87);
export const ACCENT = rgb(0.184, 0.89, 0.604); // Wachstums-Grün (#2FE39A)

// Die Standardschrift kann nur Zeichen aus "WinAnsi" (Latin-1 + € „ “ – …).
// Alles andere (z. B. Emojis) wird weggelassen, damit das PDF nie scheitert.
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
export function safe(text: string): string {
  let out = '';
  for (const ch of text.replace(/\r/g, '').replace(/\t/g, ' ')) {
    const c = ch.codePointAt(0)!;
    if (ch === '\n' || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else if (c === 0x202f || c === 0x2009) out += ' '; // schmale Leerzeichen
    else if (c === 0x2212) out += '-'; // Minuszeichen
  }
  return out;
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        // sehr lange Wörter hart umbrechen
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > maxWidth && rest.length > 1) {
          let cut = rest.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Platz fürs Logo oben links (in pt) */
const LOGO_BOX = { top: 28, maxW: 180, maxH: 40 };

export async function renderDocumentPdf(doc: IssuedDocument, logo?: LogoImage | null): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const { data } = doc;
  const s = data.seller;
  const isInvoice = doc.kind === 'invoice';
  const title = isInvoice ? 'RECHNUNG' : 'ANGEBOT';
  const name = sellerName(s);
  pdf.setTitle(`${isInvoice ? 'Rechnung' : 'Angebot'} ${doc.number}`);
  pdf.setAuthor(name);
  pdf.setCreator('Lunaxora');
  pdf.setLanguage('de-DE');

  let page = pdf.addPage([A4.w, A4.h]);
  const right = A4.w - M.right;
  const contentWidth = right - M.left;

  const text = (p: PDFPage, value: string, x: number, y: number, size = 10, font = regular, color = INK) =>
    p.drawText(safe(value), { x, y, size, font, color });
  const textRight = (p: PDFPage, value: string, xRight: number, y: number, size = 10, font = regular, color = INK) =>
    text(p, value, xRight - font.widthOfTextAtSize(safe(value), size), y, size, font, color);

  // --- Kopf: Logo + Absender links, Titel rechts
  await drawLetterhead(pdf, page, s, logo, regular, bold);

  textRight(page, title, right, A4.h - 62, 18, bold);
  const meta: [string, string][] = [
    [isInvoice ? 'Rechnungsnr.' : 'Angebotsnr.', doc.number],
    ['Datum', formatDay(doc.issued_on)],
  ];
  if (isInvoice && data.service_period) meta.push(['Leistungszeitraum', `${formatDay(data.service_period.from)} – ${formatDay(data.service_period.to)}`]);
  else if (isInvoice && data.service_date) meta.push(['Leistungsdatum', formatDay(data.service_date)]);
  if (doc.due_on) meta.push([isInvoice ? 'Zahlbar bis' : 'Gültig bis', formatDay(doc.due_on)]);
  meta.forEach(([label, value], i) => {
    const y = A4.h - 84 - i * 13;
    textRight(page, value, right, y, 9, bold);
    textRight(page, label, right - 110, y, 9, regular, MUTED);
  });

  // --- Anschriftfeld (DIN 5008, Form B: 45 mm von oben, 20 mm von links)
  const addressTop = A4.h - 127.6;
  const returnLine = [name, s.street, [s.zip, s.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  text(page, returnLine, M.left, addressTop - 10, 7, regular, MUTED);
  page.drawLine({ start: { x: M.left, y: addressTop - 13 }, end: { x: M.left + 240, y: addressTop - 13 }, thickness: 0.4, color: LINE });
  const b = data.buyer;
  const buyerLines = [b.company, b.name, ...(b.address ?? '').split(/\n|,\s*/)].filter((l) => l && l.trim()) as string[];
  buyerLines.slice(0, 6).forEach((l, i) => text(page, l.trim(), M.left, addressTop - 30 - i * 13, 10.5));

  // --- Betreff und Einleitung
  let y = A4.h - 290;
  text(page, `${isInvoice ? 'Rechnung' : 'Angebot'} ${doc.number}`, M.left, y, 13, bold);
  y -= 24;
  const greeting = `Guten Tag ${b.name.trim()},`;
  const intro = isInvoice
    ? 'vielen Dank für Ihren Auftrag. Für die erbrachten Leistungen berechne ich Ihnen:'
    : 'vielen Dank für Ihre Anfrage. Gerne biete ich Ihnen folgende Leistungen an:';
  for (const l of [greeting, ...wrap(intro, regular, 10, contentWidth)]) {
    text(page, l, M.left, y, 10);
    y -= 14;
  }
  y -= 10;

  // --- Positionen
  const col = { pos: M.left, desc: M.left + 28, qty: right - 172, price: right - 88, total: right };
  const header = () => {
    page.drawRectangle({ x: M.left - 6, y: y - 6, width: contentWidth + 12, height: 20, color: rgb(0.96, 0.96, 0.97) });
    text(page, 'Pos.', col.pos, y, 8.5, bold, MUTED);
    text(page, 'Leistung', col.desc, y, 8.5, bold, MUTED);
    textRight(page, 'Menge', col.qty, y, 8.5, bold, MUTED);
    textRight(page, 'Einzelpreis', col.price, y, 8.5, bold, MUTED);
    textRight(page, 'Gesamt', col.total, y, 8.5, bold, MUTED);
    y -= 24;
  };
  const newPageIfNeeded = (needed: number) => {
    if (y - needed < M.bottom + 70) {
      drawFooter(page, s, regular);
      page = pdf.addPage([A4.w, A4.h]);
      y = A4.h - 70;
      header();
    }
  };
  header();
  const descWidth = col.qty - 62 - col.desc;
  data.items.forEach((item, i) => {
    const titleLines = wrap(item.description, bold, 10, descWidth);
    const detailLines = item.details ? wrap(item.details, regular, 9, descWidth) : [];
    newPageIfNeeded(14 * titleLines.length + 12 * detailLines.length + 10);
    text(page, `${i + 1}`, col.pos, y, 10);
    textRight(page, `${item.quantity.toLocaleString('de-DE')} ${item.unit}`, col.qty, y, 10);
    textRight(page, formatMoney(item.unit_price), col.price, y, 10);
    textRight(page, formatMoney(item.quantity * item.unit_price), col.total, y, 10, bold);
    titleLines.forEach((l) => {
      text(page, l, col.desc, y, 10, bold);
      y -= 14;
    });
    detailLines.forEach((l) => {
      text(page, l, col.desc, y, 9, regular, MUTED);
      y -= 12;
    });
    y -= 8;
    page.drawLine({ start: { x: M.left - 6, y: y + 4 }, end: { x: right + 6, y: y + 4 }, thickness: 0.4, color: LINE });
    y -= 14;
  });

  // --- Summen
  const t = data.totals;
  const sums: [string, string, boolean][] = [];
  if (t.discount_amount > 0) {
    sums.push(['Zwischensumme', formatMoney(t.subtotal), false]);
    sums.push([`Rabatt (${t.discount_percent.toLocaleString('de-DE')} %)`, `– ${formatMoney(t.discount_amount)}`, false]);
  }
  if (!data.small_business) {
    sums.push(['Nettobetrag', formatMoney(t.net), false]);
    sums.push([`Umsatzsteuer ${t.vat_rate.toLocaleString('de-DE')} %`, formatMoney(t.vat_amount), false]);
  }
  newPageIfNeeded(18 * (sums.length + 1) + 20);
  for (const [label, value] of sums) {
    textRight(page, label, col.price, y, 10, regular, MUTED);
    textRight(page, value, col.total, y, 10);
    y -= 16;
  }
  y -= 2;
  page.drawRectangle({ x: col.price - 150, y: y - 8, width: right - col.price + 156, height: 24, color: rgb(0.93, 0.99, 0.96) });
  textRight(page, isInvoice ? 'Rechnungsbetrag' : 'Gesamtbetrag', col.price, y, 11, bold);
  textRight(page, formatMoney(t.gross), col.total, y, 11, bold);
  y -= 34;

  // --- Hinweise
  const notes: string[] = [];
  if (data.monthly) notes.push(isInvoice ? 'Die Leistung wird monatlich abgerechnet.' : 'Die Preise verstehen sich pro Monat.');
  if (data.small_business) notes.push('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).');
  if (isInvoice) {
    notes.push(
      `Bitte überweisen Sie den Rechnungsbetrag${doc.due_on ? ` bis zum ${formatDay(doc.due_on)}` : ''} unter Angabe der Rechnungsnummer ${doc.number} auf das unten genannte Konto.`,
    );
  } else if (doc.due_on) {
    notes.push(`Dieses Angebot ist gültig bis zum ${formatDay(doc.due_on)}. Ich freue mich auf Ihre Zusage!`);
  }
  for (const n of notes) {
    const lines = wrap(n, regular, 9.5, contentWidth);
    newPageIfNeeded(lines.length * 13 + 6);
    lines.forEach((l) => {
      text(page, l, M.left, y, 9.5);
      y -= 13;
    });
    y -= 4;
  }
  y -= 10;
  newPageIfNeeded(40);
  text(page, 'Mit freundlichen Grüßen', M.left, y, 10);
  text(page, s.owner_name || name, M.left, y - 16, 10, bold);

  drawFooter(page, s, regular);

  return pdf.save();
}

/**
 * Briefkopf: grüner Streifen, Logo (falls vorhanden) und Absender oben links.
 * Gleich auf Angeboten, Rechnungen und dem Einkommensnachweis.
 */
export async function drawLetterhead(
  pdf: PDFDocument,
  page: PDFPage,
  s: Seller,
  logo: LogoImage | null | undefined,
  regular: PDFFont,
  bold: PDFFont,
) {
  const text = (value: string, x: number, y: number, size: number, font: PDFFont, color = INK) =>
    page.drawText(safe(value), { x, y, size, font, color });
  const name = sellerName(s);
  page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: ACCENT });
  const senderLines = [s.owner_name && s.company_name ? s.owner_name : null, s.street, [s.zip, s.city].filter(Boolean).join(' ')]
    .filter(Boolean) as string[];
  const logoHeight = logo ? await drawLogo(pdf, page, logo, M.left, A4.h - LOGO_BOX.top) : 0;
  if (logoHeight) {
    // Mit Logo: Name kleiner darunter
    const nameY = A4.h - LOGO_BOX.top - logoHeight - 15;
    text(name, M.left, nameY, 12, bold);
    senderLines.forEach((l, i) => text(l, M.left, nameY - 13 - i * 11, 9, regular, MUTED));
  } else {
    text(name, M.left, A4.h - 62, 17, bold);
    senderLines.forEach((l, i) => text(l, M.left, A4.h - 80 - i * 12, 9, regular, MUTED));
  }
}

/** Fußzeile: Absender, Kontakt, Steuernummer und Bankverbindung (gleich auf allen Schreiben) */
export function drawFooter(p: PDFPage, s: Seller, regular: PDFFont) {
  const right = A4.w - M.right;
  const contentWidth = right - M.left;
  const top = M.bottom - 4;
  p.drawLine({ start: { x: M.left, y: top + 10 }, end: { x: right, y: top + 10 }, thickness: 0.4, color: LINE });
  const colW = contentWidth / 3;
  const blocks: string[][] = [
    [sellerName(s), s.street ?? '', [s.zip, s.city].filter(Boolean).join(' ')],
    [s.phone ? `Tel. ${s.phone}` : '', s.email ?? '', s.website ?? ''],
    [
      s.vat_id ? `USt-IdNr. ${s.vat_id}` : s.tax_number ? `Steuernr. ${s.tax_number}` : '',
      s.bank_name ?? '',
      s.iban ? `IBAN ${s.iban}` : '',
      s.bic ? `BIC ${s.bic}` : '',
    ],
  ];
  blocks.forEach((lines, i) => {
    lines
      .filter(Boolean)
      .forEach((l, j) =>
        p.drawText(safe(l), { x: M.left + i * colW, y: top - j * 10, size: 7.5, font: regular, color: MUTED }),
      );
  });
  // Starter-Abo: kleiner Hinweis ganz unten
  if (pdfBranding()) {
    const t = safe(BRANDING_TEXT);
    p.drawText(t, { x: (A4.w - regular.widthOfTextAtSize(t, 6.5)) / 2, y: 14, size: 6.5, font: regular, color: MUTED });
  }
}

/** Logo oben links einzeichnen; gibt die Höhe zurück (0 = ging nicht, dann ohne Logo). */
async function drawLogo(pdf: PDFDocument, page: PDFPage, logo: LogoImage, x: number, top: number): Promise<number> {
  try {
    const bytes = base64ToBytes(logo.data);
    const image = logo.mime === 'image/png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const size = fitInto(image.width, image.height, LOGO_BOX.maxW, LOGO_BOX.maxH);
    page.drawImage(image, { x, y: top - size.height, width: size.width, height: size.height });
    return size.height;
  } catch (e) {
    console.warn('[PDF] Logo konnte nicht eingefügt werden', e);
    return 0;
  }
}

/** Dateiname, z. B. "Rechnung_RE-2026-0001_Peter_Mueller.pdf" */
export function pdfFileName(doc: { kind: DocumentKind; number: string; data: DocumentData }): string {
  const who = (doc.data.buyer.company || doc.data.buyer.name || '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `${doc.kind === 'invoice' ? 'Rechnung' : 'Angebot'}_${doc.number}${who ? `_${who}` : ''}.pdf`;
}
