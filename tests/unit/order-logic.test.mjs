// Unit-Tests für die Auftrags-Logik. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  computeStatus,
  elapsedMonths,
  finalPrice,
  outstandingRevenue,
  parseEuro,
  recognizedRevenue,
  statusGroup,
  totalMonths,
} from '../../src/features/crm/order-logic.ts';

const today = new Date(2026, 10, 3); // 3. November 2026

test('Status ergibt sich aus den Daten (spätester Schritt gewinnt)', () => {
  assert.equal(computeStatus({}), 'new');
  assert.equal(computeStatus({ meeting_at: '2026-11-05T10:00' }), 'meeting_planned');
  assert.equal(computeStatus({ meeting_at: 'x', meeting_done: true }), 'meeting_done');
  assert.equal(computeStatus({ price: 0 }), 'pricing');
  assert.equal(computeStatus({ price: 120, offer_sent: true }), 'quote_sent');
  assert.equal(computeStatus({ price: 120, offer_sent: true, offer_accepted: true }), 'accepted');
  assert.equal(computeStatus({ offer_accepted: true, execution_at: '2026-11-10' }), 'in_progress');
  assert.equal(computeStatus({ execution_at: '2026-11-10', completed: true }), 'completed');
  assert.equal(computeStatus({ completed: true, cancelled: true }), 'cancelled');
  assert.equal(statusGroup('pricing'), 'progress');
  assert.equal(statusGroup('completed'), 'done');
});

test('Preis nach Rabatt', () => {
  assert.equal(finalPrice({ price: 200, discount_percent: 10 }), 180);
  assert.equal(finalPrice({ price: 200, discount_percent: 150 }), 0);
  assert.equal(finalPrice({ price: 200, discount_percent: -5 }), 200);
  assert.equal(finalPrice({ price: null }), 0);
});

test('Einzelauftrag: Umsatz erst bei Abschluss, vorher anstehend', () => {
  const o = { price: 500, discount_percent: 20 };
  assert.equal(recognizedRevenue(o, today), 0);
  assert.equal(outstandingRevenue(o, today), 400);
  assert.equal(recognizedRevenue({ ...o, completed: true }, today), 400);
  assert.equal(outstandingRevenue({ ...o, completed: true }, today), 0);
  assert.equal(recognizedRevenue({ ...o, completed: true, cancelled: true }, today), 0);
});

test('Monatlicher Auftrag: Laufzeit, verstrichene Monate, Hochrechnung', () => {
  const o = { price: 100, billing: 'monthly', contract_start: '2026-08-15', contract_end: '2027-02-14' };
  assert.equal(totalMonths(o), 6);
  assert.equal(elapsedMonths(o, today), 2); // 15.08. -> 15.10. voll, 15.11. noch nicht
  assert.equal(recognizedRevenue(o, today), 200);
  assert.equal(outstandingRevenue(o, today), 400);
  // realisiert + anstehend = Monatspreis x Laufzeit
  assert.equal(recognizedRevenue(o, today) + outstandingRevenue(o, today), 600);
  assert.equal(recognizedRevenue({ ...o, completed: true }, today), 600);
});

test('Monatlicher Auftrag ohne Ende: zählt laufend, nichts hochgerechnet', () => {
  const o = { price: 50, billing: 'monthly', contract_start: '2026-05-01' };
  assert.equal(totalMonths(o), null);
  assert.equal(elapsedMonths(o, today), 6);
  assert.equal(recognizedRevenue(o, today), 300);
  assert.equal(outstandingRevenue(o, today), 0);
});

test('Vertrag in der Zukunft zählt noch nichts', () => {
  const o = { price: 80, billing: 'monthly', contract_start: '2027-01-01', contract_end: '2027-12-31' };
  assert.equal(elapsedMonths(o, today), 0);
  assert.equal(recognizedRevenue(o, today), 0);
  assert.equal(outstandingRevenue(o, today), 960);
});

test('Beträge im deutschen Format lesen', () => {
  assert.equal(parseEuro('1.234,56'), 1234.56);
  assert.equal(parseEuro('99'), 99);
  assert.equal(parseEuro('12,5 €'), 12.5);
  assert.equal(parseEuro('1234.5'), 1234.5);
  assert.equal(parseEuro('1.500'), 1500);
  assert.equal(parseEuro('12.000.000'), 12000000);
  assert.equal(parseEuro('12.50'), 12.5);
  assert.equal(parseEuro('1.500,5'), 1500.5);
  assert.equal(parseEuro(''), null);
  assert.equal(parseEuro('abc'), 'invalid');
});
