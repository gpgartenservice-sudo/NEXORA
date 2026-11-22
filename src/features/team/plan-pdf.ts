import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

import { sellerName, type Seller } from '@/features/documents/document-logic';
import type { LogoImage } from '@/features/documents/logo-logic';
import { ACCENT, A4, drawLetterhead, INK, LINE, M, MUTED, safe, wrap } from '@/features/documents/pdf';

import { crewLabel, dayLabel, isoWeek, rangeLabel, shiftLabel, type PlanSnapshot } from './staff-logic';

/**
 * Fertiger Wochenplan als PDF: Briefkopf der Firma, dann Tag für Tag die Einsätze mit Zeit,
 * Ort, Leuten (Teamleiter markiert) und Notiz. Abwesende stehen ohne Grund drin.
 */
export type WorkPlanPdf = {
  plan: PlanSnapshot;
  seller: Seller;
  logo?: LogoImage | null;
  version: number;
  /** ISO-Zeitpunkt des Fertigstellens */
  publishedAt: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
export function stampLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

export function workPlanFileName(plan: PlanSnapshot): string {
  return `Arbeitsplan_KW${isoWeek(plan.week)}_${plan.week.slice(0, 4)}.pdf`;
}

export async function renderWorkPlanPdf({ plan, seller, logo, version, publishedAt }: WorkPlanPdf): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdf.embedFont(StandardFonts.HelveticaOblique);
  const sunday = plan.days.at(-1)?.day ?? plan.week;
  const week = `KW ${isoWeek(plan.week)} · ${rangeLabel(plan.week, sunday)}`;
  pdf.setTitle(`Arbeitsplan ${week}`);
  pdf.setAuthor(sellerName(seller) || 'Lunaxora');
  pdf.setCreator('Lunaxora');
  pdf.setLanguage('de-DE');

  const right = A4.w - M.right;
  const width = right - M.left;
  const nameOf = (id: string) => plan.people[id] ?? 'Ehemaliges Mitglied';
  const text = (p: PDFPage, value: string, x: number, y: number, size = 10, font: PDFFont = regular, color = INK) =>
    p.drawText(safe(value), { x, y, size, font, color });
  const textRight = (p: PDFPage, value: string, xRight: number, y: number, size = 10, font: PDFFont = regular, color = INK) =>
    text(p, value, xRight - font.widthOfTextAtSize(safe(value), size), y, size, font, color);

  const pages: PDFPage[] = [];
  let page = pdf.addPage([A4.w, A4.h]);
  pages.push(page);
  await drawLetterhead(pdf, page, seller, logo, regular, bold);
  textRight(page, 'ARBEITSPLAN', right, A4.h - 62, 16, bold);
  textRight(page, week, right, A4.h - 84, 10, bold);
  textRight(page, `Stand: ${stampLabel(publishedAt)}${version > 1 ? ` · Version ${version}` : ''}`, right, A4.h - 98, 8.5, regular, MUTED);
  let y = A4.h - 190;

  // Neue Seite, wenn der nächste Block nicht mehr passt
  const need = (h: number) => {
    if (y - h >= M.bottom + 20) return;
    page = pdf.addPage([A4.w, A4.h]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: A4.h - 6, width: A4.w, height: 6, color: ACCENT });
    text(page, `Arbeitsplan ${week}`, M.left, A4.h - 40, 9, bold, MUTED);
    y = A4.h - 70;
  };

  const col = { time: M.left + 8, body: M.left + 108 };
  const bodyWidth = right - col.body - 4;

  const layout = (j: PlanSnapshot['days'][number]['jobs'][number]) => {
    const crew = wrap(crewLabel(j, nameOf), regular, 9.5, bodyWidth);
    const note = j.note ? wrap(j.note, oblique, 9, bodyWidth) : [];
    const address = j.address ? wrap(j.address, regular, 9, bodyWidth) : [];
    const showCrew = !!j.site || j.members.length > 1;
    const height = 14 + address.length * 12 + (showCrew ? crew.length * 13 : 0) + note.length * 12 + 10;
    return { crew, note, address, showCrew, height };
  };

  for (const d of plan.days) {
    // Tageszeile nie allein unten auf der Seite: mit dem ersten Einsatz zusammen
    need(26 + (d.jobs[0] ? layout(d.jobs[0]).height : 18));
    // Tageszeile
    page.drawRectangle({ x: M.left, y: y - 7, width, height: 22, color: LINE, opacity: 0.45 });
    text(page, dayLabel(d.day, true), col.time, y, 10.5, bold);
    if (d.holiday) textRight(page, `Feiertag: ${d.holiday}`, right - 8, y, 9, bold, MUTED);
    y -= 26;

    if (!d.jobs.length) {
      text(page, d.holiday ? 'Feiertag – keine Einsätze' : 'Keine Einsätze', col.body, y, 9.5, oblique, MUTED);
      y -= 18;
    }
    for (const j of d.jobs) {
      const title = j.site ?? (j.members.length === 1 ? nameOf(j.members[0]) : 'Einsatz');
      const { crew, note, address, showCrew, height } = layout(j);
      need(height);
      text(page, shiftLabel(j), col.time, y, 10, bold);
      text(page, title, col.body, y, 10.5, bold);
      y -= 14;
      for (const l of address) {
        text(page, l, col.body, y, 9, regular, MUTED);
        y -= 12;
      }
      if (showCrew)
        for (const l of crew) {
          text(page, l, col.body, y, 9.5);
          y -= 13;
        }
      for (const l of note) {
        text(page, l, col.body, y, 9, oblique, MUTED);
        y -= 12;
      }
      page.drawLine({ start: { x: col.body, y: y + 2 }, end: { x: right, y: y + 2 }, thickness: 0.3, color: LINE });
      y -= 10;
    }
    if (d.away.length) {
      const lines = wrap(`Abwesend: ${d.away.map(nameOf).join(', ')}`, regular, 9, bodyWidth);
      need(lines.length * 12 + 6);
      for (const l of lines) {
        text(page, l, col.body, y, 9, regular, MUTED);
        y -= 12;
      }
    }
    y -= 10;
  }

  // Fußzeile auf jeder Seite
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M.left, y: M.bottom + 6 }, end: { x: right, y: M.bottom + 6 }, thickness: 0.4, color: LINE });
    text(p, `Erstellt mit Lunaxora · ${sellerName(seller) || ''}`.replace(/ · $/, ''), M.left, M.bottom - 6, 7.5, regular, MUTED);
    textRight(p, `Seite ${i + 1} von ${pages.length}`, right, M.bottom - 6, 7.5, regular, MUTED);
  });

  return pdf.save();
}
