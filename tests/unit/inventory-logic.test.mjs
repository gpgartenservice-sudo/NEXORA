// Unit-Tests: Lagerbestand (Arten, Mengen, Kennzahlen, Filter, Sortierung). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  categoryCounts,
  filterInventory,
  formatAmount,
  formatQuantity,
  inStock,
  inventoryStats,
  itemValue,
  parseAmount,
  statusLabel,
  stepFor,
  stockLevel,
} from '../../src/features/inventory/inventory-logic.ts';

const item = (over) => ({
  id: over.id ?? 'x',
  name: 'Teil',
  kind: 'geraet',
  category: null,
  brand: null,
  price: null,
  sale_price: null,
  quantity: 1,
  unit: 'Stück',
  min_quantity: null,
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

const product = (over) => item({ kind: 'produkt', ...over });
const products = [
  product({ id: 'p1', name: 'Dünger', quantity: 2.5, unit: 'kg', min_quantity: 5, price: 4, sale_price: 9 }),
  product({ id: 'p2', name: 'Shampoo', quantity: 0, min_quantity: 2 }),
  product({ id: 'p3', name: 'Schrauben', quantity: 100, min_quantity: 20, price: 0.05, serial_number: 'EAN 4006' }),
  product({ id: 'p4', name: 'Altware', quantity: 0, min_quantity: 5, status: 'verkauft' }),
];

test('Wert = Preis × Anzahl, ohne Preis 0', () => {
  assert.equal(itemValue(items[1]), 240);
  assert.equal(itemValue(items[4]), 0);
  assert.equal(itemValue(products[0]), 10);
});

test('Bestand ohne Verkauftes und Bestelltes', () => {
  assert.equal(inStock(items[2]), false);
  assert.equal(inStock(items[3]), false);
  assert.equal(inStock(items[1]), true);
});

test('Kennzahlen nur mit Geräten', () => {
  const s = inventoryStats(items);
  assert.equal(s.value, 589.99);
  assert.equal(s.devices, 5);
  assert.equal(s.products, 0);
  assert.equal(s.broken, 3);
  assert.equal(s.withoutPrice, 1);
  assert.equal(s.low, 0);
});

test('Kennzahlen mit Produkten: knapp, Verkaufswert, ohne Preis', () => {
  const s = inventoryStats([...items, ...products]);
  assert.equal(s.value, 604.99);
  assert.equal(s.devices, 5);
  assert.equal(s.products, 3);
  assert.equal(s.low, 2);
  assert.equal(s.saleValue, 22.5);
  assert.equal(s.withoutPrice, 2);
  assert.equal(s.broken, 3);
});

test('Lagerstand: leer, knapp, ok – Geräte und Ausgelistetes nie knapp', () => {
  assert.equal(stockLevel(products[0]), 'low');
  assert.equal(stockLevel(products[1]), 'empty');
  assert.equal(stockLevel(products[2]), 'ok');
  assert.equal(stockLevel(products[3]), 'ok');
  assert.equal(stockLevel(item({ quantity: 0, min_quantity: 3 })), 'ok');
  assert.equal(stockLevel(product({ quantity: 5, min_quantity: 5 })), 'low');
  assert.equal(stockLevel(product({ quantity: 1, min_quantity: null })), 'ok');
});

test('Mengen anzeigen und einlesen', () => {
  assert.equal(formatAmount(2.5), '2,5');
  assert.equal(formatAmount(1234.5), '1.234,5');
  assert.equal(formatQuantity(products[0]), '2,5 kg');
  assert.equal(formatQuantity({ quantity: 3, unit: '' }), '3 Stück');
  assert.equal(formatQuantity({ quantity: 4, unit: 'Packung' }), '4 Packungen');
  assert.equal(formatQuantity({ quantity: 1, unit: 'Sack' }), '1 Sack');
  assert.equal(formatQuantity({ quantity: 0, unit: 'Karton' }), '0 Kartons');
  assert.equal(formatQuantity({ quantity: 2, unit: 'Eimer' }), '2 Eimer');
  assert.equal(parseAmount('2,5'), 2.5);
  assert.equal(parseAmount(' 12 '), 12);
  assert.equal(parseAmount('0.125'), 0.125);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('abc'), 'invalid');
  assert.equal(parseAmount('-3'), 'invalid');
  assert.equal(parseAmount('1,2345'), 'invalid');
});

test('Schrittweite für +/−', () => {
  assert.equal(stepFor({ quantity: 2.5, unit: 'kg' }), 0.5);
  assert.equal(stepFor({ quantity: 3, unit: 'kg' }), 1);
  assert.equal(stepFor({ quantity: 2.5, unit: 'Stück' }), 1);
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
  assert.deepEqual(filterInventory(products, { category: null, query: 'ean', sort: 'name' }).map((i) => i.id), ['p3']);
});

test('Filter nach Art und „nur knapp“', () => {
  const all = [...items, ...products];
  assert.deepEqual(filterInventory(all, { category: null, query: '', sort: 'stock', kind: 'produkt' }).map((i) => i.id), ['p2', 'p1', 'p3', 'p4']);
  assert.equal(filterInventory(all, { category: null, query: '', sort: 'name', kind: 'geraet' }).length, 5);
  assert.deepEqual(filterInventory(all, { category: null, query: '', sort: 'name', lowOnly: true }).map((i) => i.id), ['p1', 'p2']);
});

test('Sortierung: Verkauftes immer hinten', () => {
  assert.deepEqual(filterInventory(items, { category: null, query: '', sort: 'newest' }).map((i) => i.id), ['a', 'e', 'b', 'd', 'c']);
  assert.deepEqual(filterInventory(items, { category: null, query: '', sort: 'price' }).map((i) => i.id), ['d', 'a', 'b', 'e', 'c']);
});

test('Status-Texte je nach Art', () => {
  assert.equal(statusLabel('verkauft'), 'Verkauft / Ausgemustert');
  assert.equal(statusLabel('reparatur'), 'In Reparatur');
  assert.equal(statusLabel('verkauft', 'produkt'), 'Ausgelistet');
  assert.equal(statusLabel('in_betrieb', 'produkt'), 'Im Lager');
  assert.equal(statusLabel('reparatur', 'produkt'), 'In Reparatur');
});
