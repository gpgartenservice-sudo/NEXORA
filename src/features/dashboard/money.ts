import { useSyncExternalStore } from 'react';

import {
  monthKey,
  orderIncomeByMonth,
  summarize,
  type ExpenseFacts,
  type OrderMoney,
} from '../finance/finance-logic';

/**
 * Einnahmen-Feier auf der Startseite: Zahlen zählen hoch und Geldscheine fliegen –
 * beim App-Start (sobald es Einnahmen gibt) und einmal, wenn in der App eine
 * Einnahme dazukommt (Auftrag abgeschlossen bzw. Rechnung bezahlt). Bei Einnahmen
 * gibt es die große Show mit Betrag und Luna (money-celebration.tsx).
 */

export type MoneyNumbers = { income: number; expenses: number; profit: number };

/** Alle Einnahmen bisher (zum Erkennen neuer Einnahmen) */
export function allTimeIncome(orders: OrderMoney[], today = new Date()): number {
  let sum = 0;
  for (const o of orders) for (const v of orderIncomeByMonth(o, today).values()) sum += v;
  return Math.round(sum * 100) / 100;
}

/** Einnahmen, Ausgaben, Gewinn im laufenden Monat */
export function monthNumbers(orders: OrderMoney[], expenses: ExpenseFacts[], today = new Date()): MoneyNumbers {
  const [row] = summarize(orders, expenses, [monthKey(today)], today);
  return { income: row.income, expenses: row.expenses, profit: row.profit };
}

export type Celebration = {
  id: number;
  reason: 'start' | 'income';
  from: MoneyNumbers;
  /** wie viel neu dazukam (nur bei 'income') */
  amount: number;
};

let pending: Celebration | null = null;
let counter = 0;
/** Wann zuletzt eine Einnahme gefeiert wurde – kurz danach nicht gleich noch einmal */
let lastIncomeShow = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** So lange gilt eine zweite Meldung als Teil derselben Einnahme (z. B. Auftrag + bezahlte Rechnung) */
export const MERGE_MS = 8000;

/**
 * Feier anmelden – die Startseite spielt sie genau einmal ab, sobald sie zu sehen ist.
 * Kommen kurz hintereinander zwei Meldungen (Auftrag erledigt + Rechnung bezahlt),
 * wird daraus eine einzige Feier.
 */
export function queueCelebration(reason: Celebration['reason'], from: MoneyNumbers, amount = 0, now = Date.now()) {
  if (reason === 'income') {
    if (pending?.reason === 'income') {
      pending = { ...pending, amount: Math.max(pending.amount, amount) };
      notify();
      return;
    }
    if (now - lastIncomeShow < MERGE_MS) return;
    // eine wartende Start-Feier wird zur Einnahmen-Feier (nicht beides)
  } else if (pending) {
    return;
  }
  pending = { id: ++counter, reason, from: pending?.from ?? from, amount };
  notify();
}

/** Startseite: hat sie abgespielt – danach kommt sie nicht noch einmal */
export function celebrationDone(id: number, now = Date.now()) {
  if (pending?.id !== id) return;
  if (pending.reason === 'income') lastIncomeShow = now;
  pending = null;
  notify();
}

/** Was gerade ansteht (für Tests) */
export const peekCelebration = () => pending;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCelebration(): Celebration | null {
  return useSyncExternalStore(subscribe, () => pending, () => pending);
}

// Läuft gerade die große Einnahmen-Show? (Dann wartet z. B. Lunas Begrüßung)
let showRunning = false;

export function setMoneyShowRunning(on: boolean) {
  showRunning = on;
  notify();
}

export function useMoneyShowRunning(): boolean {
  return useSyncExternalStore(subscribe, () => showRunning, () => showRunning);
}

/** Einmal pro App-Start feiern (nicht bei jedem Wechsel auf die Startseite) */
let startCelebrated = false;
export function takeStartCelebration(): boolean {
  if (startCelebrated) return false;
  startCelebrated = true;
  return true;
}
