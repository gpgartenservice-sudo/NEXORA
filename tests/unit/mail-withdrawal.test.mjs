// Unit-Tests: Eingangsbestätigung für den Online-Widerruf (Funktion "mail", kind "withdrawal"). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleRequest, withdrawalMail } from '../../supabase/functions/mail/index.ts';

const SB = 'https://projekt.supabase.co';
const TOKEN = 'A'.repeat(43);

const INFO = {
  number: 'AN-2026-0003',
  issued_on: '2026-11-22',
  accepted_at: '2026-11-22T18:00:00Z',
  withdrawn_at: '2026-11-23T13:05:00Z',
  withdrawal: { name: 'Erika Beispiel', contract: 'Angebot AN-2026-0003 vom 22.11.2026', email: 'erika@example.com' },
  seller: { company_name: 'Max Muster Gartenservice', street: 'Musterweg 1', zip: '12345', city: 'Musterstadt', phone: '0123 456', email: 'max@example.com' },
};

function setup({ claim = INFO, claimStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u === `${SB}/rest/v1/rpc/offer_withdrawal_mail`) return Response.json(claim, { status: claimStatus });
    if (u === `${SB}/rest/v1/rpc/offer_withdrawal_mailed`) return Response.json({ ok: true });
    if (u === 'https://api.resend.com/emails') return Response.json({ id: 're_1' });
    return new Response('unerwartet', { status: 500 });
  };
  const deps = {
    env: (k) => ({ SUPABASE_URL: SB, RESEND_API_KEY: 're_test', MAIL_FROM: 'emails@lunaxora.de' })[k],
    fetch,
    now: () => new Date('2026-11-23T13:05:01Z'),
  };
  const call = (body, headers = { apikey: 'sb_publishable_x' }) =>
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

test('withdrawalMail: Inhalt der Erklärung, Datum und Uhrzeit des Eingangs (deutsche Zeit)', () => {
  const m = withdrawalMail(INFO);
  assert.equal(m.subject, 'Eingangsbestätigung: Ihr Widerruf (Angebot AN-2026-0003)');
  assert.equal(m.fromName, 'Max Muster Gartenservice');
  assert.match(m.text, /^Guten Tag Erika Beispiel,/);
  assert.match(m.text, /Eingang: 23\.11\.2026 um 14:05 Uhr/);
  assert.match(m.text, /„Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: Angebot AN-2026-0003 vom 22\.11\.2026“/);
  assert.match(m.text, /Name: Erika Beispiel\nVertrag: Angebot AN-2026-0003 vom 22\.11\.2026\nE-Mail für diese Bestätigung: erika@example\.com/);
  assert.match(m.text, /online angenommen am 22\.11\.2026/);
  assert.match(m.text, /Eine Kopie dieser E-Mail geht an Max Muster Gartenservice\./);
  assert.ok(m.text.endsWith('Max Muster Gartenservice\nMusterweg 1, 12345 Musterstadt, Tel. 0123 456, E-Mail max@example.com'));
});

test('Widerruf: ohne Anmeldung, Empfänger nur aus der Datenbank, Kopie an den Selbstständigen', async () => {
  const { calls, call } = setup();
  const res = await call({ kind: 'withdrawal', token: TOKEN, to: 'fremd@example.de', text: 'Werbung' });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).to, ['erika@example.com', 'max@example.com']);
  assert.ok(!calls.some((c) => c.url.includes('/auth/v1/user')), 'keine Anmeldung nötig');
  const claim = calls.find((c) => c.url.endsWith('/rpc/offer_withdrawal_mail'));
  assert.equal(claim.init.headers.apikey, 'sb_publishable_x');
  assert.equal(claim.init.headers.Authorization, undefined, 'mit den Rechten eines Besuchers');
  assert.deepEqual(JSON.parse(claim.init.body), { p_token: TOKEN });
  const sent = JSON.parse(calls.find((c) => c.url === 'https://api.resend.com/emails').init.body);
  assert.deepEqual(sent.to, ['erika@example.com', 'max@example.com']);
  assert.equal(sent.reply_to, 'max@example.com');
  assert.equal(sent.from, 'Max Muster Gartenservice <emails@lunaxora.de>');
  assert.ok(!sent.text.includes('Werbung'));
  assert.ok(calls.some((c) => c.url.endsWith('/rpc/offer_withdrawal_mailed')), 'als verschickt vermerkt');
});

test('Widerruf: gleiche Adresse nur einmal, Fehler aus der Datenbank, falscher Link', async () => {
  const same = setup({ claim: { ...INFO, withdrawal: { ...INFO.withdrawal, email: 'MAX@example.com' } } });
  assert.deepEqual((await (await same.call({ kind: 'withdrawal', token: TOKEN })).json()).to, ['MAX@example.com']);

  const sent = setup({ claim: { error: 'already_sent' } });
  const r1 = await sent.call({ kind: 'withdrawal', token: TOKEN });
  assert.equal(r1.status, 409);
  assert.equal((await r1.json()).error, 'already_sent');
  assert.ok(!sent.calls.some((c) => c.url.includes('resend')));

  const old = setup({ claimStatus: 404, claim: { code: 'PGRST202' } });
  assert.equal((await (await old.call({ kind: 'withdrawal', token: TOKEN })).json()).error, 'missing_withdrawal_function');

  const bad = setup();
  const r2 = await bad.call({ kind: 'withdrawal', token: 'kurz' });
  assert.equal(r2.status, 400);
  assert.equal(bad.calls.length, 0);
});

test('Andere E-Mails brauchen weiter die Anmeldung', async () => {
  const { call } = setup();
  const res = await call({ kind: 'offer', to: 'kunde@example.de', subject: 'x', text: 'y' });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'not_signed_in');
});

test('Erklärung: gleicher Wortlaut wie auf der Angebotsseite', async () => {
  const { withdrawalStatement: page } = await import('../../src/features/documents/document-logic.ts');
  const { withdrawalStatement: mail } = await import('../../supabase/functions/mail/index.ts');
  assert.equal(mail('Angebot X'), page('Angebot X'));
  const { readFileSync } = await import('node:fs');
  const web = readFileSync(new URL('../../web-angebot/index.html', import.meta.url), 'utf8');
  assert.ok(web.includes("'Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: ' + contract"));
  const { ONLINE_WITHDRAWAL_NOTE } = await import('../../src/features/documents/document-logic.ts');
  assert.ok(web.includes(`var ONLINE_NOTE = '${ONLINE_WITHDRAWAL_NOTE}';`), 'Belehrung auf lunaxora.de = App');
});
