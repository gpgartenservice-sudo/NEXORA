// Unit-Tests: Nexy – To-dos, Ziele, Preise in Aufträgen. Start: npm run test:unit
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProposals,
  EXECUTION_ORDER,
  proposalLabel,
  proposalProblem,
} from '../../src/features/assistant/assistant-logic.ts';
import { buildNexyContext } from '../../src/features/assistant/nexy-context.ts';
import { EMPTY_SELLER } from '../../src/features/documents/document-logic.ts';

const TODAY = '2026-11-04';
const customers = [
  { id: 'c1', name: 'Peter Müller', company: null },
  { id: 'c2', name: 'Anna Schmidt', company: null },
];
const orders = [
  { id: 'o1', title: 'Hecke schneiden', customer_id: 'c1', price: 120, billing: 'once' },
  { id: 'o2', title: 'Website', customer_id: 'c2', price: null, billing: 'once' },
  { id: 'o3', title: 'Pflege', customer_id: 'c2', price: 80, billing: 'monthly', cancelled: true },
];
const documents = [{ id: 'd1', number: 'AN-2026-0001', kind: 'offer', paid_at: null, order_id: 'o1' }];
const todos = [
  { id: 't1', title: 'Steuer machen', due_on: '2026-11-06', important: false, done: false },
  { id: 't2', title: 'Flyer drucken', due_on: null, important: true, done: false },
];
const known = { customers, orders, documents, todos, todoRefs: { A1: 't1', A2: 't2' } };
const build = (actions) => buildProposals({ actions }, known, TODAY);
const price = (o) => ({
  type: 'order_price',
  order_price: { customer_name: 'Peter Müller', order_title: 'Hecke schneiden', price: 150, ...o },
});
const todo = (o) => ({ type: 'todo', todo: { title: 'Steuerberater anrufen', ...o } });
const change = (o) => ({ type: 'todo_change', todo_change: { ref: 'A1', ...o } });
const goal = (o) => ({ type: 'goal', goal: { kind: 'customers', period: 'week', target: 5, ...o } });

test('Preis in bestehenden Auftrag: bisher/neu, Hinweis auf vorhandenes Angebot', () => {
  const [p] = build([price()]);
  assert.equal(p.kind, 'order_price');
  assert.equal(p.order.existingId, 'o1');
  assert.equal(p.customer.name, 'Peter Müller');
  assert.deepEqual(p.data, {
    price: 150,
    billing: null,
    before: 120,
    beforeBilling: 'once',
    documents: ['AN-2026-0001'],
  });
  assert.equal(proposalProblem(p, [p]), null);
  assert.equal(proposalLabel(p), 'Preis 150 € für „Hecke schneiden“');
  // Kunde mit genau einem offenen Auftrag, ohne Titel; Preis als Text; monatlich
  const [w] = build([
    price({ customer_name: 'Anna Schmidt', order_title: null, price: '1.500,50', billing: 'monthly' }),
  ]);
  assert.equal(w.order.existingId, 'o2');
  assert.equal(w.data.price, 1500.5);
  assert.equal(w.data.billing, 'monthly');
  assert.equal(w.data.before, null);
  assert.match(proposalLabel(w), /pro Monat für „Website“$/);
});

test('Preis: gleicher Preis / ungültig -> weg; unbekannter Auftrag -> wählen', () => {
  assert.equal(build([price({ price: 120 })]).length, 0);
  assert.equal(build([price({ price: -5 }), price({ price: 'viel' })]).length, 0);
  const [u] = build([price({ customer_name: null, order_title: 'Dach' })]);
  assert.equal(u.order.existingId, null);
  assert.equal(proposalProblem(u, [u]), 'Wähle den Auftrag für diesen Preis.');
});

test('Preis für Auftrag aus demselben Gespräch landet direkt im neuen Auftrag', () => {
  const p = build([
    { type: 'order', order: { customer_name: 'Peter Müller', title: 'Zaun', price: null, billing: 'once' } },
    price({ order_title: 'Zaun', price: 400 }),
  ]);
  assert.deepEqual(
    p.map((x) => x.kind),
    ['order'],
  );
  assert.equal(p[0].data.price, 400);
});

test('Neues To-do: Datum, wichtig, Kunde/Auftrag', () => {
  const [t] = build([todo({ due_on: '2026-11-06', important: true, notes: 'Unterlagen' })]);
  assert.equal(t.kind, 'todo');
  assert.deepEqual(t.data, {
    title: 'Steuerberater anrufen',
    due_on: '2026-11-06',
    notes: 'Unterlagen',
    important: true,
  });
  assert.equal(proposalLabel(t), 'To-do „Steuerberater anrufen“ bis 06.11.2026');
  const [o] = build([todo({ title: 'Material bestellen', order_title: 'Hecke' })]);
  assert.deepEqual(o.order, { existingId: 'o1', newRef: null, title: 'Hecke schneiden' });
  assert.equal(o.customer.existingId, 'c1');
  const [c] = build([todo({ customer_name: 'Anna Schmidt' })]);
  assert.equal(c.customer.existingId, 'c2');
  assert.equal(c.order.existingId, null);
  assert.equal(build([todo({ title: ' ' })]).length, 0);
  assert.equal(build([todo({ due_on: '2026-02-30' })])[0].data.due_on, null);
  assert.equal(build([todo(), todo()]).length, 1);
});

test('To-do für neuen Kunden/Auftrag aus demselben Gespräch', () => {
  const p = build([
    { type: 'customer', customer: { name: 'Lisa Wagner' } },
    { type: 'order', order: { customer_name: 'Lisa Wagner', title: 'Website', price: 1500 } },
    todo({ title: 'Angebot schreiben', order_title: 'Website', customer_name: 'Lisa Wagner' }),
  ]);
  const t = p.find((x) => x.kind === 'todo');
  assert.ok(t.order.newRef);
  assert.equal(t.customer.newRef, p.find((x) => x.kind === 'customer').id);
  assert.equal(proposalProblem(t, p), null);
  const off = p.map((x) => (x.kind === 'order' ? { ...x, include: false } : x));
  assert.equal(proposalProblem(t, off), 'Der neue Auftrag dafür ist abgewählt.');
});

test('To-do ändern: abhaken, Datum, ohne Datum, löschen', () => {
  const [d] = build([change({ done: 'done' })]);
  assert.equal(d.kind, 'todo_change');
  assert.equal(d.data.done, true);
  assert.equal(proposalLabel(d), 'To-do „Steuer machen“ abhaken');
  const [m] = build([change({ ref: 'a1', due_on: '2026-11-10', important: true })]);
  assert.equal(m.data.due_on, '2026-11-10');
  assert.equal(m.data.important, true);
  const [n] = build([change({ due_on: 'none' })]);
  assert.equal(n.data.due_on, '');
  const [r] = build([change({ ref: 'A2', remove: true, title: 'egal' })]);
  assert.equal(r.data.remove, true);
  assert.equal(r.data.title, null);
  assert.equal(proposalLabel(r), 'To-do „Flyer drucken“ löschen');
});

test('To-do ändern: unbekannt, unverändert, doppelt -> weg', () => {
  assert.equal(build([change({ ref: 'A9', done: 'done' })]).length, 0);
  assert.equal(build([change({})]).length, 0);
  assert.equal(build([change({ done: 'open' })]).length, 0); // war offen
  assert.equal(build([change({ due_on: '2026-11-06' })]).length, 0); // gleiches Datum
  assert.equal(build([change({ ref: 'A2', due_on: 'none' })]).length, 0); // hatte kein Datum
  assert.equal(build([change({ done: 'done' }), change({ title: 'X' })]).length, 1);
});

test('Neues Ziel: Art, Zeitraum (korrigiert), Zielwert, eigenes Ziel', () => {
  const [g] = build([goal()]);
  assert.deepEqual(g.data, { kind: 'customers', period: 'week', target: 5, title: null, due_on: null });
  assert.equal(proposalLabel(g), 'Ziel: 5 neue Kunden pro Woche');
  const [r] = build([goal({ kind: 'revenue', period: 'week', target: '3.000' })]); // Umsatz pro Woche gibt es nicht
  assert.equal(r.data.period, 'month');
  assert.equal(r.data.target, 3000);
  assert.equal(proposalLabel(r), 'Ziel: 3.000 € Umsatz pro Monat');
  const [c] = build([
    goal({ kind: 'custom', period: 'month', target: 10, title: 'Google-Bewertungen', due_on: '2026-12-31' }),
  ]);
  assert.deepEqual(c.data, {
    kind: 'custom',
    period: 'once',
    target: 10,
    title: 'Google-Bewertungen',
    due_on: '2026-12-31',
  });
  assert.equal(build([goal({ kind: 'custom', title: null })]).length, 0);
  assert.equal(build([goal({ kind: 'likes' })]).length, 0);
  assert.equal(build([goal({ target: 0 })]).length, 0);
});

test('Ausführen: Preis vor Dokumenten, To-dos/Ziele nach Kunden und Aufträgen', () => {
  const i = (k) => EXECUTION_ORDER.indexOf(k);
  assert.ok(i('order_price') > i('order') && i('order_price') < i('document'));
  for (const k of ['todo', 'todo_change', 'goal']) assert.ok(i(k) > i('order') && i(k) > i('customer'), k);
});

test('Übersicht für Nexy: Aufgaben und Ziele, gedeckelt', () => {
  const entries = Array.from({ length: 50 }, (_, k) => ({ ref: `A${k + 1}`, was: `Aufgabe ${k + 1}` }));
  const c = buildNexyContext({
    seller: EMPTY_SELLER,
    customers: [],
    orders: [],
    documents: [],
    expenses: [],
    posts: [],
    todos: { entries, open: 50 },
    goals: [{ ziel: '5 neue Kunden pro Woche', stand: '3 von 5 Kunden' }],
    today: new Date(2026, 10, 4, 12),
  });
  assert.equal(c.aufgaben.length, 30);
  assert.equal(c.aufgaben_offen_gesamt, 50);
  assert.equal(c.ziele[0].stand, '3 von 5 Kunden');
  // sehr großes Konto: Übersicht bleibt unter der Grenze
  const big = (n, f) => Array.from({ length: n }, (_, k) => f(k));
  const huge = buildNexyContext({
    seller: EMPTY_SELLER,
    customers: big(400, (k) => ({
      id: `c${k}`,
      name: `Kundin Nummer ${k} mit langem Namen`,
      company: `Firma ${k} GmbH & Co. KG`,
    })),
    orders: big(400, (k) => ({
      id: `o${k}`,
      title: `Auftrag ${k} mit ausführlichem Titel`,
      customer_id: `c${k}`,
      price: 100,
      billing: 'once',
      updated_at: '2026-11-01T10:00:00Z',
    })),
    documents: [],
    expenses: [],
    posts: [],
    upcoming: big(40, (k) => ({
      ref: `T${k + 1}`,
      wann: 'Mo., 09.11., 10:00',
      beginn: '2026-11-09T10:00',
      art: 'Termin',
      was: `Termin ${k} mit einem längeren Titel`,
      kunde: null,
      ort: 'Hauptstraße 12, 59755 Arnsberg',
    })),
    todos: {
      entries: big(30, (k) => ({
        ref: `A${k + 1}`,
        was: `Aufgabe ${k} mit etwas längerem Text`,
        faellig: '2026-11-10',
      })),
      open: 30,
    },
    today: new Date(2026, 10, 4, 12),
  });
  assert.ok(JSON.stringify(huge).length <= 26000, String(JSON.stringify(huge).length));
});
