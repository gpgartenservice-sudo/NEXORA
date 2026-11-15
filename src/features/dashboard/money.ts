import { useEffect, useState } from 'react';

import {
  monthKey,
  orderIncomeByMonth,
  summarize,
  type ExpenseFacts,
  type OrderMoney,
} from '@/features/finance/finance-logic';

/**
 * Einnahmen-Feier auf der Startseite: Zahlen zählen hoch und Geldscheine fliegen –
 * beim App-Start (sobald es Einnahmen gibt) und jedes Mal, wenn in der App eine
 * Einnahme dazukommt (Auftrag abgeschlossen bzw. Rechnung bezahlt).
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

export type Celebration = { id: number; reason: 'start' | 'income'; from: MoneyNumbers };

let pending: Celebration | null = null;
let counter = 0;
const listeners = new Set<(c: Celebration | null) => void>();

/** Feier anmelden – die Startseite spielt sie ab, sobald sie zu sehen ist. */
export function queueCelebration(reason: Celebration['reason'], from: MoneyNumbers) {
  pending = { id: ++counter, reason, from };
  listeners.forEach((l) => l(pending));
}

/** Startseite: hat sie abgespielt */
export function celebrationDone(id: number) {
  if (pending?.id === id) pending = null;
}

export function useCelebration(): Celebration | null {
  const [c, setC] = useState<Celebration | null>(pending);
  useEffect(() => {
    listeners.add(setC);
    return () => {
      listeners.delete(setC);
    };
  }, []);
  return c;
}

/** Einmal pro App-Start feiern (nicht bei jedem Wechsel auf die Startseite) */
let startCelebrated = false;
export function takeStartCelebration(): boolean {
  if (startCelebrated) return false;
  startCelebrated = true;
  return true;
}
