// Unit-Tests: Zeitstempel handyfest lesen. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toDate, toIso, toMs } from '../../src/lib/dates.ts';

test('Postgres-Zeitstempel in allen Formen', () => {
  assert.equal(toIso('2026-11-04T09:00:00.123456+00:00'), '2026-11-04T09:00:00.123Z');
  assert.equal(toIso('2026-11-04 09:00:00+00'), '2026-11-04T09:00:00.000Z');
  assert.equal(toIso('2026-11-04T10:00:00+0100'), '2026-11-04T09:00:00.000Z');
  assert.equal(toIso('2026-11-04T09:00:00Z'), '2026-11-04T09:00:00.000Z');
  assert.equal(toMs('2026-11-04T09:00:00.5+00:00'), Date.UTC(2026, 10, 4, 9, 0, 0, 500));
  // Postgres kürzt Nullen am Ende: „.12“ = 120 ms
  assert.equal(toIso('2026-11-04T09:00:00.12+00:00'), '2026-11-04T09:00:00.120Z');
  assert.equal(toIso('2026-11-04T10:00:00+01'), '2026-11-04T09:00:00.000Z');
  assert.equal(toIso('2026-11-04t09:00:00z'), '2026-11-04T09:00:00.000Z');
});

test('Reiner Tag bleibt ein Tag (kein Zeitzonen-Anhängsel)', () => {
  assert.equal(toIso('2026-11-04'), new Date('2026-11-04').toISOString());
  assert.equal(toIso(' 2026-11-04 '), '2026-11-04T00:00:00.000Z');
});

test('Ungültig oder leer: null statt Absturz', () => {
  assert.equal(toDate('kaputt'), null);
  assert.equal(toIso(''), null);
  assert.equal(toIso(null), null);
  assert.ok(Number.isNaN(toMs(undefined)));
});
