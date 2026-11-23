/**
 * Lunaxora – E-Mails direkt aus der App verschicken (Supabase Edge Function "mail")
 *
 * Angebote, Rechnungen, Zahlungserinnerungen und Mahnungen gehen mit PDF im
 * Anhang an den Kunden – entweder über dein eigenes Postfach (SMTP, z. B. bei
 * webgo, IONOS, Strato) oder über den E-Mail-Dienst Resend. Absender ist deine
 * Firma (Name) mit der Adresse aus MAIL_FROM; Antworten des Kunden landen bei
 * deiner eigenen E-Mail-Adresse (Antwort-an).
 *
 * Nur angemeldete Lunaxora-Nutzer mit dem Recht „Dokumente“ (Datenschutz-Link
 * und Bewertungen: „Kunden“); höchstens 3 Empfänger je E-Mail, nur PDFs als
 * Anhang, höchstens 20 E-Mails pro Stunde und 100 pro Tag je Firma (in der
 * Testphase 5 und 20). Jeder Versand wird VOR dem Versand im Protokoll (Tabelle
 * email_log) vermerkt – mit dem Server-Schlüssel SUPABASE_SERVICE_ROLE_KEY, den
 * Supabase jeder Funktion selbst mitgibt (Skript 20261204090000_sicherheit.sql).
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
 *
 * Datenschutz-Link für neue Kunden (kind "invite", Skript
 * 20261119090000_customer_invites.sql): Die App schickt nur invite_id,
 * Firmenname und Antwort-an – Empfänger, Betreff und Text baut diese Funktion
 * selbst aus der Einladung. Deshalb geht das in jedem Abo (auch Gratis), ohne
 * dass jemand darüber beliebige E-Mails verschicken kann.
 *   INVITE_URL      (optional) Adresse der Kundenseite, Standard https://lunaxora.de/Kunde
 *
 * Online-Widerruf (kind "withdrawal", Skript 20261203090000_widerruf_online.sql):
 * Kommt von der Angebotsseite OHNE Anmeldung. Die Funktion holt Empfänger und
 * Text nur über den geheimen Angebots-Link aus der Datenbank (offer_withdrawal_mail,
 * höchstens 3 Versuche) und schickt dem Kunden die Eingangsbestätigung nach
 * § 356a Abs. 4 BGB, mit Kopie an den Selbstständigen. Geht in jedem Abo.
 *
 * Auftragsbestätigung (kind "acceptance", Skript 20261204090000_sicherheit.sql):
 * Kommt ebenfalls von der Angebotsseite ohne Anmeldung, direkt nach „Verbindlich
 * annehmen“. Bestätigung des Vertrags mit Vertragsinhalt und – bei Privatkunden –
 * Widerrufsbelehrung und Muster-Widerrufsformular auf einem dauerhaften
 * Datenträger (§ 312f Abs. 2 BGB). Empfänger: die E-Mail, die der Kunde bei der
 * Annahme angegeben hat, Kopie an die E-Mail aus den Firmendaten.
 *   OFFER_URL       (optional) Adresse der Angebotsseite, Standard https://lunaxora.de/Angebot
 *
 * Beide Kunden-Mails holen ihre Daten nur mit dem Server-Schlüssel.
 */

const RESEND_URL = 'https://api.resend.com/emails';
const MAX_RECIPIENTS = 3;
const MAX_SUBJECT = 200;
const MAX_TEXT = 20000;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BASE64 = 9_000_000; // zusammen ~6,5 MB
const PER_HOUR = 20;
const PER_DAY = 100;
// Testphase: weniger, damit niemand über ein Gratis-Konto Werbung verschickt
const PER_HOUR_TRIAL = 5;
const PER_DAY_TRIAL = 20;
const KINDS = ['offer', 'invoice', 'reminder', 'review', 'other'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lunaxora-company',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Offene Firma der App (mehrere Firmen pro Konto, Skript 20261127090000_mehrere_firmen.sql)
 * an die Datenbank weiterreichen – sonst sieht die Datenbank nur die Standard-Firma.
 */
const COMPANY_HEADER = 'x-lunaxora-company';
const COMPANY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function companyHeader(req: Request): Record<string, string> {
  const id = req.headers.get(COMPANY_HEADER)?.trim();
  return id && COMPANY_ID.test(id) ? { [COMPANY_HEADER]: id } : {};
}

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
  invite_id?: unknown;
  /** Online-Widerruf: geheimer Angebots-Link */
  token?: unknown;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Server-Schlüssel: neue Secret Keys (sb_secret_…) nur als apikey, alte service_role-Schlüssel (JWT) zusätzlich als Bearer */
function serviceHeaders(deps: Deps): Record<string, string> | null {
  const key = deps.env('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!key) return null;
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

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

/** "2026-12-15T10:00:00Z" -> "15.12.2026" (deutsche Zeit) */
function dayDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Betreff und Text der E-Mail mit dem Datenschutz-Link (Text kommt nie vom Client) */
export function inviteMail(o: { fromName: string; token: string; expiresAt: string; base: string }) {
  const link = `${o.base.replace(/\/+$/, '')}/?einladung=${encodeURIComponent(o.token)}`;
  const until = dayDe(o.expiresAt);
  return {
    link,
    subject: `${o.fromName}: Bitte tragen Sie Ihre Kontaktdaten ein`,
    text: [
      'Guten Tag,',
      '',
      'vielen Dank für Ihre Anfrage! Bitte tragen Sie über diesen Link einmal Ihre Kontaktdaten ein und bestätigen Sie die Datenschutzerklärung:',
      '',
      link,
      '',
      `Ihre Daten werden erst gespeichert, wenn Sie das Formular abschicken.${until ? ` Der Link ist bis zum ${until} gültig.` : ''}`,
      '',
      'Viele Grüße',
      o.fromName,
    ].join('\n'),
  };
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

// ---------------------------------------------------------------------------
// Verschicken (gemeinsam für alle Arten)
// ---------------------------------------------------------------------------

type MailConfig = {
  smtpHost: string | null;
  smtpUser: string;
  smtpPass: string;
  smtpPort: number;
  key: string | undefined;
  from: string;
};

/** Weg A: eigenes Postfach (SMTP), Weg B: Resend – oder was in den Secrets fehlt */
function mailConfig(deps: Deps): MailConfig | { status: number; error: string } {
  const smtpHost = deps.env('SMTP_HOST')?.trim() || null;
  const smtpUser = deps.env('SMTP_USER')?.trim() ?? '';
  const smtpPass = deps.env('SMTP_PASS') ?? '';
  const smtpPort = Number(deps.env('SMTP_PORT')?.trim() || 465);
  const key = deps.env('RESEND_API_KEY');
  if (smtpHost) {
    if (!smtpUser || !smtpPass) return { status: 500, error: 'missing_smtp_login' };
    if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) return { status: 500, error: 'smtp_port' };
    // Supabase lässt keine Verbindungen über Port 25 und 587 zu
    if (smtpPort === 25 || smtpPort === 587) return { status: 500, error: 'smtp_port' };
  } else if (!key) return { status: 500, error: 'missing_resend_key' };
  const from = (deps.env('MAIL_FROM')?.trim() || (smtpHost && EMAIL.test(smtpUser) ? smtpUser : '')).trim();
  if (!from || !EMAIL.test(from)) return { status: 500, error: 'missing_mail_from' };
  return { smtpHost, smtpUser, smtpPass, smtpPort, key, from };
}

type Outgoing = {
  fromName: string;
  to: string[];
  replyTo: string | null;
  subject: string;
  text: string;
  attachments: { filename: string; content: string }[];
};

/** E-Mail verschicken -> ID beim Anbieter oder fertige Fehler-Antwort */
async function deliver(
  cfg: MailConfig,
  msg: Outgoing,
  deps: Deps,
  now: Date,
): Promise<{ id: string | null } | { response: Response }> {
  // Weg A: eigenes Postfach
  if (cfg.smtpHost) {
    if (!deps.connectTls) return { response: json(500, { error: 'smtp_unsupported' }) };
    const messageId = `<${crypto.randomUUID()}@${cfg.from.split('@')[1]}>`;
    const data = buildMime({
      fromName: msg.fromName,
      from: cfg.from,
      to: msg.to,
      replyTo: msg.replyTo,
      subject: msg.subject,
      text: msg.text,
      attachments: msg.attachments,
      date: now,
      messageId,
    });
    let conn: SmtpConn;
    try {
      conn = await deps.connectTls({ hostname: cfg.smtpHost, port: cfg.smtpPort });
    } catch (e) {
      console.error('SMTP connect', e);
      return {
        response: json(502, { error: 'smtp_connect_failed', detail: String((e as Error)?.message ?? e).slice(0, 200) }),
      };
    }
    try {
      await smtpSend(conn, {
        user: cfg.smtpUser,
        pass: cfg.smtpPass,
        from: cfg.from,
        to: msg.to,
        data,
        helo: cfg.from.split('@')[1],
        timeoutMs: deps.smtpTimeoutMs,
      });
    } catch (e) {
      const code = e instanceof SmtpError ? e.code : 'smtp_connect_failed';
      const detail = (e instanceof SmtpError ? e.detail : String((e as Error)?.message ?? e)).slice(0, 300);
      console.error('SMTP', code, detail);
      return { response: json(code === 'smtp_auth_failed' ? 500 : 502, { error: code, detail }) };
    }
    return { id: messageId };
  }

  // Weg B: Resend
  let res: Response;
  try {
    res = await deps.fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${msg.fromName} <${cfg.from}>`,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        ...(msg.attachments.length ? { attachments: msg.attachments } : {}),
      }),
    });
  } catch (error) {
    console.error('Resend', error);
    return { response: json(502, { error: 'send_error', detail: 'E-Mail-Dienst nicht erreichbar' }) };
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    console.error('Resend', res.status, detail);
    if (res.status === 401) return { response: json(500, { error: 'invalid_resend_key' }) };
    if (res.status === 403) return { response: json(500, { error: 'domain_not_verified', detail }) };
    if (res.status === 429) return { response: json(429, { error: 'rate_limited' }) };
    return { response: json(502, { error: 'send_error', status: res.status, detail }) };
  }
  return { id: ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null };
}

// ---------------------------------------------------------------------------
// Online-Widerruf (Skript 20261203090000_widerruf_online.sql, § 356a BGB):
// Der Kunde hat auf der Angebotsseite „Widerruf bestätigen“ getippt. Ohne
// Lunaxora-Anmeldung – Empfänger und Text kommen aber nur aus der Datenbank
// (über den geheimen Angebots-Link), höchstens 3 Versuche je Widerruf.
// ---------------------------------------------------------------------------

const OFFER_TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

type SellerInfo = {
  company_name?: string | null;
  owner_name?: string | null;
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type WithdrawalInfo = {
  number: string;
  issued_on?: string | null;
  accepted_at?: string | null;
  withdrawn_at: string;
  withdrawal: { name?: string; contract?: string; email?: string };
  seller?: SellerInfo | null;
};

/** Wortlaut der Erklärung – gleich wie auf der Angebotsseite (web-angebot/index.html) */
export function withdrawalStatement(contract: string): string {
  return `Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: ${contract}`;
}

/** "2026-11-23T13:05:00Z" -> "23.11.2026 um 14:05 Uhr" (deutsche Zeit) */
function dayTimeDe(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return `${day} um ${time} Uhr`;
}

/**
 * Eingangsbestätigung (§ 356a Abs. 4 BGB): Inhalt der Widerrufserklärung
 * (Name, Vertrag, E-Mail) sowie Datum und Uhrzeit des Eingangs.
 */
export function withdrawalMail(w: WithdrawalInfo) {
  const s = w.seller ?? {};
  const seller = String(s.company_name || s.owner_name || '').trim() || 'Ihr Auftragnehmer';
  const name = String(w.withdrawal?.name ?? '').trim();
  const contract = String(w.withdrawal?.contract ?? '').trim();
  const email = String(w.withdrawal?.email ?? '').trim();
  const contact = [
    s.street,
    [s.zip, s.city].filter(Boolean).join(' '),
    s.phone ? `Tel. ${s.phone}` : null,
    s.email ? `E-Mail ${s.email}` : null,
  ]
    .map((v) => (v ? String(v).trim() : ''))
    .filter(Boolean)
    .join(', ');
  return {
    fromName: seller,
    subject: `Eingangsbestätigung: Ihr Widerruf (Angebot ${w.number})`,
    text: [
      `Guten Tag ${name},`,
      '',
      `Ihr Widerruf ist bei ${seller} eingegangen.`,
      '',
      `Eingang: ${dayTimeDe(w.withdrawn_at)}`,
      '',
      'Ihre Widerrufserklärung:',
      `„${withdrawalStatement(contract)}“`,
      '',
      `Name: ${name}`,
      `Vertrag: ${contract}`,
      `E-Mail für diese Bestätigung: ${email}`,
      ...(w.accepted_at ? [`Angebot ${w.number} online angenommen am ${dayDe(w.accepted_at)}`] : []),
      '',
      `Eine Kopie dieser E-Mail geht an ${seller}.`,
      '',
      'Viele Grüße',
      seller,
      ...(contact ? [contact] : []),
    ].join('\n'),
  };
}

// ---------------------------------------------------------------------------
// Auftragsbestätigung nach der Online-Annahme (§ 312f Abs. 2 BGB)
// ---------------------------------------------------------------------------

type OfferItem = { description?: unknown; details?: unknown; quantity?: unknown; unit?: unknown; unit_price?: unknown };

export type AcceptanceInfo = {
  number: string;
  issued_on?: string | null;
  valid_until?: string | null;
  accepted_at: string;
  accepted_name?: string | null;
  accepted_email: string;
  data?: {
    buyer?: { name?: string | null; company?: string | null; address?: string | null } | null;
    items?: OfferItem[] | null;
    totals?: { discount_percent?: number; discount_amount?: number; net?: number; vat_rate?: number; vat_amount?: number; gross?: number } | null;
    small_business?: boolean;
    monthly?: boolean;
  } | null;
  seller?: SellerInfo | null;
};

const money = (v: unknown) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);
const num = (v: unknown) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 }).format(Number(v) || 0);
/** "2026-11-22" -> "22.11.2026" */
const dateDe = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

function sellerNameOf(s: SellerInfo): string {
  return String(s.company_name || s.owner_name || '').trim();
}

/** Gleich wie sellerContactLine in src/features/documents/document-logic.ts */
function contactLineOf(s: SellerInfo, withPhone = true): string {
  return [
    sellerNameOf(s),
    s.street,
    [s.zip, s.city].filter(Boolean).join(' '),
    withPhone && s.phone ? `Tel. ${s.phone}` : null,
    s.email ? `E-Mail ${s.email}` : null,
  ]
    .map((v) => (v ? String(v).trim() : ''))
    .filter(Boolean)
    .join(', ');
}

/**
 * Widerrufsbelehrung, Hinweis zum frühen Start und Muster-Formular – Wortlaut
 * wie withdrawalNotice / earlyStartHint / withdrawalForm in
 * src/features/documents/document-logic.ts (ein Test vergleicht beides).
 */
export function withdrawalTexts(s: SellerInfo) {
  const notice = [
    {
      heading: 'Widerrufsrecht',
      paragraphs: [
        'Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen.',
        'Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.',
        `Um Ihr Widerrufsrecht auszuüben, müssen Sie uns (${contactLineOf(s)}) mittels einer eindeutigen Erklärung (z. B. ein mit der Post versandter Brief oder eine E-Mail) über Ihren Entschluss, diesen Vertrag zu widerrufen, informieren. Sie können dafür das beigefügte Muster-Widerrufsformular verwenden, das jedoch nicht vorgeschrieben ist. Sie können Ihr Widerrufsrecht auch online unter dem Link zu diesem Angebot (Schaltfläche „Vertrag widerrufen“) ausüben. Wenn Sie diese Online-Funktion nutzen, übermitteln wir Ihnen auf einem dauerhaften Datenträger (z. B. durch eine E-Mail) unverzüglich eine Eingangsbestätigung mit Informationen zum Inhalt der Widerrufserklärung sowie dem Datum und der Uhrzeit ihres Eingangs.`,
        'Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung über die Ausübung des Widerrufsrechts vor Ablauf der Widerrufsfrist absenden.',
      ],
    },
    {
      heading: 'Folgen des Widerrufs',
      paragraphs: [
        'Wenn Sie diesen Vertrag widerrufen, haben wir Ihnen alle Zahlungen, die wir von Ihnen erhalten haben, einschließlich der Lieferkosten (mit Ausnahme der zusätzlichen Kosten, die sich daraus ergeben, dass Sie eine andere Art der Lieferung als die von uns angebotene, günstigste Standardlieferung gewählt haben), unverzüglich und spätestens binnen vierzehn Tagen ab dem Tag zurückzuzahlen, an dem die Mitteilung über Ihren Widerruf dieses Vertrags bei uns eingegangen ist. Für diese Rückzahlung verwenden wir dasselbe Zahlungsmittel, das Sie bei der ursprünglichen Transaktion eingesetzt haben, es sei denn, mit Ihnen wurde ausdrücklich etwas anderes vereinbart; in keinem Fall werden Ihnen wegen dieser Rückzahlung Entgelte berechnet.',
        'Haben Sie verlangt, dass die Dienstleistungen während der Widerrufsfrist beginnen soll, so haben Sie uns einen angemessenen Betrag zu zahlen, der dem Anteil der bis zu dem Zeitpunkt, zu dem Sie uns von der Ausübung des Widerrufsrechts hinsichtlich dieses Vertrags unterrichten, bereits erbrachten Dienstleistungen im Vergleich zum Gesamtumfang der im Vertrag vorgesehenen Dienstleistungen entspricht.',
      ],
    },
  ];
  const who = sellerNameOf(s) || 'Ihr Auftragnehmer';
  const early = s.email
    ? `Soll ${who} schon vor Ablauf der Widerrufsfrist anfangen? Dann schreiben Sie das bitte ausdrücklich per E-Mail an ${s.email}.`
    : `Soll ${who} schon vor Ablauf der Widerrufsfrist anfangen? Dann teilen Sie das bitte ausdrücklich schriftlich mit, zum Beispiel per E-Mail.`;
  const form = [
    '(Wenn Sie den Vertrag widerrufen wollen, dann füllen Sie bitte dieses Formular aus und senden Sie es zurück.)',
    `– An ${contactLineOf(s, false)}:`,
    '– Hiermit widerrufe(n) ich/wir (*) den von mir/uns (*) abgeschlossenen Vertrag über den Kauf der folgenden Waren (*)/die Erbringung der folgenden Dienstleistung (*)',
    '– Bestellt am (*)/erhalten am (*)',
    '– Name des/der Verbraucher(s)',
    '– Anschrift des/der Verbraucher(s)',
    '– Unterschrift des/der Verbraucher(s) (nur bei Mitteilung auf Papier)',
    '– Datum',
    '(*) Unzutreffendes streichen.',
  ];
  return { notice, early, form };
}

/** Auftragsbestätigung: Vertragsinhalt, bei Privatkunden mit Widerrufsbelehrung und Formular */
export function acceptanceMail(a: AcceptanceInfo, link: string | null) {
  const s = a.seller ?? {};
  const seller = sellerNameOf(s) || 'Ihr Auftragnehmer';
  const d = a.data ?? {};
  const b = d.buyer ?? {};
  const t = d.totals ?? {};
  const items = Array.isArray(d.items) ? d.items : [];
  const privateBuyer = !String(b.company ?? '').trim();
  const name = String(a.accepted_name || b.name || '').trim();
  const lines: string[] = [
    `Guten Tag ${name},`,
    '',
    `vielen Dank für Ihren Auftrag! Sie haben das Angebot ${a.number}${a.issued_on ? ` vom ${dateDe(a.issued_on)}` : ''} am ${dayTimeDe(a.accepted_at)} online angenommen. Damit ist der Vertrag zustande gekommen. Hier ist Ihre Bestätigung mit dem Vertragsinhalt.`,
    '',
    `Auftragnehmer: ${contactLineOf(s)}`,
    `Auftraggeber: ${[b.company, b.name, b.address].map((v) => String(v ?? '').trim()).filter(Boolean).join(', ')}`,
    '',
    'Leistungen:',
  ];
  items.forEach((it, i) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unit_price) || 0;
    lines.push(`${i + 1}. ${String(it.description ?? '').trim()} – ${num(qty)} ${String(it.unit ?? '').trim()} × ${money(price)} = ${money(qty * price)}`);
    if (it.details) lines.push(`   ${String(it.details).trim()}`);
  });
  lines.push('');
  if (Number(t.discount_amount) > 0) lines.push(`Rabatt ${num(t.discount_percent)} %: – ${money(t.discount_amount)}`);
  if (!d.small_business) {
    lines.push(`Netto: ${money(t.net)}`);
    lines.push(`zzgl. ${num(t.vat_rate)} % USt: ${money(t.vat_amount)}`);
  }
  lines.push(`${d.monthly ? 'Gesamt pro Monat' : 'Gesamt'}: ${money(t.gross)}`);
  if (d.small_business) lines.push('Gemäß § 19 UStG von der Umsatzsteuer befreit (Kleinunternehmerregelung).');
  if (link) lines.push('', `Das Angebot online: ${link}`);

  if (privateBuyer) {
    const w = withdrawalTexts(s);
    lines.push('', '———', '', 'WIDERRUFSBELEHRUNG');
    for (const sec of w.notice) lines.push('', sec.heading, '', ...sec.paragraphs.flatMap((p) => [p, '']).slice(0, -1));
    lines.push('', w.early, '', '———', '', 'MUSTER-WIDERRUFSFORMULAR', '', ...w.form);
  }
  const contact = contactLineOf({ ...s, company_name: null, owner_name: null });
  lines.push('', '———', '', `Eine Kopie dieser E-Mail geht an ${seller}.`, '', 'Viele Grüße', seller, ...(contact ? [contact] : []));
  return {
    fromName: seller,
    subject: `Auftragsbestätigung: Angebot ${a.number}`,
    text: lines.join('\n'),
  };
}

/**
 * Kunden-Mail ohne Anmeldung: Daten mit dem Server-Schlüssel über den geheimen
 * Angebots-Link holen (zählt einen Versuch), verschicken, als verschickt vermerken.
 */
async function sendCustomerMail(
  body: Body,
  deps: Deps,
  o: {
    claim: string;
    mailed: string;
    missing: string;
    recipient: (info: Record<string, unknown>) => string;
    build: (info: Record<string, unknown>, token: string) => { fromName: string; subject: string; text: string };
  },
): Promise<Response> {
  const url = deps.env('SUPABASE_URL');
  const db = serviceHeaders(deps);
  if (!url || !db) return json(500, { error: 'missing_config' });
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!OFFER_TOKEN.test(token)) return json(400, { error: 'invalid_token' });
  const cfg = mailConfig(deps);
  if ('error' in cfg) return json(cfg.status, { error: cfg.error });

  const claim = await deps
    .fetch(`${url}/rest/v1/rpc/${o.claim}`, { method: 'POST', headers: db, body: JSON.stringify({ p_token: token }) })
    .catch(() => null);
  if (!claim?.ok) {
    const detail = claim ? (await claim.text().catch(() => '')).slice(0, 300) : 'unreachable';
    if (claim && (claim.status === 404 || /PGRST202|42883/.test(detail))) return json(500, { error: o.missing });
    console.error(o.claim, claim?.status, detail);
    return json(502, { error: 'claim_error', detail });
  }
  const info = (await claim.json().catch(() => null)) as (Record<string, unknown> & { error?: string; seller?: SellerInfo | null }) | null;
  if (!info) return json(502, { error: 'claim_error' });
  if (info.error) return json(info.error === 'not_found' ? 404 : 409, { error: info.error });

  const to = o.recipient(info).trim();
  if (!EMAIL.test(to) || to.length > 320) return json(400, { error: 'invalid_to' });
  // Kopie an die E-Mail aus den Firmendaten (nie an eine Adresse aus dem Angebot)
  const sellerMail = String(info.seller?.email ?? '').trim();
  const copy = EMAIL.test(sellerMail) && sellerMail.toLowerCase() !== to.toLowerCase() ? [sellerMail] : [];
  const m = o.build(info, token);
  const sent = await deliver(
    cfg,
    { fromName: cleanName(m.fromName), to: [to, ...copy], replyTo: copy[0] ?? null, subject: m.subject, text: m.text, attachments: [] },
    deps,
    deps.now?.() ?? new Date(),
  );
  if ('response' in sent) return sent.response;

  // vermerken (Fehler hier ändern nichts mehr am Versand)
  const marked = await deps
    .fetch(`${url}/rest/v1/rpc/${o.mailed}`, { method: 'POST', headers: db, body: JSON.stringify({ p_token: token }) })
    .catch((e) => e);
  if (!(marked instanceof Response) || !marked.ok) console.error(o.mailed, marked);
  return json(200, { ok: true, id: sent.id, to: [to, ...copy] });
}

function handleWithdrawal(body: Body, deps: Deps): Promise<Response> {
  return sendCustomerMail(body, deps, {
    claim: 'offer_withdrawal_mail',
    mailed: 'offer_withdrawal_mailed',
    missing: 'missing_withdrawal_function',
    recipient: (info) => String((info as unknown as WithdrawalInfo).withdrawal?.email ?? ''),
    build: (info) => withdrawalMail(info as unknown as WithdrawalInfo),
  });
}

function handleAcceptance(body: Body, deps: Deps): Promise<Response> {
  const base = (deps.env('OFFER_URL')?.trim() || 'https://lunaxora.de/Angebot').replace(/\/+$/, '');
  return sendCustomerMail(body, deps, {
    claim: 'offer_acceptance_mail',
    mailed: 'offer_acceptance_mailed',
    missing: 'missing_acceptance_function',
    recipient: (info) => String(info.accepted_email ?? ''),
    build: (info, token) => acceptanceMail(info as unknown as AcceptanceInfo, `${base}/?angebot=${encodeURIComponent(token)}`),
  });
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let parsed: Body | null;
  try {
    parsed = await req.json();
  } catch {
    parsed = null;
  }
  // Eingangsbestätigung für den Online-Widerruf: kommt vom Kunden, ohne Lunaxora-Anmeldung
  if (parsed && typeof parsed === 'object' && parsed.kind === 'withdrawal') return handleWithdrawal(parsed, deps);
  // Auftragsbestätigung nach der Online-Annahme: ebenfalls vom Kunden
  if (parsed && typeof parsed === 'object' && parsed.kind === 'acceptance') return handleAcceptance(parsed, deps);

  // Angemeldet? (Prüfung beim Supabase-Auth-Server)
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey');
  const url = deps.env('SUPABASE_URL');
  if (!auth?.startsWith('Bearer ') || !apikey || !url) return json(401, { error: 'not_signed_in' });
  const userRes = await deps.fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!userRes.ok) return json(401, { error: 'not_signed_in' });
  const user = (await userRes.json().catch(() => ({}))) as { id?: string; email?: string };

  if (!parsed || typeof parsed !== 'object') return json(400, { error: 'invalid_body' });
  const body: Body = parsed;
  const isInvite = body.kind === 'invite';
  const db = { Authorization: auth, apikey, 'Content-Type': 'application/json', ...companyHeader(req) };

  // Datenschutz-Link: Empfänger und Text aus der Einladung des Nutzers (RLS)
  let invite: { email: string; token: string; expires_at: string } | null = null;
  if (isInvite) {
    const id = typeof body.invite_id === 'string' && UUID.test(body.invite_id) ? body.invite_id : null;
    if (!id) return json(400, { error: 'invalid_invite' });
    const invRes = await deps.fetch(
      `${url}/rest/v1/customer_invites?id=eq.${id}&select=email,token,expires_at,completed_at`,
      { headers: db },
    );
    if (!invRes.ok) {
      const detail = (await invRes.text().catch(() => '')).slice(0, 300);
      if (invRes.status === 404 || /PGRST205|42P01/.test(detail)) return json(500, { error: 'missing_invite_table' });
      console.error('customer_invites', invRes.status, detail);
      return json(502, { error: 'invite_error', detail });
    }
    const rows = ((await invRes.json().catch(() => [])) as { email: string; token: string; expires_at: string; completed_at: string | null }[]) ?? [];
    const row = rows[0];
    if (!row) return json(404, { error: 'invite_not_found' });
    if (row.completed_at) return json(409, { error: 'invite_done' });
    invite = row;
  }
  const checked = invite
    ? ((inv: { email: string; token: string; expires_at: string }) => {
        const fromName = cleanName(body.from_name);
        const base = deps.env('INVITE_URL')?.trim() || 'https://lunaxora.de/Kunde';
        const m = inviteMail({ fromName, token: inv.token, expiresAt: inv.expires_at, base });
        const replyTo = typeof body.reply_to === 'string' && EMAIL.test(body.reply_to.trim()) ? body.reply_to.trim() : null;
        return {
          to: [inv.email],
          subject: m.subject,
          text: m.text,
          replyTo,
          kind: 'invite',
          documentId: null,
          attachments: [] as { filename: string; content: string }[],
          fromName,
        };
      })(invite)
    : validate(body);
  if ('error' in checked) return json(400, { error: checked.error });
  const msg = checked;

  // Weg A: eigenes Postfach (SMTP), Weg B: Resend
  const cfg = mailConfig(deps);
  if ('error' in cfg) return json(cfg.status, { error: cfg.error });
  const svc = serviceHeaders(deps);
  if (!svc) return json(500, { error: 'missing_service_key' });

  // Für welche Firma? (Kopfzeile x-lunaxora-company, geprüft in der Datenbank)
  const wsRes = await deps
    .fetch(`${url}/rest/v1/rpc/nexora_workspace`, { method: 'POST', headers: db, body: '{}' })
    .catch(() => null);
  const company = wsRes?.ok ? await wsRes.json().catch(() => null) : null;
  if (typeof company !== 'string' || !UUID.test(company)) {
    console.error('nexora_workspace', wsRes?.status);
    return json(502, { error: 'workspace_error' });
  }

  // Recht im Team: Dokumente (Datenschutz-Link und Bewertungen: Kunden)
  const area = msg.kind === 'invite' || msg.kind === 'review' ? 'kunden' : 'dokumente';
  const mayRes = await deps
    .fetch(`${url}/rest/v1/rpc/nexora_may`, { method: 'POST', headers: db, body: JSON.stringify({ p_area: area, p_level: 'write' }) })
    .catch(() => null);
  if (mayRes?.ok) {
    if ((await mayRes.json().catch(() => null)) !== true) return json(403, { error: 'role_forbidden', area });
  } else if (!mayRes || mayRes.status !== 404) {
    // 404 = Team-Skript fehlt (dann gibt es auch keine Rollen)
    return json(502, { error: 'role_check_error' });
  }

  // Nur mit Pro (Testphase mit kleinerer Bremse). Der Datenschutz-Link geht in jedem Abo.
  let trial = false;
  if (!isInvite) {
    const planRes = await deps
      .fetch(`${url}/rest/v1/rpc/my_plan`, { method: 'POST', headers: db, body: '{}' })
      .catch(() => null);
    if (planRes?.ok) {
      const info = (await planRes.json().catch(() => null)) as { plan?: string } | null;
      if (!info?.plan || info.plan === 'free') return json(402, { error: 'pro_required' });
      trial = info.plan === 'trial';
    } else if (!planRes || planRes.status !== 404) {
      return json(502, { error: 'plan_error' });
    }
  }

  // Dokument muss zur Firma gehören (sonst zählt das Protokoll nicht)
  if (msg.documentId) {
    const docRes = await deps
      .fetch(`${url}/rest/v1/documents?id=eq.${msg.documentId}&user_id=eq.${company}&select=id`, { headers: svc })
      .catch(() => null);
    if (!docRes?.ok) return json(502, { error: 'log_error' });
    const rows = ((await docRes.json().catch(() => [])) as unknown[]) ?? [];
    if (!rows.length) return json(400, { error: 'invalid_document' });
  }

  // Bremse: Wie viele E-Mails hat die Firma in der letzten Stunde / am letzten Tag verschickt?
  const now = deps.now?.() ?? new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const logRes = await deps
    .fetch(`${url}/rest/v1/email_log?select=created_at&user_id=eq.${company}&created_at=gte.${encodeURIComponent(since)}`, {
      headers: svc,
    })
    .catch(() => null);
  if (!logRes?.ok) {
    const detail = logRes ? (await logRes.text().catch(() => '')).slice(0, 300) : 'unreachable';
    if (logRes && (logRes.status === 404 || /PGRST205|42P01/.test(detail))) return json(500, { error: 'missing_log_table' });
    console.error('email_log', logRes?.status, detail);
    return json(502, { error: 'log_error', detail });
  }
  const sent = ((await logRes.json().catch(() => [])) as { created_at: string }[]) ?? [];
  const hourAgo = now.getTime() - 60 * 60 * 1000;
  if (sent.length >= (trial ? PER_DAY_TRIAL : PER_DAY)) return json(429, { error: 'too_many_today', trial });
  if (sent.filter((s) => new Date(s.created_at).getTime() >= hourAgo).length >= (trial ? PER_HOUR_TRIAL : PER_HOUR))
    return json(429, { error: 'too_many_this_hour', trial });

  // Erst ins Protokoll, dann verschicken – klappt das Protokoll nicht, geht nichts raus
  const logged = await deps
    .fetch(`${url}/rest/v1/email_log`, {
      method: 'POST',
      headers: { ...svc, Prefer: 'return=representation' },
      body: JSON.stringify({
        user_id: company,
        document_id: msg.documentId,
        kind: msg.kind,
        to_email: msg.to.join(', ').slice(0, 320),
        subject: msg.subject,
      }),
    })
    .catch(() => null);
  const logId = logged?.ok ? (((await logged.json().catch(() => [])) as { id?: string }[])[0]?.id ?? null) : null;
  if (!logged?.ok) {
    console.error('email_log insert', logged?.status, logged ? (await logged.text().catch(() => '')).slice(0, 300) : 'unreachable');
    return json(502, { error: 'log_error' });
  }

  // Verschicken
  const delivered = await deliver(
    cfg,
    {
      fromName: msg.fromName,
      to: msg.to,
      replyTo: msg.replyTo ?? user.email ?? null,
      subject: msg.subject,
      text: msg.text,
      attachments: msg.attachments,
    },
    deps,
    now,
  );
  const logUrl = logId && UUID.test(logId) ? `${url}/rest/v1/email_log?id=eq.${logId}` : null;
  if ('response' in delivered) {
    // nicht verschickt -> Eintrag wieder raus (zählt nicht, steht nicht in der Liste)
    if (logUrl) await deps.fetch(logUrl, { method: 'DELETE', headers: svc }).catch(() => null);
    return delivered.response;
  }
  const providerId = delivered.id;
  if (logUrl && providerId) {
    const marked = await deps
      .fetch(logUrl, { method: 'PATCH', headers: { ...svc, Prefer: 'return=minimal' }, body: JSON.stringify({ provider_id: providerId }) })
      .catch((e) => e);
    if (!(marked instanceof Response) || !marked.ok) console.error('email_log provider_id', marked);
  }

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
