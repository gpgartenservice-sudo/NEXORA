// Unit-Tests: Urlaubskonto, Krankmeldungen und Chat (Antworten, Gelesen, schreibt gerade). Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  ABSENCE_COLUMNS,
  awaySoon,
  calendarDays,
  chatTopic,
  directKey,
  onlineTopic,
  personColor,
  PERSON_COLORS,
  quoteText,
  readersOf,
  readLine,
  readState,
  sickToday,
  typingLine,
  unseenSickNotes,
  vacationAccount,
} from '../../src/features/team/staff-logic.ts';

const A = (o) => ({
  id: o.id ?? Math.random().toString(16).slice(2),
  member_id: 'w',
  kind: 'urlaub',
  status: 'genehmigt',
  note: null,
  decided_by: null,
  decided_at: null,
  decision_note: null,
  created_at: '2026-11-01T08:00:00Z',
  ...o,
});

test('Urlaubskonto: genommen, geplant, beantragt, übrig, krank', () => {
  const list = [
    A({ starts_on: '2026-03-02', ends_on: '2026-03-06' }), // 5 Tage, vorbei
    A({ starts_on: '2026-11-23', ends_on: '2026-11-27' }), // läuft gerade (heute Mi 25.11.)
    A({ starts_on: '2026-12-21', ends_on: '2026-12-31' }), // geplant (24.–26.12.: 25./26. Feiertag)
    A({ starts_on: '2026-12-14', ends_on: '2026-12-15', status: 'offen' }),
    A({ starts_on: '2026-10-05', ends_on: '2026-10-06', status: 'abgelehnt' }),
    A({ kind: 'krank', status: 'gemeldet', starts_on: '2026-02-02', ends_on: '2026-02-04' }),
    A({ kind: 'frei', starts_on: '2026-12-04', ends_on: '2026-12-04' }),
    A({ member_id: 'x', starts_on: '2026-03-02', ends_on: '2026-03-06' }),
  ];
  const acc = vacationAccount(list, 'w', 30, 2026, '2026-11-25');
  assert.equal(acc.taken, 5 + 3); // März + Mo–Mi
  assert.equal(acc.planned, 2 + 8); // Do/Fr + 21.–31.12. ohne 25.12. (Feiertag) und Wochenende
  assert.equal(acc.pending, 2);
  assert.equal(acc.sick, 3);
  assert.equal(acc.left, 30 - 8 - 10);
  assert.equal(acc.next.starts_on, '2026-11-23'); // läuft gerade = nächster
  // Urlaub über Silvester zählt nur im jeweiligen Jahr
  const nye = vacationAccount([A({ starts_on: '2026-12-28', ends_on: '2027-01-08' })], 'w', 30, 2027, '2026-12-01');
  assert.equal(nye.planned, 5); // 4.–8.1. (1.1. Feiertag, 2./3. Wochenende, 6.1. in NRW kein Feiertag)
});

test('Krankmeldungen: heute krank, ungesehen, wer fehlt, Kalendertage', () => {
  const s1 = A({ id: 's1', kind: 'krank', status: 'gemeldet', starts_on: '2026-11-24', ends_on: '2026-11-26', created_at: '2026-11-24T06:00:00Z' });
  const s2 = A({ id: 's2', member_id: 'b', kind: 'krank', status: 'gemeldet', starts_on: '2026-11-25', ends_on: '2026-11-25', created_at: '2026-11-25T06:00:00Z', seen_at: '2026-11-25T07:00:00Z' });
  const s3 = A({ id: 's3', member_id: 'me', kind: 'krank', status: 'gemeldet', starts_on: '2026-11-25', ends_on: '2026-11-25' });
  const old = A({ id: 'old', kind: 'krank', status: 'gemeldet', starts_on: '2026-10-01', ends_on: '2026-10-02' });
  const vac = A({ id: 'v', member_id: 'b', starts_on: '2026-12-01', ends_on: '2026-12-03' });
  const far = A({ id: 'far', member_id: 'b', starts_on: '2027-02-01', ends_on: '2027-02-03' });
  const list = [s1, s2, s3, old, vac, far];
  assert.equal(sickToday(list, 'w', '2026-11-25')?.id, 's1');
  assert.equal(sickToday(list, 'w', '2026-11-27'), null);
  assert.deepEqual(unseenSickNotes(list, 'me', '2026-11-25').map((a) => a.id), ['s1']);
  assert.deepEqual(awaySoon(list, '2026-11-25').map((a) => a.id), ['s1', 's2', 's3', 'v']);
  assert.equal(calendarDays('2026-11-24', '2026-11-27'), 4);
  assert.equal(calendarDays('2026-11-27', '2026-11-24'), 0);
  assert.ok(ABSENCE_COLUMNS.includes('seen_at') && ABSENCE_COLUMNS.includes('doctor'));
});

test('Chat: Live-Kanäle, Gelesen, schreibt gerade', () => {
  const me = '11111111-1111-1111-1111-111111111111';
  const you = '00000000-0000-0000-0000-000000000000';
  // beide Seiten eines Direkt-Chats landen im selben Kanal
  assert.equal(chatTopic('c', directKey(you), me), chatTopic('c', directKey(me), you));
  assert.equal(chatTopic('c', directKey(you), me), `team:c:direkt-${you}-${me}`);
  assert.equal(chatTopic('c', 'alle', me), 'team:c:alle');
  assert.equal(onlineTopic('c'), 'team:c');

  const m = { created_at: '2026-11-25T10:00:00Z' };
  const readers = [
    { user_id: 'a', read_at: '2026-11-25T10:05:00Z' },
    { user_id: 'b', read_at: '2026-11-25T09:00:00Z' },
  ];
  assert.deepEqual(readersOf(m, readers), ['a']);
  assert.equal(readState(m, readers, ['a', 'b']), 'some');
  assert.equal(readState(m, readers, ['a']), 'all');
  assert.equal(readState(m, [], ['a']), 'sent');
  assert.equal(readState(m, readers, []), 'sent');
  assert.equal(readLine(['Anna'], true), 'Gelesen von Anna');
  assert.equal(readLine(['Anna', 'Tom'], false), 'Gelesen von Anna und Tom');
  assert.equal(readLine(['Anna', 'Tom', 'Ben'], true), 'Gelesen von allen');
  assert.equal(readLine(['A', 'B', 'C', 'D', 'E'], false), 'Gelesen von A, B und 3 weiteren');
  assert.equal(readLine([], false), '');
  assert.equal(typingLine(['Anna']), 'Anna schreibt …');
  assert.equal(typingLine(['Anna', 'Tom']), 'Anna und Tom schreiben …');
  assert.equal(typingLine(['a', 'b', 'c']), '3 Leute schreiben …');
  assert.equal(personColor('abc'), personColor('abc'));
  assert.ok(PERSON_COLORS.includes(personColor('xyz')));
  // jede ID bekommt eine Farbe aus der Liste, und ähnliche IDs nicht alle dieselbe
  const ids = Array.from({ length: 400 }, (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-${String(i * 7).padStart(12, '0')}`);
  assert.ok(ids.every((id) => PERSON_COLORS.includes(personColor(id))));
  const similar = ['1', '2', '3', '4', '5', '6'].map((d) => `${d.repeat(8)}-${d.repeat(4)}-4${d.repeat(3)}-8${d.repeat(3)}-${d.repeat(12)}`);
  assert.ok(new Set(similar.map(personColor)).size >= 3);
  assert.equal(quoteText('Hallo\n\n  du'), 'Hallo du');
  assert.equal(quoteText('x'.repeat(100), 10), `${'x'.repeat(9)}…`);
});

test('Skript: neue Spalten und Funktionen sind angelegt', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261130090000_krank_chat.sql', import.meta.url), 'utf8');
  for (const col of ABSENCE_COLUMNS.split(', ').filter((c) => ['doctor', 'seen_by', 'seen_at'].includes(c)))
    assert.match(sql, new RegExp(`add column (if not exists )?${col}\\b`), col);
  for (const fn of ['absence_seen', 'absence_sick_update', 'team_chat_readers', 'nexora_team_topic_ok'])
    assert.match(sql, new RegExp(`function public\\.${fn}\\(`), fn);
  assert.match(sql, /add column if not exists reply_to/);
});
