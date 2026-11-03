/**
 * Termine – reine Logik (ohne App/Netz, mit Unit-Tests):
 * Termine aus Aufträgen (Erstgespräch, Ausführung) und eigene Termine
 * zusammenführen, nach Tagen ordnen, Überschneidungen und offene Punkte
 * finden, Tagesroute, Kalender-Datei (.ics) und Google-Kalender-Link.
 */
import { computeStatus, type OrderFacts } from '../crm/order-logic';
import { toIso, toMs } from '../../lib/dates';
import { dayKey } from '../social/social-logic';

export type Appointment = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  customer_id: string | null;
  notes: string | null;
  done: boolean;
  created_at: string;
  updated_at: string;
};

export type EventKind = 'meeting' | 'execution' | 'appointment';

export type CalendarEvent = {
  /** eindeutig: meeting-<Auftrag>, execution-<Auftrag>, appointment-<Termin> */
  key: string;
  kind: EventKind;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  customerName: string | null;
  phone: string | null;
  orderId: string | null;
  appointmentId: string | null;
  done: boolean;
  notes: string | null;
};

type OrderLike = OrderFacts & {
  id: string;
  title: string;
  customer_id: string;
};
type CustomerLike = { id: string; name: string; address: string | null; phone: string | null };

/** Dauer, wenn nichts anderes bekannt ist (Minuten) */
export const DEFAULT_MINUTES: Record<EventKind, number> = { meeting: 60, execution: 120, appointment: 60 };

export const KIND_LABEL: Record<EventKind, string> = {
  meeting: 'Erstgespräch',
  execution: 'Ausführung',
  appointment: 'Termin',
};

const MIN = 60 * 1000;
const addMinutes = (iso: string, minutes: number) => new Date(toMs(iso) + minutes * MIN).toISOString();

/** Alle Termine: aus Aufträgen (ohne stornierte) und eigene – nach Beginn sortiert */
export function buildEvents(
  orders: OrderLike[],
  customers: CustomerLike[],
  appointments: Appointment[],
): CalendarEvent[] {
  const byId = new Map(customers.map((c) => [c.id, c]));
  const events: CalendarEvent[] = [];
  for (const o of orders) {
    if (o.cancelled) continue;
    const c = byId.get(o.customer_id);
    const base = {
      allDay: false,
      location: c?.address?.trim() || null,
      customerName: c?.name ?? null,
      phone: c?.phone ?? null,
      orderId: o.id,
      appointmentId: null,
      notes: null,
    };
    // ungültige Zeitstempel überspringen statt abzustürzen
    const meetingStart = toIso(o.meeting_at);
    const executionStart = toIso(o.execution_at);
    if (meetingStart)
      events.push({
        ...base,
        key: `meeting-${o.id}`,
        kind: 'meeting',
        title: o.title,
        start: meetingStart,
        end: addMinutes(meetingStart, DEFAULT_MINUTES.meeting),
        done: !!o.meeting_done,
      });
    if (executionStart)
      events.push({
        ...base,
        key: `execution-${o.id}`,
        kind: 'execution',
        title: o.title,
        start: executionStart,
        end: addMinutes(executionStart, DEFAULT_MINUTES.execution),
        done: !!o.completed,
      });
  }
  for (const a of appointments) {
    const c = a.customer_id ? byId.get(a.customer_id) : undefined;
    const startIso = toIso(a.starts_at);
    if (!startIso) continue;
    const start = new Date(startIso);
    const allDayEnd = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1).toISOString();
    events.push({
      key: `appointment-${a.id}`,
      kind: 'appointment',
      title: a.title,
      start: start.toISOString(),
      end: a.all_day
        ? allDayEnd
        : a.ends_at
          ? (toIso(a.ends_at) ?? addMinutes(startIso, DEFAULT_MINUTES.appointment))
          : addMinutes(startIso, DEFAULT_MINUTES.appointment),
      allDay: a.all_day,
      location: a.location?.trim() || c?.address?.trim() || null,
      customerName: c?.name ?? null,
      phone: c?.phone ?? null,
      orderId: null,
      appointmentId: a.id,
      done: a.done,
      notes: a.notes,
    });
  }
  return events.sort((a, b) => a.start.localeCompare(b.start) || Number(b.allDay) - Number(a.allDay));
}

/** Termine je Tag (lokale Zeit, "JJJJ-MM-TT") */
export function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e.start);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return map;
}

/** Termine, die sich am selben Tag zeitlich überschneiden (ohne ganztägige) */
export function overlapping(events: CalendarEvent[]): Set<string> {
  const hits = new Set<string>();
  const timed = events.filter((e) => !e.allDay).sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j].start >= timed[i].end) break;
      if (dayKey(timed[i].start) !== dayKey(timed[j].start)) continue;
      hits.add(timed[i].key);
      hits.add(timed[j].key);
    }
  }
  return hits;
}

/** Kommende Termine: noch nicht vorbei, beginnen innerhalb von `days` Tagen */
export function upcoming(events: CalendarEvent[], now: Date, days = 30): CalendarEvent[] {
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days + 1).toISOString();
  const nowIso = now.toISOString();
  return events.filter((e) => e.end > nowIso && e.start < until);
}

// ---------------------------------------------------------------------------
// Offene Punkte: Termine, die bestätigt oder noch vereinbart werden sollten
// ---------------------------------------------------------------------------

export type OpenItem = {
  key: string;
  kind: 'confirm_meeting' | 'schedule_meeting' | 'schedule_execution' | 'finish_order';
  orderId: string;
  title: string;
  customerName: string | null;
  /** Bezugsdatum (Termin bzw. Anlage), falls vorhanden */
  when: string | null;
};

export const OPEN_LABEL: Record<OpenItem['kind'], string> = {
  confirm_meeting: 'Erstgespräch erledigt?',
  schedule_meeting: 'Termin fürs Erstgespräch vereinbaren',
  schedule_execution: 'Angebot angenommen – Ausführung planen',
  finish_order: 'Ausgeführt – Auftrag abschließen?',
};

export function openItems(
  orders: (OrderLike & { created_at?: string })[],
  customers: CustomerLike[],
  now: Date,
): OpenItem[] {
  const nameOf = new Map(customers.map((c) => [c.id, c.name]));
  const nowIso = now.toISOString();
  const items: OpenItem[] = [];
  for (const o of orders) {
    if (o.cancelled || o.completed) continue;
    const base = { orderId: o.id, title: o.title, customerName: nameOf.get(o.customer_id) ?? null };
    const status = computeStatus(o);
    if (o.meeting_at && !o.meeting_done && (toIso(o.meeting_at) ?? '9999') < nowIso && status === 'meeting_planned')
      items.push({ ...base, key: `confirm-${o.id}`, kind: 'confirm_meeting', when: o.meeting_at });
    else if (status === 'new')
      items.push({ ...base, key: `meet-${o.id}`, kind: 'schedule_meeting', when: o.created_at ?? null });
    else if (status === 'accepted')
      items.push({ ...base, key: `exec-${o.id}`, kind: 'schedule_execution', when: null });
    // einmalige Aufträge: einen Tag nach der Ausführung ans Abschließen erinnern
    if (o.execution_at && o.billing !== 'monthly' && toMs(o.execution_at) + 24 * 60 * MIN < now.getTime())
      items.push({ ...base, key: `finish-${o.id}`, kind: 'finish_order', when: o.execution_at });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Anzeige
// ---------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** "09:00–10:00" bzw. "Ganztägig" */
export function timeLabel(e: Pick<CalendarEvent, 'start' | 'end' | 'allDay'>): string {
  if (e.allDay) return 'Ganztägig';
  const s = new Date(e.start);
  const end = new Date(e.end);
  return dayKey(s) === dayKey(end)
    ? `${hhmm(s)}–${hhmm(end)}`
    : `${hhmm(s)} – ${end.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })} ${hhmm(end)}`;
}

/** "Heute", "Morgen", "Gestern" oder "Mittwoch, 5. Nov." */
export function dayLabel(day: Date | string, today: Date): string {
  // "JJJJ-MM-TT" (Tag) oder kompletter Zeitpunkt
  const d = typeof day !== 'string' ? day : day.length === 10 ? new Date(`${day}T12:00:00`) : new Date(day);
  const diff = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) /
      (24 * 60 * MIN),
  );
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// Karte & Route
// ---------------------------------------------------------------------------

export function mapUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

/**
 * Tagesroute in Google Maps: Start (z. B. Firmenadresse) -> alle Adressen in
 * Reihenfolge der Termine. Gleiche Adressen direkt hintereinander nur einmal.
 * null, wenn es keine Adresse gibt.
 */
export function routeUrl(origin: string | null, stops: (string | null)[]): string | null {
  const list: string[] = [];
  for (const s of stops) {
    const a = s?.trim();
    if (a && list[list.length - 1]?.toLowerCase() !== a.toLowerCase()) list.push(a);
  }
  if (!list.length) return null;
  const params = new URLSearchParams({ api: '1', travelmode: 'driving' });
  if (origin?.trim()) params.set('origin', origin.trim());
  params.set('destination', list[list.length - 1]);
  // Google erlaubt bis zu 9 Zwischenziele
  const waypoints = list.slice(0, -1).slice(0, 9);
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Firmenadresse als Startpunkt der Route */
export function sellerAddress(s: { street: string | null; zip: string | null; city: string | null }): string | null {
  const place = [s.zip, s.city].filter((x) => x?.trim()).join(' ');
  const full = [s.street?.trim(), place].filter(Boolean).join(', ');
  return full || null;
}

// ---------------------------------------------------------------------------
// Kalender: .ics-Datei und Google-Kalender-Link
// ---------------------------------------------------------------------------

/** Text für .ics: Sonderzeichen maskieren */
export function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeitpunkt als UTC "JJJJMMTTTHHMMSSZ" */
export function icsUtc(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** lokales Datum als "JJJJMMTT" (ganztägig) */
export function icsDate(iso: string): string {
  return dayKey(iso).replace(/-/g, '');
}

/** Zeilen länger als 75 Byte umbrechen (RFC 5545) */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

export function eventDescription(e: CalendarEvent): string {
  return [
    e.kind !== 'appointment' ? `${KIND_LABEL[e.kind]} – Auftrag „${e.title}“` : null,
    e.customerName ? `Kunde: ${e.customerName}` : null,
    e.phone ? `Telefon: ${e.phone}` : null,
    e.notes?.trim() || null,
    e.done ? 'Erledigt' : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function eventSummary(e: CalendarEvent): string {
  if (e.kind === 'appointment') return e.title;
  return `${KIND_LABEL[e.kind]}: ${e.title}${e.customerName ? ` (${e.customerName})` : ''}`;
}

/** Kalender-Datei mit einem oder mehreren Terminen */
export function toIcs(events: CalendarEvent[], options: { name?: string; now?: Date } = {}): string {
  const stamp = icsUtc((options.now ?? new Date()).toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NEXORA//Termine//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(options.name ? [`X-WR-CALNAME:${icsText(options.name)}`] : []),
  ];
  for (const e of events) {
    const description = eventDescription(e);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.key}@nexora`,
      `DTSTAMP:${stamp}`,
      ...(e.allDay
        ? [`DTSTART;VALUE=DATE:${icsDate(e.start)}`, `DTEND;VALUE=DATE:${icsDate(e.end)}`]
        : [`DTSTART:${icsUtc(e.start)}`, `DTEND:${icsUtc(e.end)}`]),
      `SUMMARY:${icsText(eventSummary(e))}`,
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      ...(description ? [`DESCRIPTION:${icsText(description)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** Dateiname: "Termin_2026-11-05_Erstgespraech_Hecke_schneiden.ics" */
export function icsFileName(e: CalendarEvent): string {
  const safe = eventSummary(e)
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  return `Termin_${dayKey(e.start)}_${safe || 'NEXORA'}.ics`;
}

/** Link, der den Termin in Google Kalender zum Speichern öffnet */
export function googleCalendarUrl(e: CalendarEvent): string {
  const dates = e.allDay ? `${icsDate(e.start)}/${icsDate(e.end)}` : `${icsUtc(e.start)}/${icsUtc(e.end)}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: eventSummary(e), dates });
  const details = eventDescription(e);
  if (details) params.set('details', details);
  if (e.location) params.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Zufälliger, nicht erratbarer Abo-Schlüssel (URL-sicher) */
export function feedToken(random: (n: number) => Uint8Array): string {
  const bytes = random(32);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  return Array.from(bytes, (b) => alphabet[b & 63]).join('') + Array.from(random(8), (b) => alphabet[b & 63]).join('');
}

/** Abo-Adressen für Kalender-Apps */
export function feedUrls(supabaseUrl: string, token: string) {
  const https = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/calendar?token=${token}`;
  return {
    https,
    webcal: https.replace(/^https:/, 'webcal:'),
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(https.replace(/^https:/, 'webcal:'))}`,
  };
}

/** Zeitpunkt in lokaler Zeit: "JJJJ-MM-TTTHH:MM" (bzw. nur "JJJJ-MM-TT") – so rechnet Nexy */
export function localStamp(iso: string, dateOnly = false): string {
  const d = new Date(iso);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return dateOnly ? day : `${day}T${hhmm(d)}`;
}

export type NexyEvent = {
  ref: string;
  wann: string;
  beginn: string;
  ende?: string;
  art: string;
  was: string;
  kunde: string | null;
  ort: string | null;
  erledigt?: boolean;
};

/**
 * Termine für Nexy: von vor 3 Tagen (nur noch nicht erledigte) bis in `days`
 * Tagen. Jeder Termin bekommt ein Kurzzeichen (T1, T2 …), über das Nexy ihn
 * ändern kann; `refs` übersetzt es zurück in den Termin.
 */
export function nexyEvents(
  events: CalendarEvent[],
  now: Date,
  days = 45,
  max = 40,
): { entries: NexyEvent[]; refs: Record<string, string> } {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 3).toISOString();
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days + 1).toISOString();
  const nowIso = now.toISOString();
  const list = events.filter((e) => e.start >= from && e.start < until && !(e.end <= nowIso && e.done)).slice(0, max);
  const refs: Record<string, string> = {};
  const entries = list.map((e, i) => {
    const ref = `T${i + 1}`;
    refs[ref] = e.key;
    return {
      ref,
      wann: e.allDay
        ? `${new Date(e.start).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} ganztägig`
        : new Date(e.start).toLocaleString('de-DE', {
            weekday: 'short',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
      beginn: localStamp(e.start, e.allDay),
      ...(e.kind === 'appointment' && !e.allDay ? { ende: localStamp(e.end) } : {}),
      art: KIND_LABEL[e.kind],
      was: e.title,
      kunde: e.customerName,
      ort: e.location,
      ...(e.done ? { erledigt: true } : {}),
    };
  });
  return { entries, refs };
}

/** Andere Termine, die sich mit dem Zeitraum überschneiden (ohne ganztägige und erledigte) */
export function clashes(
  events: CalendarEvent[],
  slot: { start: string; end: string; allDay?: boolean },
  ignoreKey?: string | null,
): CalendarEvent[] {
  if (slot.allDay) return [];
  return events.filter((e) => e.key !== ignoreKey && !e.allDay && !e.done && e.start < slot.end && slot.start < e.end);
}
