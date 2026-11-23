// Unit-Tests: Links zu Rechtstexten und Kündigungsseite. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { LEGAL_URLS, TERMS_VERSION, cancelPageUrl, termsAcceptance } from '../../src/features/legal/legal-logic.ts';

test('cancelPageUrl: E-Mail und Name nur im Fragment, nie in der Abfrage', () => {
  const url = cancelPageUrl(' erika+test@example.com ', 'Erika Beispiel');
  assert.equal(url, 'https://lunaxora.de/kuendigen/#email=erika%2Btest%40example.com&name=Erika+Beispiel&src=app');
  assert.ok(!url.includes('?'));
  const parsed = new URL(url);
  assert.equal(parsed.search, '');
  const hash = new URLSearchParams(parsed.hash.slice(1));
  assert.equal(hash.get('email'), 'erika+test@example.com');
  assert.equal(hash.get('name'), 'Erika Beispiel');
});

test('cancelPageUrl: ohne Angaben nur die Herkunft', () => {
  assert.equal(cancelPageUrl(null, undefined), 'https://lunaxora.de/kuendigen/#src=app');
});

test('cancelPageUrl: Widerrufsfunktion auf derselben Seite', () => {
  assert.equal(cancelPageUrl('a@b.de', null, 'widerrufen'), 'https://lunaxora.de/kuendigen/?widerrufen#email=a%40b.de&src=app');
});

test('termsAcceptance + Adressen', () => {
  assert.deepEqual(termsAcceptance(new Date('2026-11-23T10:00:00Z')), {
    terms_version: TERMS_VERSION,
    terms_accepted_at: '2026-11-23T10:00:00.000Z',
  });
  for (const url of Object.values(LEGAL_URLS)) assert.match(url, /^https:\/\/lunaxora\.de\//);
});
