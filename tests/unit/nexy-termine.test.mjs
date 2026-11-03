// Unit-Tests: Nexy legt Termine an, trägt sie in Aufträge ein und ändert sie. Start: npm run test:unit
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildProposals, EXECUTION_ORDER, proposalLabel, proposalProblem } from '../../src/features/assistant/assistant-logic.ts';

const TODAY = '2026-11-03';
const customers = [
  { id: 'c1', name: 'Peter Müller', company: null },
  { id: 'c2', name: 'Anna Schmidt', company: 'Schmidt Bau GmbH' },
];
const orders = [
  { id: 'o1', title: 'Hecke schneiden', customer_id: 'c1', meeting_at: '2026-11-05T08:00:00.000Z', execution_at: null },
  { id: 'o2', title: 'Website', customer_id: 'c2', meeting_at: null, execution_at: null },
  { id: 'o3', title: 'Website alt', customer_id: 'c2', meeting_at: null, execution_at: null, cancelled: true },
];
// Termine, wie Nexy sie bekam (T1 = Erstgespräch o1, T2 = eigener Termin, T3 = ganztägig, T4 = Ausführung)
const events = [
  { key: 'meeting-o1', kind: 'meeting', title: 'Hecke schneiden', start: '2026-11-05T08:00:00.000Z', end: '2026-11-05T09:00:00.000Z', allDay: false, orderId: 'o1', appointmentId: null, done: false },
  { key: 'appointment-a1', kind: 'appointment', title: 'Steuerberatung', start: '2026-11-06T13:00:00.000Z', end: '2026-11-06T14:30:00.000Z', allDay: false, orderId: null, appointmentId: 'a1', done: false },
  { key: 'appointment-a2', kind: 'appointment', title: 'Messe', start: '2026-11-09T23:00:00.000Z', end: '2026-11-10T23:00:00.000Z', allDay: true, orderId: null, appointmentId: 'a2', done: false },
  { key: 'execution-o2', kind: 'execution', title: 'Website', start: '2026-11-04T09:00:00.000Z', end: '2026-11-04T11:00:00.000Z', allDay: false, orderId: 'o2', appointmentId: null, done: false },
];
const known = {
  customers,
  orders,
  documents: [],
  events,
  refs: { T1: 'meeting-o1', T2: 'appointment-a1', T3: 'appointment-a2', T4: 'execution-o2' },
  appointments: [
    { id: 'a1', ends_at: '2026-11-06T14:30:00.000Z' },
    { id: 'a2', ends_at: null },
  ],
};
const build = (actions) => buildProposals({ actions }, known, TODAY);
const appt = (o) => ({ type: 'appointment', appointment: { title: 'Steuerberatung', starts_at: '2026-11-06T14:00', ends_at: null, all_day: false, location: null, customer_name: null, notes: null, ...o } });
const date = (o) => ({ type: 'order_date', order_date: { customer_name: 'Peter Müller', order_title: 'Hecke schneiden', kind: 'execution', at: '2026-11-10T08:00', ...o } });
const change = (o) => ({ type: 'appointment_change', appointment_change: { ref: 'T2', starts_at: null, ends_at: null, title: null, location: null, notes: null, done: 'unchanged', remove: false, ...o } });

test('Neuer eigener Termin: Zeit, Ende, ganztägig, ohne Auftrag', () => {
  const [p] = build([appt({ ends_at: '2026-11-06T15:30', location: 'Kanzlei Weber' })]);
  assert.equal(p.kind, 'appointment');
  assert.equal(p.data.starts_at, '2026-11-06T13:00:00.000Z');
  assert.equal(p.data.ends_at, '2026-11-06T14:30:00.000Z');
  assert.equal(p.data.all_day, false);
  assert.equal(p.data.location, 'Kanzlei Weber');
  assert.equal(p.customer.existingId, null);
  assert.equal(proposalProblem(p, [p]), null);
  assert.match(proposalLabel(p), /^Termin „Steuerberatung“ \(Fr\.?, 06\.11\.?,? 14:00\)$/);

  const [day] = build([appt({ title: 'Messe', starts_at: '2026-11-10' })]); // ohne Uhrzeit -> ganztägig
  assert.equal(day.data.all_day, true);
  assert.equal(day.data.starts_at, '2026-11-09T23:00:00.000Z');
  assert.equal(day.data.ends_at, null);

  const [bad] = build([appt({ ends_at: '2026-11-06T13:00' })]); // Ende vor Beginn -> ohne Ende
  assert.equal(bad.data.ends_at, null);
  assert.equal(build([appt({ starts_at: '2026-13-01T10:00' })]).length, 0);
  assert.equal(build([appt({ title: ' ' })]).length, 0);
  assert.equal(build([appt(), appt()]).length, 1); // doppelt
});

test('Neuer Termin mit Kunde', () => {
  const [p] = build([appt({ title: 'Besichtigung Garten', customer_name: 'peter müller' })]);
  assert.deepEqual(p.customer, { existingId: 'c1', newRef: null, name: 'Peter Müller' });
  const [q] = build([appt({ customer_name: 'Unbekannt GmbH' })]);
  assert.equal(q.customer.existingId, null);
  assert.equal(proposalProblem(q, [q]), null); // dann eben ohne Kunde
});

test('Termin in bestehenden Auftrag eintragen', () => {
  const [p] = build([date()]);
  assert.equal(p.kind, 'order_date');
  assert.equal(p.order.existingId, 'o1');
  assert.equal(p.customer.existingId, 'c1');
  assert.equal(p.data.field, 'execution');
  assert.equal(p.data.at, '2026-11-10T07:00:00.000Z');
  assert.equal(p.data.before, null);
  assert.equal(proposalProblem(p, [p]), null);
  assert.match(proposalLabel(p), /^Ausführung „Hecke schneiden“ am Di\.?, 10\.11\.?,? 08:00$/);

  // Erstgespräch neu setzen: bisheriger Termin wird mitgeführt
  const [m] = build([date({ kind: 'meeting', at: '2026-11-05T11:00' })]);
  assert.equal(m.data.before, '2026-11-05T08:00:00.000Z');
  // gleiche Zeit wie bisher -> nichts zu tun
  assert.equal(build([date({ kind: 'meeting', at: '2026-11-05T09:00' })]).length, 0);
  // nur Kunde, der genau einen (nicht stornierten) Auftrag hat
  const [w] = build([date({ customer_name: 'Anna Schmidt', order_title: null })]);
  assert.equal(w.order.existingId, 'o2');
  // ohne Datum oder Art -> weg
  assert.equal(build([date({ at: null }), date({ kind: 'call' })]).length, 0);
});

test('Termin für unbekannten Auftrag: Auftrag muss gewählt werden', () => {
  const [p] = build([date({ customer_name: null, order_title: 'Dach decken' })]);
  assert.equal(p.order.existingId, null);
  assert.equal(proposalProblem(p, [p]), 'Wähle den Auftrag für diesen Termin.');
});

test('Termin für Auftrag aus demselben Gespräch landet direkt im neuen Auftrag', () => {
  const p = build([
    { type: 'order', order: { customer_name: 'Peter Müller', title: 'Zaun streichen', description: null, price: 300, billing: 'once', meeting_at: null, execution_at: null } },
    date({ order_title: 'Zaun streichen', kind: 'meeting', at: '2026-11-12T10:00' }),
  ]);
  assert.deepEqual(p.map((x) => x.kind), ['order']);
  assert.equal(p[0].data.meeting_at, '2026-11-12T09:00:00.000Z');
});

test('Termin ändern: verschieben (nur Tag = gleiche Uhrzeit), Dauer bleibt', () => {
  const [p] = build([change({ starts_at: '2026-11-13' })]);
  assert.equal(p.kind, 'appointment_change');
  assert.equal(p.event.key, 'appointment-a1');
  assert.equal(p.data.starts_at, '2026-11-13T13:00:00.000Z'); // 14:00 wie bisher
  assert.equal(p.data.ends_at, '2026-11-13T14:30:00.000Z'); // 1,5 h wie bisher
  assert.match(proposalLabel(p), /^Termin „Steuerberatung“ verschieben auf Fr\.?, 13\.11\.?,? 14:00$/);

  const [q] = build([change({ ref: 't2', starts_at: '2026-11-06T16:00', ends_at: '2026-11-06T17:00', title: 'Steuerberatung Jahresabschluss' })]);
  assert.equal(q.data.starts_at, '2026-11-06T15:00:00.000Z');
  assert.equal(q.data.ends_at, '2026-11-06T16:00:00.000Z');
  assert.equal(q.data.title, 'Steuerberatung Jahresabschluss');
});

test('Termin ändern: Auftragstermine nur Zeit/Status, ganztägig bleibt ganztägig', () => {
  const [m] = build([change({ ref: 'T1', starts_at: '2026-11-06T10:00', title: 'Anderer Titel', location: 'Woanders' })]);
  assert.equal(m.data.starts_at, '2026-11-06T09:00:00.000Z');
  assert.equal(m.data.title, null); // gehört zum Auftrag
  assert.equal(m.data.location, null);
  assert.equal(m.data.ends_at, null);
  assert.match(proposalLabel(m), /^Erstgespräch „Hecke schneiden“ verschieben auf/);

  const [e] = build([change({ ref: 'T4', done: 'done' })]);
  assert.equal(e.data.done, true);
  assert.equal(e.data.starts_at, null);

  const [d] = build([change({ ref: 'T3', starts_at: '2026-11-12' })]);
  assert.equal(d.data.starts_at, '2026-11-11T23:00:00.000Z');
  assert.equal(d.data.all_day, null);
  const [t] = build([change({ ref: 'T3', starts_at: '2026-11-12T09:00' })]); // mit Uhrzeit -> nicht mehr ganztägig
  assert.equal(t.data.all_day, false);
});

test('Termin absagen/löschen', () => {
  const [r] = build([change({ remove: true, starts_at: '2026-11-13T10:00' })]);
  assert.equal(r.data.remove, true);
  assert.equal(r.data.starts_at, null);
  assert.equal(proposalLabel(r), 'Termin „Steuerberatung“ löschen');
  const [o] = build([change({ ref: 'T1', remove: true })]);
  assert.equal(proposalLabel(o), 'Erstgespräch „Hecke schneiden“ absagen');
});

test('Termin ändern: unbekannt, unverändert oder doppelt -> weg', () => {
  assert.equal(build([change({ ref: 'T99', starts_at: '2026-11-13T10:00' })]).length, 0);
  assert.equal(build([change({ ref: null, starts_at: '2026-11-13T10:00' })]).length, 0);
  assert.equal(build([change({})]).length, 0); // nichts geändert
  assert.equal(build([change({ starts_at: '2026-11-06T14:00' })]).length, 0); // gleiche Zeit
  assert.equal(build([change({ done: 'open' })]).length, 0); // war schon offen
  assert.equal(build([change({ starts_at: '2026-11-13' }), change({ title: 'X' })]).length, 1);
  // ohne mitgeschickte Termine (ältere App) -> nichts
  assert.equal(buildProposals({ actions: [change({ starts_at: '2026-11-13' })] }, { customers, orders, documents: [] }, TODAY).length, 0);
});

test('Ausführen: Termine nach Kunden/Aufträgen, vor Dokumenten', () => {
  const i = (k) => EXECUTION_ORDER.indexOf(k);
  for (const k of ['appointment', 'order_date', 'appointment_change']) {
    assert.ok(i(k) > i('order') && i(k) < i('document'), k);
  }
});
