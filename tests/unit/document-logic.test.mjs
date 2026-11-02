// Unit-Tests für Beträge und Pflichtangaben auf Angeboten/Rechnungen. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays,
  computeTotals,
  EMPTY_SELLER,
  formatDay,
  missingBuyerFields,
  missingSellerFields,
} from '../../src/features/documents/document-logic.ts';

const item = (unit_price, quantity = 1) => ({ description: 'X', details: null, quantity, unit: 'pauschal', unit_price });

test('Kleinunternehmer: keine Umsatzsteuer, Preis = Endbetrag', () => {
  const t = computeTotals([item(1500)], 10, true, 19);
  assert.deepEqual(t, { subtotal: 1500, discount_percent: 10, discount_amount: 150, net: 1350, vat_rate: 0, vat_amount: 0, gross: 1350 });
});

test('Regelbesteuerung: 19 % auf den Netto-Betrag', () => {
  const t = computeTotals([item(1000)], 0, false, 19);
  assert.equal(t.net, 1000);
  assert.equal(t.vat_amount, 190);
  assert.equal(t.gross, 1190);
});

test('7 % ermäßigter Satz und mehrere Positionen', () => {
  const t = computeTotals([item(19.99, 3), item(10.01)], 0, false, 7);
  assert.equal(t.subtotal, 69.98);
  assert.equal(t.vat_amount, 4.9);
  assert.equal(t.gross, 74.88);
});

test('Rundung auf Cent', () => {
  const t = computeTotals([item(33.33)], 0, false, 19);
  assert.equal(t.vat_amount, 6.33);
  assert.equal(t.gross, 39.66);
});

test('Rabatt wird auf 0–100 % begrenzt', () => {
  assert.equal(computeTotals([item(100)], 150, true, 19).gross, 0);
  assert.equal(computeTotals([item(100)], -10, true, 19).gross, 100);
});

test('Pflichtangaben des Absenders: Rechnung braucht Steuernummer und IBAN', () => {
  const s = { ...EMPTY_SELLER, company_name: 'Lena Design', street: 'Weg 1', zip: '12345', city: 'Berlin' };
  assert.deepEqual(missingSellerFields(s, 'offer'), []);
  assert.deepEqual(missingSellerFields(s, 'invoice'), ['Steuernummer oder USt-IdNr.', 'IBAN für die Überweisung']);
  assert.deepEqual(missingSellerFields({ ...s, vat_id: 'DE123', iban: 'DE00' }, 'invoice'), []);
  assert.equal(missingSellerFields(EMPTY_SELLER, 'offer').length, 3);
});

test('Rechnung braucht die Anschrift des Kunden', () => {
  const b = { name: 'Peter', company: null, address: null, email: null };
  assert.deepEqual(missingBuyerFields(b, 'offer'), []);
  assert.deepEqual(missingBuyerFields(b, 'invoice'), ['Anschrift des Kunden']);
});

test('Datumshilfen', () => {
  assert.equal(addDays('2026-11-25', 14), '2026-12-09');
  assert.equal(addDays('2026-12-25', 14), '2027-01-08');
  assert.equal(formatDay('2026-11-03'), '03.11.2026');
});
