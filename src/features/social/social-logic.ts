/**
 * Social Media – nach dem Vorbild des GP-Gartenservice-Systems:
 * Der Status eines Posts wird NICHT von Hand gesetzt, sondern aus den
 * erledigten Schritten berechnet (Idee -> In Arbeit -> Bereit ->
 * Veröffentlicht).
 *
 * Bewusst ohne Imports (tests/unit/social-logic.test.mjs).
 */

export type Platform = 'tiktok' | 'instagram' | 'youtube' | 'facebook' | 'linkedin' | 'x' | 'pinterest' | 'threads';
export type PostFormat = 'video' | 'carousel' | 'image' | 'story' | 'text';
export type PostStatus = 'idea' | 'in_progress' | 'ready' | 'published';
export type StepKey = 'step_concept' | 'step_produced' | 'step_edited' | 'step_caption';

export const PLATFORMS: { key: Platform; label: string; short: string }[] = [
  { key: 'tiktok', label: 'TikTok', short: 'TT' },
  { key: 'instagram', label: 'Instagram', short: 'IG' },
  { key: 'youtube', label: 'YouTube', short: 'YT' },
  { key: 'facebook', label: 'Facebook', short: 'FB' },
  { key: 'linkedin', label: 'LinkedIn', short: 'IN' },
  { key: 'x', label: 'X', short: 'X' },
  { key: 'pinterest', label: 'Pinterest', short: 'PI' },
  { key: 'threads', label: 'Threads', short: 'TH' },
];

export const platformLabel = (key: string) => PLATFORMS.find((p) => p.key === key)?.label ?? key;

export const FORMATS: { key: PostFormat; label: string }[] = [
  { key: 'video', label: 'Video' },
  { key: 'carousel', label: 'Karussell' },
  { key: 'image', label: 'Bild' },
  { key: 'story', label: 'Story' },
  { key: 'text', label: 'Text' },
];

/** Welche Schritte ein Format hat – und wie sie heißen. */
export function stepsFor(format: PostFormat): { key: StepKey; label: string }[] {
  switch (format) {
    case 'video':
      return [
        { key: 'step_concept', label: 'Skript' },
        { key: 'step_produced', label: 'Gedreht' },
        { key: 'step_edited', label: 'Geschnitten' },
        { key: 'step_caption', label: 'Caption' },
      ];
    case 'carousel':
      return [
        { key: 'step_concept', label: 'Texte & Aufbau' },
        { key: 'step_produced', label: 'Gestaltet' },
        { key: 'step_caption', label: 'Caption' },
      ];
    case 'image':
      return [
        { key: 'step_concept', label: 'Idee ausgearbeitet' },
        { key: 'step_produced', label: 'Foto / Grafik' },
        { key: 'step_edited', label: 'Bearbeitet' },
        { key: 'step_caption', label: 'Caption' },
      ];
    case 'story':
      return [
        { key: 'step_produced', label: 'Aufgenommen' },
        { key: 'step_edited', label: 'Bearbeitet' },
      ];
    case 'text':
      return [
        { key: 'step_concept', label: 'Entwurf' },
        { key: 'step_caption', label: 'Fertig formuliert' },
      ];
  }
}

export type PostFacts = {
  format: PostFormat;
  step_concept?: boolean | null;
  step_produced?: boolean | null;
  step_edited?: boolean | null;
  step_caption?: boolean | null;
  published_at?: string | null;
};

export const STATUS: { key: PostStatus; label: string }[] = [
  { key: 'idea', label: 'Idee' },
  { key: 'in_progress', label: 'In Arbeit' },
  { key: 'ready', label: 'Bereit' },
  { key: 'published', label: 'Veröffentlicht' },
];

export const statusLabel = (s: PostStatus) => STATUS.find((x) => x.key === s)!.label;

/** Status aus den Schritten – veröffentlicht schlägt alles. */
export function computePostStatus(p: PostFacts): PostStatus {
  if (p.published_at) return 'published';
  const steps = stepsFor(p.format);
  const done = steps.filter((s) => !!p[s.key]).length;
  if (done === steps.length) return 'ready';
  if (done > 0) return 'in_progress';
  return 'idea';
}

/** Erledigte Schritte "2/4" */
export function stepProgress(p: PostFacts): { done: number; total: number } {
  const steps = stepsFor(p.format);
  return { done: steps.filter((s) => !!p[s.key]).length, total: steps.length };
}

// ---------------------------------------------------------------------------
// Hashtags & Zeichen
// ---------------------------------------------------------------------------

/** "gründen, #Startup  #startup" -> ["#gründen", "#Startup"] (ohne Doppelte, Groß/klein egal) */
export function parseHashtags(text: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text ?? '').split(/[\s,;]+/)) {
    const word = raw.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!word) continue;
    const key = word.toLocaleLowerCase('de-DE');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(`#${word}`);
  }
  return out;
}

/** Hashtags zusammenführen (vorhandene bleiben vorne) */
export function mergeHashtags(current: string | null | undefined, add: string): string {
  return parseHashtags(`${current ?? ''} ${add}`).join(' ');
}

/** Text zum Einfügen in TikTok, Instagram & Co.: Caption + Hashtags */
export function postText(caption: string | null | undefined, hashtags: string | null | undefined): string {
  const tags = parseHashtags(hashtags).join(' ');
  return [caption?.trim(), tags].filter(Boolean).join('\n\n');
}

/**
 * Richtwerte für Caption-Länge und Hashtags (Stand 2026, können sich
 * ändern). Gilt der strengste Wert der gewählten Plattformen.
 */
export const LIMITS: Partial<Record<Platform, { chars: number; hashtags?: number }>> = {
  instagram: { chars: 2200, hashtags: 30 },
  tiktok: { chars: 4000 },
  linkedin: { chars: 3000 },
  x: { chars: 280 },
  threads: { chars: 500 },
  youtube: { chars: 5000 },
  pinterest: { chars: 500 },
};

export type LimitCheck = {
  chars: number;
  maxChars: number | null;
  charsPlatform: string | null;
  hashtags: number;
  maxHashtags: number | null;
  tooLong: boolean;
  tooManyTags: boolean;
};

export function checkLimits(
  platforms: Platform[],
  caption: string | null | undefined,
  hashtags: string | null | undefined,
): LimitCheck {
  const text = postText(caption, hashtags);
  const tags = parseHashtags(hashtags).length;
  let maxChars: number | null = null;
  let charsPlatform: string | null = null;
  let maxHashtags: number | null = null;
  for (const p of platforms) {
    const l = LIMITS[p];
    if (!l) continue;
    if (maxChars === null || l.chars < maxChars) {
      maxChars = l.chars;
      charsPlatform = platformLabel(p);
    }
    if (l.hashtags !== undefined && (maxHashtags === null || l.hashtags < maxHashtags)) maxHashtags = l.hashtags;
  }
  const chars = [...text].length;
  return {
    chars,
    maxChars,
    charsPlatform,
    hashtags: tags,
    maxHashtags,
    tooLong: maxChars !== null && chars > maxChars,
    tooManyTags: maxHashtags !== null && tags > maxHashtags,
  };
}

// ---------------------------------------------------------------------------
// Wochenplan
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** Datum als "JJJJ-MM-TT" (lokale Zeit) */
export function dayKey(value: Date | string): string {
  const d = typeof value === 'string' ? new Date(value) : value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Montag der Woche (lokale Zeit) */
export function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (d.getDay() + 6) % 7; // Mo = 0
  d.setDate(d.getDate() - weekday);
  return d;
}

/** Die sieben Tage einer Woche ab Montag */
export function weekDays(monday: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i));
}

/** Kalenderwoche nach ISO 8601 */
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ---------------------------------------------------------------------------
// Zahlen
// ---------------------------------------------------------------------------

export type PostMetrics = {
  views?: number | null;
  likes?: number | null;
  comments?: number | null;
  shares?: number | null;
  saves?: number | null;
  followers?: number | null;
};

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Interaktionen = Likes + Kommentare + Geteilt + Gespeichert */
export const interactions = (p: PostMetrics) => n(p.likes) + n(p.comments) + n(p.shares) + n(p.saves);

/** Interaktionsrate in Prozent (null ohne Aufrufe) */
export function engagementRate(p: PostMetrics): number | null {
  const views = n(p.views);
  if (views <= 0) return null;
  return Math.round((interactions(p) / views) * 1000) / 10;
}

export type MetricsSummary = {
  posts: number;
  withNumbers: number;
  views: number;
  interactions: number;
  followers: number;
  avgViews: number;
  rate: number | null;
};

/** Summe über veröffentlichte Posts */
export function summarizeMetrics(posts: PostMetrics[]): MetricsSummary {
  const withNumbers = posts.filter((p) => n(p.views) > 0 || interactions(p) > 0);
  const views = withNumbers.reduce((s, p) => s + n(p.views), 0);
  const inter = withNumbers.reduce((s, p) => s + interactions(p), 0);
  return {
    posts: posts.length,
    withNumbers: withNumbers.length,
    views,
    interactions: inter,
    followers: posts.reduce((s, p) => s + n(p.followers), 0),
    avgViews: withNumbers.length ? Math.round(views / withNumbers.length) : 0,
    rate: views > 0 ? Math.round((inter / views) * 1000) / 10 : null,
  };
}

/** 12.345 -> "12.345", 1.234.567 -> "1,2 Mio." */
export function compactNumber(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio.`;
  if (v >= 100_000) return `${Math.round(v / 1000).toLocaleString('de-DE')} Tsd.`;
  return v.toLocaleString('de-DE');
}
