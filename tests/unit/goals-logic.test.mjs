// Unit-Tests: To-dos & Ziele. Start: npm run test:unit
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dueLabel,
  goalProgress,
  goalTitle,
  groupTodos,
  localDay,
  nexyGoals,
  nexyTodos,
  parseTarget,
  periodRange,
  periodsFor,
  presetDue,
  todayTodos,
  todoGroup,
} from '../../src/features/goals/goals-logic.ts';

const n = (s) => s.replace(/ /g, ' ');
const TODAY = '2026-11-04'; // Mittwoch
const NOW = new Date(2026, 10, 4, 12, 0);
const todo = (o) => ({
  id: 'x',
  title: 'X',
  notes: null,
  due_on: null,
  important: false,
  done: false,
  done_at: null,
  customer_id: null,
  order_id: null,
  created_at: '2026-11-01T10:00:00Z',
  updated_at: '2026-11-01T10:00:00Z',
  ...o,
});
const goal = (o) => ({
  id: 'g',
  kind: 'customers',
  period: 'week',
  target: 5,
  title: null,
  progress: 0,
  due_on: null,
  archived: false,
  created_at: '',
  updated_at: '',
  ...o,
});

test('To-dos: Gruppe nach Fälligkeit', () => {
  assert.equal(todoGroup({ due_on: '2026-11-03' }, TODAY), 'overdue');
  assert.equal(todoGroup({ due_on: TODAY }, TODAY), 'today');
  assert.equal(todoGroup({ due_on: '2026-11-11' }, TODAY), 'week');
  assert.equal(todoGroup({ due_on: '2026-11-12' }, TODAY), 'later');
  assert.equal(todoGroup({ due_on: null }, TODAY), 'someday');
});

test('To-dos: Gruppen, Reihenfolge (wichtig zuerst), erledigte zuletzt erledigt oben', () => {
  const { groups, done, openCount } = groupTodos(
    [
      todo({ id: 'a', due_on: TODAY }),
      todo({ id: 'b', due_on: TODAY, important: true }),
      todo({ id: 'c', due_on: '2026-11-01' }),
      todo({ id: 'd' }),
      todo({ id: 'e', done: true, done_at: '2026-11-03T10:00:00Z' }),
      todo({ id: 'f', done: true, done_at: '2026-11-04T08:00:00Z' }),
    ],
    TODAY,
  );
  assert.deepEqual(
    groups.map((g) => g.key),
    ['overdue', 'today', 'someday'],
  );
  assert.deepEqual(
    groups[1].items.map((t) => t.id),
    ['b', 'a'],
  );
  assert.deepEqual(
    done.map((t) => t.id),
    ['f', 'e'],
  );
  assert.equal(openCount, 4);
});

test('Startseite: überfällig + heute, wichtige zuerst, begrenzt', () => {
  const list = todayTodos(
    [
      todo({ id: 'a', due_on: TODAY }),
      todo({ id: 'b', due_on: '2026-11-02' }),
      todo({ id: 'c', due_on: TODAY, important: true }),
      todo({ id: 'd', due_on: '2026-11-05' }),
      todo({ id: 'e' }),
      todo({ id: 'f', due_on: TODAY, done: true }),
    ],
    TODAY,
  );
  assert.deepEqual(
    list.map((t) => t.id),
    ['c', 'b', 'a'],
  );
  assert.equal(
    todayTodos([todo({ due_on: TODAY }), todo({ due_on: TODAY }), todo({ due_on: TODAY })], TODAY, 2).length,
    2,
  );
});

test('Fälligkeit als Text und Schnellwahl', () => {
  assert.equal(dueLabel(TODAY, TODAY), 'Heute');
  assert.equal(dueLabel('2026-11-05', TODAY), 'Morgen');
  assert.equal(dueLabel('2026-11-03', TODAY), 'Gestern');
  assert.equal(dueLabel('2026-10-31', TODAY), 'seit 4 Tagen');
  assert.match(dueLabel('2026-11-06', TODAY), /^Fr\.?, 6\. Nov\.?$/);
  assert.match(dueLabel('2027-01-08', TODAY), /2027/);
  assert.equal(presetDue('none', TODAY), null);
  assert.equal(presetDue('today', TODAY), TODAY);
  assert.equal(presetDue('tomorrow', TODAY), '2026-11-05');
  assert.equal(presetDue('week', TODAY), '2026-11-09'); // Montag
  assert.equal(presetDue('tomorrow', '2026-10-24'), '2026-10-25'); // Zeitumstellung
});

test('Lokaler Tag: Datum bleibt, Zeitpunkt in lokaler Zeit', () => {
  assert.equal(localDay('2026-11-04'), '2026-11-04');
  assert.equal(localDay('2026-11-03T23:30:00Z'), '2026-11-04');
});

test('Ziele: Titel, Zeiträume, Eingabe', () => {
  assert.equal(n(goalTitle({ kind: 'revenue', period: 'month', target: 3000 })), '3.000,00 € Umsatz pro Monat');
  assert.equal(goalTitle({ kind: 'customers', period: 'week', target: 1 }), '1 neuer Kunde pro Woche');
  assert.equal(goalTitle({ kind: 'customers', period: 'week', target: 5 }), '5 neue Kunden pro Woche');
  assert.equal(goalTitle({ kind: 'orders', period: 'year', target: 50 }), '50 abgeschlossene Aufträge pro Jahr');
  assert.equal(goalTitle({ kind: 'posts', period: 'week', target: 3 }), '3 Posts veröffentlichen pro Woche');
  assert.equal(
    goalTitle({ kind: 'custom', period: 'once', target: 10, title: '10 Google-Bewertungen' }),
    '10 Google-Bewertungen',
  );
  assert.deepEqual(periodsFor('revenue'), ['month', 'year']);
  assert.deepEqual(periodsFor('custom'), ['once']);
  assert.deepEqual(periodRange('week', NOW), { from: '2026-11-02', to: '2026-11-08', label: 'diese Woche' });
  assert.equal(periodRange('month', NOW).to, '2026-11-30');
  assert.equal(periodRange('month', NOW).label, 'November 2026');
  assert.equal(periodRange('year', NOW).from, '2026-01-01');
  assert.equal(parseTarget('3.000'), 3000);
  assert.equal(parseTarget('2,5'), 2.5);
  assert.equal(parseTarget('3000 €'), 3000);
  assert.equal(parseTarget(''), null);
  assert.equal(parseTarget('0'), 'invalid');
  assert.equal(parseTarget('abc'), 'invalid');
});

const data = {
  orders: [
    {
      price: 1200,
      billing: 'once',
      completed: true,
      completed_on: '2026-11-02',
      execution_at: '2026-11-02T09:00:00Z',
      created_at: '2026-10-20T09:00:00Z',
    },
    {
      price: 300,
      billing: 'once',
      completed: true,
      completed_on: '2026-10-28',
      execution_at: '2026-10-28T09:00:00Z',
      created_at: '2026-10-20T09:00:00Z',
    },
    {
      price: 100,
      billing: 'monthly',
      contract_start: '2026-09-01',
      completed: false,
      created_at: '2026-09-01T09:00:00Z',
    },
    {
      price: 999,
      billing: 'once',
      completed: true,
      cancelled: true,
      completed_on: '2026-11-03',
      created_at: '2026-10-01T09:00:00Z',
    },
    { price: 500, billing: 'once', completed: false, created_at: '2026-11-03T09:00:00Z' },
  ],
  customers: [
    { created_at: '2026-11-02T08:00:00Z' },
    { created_at: '2026-11-04T07:00:00Z' },
    { created_at: '2026-11-01T23:30:00Z' },
    { created_at: '2026-10-30T10:00:00Z' },
  ],
  posts: [{ published_at: '2026-11-03T18:00:00Z' }, { published_at: null }, { published_at: '2026-10-01T18:00:00Z' }],
};

test('Fortschritt: Umsatz im Monat (wie Finanzen: abgeschlossene, Monatsverträge je vollem Monat, ohne storniert)', () => {
  const p = goalProgress(goal({ kind: 'revenue', period: 'month', target: 3000 }), data, NOW);
  assert.equal(p.current, 1200); // Monatsvertrag: November zählt erst ab 1. Dezember
  assert.equal(n(p.summary), '1.200,00 € von 3.000,00 €');
  assert.equal(p.periodLabel, 'November 2026');
  assert.equal(p.status, 'on_track'); // 4 von 30 Tagen vorbei
  assert.match(n(p.hint), /^Noch 1\.800,00 € in 26 Tagen$/);
});

test('Fortschritt: neue Kunden diese Woche (lokale Zeit), Aufträge, Posts', () => {
  const c = goalProgress(goal({ kind: 'customers', period: 'week', target: 5 }), data, NOW);
  assert.equal(c.current, 3); // 23:30 UTC am 1.11. = 2.11. 0:30 Uhr in Berlin
  assert.equal(c.summary, '3 von 5 Kunden');
  assert.equal(c.hint, 'Noch 2 Kunden in 4 Tagen');
  const o = goalProgress(goal({ kind: 'orders', period: 'month', target: 4 }), data, NOW);
  assert.equal(o.current, 1);
  const p = goalProgress(goal({ kind: 'posts', period: 'week', target: 1 }), data, NOW);
  assert.equal(p.status, 'done');
  assert.equal(p.ratio, 1);
  assert.equal(p.hint, 'Geschafft!');
});

test('Fortschritt: hinterher, wenn deutlich unter dem Plan', () => {
  const late = new Date(2026, 10, 28, 12); // fast Monatsende
  const p = goalProgress(goal({ kind: 'orders', period: 'month', target: 10 }), data, late);
  assert.equal(p.status, 'behind');
  assert.equal(p.hint, 'Noch 9 Aufträge in 2 Tagen');
});

test('Eigenes Ziel: Fortschritt von Hand, Termin', () => {
  const g = goal({
    kind: 'custom',
    period: 'once',
    target: 10,
    title: 'Bewertungen',
    progress: 4,
    due_on: '2026-12-31',
  });
  const p = goalProgress(g, data, NOW);
  assert.equal(p.current, 4);
  assert.equal(p.ratio, 0.4);
  assert.equal(p.summary, '4 von 10');
  assert.equal(p.hint, 'Noch 6 in 57 Tagen');
  assert.equal(goalProgress({ ...g, due_on: '2026-11-01' }, data, NOW).status, 'behind');
  assert.equal(goalProgress({ ...g, due_on: null }, data, NOW).hint, 'Noch 6');
});

test('Für Nexy: offene To-dos mit Kurzzeichen, Ziele mit Stand', () => {
  const { entries, refs, open } = nexyTodos(
    [
      todo({ id: 't1', title: 'Steuer', due_on: '2026-11-06', important: true, customer_id: 'c1' }),
      todo({ id: 't2', title: 'Flyer' }),
      todo({ id: 't3', done: true }),
    ],
    { customer: (id) => (id === 'c1' ? 'Peter Müller' : null), order: () => null },
  );
  assert.deepEqual(entries, [
    { ref: 'A1', was: 'Steuer', faellig: '2026-11-06', wichtig: true, kunde: 'Peter Müller' },
    { ref: 'A2', was: 'Flyer' },
  ]);
  assert.deepEqual(refs, { A1: 't1', A2: 't2' });
  assert.equal(open, 2);
  const goals = nexyGoals(
    [goal({ kind: 'customers', period: 'week', target: 5 }), goal({ archived: true })],
    data,
    NOW,
  );
  assert.deepEqual(goals, [
    { ziel: '5 neue Kunden pro Woche', stand: '3 von 5 Kunden', zeitraum: 'diese Woche', status: 'Im Plan' },
  ]);
});
