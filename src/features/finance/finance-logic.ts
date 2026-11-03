/**
 * Rechenlogik für den Bereich Finanzen – nach dem Vorbild des
 * GP-Gartenservice-Systems:
 *
 * - Einnahmen = realisierter Umsatz aus Aufträgen (wie in "Aufträge"):
 *   Einzelaufträge im Monat der Ausführung bzw. des Abschlusses,
 *   monatliche Aufträge Monat für Monat.
 * - Ausgaben = Ausgaben bei Aufträgen (z. B. Material) + allgemeine
 *   Ausgaben (einmalig, monatlich oder jährlich).
 * - Gewinn = Einnahmen − Ausgaben.
 *
 * Vereinfachte Übersicht – ersetzt keine Buchhaltung.
 */
import { toDate } from '../../lib/dates';
import { elapsedMonths, finalPrice, isMonthly, totalMonths, type OrderFacts } from '../crm/order-logic';

/** Monat als "JJJJ-MM" */
export type MonthKey = string;

export type ExpenseRepeat = 'once' | 'monthly' | 'yearly';

export const EXPENSE_CATEGORIES = [
  { key: 'material', label: 'Material & Waren' },
  { key: 'tools', label: 'Werkzeug & Geräte' },
  { key: 'software', label: 'Software & Abos' },
  { key: 'marketing', label: 'Werbung & Marketing' },
  { key: 'vehicle', label: 'Auto & Fahrten' },
  { key: 'office', label: 'Büro & Telefon' },
  { key: 'insurance', label: 'Versicherungen' },
  { key: 'fees', label: 'Gebühren & Steuerberatung' },
  { key: 'education', label: 'Weiterbildung' },
  { key: 'other', label: 'Sonstiges' },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['key'];

export const categoryLabel = (key: string) => EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? 'Sonstiges';

export type ExpenseFacts = {
  amount: number;
  spent_on: string;
  repeat: ExpenseRepeat;
  ends_on: string | null;
};

/** Was ein Auftrag für die Finanzen braucht */
export type OrderMoney = OrderFacts & {
  execution_at?: string | null;
  completed_on?: string | null;
  created_at?: string | null;
  expenses?: number | null;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

/** Datum (JJJJ-MM-TT oder Zeitstempel) -> "JJJJ-MM" in lokaler Zeit */
export function monthKey(value: string | Date): MonthKey {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7);
  const d = typeof value === 'string' ? (toDate(value) ?? new Date(Number.NaN)) : value;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** "2026-11" + 2 -> "2027-01" */
export function addMonths(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}

/** Alle Monate von bis (einschließlich) */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = from; k <= to && out.length < 600; k = addMonths(k, 1)) out.push(k);
  return out;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** "2026-11" -> "November 2026" bzw. kurz "Nov" */
export function monthLabel(key: MonthKey, short = false): string {
  const [y, m] = key.split('-').map(Number);
  return short ? MONTHS_SHORT[m - 1] : `${MONTHS[m - 1]} ${y}`;
}

/** Tag, dem ein Einzelauftrag zugeordnet wird: Ausführung, sonst Abschluss, sonst Anlage. */
export function orderDay(o: OrderMoney): string | null {
  return o.execution_at || o.completed_on || o.created_at || null;
}

function add(map: Map<MonthKey, number>, key: MonthKey, amount: number) {
  map.set(key, round2((map.get(key) ?? 0) + amount));
}

/** Einnahmen eines Auftrags je Monat (in Summe = realisierter Umsatz). */
export function orderIncomeByMonth(o: OrderMoney, today: Date = new Date()): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>();
  if (o.cancelled) return out;
  const price = finalPrice(o);
  if (price <= 0) return out;
  if (!isMonthly(o)) {
    const day = orderDay(o);
    if (o.completed && day) add(out, monthKey(day), price);
    return out;
  }
  if (!o.contract_start) return out;
  const total = totalMonths(o);
  const months = o.completed && total !== null ? total : elapsedMonths(o, today);
  const start = monthKey(o.contract_start);
  for (let k = 0; k < months; k++) add(out, addMonths(start, k), price);
  return out;
}

/** Ausgaben, die direkt bei einem Auftrag eingetragen sind (z. B. Material). */
export function orderExpenseByMonth(o: OrderMoney): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>();
  const amount = Number(o.expenses ?? 0);
  const day = orderDay(o);
  if (amount > 0 && day) add(out, monthKey(day), amount);
  return out;
}

/** Allgemeine Ausgabe je Monat – wiederkehrende bis heute bzw. bis zum Ende. */
export function expenseByMonth(e: ExpenseFacts, today: Date = new Date()): Map<MonthKey, number> {
  const out = new Map<MonthKey, number>();
  const amount = Number(e.amount);
  if (!(amount > 0)) return out;
  const start = monthKey(e.spent_on);
  if (e.repeat === 'once') {
    add(out, start, amount);
    return out;
  }
  const now = monthKey(today);
  const last = e.ends_on && monthKey(e.ends_on) < now ? monthKey(e.ends_on) : now;
  const step = e.repeat === 'yearly' ? 12 : 1;
  for (let k = start; k <= last; k = addMonths(k, step)) add(out, k, amount);
  return out;
}

/** Läuft eine wiederkehrende Ausgabe gerade? */
export function isActive(e: ExpenseFacts, today: Date = new Date()): boolean {
  if (e.repeat === 'once') return false;
  const now = monthKey(today);
  return monthKey(e.spent_on) <= now && (!e.ends_on || monthKey(e.ends_on) >= now);
}

/** Laufende Fixkosten pro Monat (jährliche anteilig). */
export function fixedCostsPerMonth(expenses: ExpenseFacts[], today: Date = new Date()): number {
  return round2(
    expenses
      .filter((e) => isActive(e, today))
      .reduce((s, e) => s + (e.repeat === 'yearly' ? Number(e.amount) / 12 : Number(e.amount)), 0),
  );
}

export type MonthSummary = { month: MonthKey; income: number; expenses: number; profit: number };

/** Einnahmen, Ausgaben und Gewinn für jeden der angegebenen Monate. */
export function summarize(
  orders: OrderMoney[],
  expenses: ExpenseFacts[],
  months: MonthKey[],
  today: Date = new Date(),
): MonthSummary[] {
  const income = new Map<MonthKey, number>();
  const spent = new Map<MonthKey, number>();
  for (const o of orders) {
    for (const [k, v] of orderIncomeByMonth(o, today)) add(income, k, v);
    for (const [k, v] of orderExpenseByMonth(o)) add(spent, k, v);
  }
  for (const e of expenses) for (const [k, v] of expenseByMonth(e, today)) add(spent, k, v);
  return months.map((month) => {
    const i = income.get(month) ?? 0;
    const x = spent.get(month) ?? 0;
    return { month, income: i, expenses: x, profit: round2(i - x) };
  });
}

/** Summe über mehrere Monate */
export function sumUp(rows: MonthSummary[]): Omit<MonthSummary, 'month'> {
  const income = round2(rows.reduce((s, r) => s + r.income, 0));
  const expenses = round2(rows.reduce((s, r) => s + r.expenses, 0));
  return { income, expenses, profit: round2(income - expenses) };
}

/** Betrag in den angegebenen Monaten */
export function amountIn(byMonth: Map<MonthKey, number>, months: Set<MonthKey>): number {
  let sum = 0;
  for (const [k, v] of byMonth) if (months.has(k)) sum += v;
  return round2(sum);
}

/** Zeitraum für den Einkommensnachweis: letzte volle Monate (ohne den laufenden) bzw. das letzte Jahr. */
export function incomeProofMonths(preset: '3' | '6' | '12' | 'year' | 'last_year', today: Date = new Date()): MonthKey[] {
  const last = addMonths(monthKey(today), -1);
  if (preset === 'year' || preset === 'last_year') {
    const y = today.getFullYear() - 1;
    return monthRange(`${y}-01`, `${y}-12`);
  }
  return monthRange(addMonths(last, -(Number(preset) - 1)), last);
}
