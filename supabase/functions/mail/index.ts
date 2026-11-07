/**
 * Lunaxora – E-Mails direkt aus der App verschicken (Supabase Edge Function "mail")
 *
 * Angebote, Rechnungen, Zahlungserinnerungen und Mahnungen gehen mit PDF im
 * Anhang an den Kunden – entweder über dein eigenes Postfach (SMTP, z. B. bei
 * webgo, IONOS, Strato) oder über den E-Mail-Dienst Resend. Absender ist deine
 * Firma (Name) mit der Adresse aus MAIL_FROM; Antworten des Kunden landen bei
 * deiner eigenen E-Mail-Adresse (Antwort-an).
 *
 * Nur angemeldete Lunaxora-Nutzer; höchstens 3 Empfänger je E-Mail, nur PDFs
 * als Anhang, höchstens 20 E-Mails pro Stunde und 100 pro Tag je Nutzer.
 * Jeder Versand wird im Protokoll (Tabelle email_log) vermerkt – mit den
 * Rechten des Nutzers.
 *
 * Einrichtung: siehe supabase/README.md (Abschnitt "E-Mails direkt verschicken").
 * Geheimnisse (Supabase -> Edge Functions -> Secrets) – Weg A ODER Weg B:
 *
 *   A) Eigenes Postfach (SMTP):
 *   SMTP_HOST       Postausgangsserver deines Anbieters (steht in dessen E-Mail-Einstellungen)
 *   SMTP_PORT       465 (verschlüsselt, SSL/TLS) – Supabase erlaubt keine Verbindungen über 25 und 587
 *   SMTP_USER       Benutzername des Postfachs (oft die E-Mail-Adresse)
 *   SMTP_PASS       Passwort des Postfachs
 *   MAIL_FROM       E-Mail-Adresse des Postfachs (optional, wenn SMTP_USER schon die Adresse ist)
 *
 *   B) Resend:
 *   RESEND_API_KEY  API-Schlüssel von resend.com
 *   MAIL_FROM       Absender-Adresse auf deiner bei Resend bestätigten Domain
 *
 * Ist SMTP_HOST gesetzt, wird Weg A benutzt.
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

/** Verschlüsselte Verbindung zum Mailserver (Deno.connectTls bzw. in Tests nachgebildet) */
export type SmtpConn = {
  read(p: Uint8Array): Promise<number | null>;
  write(p: Uint8Array): Promise<number>;
  close(): void;
};

type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => Date;
  connectTls?: (o: { hostname: string; port: number }) => Promise<SmtpConn>;
  /** Wartezeit je Antwort des Mailservers (Tests: kürzer) */
  smtpTimeoutMs?: number;
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
  return s.slice(0, 80) || 'Lunaxora';
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

// ---------------------------------------------------------------------------
// E-Mail zusammenbauen (MIME) und über SMTP verschicken
// ---------------------------------------------------------------------------

const utf8 = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const wrap76 = (b64: string) => b64.replace(/.{1,76}/g, '$&\r\n').replace(/\r\n$/, '');
const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** Kopfzeilen-Text mit Umlauten (RFC 2047), in Stücken ≤ 75 Zeichen */
export function encodeWord(s: string): string {
  if (ascii(s)) return s;
  const words: string[] = [];
  let chunk = '';
  for (const ch of s) {
    if (utf8.encode(chunk + ch).length > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${base64(utf8.encode(w))}?=`).join('\r\n ');
}

/** Dateiname ohne Umlaute (für ältere Mailprogramme) */
const asciiName = (s: string) =>
  s
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\x20-\x7e]/g, '_');

export function buildMime(m: {
  fromName: string;
  from: string;
  to: string[];
  replyTo: string | null;
  subject: string;
  text: string;
  attachments: { filename: string; content: string }[];
  date: Date;
  messageId: string;
}): string {
  const boundary = `nexora-${m.messageId.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;
  const fromName = ascii(m.fromName) ? `"${m.fromName}"` : encodeWord(m.fromName);
  const head = [
    `From: ${fromName} <${m.from}>`,
    `To: ${m.to.join(', ')}`,
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${encodeWord(m.subject)}`,
    `Date: ${m.date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${m.messageId}`,
    'MIME-Version: 1.0',
  ];
  const textPart = [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64(utf8.encode(m.text.replace(/\r?\n/g, '\r\n')))),
  ];
  if (!m.attachments.length) return [...head, ...textPart].join('\r\n');
  const parts = [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, ...textPart];
  for (const a of m.attachments) {
    const plain = asciiName(a.filename);
    parts.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${plain}"`,
      `Content-Disposition: attachment; filename="${plain}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(a.content),
    );
  }
  parts.push(`--${boundary}--`, '');
  return parts.join('\r\n');
}

export class SmtpError extends Error {
  code: string;
  detail: string;
  constructor(code: string, detail = '') {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
  }
}

/** Kleines SMTP-Gespräch: EHLO, Anmelden, Absender, Empfänger, Nachricht, Tschüss. */
export async function smtpSend(
  conn: SmtpConn,
  o: { user: string; pass: string; from: string; to: string[]; data: string; helo: string; timeoutMs?: number },
): Promise<string> {
  const dec = new TextDecoder();
  const buf = new Uint8Array(16384);
  let pending = '';
  const timeoutMs = o.timeoutMs ?? 20000;

  const readChunk = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SmtpError('smtp_timeout', 'Der Mailserver antwortet nicht.')), timeoutMs);
    });
    try {
      const n = await Promise.race([conn.read(buf), timeout]);
      if (n === null) throw new SmtpError('smtp_connect_failed', 'Verbindung vom Mailserver beendet.');
      pending += dec.decode(buf.subarray(0, n), { stream: true });
    } finally {
      clearTimeout(timer);
    }
  };
  /** Eine (evtl. mehrzeilige) Antwort lesen: "250-..." … "250 ..." */
  const reply = async (): Promise<{ code: number; text: string }> => {
    for (;;) {
      const lines = pending.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3}(?: |$)/.test(lines[i])) {
          const text = lines.slice(0, i + 1).join('\n');
          pending = lines.slice(i + 1).join('\r\n');
          return { code: Number(lines[i].slice(0, 3)), text };
        }
      }
      await readChunk();
    }
  };
  const send = async (line: string) => {
    const bytes = utf8.encode(line);
    let off = 0;
    while (off < bytes.length) off += await conn.write(bytes.subarray(off));
  };
  const expect = async (codes: number[], err: string) => {
    const r = await reply();
    if (!codes.includes(r.code))
      throw new SmtpError(r.code === 535 || r.code === 534 ? 'smtp_auth_failed' : err, r.text);
    return r;
  };
  const b64 = (s: string) => base64(utf8.encode(s));

  try {
    await expect([220], 'smtp_connect_failed');
    await send(`EHLO ${o.helo}\r\n`);
    const ehlo = await expect([250], 'smtp_connect_failed');
    const authLine = ehlo.text.split('\n').find((l) => /^250[- ]AUTH[ =]/i.test(l)) ?? '';
    if (/LOGIN/i.test(authLine) && !/PLAIN/i.test(authLine)) {
      await send('AUTH LOGIN\r\n');
      await expect([334], 'smtp_auth_failed');
      await send(`${b64(o.user)}\r\n`);
      await expect([334], 'smtp_auth_failed');
      await send(`${b64(o.pass)}\r\n`);
      await expect([235], 'smtp_auth_failed');
    } else {
      await send(`AUTH PLAIN ${b64(`\0${o.user}\0${o.pass}`)}\r\n`);
      await expect([235], 'smtp_auth_failed');
    }
    await send(`MAIL FROM:<${o.from}>\r\n`);
    await expect([250], 'smtp_rejected');
    for (const r of o.to) {
      await send(`RCPT TO:<${r}>\r\n`);
      await expect([250, 251], 'smtp_rejected');
    }
    await send('DATA\r\n');
    await expect([354], 'smtp_rejected');
    // Zeilen mit Punkt am Anfang verdoppeln, Ende mit "."
    const body = o.data.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
    await send(`${body}\r\n.\r\n`);
    const done = await expect([250], 'smtp_rejected');
    await send('QUIT\r\n');
    await reply().catch(() => null);
    return done.text;
  } finally {
    try {
      conn.close();
    } catch {
      // schon zu
    }
  }
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

  // Weg A: eigenes Postfach (SMTP), Weg B: Resend
  const smtpHost = deps.env('SMTP_HOST')?.trim();
  const smtpUser = deps.env('SMTP_USER')?.trim() ?? '';
  const smtpPass = deps.env('SMTP_PASS') ?? '';
  const smtpPort = Number(deps.env('SMTP_PORT')?.trim() || 465);
  const key = deps.env('RESEND_API_KEY');
  if (smtpHost) {
    if (!smtpUser || !smtpPass) return json(500, { error: 'missing_smtp_login' });
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) return json(500, { error: 'smtp_port' });
    // Supabase lässt keine Verbindungen über Port 25 und 587 zu
    if (smtpPort === 25 || smtpPort === 587) return json(500, { error: 'smtp_port' });
  } else if (!key) return json(500, { error: 'missing_resend_key' });
  const from = (deps.env('MAIL_FROM')?.trim() || (smtpHost && EMAIL.test(smtpUser) ? smtpUser : '')).trim();
  if (!from || !EMAIL.test(from)) return json(500, { error: 'missing_mail_from' });

  // Nur mit Pro (Skript 20261116090000_plans.sql; fehlt es, gilt keine Einschränkung)
  const planRes = await deps
    .fetch(`${url}/rest/v1/rpc/my_plan`, {
      method: 'POST',
      headers: { Authorization: auth, apikey, 'Content-Type': 'application/json' },
      body: '{}',
    })
    .catch(() => null);
  if (planRes?.ok) {
    const info = (await planRes.json().catch(() => null)) as { plan?: string } | null;
    if (info?.plan === 'free') return json(402, { error: 'pro_required' });
  }

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

  // Verschicken – Weg A: eigenes Postfach
  let providerId: string | null = null;
  if (smtpHost) {
    if (!deps.connectTls) return json(500, { error: 'smtp_unsupported' });
    const messageId = `<${crypto.randomUUID()}@${from.split('@')[1]}>`;
    const data = buildMime({
      fromName: msg.fromName,
      from,
      to: msg.to,
      replyTo: msg.replyTo ?? user.email ?? null,
      subject: msg.subject,
      text: msg.text,
      attachments: msg.attachments,
      date: now,
      messageId,
    });
    let conn: SmtpConn;
    try {
      conn = await deps.connectTls({ hostname: smtpHost, port: smtpPort });
    } catch (e) {
      console.error('SMTP connect', e);
      return json(502, { error: 'smtp_connect_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) });
    }
    try {
      await smtpSend(conn, {
        user: smtpUser,
        pass: smtpPass,
        from,
        to: msg.to,
        data,
        helo: from.split('@')[1],
        timeoutMs: deps.smtpTimeoutMs,
      });
    } catch (e) {
      const code = e instanceof SmtpError ? e.code : 'smtp_connect_failed';
      const detail = (e instanceof SmtpError ? e.detail : String((e as Error)?.message ?? e)).slice(0, 300);
      console.error('SMTP', code, detail);
      return json(code === 'smtp_auth_failed' ? 500 : 502, { error: code, detail });
    }
    providerId = messageId;
  }

  // Weg B: Resend
  if (!smtpHost) {
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
    providerId = ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null;
  }

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
        provider_id: providerId,
      }),
    })
    .catch((e) => e);
  if (!(logged instanceof Response) || !logged.ok) console.error('email_log insert', logged);

  return json(200, { id: providerId, to: msg.to });
}

// Im Supabase-Edge-Runtime (Deno) starten; in Tests wird nur handleRequest benutzt.
declare const Deno:
  | {
      serve?: (h: (req: Request) => Promise<Response>) => void;
      env: { get(key: string): string | undefined };
      connectTls: (o: { hostname: string; port: number }) => Promise<SmtpConn>;
    }
  | undefined;
if (typeof Deno !== 'undefined' && Deno?.serve) {
  Deno.serve((req) =>
    handleRequest(req, { env: (k) => Deno!.env.get(k), fetch, connectTls: (o) => Deno!.connectTls(o) }),
  );
}
