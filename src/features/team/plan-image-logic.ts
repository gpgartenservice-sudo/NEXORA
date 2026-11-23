import { crewLabel, dayLabel, isoWeek, rangeLabel, shiftLabel, stampLabel, type PlanSnapshot } from './staff-logic';

/**
 * Fertiger Wochenplan als Bild (Team → Arbeitsplan → „Plan ansehen“): dieselbe Aufteilung wie
 * das PDF (plan-pdf.ts), nur als eine durchgehende Seite. Reine Logik mit Unit-Tests – rechnet
 * aus, was wo steht; gezeichnet wird in plan-image.tsx (SVG, daraus auch das PNG).
 * Maße in pt wie im PDF (Breite A4), y von oben.
 */

export type PlanImageInput = {
  plan: PlanSnapshot;
  /** Firmenname und Absenderzeilen (wie im Briefkopf der PDFs) */
  company: { name: string; lines: string[] };
  version: number;
  /** ISO-Zeitpunkt des Fertigstellens */
  publishedAt: string;
  /** Akzentfarbe (Balken oben) */
  accent: string;
  /** Größe des Firmenlogos (das Bild selbst setzt plan-image.tsx ein) */
  logo?: { width: number; height: number } | null;
};

type Text = { t: 'text'; x: number; y: number; text: string; size: number; color: string; bold?: boolean; italic?: boolean; end?: boolean };
export type PlanDraw =
  | { t: 'rect'; x: number; y: number; w: number; h: number; fill: string; opacity?: number }
  | { t: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | Text
  | { t: 'logo'; x: number; y: number; w: number; h: number };

export type PlanDrawing = { width: number; height: number; items: PlanDraw[] };

export const PLAN_PAPER = '#FFFFFF';
const INK = '#141417';
const MUTED = '#6B6B73';
const LINE = '#D9D9DE';
const W = 595;
const M = { left: 52, right: 48, bottom: 36 };
const LOGO = { top: 28, maxW: 180, maxH: 40 };

// Helvetica-Breiten (je 1 pt Schriftgröße) – genau genug zum Umbrechen
const NARROW = new Set([...'iljI.,:;!|\'`()[]{} ']);
const SMALL = new Set([...'frt-/"*']);
const WIDE = new Set([...'mwMW@%']);
function charWidth(c: string): number {
  if (NARROW.has(c)) return c === ' ' || c === '(' || c === ')' ? 0.29 : 0.24;
  if (SMALL.has(c)) return 0.34;
  if (WIDE.has(c)) return 0.86;
  if (/[0-9]/.test(c)) return 0.556;
  if (c !== c.toLowerCase()) return 0.68;
  return 0.54;
}

/** Ungefähre Breite eines Textes in pt */
export function textWidth(text: string, size: number, bold = false): number {
  let w = 0;
  for (const c of text) w += charWidth(c);
  return w * size * (bold ? 1.06 : 1);
}

/** Text auf Zeilen verteilen (Absätze bleiben, zu lange Wörter werden geteilt) */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, bold) <= maxWidth) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      // Wort allein zu lang: Stück für Stück
      let rest = word;
      while (textWidth(rest, size, bold) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && textWidth(rest.slice(0, cut), size, bold) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** Wo was steht – eine Seite, so lang wie der Plan */
export function layoutPlanImage({ plan, company, version, publishedAt, accent, logo }: PlanImageInput): PlanDrawing {
  const items: PlanDraw[] = [];
  const right = W - M.right;
  const width = right - M.left;
  const nameOf = (id: string) => plan.people[id] ?? 'Ehemaliges Mitglied';
  const text = (value: string, x: number, y: number, size: number, extra: Partial<Text> = {}) =>
    items.push({ t: 'text', x, y, text: value, size, color: INK, ...extra });

  // Briefkopf: Balken, Logo oder Firmenname, Absender; rechts Titel und Woche
  items.push({ t: 'rect', x: 0, y: 0, w: W, h: 6, fill: accent });
  let headBottom: number;
  if (logo && logo.width > 0 && logo.height > 0) {
    const scale = Math.min(LOGO.maxW / logo.width, LOGO.maxH / logo.height);
    const h = logo.height * scale;
    items.push({ t: 'logo', x: M.left, y: LOGO.top, w: logo.width * scale, h });
    const nameY = LOGO.top + h + 15;
    if (company.name) text(company.name, M.left, nameY, 12, { bold: true });
    company.lines.forEach((l, i) => text(l, M.left, nameY + 13 + i * 11, 9, { color: MUTED }));
    headBottom = nameY + 13 + company.lines.length * 11;
  } else {
    if (company.name) text(company.name, M.left, 62, 17, { bold: true });
    company.lines.forEach((l, i) => text(l, M.left, 80 + i * 12, 9, { color: MUTED }));
    headBottom = 80 + company.lines.length * 12;
  }
  const sunday = plan.days.at(-1)?.day ?? plan.week;
  text('ARBEITSPLAN', right, 62, 16, { bold: true, end: true });
  text(`KW ${isoWeek(plan.week)} · ${rangeLabel(plan.week, sunday)}`, right, 84, 10, { bold: true, end: true });
  text(`Stand: ${stampLabel(publishedAt)}${version > 1 ? ` · Version ${version}` : ''}`, right, 98, 8.5, { color: MUTED, end: true });

  let y = Math.max(150, headBottom + 40);
  const col = { time: M.left + 8, body: M.left + 108 };
  const bodyWidth = right - col.body - 4;

  for (const d of plan.days) {
    // Tageszeile
    items.push({ t: 'rect', x: M.left, y: y - 15, w: width, h: 22, fill: LINE, opacity: 0.45 });
    text(dayLabel(d.day, true), col.time, y, 10.5, { bold: true });
    if (d.holiday) text(`Feiertag: ${d.holiday}`, right - 8, y, 9, { bold: true, color: MUTED, end: true });
    y += 26;

    if (!d.jobs.length) {
      text(d.holiday ? 'Feiertag – keine Einsätze' : 'Keine Einsätze', col.body, y, 9.5, { italic: true, color: MUTED });
      y += 18;
    }
    for (const j of d.jobs) {
      const title = j.site ?? (j.members.length === 1 ? nameOf(j.members[0]) : 'Einsatz');
      const showCrew = !!j.site || j.members.length > 1;
      text(shiftLabel(j), col.time, y, 10, { bold: true });
      wrapText(title, 10.5, bodyWidth, true).forEach((l, i) => {
        if (i) y += 13;
        text(l, col.body, y, 10.5, { bold: true });
      });
      y += 14;
      const muted = [
        ...(j.address ? wrapText(j.address, 9, bodyWidth) : []),
        ...(j.order_title && j.order_title !== j.site ? wrapText(`Auftrag: ${j.order_title}`, 9, bodyWidth) : []),
      ];
      for (const l of muted) {
        text(l, col.body, y, 9, { color: MUTED });
        y += 12;
      }
      if (showCrew)
        for (const l of wrapText(crewLabel(j, nameOf), 9.5, bodyWidth)) {
          text(l, col.body, y, 9.5);
          y += 13;
        }
      if (j.note)
        for (const l of wrapText(j.note, 9, bodyWidth)) {
          text(l, col.body, y, 9, { italic: true, color: MUTED });
          y += 12;
        }
      items.push({ t: 'line', x1: col.body, y1: y - 2, x2: right, y2: y - 2, color: LINE, width: 0.5 });
      y += 10;
    }
    if (d.away.length) {
      for (const l of wrapText(`Abwesend: ${d.away.map(nameOf).join(', ')}`, 9, bodyWidth)) {
        text(l, col.body, y, 9, { color: MUTED });
        y += 12;
      }
    }
    y += 10;
  }

  // Fußzeile
  y += 6;
  items.push({ t: 'line', x1: M.left, y1: y, x2: right, y2: y, color: LINE, width: 0.6 });
  text(company.name ? `Erstellt mit Lunaxora · ${company.name}` : 'Erstellt mit Lunaxora', M.left, y + 14, 7.5, { color: MUTED });
  return { width: W, height: Math.ceil(y + 14 + M.bottom - 12), items };
}

/** Dateiname, z. B. „Arbeitsplan_KW48_2026.png“ */
export function workPlanImageName(plan: PlanSnapshot): string {
  return `Arbeitsplan_KW${isoWeek(plan.week)}_${plan.week.slice(0, 4)}.png`;
}
