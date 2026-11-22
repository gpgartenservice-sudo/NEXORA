// Unit-Tests für Beträge und Pflichtangaben auf Angeboten/Rechnungen. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDays,
  computeTotals,
  documentNotes,
  EMPTY_SELLER,
  formatDay,
  lastPropertyChoice,
  LATE_NOTE,
  missingBuyerFields,
  missingSellerFields,
  PROPERTY_NOTE,
  propertyNoteApplies,
  sampleInvoice,
  SMALL_BUSINESS_NOTE,
  SMALL_BUSINESS_OFFER_NOTE,
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

// --- Rechtsform (Skript 20261120090000_feinschliff.sql) ---------------------------------
import { legalFooterLines, legalNameHint } from '../../src/features/documents/document-logic.ts';

const base = { ...EMPTY_SELLER, company_name: 'Lena Design', owner_name: 'Lena Schmidt', street: 'Weg 1', zip: '50667', city: 'Köln', tax_number: '1', iban: 'DE89370400440532013000' };

test('UG/GmbH: Registergericht, HRB und Geschäftsführung sind Pflicht', () => {
  const ug = { ...base, legal_form: 'ug' };
  assert.deepEqual(missingSellerFields(ug, 'offer'), ['Registergericht und HRB-Nummer', 'Geschäftsführer/in']);
  const full = { ...ug, register_court: 'Amtsgericht Köln', register_number: 'HRB 123', managing_director: 'Lena Schmidt' };
  assert.deepEqual(missingSellerFields(full, 'invoice'), []);
  assert.deepEqual(legalFooterLines(full), ['Sitz: Köln', 'Registergericht Amtsgericht Köln, HRB 123', 'Geschäftsführung: Lena Schmidt']);
});

test('GbR: Gesellschafter in der Fußzeile, Einzelunternehmen: Inhaber', () => {
  assert.deepEqual(legalFooterLines({ ...base, legal_form: 'gbr', partners: 'Lena Schmidt, Tom Becker' }), ['Gesellschafter: Lena Schmidt, Tom Becker']);
  assert.deepEqual(legalFooterLines({ ...base, legal_form: 'gbr' }), []);
  assert.deepEqual(legalFooterLines({ ...base, legal_form: 'sole' }), ['Inhaber/in: Lena Schmidt']);
  assert.deepEqual(legalFooterLines({ ...base, company_name: null }), []);
});

test('Firmenname passt zur Rechtsform', () => {
  assert.match(legalNameHint({ legal_form: 'ug', company_name: 'Lena Design GmbH' }), /UG \(haftungsbeschränkt\)/);
  assert.equal(legalNameHint({ legal_form: 'ug', company_name: 'Lena Design UG (haftungsbeschränkt)' }), null);
  assert.match(legalNameHint({ legal_form: 'gmbh', company_name: 'Lena Design' }), /GmbH/);
  assert.equal(legalNameHint({ legal_form: 'sole', company_name: 'Lena Design' }), null);
});

// --- Hinweise unter den Summen ------------------------------------------------

const invoice = (data, kind = 'invoice') => ({
  kind,
  number: 'RE-2026-0001',
  due_on: '2026-12-04',
  data: {
    kind,
    seller: EMPTY_SELLER,
    buyer: { name: 'Erika Beispiel', company: null, address: 'Lindenstraße 5, 12345 Musterstadt', email: null },
    items: [item(270)],
    totals: computeTotals([item(270)], 0, false, 19),
    small_business: false,
    service_date: '2026-11-18',
    service_period: null,
    monthly: false,
    ...data,
  },
});

test('Kleinunternehmer: neuer Hinweis auf Rechnungen und Angeboten (§ 34a UStDV)', () => {
  assert.ok(documentNotes(invoice({ small_business: true })).includes(SMALL_BUSINESS_NOTE));
  assert.match(SMALL_BUSINESS_NOTE, /von der Umsatzsteuer befreit/);
  const offer = documentNotes(invoice({ small_business: true }, 'offer'));
  assert.ok(offer.includes(SMALL_BUSINESS_OFFER_NOTE));
  assert.ok(!offer.some((n) => /keine Umsatzsteuer berechnet/.test(n)));
});

test('Verzug und Aufbewahrung nur, wenn die Rechnung es gespeichert hat', () => {
  const both = documentNotes(invoice({ late_notice: true, property_work: true }));
  assert.ok(both.includes(LATE_NOTE));
  assert.ok(both.includes(PROPERTY_NOTE));
  // Reihenfolge: Zahlungsbitte, dann Verzug, dann Aufbewahrung
  assert.ok(both.findIndex((n) => n.startsWith('Bitte überweisen')) < both.indexOf(LATE_NOTE));
  assert.ok(both.indexOf(LATE_NOTE) < both.indexOf(PROPERTY_NOTE));
  // ältere Rechnungen ohne die Felder bleiben unverändert
  const old = documentNotes(invoice({}));
  assert.ok(!old.includes(LATE_NOTE) && !old.includes(PROPERTY_NOTE));
  // Angebote bekommen keinen der beiden Hinweise
  const offer = documentNotes(invoice({ late_notice: true, property_work: true }, 'offer'));
  assert.ok(!offer.includes(LATE_NOTE) && !offer.includes(PROPERTY_NOTE));
});

test('Aufbewahrungs-Hinweis nur bei Umsatzsteuer und Privatkunden', () => {
  assert.equal(propertyNoteApplies({ small_business: false }, { company: null }), true);
  assert.equal(propertyNoteApplies({ small_business: false }, { company: '  ' }), true);
  assert.equal(propertyNoteApplies({ small_business: false }, { company: 'Muster GmbH' }), false);
  assert.equal(propertyNoteApplies({ small_business: true }, { company: null }), false);
});

test('Vorschlag für den Schalter: wie bei der letzten passenden Rechnung', () => {
  const doc = (data, kind = 'invoice') => ({ kind, data: invoice(data, kind).data });
  assert.equal(lastPropertyChoice([]), false);
  assert.equal(lastPropertyChoice([doc({ property_work: true })]), true);
  // neueste zuerst: die letzte passende Rechnung zählt
  assert.equal(lastPropertyChoice([doc({ property_work: false }), doc({ property_work: true })]), false);
  // Firmenkunden, Kleinunternehmer-Rechnungen und alte Rechnungen ohne Feld werden übersprungen
  assert.equal(
    lastPropertyChoice([
      doc({ property_work: false, buyer: { name: 'A', company: 'Firma', address: 'x', email: null } }),
      doc({ property_work: false, small_business: true }),
      doc({}),
      doc({ property_work: true }),
    ]),
    true,
  );
});

test('Muster-Rechnung im Bereich Firma zeigt den Verzugshinweis', () => {
  assert.ok(documentNotes(sampleInvoice(EMPTY_SELLER, '2026-11-22')).includes(LATE_NOTE));
});
