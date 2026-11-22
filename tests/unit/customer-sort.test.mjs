// Unit-Tests: Kundenübersicht – Sortierung, Raster-Spalten, gemerkte Auswahl. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CUSTOMER_SORTS,
  customerStats,
  DEFAULT_CUSTOMER_LAYOUT,
  gridColumns,
  readCustomerLayout,
  sortCustomers,
  sortMetric,
} from '../../src/features/crm/customer-sort.ts';

const today = new Date(2026, 10, 22);

const customers = [
  { id: 'a', name: 'Zander GmbH', created_at: '2026-01-10T10:00:00Z', updated_at: '2026-11-01T10:00:00Z' },
  { id: 'b', name: 'ärztehaus Müller', created_at: '2026-06-01T10:00:00Z', updated_at: '2026-11-20T10:00:00Z' },
  { id: 'c', name: 'Bauer', created_at: '2026-11-15T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' },
  { id: 'd', name: 'Kunde 10', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z' },
  { id: 'e', name: 'Kunde 2', created_at: '2026-03-02T10:00:00Z', updated_at: '2026-09-02T10:00:00Z' },
];

const orders = [
  { customer_id: 'a', price: 500, completed: true },
  { customer_id: 'a', price: 200 }, // offen
  { customer_id: 'c', price: 900, completed: true },
  { customer_id: 'b', price: 100, completed: true },
  { customer_id: 'b', price: 50, completed: true },
  { customer_id: 'b', price: 1000 }, // offen
  { customer_id: 'd', price: 300, cancelled: true },
];

const ids = (list) => list.map((c) => c.id).join('');

test('Kunden: Zahlen je Kunde', () => {
  const s = customerStats(orders, today);
  assert.deepEqual(s.get('a'), { count: 2, revenue: 500, outstanding: 200 });
  assert.deepEqual(s.get('b'), { count: 3, revenue: 150, outstanding: 1000 });
  assert.deepEqual(s.get('d'), { count: 1, revenue: 0, outstanding: 0 }); // storniert zählt nicht
  assert.equal(s.get('e'), undefined);
});

test('Kunden: sortieren', () => {
  const s = customerStats(orders, today);
  // Alphabet deutsch: Umlaute wie Grundbuchstabe, groß/klein egal, „Kunde 2“ vor „Kunde 10“
  assert.equal(ids(sortCustomers(customers, 'name', s)), 'bceda');
  assert.equal(ids(sortCustomers(customers, 'name-desc', s)), 'adecb');
  // höchster Umsatz zuerst, bei Gleichstand nach Name
  assert.equal(ids(sortCustomers(customers, 'revenue', s)), 'cabed');
  assert.equal(ids(sortCustomers(customers, 'orders', s)), 'bacde');
  assert.equal(ids(sortCustomers(customers, 'outstanding', s)), 'baced');
  assert.equal(ids(sortCustomers(customers, 'newest', s)), 'cbeda');
  // Standard wie bisher: zuletzt bearbeitet zuerst
  assert.equal(ids(sortCustomers(customers, 'recent', s)), 'baced');
  // die Liste selbst bleibt unverändert
  assert.equal(ids(customers), 'abcde');
});

test('Kunden: passende Zahl zur Sortierung', () => {
  const s = customerStats(orders, today);
  const nbsp = (t) => t.replace(/\s/g, ' ');
  assert.deepEqual(
    Object.values(sortMetric('revenue', s.get('a'))).map(nbsp),
    ['500,00 €', '2 Aufträge'],
  );
  assert.equal(sortMetric('orders', s.get('c')).value, '1 Auftrag');
  assert.equal(nbsp(sortMetric('outstanding', s.get('b')).value), '1.000,00 €');
  assert.equal(sortMetric('outstanding', s.get('b')).label, 'offen');
  assert.equal(sortMetric('name', undefined).label, '0 Aufträge');
});

test('Kunden: Raster mit bis zu 4 Spalten', () => {
  assert.equal(gridColumns(864, 12), 4); // Mac
  assert.equal(gridColumns(1400, 12), 4); // nie mehr als 4
  assert.equal(gridColumns(611, 12), 4); // schmales Mac-Fenster
  assert.equal(gridColumns(500, 12), 3);
  assert.equal(gridColumns(327, 12), 2); // Handy
  assert.equal(gridColumns(0, 12), 2); // noch nicht gemessen
});

test('Kunden: gemerkte Ansicht lesen', () => {
  assert.deepEqual(readCustomerLayout(null), DEFAULT_CUSTOMER_LAYOUT);
  assert.deepEqual(readCustomerLayout('{"view":"grid","sort":"revenue"}'), { view: 'grid', sort: 'revenue' });
  assert.deepEqual(readCustomerLayout('{"view":"kacheln","sort":"egal"}'), DEFAULT_CUSTOMER_LAYOUT);
  assert.deepEqual(readCustomerLayout('kaputt{'), DEFAULT_CUSTOMER_LAYOUT);
  assert.equal(new Set(CUSTOMER_SORTS.map((s) => s.key)).size, CUSTOMER_SORTS.length);
  assert.equal(CUSTOMER_SORTS[0].key, DEFAULT_CUSTOMER_LAYOUT.sort);
});
