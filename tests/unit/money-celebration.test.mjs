// Unit-Tests: Einnahmen-Feier läuft genau einmal. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { celebrationDone, MERGE_MS, peekCelebration, queueCelebration } from '../../src/features/dashboard/money.ts';

const ZERO = { income: 0, expenses: 0, profit: 0 };

// money.ts merkt sich den Zustand im Modul – die Tests laufen nacheinander und räumen selbst auf
test('Einnahme: doppelte Meldung wird eine Feier, danach kommt sie nicht noch einmal', () => {
  const t0 = 1_000_000;
  queueCelebration('income', ZERO, 120, t0);
  queueCelebration('income', ZERO, 450, t0 + 300); // Rechnung bezahlt kurz danach
  // eine wartende Feier – mit dem größeren Betrag
  const pending1 = peek();
  assert.equal(pending1.reason, 'income');
  assert.equal(pending1.amount, 450);
  celebrationDone(pending1.id, t0 + 1000);
  assert.equal(peek(), null);

  // gleich danach noch eine Meldung derselben Einnahme → keine zweite Show
  queueCelebration('income', ZERO, 450, t0 + 3000);
  assert.equal(peek(), null);

  // viel später: neue Einnahme → neue Show
  queueCelebration('income', ZERO, 80, t0 + 1000 + MERGE_MS + 1);
  const pending2 = peek();
  assert.equal(pending2.amount, 80);
  assert.notEqual(pending2.id, pending1.id);
  celebrationDone(pending2.id, t0 + 20_000);
});

test('App-Start-Feier wird zur Einnahmen-Feier, nicht beides', () => {
  const t0 = 5_000_000;
  queueCelebration('start', ZERO, 0, t0);
  queueCelebration('start', ZERO, 0, t0 + 10); // zweiter Start-Wunsch zählt nicht
  queueCelebration('income', ZERO, 99, t0 + 50);
  const p = peek();
  assert.equal(p.reason, 'income');
  assert.equal(p.amount, 99);
  celebrationDone(p.id, t0 + 100);
  assert.equal(peek(), null);
});

const peek = () => peekCelebration();
