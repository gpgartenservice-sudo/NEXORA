// Unit-Tests: Inventar (Kennzahlen, Filter, Sortierung). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  categoryCounts,
  filterInventory,
  inStock,
  inventoryStats,
  itemValue,
  statusLabel,
} from '../../src/features/inventory/inventory-logic.ts';

const item = (over) => ({
  id: over.id ?? 'x',
  name: 'Teil',
  category: null,
  brand: null,
  price: null,
  quantity: 1,
  status: 'in_betrieb',
  location: null,
  serial_number: null,
  purchase_date: null,
  product_url: null,
  shop: null,
  notes: null,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  ...over,
});

const items = [
  item({ id: 'a', name: 'Heckenschere', category: 'Werkzeug', price: 349.99, created_at: '2026-11-03T10:00:00Z' }),
  item({ id: 'b', name: 'Akku', category: 'Werkzeug', price: 80, quantity: 3, status: 'reparatur' }),
  item({ id: 'c', name: 'Laptop', category: 'Elektronik', price: 1200, status: 'verkauft', created_at: '2026-11-05T10:00:00Z' }),
  item({ id: 'd', name: 'Anhänger', category: 'Fahrzeug', price: 900, status: 'bestellt' }),
  item({ id: 'e', name: 'besen', category: ' Werkzeug ', location: 'Garage', created_at: '2026-11-02T10:00:00Z' }),
];

test('Wert = Preis × Anzahl, ohne Preis 0', () => {
  assert.equal(itemValue(items[1]), 240);
  assert.equal(itemValue(items[4]), 0);
});

test('Bestand ohne Verkauftes und Bestelltes', () => {
  assert.equal(inStock(items[2]), false);
  assert.equal(inStock(items[3]), false);
  assert.equal(inStock(items[1]), true);
});

test('Kennzahlen', () => {
  const s = inventoryStats(items);
  assert.equal(s.value, 589.99);
  assert.equal(s.count, 5);
  assert.equal(s.categories, 3);
  assert.equal(s.broken, 3);
  assert.equal(s.withoutPrice, 1);
});

test('Kategorien mit Anzahl, getrimmt und alphabetisch', () => {
  assert.deepEqual(categoryCounts(items), [
    { name: 'Elektronik', count: 1 },
    { name: 'Fahrzeug', count: 1 },
    { name: 'Werkzeug', count: 3 },
  ]);
});

test('Filter nach Kategorie und Suche', () => {
  assert.deepEqual(filterInventory(items, { category: 'Werkzeug', query: '', sort: 'name' }).map((i) => i.id), ['b', 'e', 'a']);
  assert.deepEqual(filterInventory(items, { category: null, query: 'garage', sort: 'newest' }).map((i) => i.id), ['e']);
});

test('Sortierung: Verkauftes immer hinten', () => {
  assert.deepEqual(filterInventory(items, { category: null, query: '', sort: 'newest' }).map((i) => i.id), ['a', 'e', 'b', 'd', 'c']);
  assert.deepEqual(filterInventory(items, { category: null, query: '', sort: 'price' }).map((i) => i.id), ['d', 'a', 'b', 'e', 'c']);
});

test('Status-Texte', () => {
  assert.equal(statusLabel('verkauft'), 'Verkauft / Ausgemustert');
  assert.equal(statusLabel('reparatur'), 'In Reparatur');
});
