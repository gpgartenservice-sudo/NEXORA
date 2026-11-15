// Unit-Tests: neue Kunden per Datenschutz-Link. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  inviteExpired,
  inviteExpiry,
  inviteStatus,
  listGerman,
  privacyGaps,
  sameEmail,
} from '../../src/features/crm/invite-logic.ts';

const NOW = new Date('2026-11-15T10:00:00Z');
const seller = {
  company_name: 'GP Gartenservice',
  owner_name: null,
  street: 'Weg 1',
  zip: '12345',
  city: 'Musterstadt',
  email: 'info@example.de',
  privacy_url: null,
};

test('Datenschutzerklärung: eigener Link reicht, sonst braucht das Muster Name, Anschrift und E-Mail', () => {
  assert.deepEqual(privacyGaps(seller), []);
  assert.deepEqual(privacyGaps({ ...seller, company_name: ' ', owner_name: 'Tom' }), []);
  assert.deepEqual(privacyGaps({ ...seller, company_name: null, zip: null, email: '' }), [
    'Name bzw. Firmenname',
    'Anschrift',
    'E-Mail',
  ]);
  const empty = { company_name: null, owner_name: null, street: null, zip: null, city: null, email: null };
  assert.deepEqual(privacyGaps({ ...empty, privacy_url: 'https://example.de/datenschutz' }), []);
  // kein gültiger Link -> Muster
  assert.equal(privacyGaps({ ...empty, privacy_url: 'example.de/datenschutz' }).length, 3);
  assert.equal(privacyGaps({ ...empty, privacy_url: 'http://example.de/datenschutz' }).length, 3);
});

test('Ablauf: 30 Tage, abgelaufen erst nach dem Datum', () => {
  assert.equal(inviteExpiry(NOW), '2026-12-15T10:00:00.000Z');
  assert.equal(inviteExpired({ expires_at: '2026-11-15T10:00:01Z' }, NOW), false);
  assert.equal(inviteExpired({ expires_at: '2026-11-15T09:59:59Z' }, NOW), true);
});

test('Status-Zeile einer Einladung', () => {
  const inv = { id: 'i1', email: 'a@b.de', created_at: '2026-11-15T09:00:00Z', sent_at: '2026-11-15T09:00:00Z', expires_at: '2026-12-15T09:00:00Z' };
  assert.deepEqual(inviteStatus(inv, NOW), { text: 'verschickt am 15.11. · gültig bis 15.12.', expired: false });
  assert.deepEqual(inviteStatus({ ...inv, sent_at: null }, NOW), { text: 'noch nicht verschickt', expired: false });
  assert.deepEqual(inviteStatus({ ...inv, expires_at: '2026-11-14T09:00:00Z' }, NOW), {
    text: 'Link abgelaufen am 14.11.',
    expired: true,
  });
});

test('E-Mail-Vergleich ohne Groß-/Kleinschreibung, Aufzählung auf Deutsch', () => {
  assert.equal(sameEmail(' Max@Example.de', 'max@example.de '), true);
  assert.equal(sameEmail(null, 'max@example.de'), false);
  assert.equal(sameEmail('a@b.de', 'c@b.de'), false);
  assert.equal(listGerman(['A']), 'A');
  assert.equal(listGerman(['A', 'B']), 'A und B');
  assert.equal(listGerman(['A', 'B', 'C']), 'A, B und C');
});
