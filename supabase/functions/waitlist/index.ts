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
 * Datenbank: Skript supabase/website/waitlist.sql (eigenes Supabase-Projekt der Website, nicht das der App).
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
/** Höchstdauer für eine E-Mail. Der Mailserver von webgo braucht manchmal über 12 s; die Website wartet 30 s. */
const MAIL_DEADLINE_MS = 25000;

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
  /** Höchstdauer für eine E-Mail (Standard MAIL_DEADLINE_MS; die Website bricht nach 30 s ab) */
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
// E-Mail-Texte und -Gestaltung (dunkel wie lunaxora.de)
// ---------------------------------------------------------------------------

/** Bild, das als Anhang mitgeschickt und im HTML über cid: angezeigt wird (lädt nichts von fremden Servern) */
export type InlineImage = { cid: string; filename: string; type: string; base64: string };
export type Mail = { subject: string; text: string; html: string; inline?: InlineImage[] };

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Warum jemand die E-Mail bekommt (steht in jeder E-Mail, senkt Spam-Meldungen) */
const WHY = 'Du bekommst diese E-Mail, weil diese Adresse auf lunaxora.de für die Warteliste eingetragen wurde.';
/** Bitte, den Absender zu speichern – Kontakte zählen bei Gmail, GMX & Co. als gutes Zeichen */
const SAVE_SENDER = 'Damit unsere E-Mails sicher bei dir ankommen, speichere diese Absenderadresse am besten in deinen Kontakten.';
const LAUNCH = 'Sobald LUNAXORA für iPhone, Android und Mac erscheint, schreiben wir dir.';

/** LUNAXORA-Schriftzug (weiß auf Schwarz, 354×32, angezeigt 177×16) */
const LOGO_PNG = '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';
/** App-Icon (weißes L auf Schwarz, 112×112, angezeigt 44×44) */
const ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAHAAAABwCAIAAABJgmMcAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAcKADAAQAAAABAAAAcAAAAADeglGxAAADuklEQVR4Ae3bP27iQBQG8JBACTQUKSMOQEeXih6JAokTcAHukDIVFRLnCAeAdIiGAiQ6JAqE6EBESWD3W0aatUzIDBs/xuP9XKDx+Hlm/PMb2/y7ueFCAQpQgAIUoAAFKEABClCAAhSgAAUoQAEKUIACFKAABShAAQpQgAIUoAAFKEABClCAAhSgAAWcCqQkek+lUuVyOZvN/jouwS6wCauoPhwOw+Fwu90Gt7L8tcDd3d1oNFKa514/Pz9LpdLX+/tceys0+P1+j5ahGWpf+apNKltDAb6vpoUOQGOdmqoez9ULjedqzUpl6NUOIG4diYAi+3DPMR5qIpNUBBTz/fZWpGXjSXIe8J8etpy7M1DMd0552/PKKW8rxTijgMiUx1zmXd5IH3HA8RIafh8VcR8umhPJUMsD0e+mLOO9CJMCNWIZA7zgOx2kFOhpT6c1fGw6NTlbY8RK6qOVswzFY4DNk8DZMxbXDc5AAZLIy6hL0Lgm2Y/G5QwU6Wm8zv7oyBztLAVqM50T+RGfFKhN9hE04lnEu7wtqE162rblW5zIlMcF1OYaahPjm+eNCCgy1GY6JzKRRUC9S6sIBywCepzxIr+aivDIhZoSARUaqxfNugTlTemCFLHBsom5oMt4hEplqPEOnkhNnFMp0KR6GaeBCKjNcyhisBjH512ACKhNeuKTEfzQ2Tsv44BFQNHr958kITfT6fTDw4NxfN4FSIHaTOdGo+Gdl7MBv76+wvTP93DnF/xvodVqfZ/Lzg7gXzuW+o39arUyDgnX0Ofn52q1+vLyslwug7IogxstBC/HODVYxaLSX72q1WP13+9UsEnVqF3QmiqgQVVYr9e9Xg9l4yDjEvD09GTMUBwPYpws0+k0k8lIYEllaL/ftxkuNG3Coo1B8r6/v0fbpm5N6qY0GAxmsxmGrnuKVUHuREqBbjabdrsdK8TgYOTOtBQoRt/tdnGvlxt6EOjSstyoBEF3u12z2ZzP53Kjv9RRx/s35dXQJ5NJrVbDK0xjyKp9PSvc3993Oh38k9vJE9KXnY7HY6HHpuvdhfFn7nq9XqlUisViLpfDw7aad3hF8qqyLqiUUas6tUMxuh7BwaZ0uoVa0/XoGqCPj48fHx+6MqrC9UD1iAuFQj6fx9skKCgIbFKFIIHyQr2GC8Xoer277kIVQq0Fm3p7e1ssFqrB0F5cpQAFKEABClCAAhSgAAUoQAEKUIACFKAABShAAQpQgAIUoAAFKEABClCAAhSgAAUoQAEKUIACfgv8Bo2InxZ3IcejAAAAAElFTkSuQmCC';
export const MAIL_IMAGES: InlineImage[] = [
  { cid: 'lx-logo@lunaxora.de', filename: 'lunaxora.png', type: 'image/png', base64: LOGO_PNG },
  { cid: 'lx-icon@lunaxora.de', filename: 'lunaxora-icon.png', type: 'image/png', base64: ICON_PNG },
];

type Block =
  | { type: 'p'; text: string }
  | { type: 'button'; label: string; url: string }
  | { type: 'link'; text: string; url: string }
  | { type: 'place'; label: string; value: string }
  | { type: 'perk'; tone: 'gift' | 'info'; title: string; text: string }
  | { type: 'note'; text: string };

type Content = {
  subject: string;
  preheader: string;
  kicker: string;
  heading: string;
  blocks: Block[];
  leave: string;
  imprint: string;
};

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/** Nur feste Farben (Outlook kennt kein rgba) */
const K = {
  page: '#000000',
  card: '#0e0f11',
  tile: '#131416',
  line: '#222327',
  green: '#2fe39a',
  greenBg: '#0f2119',
  greenLine: '#1e4d3a',
  greyAccent: '#636366',
  white: '#ffffff',
  text: '#d1d1d6',
  muted: '#a1a1a6',
  faint: '#8e8e93',
  black: '#000000',
};
const TABLE = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

/** nur http(s)-Links, alles andere wird zu "#" */
const href = (u: string) => (/^https?:/i.test(u.trim()) ? esc(u.trim()) : '#');
/** lange Adresse sichtbar, mit Umbruchstellen (ändert den kopierten Text nicht) */
const breakable = (u: string) => (u.match(/[\s\S]{1,24}/g) ?? []).map(esc).join('<wbr>');
/** eigene Links für lunaxora.de im Fuß, damit Mailprogramme sie nicht blau einfärben */
const linkDomains = (html: string, color: string) =>
  html.replace(
    /\blunaxora\.de\b/g,
    (d) => `<a href="https://${d}" target="_blank" style="color:${color};text-decoration:none">${d}</a>`,
  );
/** Text-Stil; 'at-least' lässt Outlook die Zeile wachsen statt große Ziffern abzuschneiden */
const txt = (size: number, lh: number, color: string, more = '', rule = 'exactly') =>
  `margin:0;font-family:${FONT};font-size:${size}px;line-height:${lh}px;mso-line-height-rule:${rule};color:${color};${more}`;
/** fester Hintergrund für jede Zelle mit Text (Gmail entfernt den Hintergrund von <body>) */
const bg = (color: string) => `bgcolor="${color}" style="background-color:${color};`;

/** HTML-Fassung: dunkle Karte, grüne Akzente, Logo und App-Icon als cid:-Bilder */
function renderHtml(c: Content): string {
  const s = c.heading.trim();
  const cut = s.lastIndexOf(' ');
  const headingHtml =
    cut < 1
      ? esc(s)
      : `${esc(s.slice(0, cut))} <span style="background-color:${K.green};color:${K.black};padding:0 8px;border-radius:8px;white-space:nowrap;-webkit-box-decoration-break:clone;box-decoration-break:clone">${esc(s.slice(cut + 1))}</span>`;

  const para = (t: string) => `<p style="${txt(16, 26, K.text)}">${esc(t)}</p>`;
  type Item = { top: number; bottom: number; html: string };
  const render = (b: Block): Item => {
    switch (b.type) {
      case 'p':
        return { top: 0, bottom: 16, html: para(b.text) };
      case 'button':
        return {
          top: 10,
          bottom: 30,
          html: `<table ${TABLE} class="lx-btn" style="border-collapse:separate;mso-table-lspace:0pt;mso-table-rspace:0pt"><tr><td align="center" bgcolor="${K.green}" style="background-color:${K.green};border-radius:12px;mso-padding-alt:15px 28px"><a href="${href(b.url)}" target="_blank" style="display:block;padding:15px 28px;font-family:${FONT};font-size:16px;line-height:20px;mso-line-height-rule:exactly;font-weight:700;color:${K.black};text-decoration:none;border-radius:12px;text-align:center">${esc(b.label)}&nbsp;&#8594;</a></td></tr></table>`,
        };
      case 'link':
        return {
          top: 4,
          bottom: 16,
          html: `<p style="${txt(13, 20, K.faint)}">${esc(b.text)}</p><p style="${txt(13, 20, K.green, 'margin-top:6px;word-break:break-all;word-wrap:break-word')}"><a href="${href(b.url)}" target="_blank" style="color:${K.green};text-decoration:underline;word-break:break-all">${breakable(b.url)}</a></p>`,
        };
      case 'place':
        return {
          top: 0,
          bottom: 28,
          html: `<table ${TABLE} width="100%" style="width:100%;border-collapse:separate"><tr><td bgcolor="${K.tile}" style="background-color:${K.tile};border:1px solid ${K.line};border-radius:16px;padding:18px 22px 20px"><p style="${txt(12, 16, K.muted, 'font-weight:700;letter-spacing:1.6px;text-transform:uppercase')}">${esc(b.label)}</p><p style="${txt(72, 72, K.green, 'margin-top:8px;font-weight:800;letter-spacing:-2px;white-space:nowrap', 'at-least')}">${esc(b.value)}</p></td></tr></table>`,
        };
      case 'perk': {
        const gift = b.tone === 'gift';
        const fill = gift ? K.greenBg : K.tile;
        const line = gift ? K.greenLine : K.line;
        const accent = gift ? K.green : K.greyAccent;
        const title = gift ? K.green : K.white;
        return {
          top: 8,
          bottom: 28,
          html: `<table ${TABLE} width="100%" style="width:100%;border-collapse:separate"><tr><td bgcolor="${fill}" style="background-color:${fill};border:1px solid ${line};border-left:3px solid ${accent};border-radius:14px;padding:16px 18px 17px"><p style="${txt(16, 22, title, 'font-weight:700;letter-spacing:-0.2px')}">${esc(b.title)}</p><p style="${txt(15, 24, K.text, 'margin-top:6px')}">${esc(b.text)}</p></td></tr></table>`,
        };
      }
      case 'note':
        return { top: 0, bottom: 20, html: `<p style="${txt(14, 22, K.faint)}">${esc(b.text)}</p>` };
    }
  };

  // "Hallo," steht direkt vor dem ersten Absatz (nach der Platz-Kachel)
  const firstP = c.blocks.findIndex((b) => b.type === 'p');
  const items: Item[] = [];
  c.blocks.forEach((b, i) => {
    if (i === (firstP === -1 ? 0 : firstP)) items.push({ top: 0, bottom: 16, html: para('Hallo,') });
    items.push(render(b));
  });
  const body = items
    .map((it, i) => `<tr><td ${bg(K.card)}padding:${it.top}px 0 ${i === items.length - 1 ? 0 : it.bottom}px">${it.html}</td></tr>`)
    .join('');

  const kicker = `<tr><td ${bg(K.card)}padding:0 0 18px"><table ${TABLE} style="border-collapse:separate"><tr><td bgcolor="${K.greenBg}" style="background-color:${K.greenBg};border:1px solid ${K.greenLine};border-radius:999px;padding:5px 12px;font-family:${FONT};font-size:12px;line-height:16px;mso-line-height-rule:exactly;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${K.green}">${esc(c.kicker)}</td></tr></table></td></tr>`;
  const heading = `<tr><td ${bg(K.card)}padding:0 0 28px"><h1 style="${txt(32, 40, K.white, 'font-weight:800;letter-spacing:-0.6px')}">${headingHtml}</h1></td></tr>`;

  // Gruß mit App-Icon als Absenderbild
  const sign =
    `<tr><td ${bg(K.card)}padding:32px 0 0"><table ${TABLE} width="100%" style="width:100%"><tr><td height="1" bgcolor="${K.line}" style="height:1px;line-height:1px;mso-line-height-rule:exactly;font-size:1px;background-color:${K.line}">&nbsp;</td></tr></table>` +
    `<table ${TABLE}><tr><td width="44" valign="middle" ${bg(K.card)}width:44px;padding:24px 14px 0 0"><img src="cid:lx-icon@lunaxora.de" width="44" height="44" alt="LUNAXORA" style="display:block;width:44px;height:44px;border:0;outline:none;text-decoration:none;border-radius:11px;background-color:${K.black};color:${K.muted};font-family:${FONT};font-size:12px;line-height:14px"></td>` +
    `<td valign="middle" ${bg(K.card)}padding:24px 0 0"><p style="${txt(15, 22, K.muted)}">Viele Grüße</p><p style="${txt(15, 22, K.white, 'font-weight:700')}">Dein LUNAXORA-Team</p></td></tr></table></td></tr>`;

  const footer =
    `<p style="${txt(13, 20, K.text, 'font-weight:600;letter-spacing:0.3px')}">${linkDomains(esc('LUNAXORA · lunaxora.de'), K.text)}</p>` +
    (c.imprint ? `<p style="${txt(12, 18, K.faint, 'margin-top:10px')}">${esc(c.imprint)}</p>` : '') +
    `<p style="${txt(12, 18, K.faint, 'margin-top:6px')}">${linkDomains(esc(WHY), K.faint)}</p>` +
    `<p style="${txt(12, 18, K.faint, 'margin-top:6px')}">Du willst keine E-Mails mehr von uns? <a href="${href(c.leave)}" target="_blank" style="color:${K.text};text-decoration:underline">Austragen</a></p>`;

  const logo = `<img src="cid:lx-logo@lunaxora.de" width="177" height="16" alt="LUNAXORA" style="display:block;width:177px;height:16px;border:0;outline:none;text-decoration:none;color:${K.white};font-family:${FONT};font-size:13px;line-height:16px;font-weight:700;letter-spacing:3px">`;
  const spacer = '&zwnj;&nbsp;'.repeat(90);

  return `<!doctype html>
<html lang="de" dir="ltr" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no,url=no">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${esc(c.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><style>table,td,p,a,span,h1,div{font-family:'Segoe UI',Arial,sans-serif !important}</style><![endif]-->
<style>
:root{color-scheme:dark;supported-color-schemes:dark}
body{margin:0;padding:0;background-color:#000000}
a{color:#2fe39a}
a[x-apple-data-detectors]{color:inherit;text-decoration:none}
@media (max-width:600px){.lx-btn{width:100%}}
</style>
</head>
<body bgcolor="${K.page}" style="margin:0;padding:0;width:100%;background-color:${K.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;word-spacing:normal">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${K.page}">${esc(c.preheader)}${spacer}</div>
<div role="article" aria-roledescription="email" aria-label="${esc(c.subject)}" lang="de" style="background-color:${K.page}">
<table ${TABLE} width="100%" bgcolor="${K.page}" style="width:100%;background-color:${K.page}"><tr><td align="center" bgcolor="${K.page}" style="background-color:${K.page};padding:28px 12px 48px">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table ${TABLE} width="100%" align="center" style="width:100%;max-width:560px;margin:0 auto;border-collapse:separate">
<tr><td bgcolor="${K.page}" style="background-color:${K.page};padding:8px 29px 24px">${logo}</td></tr>
<tr><td bgcolor="${K.card}" style="background-color:${K.card};border:1px solid ${K.line};border-radius:20px;padding:36px 28px 28px;text-align:left">
<table ${TABLE} width="100%" bgcolor="${K.card}" style="width:100%;background-color:${K.card}">${kicker}${heading}${body}${sign}</table>
</td></tr>
<tr><td bgcolor="${K.page}" style="background-color:${K.page};padding:28px 29px 0;text-align:left">${footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</div>
</body>
</html>`;
}

/** Text-Fassung (für Mailprogramme ohne HTML und für Spamfilter) */
function renderText(c: Content): string {
  const lines: string[] = [c.heading, '', 'Hallo,', ''];
  for (const b of c.blocks) {
    if (b.type === 'p' || b.type === 'note') lines.push(b.text, '');
    else if (b.type === 'perk') lines.push(b.text, '');
    else if (b.type === 'button') lines.push(`${b.label}: ${b.url}`, '');
    // 'place' steht schon im Satz, 'link' doppelt den Knopf
  }
  lines.push(
    'Viele Grüße',
    'Dein LUNAXORA-Team',
    '',
    '—',
    'LUNAXORA · lunaxora.de',
    ...(c.imprint ? [c.imprint] : []),
    WHY,
    `Du willst keine E-Mails mehr von uns? Austragen: ${c.leave}`,
  );
  return lines.join('\n');
}

function compose(c: Content): Mail {
  return { subject: c.subject, text: renderText(c), html: renderHtml(c), inline: MAIL_IMAGES };
}

export function confirmMail(o: { link: string; leave: string; imprint: string; bonusLeft: number; slots: number }): Mail {
  return compose({
    subject: 'Bitte bestätige deine Anmeldung zur Lunaxora-Warteliste',
    preheader: 'Nur noch ein Klick, dann stehst du auf der Warteliste.',
    kicker: 'Warteliste',
    heading: 'Nur noch ein Klick',
    blocks: [
      {
        type: 'p',
        text: 'schön, dass du bei LUNAXORA dabei sein willst. Bitte bestätige deine E-Mail-Adresse – erst dann stehst du auf der Warteliste.',
      },
      { type: 'button', label: 'Platz bestätigen', url: o.link },
      ...(o.bonusLeft > 0
        ? [
            {
              type: 'perk',
              tone: 'gift',
              title: '3 Monate Pro kostenlos',
              text: `Die ersten ${o.slots} bestätigten Plätze bekommen 3 Monate Pro kostenlos.`,
            } as const,
          ]
        : []),
      {
        type: 'note',
        text: 'Du hast dich nicht eingetragen? Dann ignoriere diese E-Mail einfach. Ohne Bestätigung löschen wir deine Adresse nach 30 Tagen.',
      },
      { type: 'link', text: 'Der Knopf funktioniert nicht? Dann kopiere diesen Link in deinen Browser:', url: o.link },
    ],
    leave: o.leave,
    imprint: o.imprint,
  });
}

const bonusPerk = (bonus: boolean, slots: number): Block =>
  bonus
    ? {
        type: 'perk',
        tone: 'gift',
        title: '3 Monate Pro kostenlos',
        text: `Dein Platz gehört zu den ersten ${slots}, deshalb bekommst du 3 Monate Pro kostenlos. Registrier dich zum Start einfach mit dieser E-Mail-Adresse in der App – dann schalten wir dir Pro frei.`,
      }
    : {
        type: 'perk',
        tone: 'info',
        title: '14 Tage Pro testen',
        text: 'Die Plätze mit 3 Monaten Pro sind leider schon vergeben. Zum Start kannst du trotzdem 14 Tage alle Pro-Funktionen kostenlos testen.',
      };

export function welcomeMail(o: { place: number; bonus: boolean; slots: number; leave: string; imprint: string }): Mail {
  return compose({
    subject: 'Willkommen auf der Lunaxora-Warteliste',
    preheader: `Du stehst auf Platz ${o.place} der Warteliste.`,
    kicker: 'Warteliste',
    heading: 'Du bist dabei',
    blocks: [
      { type: 'place', label: 'Dein Platz', value: String(o.place) },
      { type: 'p', text: `danke für deine Bestätigung – du stehst jetzt auf der Warteliste von LUNAXORA, auf Platz ${o.place}.` },
      bonusPerk(o.bonus, o.slots),
      { type: 'p', text: LAUNCH },
      { type: 'note', text: SAVE_SENDER },
    ],
    leave: o.leave,
    imprint: o.imprint,
  });
}

export function alreadyMail(o: { place: number; bonus: boolean; slots: number; leave: string; imprint: string }): Mail {
  return compose({
    subject: 'Du stehst schon auf der Lunaxora-Warteliste',
    preheader: 'Alles gut: Du hast deinen Platz schon.',
    kicker: 'Warteliste',
    heading: 'Du stehst schon auf der Liste',
    blocks: [
      { type: 'place', label: 'Dein Platz', value: String(o.place) },
      { type: 'p', text: `du stehst schon auf der Warteliste von LUNAXORA – auf Platz ${o.place}. Du musst nichts weiter tun.` },
      bonusPerk(o.bonus, o.slots),
      { type: 'p', text: LAUNCH },
      { type: 'note', text: SAVE_SENDER },
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

/** Kopfzeilen-Text mit Umlauten (RFC 2047): Stücke à 64 Zeichen, so bleibt auch "Subject: " + Stück unter 76 */
export function encodeWord(s: string): string {
  if (ascii(s)) return s;
  const words: string[] = [];
  let chunk = '';
  for (const ch of s) {
    if (utf8.encode(chunk + ch).length > 39) {
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
  const id = m.messageId.replace(/[^a-z0-9]/gi, '').slice(0, 24);
  const boundary = `lx-${id}`;
  const part = (type: string, content: string) => [
    `--${boundary}`,
    `Content-Type: ${type}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(base64(utf8.encode(content.replace(/\r?\n/g, '\r\n')))),
  ];
  // Text + HTML als Alternativen
  const alternative = [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    ...part('text/plain', m.mail.text),
    ...part('text/html', m.mail.html),
    `--${boundary}--`,
  ];
  // Bilder (Logo, App-Icon) hängen als cid:-Anhänge daneben (multipart/related)
  const images = m.mail.inline ?? [];
  const related = `lxr-${id}`;
  const body = images.length
    ? [
        // gefaltet, damit die Kopfzeile unter 78 Zeichen bleibt
        'Content-Type: multipart/related; type="multipart/alternative";',
        ` boundary="${related}"`,
        '',
        `--${related}`,
        ...alternative,
        ...images.flatMap((img) => [
          `--${related}`,
          `Content-Type: ${img.type}; name="${img.filename}"`,
          `Content-ID: <${img.cid}>`,
          `Content-Disposition: inline; filename="${img.filename}"`,
          'Content-Transfer-Encoding: base64',
          '',
          wrap76(img.base64),
        ]),
        `--${related}--`,
      ]
    : alternative;
  return [
    `From: "Lunaxora" <${m.from}>`,
    `To: ${m.to}`,
    `Subject: ${encodeWord(m.mail.subject)}`,
    `Date: ${m.date.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: ${m.messageId}`,
    `List-Unsubscribe: <${m.unsubscribe}>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    ...body,
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
      // Logo und App-Icon als eingebettete Bilder (cid:)
      ...(mail.inline?.length
        ? { attachments: mail.inline.map((i) => ({ filename: i.filename, content: i.base64, content_id: i.cid })) }
        : {}),
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
        await sendMailWithin(deps.mailDeadlineMs ?? MAIL_DEADLINE_MS, deps, cfg, email, mail, row.o_token);
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
            deps.mailDeadlineMs ?? MAIL_DEADLINE_MS,
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
