// Unit-Tests: Teamleiter pro Einsatz (statt Rolle „Teamleitung“), Auftrag am Einsatz, keine Preise ohne Finanzen.
// Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { allowedSort, customerSorts, sortMetric } from '../../src/features/crm/customer-sort.ts';
import { DEFAULT_ACCESS, parseRole, ROLE_LABEL, roleErrorText } from '../../src/features/team/roles.ts';
import { copyWeek, groupJobs, jobRows, parsePlanSnapshot, planSnapshot, samePlan } from '../../src/features/team/staff-logic.ts';

const MON = '2026-11-23';
const shift = (id, member, o = {}) => ({
  id,
  member_id: member,
  day: MON,
  starts_at: '07:00:00',
  ends_at: '15:30:00',
  note: null,
  site: 'Müller',
  address: 'Hauptstr. 1',
  assignment_id: 'x',
  is_lead: false,
  ...o,
});
const names = { anna: 'Anna Berg', ben: 'Ben Kurz' };

test('Rollen: keine Teamleitung mehr, alte Werte werden Mitarbeiter', () => {
  assert.deepEqual(Object.keys(ROLE_LABEL).sort(), ['inhaber', 'mitarbeiter', 'mitgruender']);
  assert.deepEqual(Object.keys(DEFAULT_ACCESS), ['mitarbeiter']);
  assert.equal(parseRole('teamleitung'), 'mitarbeiter');
  assert.equal(parseRole('mitgruender'), 'mitgruender');
  assert.equal(parseRole('chef'), null);
});

test('Rollen: verständliche Fehler zu Teamleiter und Aufträgen', () => {
  assert.match(roleErrorText('new row violates check constraint "team_members_role_check"') ?? '', /Arbeitsplan/);
  assert.match(roleErrorText('order_not_lead') ?? '', /Teamleiter/);
  assert.ok(roleErrorText('order_cancelled'));
});

test('Einsatz mit Auftrag: Gruppe, Zeilen, Kopie der Vorwoche', () => {
  const shifts = [shift('1', 'ben', { order_id: 'o1' }), shift('2', 'anna', { order_id: 'o1', is_lead: true })];
  const [job] = groupJobs(shifts);
  assert.equal(job.order_id, 'o1');
  assert.equal(job.lead, 'anna');

  const rows = jobRows({ ...job, assignment_id: 'y', days: [MON], order_id: 'o1' });
  assert.deepEqual(rows.map((r) => [r.member_id, r.is_lead, r.order_id]), [
    ['anna', true, 'o1'],
    ['ben', false, 'o1'],
  ]);
  // ohne Auftrag kommt kein order_id-Feld dazu
  assert.ok(!('order_id' in jobRows({ ...job, assignment_id: 'y', days: [MON], order_id: null })[0]));

  const prev = shifts.map((s) => ({ ...s, day: '2026-11-16' }));
  const copy = copyWeek(prev, [], MON, () => 'neu');
  assert.deepEqual(copy.map((c) => c.order_id), ['o1', 'o1']);
});

test('Plan-Snapshot: Auftrag mit Titel, alte Pläne bleiben gleich', () => {
  const withOrder = [shift('1', 'anna', { order_id: 'o1', is_lead: true }), shift('2', 'ben', { order_id: 'o1' })];
  const plan = planSnapshot(MON, withOrder, [], names, (id) => (id === 'o1' ? 'Hecke schneiden' : null));
  const job = plan.days[0].jobs[0];
  assert.equal(job.order_id, 'o1');
  assert.equal(job.order_title, 'Hecke schneiden');
  assert.deepEqual(parsePlanSnapshot(JSON.parse(JSON.stringify(plan))), plan);
  // gelöschter / unbekannter Auftrag
  assert.equal(planSnapshot(MON, withOrder, [], names).days[0].jobs[0].order_title, 'Auftrag');

  // ohne Auftrag: keine neuen Felder → ein schon veröffentlichter Plan gilt weiter als aktuell
  const plain = [shift('1', 'anna', { is_lead: true }), shift('2', 'ben')];
  const old = planSnapshot(MON, plain, [], names);
  assert.ok(!('order_id' in old.days[0].jobs[0]));
  assert.ok(samePlan(parsePlanSnapshot(JSON.parse(JSON.stringify(old))), planSnapshot(MON, plain, [], names, () => 'X')));
  assert.ok(!samePlan(old, plan));
});

test('Kunden ohne Finanzen: keine Umsatz-Sortierung, keine Beträge', () => {
  assert.deepEqual(customerSorts(false).map((s) => s.key), ['recent', 'name', 'name-desc', 'orders', 'newest']);
  assert.equal(customerSorts(true).length, 7);
  assert.equal(allowedSort('revenue', false), 'recent');
  assert.equal(allowedSort('outstanding', false), 'recent');
  assert.equal(allowedSort('name', false), 'name');
  assert.equal(allowedSort('revenue', true), 'revenue');
  const stats = { count: 3, revenue: 1200, outstanding: 400 };
  assert.deepEqual(sortMetric('revenue', stats, false), { value: '3 Aufträge', label: '' });
  assert.doesNotMatch(JSON.stringify(sortMetric('outstanding', stats, false)), /€/);
  assert.match(sortMetric('revenue', stats).value, /€/);
});

test('Datenbank-Skript: Teamleiter darf nur abhaken', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20261202090000_teamleiter_einsatz.sql', import.meta.url), 'utf8');
  assert.match(sql, /set role = 'mitarbeiter' where role = 'teamleitung'/);
  assert.match(sql, /team_members_role_check check \(role in \('mitgruender', 'mitarbeiter'\)\)/);
  assert.match(sql, /add column if not exists order_id uuid references public\.orders \(id\) on delete set null/);
  assert.match(sql, /fixed constant text\[\] := array\['completed', 'completed_on', 'updated_at'\]/);
  assert.match(sql, /function public\.order_lead_done\(p_order uuid, p_done boolean default true\)/);
  assert.match(sql, /revoke all on function public\.order_lead_done\(uuid, boolean\) from public, anon;/);
  assert.match(sql, /order_not_lead/);
  assert.match(sql, /^begin;/m);
  assert.match(sql, /^commit;/m);
});

test('App: Mitarbeiter sehen keine Auftragspreise', () => {
  const read = (p) => readFileSync(new URL(`../../src/features/${p}`, import.meta.url), 'utf8');
  assert.match(read('crm/order-detail-screen.tsx'), /if \(!canWrite\) return <OrderView/);
  assert.match(read('crm/order-view.tsx'), /\{money && \(/);
  assert.match(read('crm/order-row.tsx'), /money/);
  assert.match(read('team/staff-logic.ts'), /SHIFT_COLUMNS = [^;]*order_id/);
});
