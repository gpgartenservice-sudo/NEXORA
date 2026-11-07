/**
 * Lunaxora – Warteliste auf der Website (Supabase Edge Function "waitlist")
 *
 * Besucher von lunaxora.de tragen ihre E-Mail-Adresse ein und bekommen eine E-Mail
 * von emails@lunaxora.de mit "Platz bestätigen" (Double-Opt-in). Erst nach dem Klick
 * stehen sie auf der Warteliste; die ersten 20 bestätigten Plätze bekommen 3 Monate
 * Pro kostenlos. In jeder E-Mail steht ein Link zum Austragen (löscht den Eintrag).
 *
 * Anfragen (ohne Anmeldung – in den Einstellungen der Funktion "Verify JWT" ausschalten):
 *   GET                                   -> { bonus_left, bonus_slots }   (Anzeige "noch X Plätze")
 *   POST { action: 'join', email, hp, ms } -> { ok: true }                  (E-Mail zum Bestätigen)
 *   POST { action: 'confirm', token }      -> { ok, place, bonus, slots }  (Klick in der E-Mail)
 *   POST { action: 'leave', token }        -> { ok: true, removed }         (Austragen)
 *   POST ?leave=<token> (One-Click-Abmeldung aus dem Mailprogramm, RFC 8058)
 *   GET  ?leave=<token> -> Weiterleitung zur Website (#austragen=…), die vor dem Löschen fragt
 *   hp = verstecktes Feld (Bots füllen es aus), ms = Millisekunden seit dem Öffnen des Formulars.
 *
 * Datenbank: Skript supabase/migrations/20261117090000_waitlist.sql.
 * Einrichtung: supabase/README.md, Abschnitt "Warteliste auf der Website".
 * Geheimnisse (Supabase -> Edge Functions -> Secrets):
 *   WAITLIST_SMTP_USER   Benutzername des Postfachs emails@lunaxora.de (bei webgo: Adresse oder Postfachname wie web123p1)
 *   WAITLIST_SMTP_PASS   Passwort dieses Postfachs
 *   WAITLIST_SMTP_HOST   Postausgangsserver (ohne: SMTP_HOST der Funktion "mail")
 *   WAITLIST_SMTP_PORT   465 (Standard; Supabase erlaubt keine Verbindungen über 25 und 587)
 *   WAITLIST_FROM        Absender emails@lunaxora.de (nur nötig, wenn WAITLIST_SMTP_USER keine E-Mail-Adresse ist)
 *   WAITLIST_PAGE_URL    Adresse der Website (Standard: https://lunaxora.de/)
 *   WAITLIST_IMPRINT     Anbieter-Angaben für den Fuß jeder E-Mail (z. B. Name · Straße · Ort)
 *   Statt SMTP auch Resend: RESEND_API_KEY + WAITLIST_FROM (Absender auf der bei Resend bestätigten Domain).
 *   WAITLIST_SECRET_KEY  nur nötig, wenn die Funktion "db_key" meldet: ein Secret Key
 *                        (Project Settings -> API Keys). Sonst nimmt sie SUPABASE_SERVICE_ROLE_KEY.
 */

const RESEND_URL = 'https://api.resend.com/emails';
/** Fassung des Hinweises im Formular – wird beim Eintragen als Nachweis gespeichert */
export const CONSENT = 'website-2026-11-07';
/** Bots schicken das Formular schneller ab, als ein Mensch tippt */
const MIN_FILL_MS = 1500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } });

export const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;
/** 32 zufällige Bytes als base64url = 43 Zeichen */
export const TOKEN = /^[A-Za-z0-9_-]{43}$/;

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
  /** Zufall für die Links (Tests: fest) */
  randomBytes?: (n: number) => Uint8Array;
  /** Arbeit nach der Antwort zu Ende bringen (Supabase: EdgeRuntime.waitUntil; Tests: ohne = abwarten) */
  waitUntil?: (p: Promise<unknown>) => void;
  /** Höchstdauer für eine E-Mail beim Eintragen (die Website bricht nach 15 s ab) */
  mailDeadlineMs?: number;
};

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** Datenbank und Website – reicht für Anzeige und Austragen */
type Base = { dbUrl: string; dbKey: string; page: string; leaveUrl: string };
/** E-Mail-Versand – nur fürs Eintragen und die Willkommens-E-Mail */
type MailCfg = {
  mode: 'smtp' | 'resend';
  host: string;
  port: number;
  user: string;
  pass: string;
  resendKey: string;
  from: string;
  imprint: string;
};
type Config = Base & MailCfg;

export function readBase(env: Deps['env']): Base | { error: string } {
  const v = (k: string) => env(k)?.trim() ?? '';
  const dbUrl = v('SUPABASE_URL').replace(/\/+$/, '');
  const dbKey = v('WAITLIST_SECRET_KEY') || v('SUPABASE_SERVICE_ROLE_KEY');
  if (!dbUrl || !dbKey) return { error: 'db_key' };
  let page = v('WAITLIST_PAGE_URL') || 'https://lunaxora.de/';
  page = page.split('#')[0];
  if (!/^https?:\/\/[^\s"'<>]+$/.test(page)) return { error: 'page_url' };
  return { dbUrl, dbKey, page, leaveUrl: `${dbUrl}/functions/v1/waitlist` };
}

export function readMail(env: Deps['env']): MailCfg | { error: string } {
  const v = (k: string) => env(k)?.trim() ?? '';
  const host = v('WAITLIST_SMTP_HOST') || v('SMTP_HOST');
  const user = v('WAITLIST_SMTP_USER');
  const pass = env('WAITLIST_SMTP_PASS') ?? '';
  const port = Number(v('WAITLIST_SMTP_PORT') || 465);
  const resendKey = v('RESEND_API_KEY');
  // SMTP, sobald ein Postfach für die Warteliste eingetragen ist – sonst Resend
  const mode = user || pass ? 'smtp' : resendKey ? 'resend' : null;
  if (!mode) return { error: 'missing_mail_login' };
  if (mode === 'smtp') {
    if (!host || !user || !pass) return { error: 'missing_mail_login' };
    if (!Number.isInteger(port) || port < 1 || port > 65535 || port === 25 || port === 587) return { error: 'smtp_port' };
  }
  const from = v('WAITLIST_FROM') || (mode === 'smtp' && EMAIL.test(user) ? user : '');
  if (from.length > 254 || !EMAIL.test(from)) return { error: 'missing_mail_from' };

  return {
    mode,
    host,
    port,
    user,
    pass,
    resendKey,
    from,
    imprint: v('WAITLIST_IMPRINT')
      .replace(/[\r\n]+/g, ' · ')
      .slice(0, 300),
  };
}

/** Alles zusammen (Datenbank, Website, Versand) */
export function readConfig(env: Deps['env']): Config | { error: string } {
  const base = readBase(env);
  if ('error' in base) return base;
  const mail = readMail(env);
  if ('error' in mail) return mail;
  return { ...base, ...mail };
}

/**
 * E-Mail-Adresse prüfen und vereinheitlichen: klein geschrieben, Domain mit Umlauten als
 * Punycode (bäckerei.de -> xn--bckerei-…), lokaler Teil nur ASCII. null = ungültig.
 */
export function normEmail(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 320) return null;
  const s = raw.trim().toLowerCase();
  const at = s.lastIndexOf('@');
  if (at < 1 || s.length > 254) return null;
  const local = s.slice(0, at);
  const dom = s.slice(at + 1);
  if (!/^[\x21-\x7e]+$/.test(local) || /[@<>()",;:\\[\]]/.test(local)) return null;
  if (!/^[\p{L}\p{N}\p{M}-]+(\.[\p{L}\p{N}\p{M}-]+)+$/u.test(dom)) return null;
  let host: string;
  try {
    host = new URL(`http://${dom}`).hostname;
  } catch {
    return null;
  }
  const email = `${local}@${host}`;
  if (email.length > 254 || !/^[a-z0-9.-]+$/.test(host) || !EMAIL.test(email)) return null;
  return email;
}

/** Fingerabdruck des Internet-Anschlusses (nicht umkehrbar, mit geheimem Salz) */
async function ipHash(req: Request, salt: string): Promise<string | null> {
  const h = req.headers;
  const ip = (h.get('cf-connecting-ip') || h.get('x-real-ip') || (h.get('x-forwarded-for') ?? '').split(',')[0]).trim();
  if (!ip) return null;
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(`${salt}|lunaxora-waitlist|${ip}`)));
  return [...d.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// Datenbank (nur über die Funktionen aus dem SQL-Skript)
// ---------------------------------------------------------------------------

async function rpc<T>(deps: Deps, cfg: Base, name: string, args: Record<string, unknown>): Promise<T> {
  const headers: Record<string, string> = { apikey: cfg.dbKey, 'Content-Type': 'application/json' };
  // alter service_role-Schlüssel ist ein JWT; neue Secret Keys (sb_secret_…) gehen nur als apikey
  if (cfg.dbKey.startsWith('eyJ')) headers.Authorization = `Bearer ${cfg.dbKey}`;
  const res = await deps.fetch(`${cfg.dbUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    const err = new Error(`${name} ${res.status} ${detail}`) as Error & { code: string };
    err.code =
      res.status === 401 || res.status === 403
        ? 'db_key'
        : res.status === 404 || /PGRST202|42883/.test(detail)
          ? 'missing_sql'
          : 'db_error';
    throw err;
  }
  return (await res.json()) as T;
}

type JoinRow = {
  o_action: 'confirm' | 'already' | 'throttled' | 'ip_limit' | 'busy';
  o_token: string | null;
  o_place: number | null;
  o_bonus: boolean | null;
  o_bonus_left: number;
  o_slots: number;
};
type ConfirmRow = { o_email: string; o_place: number; o_bonus: boolean; o_new: boolean; o_slots: number };
type StatsRow = { o_bonus_left: number; o_bonus_slots: number };

// ---------------------------------------------------------------------------
// E-Mail-Texte
// ---------------------------------------------------------------------------

export type Mail = { subject: string; text: string; html: string };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Text + HTML aus Absätzen; {button} wird im HTML zum Knopf, im Text zur Zeile mit Link */
function compose(o: {
  subject: string;
  paras: string[];
  button?: { label: string; url: string };
  leave: string;
  imprint: string;
}): Mail {
  const sign = 'Viele Grüße\nDein LUNAXORA-Team';
  const foot = [
    'LUNAXORA · lunaxora.de',
    ...(o.imprint ? [o.imprint] : []),
    `Du willst keine E-Mails mehr von uns? Austragen: ${o.leave}`,
  ];
  const text = [
    'Hallo,',
    '',
    ...o.paras.flatMap((p) =>
      p === '{button}' && o.button ? [`${o.button.label}: ${o.button.url}`, ''] : p === '{button}' ? [] : [p, ''],
    ),
    sign,
    '',
    '—',
    ...foot,
  ].join('\n');

  const P = 'margin:0 0 16px;font-size:16px;line-height:1.6;color:#1c1c1e';
  const body = o.paras
    .map((p) =>
      p === '{button}' && o.button
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:10px;background:#2fe39a"><a href="${esc(o.button.url)}" style="display:inline-block;padding:14px 26px;font-size:16px;font-weight:700;color:#000000;text-decoration:none;border-radius:10px">${esc(o.button.label)}</a></td></tr></table>`
        : p === '{button}'
          ? ''
          : `<p style="${P}">${esc(p)}</p>`,
    )
    .join('');
  const html =
    '<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<title>${esc(o.subject)}</title></head>` +
    '<body style="margin:0;padding:0;background:#f2f2f4">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f4"><tr><td align="center" style="padding:28px 14px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px">' +
    '<tr><td style="padding:28px 28px 8px;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif">' +
    '<div style="margin:0 0 22px;font-size:18px;font-weight:800;letter-spacing:3px;color:#000000">LUNAXORA</div>' +
    `<p style="${P}">Hallo,</p>${body}` +
    `<p style="${P}">Viele Grüße<br>Dein LUNAXORA-Team</p>` +
    '</td></tr><tr><td style="padding:16px 28px 26px;border-top:1px solid #e5e5ea;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6e6e73">' +
    'LUNAXORA · lunaxora.de' +
    (o.imprint ? `<br>${esc(o.imprint)}` : '') +
    `<br>Du willst keine E-Mails mehr von uns? <a href="${esc(o.leave)}" style="color:#6e6e73">Austragen</a>` +
    '</td></tr></table></td></tr></table></body></html>';
  return { subject: o.subject, text, html };
}

export function confirmMail(o: { link: string; leave: string; imprint: string; bonusLeft: number; slots: number }): Mail {
  return compose({
    subject: 'Bitte bestätige deinen Platz auf der Warteliste',
    paras: [
      'schön, dass du bei LUNAXORA dabei sein willst! Bitte bestätige deine E-Mail-Adresse – erst dann stehst du auf der Warteliste:',
      '{button}',
      ...(o.bonusLeft > 0
        ? [`Die ersten ${o.slots} bestätigten Plätze bekommen 3 Monate Pro kostenlos – also am besten gleich bestätigen.`]
        : []),
      'Du hast dich nicht eingetragen? Dann ignoriere diese E-Mail einfach. Ohne Bestätigung löschen wir deine Adresse nach 30 Tagen.',
    ],
    button: { label: 'Platz bestätigen', url: o.link },
    leave: o.leave,
    imprint: o.imprint,
  });
}

const bonusLine = (bonus: boolean, slots: number) =>
  bonus
    ? `Du gehörst zu den ersten ${slots}: Für dich sind 3 Monate Pro kostenlos reserviert. Registrier dich zum Start einfach mit dieser E-Mail-Adresse in der App – dann schalten wir dir Pro frei.`
    : 'Die Plätze mit 3 Monaten Pro sind leider schon vergeben. Zum Start kannst du trotzdem 14 Tage alle Pro-Funktionen kostenlos testen.';

export function welcomeMail(o: { place: number; bonus: boolean; slots: number; leave: string; imprint: string }): Mail {
  return compose({
    subject: `Du bist auf der Warteliste – Platz ${o.place}`,
    paras: [
      `du hast es geschafft: Du stehst auf der Warteliste von LUNAXORA – auf Platz ${o.place}.`,
      bonusLine(o.bonus, o.slots),
      'Sobald LUNAXORA für iPhone, Android und Mac erscheint, schreiben wir dir.',
    ],
    leave: o.leave,
    imprint: o.imprint,
  });
}

export function alreadyMail(o: { place: number; bonus: boolean; slots: number; leave: string; imprint: string }): Mail {
  return compose({
    subject: 'Du stehst schon auf der Warteliste',
    paras: [
      `du stehst schon auf der Warteliste von LUNAXORA – auf Platz ${o.place}. Du musst nichts weiter tun.`,
      bonusLine(o.bonus, o.slots),
      'Sobald LUNAXORA für iPhone, Android und Mac erscheint, schreiben wir dir.',
    ],
    leave: o.leave,
    imprint: o.imprint,
  });
}

// ---------------------------------------------------------------------------
// E-Mail zusammenbauen (MIME) und verschicken (SMTP oder Resend)
// ---------------------------------------------------------------------------

const utf8 = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64url = (bytes: Uint8Array) => base64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

export function buildMime(m: {
  from: string;
  to: string;
  mail: Mail;
  unsubscribe: string;
  date: Date;
  messageId: string;
}): string {
  const boundary = `lx-${m.messageId.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;
  const part = (type: string, content: string) => [
    `--${boundary}`,
    `Content-Type: ${type}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64(utf8.encode(content.replace(/\r?\n/g, '\r\n')))),
  ];
  return [
    `From: "Lunaxora" <${m.from}>`,
    `To: ${m.to}`,
    `Subject: ${encodeWord(m.mail.subject)}`,
    `Date: ${m.date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${m.messageId}`,
    `List-Unsubscribe: <${m.unsubscribe}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    ...part('text/plain', m.mail.text),
    ...part('text/html', m.mail.html),
    `--${boundary}--`,
    '',
  ].join('\r\n');
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

type SendCtl = { conn?: SmtpConn; ac: AbortController };

/** Verschickt eine E-Mail, höchstens ms lang (danach Verbindung zu); wirft bei Fehlern (Code in .code) */
function sendMailWithin(ms: number, deps: Deps, cfg: Config, to: string, mail: Mail, token: string): Promise<void> {
  const ctl: SendCtl = { ac: new AbortController() };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ctl.ac.abort();
      try {
        ctl.conn?.close();
      } catch {
        // schon zu
      }
      reject(new SmtpError('smtp_timeout', `länger als ${ms} ms`));
    }, ms);
  });
  const sending = sendMail(deps, cfg, to, mail, token, ctl);
  sending.catch(() => null); // nach Ablauf der Frist nicht mehr gefragt
  return Promise.race([sending, late]).finally(() => clearTimeout(timer));
}

/** Verschickt eine E-Mail; wirft bei Fehlern (Code in .code) */
async function sendMail(deps: Deps, cfg: Config, to: string, mail: Mail, token: string, ctl?: SendCtl): Promise<void> {
  const unsubscribe = `${cfg.leaveUrl}?leave=${token}`;
  if (cfg.mode === 'smtp') {
    if (!deps.connectTls) throw new SmtpError('smtp_unsupported');
    const messageId = `<${crypto.randomUUID()}@${cfg.from.split('@')[1]}>`;
    const data = buildMime({ from: cfg.from, to, mail, unsubscribe, date: deps.now?.() ?? new Date(), messageId });
    const conn = await deps.connectTls({ hostname: cfg.host, port: cfg.port }).catch((e) => {
      throw new SmtpError('smtp_connect_failed', String((e as Error)?.message ?? e).slice(0, 200));
    });
    if (ctl) {
      ctl.conn = conn;
      if (ctl.ac.signal.aborted) {
        try {
          conn.close();
        } catch {
          // schon zu
        }
        throw new SmtpError('smtp_timeout');
      }
    }
    await smtpSend(conn, {
      user: cfg.user,
      pass: cfg.pass,
      from: cfg.from,
      to: [to],
      data,
      helo: cfg.from.split('@')[1],
      timeoutMs: deps.smtpTimeoutMs,
    });
    return;
  }
  const res = await deps.fetch(RESEND_URL, {
    method: 'POST',
    signal: ctl?.ac.signal,
    headers: { Authorization: `Bearer ${cfg.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Lunaxora <${cfg.from}>`,
      to: [to],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      headers: { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!res.ok) throw new SmtpError('send_error', `Resend ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

// ---------------------------------------------------------------------------
// Anfragen
// ---------------------------------------------------------------------------

/** Body lesen, höchstens max Bytes (auch ohne bzw. mit falscher Content-Length); null = zu groß */
async function readCapped(req: Request, max = 4096): Promise<string | null> {
  if (Number(req.headers.get('content-length')) > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) {
      await reader.cancel().catch(() => null);
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

const link = (cfg: Base, what: 'bestaetigen' | 'austragen', token: string) => `${cfg.page}#${what}=${token}`;

function fail(e: unknown): Response {
  const code = (e as { code?: string })?.code ?? 'error';
  console.error('waitlist', code, String((e as Error)?.message ?? e).slice(0, 300));
  if (code === 'db_key' || code === 'missing_sql') return json(500, { error: code });
  if (code.startsWith('smtp_') || code === 'send_error') return json(502, { error: 'mail_failed' });
  return json(502, { error: 'server_error' });
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET' && req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const base = readBase(deps.env);
  if ('error' in base) {
    console.error('waitlist config', base.error);
    return json(500, { error: base.error });
  }
  const leaveParam = new URL(req.url).searchParams.get('leave');

  if (req.method === 'GET') {
    // "Abmelden" im Mailprogramm ohne One-Click (öffnet die Adresse im Browser): zur Website,
    // die vor dem Löschen noch einmal fragt – ein GET löscht nie etwas
    if (leaveParam !== null) {
      const to = TOKEN.test(leaveParam) ? link(base, 'austragen', leaveParam) : base.page;
      return new Response(null, { status: 303, headers: { ...CORS, Location: to, 'Cache-Control': 'no-store' } });
    }
    // Anzeige auf der Website: freie Pro-Plätze
    try {
      const [row] = await rpc<StatsRow[]>(deps, base, 'waitlist_stats', {});
      return json(
        200,
        { bonus_left: row?.o_bonus_left ?? 0, bonus_slots: row?.o_bonus_slots ?? 0 },
        { 'Cache-Control': 'public, max-age=30' },
      );
    } catch (e) {
      return fail(e);
    }
  }

  // One-Click-Abmeldung aus dem Mailprogramm (List-Unsubscribe-Post)
  if (leaveParam !== null) {
    if (!TOKEN.test(leaveParam)) return json(400, { error: 'invalid_token' });
    try {
      await rpc<boolean>(deps, base, 'waitlist_leave', { p_token: leaveParam });
      return json(200, { ok: true });
    } catch (e) {
      return fail(e);
    }
  }

  let body: { action?: unknown; email?: unknown; token?: unknown; hp?: unknown; ms?: unknown };
  try {
    const raw = await readCapped(req);
    if (raw === null) return json(413, { error: 'too_large' });
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'invalid_body' });

  try {
    if (body.action === 'join') {
      const email = normEmail(body.email);
      if (!email) return json(400, { error: 'invalid_email' });
      // Bot? Dann so tun, als hätte es geklappt – ohne E-Mail
      const ms = typeof body.ms === 'number' ? body.ms : Number(body.ms);
      if ((typeof body.hp === 'string' && body.hp.trim()) || !Number.isFinite(ms) || ms < MIN_FILL_MS)
        return json(200, { ok: true });

      const mailCfg = readMail(deps.env);
      if ('error' in mailCfg) {
        console.error('waitlist config', mailCfg.error);
        return json(500, { error: mailCfg.error });
      }
      const cfg: Config = { ...base, ...mailCfg };

      const token = b64url((deps.randomBytes ?? ((n) => crypto.getRandomValues(new Uint8Array(n))))(32));
      const ip = await ipHash(req, cfg.dbKey).catch(() => null);
      const [row] = await rpc<JoinRow[]>(deps, cfg, 'waitlist_join', {
        p_email: email,
        p_token: token,
        p_consent: CONSENT,
        p_ip_hash: ip,
      });
      if (!row) return json(502, { error: 'server_error' });
      if (row.o_action === 'busy' || row.o_action === 'ip_limit') console.warn('waitlist', row.o_action);
      if (row.o_action === 'busy') return json(429, { error: 'busy' });
      if (row.o_action === 'ip_limit') return json(429, { error: 'too_many' });
      if (row.o_action === 'throttled' || !row.o_token) return json(200, { ok: true });

      const leave = link(cfg, 'austragen', row.o_token);
      const mail =
        row.o_action === 'already'
          ? alreadyMail({ place: row.o_place ?? 0, bonus: !!row.o_bonus, slots: row.o_slots, leave, imprint: cfg.imprint })
          : confirmMail({
              link: link(cfg, 'bestaetigen', row.o_token),
              leave,
              imprint: cfg.imprint,
              bonusLeft: row.o_bonus_left,
              slots: row.o_slots,
            });
      try {
        await sendMailWithin(deps.mailDeadlineMs ?? 12000, deps, cfg, email, mail, row.o_token);
      } catch (e) {
        // Bremse zurücknehmen, damit man es gleich noch einmal versuchen kann. Lehnt der Mailserver
        // die Empfänger-Adresse ab, zählt der Versuch für den Anschluss trotzdem (gegen Durchprobieren).
        const code = (e as SmtpError)?.code;
        await rpc(deps, cfg, 'waitlist_mail_failed', { p_email: email, p_ip_hash: code === 'smtp_rejected' ? null : ip }).catch(
          () => null,
        );
        return fail(e);
      }
      return json(200, { ok: true });
    }

    if (body.action === 'confirm' || body.action === 'leave') {
      const token = typeof body.token === 'string' ? body.token : '';
      if (!TOKEN.test(token)) return json(400, { error: 'invalid_token' });

      if (body.action === 'leave') {
        const removed = await rpc<boolean>(deps, base, 'waitlist_leave', { p_token: token });
        return json(200, { ok: true, removed: removed === true });
      }

      const [row] = await rpc<ConfirmRow[]>(deps, base, 'waitlist_confirm', { p_token: token });
      if (!row) return json(404, { error: 'invalid_token' });
      if (row.o_new) {
        // Willkommens-E-Mail nach der Antwort – der Platz steht schon, auch wenn sie nicht klappt
        const mailCfg = readMail(deps.env);
        if ('error' in mailCfg) console.error('waitlist welcome mail', mailCfg.error);
        else {
          const sending = sendMailWithin(
            deps.mailDeadlineMs ?? 12000,
            deps,
            { ...base, ...mailCfg },
            row.o_email,
            welcomeMail({
              place: row.o_place,
              bonus: row.o_bonus,
              slots: row.o_slots,
              leave: link(base, 'austragen', token),
              imprint: mailCfg.imprint,
            }),
            token,
          ).catch((e) => console.error('waitlist welcome mail', (e as SmtpError)?.code, (e as Error)?.message));
          if (deps.waitUntil) deps.waitUntil(sending);
          else await sending;
        }
      }
      return json(200, { ok: true, place: row.o_place, bonus: row.o_bonus, slots: row.o_slots });
    }

    return json(400, { error: 'invalid_action' });
  } catch (e) {
    return fail(e);
  }
}

// Im Supabase-Edge-Runtime (Deno) starten; in Tests wird nur handleRequest benutzt.
declare const Deno:
  | {
      serve?: (h: (req: Request) => Promise<Response>) => void;
      env: { get(key: string): string | undefined };
      connectTls: (o: { hostname: string; port: number }) => Promise<SmtpConn>;
    }
  | undefined;
declare const EdgeRuntime: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
if (typeof Deno !== 'undefined' && Deno?.serve) {
  const rt = typeof EdgeRuntime !== 'undefined' ? EdgeRuntime : undefined;
  Deno.serve((req) =>
    handleRequest(req, {
      env: (k) => Deno!.env.get(k),
      fetch,
      connectTls: (o) => Deno!.connectTls(o),
      waitUntil: rt?.waitUntil ? (p) => rt.waitUntil!(p) : undefined,
    }),
  );
}
