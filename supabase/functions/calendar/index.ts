/**
 * Lunaxora – Kalender-Abo (Supabase Edge Function "calendar")
 *
 * GET .../functions/v1/calendar?token=…  ->  alle Termine als Kalender (.ics)
 * für Apple Kalender, Google Kalender oder Outlook (Abo per Link).
 *
 * - Die Termine kommen über die Datenbank-Funktion calendar_feed: Sie gibt nur
 *   mit einem gültigen, geheimen Link etwas heraus – und nur die Termine des
 *   Link-Inhabers (Erstgespräche, Ausführungen, eigene Termine).
 * - "Verify JWT" muss AUS sein (Kalender-Apps melden sich nicht an).
 *
 * Einrichtung: siehe supabase/README.md (Abschnitt "Termine & Kalender-Abo").
 * Geheimnisse: keine nötig (SUPABASE_URL und SUPABASE_ANON_KEY stehen automatisch
 * bereit). Falls der Abruf mit "Schlüssel ungültig" scheitert: Geheimnis
 * NEXORA_PUBLISHABLE_KEY = Publishable Key aus der .env der App.
 */

type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
};

type FeedOrder = {
  id: string;
  title: string;
  meeting_at: string | null;
  meeting_done: boolean;
  execution_at: string | null;
  completed: boolean;
  customer: string | null;
  address: string | null;
  phone: string | null;
};
type FeedAppointment = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  customer: string | null;
};
export type Feed = { name: string; orders: FeedOrder[]; appointments: FeedAppointment[] };

const MIN = 60 * 1000;
const TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

const text = (status: number, body: string) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });

// ---------------------------------------------------------------------------
// .ics erzeugen (RFC 5545)
// ---------------------------------------------------------------------------
export function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Datum in Deutschland als "JJJJMMTT" */
export function berlinDate(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(ms))
    .replace(/-/g, '');
}

function nextDate(yyyymmdd: string): string {
  const d = new Date(Date.UTC(+yyyymmdd.slice(0, 4), +yyyymmdd.slice(4, 6) - 1, +yyyymmdd.slice(6, 8) + 1));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

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

type Ev = {
  uid: string;
  summary: string;
  start: string;
  end: string;
  allDay?: { from: string; to: string };
  location: string | null;
  description: string;
};

export function feedToIcs(feed: Feed, now: number): string {
  const events: Ev[] = [];
  const describe = (...parts: (string | null | false)[]) => parts.filter(Boolean).join('\n');
  for (const o of feed.orders ?? []) {
    const who = o.customer ? ` (${o.customer})` : '';
    const details = (kind: string, done: boolean) =>
      describe(`${kind} – Auftrag „${o.title}“`, o.customer && `Kunde: ${o.customer}`, o.phone && `Telefon: ${o.phone}`, done && 'Erledigt');
    if (o.meeting_at)
      events.push({
        uid: `meeting-${o.id}@nexora`,
        summary: `Erstgespräch: ${o.title}${who}`,
        start: o.meeting_at,
        end: new Date(Date.parse(o.meeting_at) + 60 * MIN).toISOString(),
        location: o.address,
        description: details('Erstgespräch', o.meeting_done),
      });
    if (o.execution_at)
      events.push({
        uid: `execution-${o.id}@nexora`,
        summary: `Ausführung: ${o.title}${who}`,
        start: o.execution_at,
        end: new Date(Date.parse(o.execution_at) + 120 * MIN).toISOString(),
        location: o.address,
        description: details('Ausführung', o.completed),
      });
  }
  for (const a of feed.appointments ?? []) {
    const from = berlinDate(Date.parse(a.starts_at));
    events.push({
      uid: `appointment-${a.id}@nexora`,
      summary: a.title,
      start: a.starts_at,
      end: a.ends_at ?? new Date(Date.parse(a.starts_at) + 60 * MIN).toISOString(),
      allDay: a.all_day ? { from, to: nextDate(from) } : undefined,
      location: a.location,
      description: describe(a.customer && `Kunde: ${a.customer}`, a.notes?.trim() || null),
    });
  }
  events.sort((x, y) => x.start.localeCompare(y.start));

  const stamp = utc(new Date(now).toISOString());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Lunaxora//Kalender-Abo//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(`${feed.name || 'Lunaxora'} – Termine`)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      ...(e.allDay
        ? [`DTSTART;VALUE=DATE:${e.allDay.from}`, `DTEND;VALUE=DATE:${e.allDay.to}`]
        : [`DTSTART:${utc(e.start)}`, `DTEND:${utc(e.end)}`]),
      `SUMMARY:${icsText(e.summary)}`,
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

// ---------------------------------------------------------------------------
// Anfrage
// ---------------------------------------------------------------------------
export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  if (req.method !== 'GET' && req.method !== 'HEAD') return text(405, 'Nur GET');

  const url = new URL(req.url);
  // ?token=… oder …/calendar/<token>.ics
  const token = url.searchParams.get('token') ?? url.pathname.split('/').pop()?.replace(/\.ics$/i, '') ?? '';
  if (!TOKEN.test(token)) return text(404, 'Kalender nicht gefunden.');

  const base = deps.env('SUPABASE_URL');
  const key = deps.env('NEXORA_PUBLISHABLE_KEY') || deps.env('SUPABASE_ANON_KEY') || deps.env('SUPABASE_PUBLISHABLE_KEY');
  if (!base || !key) return text(500, 'Einrichtung unvollständig: In Supabase fehlt das Geheimnis NEXORA_PUBLISHABLE_KEY.');

  let res: Response;
  try {
    res = await deps.fetch(`${base.replace(/\/+$/, '')}/rest/v1/rpc/calendar_feed`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    });
  } catch (e) {
    console.error('calendar', e);
    return text(502, 'Die Datenbank ist gerade nicht erreichbar.');
  }
  if (res.status === 401 || res.status === 403)
    return text(500, 'Schlüssel ungültig: Bitte in Supabase das Geheimnis NEXORA_PUBLISHABLE_KEY setzen (Publishable Key der App).');
  if (res.status === 404) return text(500, 'Das Datenbank-Skript für Termine fehlt noch (20261109090000_appointments.sql).');
  if (!res.ok) {
    console.error('calendar', res.status, await res.text().catch(() => ''));
    return text(502, 'Die Termine konnten nicht geladen werden.');
  }
  const feed = (await res.json().catch(() => null)) as Feed | null;
  if (!feed) return text(404, 'Kalender nicht gefunden.');

  const ics = feedToIcs(feed, deps.now?.() ?? Date.now());
  return new Response(req.method === 'HEAD' ? null : ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="lunaxora-termine.ics"',
      'Cache-Control': 'private, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// Im Supabase-Edge-Runtime (Deno) starten; in Tests wird nur handleRequest benutzt.
declare const Deno:
  | { serve?: (h: (req: Request) => Promise<Response>) => void; env: { get(key: string): string | undefined } }
  | undefined;
if (typeof Deno !== 'undefined' && Deno?.serve) {
  Deno.serve((req) => handleRequest(req, { env: (k) => Deno!.env.get(k), fetch }));
}
