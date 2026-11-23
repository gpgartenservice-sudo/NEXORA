// Unit-Tests: Texte und Prüfungen der Seite „Konto löschen“. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  confirmOk,
  dateDe,
  deleteErrorText,
  deletedItems,
  deletionNotes,
  nameList,
} from '../../src/features/account/account-delete-logic.ts';
import { confirmMatches } from '../../supabase/functions/account/index.ts';

const NOW = Date.parse('2026-11-23T10:00:00Z');
const base = {
  subscription: null,
  companies: [{ id: 'a', name: 'Grau Gartenservice', primary: true, members: 0 }],
  team_people: 0,
  memberships: [],
};
const sub = (over) => ({ status: 'active', source: 'stripe', tier: 'pro', current_period_end: '2026-12-20T10:00:00Z', running: false, store: false, cancel_pending: false, ...over });

test('confirmOk: gleiche Regel wie die Server-Funktion', () => {
  for (const [typed, email] of [
    ['tom@example.de', 'Tom@Example.de'],
    ['  TOM@EXAMPLE.DE ', 'tom@example.de'],
    ['tom@example.com', 'tom@example.de'],
    ['', 'tom@example.de'],
    ['löschen', null],
    ['LÖSCHEN', ''],
    ['loeschen', null],
  ]) {
    assert.equal(confirmOk(typed, email), confirmMatches(typed, email), `${typed} / ${email}`);
  }
  assert.equal(confirmOk('tom@example.de', 'Tom@Example.de'), true);
  assert.equal(confirmOk('tom@example.com', 'tom@example.de'), false);
});

test('Liste und Datum', () => {
  assert.equal(nameList(['A']), 'A');
  assert.equal(nameList(['A', 'B']), 'A und B');
  assert.equal(nameList(['A', null, 'C']), 'A, eine Firma und C');
  assert.equal(dateDe('2026-12-20T23:30:00Z'), '21.12.2026', 'deutsche Zeit');
  assert.equal(dateDe(null), '');
  assert.equal(dateDe('kein Datum'), '');
});

test('deletedItems: eine Firma mit Namen, mehrere Firmen aufgezählt', () => {
  assert.match(deletedItems(base)[0], /^Deine Firma „Grau Gartenservice“ mit Kunden/);
  const two = deletedItems({ companies: [...base.companies, { id: 'b', name: 'Zweitfirma', primary: false, members: 0 }] });
  assert.match(two[0], /^Alle 2 Firmen \(Grau Gartenservice und Zweitfirma\)/);
  assert.match(deletedItems(null)[0], /^Deine Firma mit/);
  assert.ok(deletedItems(base).some((t) => /TikTok und Instagram/.test(t)));
});

test('deletionNotes: ohne Abo und Team keine Hinweise', () => {
  assert.deepEqual(deletionNotes(base, NOW), []);
  assert.deepEqual(deletionNotes(null, NOW), []);
});

test('deletionNotes: laufendes Abo -> erst kündigen; eingegangene Kündigung -> Kundenportal', () => {
  const [n] = deletionNotes({ ...base, subscription: sub({ running: true, tier: 'business' }) }, NOW);
  assert.equal(n.key, 'subscription');
  assert.equal(n.tone, 'error');
  assert.equal(n.title, 'Dein Business-Abo läuft noch');
  assert.match(n.text, /Kündige es zuerst – sonst würde Stripe weiter abbuchen/);
  const [p] = deletionNotes({ ...base, subscription: sub({ running: true, cancel_pending: true }) }, NOW);
  assert.match(p.text, /Kündigung ist bei uns eingegangen.*Kundenportal/);
});

test('deletionNotes: gekündigtes Abo mit Restlaufzeit -> endet sofort, keine Erstattung', () => {
  const [n] = deletionNotes({ ...base, subscription: sub({ status: 'canceled', tier: 'teams' }) }, NOW);
  assert.equal(n.key, 'paid_period');
  assert.equal(n.title, 'Dein Teams-Abo ist gekündigt');
  assert.match(n.text, /bis 20\.12\.2026.*endet es sofort.*erstatten wir nicht \(AGB § 13\)/);
  // abgelaufen oder Testphase: kein Hinweis
  assert.deepEqual(deletionNotes({ ...base, subscription: sub({ status: 'canceled', current_period_end: '2026-11-01T00:00:00Z' }) }, NOW), []);
  assert.deepEqual(deletionNotes({ ...base, subscription: sub({ status: 'trial', source: 'trial' }) }, NOW), []);
});

test('deletionNotes: App-Store-Abo -> dort kündigen, Löschen beendet es nicht', () => {
  const notes = deletionNotes({ ...base, subscription: sub({ source: 'apple', store: true }) }, NOW);
  assert.deepEqual(notes.map((x) => x.key), ['store']);
  assert.match(notes[0].text, /beendet dieses Abo nicht.*Einstellungen > dein Name > Abonnements/);
});

test('deletionNotes: Inhaber mit Team und Mitglied in fremden Teams', () => {
  const owner = deletionNotes({ ...base, team_people: 3 }, NOW);
  assert.equal(owner[0].key, 'team_owner');
  assert.equal(owner[0].title, '3 Personen verlieren den Zugang');
  assert.match(owner[0].text, /Ihre eigenen Konten bleiben.*Stunden vorher als CSV/);
  assert.equal(deletionNotes({ ...base, team_people: 1 }, NOW)[0].title, '1 Person verliert den Zugang');

  const member = deletionNotes({ ...base, memberships: [{ company_id: 'x', name: 'Muster GmbH' }] }, NOW);
  assert.equal(member[0].key, 'member');
  assert.equal(member[0].title, 'Du verlässt das Team von Muster GmbH');
  assert.match(member[0].text, /bleibt bei der Firma/);
  const two = deletionNotes({ ...base, memberships: [{ company_id: 'x', name: 'A' }, { company_id: 'y', name: 'B' }] }, NOW);
  assert.equal(two[0].title, 'Du verlässt die Teams von A und B');
});

test('deleteErrorText: verständliche Texte mit Ausweg', () => {
  assert.match(deleteErrorText('confirm_mismatch', 400), /passt nicht zu deinem Konto/);
  assert.match(deleteErrorText('subscription_active', 409), /Kündige es zuerst/);
  assert.match(deleteErrorText(undefined, 401), /Anmeldung ist abgelaufen/);
  assert.match(deleteErrorText('user_not_found', 404), /schon gelöscht/);
  const missing = deleteErrorText(undefined, 404);
  assert.match(missing, /gerade nicht erreichbar/);
  assert.match(missing, /kontakt@lunaxora\.de.*lunaxora\.de\/kuendigen\//s);
  const broken = deleteErrorText('delete_failed', 500, 'Database error deleting user');
  assert.match(broken, /nicht geklappt.*kontakt@lunaxora\.de/s);
  assert.match(broken, /Technische Details: 500 delete_failed – Database error deleting user/);
  assert.match(deleteErrorText('offline', 0), /Internetverbindung/);
  assert.doesNotMatch(deleteErrorText('offline', 0), /Technische Details/);
});
