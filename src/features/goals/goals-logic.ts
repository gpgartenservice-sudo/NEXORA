/**
 * To-dos & Ziele – reine Logik (ohne App/Netz, mit Unit-Tests):
 * To-dos nach Fälligkeit ordnen, Ziele beschreiben und ihren Fortschritt
 * im aktuellen Zeitraum aus den echten Zahlen der App berechnen.
 */
import { formatEuro } from '../crm/order-logic';
import { monthKey, monthRange, summarize, type OrderMoney } from '../finance/finance-logic';
import { dayKey, startOfWeek } from '../social/social-logic';

export type Todo = {
  id: string;
  title: string;
  notes: string | null;
  /** "JJJJ-MM-TT" */
  due_on: string | null;
  important: boolean;
  done: boolean;
  done_at: string | null;
  customer_id: string | null;
  order_id: string | null;
  created_at: string;
  updated_at: string;
};

export type GoalKind = 'revenue' | 'customers' | 'orders' | 'posts' | 'custom';
export type GoalPeriod = 'week' | 'month' | 'year' | 'once';

export type Goal = {
  id: string;
  kind: GoalKind;
  period: GoalPeriod;
  target: number;
  /** nur bei eigenen Zielen */
  title: string | null;
  /** Fortschritt eigener Ziele (von Hand) */
  progress: number;
  due_on: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
const pad = (n: number) => String(n).padStart(2, '0');

/** Tag in lokaler Zeit; "JJJJ-MM-TT" bleibt, wie es ist */
export function localDay(value: string | Date): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayKey(value);
}

const dateOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const daysBetween = (from: string, to: string) => Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / DAY);
const plusDays = (day: string, n: number) => {
  const d = dateOf(day);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

// ---------------------------------------------------------------------------
// To-dos
// ---------------------------------------------------------------------------

export type TodoGroupKey = 'overdue' | 'today' | 'week' | 'later' | 'someday';
export const TODO_GROUP_LABEL: Record<TodoGroupKey, string> = {
  overdue: 'Überfällig',
  today: 'Heute',
  week: 'Nächste 7 Tage',
  later: 'Später',
  someday: 'Ohne Datum',
};

/** In welche Gruppe gehört ein offenes To-do? */
export function todoGroup(t: Pick<Todo, 'due_on'>, today: string): TodoGroupKey {
  if (!t.due_on) return 'someday';
  const diff = daysBetween(today, t.due_on);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

/** Reihenfolge: Fälligkeit, dann wichtig, dann älteste zuerst */
export function compareTodos(a: Todo, b: Todo): number {
  if (a.due_on !== b.due_on) {
    if (!a.due_on) return 1;
    if (!b.due_on) return -1;
    return a.due_on.localeCompare(b.due_on);
  }
  if (a.important !== b.important) return a.important ? -1 : 1;
  return a.created_at.localeCompare(b.created_at);
}

/** Offene To-dos nach Fälligkeit gruppiert (leere Gruppen fallen weg) + zuletzt erledigte */
export function groupTodos(todos: Todo[], today: string, doneLimit = 10) {
  const open = todos.filter((t) => !t.done).sort(compareTodos);
  const groups = (Object.keys(TODO_GROUP_LABEL) as TodoGroupKey[])
    .map((key) => ({ key, label: TODO_GROUP_LABEL[key], items: open.filter((t) => todoGroup(t, today) === key) }))
    .filter((g) => g.items.length > 0);
  const done = todos
    .filter((t) => t.done)
    .sort((a, b) => (b.done_at ?? b.updated_at).localeCompare(a.done_at ?? a.updated_at))
    .slice(0, doneLimit);
  return { groups, done, openCount: open.length };
}

/** Für die Startseite: überfällig und heute (wichtige zuerst), höchstens `max` */
export function todayTodos(todos: Todo[], today: string, max = 5): Todo[] {
  return todos
    .filter((t) => !t.done && t.due_on && t.due_on <= today)
    .sort((a, b) => Number(b.important) - Number(a.important) || compareTodos(a, b))
    .slice(0, max);
}

/** "Heute", "Morgen", "Gestern", "seit 3 Tagen", "Fr., 6. Nov." */
export function dueLabel(due: string, today: string): string {
  const diff = daysBetween(today, due);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff < 0) return `seit ${-diff} Tagen`;
  const d = dateOf(due);
  const sameYear = due.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Schnellwahl beim Anlegen */
export const DUE_PRESETS = [
  { key: 'none', label: 'Ohne Datum' },
  { key: 'today', label: 'Heute' },
  { key: 'tomorrow', label: 'Morgen' },
  { key: 'week', label: 'Nächste Woche' },
] as const;
export type DuePreset = (typeof DUE_PRESETS)[number]['key'];

/** Schnellwahl -> Datum ("Nächste Woche" = Montag der nächsten Woche) */
export function presetDue(preset: DuePreset, today: string): string | null {
  if (preset === 'none') return null;
  if (preset === 'today') return today;
  if (preset === 'tomorrow') return plusDays(today, 1);
  return plusDays(dayKey(startOfWeek(dateOf(today))), 7);
}

// ---------------------------------------------------------------------------
// Ziele
// ---------------------------------------------------------------------------

export const GOAL_KINDS: { kind: GoalKind; label: string; description: string; unit: string }[] = [
  { kind: 'revenue', label: 'Umsatz', description: 'Einnahmen aus abgeschlossenen Aufträgen', unit: '€' },
  { kind: 'customers', label: 'Neue Kunden', description: 'Kunden, die du neu anlegst', unit: 'Kunden' },
  { kind: 'orders', label: 'Abgeschlossene Aufträge', description: 'Aufträge, die du abschließt', unit: 'Aufträge' },
  { kind: 'posts', label: 'Veröffentlichte Posts', description: 'Posts, die online gehen', unit: 'Posts' },
  { kind: 'custom', label: 'Eigenes Ziel', description: 'z. B. 10 Google-Bewertungen – du zählst selbst', unit: '' },
];

export const PERIOD_LABEL: Record<Exclude<GoalPeriod, 'once'>, string> = {
  week: 'pro Woche',
  month: 'pro Monat',
  year: 'pro Jahr',
};

/** Erlaubte Zeiträume je Art */
export function periodsFor(kind: GoalKind): GoalPeriod[] {
  if (kind === 'custom') return ['once'];
  if (kind === 'revenue') return ['month', 'year'];
  return ['week', 'month', 'year'];
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

/** Wert in der Einheit des Ziels: "1.250,00 €", "3 Kunden", "4" */
export function goalValue(kind: GoalKind, n: number): string {
  if (kind === 'revenue') return formatEuro(n);
  if (kind === 'customers') return count(n, 'Kunde', 'Kunden');
  if (kind === 'orders') return count(n, 'Auftrag', 'Aufträge');
  if (kind === 'posts') return count(n, 'Post', 'Posts');
  return n.toLocaleString('de-DE');
}

/** Überschrift: "3.000,00 € Umsatz pro Monat", "5 neue Kunden pro Woche", eigener Titel */
export function goalTitle(g: Pick<Goal, 'kind' | 'period' | 'target' | 'title'>): string {
  if (g.kind === 'custom') return g.title?.trim() || 'Eigenes Ziel';
  const per = g.period === 'once' ? '' : ` ${PERIOD_LABEL[g.period]}`;
  if (g.kind === 'revenue') return `${formatEuro(g.target)} Umsatz${per}`;
  if (g.kind === 'customers') return `${count(g.target, 'neuer Kunde', 'neue Kunden')}${per}`;
  if (g.kind === 'orders') return `${count(g.target, 'abgeschlossener Auftrag', 'abgeschlossene Aufträge')}${per}`;
  return `${count(g.target, 'Post', 'Posts')} veröffentlichen${per}`;
}

/** Zeitraum, in dem gerade gezählt wird (Tage "JJJJ-MM-TT", `to` einschließlich) */
export function periodRange(period: GoalPeriod, today: Date): { from: string; to: string; label: string } {
  if (period === 'week') {
    const monday = startOfWeek(today);
    const from = dayKey(monday);
    return { from, to: plusDays(from, 6), label: 'diese Woche' };
  }
  if (period === 'month') {
    const y = today.getFullYear();
    const m = today.getMonth();
    const last = new Date(y, m + 1, 0).getDate();
    return {
      from: `${y}-${pad(m + 1)}-01`,
      to: `${y}-${pad(m + 1)}-${pad(last)}`,
      label: today.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
    };
  }
  if (period === 'year') {
    const y = today.getFullYear();
    return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  }
  return { from: '0000-01-01', to: '9999-12-31', label: '' };
}

/** Daten, aus denen der Fortschritt kommt */
export type GoalData = {
  orders: (OrderMoney & { completed?: boolean | null; completed_on?: string | null })[];
  customers: { created_at: string }[];
  posts: { published_at?: string | null }[];
};

export type GoalStatus = 'done' | 'on_track' | 'behind';
export type GoalProgress = {
  current: number;
  /** 0 bis 1 */
  ratio: number;
  status: GoalStatus;
  /** "2 von 5 neuen Kunden · diese Woche" */
  summary: string;
  /** "Noch 3 Kunden in 4 Tagen", "Geschafft!" */
  hint: string;
  periodLabel: string;
};

const inRange = (day: string | null | undefined, from: string, to: string) => !!day && day >= from && day <= to;

/** Fortschritt eines Ziels im aktuellen Zeitraum */
export function goalProgress(goal: Goal, data: GoalData, now: Date = new Date()): GoalProgress {
  const range = periodRange(goal.period, now);
  const today = dayKey(now);
  let current = 0;
  if (goal.kind === 'revenue') {
    const months = monthRange(monthKey(range.from), monthKey(range.to));
    current = summarize(data.orders, [], months, now).reduce((s, m) => s + m.income, 0);
  } else if (goal.kind === 'customers') {
    current = data.customers.filter((c) => inRange(localDay(c.created_at), range.from, range.to)).length;
  } else if (goal.kind === 'orders') {
    current = data.orders.filter(
      (o) =>
        o.completed && !o.cancelled && inRange(o.completed_on ? localDay(o.completed_on) : null, range.from, range.to),
    ).length;
  } else if (goal.kind === 'posts') {
    current = data.posts.filter((p) =>
      inRange(p.published_at ? localDay(p.published_at) : null, range.from, range.to),
    ).length;
  } else {
    current = Number(goal.progress) || 0;
  }
  current = Math.round(current * 100) / 100;
  const target = Number(goal.target);
  const ratio = target > 0 ? Math.min(1, current / target) : 0;

  // Im Plan? Erwarteter Stand = Anteil des Zeitraums, der schon vorbei ist
  let status: GoalStatus = current >= target ? 'done' : 'on_track';
  let daysLeft: number | null = null;
  if (status !== 'done' && goal.period !== 'once') {
    const total = daysBetween(range.from, range.to) + 1;
    const elapsed = daysBetween(range.from, today) + 1;
    daysLeft = total - elapsed;
    if (current < target * (elapsed / total) * 0.8) status = 'behind';
  } else if (status !== 'done' && goal.due_on) {
    daysLeft = daysBetween(today, goal.due_on);
    if (daysLeft < 0) status = 'behind';
  }

  const unitValue = (n: number) => (goal.kind === 'custom' ? n.toLocaleString('de-DE') : goalValue(goal.kind, n));
  const summary =
    goal.kind === 'revenue'
      ? `${formatEuro(current)} von ${formatEuro(target)}`
      : `${current.toLocaleString('de-DE')} von ${unitValue(target)}`;
  const left = Math.max(0, Math.round((target - current) * 100) / 100);
  let hint: string;
  if (status === 'done') hint = 'Geschafft!';
  else if (daysLeft === null) hint = `Noch ${unitValue(left)}`;
  else if (daysLeft < 0) hint = `Noch ${unitValue(left)} – Termin ist vorbei`;
  else if (daysLeft === 0) hint = `Noch ${unitValue(left)} – heute ist der letzte Tag`;
  else hint = `Noch ${unitValue(left)} in ${daysLeft === 1 ? '1 Tag' : `${daysLeft} Tagen`}`;

  return { current, ratio, status, summary, hint, periodLabel: range.label };
}

export const STATUS_LABEL: Record<GoalStatus, string> = {
  done: 'Geschafft',
  on_track: 'Im Plan',
  behind: 'Hinterher',
};

/** Zielwert aus dem Eingabefeld ("3.000", "2,5", "10"); allowZero für den Fortschritt */
export function parseTarget(input: string, allowZero = false): number | null | 'invalid' {
  const s = input.trim().replace(/\s|€/g, '');
  if (!s) return null;
  let normalized = s;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '');
  if (!/^\d+(\.\d+)?$/.test(normalized)) return 'invalid';
  const n = Math.round(Number(normalized) * 100) / 100;
  return (allowZero ? n >= 0 : n > 0) && n <= 100_000_000 ? n : 'invalid';
}

// ---------------------------------------------------------------------------
// Für Nexy
// ---------------------------------------------------------------------------

/**
 * Offene To-dos für Nexy mit Kurzzeichen (A1, A2 …), über das Nexy sie
 * ändern kann; `refs` übersetzt es zurück.
 */
export function nexyTodos(
  todos: Todo[],
  names: { customer: (id: string) => string | null; order: (id: string) => string | null },
  max = 30,
) {
  const list = todos
    .filter((t) => !t.done)
    .sort(compareTodos)
    .slice(0, max);
  const refs: Record<string, string> = {};
  const entries = list.map((t, i) => {
    const ref = `A${i + 1}`;
    refs[ref] = t.id;
    return {
      ref,
      was: t.title,
      ...(t.due_on ? { faellig: t.due_on } : {}),
      ...(t.important ? { wichtig: true } : {}),
      ...(t.customer_id && names.customer(t.customer_id) ? { kunde: names.customer(t.customer_id) } : {}),
      ...(t.order_id && names.order(t.order_id) ? { auftrag: names.order(t.order_id) } : {}),
    };
  });
  return { entries, refs, open: todos.filter((t) => !t.done).length };
}

/** Aktive Ziele mit Stand für Nexy */
export function nexyGoals(goals: Goal[], data: GoalData, now: Date = new Date(), max = 10) {
  return goals
    .filter((g) => !g.archived)
    .slice(0, max)
    .map((g) => {
      const p = goalProgress(g, data, now);
      return {
        ziel: goalTitle(g),
        stand: p.summary,
        ...(p.periodLabel ? { zeitraum: p.periodLabel } : {}),
        status: STATUS_LABEL[p.status],
      };
    });
}
