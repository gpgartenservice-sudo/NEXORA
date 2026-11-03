import { toDate } from '../../lib/dates';

export type DateFieldProps = {
  label: string;
  /** ISO-Zeitpunkt (mit Uhrzeit) bzw. "JJJJ-MM-TT" (nur Datum) – oder null */
  value: string | null;
  onChange: (value: string | null) => void;
  withTime?: boolean;
  hint?: string;
};

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO-Zeitpunkt -> "JJJJ-MM-TTTHH:MM" in lokaler Zeit (für <input type="datetime-local">). */
export function toLocalInput(value: string | null, withTime?: boolean): string {
  if (!value) return '';
  if (!withTime) return value.slice(0, 10);
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Wert aus dem Eingabefeld -> ISO-Zeitpunkt (UTC) bzw. "JJJJ-MM-TT". */
export function fromLocalInput(input: string, withTime?: boolean): string | null {
  if (!input) return null;
  if (!withTime) return input.slice(0, 10);
  const d = new Date(input); // wird als lokale Zeit gelesen
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO -> "TT.MM.JJJJ" bzw. "TT.MM.JJJJ HH:MM" */
export function toGermanInput(value: string | null, withTime?: boolean): string {
  const local = toLocalInput(value, withTime);
  if (!local) return '';
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}${withTime && time ? ` ${time}` : ''}`;
}

/** "TT.MM.JJJJ[ HH:MM]" -> ISO bzw. "JJJJ-MM-TT"; leer = null */
export function fromGermanInput(text: string, withTime?: boolean): string | null | 'invalid' {
  const t = text.trim();
  if (!t) return null;
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(t);
  if (!m) return 'invalid';
  const [, d, mo, y, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0));
  if (date.getDate() !== Number(d) || date.getMonth() !== Number(mo) - 1) return 'invalid';
  if (!withTime) return `${y}-${pad(Number(mo))}-${pad(Number(d))}`;
  return date.toISOString();
}

/** Anzeige: "Mo., 3. Nov. 2026, 14:30" bzw. "3. Nov. 2026" */
export function formatDate(value: string | null, withTime?: boolean): string {
  if (!value) return '–';
  const d = withTime ? toDate(value) : toDate(`${value.slice(0, 10)}T00:00:00`);
  if (!d) return '–';
  return new Intl.DateTimeFormat('de-DE', {
    ...(withTime ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : {}),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
