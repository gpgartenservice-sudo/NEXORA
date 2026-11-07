// Unit-Tests: Angebots-Link. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bytesToBase64,
  offerAnswer,
  offerToken,
  offerUrl,
  validOfferToken,
  webBaseUrl,
  withOfferLink,
  withOfferLinkChat,
} from '../../src/features/documents/offer-link.ts';
import { splitRecipients, validEmail } from '../../src/features/documents/mail-logic.ts';

test('Schlüssel: lang, URL-sicher, gültig', () => {
  const t = offerToken((n) => new Uint8Array(n).fill(251));
  assert.equal(t.length, 43);
  assert.match(t, /^[A-Za-z0-9_-]+$/);
  assert.ok(validOfferToken(t));
  assert.ok(!validOfferToken('kurz'));
  assert.ok(!validOfferToken(`${'a'.repeat(40)}/`));
  assert.ok(!validOfferToken(null));
  const a = offerToken((n) => crypto.getRandomValues(new Uint8Array(n)));
  const b = offerToken((n) => crypto.getRandomValues(new Uint8Array(n)));
  assert.notEqual(a, b);
});

test('Adresse im Internet: .env, sonst eigene https-Adresse, lokal keine', () => {
  assert.equal(webBaseUrl('https://nexora.expo.app/', undefined), 'https://nexora.expo.app');
  assert.equal(webBaseUrl('http://unsicher.de', undefined), null);
  assert.equal(
    webBaseUrl(undefined, { protocol: 'https:', hostname: 'nexora.expo.app', origin: 'https://nexora.expo.app' }),
    'https://nexora.expo.app',
  );
  assert.equal(
    webBaseUrl(undefined, { protocol: 'http:', hostname: 'localhost', origin: 'http://localhost:8081' }),
    null,
  );
  assert.equal(webBaseUrl(undefined, { protocol: 'https:', hostname: 'localhost', origin: 'https://localhost' }), null);
  assert.equal(webBaseUrl(undefined, { protocol: 'file:', hostname: '', origin: 'null' }), null);
});

test('Link und Text', () => {
  assert.equal(offerUrl('https://nexora.expo.app/', 'abc_-'), 'https://nexora.expo.app/?angebot=abc_-');
  const body = 'Guten Tag,\n\nanbei mein Angebot.\n\nMit freundlichen Grüßen\nLena';
  const withLink = withOfferLink(body, 'https://x/?angebot=t');
  assert.ok(withLink.indexOf('https://x/?angebot=t') < withLink.indexOf('Mit freundlichen Grüßen'));
  assert.ok(withLink.startsWith('Guten Tag,'));
  assert.ok(withOfferLink('Hallo', 'https://x').endsWith('https://x'));
});

test('WhatsApp-Text mit Link: Link vor dem Gruß, Gruß bleibt am Ende', () => {
  const chat = 'Guten Tag Peter, anbei mein Angebot A-1. Bei Fragen melden Sie sich gern! Viele Grüße, Lena';
  const out = withOfferLinkChat(chat, 'https://x/?angebot=t');
  assert.equal(
    out,
    'Guten Tag Peter, anbei mein Angebot A-1. Bei Fragen melden Sie sich gern!\n\n' +
      'Sie können das Angebot auch online ansehen und mit einem Klick annehmen:\nhttps://x/?angebot=t\n\n' +
      'Viele Grüße, Lena',
  );
  assert.ok(withOfferLinkChat('Hallo', 'https://x').endsWith('https://x'));
});

test('Antwort des Kunden', () => {
  assert.deepEqual(offerAnswer({ accepted_at: '2026-11-04T10:00:00Z', accepted_name: 'Peter' }, '2026-11-04'), {
    state: 'accepted',
    at: '2026-11-04T10:00:00Z',
    name: 'Peter',
  });
  assert.equal(
    offerAnswer({ declined_at: '2026-11-04T10:00:00Z', decline_note: 'zu teuer' }, '2026-11-04').state,
    'declined',
  );
  assert.equal(offerAnswer({ valid_until: '2026-11-03' }, '2026-11-04').state, 'expired');
  assert.equal(offerAnswer({ due_on: '2026-11-04' }, '2026-11-04').state, 'open');
  assert.equal(offerAnswer({}, '2026-11-04').state, 'open');
});

test('Anhang als Base64, Empfänger', () => {
  assert.equal(bytesToBase64(new Uint8Array([37, 80, 68, 70])), 'JVBERg==');
  const big = new Uint8Array(100000).fill(65);
  assert.equal(bytesToBase64(big), Buffer.from(big).toString('base64'));
  assert.deepEqual(splitRecipients(' a@b.de; c@d.de ,'), ['a@b.de', 'c@d.de']);
  assert.ok(validEmail('peter@example.de'));
  assert.ok(!validEmail('peter@example'));
  assert.ok(!validEmail('a@b.de>, evil@x.de'));
});
