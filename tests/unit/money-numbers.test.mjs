// Unit-Tests: Zahlen der Geld-Karte auf der Startseite (Monat / Gesamt). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { moneyNumbers, monthNumbers, totalNumbers } from '../../src/features/dashboard/money.ts';

const today = new Date(2026, 10, 20); // 20.11.2026

const orders = [
  // abgeschlossen im September, 10 % Rabatt, 30 € Material
  { price: 200, discount_percent: 10, completed: true, execution_at: '2026-09-10T08:00:00Z', expenses: 30 },
  // abgeschlossen diesen Monat
  { price: 100, completed: true, execution_at: '2026-11-05T08:00:00Z' },
  // storniert und offen zählen nicht
  { price: 999, completed: true, cancelled: true, execution_at: '2026-10-01T08:00:00Z' },
  { price: 500, completed: false, execution_at: '2026-11-25T08:00:00Z' },
  // Vertrag 50 €/Monat ab August, bis Ende Januar, als erledigt markiert: nur bis heute zählen
  { price: 50, billing: 'monthly', contract_start: '2026-08-01', contract_end: '2027-01-31', completed: true },
];
const expenses = [
  { amount: 20, spent_on: '2026-08-10', repeat: 'monthly', ends_on: null }, // Aug–Nov = 4×
  { amount: 60, spent_on: '2026-10-12', repeat: 'once', ends_on: null },
];

test('Gesamt: alle Einnahmen und Ausgaben bis einschließlich laufendem Monat', () => {
  const t = totalNumbers(orders, expenses, today);
  // 180 + 100 + Vertrag Aug–Nov 4 × 50 = 480 (Dez/Jan liegen in der Zukunft)
  assert.equal(t.income, 480);
  // Material 30 + 4 × 20 + 60 = 170
  assert.equal(t.expenses, 170);
  assert.equal(t.profit, 310);
});

test('Monat bleibt wie bisher, moneyNumbers wählt nach Zeitraum', () => {
  const m = monthNumbers(orders, expenses, today);
  assert.deepEqual(m, { income: 150, expenses: 20, profit: 130 });
  assert.deepEqual(moneyNumbers('month', orders, expenses, today), m);
  assert.deepEqual(moneyNumbers('total', orders, expenses, today), totalNumbers(orders, expenses, today));
});

test('Gesamt ohne Daten ist 0', () => {
  assert.deepEqual(totalNumbers([], [], today), { income: 0, expenses: 0, profit: 0 });
});
