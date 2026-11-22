// Unit-Tests: Rollen & Rechte, Arbeitsplan, Urlaub, Team-Chats. Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  accessSummary,
  AREAS,
  can,
  DEFAULT_ACCESS,
  FULL_ACCESS,
  isEmployer,
  navArea,
  parseAccess,
  roleErrorText,
} from '../../src/features/team/roles.ts';
import {
  absentOn,
  chatOf,
  chatTime,
  copyWeek,
  dayLabel,
  directKey,
  easter,
  holidayName,
  hoursLabel,
  inChat,
  isChatKey,
  isoWeek,
  layoutMessages,
  linkParts,
  mergeMessages,
  parseTime,
  rangeLabel,
  shiftLabel,
  shiftMinutes,
  vacationDays,
  weekDays,
  weekStart,
  workingDays,
} from '../../src/features/team/staff-logic.ts';

const SQL = readFileSync(new URL('../../supabase/migrations/20261128090000_teams.sql', import.meta.url), 'utf8');

test('Vorlagen der Rollen = Vorlagen in der Datenbank (nexora_role_default)', () => {
  const body = SQL.slice(SQL.indexOf('function public.nexora_role_default'), SQL.indexOf('$$;', SQL.indexOf('function public.nexora_role_default')));
  const json = (role) => {
    const at = role ? body.indexOf(`when '${role}' then`) : body.indexOf('else');
    const start = body.indexOf("'{", at);
    return JSON.parse(body.slice(start + 1, body.indexOf("}'", start) + 1).replace(/\s+/g, ''));
  };
  assert.deepEqual(json('teamleitung'), DEFAULT_ACCESS.teamleitung);
  assert.deepEqual(json('mitarbeiter'), DEFAULT_ACCESS.mitarbeiter);
  assert.deepEqual(json(null), FULL_ACCESS);
  // dieselben Bereiche wie team_set_access
  const allowed = /k not in \(([^)]+)\)/.exec(SQL)[1].replace(/\s+/g, '').split(',').map((s) => s.replace(/'/g, ''));
  assert.deepEqual(allowed.sort(), AREAS.map((a) => a.key).sort());
});

test('Rechte lesen und prüfen', () => {
  const a = parseAccess({ kunden: 'write', finanzen: 'quatsch', luna: 'read' }, DEFAULT_ACCESS.mitarbeiter);
  assert.equal(a.kunden, 'write');
  assert.equal(a.finanzen, 'off');
  assert.equal(a.luna, 'write'); // Ein/Aus-Bereich kennt kein „ansehen“
  assert.equal(parseAccess(null, DEFAULT_ACCESS.teamleitung).personal, 'write');
  assert.equal(can(null, 'finanzen', 'write'), true);
  assert.equal(can(DEFAULT_ACCESS.mitarbeiter, 'kunden'), true);
  assert.equal(can(DEFAULT_ACCESS.mitarbeiter, 'kunden', 'write'), false);
  assert.equal(can(DEFAULT_ACCESS.mitarbeiter, 'finanzen'), false);
  assert.equal(isEmployer('mitgruender'), true);
  assert.equal(isEmployer('teamleitung'), false);
  assert.equal(navArea('inventar'), 'lager');
  assert.equal(navArea('assistent'), 'luna');
  assert.equal(navArea('home'), null);
  assert.match(accessSummary(DEFAULT_ACCESS.mitarbeiter), /^Bearbeitet: To-dos & Ziele, Lagerbestand · Sieht: Kunden, Aufträge, Termine, Firma$/);
});

test('Fehler „role_forbidden“ der Datenbank wird verständlich', () => {
  assert.match(roleErrorText('role_forbidden:kunden'), /„Kunden“ zu bearbeiten/);
  assert.match(roleErrorText('ERROR: role_forbidden:dokumente'), /„Angebote & Rechnungen“/);
  assert.match(roleErrorText('role_forbidden'), /das zu ändern/);
  assert.equal(roleErrorText('duplicate key'), null);
});

test('Wochen und Tage', () => {
  assert.equal(weekStart('2026-11-22'), '2026-11-16'); // Sonntag -> Montag davor
  assert.equal(weekStart('2026-11-23'), '2026-11-23');
  assert.deepEqual(weekDays('2026-11-23').slice(-1), ['2026-11-29']);
  assert.equal(isoWeek('2026-11-23'), 48);
  assert.equal(isoWeek('2027-01-01'), 53);
  assert.equal(isoWeek('2026-01-01'), 1);
  assert.equal(dayLabel('2026-11-23'), 'Mo 23.11.');
  assert.equal(rangeLabel('2026-12-21', '2026-12-23'), '21.12. – 23.12.2026');
  assert.equal(rangeLabel('2026-12-30', '2027-01-02'), '30.12.2026 – 02.01.2027');
  assert.equal(rangeLabel('2026-12-03', '2026-12-03'), '03.12.2026');
});

test('Uhrzeiten und Schichten', () => {
  assert.equal(parseTime('8'), '08:00');
  assert.equal(parseTime('8:5'), '08:05');
  assert.equal(parseTime('1630'), '16:30');
  assert.equal(parseTime('16.30'), '16:30');
  assert.equal(parseTime('08:00:00'), '08:00');
  assert.equal(parseTime('25:00'), null);
  assert.equal(parseTime('abc'), null);
  assert.equal(shiftMinutes({ starts_at: '08:00:00', ends_at: '16:30:00' }), 510);
  assert.equal(shiftMinutes({ starts_at: '22:00', ends_at: '06:00' }), 480);
  assert.equal(shiftLabel({ starts_at: '22:00:00', ends_at: '06:00:00' }), '22:00 – 06:00 (+1)');
  assert.equal(hoursLabel(510), '8,5 Std.');
  assert.equal(hoursLabel(480), '8 Std.');
});

test('Vorwoche übernehmen: nur die Woche davor, nichts doppelt', () => {
  const s = (id, day, member = 'a') => ({ id, member_id: member, day, starts_at: '08:00:00', ends_at: '16:00:00', note: null });
  const prev = [s('1', '2026-11-16'), s('2', '2026-11-20', 'b'), s('3', '2026-11-09')];
  const existing = [s('4', '2026-11-23')];
  const copy = copyWeek(prev, existing, '2026-11-23');
  assert.deepEqual(copy.map((c) => [c.member_id, c.day]), [['b', '2026-11-27']]);
});

test('Feiertage NRW und Urlaubstage', () => {
  assert.equal(easter(2026), '2026-04-05');
  assert.equal(easter(2027), '2027-03-28');
  assert.equal(holidayName('2026-06-04'), 'Fronleichnam');
  assert.equal(holidayName('2026-11-01'), 'Allerheiligen');
  assert.equal(holidayName('2026-11-02'), null);
  // 21.–31.12.2026: Mo–Do 21.–24., Mo–Do 28.–31.; 25./26. sind Feiertage (Fr/Sa)
  assert.equal(workingDays('2026-12-21', '2026-12-31'), 8);
  assert.equal(workingDays('2026-12-28', '2027-01-08', 2027), 5); // 1.1. Feiertag
  assert.equal(workingDays('2026-12-05', '2026-12-06'), 0);
  const a = (o) => ({ id: 'x', member_id: 'm', kind: 'urlaub', note: null, decided_by: null, decided_at: null, decision_note: null, created_at: '', ...o });
  const list = [
    a({ starts_on: '2026-12-21', ends_on: '2026-12-23', status: 'genehmigt' }),
    a({ starts_on: '2026-08-03', ends_on: '2026-08-07', status: 'offen' }),
    a({ starts_on: '2026-08-10', ends_on: '2026-08-10', status: 'abgelehnt' }),
    a({ starts_on: '2026-09-01', ends_on: '2026-09-02', status: 'gemeldet', kind: 'krank' }),
    a({ starts_on: '2026-07-01', ends_on: '2026-07-01', status: 'genehmigt', member_id: 'other' }),
  ];
  assert.deepEqual(vacationDays(list, 'm', 2026), { approved: 3, pending: 5 });
  assert.equal(absentOn(list, 'm', '2026-12-22').starts_on, '2026-12-21');
  assert.equal(absentOn(list, 'm', '2026-12-24'), null);
});

test('Team-Chats: Schlüssel, Zuordnung, Zusammenführen', () => {
  const me = '11111111-1111-1111-1111-111111111111';
  const other = '22222222-2222-2222-2222-222222222222';
  const msg = (o) => ({ id: 'a', company_id: 'c', channel: 'alle', recipient_id: null, sender_id: me, body: 'Hi', created_at: '2026-11-22T10:00:00Z', ...o });
  assert.equal(isChatKey('alle'), true);
  assert.equal(isChatKey(directKey(other)), true);
  assert.equal(isChatKey('direkt:quatsch'), false);
  const dm = msg({ id: 'b', channel: 'direkt', recipient_id: me, sender_id: other });
  assert.equal(chatOf(dm, me), directKey(other));
  assert.equal(inChat(dm, directKey(other), me), true);
  assert.equal(inChat(dm, 'alle', me), false);
  assert.equal(inChat(msg({ channel: 'leitung' }), 'leitung', me), true);
  const merged = mergeMessages([msg({ id: '2', created_at: '2026-11-22T10:05:00Z' })], [msg({ id: '1' }), msg({ id: '2', body: 'neu', created_at: '2026-11-22T10:05:00Z' })]);
  assert.deepEqual(merged.map((m) => [m.id, m.body]), [['1', 'Hi'], ['2', 'neu']]);
  const now = new Date(2026, 10, 22, 15, 0);
  assert.equal(chatTime(new Date(2026, 10, 22, 9, 7).toISOString(), now), '09:07');
  assert.equal(chatTime(new Date(2026, 10, 21, 9, 7).toISOString(), now), 'gestern');
  assert.equal(chatTime(new Date(2026, 10, 2, 9, 7).toISOString(), now), '02.11.');
});

test('Chat: Nachrichten-Blöcke (gleiche Person, kurz hintereinander, gleicher Tag)', () => {
  const m = (sender_id, created_at) => ({ sender_id, created_at });
  const list = [
    m('a', '2026-11-22T09:00:00'),
    m('a', '2026-11-22T09:03:00'),
    m('a', '2026-11-22T09:20:00'), // > 5 Minuten: neuer Block
    m('b', '2026-11-22T09:21:00'),
    m('b', '2026-11-23T09:21:30'), // neuer Tag
  ];
  assert.deepEqual(layoutMessages(list), [
    { newDay: true, first: true, last: false },
    { newDay: false, first: false, last: true },
    { newDay: false, first: true, last: true },
    { newDay: false, first: true, last: true },
    { newDay: true, first: true, last: true },
  ]);
  assert.deepEqual(layoutMessages([]), []);
});

test('Chat: Links, Mail-Adressen und Nummern werden antippbar', () => {
  assert.deepEqual(linkParts('Hallo'), [{ text: 'Hallo' }]);
  assert.deepEqual(linkParts('Plan: https://lunaxora.de/a?b=1. Danke'), [
    { text: 'Plan: ' },
    { text: 'https://lunaxora.de/a?b=1', url: 'https://lunaxora.de/a?b=1' },
    { text: '. Danke' },
  ]);
  assert.deepEqual(linkParts('siehe www.lunaxora.de!'), [
    { text: 'siehe ' },
    { text: 'www.lunaxora.de', url: 'https://www.lunaxora.de' },
    { text: '!' },
  ]);
  assert.deepEqual(linkParts('Mail an kontakt@lunaxora.de oder 0170 123 4567'), [
    { text: 'Mail an ' },
    { text: 'kontakt@lunaxora.de', url: 'mailto:kontakt@lunaxora.de' },
    { text: ' oder ' },
    { text: '0170 123 4567', url: 'tel:01701234567' },
  ]);
  // Uhrzeiten, Daten und Beträge bleiben Text
  assert.deepEqual(linkParts('Morgen 08:00 – 16:30, am 24.11.2026, 150 €'), [{ text: 'Morgen 08:00 – 16:30, am 24.11.2026, 150 €' }]);
});
