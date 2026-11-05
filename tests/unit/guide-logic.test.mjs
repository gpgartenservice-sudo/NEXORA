// Unit-Tests: Nexy macht es vor (Schritte je Aktion, Beschriftungen, Position). Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  LABELS,
  appointmentChangeSteps,
  appointmentSteps,
  customerDone,
  customerSteps,
  documentSteps,
  euroText,
  goalSteps,
  orderDateSteps,
  orderDatesSteps,
  orderPriceSteps,
  orderSteps,
  placeNexy,
  todoChangeSteps,
  todoDone,
  todoSteps,
  toOrder,
  typingDelay,
  typingFrames,
} from '../../src/features/assistant/guide-logic.ts';

const read = (p) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
const order = { id: 'o1', title: 'Hecke schneiden', customer: { id: 'c1', name: 'Frau Berg' } };
const kinds = (steps) => steps.map((s) => s.do);
const view = { width: 1200, height: 800 };
const bubble = { width: 300, height: 72 };

test('Neuer Kunde: Formular öffnen, nur ausgefüllte Felder tippen, „Kunde anlegen“ drücken', () => {
  const steps = customerSteps({
    id: 'p1',
    kind: 'customer',
    include: true,
    duplicateOf: null,
    data: { name: 'Frau Berg', company: null, phone: '0176 123', email: ' ', address: null, notes: null },
  });
  assert.deepEqual(steps[0], { do: 'go', href: '/kunden/neu', mode: 'push' });
  assert.equal(steps[1].do, 'show');
  assert.match(steps[1].say, /Frau Berg/);
  assert.deepEqual(
    steps.filter((s) => s.do === 'type'),
    [
      { do: 'type', field: 'Name', text: 'Frau Berg' },
      { do: 'type', field: 'Telefon', text: '0176 123' },
    ],
  );
  assert.deepEqual(steps.at(-1), { do: 'press', button: 'Kunde anlegen' });
  assert.deepEqual(customerDone('c9'), [
    { do: 'go', href: '/kunden/c9', mode: 'replace' },
    { do: 'show', at: { target: 'guide.customer' } },
  ]);
});

test('Neuer Auftrag: über den Kunden und „+ Neuer Auftrag“ ins Formular', () => {
  const steps = orderSteps(
    {
      id: 'p2',
      kind: 'order',
      include: true,
      customer: { existingId: 'c1', newRef: null, name: 'Frau Berg' },
      data: { title: 'Hecke', description: null, price: 1250.5, billing: 'once', meeting_at: null, execution_at: null },
    },
    { id: 'c1', name: 'Frau Berg' },
  );
  assert.deepEqual(steps[0], { do: 'go', href: '/kunden/c1' });
  assert.deepEqual(steps[2], { do: 'press', button: '+ Neuer Auftrag' });
  assert.deepEqual(steps[3], { do: 'go', href: '/auftraege/neu?customer=c1', mode: 'push' });
  assert.deepEqual(
    steps.filter((s) => s.do === 'type').map((s) => [s.field, s.text]),
    [
      ['Leistung', 'Hecke'],
      ['Preis in €', '1250,50'],
    ],
  );
  assert.deepEqual(steps.at(-1), { do: 'press', button: 'Auftrag anlegen' });
});

test('Termin im Auftrag: Kunde → Auftrag → Feld, Datum eintragen, speichern', () => {
  const steps = orderDateSteps(
    {
      id: 'p3',
      kind: 'order_date',
      include: true,
      data: { field: 'meeting', at: '2026-11-12T09:00:00.000Z', before: null },
      customer: { existingId: 'c1', newRef: null, name: 'Frau Berg' },
      order: { existingId: 'o1', newRef: null, title: 'Hecke schneiden' },
    },
    order,
  );
  assert.deepEqual(kinds(steps), ['go', 'show', 'go', 'show', 'date', 'press']);
  assert.deepEqual(steps[0], { do: 'go', href: '/kunden/c1' });
  assert.deepEqual(steps[1].at, { target: 'guide.order.o1' });
  assert.deepEqual(steps[2], { do: 'go', href: '/auftraege/o1' });
  assert.deepEqual(steps[3].at, { target: 'guide.order.meeting' });
  assert.match(steps[3].say, /Erstgespräch/);
  assert.deepEqual(steps[4], {
    do: 'date',
    field: 'Termin (z. B. Erstgespräch, Besichtigung)',
    value: '2026-11-12T09:00:00.000Z',
    withTime: true,
  });
  assert.deepEqual(steps[5], { do: 'press', button: 'Änderungen speichern' });
});

test('Auftrag ohne bekannten Kunden: direkt in den Auftrag', () => {
  assert.deepEqual(toOrder({ id: 'o2', title: 'X', customer: null }), [{ do: 'go', href: '/auftraege/o2' }]);
});

test('Neuer Auftrag mit Terminen: im Auftrag nachtragen; ohne Termine nichts', () => {
  const steps = orderDatesSteps({ meeting_at: null, execution_at: '2026-11-20T08:00:00.000Z' });
  assert.deepEqual(kinds(steps), ['show', 'date', 'press']);
  assert.equal(steps[1].field, 'Ausführung');
  assert.deepEqual(orderDatesSteps({ meeting_at: null, execution_at: null }), []);
});

test('Preis und Rechnung im Auftrag', () => {
  const price = orderPriceSteps(
    {
      id: 'p4',
      kind: 'order_price',
      include: true,
      data: { price: 300, billing: null, before: 250, beforeBilling: 'once', documents: [] },
      customer: { existingId: 'c1', newRef: null, name: null },
      order: { existingId: 'o1', newRef: null, title: null },
    },
    order,
  );
  assert.deepEqual(price.find((s) => s.do === 'type'), { do: 'type', field: 'Preis…', text: '300' });
  const doc = documentSteps(
    {
      id: 'p5',
      kind: 'document',
      include: true,
      data: { docKind: 'invoice', service_date: null },
      customer: { existingId: 'c1', newRef: null, name: null },
      order: { existingId: 'o1', newRef: null, title: null },
    },
    order,
  );
  assert.deepEqual(doc.at(-1), { do: 'press', button: '+ Rechnung' });
});

test('Eigener Termin: Formular, Titel und Beginn tippen (ganztägig ohne Uhrzeit)', () => {
  const base = { id: 'p6', kind: 'appointment', include: true, customer: { existingId: null, newRef: null, name: null } };
  const timed = appointmentSteps({
    ...base,
    data: { title: 'Zahnarzt', starts_at: '2026-11-12T09:00:00.000Z', ends_at: null, all_day: false, location: 'Bonn', notes: null },
  });
  assert.deepEqual(timed[0], { do: 'go', href: '/termine/neu', mode: 'push' });
  assert.deepEqual(
    timed.filter((s) => s.do === 'type' || s.do === 'date').map((s) => s.field),
    ['Was?', 'Beginn', 'Ort'],
  );
  assert.deepEqual(timed.at(-1), { do: 'press', button: 'Termin speichern' });
  const allDay = appointmentSteps({
    ...base,
    data: { title: 'Urlaub', starts_at: '2026-11-12', ends_at: null, all_day: true, location: null, notes: null },
  });
  assert.equal(allDay.filter((s) => s.do === 'date').length, 0);
});

test('Terminänderung: löschen drückt „Termin löschen“, Auftragstermin verschieben setzt das Feld', () => {
  const event = (kind) => ({
    key: 'k',
    kind,
    title: 'Hecke',
    start: '2026-11-12T09:00:00.000Z',
    end: '2026-11-12T10:00:00.000Z',
    allDay: false,
    orderId: kind === 'appointment' ? null : 'o1',
    appointmentId: kind === 'appointment' ? 'a1' : null,
    done: false,
  });
  const change = { starts_at: null, ends_at: null, all_day: null, title: null, location: null, notes: null, done: null, remove: false };
  const removed = appointmentChangeSteps(
    { id: 'p7', kind: 'appointment_change', include: true, event: event('appointment'), data: { ...change, remove: true } },
    null,
  );
  assert.deepEqual(removed.at(-1), { do: 'press', button: 'Termin löschen' });
  const moved = appointmentChangeSteps(
    {
      id: 'p8',
      kind: 'appointment_change',
      include: true,
      event: event('execution'),
      data: { ...change, starts_at: '2026-11-14T09:00:00.000Z' },
    },
    order,
  );
  assert.deepEqual(moved.find((s) => s.do === 'date'), {
    do: 'date',
    field: 'Ausführung',
    value: '2026-11-14T09:00:00.000Z',
    withTime: true,
  });
  assert.match(moved.find((s) => s.say?.startsWith('Ich verschiebe')).say, /Ausführung „Hecke“/);
});

test('To-dos: Schnelleingabe tippen, danach leeren; Änderung im To-do', () => {
  const steps = todoSteps({
    id: 'p9',
    kind: 'todo',
    include: true,
    data: { title: 'Angebot nachfassen', due_on: null, notes: null, important: false },
    customer: { existingId: null, newRef: null, name: null },
    order: { existingId: null, newRef: null, title: null },
  });
  assert.deepEqual(steps.slice(2), [
    { do: 'type', field: 'Neues To-do', text: 'Angebot nachfassen' },
    { do: 'press', button: 'Hinzufügen' },
  ]);
  assert.deepEqual(todoDone('t1')[0], { do: 'type', field: 'Neues To-do', text: '' });
  const done = todoChangeSteps({
    id: 'p10',
    kind: 'todo_change',
    include: true,
    todo: { id: 't1', title: 'Rechnung', due_on: null, important: false, done: false },
    data: { title: null, due_on: '', notes: null, important: null, done: true, remove: false },
  });
  assert.deepEqual(done.find((s) => s.do === 'date'), { do: 'date', field: 'Fällig am (optional)', value: null, withTime: false });
  assert.ok(done.some((s) => s.do === 'show' && s.at?.button === 'Erledigt'));
  assert.deepEqual(done.at(-1), { do: 'press', button: 'Änderungen speichern' });
});

test('Ziel: Art und Zeitraum vorwählen, Zielwert tippen', () => {
  const steps = goalSteps({
    id: 'p11',
    kind: 'goal',
    include: true,
    data: { kind: 'revenue', period: 'month', target: 5000, title: null, due_on: null },
  });
  assert.deepEqual(steps[0], { do: 'go', href: '/aufgaben/ziele/neu?art=revenue&zeitraum=month', mode: 'push' });
  assert.deepEqual(steps.find((s) => s.do === 'type'), { do: 'type', field: 'Ziel…', text: '5000' });
});

test('Beträge wie getippt, Tempo und Zwischenstände', () => {
  assert.equal(euroText(1250), '1250');
  assert.equal(euroText(19.9), '19,90');
  assert.equal(typingDelay(0), 0);
  assert.equal(typingDelay(5), 55);
  assert.ok(typingDelay(400) >= 10 && typingDelay(400) * 400 <= 4000);
  assert.deepEqual(typingFrames('Hey'), ['H', 'He', 'Hey']);
  assert.deepEqual(typingFrames(''), ['']);
  const long = typingFrames('x'.repeat(300));
  assert.ok(long.length <= 61);
  assert.equal(long.at(-1), 'x'.repeat(300));
});

test('Jede Beschriftung, nach der Nexy sucht, steht wirklich im Formular', () => {
  const where = {
    customer: ['features/crm/customer-form.tsx', 'features/crm/customer-new-screen.tsx', 'features/crm/customer-detail-screen.tsx'],
    newOrder: ['features/crm/order-new-screen.tsx'],
    order: ['features/crm/order-detail-screen.tsx', 'features/documents/order-documents-card.tsx'],
    appointment: ['features/appointments/appointment-editor.tsx'],
    todo: ['features/goals/aufgaben-screen.tsx', 'features/goals/todo-editor.tsx'],
    goal: ['features/goals/goal-editor.tsx'],
    expense: ['features/finance/expense-editor.tsx'],
    post: ['features/social/post-editor.tsx'],
  };
  for (const [group, labels] of Object.entries(LABELS)) {
    const source = where[group].map(read).join('\n');
    for (const label of Object.values(labels)) {
      const prefix = label.endsWith('…');
      const text = prefix ? label.slice(0, -1) : label;
      const found = prefix
        ? source.includes(`'${text}`) || source.includes(`"${text}`)
        : [`'${text}'`, `"${text}"`, `'${text} *'`, `"${text} *"`].some((v) => source.includes(v));
      assert.ok(found, `${group}: „${label}“ fehlt im Formular`);
    }
  }
});

test('Markierte Stellen, die Nexy anfährt, gibt es in den Seiten', () => {
  const all = [
    'features/crm/customer-detail-screen.tsx',
    'features/crm/order-detail-screen.tsx',
    'features/appointments/appointment-editor.tsx',
    'features/goals/todo-editor.tsx',
    'features/goals/goal-editor.tsx',
    'features/finance/expense-editor.tsx',
    'features/social/post-editor.tsx',
    'features/assistant/nexy-screen.tsx',
  ]
    .map(read)
    .join('\n');
  for (const id of [
    'guide.customer',
    'guide.order',
    'guide.order.meeting',
    'guide.order.execution',
    'guide.order.price',
    'auftrag.dokumente',
    'guide.appointment',
    'guide.todo',
    'guide.goal',
    'guide.expense',
    'guide.post',
    'guide.nexy',
  ]) {
    assert.ok(all.includes(`id="${id}"`), `${id} fehlt`);
  }
  assert.ok(all.includes('id={`guide.order.${o.id}`}'), 'Auftrag in der Kundenliste fehlt');
});

test('Position: ohne Stelle unten rechts in der Ecke, Blase links daneben', () => {
  const p = placeNexy(null, 64, view, bubble);
  assert.deepEqual([p.x, p.y], [1200 - 64 - 32, 800 - 64 - 32]);
  assert.ok(p.bubble.left + p.bubble.width <= p.x, 'Blase links von Nexy');
  assert.equal(p.bubble.align, 'end');
});

test('Position: rechts neben einer schmalen Stelle, Blase nicht auf der Stelle', () => {
  const rect = { x: 200, y: 300, width: 400, height: 60 };
  const p = placeNexy(rect, 64, view, bubble);
  assert.equal(p.x, 200 + 400 + 12);
  assert.ok(p.bubble.left >= rect.x + rect.width, 'Blase rechts der Stelle');
  assert.equal(p.bubble.align, 'start');
});

test('Position: links, wenn rechts kein Platz ist; breite Stelle bleibt im Fenster', () => {
  assert.equal(placeNexy({ x: 500, y: 300, width: 660, height: 60 }, 64, view, bubble).x, 500 - 12 - 64);
  const p = placeNexy({ x: 10, y: 700, width: 1180, height: 90 }, 64, view, bubble);
  assert.ok(p.x >= 16 && p.x + 64 <= 1200 - 16);
  assert.ok(p.y >= 16 && p.y + 64 <= 800 - 16);
  assert.ok(p.bubble.left >= 16 && p.bubble.left + p.bubble.width <= 1200 - 16);
});

test('Position: schmales Fenster (Handy) – Blase passt in die Breite', () => {
  const p = placeNexy({ x: 16, y: 200, width: 328, height: 120 }, 56, { width: 360, height: 700 }, bubble);
  assert.ok(p.bubble.left >= 16 && p.bubble.left + p.bubble.width <= 360 - 16);
  assert.equal(placeNexy(null, 56, { width: 260, height: 500 }, bubble).bubble.width, 260 - 32);
});
