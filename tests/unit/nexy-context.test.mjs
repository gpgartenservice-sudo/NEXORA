// Unit-Tests: Übersicht, die Nexy mitbekommt. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNexyContext } from '../../src/features/assistant/nexy-context.ts';
import { EMPTY_SELLER } from '../../src/features/documents/document-logic.ts';

const TODAY = new Date(2026, 10, 3, 12);
const seller = { ...EMPTY_SELLER, company_name: 'Lena Design', owner_name: 'Lena', iban: 'DE89 3704', tax_number: '1', street: 'A 1', zip: '1', city: 'B' };
const customers = [{ id: 'c1', name: 'Peter Müller', company: null, phone: '0171', email: 'p@x.de', address: 'Geheimweg 1' }];
const orders = [
  { id: 'o1', title: 'Website', customer_id: 'c1', price: 1500, billing: 'once', completed: true, execution_at: '2026-11-02T10:00:00Z', updated_at: '2026-11-02T10:00:00Z', created_at: '2026-10-01T10:00:00Z', discount_percent: 0 },
  { id: 'o2', title: 'Pflege', customer_id: 'c1', price: 100, billing: 'monthly', contract_start: '2026-09-01', completed: false, updated_at: '2026-10-02T10:00:00Z', discount_percent: 0 },
];
const doc = (o) => ({ id: 'd', order_id: 'o1', kind: 'invoice', number: 'RE-2026-0001', issued_on: '2026-10-01', due_on: '2026-10-15', total: 1500, paid_at: null, data: { buyer: { name: 'Peter Müller' } }, ...o });

test('Übersicht: Firma, Kunden ohne Kontaktdaten, Aufträge mit Status und Dokumenten', () => {
  const c = buildNexyContext({ seller, customers, orders, documents: [doc()], expenses: [{ amount: 12, spent_on: '2026-01-01', repeat: 'monthly', ends_on: null }], posts: [], today: TODAY });
  assert.equal(c.firma.name, 'Lena Design');
  assert.deepEqual(c.firma.fehlt_fuer_rechnungen, []);
  assert.deepEqual(c.kunden, [{ name: 'Peter Müller', auftraege: 2 }]);
  const json = JSON.stringify(c);
  assert.ok(!json.includes('0171') && !json.includes('p@x.de') && !json.includes('Geheimweg'), 'keine Kontaktdaten');
  assert.equal(c.auftraege[0].titel, 'Website');
  assert.equal(c.auftraege[0].status, 'Abgeschlossen');
  assert.deepEqual(c.auftraege[0].dokumente, ['RE-2026-0001']);
  assert.deepEqual(c.offene_rechnungen, [{ nummer: 'RE-2026-0001', kunde: 'Peter Müller', betrag: 1500, faellig: '2026-10-15', ueberfaellig: true }]);
});

test('Übersicht: Finanzzahlen dieser/letzter Monat, Fixkosten', () => {
  const c = buildNexyContext({ seller, customers, orders, documents: [], expenses: [{ amount: 12, spent_on: '2026-01-01', repeat: 'monthly', ends_on: null }], posts: [], today: TODAY });
  assert.deepEqual(c.finanzen.dieser_monat, { income: 1500, expenses: 12, profit: 1488 });
  assert.deepEqual(c.finanzen.letzter_monat, { income: 100, expenses: 12, profit: 88 });
  assert.equal(c.finanzen.fixkosten_pro_monat, 12);
});

test('Übersicht bleibt bei vielen Einträgen unter der Größengrenze', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, name: `Kunde Nummer ${i} mit einem langen Namen`, company: `Firma ${i} GmbH & Co. KG` }));
  const manyOrders = Array.from({ length: 300 }, (_, i) => ({ id: `o${i}`, title: `Auftrag ${i} mit ausführlicher Bezeichnung`, customer_id: `c${i}`, price: 100, billing: 'once', updated_at: '2026-10-01T10:00:00Z' }));
  const c = buildNexyContext({ seller, customers: many, orders: manyOrders, documents: [], expenses: [], posts: [], today: TODAY });
  assert.ok(JSON.stringify(c).length <= 26000, String(JSON.stringify(c).length));
  assert.ok(c.kunden.length >= 10 && c.auftraege.length >= 10);
});
