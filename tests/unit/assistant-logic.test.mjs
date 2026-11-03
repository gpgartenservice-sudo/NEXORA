// Unit-Tests für den Assistenten. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProposals as build,
  localDateTime,
  matchCustomer,
  matchOrder,
  proposalLabel,
  proposalProblem,
  quickReplies,
  replyText,
  validDay,
} from '../../src/features/assistant/assistant-logic.ts';

const customers = [
  { id: 'c1', name: 'Peter Müller', company: null },
  { id: 'c2', name: 'Anna Schmidt', company: 'Schmidt Bau GmbH' },
  { id: 'c3', name: 'Peter Klein', company: null },
];
const TODAY = '2026-11-03';
const orders = [
  { id: 'o1', title: 'Hecke schneiden', customer_id: 'c1' },
  { id: 'o2', title: 'Rasen mähen', customer_id: 'c1' },
  { id: 'o3', title: 'Website', customer_id: 'c2' },
];
const documents = [
  { id: 'd1', number: 'RE-2026-0001', kind: 'invoice', paid_at: null },
  { id: 'd2', number: 'RE-2026-0002', kind: 'invoice', paid_at: '2026-10-01T10:00:00Z' },
  { id: 'd3', number: 'AN-2026-0001', kind: 'offer', paid_at: null },
];
const buildProposals = (raw, cs = customers, today = TODAY) => build(raw, { customers: cs, orders, documents }, today);
const n = (o) => ({ customer: null, order: null, expense: null, post: null, document: null, income_proof: null, existing_pdf: null, mark_paid: null, ...o });

test('Kunden zuordnen: Name, Firma, eindeutiger Teil-Treffer, Umlaute', () => {
  assert.equal(matchCustomer('peter mueller', customers)?.id, 'c1');
  assert.equal(matchCustomer('Schmidt Bau GmbH', customers)?.id, 'c2');
  assert.equal(matchCustomer('Anna', customers)?.id, 'c2');
  assert.equal(matchCustomer('Peter', customers), null); // zwei Peters -> nicht raten
  assert.equal(matchCustomer('Lisa', customers), null);
  assert.equal(matchCustomer(null, customers), null);
});

test('Datum: gültige Tage, Uhrzeit lokal, Standard-Uhrzeit', () => {
  assert.equal(validDay('2026-02-29'), null);
  assert.equal(validDay('2028-02-29'), '2028-02-29');
  const d = new Date(localDateTime('2026-11-04T14:30'));
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);
  assert.equal(new Date(localDateTime('2026-11-04')).getHours(), 9);
  assert.equal(new Date(localDateTime('2026-11-04', 18)).getHours(), 18);
  assert.equal(localDateTime('morgen'), null);
  assert.equal(localDateTime('2026-11-04T25:00'), null);
});

test('Auftrag mit neuem Kunden: Kunde wird mit angelegt und verknüpft', () => {
  const p = buildProposals(
    { actions: [{ type: 'order', order: { customer_name: 'Lisa Wagner', title: 'Website', price: 1500, billing: 'once', meeting_at: '2026-11-05T10:00' } }] },
    customers,
    TODAY,
  );
  assert.equal(p.length, 2);
  assert.equal(p[0].kind, 'customer');
  assert.equal(p[0].data.name, 'Lisa Wagner');
  assert.equal(p[1].kind, 'order');
  assert.equal(p[1].customer.newRef, p[0].id);
  assert.equal(p[1].data.price, 1500);
  assert.equal(new Date(p[1].data.meeting_at).getHours(), 10);
  assert.equal(proposalProblem(p[1], p), null);
  // Kunde abgewählt -> Auftrag hat ein Problem
  const off = p.map((x) => (x.kind === 'customer' ? { ...x, include: false } : x));
  assert.match(proposalProblem(off[1], off), /abgewählt/);
});

test('Auftrag für vorhandenen Kunden; Kunde aus Text, der schon existiert, ist abgewählt', () => {
  const p = buildProposals(
    {
      actions: [
        { type: 'customer', customer: { name: 'Peter Müller', phone: '0171 123', email: 'kaputt' } },
        { type: 'order', order: { customer_name: 'Peter Müller', title: 'Hecke schneiden', price: '250,50', billing: 'monthly' } },
      ],
    },
    customers,
    TODAY,
  );
  assert.equal(p[0].kind, 'customer');
  assert.equal(p[0].duplicateOf, 'c1');
  assert.equal(p[0].include, false);
  assert.equal(p[0].data.email, null); // ungültige E-Mail fällt weg
  assert.equal(p[1].customer.existingId, 'c1');
  assert.equal(p[1].data.price, 250.5);
  assert.equal(p[1].data.billing, 'monthly');
});

test('Auftrag ohne Kunden: muss gewählt werden', () => {
  const p = buildProposals({ actions: [{ type: 'order', order: { title: 'Logo', customer_name: null } }] }, customers, TODAY);
  assert.equal(p.length, 1);
  assert.match(proposalProblem(p[0], p), /Wähle den Kunden/);
});

test('Ausgaben und Post-Ideen: bereinigt, Ungültiges fällt weg', () => {
  const p = buildProposals(
    {
      actions: [
        { type: 'expense', expense: { title: 'Canva', amount: 12, category: 'software', repeat: 'monthly', spent_on: '2026-11-02' } },
        { type: 'expense', expense: { title: 'Kaffee', amount: -3, category: 'other', repeat: 'once', spent_on: 'gestern' } },
        { type: 'expense', expense: { title: 'Flyer', amount: 49.9, category: 'party', repeat: 'täglich', spent_on: 'kaputt' } },
        { type: 'post', post: { title: '3 Fehler', format: 'reel', platforms: ['tiktok', 'myspace', 'tiktok'], notes: 'Hook!', planned_for: '2026-11-06' } },
        { type: 'post', post: { title: '  ' } },
        { type: 'unbekannt' },
        null,
      ],
    },
    customers,
    TODAY,
  );
  assert.deepEqual(p.map((x) => x.kind), ['expense', 'expense', 'post']);
  assert.deepEqual(p[0].data, { title: 'Canva', amount: 12, category: 'software', repeat: 'monthly', spent_on: '2026-11-02' });
  assert.deepEqual(p[1].data, { title: 'Flyer', amount: 49.9, category: 'other', repeat: 'once', spent_on: TODAY });
  assert.equal(p[2].data.format, 'video');
  assert.deepEqual(p[2].data.platforms, ['tiktok']);
  assert.equal(p[2].data.script, 'Hook!');
  assert.equal(new Date(p[2].data.planned_for).getHours(), 18);
});

test('Kaputte Antwort -> keine Vorschläge; Antworttext', () => {
  assert.deepEqual(buildProposals({ actions: 'quatsch' }, customers, TODAY), []);
  assert.deepEqual(buildProposals({}, customers, TODAY), []);
  assert.equal(replyText({ reply: '  Alles klar!  ' }), 'Alles klar!');
  assert.equal(replyText({ reply: 42 }), null);
});

test('Auftrag finden: Titel beim Kunden, Teil-Treffer, ohne Titel nur bei genau einem', () => {
  assert.equal(matchOrder('hecke', 'c1', orders)?.id, 'o1');
  assert.equal(matchOrder('Website', null, orders)?.id, 'o3');
  assert.equal(matchOrder(null, 'c1', orders), null); // zwei Aufträge
  assert.equal(matchOrder(null, 'c2', orders)?.id, 'o3');
  assert.equal(matchOrder('Logo', 'c1', orders), null);
});

test('Rechnung zu vorhandenem Auftrag (Kunde + Titel)', () => {
  const p = buildProposals({ actions: [n({ type: 'document', document: { kind: 'invoice', customer_name: 'Peter Müller', order_title: 'Hecke schneiden', service_date: '2026-10-30' } })] });
  assert.equal(p.length, 1);
  assert.equal(p[0].kind, 'document');
  assert.equal(p[0].order.existingId, 'o1');
  assert.equal(p[0].customer.existingId, 'c1');
  assert.equal(p[0].data.service_date, '2026-10-30');
  assert.equal(proposalProblem(p[0], p), null);
  assert.equal(proposalLabel(p[0]), 'Rechnung zu „Hecke schneiden“ (Peter Müller)');
});

test('Angebot nur mit Auftragstitel: Kunde kommt vom Auftrag', () => {
  const p = buildProposals({ actions: [n({ type: 'document', document: { kind: 'offer', customer_name: null, order_title: 'Website', service_date: null } })] });
  assert.equal(p[0].order.existingId, 'o3');
  assert.equal(p[0].customer.existingId, 'c2');
});

test('Neuer Auftrag + Rechnung im selben Schritt: Rechnung hängt am neuen Auftrag', () => {
  const p = buildProposals({
    actions: [
      n({ type: 'order', order: { customer_name: 'Peter Müller', title: 'Zaun streichen', description: null, price: 300, billing: 'once', meeting_at: null, execution_at: null } }),
      n({ type: 'document', document: { kind: 'invoice', customer_name: 'Peter Müller', order_title: 'Zaun streichen', service_date: null } }),
    ],
  });
  const order = p.find((x) => x.kind === 'order');
  const doc = p.find((x) => x.kind === 'document');
  assert.equal(doc.order.newRef, order.id);
  assert.equal(doc.customer.existingId, 'c1');
  const off = p.map((x) => (x.kind === 'order' ? { ...x, include: false } : x));
  assert.match(proposalProblem(off.find((x) => x.kind === 'document'), off), /neue Auftrag dafür ist abgewählt/);
});

test('Rechnung ohne passenden Auftrag: Auftrag muss gewählt werden', () => {
  const p = buildProposals({ actions: [n({ type: 'document', document: { kind: 'invoice', customer_name: 'Peter Müller', order_title: null, service_date: null } })] });
  assert.equal(p[0].order.existingId, null);
  assert.equal(p[0].customer.existingId, 'c1');
  assert.match(proposalProblem(p[0], p), /Wähle den Auftrag für diese Rechnung/);
});

test('Einkommensnachweis, vorhandenes PDF, bezahlt markieren', () => {
  const p = buildProposals({
    actions: [
      n({ type: 'income_proof', income_proof: { period: '6' } }),
      n({ type: 'income_proof', income_proof: { period: '3' } }), // doppelt -> weg
      n({ type: 'existing_pdf', existing_pdf: { number: 're-2026-0001' } }),
      n({ type: 'existing_pdf', existing_pdf: { number: 'RE-2099-9999' } }), // gibt es nicht
      n({ type: 'mark_paid', mark_paid: { number: 'RE-2026-0001' } }),
      n({ type: 'mark_paid', mark_paid: { number: 'RE-2026-0002' } }), // schon bezahlt
      n({ type: 'mark_paid', mark_paid: { number: 'AN-2026-0001' } }), // Angebot
    ],
  });
  assert.deepEqual(p.map((x) => x.kind), ['income_proof', 'existing_pdf', 'mark_paid']);
  assert.equal(p[0].data.period, '6');
  assert.deepEqual(p[1].data, { documentId: 'd1', number: 'RE-2026-0001' });
  assert.equal(proposalLabel(p[0]), 'Einkommensnachweis (letzte 6 Monate)');
  assert.equal(proposalLabel(p[2]), 'RE-2026-0001 als bezahlt markieren');
});

test('Schnellantworten: max. 3, ohne Doppelte und Leere', () => {
  assert.deepEqual(quickReplies({ quick_replies: ['Peter Müller', ' ', 'Peter Müller', 'Anna', 'Lisa', 'Tom'] }), ['Peter Müller', 'Anna', 'Lisa']);
  assert.deepEqual(quickReplies({}), []);
});
