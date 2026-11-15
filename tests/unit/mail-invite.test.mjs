// Unit-Tests: Datenschutz-Link über die Server-Funktion "mail" (ohne Netz). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleRequest, inviteMail } from '../../supabase/functions/mail/index.ts';

const SB = 'https://projekt.supabase.co';
const ID = '22222222-2222-2222-2222-222222222222';
const TOKEN = 'A'.repeat(43);

function setup({ invite = { email: 'kunde@example.de', token: TOKEN, expires_at: '2026-12-15T10:00:00Z', completed_at: null }, plan = 'free' } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u === `${SB}/auth/v1/user`) return Response.json({ id: 'u1', email: 'nutzer@example.de' });
    if (u.startsWith(`${SB}/rest/v1/customer_invites?id=eq.${ID}`)) return Response.json(invite ? [invite] : []);
    if (u === `${SB}/rest/v1/rpc/my_plan`) return Response.json({ plan });
    if (u.startsWith(`${SB}/rest/v1/email_log?`)) return Response.json([]);
    if (u === `${SB}/rest/v1/email_log`) return new Response(null, { status: 201 });
    if (u === 'https://api.resend.com/emails') return Response.json({ id: 're_1' });
    return new Response('unerwartet', { status: 500 });
  };
  const deps = {
    env: (k) => ({ SUPABASE_URL: SB, RESEND_API_KEY: 're_test', MAIL_FROM: 'emails@lunaxora.de' })[k],
    fetch,
    now: () => new Date('2026-11-15T10:00:00Z'),
  };
  const call = (body) =>
    handleRequest(
      new Request(`${SB}/functions/v1/mail`, {
        method: 'POST',
        headers: { Authorization: 'Bearer jwt', apikey: 'pk', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      deps,
    );
  return { calls, call };
}

test('inviteMail: Link auf die Kundenseite, Gültigkeit und Absender im Text', () => {
  const m = inviteMail({ fromName: 'GP Gartenservice', token: TOKEN, expiresAt: '2026-12-15T10:00:00Z', base: 'https://lunaxora.de/Kunde/' });
  assert.equal(m.link, `https://lunaxora.de/Kunde/?einladung=${TOKEN}`);
  assert.equal(m.subject, 'GP Gartenservice: Bitte tragen Sie Ihre Kontaktdaten ein');
  assert.ok(m.text.includes(`\n${m.link}\n`), 'Link steht allein in einer Zeile');
  assert.match(m.text, /bis zum 15\.12\.2026 gültig/);
  assert.match(m.text, /erst gespeichert, wenn Sie das Formular abschicken/);
  assert.ok(m.text.endsWith('Viele Grüße\nGP Gartenservice'));
});

test('Datenschutz-Link: geht auch im Gratis-Abo, Empfänger und Text kommen aus der Einladung', async () => {
  const { calls, call } = setup();
  const res = await call({
    kind: 'invite',
    invite_id: ID,
    from_name: 'GP Gartenservice',
    reply_to: 'info@example.de',
    // wird ignoriert:
    to: 'fremd@example.de',
    subject: 'Werbung',
    text: 'Kauf jetzt!',
  });
  assert.equal(res.status, 200);
  assert.ok(!calls.some((c) => c.url.endsWith('/rpc/my_plan')), 'kein Abo-Check für den Datenschutz-Link');
  const sent = JSON.parse(calls.find((c) => c.url === 'https://api.resend.com/emails').init.body);
  assert.deepEqual(sent.to, ['kunde@example.de']);
  assert.equal(sent.from, 'GP Gartenservice <emails@lunaxora.de>');
  assert.equal(sent.reply_to, 'info@example.de');
  assert.equal(sent.subject, 'GP Gartenservice: Bitte tragen Sie Ihre Kontaktdaten ein');
  assert.match(sent.text, new RegExp(`https://lunaxora\\.de/Kunde/\\?einladung=${TOKEN}`));
  assert.doesNotMatch(sent.text, /Kauf jetzt/);
  assert.equal(sent.attachments, undefined);
  const log = JSON.parse(calls.find((c) => c.url === `${SB}/rest/v1/email_log`).init.body);
  assert.equal(log.kind, 'invite');
  assert.equal(log.to_email, 'kunde@example.de');
});

test('Datenschutz-Link: ungültige, fremde oder erledigte Einladung -> Fehler, nichts verschickt', async () => {
  let s = setup();
  assert.equal((await s.call({ kind: 'invite', invite_id: 'kein-uuid' })).status, 400);
  s = setup({ invite: null });
  let res = await s.call({ kind: 'invite', invite_id: ID });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'invite_not_found');
  s = setup({ invite: { email: 'kunde@example.de', token: TOKEN, expires_at: '2026-12-15T10:00:00Z', completed_at: '2026-11-14T10:00:00Z' } });
  res = await s.call({ kind: 'invite', invite_id: ID });
  assert.equal(res.status, 409);
  assert.ok(!s.calls.some((c) => c.url === 'https://api.resend.com/emails'));
});

test('Normale E-Mails bleiben Pro', async () => {
  const { call } = setup();
  const res = await call({ to: 'kunde@example.de', subject: 'Rechnung', text: 'Hallo', kind: 'invoice', from_name: 'GP' });
  assert.equal(res.status, 402);
  assert.equal((await res.json()).error, 'pro_required');
});
