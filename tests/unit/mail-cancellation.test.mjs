// Unit-Tests: Kündigungsbestätigung „Verträge hier kündigen“ (Funktion "mail", kind "cancellation", § 312k BGB). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cancellationEnd, cancellationMail, handleRequest } from '../../supabase/functions/mail/index.ts';

const SB = 'https://projekt.supabase.co';
const TOKEN = 'c'.repeat(64);

const INFO = {
  received_at: '2026-11-23T13:05:00Z',
  name: 'Erika Beispiel',
  email: 'erika@example.com',
  company: 'Beispiel Gartenbau',
  contract: 'abo',
  kind: 'ordentlich',
  reason: null,
  wished_on: null,
  plan: 'pro',
  period_end: '2026-12-14T09:00:00Z',
  trial_ends_at: null,
  extra_companies: 0,
  effect: 'period_end',
  ends_on: '2026-12-14',
};

function setup({ claim = INFO, claimStatus = 200, env = {} } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u === `${SB}/rest/v1/rpc/contract_cancel_mail`) return Response.json(claim, { status: claimStatus });
    if (u === `${SB}/rest/v1/rpc/contract_cancel_mailed`) return Response.json({ ok: true });
    if (u === 'https://api.resend.com/emails') return Response.json({ id: 're_1' });
    return new Response('unerwartet', { status: 500 });
  };
  const all = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test', RESEND_API_KEY: 're_test', MAIL_FROM: 'emails@lunaxora.de', ...env };
  const deps = { env: (k) => all[k], fetch, now: () => new Date('2026-11-23T13:05:01Z') };
  const call = (body) =>
    handleRequest(
      new Request(`${SB}/functions/v1/mail`, {
        method: 'POST',
        headers: { apikey: 'sb_publishable_x', 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      deps,
    );
  return { calls, call };
}

test('cancellationMail: Inhalt der Kündigung, Eingang in deutscher Zeit, Vertragsende', () => {
  const m = cancellationMail(INFO);
  assert.equal(m.fromName, 'LUNAXORA');
  assert.equal(m.subject, 'Eingangsbestätigung: deine Kündigung bei LUNAXORA');
  assert.match(m.text, /^Hallo Erika Beispiel,\n\ndeine Kündigung ist bei uns eingegangen\./);
  assert.match(m.text, /Eingang: 23\.11\.2026 um 14:05 Uhr/);
  assert.match(
    m.text,
    /Name: Erika Beispiel\nE-Mail: erika@example\.com\nFirma: Beispiel Gartenbau\nVertrag: LUNAXORA-Abo \(Pro, Business oder Teams\)\nArt: Ordentliche Kündigung\nZeitpunkt: Zum nächstmöglichen Zeitpunkt/,
  );
  assert.match(m.text, /Wann endet dein Vertrag\?\nDein Pro-Abo endet am 14\.12\.2026, zum Ende des bezahlten Zeitraums\./);
  assert.match(m.text, /danach geht es mit dem kostenlosen Tarif Gratis weiter\. Deine Daten bleiben erhalten\./);
  assert.ok(m.text.endsWith('LUNAXORA\nLUNAXORA GbR, Zu den Gärten 60, 59755 Arnsberg, kontakt@lunaxora.de'));
  assert.doesNotMatch(m.text, /Grund:/);
});

test('cancellationMail: fristlos mit Grund, Wunschtermin, Konto', () => {
  const f = cancellationMail({ ...INFO, kind: 'ausserordentlich', reason: 'App geht seit Wochen nicht', effect: 'immediate', ends_on: '2026-11-23' });
  assert.match(f.text, /Art: Außerordentliche \(fristlose\) Kündigung\nGrund: App geht seit Wochen nicht\nZeitpunkt: Sofort \(fristlos\)/);
  assert.match(f.text, /wird mit dem Eingang am 23\.11\.2026 wirksam, wenn ein wichtiger Grund vorliegt/);
  assert.match(f.text, /gilt deine Kündigung als ordentliche Kündigung zum Ende des bezahlten Zeitraums am 14\.12\.2026\./);

  const w = cancellationMail({ ...INFO, wished_on: '2027-03-15', effect: 'wished', ends_on: null });
  assert.match(w.text, /Zeitpunkt: Zum 15\.03\.2027/);
  assert.match(w.text, /endet zum Ende des Abrechnungszeitraums, in den dein Wunschtermin 15\.03\.2027 fällt/);

  const k = cancellationEnd({ ...INFO, contract: 'konto' });
  assert.match(k, /endet am 14\.12\.2026/);
  assert.match(k, /löschen wir, sobald du uns das mit einer kurzen Antwort auf diese E-Mail bestätigst/);
  assert.doesNotMatch(k, /Gratis weiter/);
});

test('cancellationEnd: Store, Testphase, kein Abo, keine Zusatzfirma, mehrere Zusatzfirmen, Sonderfall', () => {
  assert.match(cancellationEnd({ ...INFO, effect: 'store', ends_on: null }), /App Store oder Google Play.*Einstellungen > dein Name > Abonnements/);
  assert.match(
    cancellationEnd({ ...INFO, plan: 'trial', effect: 'trial', ends_on: null, trial_ends_at: '2026-11-30T10:00:00Z' }),
    /Testphase\. Sie endet von selbst am 30\.11\.2026 und kostet nichts.*Du musst nichts weiter tun\./,
  );
  assert.match(cancellationEnd({ ...INFO, plan: null, effect: 'free', ends_on: null }), /kein bezahltes Abo, es fallen also keine Kosten an/);
  assert.match(cancellationEnd({ ...INFO, contract: 'zusatzfirma', effect: 'no_extra', ends_on: null }), /keine zusätzliche Firma gebucht/);
  const extra = cancellationEnd({ ...INFO, contract: 'zusatzfirma', extra_companies: 2 });
  assert.match(extra, /Buchung der zusätzlichen Firma endet am 14\.12\.2026/);
  assert.match(extra, /mehrere zusätzliche Firmen gebucht/);
  assert.doesNotMatch(cancellationEnd({ ...INFO, contract: 'zusatzfirma', extra_companies: 1 }), /mehrere/);
  assert.match(cancellationEnd({ ...INFO, plan: 'teams', effect: 'check', ends_on: null }), /Dein Teams-Abo wurde von Hand für dich eingerichtet/);
});

test('Kündigung: ohne Anmeldung, Empfänger nur aus der Datenbank, Kopie an kontakt@lunaxora.de', async () => {
  const { calls, call } = setup();
  const res = await call({ kind: 'cancellation', token: TOKEN, to: 'boese@example.com', text: 'Spam' });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body.to, ['erika@example.com', 'kontakt@lunaxora.de']);

  assert.equal(calls[0].url, `${SB}/rest/v1/rpc/contract_cancel_mail`);
  assert.equal(calls[0].init.headers.apikey, 'sb_secret_test');
  assert.deepEqual(JSON.parse(calls[0].init.body), { p_token: TOKEN });
  const sent = JSON.parse(calls[1].init.body);
  assert.deepEqual(sent.to, ['erika@example.com', 'kontakt@lunaxora.de']);
  assert.equal(sent.reply_to, 'kontakt@lunaxora.de');
  assert.equal(sent.from, 'LUNAXORA <emails@lunaxora.de>');
  assert.equal(sent.subject, 'Eingangsbestätigung: deine Kündigung bei LUNAXORA');
  assert.doesNotMatch(sent.text, /Spam/);
  assert.equal(calls[2].url, `${SB}/rest/v1/rpc/contract_cancel_mailed`);
  assert.ok(!calls.some((c) => c.url.includes('/auth/v1/user')), 'keine Anmeldung nötig');
});

test('Kündigung: Kopie-Adresse aus CANCEL_COPY_TO', async () => {
  const { call } = setup({ env: { CANCEL_COPY_TO: 'abo@lunaxora.de' } });
  const body = await (await call({ kind: 'cancellation', token: TOKEN })).json();
  assert.deepEqual(body.to, ['erika@example.com', 'abo@lunaxora.de']);
});

test('Kündigung: Fehlerfälle', async () => {
  assert.equal((await setup().call({ kind: 'cancellation', token: 'kurz' })).status, 400);
  const notFound = await setup({ claim: { error: 'not_found' } }).call({ kind: 'cancellation', token: TOKEN });
  assert.equal(notFound.status, 404);
  const twice = await setup({ claim: { error: 'already_sent' } }).call({ kind: 'cancellation', token: TOKEN });
  assert.equal(twice.status, 409);
  const missing = await setup({ claimStatus: 404, claim: { code: 'PGRST202' } }).call({ kind: 'cancellation', token: TOKEN });
  assert.deepEqual(await missing.json(), { error: 'missing_cancellation_function' });
  const badTo = await setup({ claim: { ...INFO, email: 'kein-at' } }).call({ kind: 'cancellation', token: TOKEN });
  assert.equal(badTo.status, 400);
});

test('Jahresabo: Hinweis auf einen Monat Frist für Verbraucher nach dem ersten Jahr (§ 309 Nr. 9 BGB)', () => {
  const yearly = cancellationEnd({ ...INFO, period_end: '2027-06-30T09:00:00Z', ends_on: '2027-06-30' });
  assert.match(yearly, /Dein Pro-Abo endet am 30\.06\.2027/);
  assert.match(yearly, /als Verbraucher abgeschlossen und ist sein erstes Jahr schon vorbei, endet es früher: am 23\.12\.2026/);
  assert.match(yearly, /anteilig zurück/);
  // Monatsabo: kein Hinweis
  assert.doesNotMatch(cancellationEnd(INFO), /Verbraucher/);
  // 31. Januar + 1 Monat = 28. Februar
  const jan = cancellationEnd({ ...INFO, received_at: '2027-01-31T10:00:00Z', period_end: '2027-09-01T00:00:00Z', ends_on: '2027-09-01' });
  assert.match(jan, /endet es früher: am 28\.02\.2027/);
});

test('Widerruf (kind widerruf): Erklärung, Eingang, was passiert', () => {
  const w = cancellationMail({ ...INFO, kind: 'widerruf', effect: 'withdrawal', ends_on: '2026-11-23' });
  assert.equal(w.subject, 'Eingangsbestätigung: dein Widerruf bei LUNAXORA');
  assert.match(w.text, /^Hallo Erika Beispiel,\n\ndein Widerruf ist bei uns eingegangen\./);
  assert.match(w.text, /Eingang: 23\.11\.2026 um 14:05 Uhr/);
  assert.match(
    w.text,
    /„Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung der folgenden Dienstleistung: LUNAXORA-Abo \(Pro, Business oder Teams\)“/,
  );
  assert.match(w.text, /E-Mail für diese Bestätigung: erika@example\.com/);
  assert.match(w.text, /endet dein Pro-Abo mit dem Eingang dieses Widerrufs/);
  assert.match(w.text, /spätestens innerhalb von 14 Tagen/);
  assert.doesNotMatch(w.text, /Art: |Zeitpunkt: /);
  assert.match(cancellationMail({ ...INFO, kind: 'widerruf', effect: 'store' }).text, /reportaproblem\.apple\.com/);
  assert.match(cancellationMail({ ...INFO, kind: 'widerruf', effect: 'free' }).text, /nichts zu erstatten/);
});
