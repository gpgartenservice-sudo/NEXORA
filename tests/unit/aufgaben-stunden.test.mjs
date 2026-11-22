// Unit-Tests: To-dos von der Leitung (für wen, von wem) und Stunden. Start: npm run test:unit
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { filterTodos, isMyTodo, nexyTodos, todoTeamNotes } from '../../src/features/goals/goals-logic.ts';
import {
  breakLabel,
  HOURS_COLUMNS,
  hoursByMember,
  hoursCsv,
  hoursDayOk,
  hoursEditable,
  hoursLabel,
  hoursSuggestion,
  monthBounds,
  monthName,
  parseBreak,
  shiftMonth,
  workMinutes,
} from '../../src/features/team/staff-logic.ts';

const ME = 'me';
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
  created_at: '2026-11-01T08:00:00Z',
  updated_at: '2026-11-01T08:00:00Z',
  ...o,
});
const names = { anna: 'Anna Berg', pascal: 'Pascal Pape' };
const nameOf = (id) => names[id] ?? 'Ehemaliges Mitglied';

test('To-dos: meine, alle, pro Person', () => {
  const list = [
    todo({ id: '1' }),
    todo({ id: '2', assignee_id: ME }),
    todo({ id: '3', assignee_id: 'anna' }),
    todo({ id: '4', assignee_id: 'pascal' }),
  ];
  assert.equal(isMyTodo(list[0], ME), true, 'ohne Person = von früher, gehört mir');
  assert.deepEqual(filterTodos(list, 'meine', ME).map((t) => t.id), ['1', '2']);
  assert.deepEqual(filterTodos(list, 'alle', ME).map((t) => t.id), ['1', '2', '3', '4']);
  assert.deepEqual(filterTodos(list, 'anna', ME).map((t) => t.id), ['3']);
});

test('To-dos: „für Anna“, „von Pascal“, „erledigt von …“', () => {
  // Leitung sieht ihr To-do für Anna
  assert.deepEqual(todoTeamNotes(todo({ assignee_id: 'anna', created_by: ME }), ME, (id) => (id === ME ? null : nameOf(id))), [
    'für Anna Berg',
  ]);
  // Mitarbeiter sieht, von wem es kommt
  assert.deepEqual(todoTeamNotes(todo({ assignee_id: ME, created_by: 'pascal' }), ME, nameOf), ['von Pascal Pape']);
  // Anna hat ihr eigenes abgehakt: kein doppelter Name
  assert.deepEqual(todoTeamNotes(todo({ assignee_id: 'anna', created_by: ME, done: true, done_by: 'anna' }), ME, nameOf), [
    'für Anna Berg',
  ]);
  // Pascal hat Annas To-do abgehakt
  assert.deepEqual(
    todoTeamNotes(todo({ assignee_id: 'anna', created_by: ME, done: true, done_by: 'pascal' }), ME, nameOf),
    ['für Anna Berg', 'erledigt von Pascal Pape'],
  );
  // eigenes To-do: nichts dazu
  assert.deepEqual(todoTeamNotes(todo({ assignee_id: ME, created_by: ME, done: true, done_by: ME }), ME, nameOf), []);
});

test('Luna sieht, für wen ein To-do ist', () => {
  const { entries } = nexyTodos([todo({ id: 'a', assignee_id: 'anna' }), todo({ id: 'b', assignee_id: ME })], {
    customer: () => null,
    order: () => null,
    person: (id) => (id === ME ? null : nameOf(id)),
  });
  assert.deepEqual(entries.filter((e) => e.fuer).map((e) => e.fuer), ['Anna Berg']);
});

test('Stunden: Arbeitszeit ohne Pause, auch über Mitternacht', () => {
  assert.equal(workMinutes('08:00', '16:30', 30), 480);
  assert.equal(workMinutes('22:00', '06:00', 30), 450);
  assert.equal(workMinutes('08:00', '08:00', 0), 0, 'gleiche Uhrzeit geht nicht');
  assert.ok(workMinutes('08:00', '08:30', 45) <= 0, 'Pause länger als Arbeit');
  assert.equal(hoursLabel(465), '7,75 Std.', 'nicht auf 7,8 runden');
  assert.equal(hoursLabel(470), '7,83 Std.');
});

test('Stunden: Pause eingeben wie man mag', () => {
  assert.equal(parseBreak(''), 0);
  assert.equal(parseBreak('30'), 30);
  assert.equal(parseBreak('45 min'), 45);
  assert.equal(parseBreak('0:45'), 45);
  assert.equal(parseBreak('1,5 h'), 90);
  assert.equal(parseBreak('1 Std'), 60);
  assert.equal(parseBreak('abc'), null);
  assert.equal(parseBreak('700'), null);
  assert.equal(breakLabel(0), 'ohne Pause');
  assert.equal(breakLabel(30), '30 Min. Pause');
  assert.equal(breakLabel(60), '1 Std. Pause');
});

test('Stunden: nur die letzten 62 Tage bis morgen (ohne Personal)', () => {
  const today = '2026-11-22';
  assert.equal(hoursDayOk('2026-11-22', today), true);
  assert.equal(hoursDayOk('2026-11-23', today), true, 'morgen geht (Nachtschicht)');
  assert.equal(hoursDayOk('2026-11-24', today), false);
  assert.equal(hoursDayOk('2026-09-21', today), true, 'genau 62 Tage');
  assert.equal(hoursDayOk('2026-09-20', today), false);
  assert.equal(hoursEditable('2026-09-20', today), false);
});

test('Stunden: Monat, Summen je Person, Vorschlag', () => {
  assert.deepEqual(monthBounds('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(monthBounds('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthName('2026-11'), 'November 2026');

  const rows = [
    { member_id: 'anna', day: '2026-11-20', minutes: 480, starts_at: '07:00:00', ends_at: '15:30:00', break_minutes: 30 },
    { member_id: 'anna', day: '2026-11-20', minutes: 120, starts_at: '18:00:00', ends_at: '20:00:00', break_minutes: 0 },
    { member_id: 'anna', day: '2026-11-21', minutes: 450, starts_at: '06:00:00', ends_at: '14:00:00', break_minutes: 30 },
    { member_id: 'pascal', day: '2026-11-21', minutes: 300, starts_at: '09:00:00', ends_at: '14:00:00', break_minutes: 0 },
  ];
  assert.deepEqual(hoursByMember(rows), [
    { member_id: 'anna', minutes: 1050, days: 2, entries: 3 },
    { member_id: 'pascal', minutes: 300, days: 1, entries: 1 },
  ]);
  assert.deepEqual(hoursSuggestion(rows, 'anna'), { starts_at: '06:00', ends_at: '14:00', break_minutes: 30 });
  assert.deepEqual(hoursSuggestion(rows, 'neu'), { starts_at: '08:00', ends_at: '16:30', break_minutes: 30 });
});

test('Stunden: CSV für Excel (Semikolon, Komma, BOM)', () => {
  const csv = hoursCsv(
    [
      { id: '2', member_id: 'pascal', day: '2026-11-21', starts_at: '09:00:00', ends_at: '14:00:00', break_minutes: 0, minutes: 300, note: null },
      { id: '1', member_id: 'anna', day: '2026-11-20', starts_at: '07:00:00', ends_at: '15:30:00', break_minutes: 30, minutes: 480, note: 'Baustelle; Müller' },
    ],
    nameOf,
  );
  assert.ok(csv.startsWith('﻿Name;Datum;Beginn;Ende;Pause (Min.);Stunden;Notiz\r\n'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[1], 'Anna Berg;20.11.2026;07:00;15:30;30;8,00;"Baustelle; Müller"');
  assert.equal(lines[2], 'Pascal Pape;21.11.2026;09:00;14:00;0;5,00;');
});

test('Datenbank: Stunden-Spalten und Regeln passen zur App', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261201090000_aufgaben_stunden.sql', import.meta.url), 'utf8');
  for (const col of HOURS_COLUMNS.split(', ')) assert.match(sql, new RegExp(`\\b${col}\\b`), col);
  assert.match(sql, /current_date - 62/);
  assert.match(sql, /current_date \+ 1/);
  for (const code of ['todo_employee_only', 'todo_not_yours', 'assignee_not_member', 'hours_invalid', 'hours_day_invalid', 'hours_locked'])
    assert.match(sql, new RegExp(code));
});
