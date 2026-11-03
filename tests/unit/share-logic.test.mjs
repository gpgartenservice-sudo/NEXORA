// Unit-Tests: Teilen am Handy (mailto/WhatsApp auseinandernehmen). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mailtoUrl, whatsappUrl } from '../../src/features/documents/document-logic.ts';
import { parseMailto, whatsappText } from '../../src/features/documents/share-logic.ts';

test('mailto -> Empfänger, Betreff, Text (Umlaute, Zeilen, Sonderzeichen)', () => {
  const body = 'Guten Tag Herr Müller,\n\nanbei 50 % & mehr: 1.250,00 €?\n\nGrüße';
  const p = parseMailto(mailtoUrl('peter@example.de', 'Angebot AN-2026-0001 – Hecke', body));
  assert.deepEqual(p, { to: ['peter@example.de'], subject: 'Angebot AN-2026-0001 – Hecke', body });
  assert.deepEqual(parseMailto(mailtoUrl('keine-adresse', 'X', 'Y')), { to: [], subject: 'X', body: 'Y' });
  assert.equal(parseMailto('https://example.de'), null);
});

test('WhatsApp-Link -> Text', () => {
  const text = 'Hallo Peter 👋\nhier dein Angebot: 80 € + Anfahrt';
  assert.equal(whatsappText(whatsappUrl('0171 1234567', text)), text);
  assert.equal(whatsappText(whatsappUrl(null, 'ohne Nummer')), 'ohne Nummer');
  assert.equal(whatsappText('mailto:x@y.de'), null);
});
