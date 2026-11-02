// Unit-Tests für den Bereich Finanzen. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { recognizedRevenue } from '../../src/features/crm/order-logic.ts';
import {
  addMonths,
  expenseByMonth,
  fixedCostsPerMonth,
  monthKey,
  monthLabel,
  monthRange,
  orderExpenseByMonth,
  orderIncomeByMonth,
  sumUp,
  summarize,
} from '../../src/features/finance/finance-logic.ts';

const TODAY = new Date(2026, 10, 2); // 2. November 2026
const sum = (m) => [...m.values()].reduce((s, v) => s + v, 0);
const obj = (m) => Object.fromEntries(m);

test('Monate: Schlüssel, Rechnen, Bereich, Namen', () => {
  assert.equal(monthKey('2026-03-31'), '2026-03');
  assert.equal(monthKey(new Date(2026, 0, 1)), '2026-01');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.deepEqual(monthRange('2026-11', '2027-02'), ['2026-11', '2026-12', '2027-01', '2027-02']);
  assert.equal(monthLabel('2026-03'), 'März 2026');
  assert.equal(monthLabel('2026-03', true), 'Mär');
});

test('Einzelauftrag: zählt erst abgeschlossen, im Monat der Ausführung, mit Rabatt', () => {
  const o = { price: 1000, discount_percent: 10, billing: 'once', execution_at: '2026-09-14T08:00:00', completed: true, created_at: '2026-08-01T10:00:00' };
  assert.deepEqual(obj(orderIncomeByMonth(o, TODAY)), { '2026-09': 900 });
  assert.deepEqual(obj(orderIncomeByMonth({ ...o, completed: false }, TODAY)), {});
  assert.deepEqual(obj(orderIncomeByMonth({ ...o, cancelled: true }, TODAY)), {});
  // ohne Ausführung: Abschlussdatum, sonst Anlagedatum
  assert.deepEqual(obj(orderIncomeByMonth({ ...o, execution_at: null, completed_on: '2026-10-30' }, TODAY)), { '2026-10': 900 });
  assert.deepEqual(obj(orderIncomeByMonth({ ...o, execution_at: null }, TODAY)), { '2026-08': 900 });
});

test('Monatlicher Auftrag: Monat für Monat, Summe = realisierter Umsatz', () => {
  const o = { price: 200, billing: 'monthly', contract_start: '2026-07-15', contract_end: null, completed: false };
  const byMonth = orderIncomeByMonth(o, TODAY);
  assert.deepEqual([...byMonth.keys()], ['2026-07', '2026-08', '2026-09']); // 3 volle Monate bis 2.11.
  assert.equal(sum(byMonth), recognizedRevenue(o, TODAY));
  const done = { ...o, contract_end: '2027-01-14', completed: true };
  assert.equal(orderIncomeByMonth(done, TODAY).size, 6);
  assert.equal(sum(orderIncomeByMonth(done, TODAY)), recognizedRevenue(done, TODAY));
});

test('Auftrags-Ausgaben im Monat des Auftrags', () => {
  assert.deepEqual(obj(orderExpenseByMonth({ expenses: 45.9, execution_at: '2026-10-03T09:00:00' })), { '2026-10': 45.9 });
  assert.deepEqual(obj(orderExpenseByMonth({ expenses: null, execution_at: '2026-10-03T09:00:00' })), {});
});

test('Allgemeine Ausgaben: einmalig, monatlich bis heute bzw. Ende, jährlich', () => {
  assert.deepEqual(obj(expenseByMonth({ amount: 999, spent_on: '2026-10-05', repeat: 'once', ends_on: null }, TODAY)), { '2026-10': 999 });
  const monthly = expenseByMonth({ amount: 12, spent_on: '2026-08-20', repeat: 'monthly', ends_on: null }, TODAY);
  assert.deepEqual([...monthly.keys()], ['2026-08', '2026-09', '2026-10', '2026-11']);
  const ended = expenseByMonth({ amount: 12, spent_on: '2026-08-20', repeat: 'monthly', ends_on: '2026-09-30' }, TODAY);
  assert.deepEqual([...ended.keys()], ['2026-08', '2026-09']);
  const yearly = expenseByMonth({ amount: 240, spent_on: '2024-03-01', repeat: 'yearly', ends_on: null }, TODAY);
  assert.deepEqual(obj(yearly), { '2024-03': 240, '2025-03': 240, '2026-03': 240 });
});

test('Fixkosten pro Monat: laufende monatliche + jährliche anteilig', () => {
  const e = [
    { amount: 12, spent_on: '2026-01-01', repeat: 'monthly', ends_on: null },
    { amount: 240, spent_on: '2025-03-01', repeat: 'yearly', ends_on: null },
    { amount: 50, spent_on: '2026-01-01', repeat: 'monthly', ends_on: '2026-06-30' }, // beendet
    { amount: 30, spent_on: '2027-01-01', repeat: 'monthly', ends_on: null }, // beginnt später
    { amount: 999, spent_on: '2026-10-05', repeat: 'once', ends_on: null },
  ];
  assert.equal(fixedCostsPerMonth(e, TODAY), 32);
});

test('Monatsübersicht: Einnahmen − Ausgaben = Gewinn, Summe', () => {
  const orders = [
    { price: 1500, billing: 'once', execution_at: '2026-10-10T10:00:00', completed: true, expenses: 100 },
    { price: 300, billing: 'once', execution_at: '2026-11-01T10:00:00', completed: true },
  ];
  const expenses = [{ amount: 50, spent_on: '2026-10-01', repeat: 'monthly', ends_on: null }];
  const rows = summarize(orders, expenses, ['2026-10', '2026-11'], TODAY);
  assert.deepEqual(rows, [
    { month: '2026-10', income: 1500, expenses: 150, profit: 1350 },
    { month: '2026-11', income: 300, expenses: 50, profit: 250 },
  ]);
  assert.deepEqual(sumUp(rows), { income: 1800, expenses: 200, profit: 1600 });
});
