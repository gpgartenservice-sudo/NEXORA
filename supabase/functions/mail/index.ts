/**
 * NEXORA – E-Mails direkt aus der App verschicken (Supabase Edge Function "mail")
 *
 * Angebote, Rechnungen, Zahlungserinnerungen und Mahnungen gehen mit PDF im
 * Anhang an den Kunden – über den E-Mail-Dienst Resend. Absender ist deine
 * Firma (Name) mit der Adresse aus MAIL_FROM; Antworten des Kunden landen bei
 * deiner eigenen E-Mail-Adresse (Antwort-an).
 *
 * Nur angemeldete NEXORA-Nutzer; höchstens 3 Empfänger je E-Mail, nur PDFs
 * als Anhang, höchstens 20 E-Mails pro Stunde und 100 pro Tag je Nutzer.
 * Jeder Versand wird im Protokoll (Tabelle email_log) vermerkt – mit den
 * Rechten des Nutzers.
 *
 * Einrichtung: siehe supabase/README.md (Abschnitt "E-Mails direkt verschicken").
 * Geheimnisse (Supabase -> Edge Functions -> Secrets):
 *   RESEND_API_KEY  (Pflicht) API-Schlüssel von resend.com
 *   MAIL_FROM       (Pflicht) Absender-Adresse auf deiner bei Resend bestätigten Domain,
 *                   z. B. post@deine-firma.de
 */

const RESEND_URL = 'https://api.resend.com/emails';
const MAX_RECIPIENTS = 3;
const MAX_SUBJECT = 200;
const MAX_TEXT = 20000;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BASE64 = 9_000_000; // zusammen ~6,5 MB
const PER_HOUR = 20;
const PER_DAY = 100;
const KINDS = ['offer', 'invoice', 'reminder', 'review', 'other'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => Date;
};

type Attachment = { filename?: unknown; content?: unknown };
type Body = {
  to?: unknown;
  subject?: unknown;
  text?: unknown;
  reply_to?: unknown;
  from_name?: unknown;
  attachments?: unknown;
  document_id?: unknown;
  kind?: unknown;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Absendername ohne Zeichen, die die Kopfzeile kaputt machen könnten */
export function cleanName(v: unknown): string {
  const s =
    typeof v === 'string'
      ? v
          .replace(/[\r\n<>"\\]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  return s.slice(0, 80) || 'NEXORA';
}

/** Eingaben prüfen -> fertige Nachricht oder Fehlercode */
export function validate(body: Body) {
  const to = (Array.isArray(body.to) ? body.to : [body.to])
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!to.length) return { error: 'missing_to' } as const;
  if (to.length > MAX_RECIPIENTS) return { error: 'too_many_recipients' } as const;
  if (!to.every((x) => EMAIL.test(x) && x.length <= 320)) return { error: 'invalid_to' } as const;
  const subject = typeof body.subject === 'string' ? body.subject.replace(/[\r\n]+/g, ' ').trim() : '';
  if (!subject || subject.length > MAX_SUBJECT) return { error: 'invalid_subject' } as const;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_TEXT) return { error: 'invalid_text' } as const;
  const replyTo = typeof body.reply_to === 'string' && EMAIL.test(body.reply_to.trim()) ? body.reply_to.trim() : null;
  const kind = typeof body.kind === 'string' && KINDS.includes(body.kind) ? body.kind : 'other';
  const documentId = typeof body.document_id === 'string' && UUID.test(body.document_id) ? body.document_id : null;

  const raw = Array.isArray(body.attachments) ? (body.attachments as Attachment[]) : [];
  if (raw.length > MAX_ATTACHMENTS) return { error: 'too_many_attachments' } as const;
  let size = 0;
  const attachments: { filename: string; content: string }[] = [];
  for (const a of raw) {
    const filename = typeof a?.filename === 'string' ? a.filename.trim() : '';
    const content = typeof a?.content === 'string' ? a.content : '';
    if (!/^[\w äöüÄÖÜß.,()+-]{1,120}\.pdf$/i.test(filename)) return { error: 'invalid_attachment' } as const;
    if (!content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) return { error: 'invalid_attachment' } as const;
    // nur echte PDFs ("%PDF" = JVBER in Base64)
    if (!content.startsWith('JVBER')) return { error: 'invalid_attachment' } as const;
    size += content.length;
    attachments.push({ filename, content });
  }
  if (size > MAX_ATTACHMENT_BASE64) return { error: 'attachment_too_large' } as const;
  return { to, subject, text, replyTo, kind, documentId, attachments, fromName: cleanName(body.from_name) } as const;
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  // Angemeldet? (Prüfung beim Supabase-Auth-Server)
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey');
  const url = deps.env('SUPABASE_URL');
  if (!auth?.startsWith('Bearer ') || !apikey || !url) return json(401, { error: 'not_signed_in' });
  const userRes = await deps.fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!userRes.ok) return json(401, { error: 'not_signed_in' });
  const user = (await userRes.json().catch(() => ({}))) as { id?: string; email?: string };

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'invalid_body' });
  const msg = validate(body);
  if ('error' in msg) return json(400, { error: msg.error });

  const key = deps.env('RESEND_API_KEY');
  if (!key) return json(500, { error: 'missing_resend_key' });
  const from = deps.env('MAIL_FROM')?.trim();
  if (!from || !EMAIL.test(from)) return json(500, { error: 'missing_mail_from' });

  // Bremse: Wie viele E-Mails in der letzten Stunde / am letzten Tag?
  const db = { Authorization: auth, apikey, 'Content-Type': 'application/json' };
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const logRes = await deps.fetch(
    `${url}/rest/v1/email_log?select=created_at&created_at=gte.${encodeURIComponent(since)}`,
    {
      headers: db,
    },
  );
  if (!logRes.ok) {
    const detail = (await logRes.text().catch(() => '')).slice(0, 300);
    if (logRes.status === 404 || /PGRST205|42P01/.test(detail)) return json(500, { error: 'missing_log_table' });
    console.error('email_log', logRes.status, detail);
    return json(502, { error: 'log_error', detail });
  }
  const sent = ((await logRes.json().catch(() => [])) as { created_at: string }[]) ?? [];
  const hourAgo = now.getTime() - 60 * 60 * 1000;
  if (sent.length >= PER_DAY) return json(429, { error: 'too_many_today' });
  if (sent.filter((s) => new Date(s.created_at).getTime() >= hourAgo).length >= PER_HOUR)
    return json(429, { error: 'too_many_this_hour' });

  // Verschicken
  let res: Response;
  try {
    res = await deps.fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${msg.fromName} <${from}>`,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.replyTo || user.email ? { reply_to: msg.replyTo ?? user.email } : {}),
        ...(msg.attachments.length ? { attachments: msg.attachments } : {}),
      }),
    });
  } catch (error) {
    console.error('Resend', error);
    return json(502, { error: 'send_error', detail: 'E-Mail-Dienst nicht erreichbar' });
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error('Resend', res.status, detail);
    if (res.status === 401) return json(500, { error: 'invalid_resend_key' });
    if (res.status === 403) return json(500, { error: 'domain_not_verified', detail });
    if (res.status === 429) return json(429, { error: 'rate_limited' });
    return json(502, { error: 'send_error', status: res.status, detail });
  }
  const sentMail = (await res.json().catch(() => ({}))) as { id?: string };

  // Im Protokoll vermerken (Fehler hier verhindern den Versand nicht mehr)
  const logged = await deps
    .fetch(`${url}/rest/v1/email_log`, {
      method: 'POST',
      headers: { ...db, Prefer: 'return=minimal' },
      body: JSON.stringify({
        document_id: msg.documentId,
        kind: msg.kind,
        to_email: msg.to.join(', ').slice(0, 320),
        subject: msg.subject,
        provider_id: sentMail.id ?? null,
      }),
    })
    .catch((e) => e);
  if (!(logged instanceof Response) || !logged.ok) console.error('email_log insert', logged);

  return json(200, { id: sentMail.id ?? null, to: msg.to });
}

// Im Supabase-Edge-Runtime (Deno) starten; in Tests wird nur handleRequest benutzt.
declare const Deno:
  | { serve?: (h: (req: Request) => Promise<Response>) => void; env: { get(key: string): string | undefined } }
  | undefined;
if (typeof Deno !== 'undefined' && Deno?.serve) {
  Deno.serve((req) => handleRequest(req, { env: (k) => Deno!.env.get(k), fetch }));
}
