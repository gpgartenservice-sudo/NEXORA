// Unit-Tests: Sicherheit der Funktion "mail" (Rechte, Abo, Bremse, Protokoll vor dem Versand)
// und Auftragsbestätigung nach der Online-Annahme (§ 312f BGB). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { acceptanceMail, handleRequest, withdrawalTexts } from '../../supabase/functions/mail/index.ts';

const SB = 'https://projekt.supabase.co';
const COMPANY = '33333333-3333-3333-3333-333333333333';
const DOC = '55555555-5555-5555-5555-555555555555';
const LOG = '44444444-4444-4444-4444-444444444444';
const TOKEN = 'A'.repeat(43);
const PDF = 'JVBERi0xLjQK';

const SELLER = { company_name: 'Max Muster Gartenservice', street: 'Musterweg 1', zip: '12345', city: 'Musterstadt', phone: '0123 456', email: 'echt@firma.de' };
const ACCEPT = {
  document_id: DOC,
  company_id: COMPANY,
  number: 'AN-2026-0007',
  issued_on: '2026-11-20',
  valid_until: '2026-12-20',
  accepted_at: '2026-11-23T13:05:00Z',
  accepted_name: 'Erika Beispiel',
  accepted_email: 'erika@example.com',
  data: {
    buyer: { name: 'Erika Beispiel', company: null, address: 'Gartenweg 2, 12345 Musterstadt' },
    items: [{ description: 'Heckenschnitt', details: 'inkl. Abfuhr', quantity: 2, unit: 'Std.', unit_price: 45 }],
    totals: { discount_percent: 0, discount_amount: 0, net: 90, vat_rate: 19, vat_amount: 17.1, gross: 107.1 },
    small_business: false,
    monthly: false,
  },
  seller: SELLER,
};

function setup(o = {}) {
  const opt = { plan: 'pro', may: true, docs: [{ id: DOC }], log: [], logStatus: 201, mail: 200, claim: ACCEPT, service: 'sb_secret_test', ...o };
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init, method: init.method ?? 'GET' });
    if (u === `${SB}/auth/v1/user`) return Response.json({ id: 'u1', email: 'nutzer@example.de' });
    if (u === `${SB}/rest/v1/rpc/nexora_workspace`) return Response.json(COMPANY);
    if (u === `${SB}/rest/v1/rpc/nexora_may`) return Response.json(opt.may);
    if (u === `${SB}/rest/v1/rpc/my_plan`) return Response.json({ plan: opt.plan });
    if (u.startsWith(`${SB}/rest/v1/documents?`)) return Response.json(opt.docs);
    if (u.startsWith(`${SB}/rest/v1/email_log?select`)) return Response.json(opt.log);
    if (u === `${SB}/rest/v1/email_log`) return Response.json(opt.logStatus < 300 ? [{ id: LOG }] : { message: 'kaputt' }, { status: opt.logStatus });
    if (u.startsWith(`${SB}/rest/v1/email_log?id=eq.`)) return new Response(null, { status: 204 });
    if (u === `${SB}/rest/v1/rpc/offer_acceptance_mail`) return Response.json(opt.claim);
    if (u === `${SB}/rest/v1/rpc/offer_acceptance_mailed`) return Response.json({ ok: true });
    if (u === 'https://api.resend.com/emails') return opt.mail === 200 ? Response.json({ id: 're_1' }) : Response.json({ message: 'nein' }, { status: opt.mail });
    return new Response('unerwartet', { status: 500 });
  };
  const deps = {
    env: (k) => ({ SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: opt.service, RESEND_API_KEY: 're_test', MAIL_FROM: 'emails@lunaxora.de' })[k],
    fetch,
    now: () => new Date('2026-11-23T14:00:00Z'),
  };
  const call = (body, headers = { Authorization: 'Bearer jwt', apikey: 'pk' }) =>
    handleRequest(
      new Request(`${SB}/functions/v1/mail`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      deps,
    );
  return { calls, call };
}

const OFFER = { to: 'kunde@example.de', subject: 'Angebot AN-1', text: 'Hallo', kind: 'offer', document_id: DOC, from_name: 'GP', attachments: [{ filename: 'Angebot.pdf', content: PDF }] };
const mailCall = (calls) => calls.find((c) => c.url === 'https://api.resend.com/emails');

test('Versand: Protokoll VOR dem Versand, mit dem Server-Schlüssel und der Firma', async () => {
  const { calls, call } = setup();
  const res = await call(OFFER);
  assert.equal(res.status, 200);
  const iLog = calls.findIndex((c) => c.url === `${SB}/rest/v1/email_log` && c.method === 'POST');
  const iMail = calls.findIndex((c) => c.url === 'https://api.resend.com/emails');
  assert.ok(iLog >= 0 && iLog < iMail, 'erst Protokoll, dann Versand');
  const log = calls[iLog];
  assert.equal(log.init.headers.apikey, 'sb_secret_test');
  assert.deepEqual(JSON.parse(log.init.body), { user_id: COMPANY, document_id: DOC, kind: 'offer', to_email: 'kunde@example.de', subject: 'Angebot AN-1' });
  const count = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/email_log?select`));
  assert.match(count.url, new RegExp(`user_id=eq\\.${COMPANY}`), 'Bremse zählt je Firma');
  assert.equal(count.init.headers.apikey, 'sb_secret_test');
  const patch = calls.find((c) => c.url === `${SB}/rest/v1/email_log?id=eq.${LOG}` && c.method === 'PATCH');
  assert.deepEqual(JSON.parse(patch.init.body), { provider_id: 're_1' });
  const doc = calls.find((c) => c.url.startsWith(`${SB}/rest/v1/documents?`));
  assert.match(doc.url, new RegExp(`id=eq\\.${DOC}&user_id=eq\\.${COMPANY}`));
});

test('Versand: Protokoll klappt nicht -> nichts verschickt', async () => {
  const { calls, call } = setup({ logStatus: 403 });
  const res = await call(OFFER);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'log_error');
  assert.ok(!mailCall(calls));
});

test('Versand: Fehler beim Anbieter -> Eintrag wird wieder gelöscht', async () => {
  const { calls, call } = setup({ mail: 500 });
  const res = await call(OFFER);
  assert.ok(res.status >= 500);
  assert.ok(calls.some((c) => c.url === `${SB}/rest/v1/email_log?id=eq.${LOG}` && c.method === 'DELETE'));
});

test('Versand: fremdes oder erfundenes Dokument -> abgelehnt', async () => {
  const { calls, call } = setup({ docs: [] });
  const res = await call(OFFER);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_document');
  assert.ok(!mailCall(calls));
});

test('Versand: ohne Recht „Dokumente“ im Team -> 403', async () => {
  const { calls, call } = setup({ may: false });
  const res = await call(OFFER);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'role_forbidden', area: 'dokumente' });
  assert.ok(!mailCall(calls));
  const may = calls.find((c) => c.url.endsWith('/rpc/nexora_may'));
  assert.deepEqual(JSON.parse(may.init.body), { p_area: 'dokumente', p_level: 'write' });
});

test('Versand: Gratis nein, Testphase mit kleiner Bremse, Pro mit großer', async () => {
  assert.equal((await setup({ plan: 'free' }).call(OFFER)).status, 402);
  const five = Array.from({ length: 5 }, () => ({ created_at: '2026-11-23T13:30:00Z' }));
  const trial = await setup({ plan: 'trial', log: five }).call(OFFER);
  assert.equal(trial.status, 429);
  assert.deepEqual(await trial.json(), { error: 'too_many_this_hour', trial: true });
  assert.equal((await setup({ plan: 'pro', log: five }).call(OFFER)).status, 200);
  const twenty = Array.from({ length: 20 }, () => ({ created_at: '2026-11-23T02:00:00Z' }));
  assert.equal((await (await setup({ plan: 'trial', log: twenty }).call(OFFER)).json()).error, 'too_many_today');
});

test('Versand: ohne Server-Schlüssel geht nichts raus', async () => {
  const { calls, call } = setup({ service: undefined });
  const res = await call(OFFER);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'missing_service_key');
  assert.ok(!mailCall(calls));
});

test('Auftragsbestätigung: ohne Anmeldung, an die E-Mail aus der Annahme + Kopie an die Firma', async () => {
  const { calls, call } = setup();
  const res = await call({ kind: 'acceptance', token: TOKEN, to: 'fremd@spam.de', text: 'Werbung' }, { apikey: 'pk' });
  assert.equal(res.status, 200);
  assert.ok(!calls.some((c) => c.url.includes('/auth/v1/user')));
  const claim = calls.find((c) => c.url.endsWith('/rpc/offer_acceptance_mail'));
  assert.equal(claim.init.headers.apikey, 'sb_secret_test');
  const sent = JSON.parse(mailCall(calls).init.body);
  assert.deepEqual(sent.to, ['erika@example.com', 'echt@firma.de']);
  assert.equal(sent.reply_to, 'echt@firma.de');
  assert.equal(sent.subject, 'Auftragsbestätigung: Angebot AN-2026-0007');
  assert.ok(!sent.text.includes('Werbung'));
  assert.match(sent.text, /https:\/\/lunaxora\.de\/Angebot\/\?angebot=A{43}/);
  assert.ok(calls.some((c) => c.url.endsWith('/rpc/offer_acceptance_mailed')));

  const done = setup({ claim: { error: 'already_sent' } });
  assert.equal((await done.call({ kind: 'acceptance', token: TOKEN }, { apikey: 'pk' })).status, 409);
  assert.ok(!mailCall(done.calls));
});

test('acceptanceMail: Vertragsinhalt, Zeitpunkt, bei Privatkunden Belehrung und Formular', () => {
  const raw = acceptanceMail(ACCEPT, 'https://lunaxora.de/Angebot/?angebot=x');
  // Beträge mit geschütztem Leerzeichen (kein Zeilenumbruch zwischen Zahl und €)
  const m = { ...raw, text: raw.text.replace(/\u00a0/g, ' ') };
  assert.equal(m.fromName, 'Max Muster Gartenservice');
  assert.match(m.text, /^Guten Tag Erika Beispiel,/);
  assert.match(m.text, /Angebot AN-2026-0007 vom 20\.11\.2026 am 23\.11\.2026 um 14:05 Uhr online angenommen/);
  assert.match(m.text, /1\. Heckenschnitt – 2 Std\. × 45,00 € = 90,00 €\n {3}inkl\. Abfuhr/);
  assert.match(m.text, /Netto: 90,00 €\nzzgl\. 19 % USt: 17,10 €\nGesamt: 107,10 €/);
  assert.match(m.text, /Auftraggeber: Erika Beispiel, Gartenweg 2, 12345 Musterstadt/);
  assert.match(m.text, /WIDERRUFSBELEHRUNG/);
  assert.match(m.text, /MUSTER-WIDERRUFSFORMULAR/);
  assert.match(m.text, /Schaltfläche „Vertrag widerrufen“/);
  assert.match(m.text, /schreiben Sie das bitte ausdrücklich per E-Mail an echt@firma\.de/);

  const firmRaw = acceptanceMail({ ...ACCEPT, data: { ...ACCEPT.data, buyer: { name: 'Peter', company: 'Muster GmbH', address: null }, small_business: true } }, null);
  const firm = { text: firmRaw.text.replace(/\u00a0/g, ' ') };
  assert.doesNotMatch(firm.text, /WIDERRUFSBELEHRUNG/, 'Firmenkunden: keine Belehrung');
  assert.match(firm.text, /Gesamt: 107,10 €\nGemäß § 19 UStG/);
  assert.doesNotMatch(firm.text, /Netto/);
});

test('Belehrung in der Mail = Belehrung in App, PDF und auf der Angebotsseite', async () => {
  const { withdrawalNotice, withdrawalForm, earlyStartHint, EMPTY_SELLER } = await import('../../src/features/documents/document-logic.ts');
  const seller = { ...EMPTY_SELLER, ...SELLER };
  const w = withdrawalTexts(SELLER);
  assert.deepEqual(w.notice, withdrawalNotice(seller));
  assert.deepEqual(w.form, withdrawalForm(seller));
  assert.equal(w.early, earlyStartHint(seller));
  const noMail = { ...SELLER, email: null, phone: null };
  assert.equal(withdrawalTexts(noMail).early, earlyStartHint({ ...seller, email: null, phone: null }));
});
