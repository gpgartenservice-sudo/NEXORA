// Unit-Tests: Warteliste auf der Website (Server-Funktion "waitlist"). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONSENT,
  TOKEN,
  alreadyMail,
  buildMime,
  confirmMail,
  handleRequest,
  normEmail,
  readConfig,
  welcomeMail,
} from '../../supabase/functions/waitlist/index.ts';

const URL_ = 'https://ref.supabase.co';
const FN = `${URL_}/functions/v1/waitlist`;
const BASE_ENV = {
  SUPABASE_URL: URL_,
  SUPABASE_SERVICE_ROLE_KEY: 'eyJservice',
  WAITLIST_SMTP_HOST: 's179.goserver.host',
  WAITLIST_SMTP_USER: 'emails@lunaxora.de',
  WAITLIST_SMTP_PASS: 'geheim',
  WAITLIST_IMPRINT: 'Lunaxora · Musterstraße 1 · 12345 Musterstadt',
};
const TOK = 'A'.repeat(43);

/** Nachgebauter Mailserver: antwortet auf jeden Befehl, merkt sich die Nachricht */
function fakeSmtp({ failAuth = false } = {}) {
  const sent = [];
  const connect = async () => {
    const queue = ['220 mail.example ESMTP\r\n'];
    let waiters = [];
    let inbuf = '';
    let inData = false;
    let data = '';
    const push = (s) => {
      queue.push(s);
      waiters.splice(0).forEach((w) => w());
    };
    return {
      async read(p) {
        while (!queue.length) await new Promise((r) => waiters.push(r));
        const bytes = new TextEncoder().encode(queue.shift());
        p.set(bytes);
        return bytes.length;
      },
      async write(p) {
        inbuf += new TextDecoder().decode(p);
        for (;;) {
          if (inData) {
            const end = inbuf.indexOf('\r\n.\r\n');
            if (end < 0) break;
            data += inbuf.slice(0, end);
            inbuf = inbuf.slice(end + 5);
            inData = false;
            sent.push(data);
            push('250 queued\r\n');
            continue;
          }
          const i = inbuf.indexOf('\r\n');
          if (i < 0) break;
          const line = inbuf.slice(0, i);
          inbuf = inbuf.slice(i + 2);
          if (/^EHLO/.test(line)) push('250-mail.example\r\n250 AUTH PLAIN LOGIN\r\n');
          else if (/^AUTH PLAIN/.test(line)) push(failAuth ? '535 auth failed\r\n' : '235 ok\r\n');
          else if (/^(MAIL FROM|RCPT TO)/.test(line)) push('250 ok\r\n');
          else if (line === 'DATA') {
            inData = true;
            data = '';
            push('354 go\r\n');
          } else if (line === 'QUIT') push('221 bye\r\n');
        }
        return p.length;
      },
      close() {},
    };
  };
  return { sent, connect };
}

/** Nachgebaute Datenbank: Antworten je RPC-Name, merkt sich die Aufrufe */
function fakeDb(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    const name = String(url).split('/rpc/')[1];
    calls.push({ name, url: String(url), body: JSON.parse(init.body), headers: init.headers });
    const a = typeof answers[name] === 'function' ? answers[name](JSON.parse(init.body)) : answers[name];
    if (a === undefined) return new Response('{"code":"PGRST202"}', { status: 404 });
    if (a instanceof Response) return a;
    return new Response(JSON.stringify(a), { status: 200 });
  };
  return { calls, fetch };
}

const deps = (db, smtp, env = BASE_ENV) => ({
  env: (k) => env[k],
  fetch: db.fetch,
  connectTls: smtp?.connect,
  smtpTimeoutMs: 500,
  randomBytes: (n) => new Uint8Array(n).fill(0),
  now: () => new Date('2026-11-07T12:00:00Z'),
});
const post = (body, q = '', headers = {}) =>
  new Request(FN + q, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers },
    body: JSON.stringify(body),
  });
const decodeParts = (mime) =>
  [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)(?:\r\n--)/g)].map((m) =>
    Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'),
  );

test('Einstellungen: Postfach, Absender, Website, fehlende Angaben', () => {
  const cfg = readConfig((k) => BASE_ENV[k]);
  assert.equal(cfg.mode, 'smtp');
  assert.equal(cfg.from, 'emails@lunaxora.de');
  assert.equal(cfg.port, 465);
  assert.equal(cfg.page, 'https://lunaxora.de/');
  assert.equal(cfg.leaveUrl, FN);
  // SMTP_HOST der Funktion "mail" reicht als Server
  const shared = { ...BASE_ENV, WAITLIST_SMTP_HOST: undefined, SMTP_HOST: 'smtp.example' };
  assert.equal(readConfig((k) => shared[k]).host, 'smtp.example');
  assert.deepEqual(readConfig((k) => ({ ...BASE_ENV, SUPABASE_SERVICE_ROLE_KEY: undefined })[k]), { error: 'db_key' });
  assert.deepEqual(readConfig((k) => ({ ...BASE_ENV, WAITLIST_SMTP_PASS: undefined })[k]), {
    error: 'missing_mail_login',
  });
  assert.deepEqual(readConfig((k) => ({ ...BASE_ENV, WAITLIST_SMTP_PORT: '587' })[k]), { error: 'smtp_port' });
  // Resend statt SMTP
  const resend = { SUPABASE_URL: URL_, WAITLIST_SECRET_KEY: 'sb_secret_x', RESEND_API_KEY: 're_x', WAITLIST_FROM: 'emails@lunaxora.de' };
  const r = readConfig((k) => resend[k]);
  assert.equal(r.mode, 'resend');
  assert.equal(r.dbKey, 'sb_secret_x');
  assert.deepEqual(readConfig((k) => ({ ...resend, WAITLIST_FROM: undefined })[k]), { error: 'missing_mail_from' });
  assert.equal(readConfig((k) => ({ ...BASE_ENV, WAITLIST_PAGE_URL: 'https://lunaxora.de/start#x' })[k]).page, 'https://lunaxora.de/start');
});

test('Eintragen: Bestätigungs-E-Mail mit Knopf, Austragen-Link und Anbieter-Angaben', async () => {
  const smtp = fakeSmtp();
  const db = fakeDb({
    waitlist_join: [{ o_action: 'confirm', o_token: TOK, o_place: null, o_bonus: false, o_bonus_left: 17, o_slots: 20 }],
  });
  const res = await handleRequest(post({ action: 'join', email: ' Lea@Beispiel.DE ', hp: '', ms: 5000 }), deps(db, smtp));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(db.calls[0].name, 'waitlist_join');
  assert.equal(db.calls[0].body.p_email, 'lea@beispiel.de');
  assert.equal(db.calls[0].body.p_consent, CONSENT);
  assert.match(db.calls[0].body.p_token, TOKEN);
  assert.equal(db.calls[0].headers.apikey, 'eyJservice');
  assert.equal(db.calls[0].headers.Authorization, 'Bearer eyJservice');
  assert.equal(smtp.sent.length, 1);
  const mime = smtp.sent[0];
  assert.match(mime, /^From: "Lunaxora" <emails@lunaxora\.de>/m);
  assert.match(mime, /^To: lea@beispiel\.de/m);
  assert.match(mime, new RegExp(`^List-Unsubscribe: <${FN.replace(/[./]/g, '\\$&')}\\?leave=${TOK}>`, 'm'));
  assert.match(mime, /^List-Unsubscribe-Post: List-Unsubscribe=One-Click/m);
  const [text, html] = decodeParts(mime);
  assert.match(text, new RegExp(`Platz bestätigen: https://lunaxora\\.de/#bestaetigen=${TOK}`));
  assert.match(text, /Die ersten 20 bestätigten Plätze bekommen 3 Monate Pro kostenlos/);
  assert.match(text, new RegExp(`Austragen: https://lunaxora\\.de/#austragen=${TOK}`));
  assert.match(text, /Musterstraße 1/);
  assert.match(html, new RegExp(`href="https://lunaxora\\.de/#bestaetigen=${TOK}"`));
  assert.match(html, />Platz bestätigen</);
});

test('Eintragen: ohne freie Pro-Plätze kein Bonus-Versprechen in der E-Mail', () => {
  const m = confirmMail({ link: 'https://x/#bestaetigen=t', leave: 'https://x/#austragen=t', imprint: '', bonusLeft: 0, slots: 20 });
  assert.doesNotMatch(m.text, /3 Monate Pro/);
  assert.doesNotMatch(m.html, /3 Monate Pro/);
});

test('Eintragen: schon bestätigt -> Erinnerung mit Platz statt neuer Bestätigung', async () => {
  const smtp = fakeSmtp();
  const db = fakeDb({
    waitlist_join: [{ o_action: 'already', o_token: TOK, o_place: 4, o_bonus: true, o_bonus_left: 0, o_slots: 20 }],
  });
  const res = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), deps(db, smtp));
  assert.deepEqual(await res.json(), { ok: true });
  const [text] = decodeParts(smtp.sent[0]);
  assert.match(text, /schon auf der Warteliste von LUNAXORA – auf Platz 4/);
  assert.match(text, /ersten 20: Für dich sind 3 Monate Pro kostenlos reserviert/);
  assert.doesNotMatch(text, /bestaetigen=/);
});

test('Eintragen: Bremse, Bots, ungültige Adresse, zu viele Anmeldungen', async () => {
  const smtp = fakeSmtp();
  let db = fakeDb({ waitlist_join: [{ o_action: 'throttled', o_token: null, o_bonus_left: 3, o_slots: 20 }] });
  let res = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), deps(db, smtp));
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(smtp.sent.length, 0);

  // verstecktes Feld ausgefüllt oder zu schnell: keine Datenbank, keine E-Mail, trotzdem "ok"
  db = fakeDb({});
  for (const b of [{ hp: 'http://spam', ms: 9000 }, { ms: 200 }, {}]) {
    res = await handleRequest(post({ action: 'join', email: 'a@b.de', ...b }), deps(db, smtp));
    assert.deepEqual(await res.json(), { ok: true });
  }
  assert.equal(db.calls.length, 0);

  for (const email of ['', 'kein-at', 'a@b', 'a b@c.de', 'x'.repeat(250) + '@b.de', 42]) {
    res = await handleRequest(post({ action: 'join', email, ms: 4000 }), deps(db, smtp));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'invalid_email' });
  }

  db = fakeDb({ waitlist_join: [{ o_action: 'busy', o_token: null, o_bonus_left: 3, o_slots: 20 }] });
  res = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), deps(db, smtp));
  assert.equal(res.status, 429);
});

test('Eintragen: Mailserver lehnt ab -> Fehler und Bremse zurückgenommen', async () => {
  const smtp = fakeSmtp({ failAuth: true });
  const db = fakeDb({
    waitlist_join: [{ o_action: 'confirm', o_token: TOK, o_bonus_left: 20, o_slots: 20 }],
    waitlist_mail_failed: null,
  });
  const res = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), deps(db, smtp));
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'mail_failed' });
  assert.deepEqual(
    db.calls.map((c) => c.name),
    ['waitlist_join', 'waitlist_mail_failed'],
  );
  assert.equal(db.calls[1].body.p_email, 'a@b.de');
  assert.ok('p_ip_hash' in db.calls[1].body);
});

test('Bestätigen: Platz, Bonus und Willkommens-E-Mail (nur beim ersten Klick)', async () => {
  const smtp = fakeSmtp();
  let db = fakeDb({
    waitlist_confirm: [{ o_email: 'lea@beispiel.de', o_place: 7, o_bonus: true, o_new: true, o_slots: 20 }],
  });
  let res = await handleRequest(post({ action: 'confirm', token: TOK }), deps(db, smtp));
  assert.deepEqual(await res.json(), { ok: true, place: 7, bonus: true, slots: 20 });
  assert.equal(db.calls[0].body.p_token, TOK);
  assert.equal(smtp.sent.length, 1);
  const [text] = decodeParts(smtp.sent[0]);
  assert.match(smtp.sent[0], /^To: lea@beispiel\.de/m);
  assert.match(text, /auf Platz 7/);
  assert.match(text, /Registrier dich zum Start einfach mit dieser E-Mail-Adresse/);

  db = fakeDb({ waitlist_confirm: [{ o_email: 'lea@beispiel.de', o_place: 7, o_bonus: true, o_new: false, o_slots: 20 }] });
  res = await handleRequest(post({ action: 'confirm', token: TOK }), deps(db, smtp));
  assert.deepEqual(await res.json(), { ok: true, place: 7, bonus: true, slots: 20 });
  assert.equal(smtp.sent.length, 1, 'kein zweites Mal');

  // Mailserver kaputt: Platz steht trotzdem
  db = fakeDb({ waitlist_confirm: [{ o_email: 'b@c.de', o_place: 25, o_bonus: false, o_new: true, o_slots: 20 }] });
  res = await handleRequest(post({ action: 'confirm', token: TOK }), deps(db, fakeSmtp({ failAuth: true })));
  assert.deepEqual(await res.json(), { ok: true, place: 25, bonus: false, slots: 20 });

  db = fakeDb({ waitlist_confirm: [] });
  res = await handleRequest(post({ action: 'confirm', token: TOK }), deps(db, smtp));
  assert.equal(res.status, 404);
  res = await handleRequest(post({ action: 'confirm', token: 'kurz' }), deps(db, smtp));
  assert.equal(res.status, 400);
});

test('Willkommens-E-Mail ohne Bonus nennt den normalen Pro-Test', () => {
  const m = welcomeMail({ place: 31, bonus: false, slots: 20, leave: 'https://x/#austragen=t', imprint: '' });
  assert.equal(m.subject, 'Du bist auf der Warteliste – Platz 31');
  assert.match(m.text, /schon vergeben\. Zum Start kannst du trotzdem 14 Tage alle Pro-Funktionen kostenlos testen/);
  assert.doesNotMatch(alreadyMail({ place: 31, bonus: false, slots: 20, leave: 'l', imprint: '' }).text, /reserviert/);
});

test('Austragen: per Link (POST) und One-Click aus dem Mailprogramm', async () => {
  let db = fakeDb({ waitlist_leave: true });
  let res = await handleRequest(post({ action: 'leave', token: TOK }), deps(db));
  assert.deepEqual(await res.json(), { ok: true, removed: true });
  assert.equal(db.calls[0].body.p_token, TOK);
  // alter Link (Eintrag gibt es nicht mehr): die Website sagt das ehrlich
  db = fakeDb({ waitlist_leave: false });
  res = await handleRequest(post({ action: 'leave', token: TOK }), deps(db));
  assert.deepEqual(await res.json(), { ok: true, removed: false });

  db = fakeDb({ waitlist_leave: false });
  res = await handleRequest(
    new Request(`${FN}?leave=${TOK}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }),
    deps(db),
  );
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(db.calls[0].name, 'waitlist_leave');
  res = await handleRequest(new Request(`${FN}?leave=x`, { method: 'POST', body: '' }), deps(db));
  assert.equal(res.status, 400);
});

test('Anzeige: freie Pro-Plätze, Cache, fehlendes SQL-Skript, falscher Schlüssel', async () => {
  let db = fakeDb({ waitlist_stats: [{ o_bonus_left: 13, o_bonus_slots: 20 }] });
  let res = await handleRequest(new Request(FN), deps(db));
  assert.deepEqual(await res.json(), { bonus_left: 13, bonus_slots: 20 });
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), '*');
  assert.match(res.headers.get('Cache-Control'), /max-age=30/);

  db = fakeDb({});
  res = await handleRequest(new Request(FN), deps(db));
  assert.deepEqual(await res.json(), { error: 'missing_sql' });

  db = fakeDb({ waitlist_stats: new Response('{"message":"Invalid API key"}', { status: 401 }) });
  res = await handleRequest(new Request(FN), deps(db));
  assert.deepEqual(await res.json(), { error: 'db_key' });

  // neuer Secret Key: nur als apikey, nicht als Bearer
  db = fakeDb({ waitlist_stats: [{ o_bonus_left: 1, o_bonus_slots: 20 }] });
  await handleRequest(new Request(FN), deps(db, null, { ...BASE_ENV, WAITLIST_SECRET_KEY: 'sb_secret_abc' }));
  assert.equal(db.calls[0].headers.apikey, 'sb_secret_abc');
  assert.equal(db.calls[0].headers.Authorization, undefined);
});

test('Sonstiges: OPTIONS, falsche Methode, kaputter Body, unbekannte Aktion, fehlende Einstellungen', async () => {
  const db = fakeDb({});
  assert.equal((await handleRequest(new Request(FN, { method: 'OPTIONS' }), deps(db))).status, 200);
  assert.equal((await handleRequest(new Request(FN, { method: 'PUT', body: '{}' }), deps(db))).status, 405);
  assert.equal((await handleRequest(new Request(FN, { method: 'POST', body: 'kein json' }), deps(db))).status, 400);
  const r = await handleRequest(post({ action: 'hack' }), deps(db));
  assert.deepEqual(await r.json(), { error: 'invalid_action' });
  const m = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), deps(db, null, { SUPABASE_URL: URL_ }));
  assert.equal(m.status, 500);
});

test('MIME: Betreff mit Umlauten, Text und HTML als Alternative, Punkt-Zeilen sicher', () => {
  const mail = { subject: 'Bitte bestätige deinen Platz', text: 'Zeile\n.Punkt', html: '<p>x</p>' };
  const mime = buildMime({
    from: 'emails@lunaxora.de',
    to: 'a@b.de',
    mail,
    unsubscribe: `${FN}?leave=${TOK}`,
    date: new Date('2026-11-07T12:00:00Z'),
    messageId: '<abc@lunaxora.de>',
  });
  assert.match(mime, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(mime, /Content-Type: multipart\/alternative; boundary="lx-abclunaxorade"/);
  assert.match(mime, /Content-Type: text\/plain; charset=UTF-8/);
  assert.match(mime, /Content-Type: text\/html; charset=UTF-8/);
  const [text, html] = decodeParts(mime);
  assert.equal(text, 'Zeile\r\n.Punkt');
  assert.equal(html, '<p>x</p>');
});

test('HTML der E-Mails: Anbieter-Angaben werden maskiert', () => {
  const m = welcomeMail({ place: 1, bonus: true, slots: 20, leave: 'https://x/#austragen=t', imprint: '<script>x</script>' });
  assert.doesNotMatch(m.html, /<script>/);
  assert.match(m.html, /&lt;script&gt;/);
});

test('E-Mail-Adressen: Umlaut-Domains als Punycode, nur gültige Adressen', () => {
  assert.equal(normEmail(' Info@Bäckerei-Müller.DE '), 'info@xn--bckerei-mller-bfb28a.de');
  assert.equal(normEmail('lea.brandt+warteliste@beispiel.de'), 'lea.brandt+warteliste@beispiel.de');
  for (const bad of ['', 'kein-at', 'a@b', 'a b@c.de', 'jörg@beispiel.de', 'a@b..de', 'a@-x/y.de', `${'x'.repeat(250)}@b.de`, 42, null])
    assert.equal(normEmail(bad), null, String(bad));
});

test('Eintragen: Fingerabdruck des Anschlusses, Bremse je Anschluss, zu große Anfrage', async () => {
  const smtp = fakeSmtp();
  let db = fakeDb({ waitlist_join: [{ o_action: 'confirm', o_token: TOK, o_bonus_left: 5, o_slots: 20 }] });
  await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }, '', { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' }), deps(db, smtp));
  const h1 = db.calls[0].body.p_ip_hash;
  assert.match(h1, /^[0-9a-f]{32}$/);
  assert.ok(!JSON.stringify(db.calls[0].body).includes('203.0.113.7'), 'IP nie im Klartext');
  db = fakeDb({ waitlist_join: [{ o_action: 'throttled', o_token: null, o_bonus_left: 5, o_slots: 20 }] });
  await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }, '', { 'x-forwarded-for': '203.0.113.7' }), deps(db, smtp));
  assert.equal(db.calls[0].body.p_ip_hash, h1, 'gleicher Anschluss = gleicher Fingerabdruck');
  db = fakeDb({ waitlist_join: [{ o_action: 'ip_limit', o_token: null, o_bonus_left: 5, o_slots: 20 }] });
  const res = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), deps(db, smtp));
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: 'too_many' });
  assert.equal(db.calls[0].body.p_ip_hash, null);
  const big = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000, pad: 'x'.repeat(5000) }), deps(db, smtp));
  assert.equal(big.status, 413);
});

test('Eintragen: Mailserver hängt -> Abbruch nach der Höchstdauer, Bremse zurück', async () => {
  const hang = { connect: async () => ({ read: () => new Promise(() => {}), write: async (p) => p.length, close() {} }) };
  const db = fakeDb({ waitlist_join: [{ o_action: 'confirm', o_token: TOK, o_bonus_left: 5, o_slots: 20 }], waitlist_mail_failed: null });
  const t0 = Date.now();
  const res = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), {
    ...deps(db, hang),
    smtpTimeoutMs: 1000,
    mailDeadlineMs: 300,
  });
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(res.status, 502);
  assert.deepEqual(await res.json(), { error: 'mail_failed' });
  assert.equal(db.calls[1].name, 'waitlist_mail_failed');
  assert.equal(db.calls[1].body.p_ip_hash, db.calls[0].body.p_ip_hash, 'Fehler am eigenen Server: Versuch zählt nicht');
});

test('Abmelden im Mailprogramm per GET: Weiterleitung zur Website, löscht nichts', async () => {
  const db = fakeDb({});
  let res = await handleRequest(new Request(`${FN}?leave=${TOK}`), deps(db));
  assert.equal(res.status, 303);
  assert.equal(res.headers.get('Location'), `https://lunaxora.de/#austragen=${TOK}`);
  assert.equal(db.calls.length, 0);
  res = await handleRequest(new Request(`${FN}?leave=quatsch`), deps(db));
  assert.equal(res.headers.get('Location'), 'https://lunaxora.de/');
});

test('Ohne Mail-Einstellungen: Anzeige, Austragen und Bestätigen gehen trotzdem', async () => {
  const env = { SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: 'eyJservice' };
  let db = fakeDb({ waitlist_stats: [{ o_bonus_left: 20, o_bonus_slots: 20 }] });
  assert.equal((await handleRequest(new Request(FN), deps(db, null, env))).status, 200);
  db = fakeDb({ waitlist_leave: true });
  const one = new Request(`${FN}?leave=${TOK}`, { method: 'POST', body: 'List-Unsubscribe=One-Click' });
  assert.deepEqual(await (await handleRequest(one, deps(db, null, env))).json(), { ok: true });
  db = fakeDb({ waitlist_confirm: [{ o_email: 'a@b.de', o_place: 3, o_bonus: true, o_new: true, o_slots: 20 }] });
  const res = await handleRequest(post({ action: 'confirm', token: TOK }), deps(db, null, env));
  assert.deepEqual(await res.json(), { ok: true, place: 3, bonus: true, slots: 20 });
  const join = await handleRequest(post({ action: 'join', email: 'a@b.de', ms: 4000 }), deps(fakeDb({}), null, env));
  assert.deepEqual(await join.json(), { error: 'missing_mail_login' });
});

test('Bestätigen: Willkommens-E-Mail läuft nach der Antwort weiter (waitUntil)', async () => {
  const smtp = fakeSmtp();
  const db = fakeDb({ waitlist_confirm: [{ o_email: 'a@b.de', o_place: 2, o_bonus: true, o_new: true, o_slots: 20 }] });
  const pending = [];
  const res = await handleRequest(post({ action: 'confirm', token: TOK }), { ...deps(db, smtp), waitUntil: (p) => pending.push(p) });
  assert.deepEqual(await res.json(), { ok: true, place: 2, bonus: true, slots: 20 });
  assert.equal(pending.length, 1);
  await Promise.all(pending);
  assert.equal(smtp.sent.length, 1);
});
