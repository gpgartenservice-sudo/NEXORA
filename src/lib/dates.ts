/**
 * Zeitstempel aus der Datenbank sicher lesen – auch am Handy. Die
 * JavaScript-Maschine der Handy-App (Hermes) ist strenger als der Browser:
 * z. B. „2026-11-04T09:00:00.123456+00:00“ (6 Nachkommastellen von Postgres),
 * ein Leerzeichen statt „T“ oder „+00“ ohne Minuten können dort ein
 * ungültiges Datum ergeben – und toISOString() würde abstürzen.
 */
export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  let s = value.trim().replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2');
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s);
  if (m) {
    // genau 3 Nachkommastellen, Zeitzone als „+HH:MM“
    const [, base, frac, zone] = m;
    const ms = frac ? `.${frac.slice(0, 3).padEnd(3, '0')}` : '';
    let tz = zone ? zone.toUpperCase() : '';
    if (/^[+-]\d{2}$/.test(tz)) tz += ':00';
    else if (/^[+-]\d{4}$/.test(tz)) tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
    s = `${base}${ms}${tz}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Wie toDate, aber als ISO-Text (null bei ungültigem Wert) */
export function toIso(value: string | null | undefined): string | null {
  return toDate(value)?.toISOString() ?? null;
}

/** Millisekunden (NaN bei ungültigem Wert – wie Date.parse) */
export function toMs(value: string | null | undefined): number {
  return toDate(value)?.getTime() ?? Number.NaN;
}
