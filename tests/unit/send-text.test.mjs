// Unit-Tests für die Texte und Links zum Verschicken. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeTotals,
  documentMessage,
  EMPTY_SELLER,
  mailtoUrl,
  whatsappNumber,
  whatsappUrl,
} from '../../src/features/documents/document-logic.ts';

const seller = { ...EMPTY_SELLER, company_name: 'Lena Design Studio', owner_name: 'Lena Gründerin', phone: '0171 2223334' };
const items = [{ description: 'Website erstellen', details: null, quantity: 1, unit: 'pauschal', unit_price: 1500 }];
const data = (over = {}) => ({
  kind: 'offer',
  seller,
  buyer: { name: 'Peter Müller', company: null, address: null, email: 'peter@example.de' },
  items,
  totals: computeTotals(items, 0, true, 19),
  small_business: true,
  service_date: null,
  service_period: null,
  monthly: false,
  ...over,
});

test('Angebot: Betreff, Anrede, Betrag, Gültigkeit, Signatur', () => {
  const m = documentMessage({ kind: 'offer', number: 'AN-2026-0001', due_on: '2026-12-02', data: data() });
  assert.equal(m.subject, 'Angebot AN-2026-0001 – Website erstellen');
  assert.match(m.body, /^Guten Tag Peter Müller,\n\n/);
  assert.match(m.body, /mein Angebot AN-2026-0001 für „Website erstellen“ über 1\.500,00\s€\. Das Angebot ist gültig bis zum 02\.12\.2026\./);
  assert.match(m.body, /Mit freundlichen Grüßen\nLena Gründerin\nLena Design Studio\nTel\. 0171 2223334$/);
  assert.match(m.chat, /^Guten Tag Peter Müller, anbei mein Angebot AN-2026-0001 .*\(gültig bis 02\.12\.2026\)\. .*Viele Grüße, Lena Gründerin$/);
});

test('Rechnung: Zahlungsziel und Rechnungsnummer, aktueller Kundenname', () => {
  const m = documentMessage({
    kind: 'invoice',
    number: 'RE-2026-0003',
    due_on: '2026-11-16',
    data: data({ kind: 'invoice' }),
    customerName: 'Peter Müller GmbH',
  });
  assert.equal(m.subject, 'Rechnung RE-2026-0003 – Website erstellen');
  assert.match(m.body, /^Guten Tag Peter Müller GmbH,/);
  assert.match(m.body, /bis zum 16\.11\.2026 unter Angabe der Rechnungsnummer RE-2026-0003/);
  assert.match(m.chat, /zahlbar bis 16\.11\.2026\. Vielen Dank für Ihren Auftrag!/);
});

test('Monatliches Angebot nennt "pro Monat"; mehrere Positionen ohne Titel', () => {
  const monthly = documentMessage({ kind: 'offer', number: 'AN-1', due_on: null, data: data({ monthly: true }) });
  assert.match(monthly.body, /über 1\.500,00\s€ pro Monat\./);
  assert.doesNotMatch(monthly.body, /gültig bis/);
  const two = documentMessage({ kind: 'offer', number: 'AN-2', due_on: null, data: data({ items: [...items, ...items] }) });
  assert.equal(two.subject, 'Angebot AN-2');
});

test('Nur Firmenname: Signatur ohne Doppelung', () => {
  const m = documentMessage({ kind: 'offer', number: 'AN-3', due_on: null, data: data({ seller: { ...EMPTY_SELLER, company_name: 'Studio X' } }) });
  assert.match(m.body, /Mit freundlichen Grüßen\nStudio X$/);
});

test('WhatsApp-Nummern', () => {
  assert.equal(whatsappNumber('0171 1234567'), '491711234567');
  assert.equal(whatsappNumber('+49 (0) 171 / 123 45 67'), '491711234567');
  assert.equal(whatsappNumber('0043 664 1234567'), '436641234567');
  assert.equal(whatsappNumber('+41 79 123 45 67'), '41791234567');
  assert.equal(whatsappNumber('123'), null);
  assert.equal(whatsappNumber(''), null);
  assert.equal(whatsappNumber(null), null);
});

test('Links: mailto mit CRLF, ungültige Adresse weglassen, wa.me', () => {
  const url = mailtoUrl('peter@example.de', 'Angebot AN-1 – Test', 'Zeile 1\nZeile 2 & mehr');
  assert.equal(url, 'mailto:peter@example.de?subject=Angebot%20AN-1%20%E2%80%93%20Test&body=Zeile%201%0D%0AZeile%202%20%26%20mehr');
  assert.match(mailtoUrl('kaputt?cc=x@y.de', 'a', 'b'), /^mailto:\?subject=a&body=b$/);
  assert.match(mailtoUrl(null, 'a', 'b'), /^mailto:\?subject=/);
  assert.equal(whatsappUrl('0171 1234567', 'Hallo & tschüss'), 'https://wa.me/491711234567?text=Hallo%20%26%20tsch%C3%BCss');
  assert.equal(whatsappUrl('', 'Hi'), 'https://wa.me/?text=Hi');
});
