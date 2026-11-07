// Unit-Tests für den Assistenten. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildProposals as build,
  EXECUTION_ORDER,
  localDateTime,
  matchCustomer,
  matchOrder,
  proposalLabel,
  proposalProblem,
  quickReplies,
  replyText,
  runnableNow,
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

test('Sofort ausführen: nur wenn etwas gewählt ist und nirgends etwas fehlt', () => {
  const a = { id: 'a', kind: 'customer', include: true };
  const b = { id: 'b', kind: 'order', include: true };
  const off = { id: 'c', kind: 'expense', include: false };
  const none = () => [];
  assert.equal(runnableNow([a, b], [], none), true);
  // fehlt bei einem etwas (z. B. Anschrift für die Rechnung) -> Karte wartet
  assert.equal(runnableNow([a, b], [], (p) => (p.id === 'b' ? ['Anschrift'] : [])), false);
  // abgewählte zählen nicht – auch nicht ihre Lücken
  assert.equal(runnableNow([a, off], [], (p) => (p.id === 'c' ? ['Betrag'] : [])), true);
  // nichts (mehr) zu tun
  assert.equal(runnableNow([off], [], none), false);
  assert.equal(runnableNow([a], ['a'], none), false);
  assert.equal(runnableNow([], [], none), false);
});

test('Kunde löschen: erst seine Aufträge, dann ihn – nur vorhandene Kunden', () => {
  const del = (name) => ({ type: 'customer_delete', customer_delete: { customer_name: name } });
  // ohne Aufträge: nur der Kunde; doppelt und unbekannt fallen weg
  const solo = buildProposals({ actions: [del('Peter Klein'), del('Peter Klein'), del('Unbekannt')] });
  assert.equal(solo.length, 1);
  assert.deepEqual(solo[0].data, { customerId: 'c3', name: 'Peter Klein', orderIds: [] });
  assert.equal(proposalLabel(solo[0]), 'Kunde Peter Klein löschen');
  assert.equal(proposalProblem(solo[0], solo), null);
  // mit Aufträgen: die kommen als eigene Löschungen davor
  const list = buildProposals({ actions: [del('peter mueller')] });
  assert.deepEqual(
    list.map((p) => [p.kind, p.kind === 'order_delete' ? p.order.existingId : p.data.orderIds]),
    [
      ['order_delete', 'o1'],
      ['order_delete', 'o2'],
      ['customer_delete', ['o1', 'o2']],
    ],
  );
  assert.equal(proposalProblem(list[2], list), null);
  // ein Auftrag abgewählt -> der Kunde kann nicht gelöscht werden
  const off = list.map((p) => (p.id === list[0].id ? { ...p, include: false } : p));
  assert.match(proposalProblem(off[2], off), /Aufträge/);
  // mehrdeutig („Peter“) -> nichts
  assert.equal(buildProposals({ actions: [del('Peter')] }).length, 0);
  // erst Aufträge, dann Kunde – am Ende (nur das Öffnen einer Seite kommt danach)
  assert.deepEqual(EXECUTION_ORDER.slice(-3), ['order_delete', 'customer_delete', 'open']);
});

test('Auftrag löschen: eindeutig zuordnen, sonst in der Karte wählen', () => {
  const del = (o) => ({ type: 'order_delete', order_delete: o });
  const [hecke] = buildProposals({ actions: [del({ customer_name: 'Peter Müller', order_title: 'Hecke' })] });
  assert.equal(hecke.kind, 'order_delete');
  assert.deepEqual(hecke.order, { existingId: 'o1', newRef: null, title: 'Hecke schneiden' });
  assert.equal(hecke.customer.existingId, 'c1');
  assert.equal(proposalLabel(hecke), 'Auftrag „Hecke schneiden“ (Peter Müller) löschen');
  assert.equal(proposalProblem(hecke, [hecke]), null);
  // nicht eindeutig (Peter Müller hat zwei Aufträge) -> wählen
  const [pick] = buildProposals({ actions: [del({ customer_name: 'Peter Müller' })] });
  assert.equal(pick, undefined);
  const [unclear] = buildProposals({ actions: [del({ customer_name: 'Peter Müller', order_title: 'Garten' })] });
  assert.equal(unclear.order.existingId, null);
  assert.match(proposalProblem(unclear, [unclear]), /Wähle den Auftrag/);
  // doppelt -> einmal
  assert.equal(buildProposals({ actions: [del({ order_title: 'Website' }), del({ order_title: 'Website' })] }).length, 1);
});

// ——— Ändern und Löschen von Vorhandenem ———

const fullCustomers = [
  { id: 'c1', name: 'Peter Müller', company: null, phone: '0171 111', email: 'peter@alt.de', address: null, notes: null },
  { id: 'c2', name: 'Anna Schmidt', company: 'Schmidt Bau GmbH', phone: null, email: null, address: null, notes: 'VIP' },
];
const fullOrders = [
  {
    id: 'o1',
    title: 'Hecke schneiden',
    customer_id: 'c1',
    description: 'alt',
    discount_percent: 0,
    meeting_done: false,
    offer_sent: true,
    offer_accepted: false,
    completed: false,
    cancelled: false,
    expenses: null,
    internal_notes: null,
    contract_start: null,
    contract_end: null,
  },
  { id: 'o2', title: 'Website', customer_id: 'c2', cancelled: true, completed: false },
];
const expenses = [
  { id: 'e1', title: 'Canva Pro', amount: 11.99, category: 'software', repeat: 'monthly', spent_on: '2026-01-05', ends_on: null, notes: null },
  { id: 'e2', title: 'Flyer', amount: 49.9, category: 'marketing', repeat: 'once', spent_on: '2026-11-02', ends_on: null, notes: 'Druckerei' },
];
const posts = [
  {
    id: 'p1',
    title: '3 Fehler beim Gründen',
    format: 'video',
    platforms: ['tiktok'],
    script: null,
    caption: null,
    hashtags: null,
    planned_for: null,
    published_at: null,
    url: null,
  },
];
const goals = [
  { id: 'g1', kind: 'revenue', period: 'month', target: 3000, title: null, progress: 0, due_on: null, archived: false },
  { id: 'g2', kind: 'custom', period: 'once', target: 10, title: 'Google-Bewertungen', progress: 2, due_on: null, archived: false },
];
const knownAll = {
  customers: fullCustomers,
  orders: fullOrders,
  documents,
  expenses,
  expenseRefs: { E1: 'e1', E2: 'e2' },
  posts,
  postRefs: { P1: 'p1' },
  goals,
  goalRefs: { Z1: 'g1', Z2: 'g2' },
  seller: { company_name: 'Lena Design', iban: null, small_business: true, vat_rate: 19, payment_days: 14, offer_validity_days: 30 },
};
const run = (...actions) => build({ actions }, knownAll, TODAY);

test('Kunde ändern: nur Geändertes, "none" leert, kaputte E-Mail fällt weg', () => {
  const [p] = run({
    type: 'customer_change',
    customer_change: { customer_name: 'peter mueller', email: 'peter@neu.de', phone: 'none', company: 'Müller GmbH', address: null },
  });
  assert.equal(p.kind, 'customer_change');
  assert.deepEqual(p.customer, { id: 'c1', name: 'Peter Müller' });
  assert.deepEqual(p.data, { name: null, company: 'Müller GmbH', phone: '', email: 'peter@neu.de', address: null, notes: null });
  assert.equal(proposalLabel(p), 'Kunde Peter Müller ändern');
  // umbenennen
  const [r] = run({ type: 'customer_change', customer_change: { customer_name: 'Anna Schmidt', name: 'Anna Berg' } });
  assert.equal(proposalLabel(r), 'Kunde Anna Schmidt umbenennen in Anna Berg');
  // nichts geändert (gleiche Werte, kaputte E-Mail, Leeren von Leerem) -> kein Vorschlag
  assert.equal(
    run({ type: 'customer_change', customer_change: { customer_name: 'Peter Müller', email: 'kaputt', address: 'none', phone: '0171 111' } }).length,
    0,
  );
  // unbekannter Kunde -> nichts
  assert.equal(run({ type: 'customer_change', customer_change: { customer_name: 'Niemand', phone: '1' } }).length, 0);
});

test('Auftrag ändern: Status-Schalter, Texte, Rabatt – Bisheriges zählt nicht als Änderung', () => {
  const [p] = run({
    type: 'order_change',
    order_change: {
      customer_name: 'Peter Müller',
      order_title: 'hecke',
      cancelled: true,
      offer_sent: true, // schon so
      discount: '10',
      description: 'none',
      internal_notes: 'Tor klemmt',
    },
  });
  assert.equal(p.kind, 'order_change');
  assert.equal(p.order.existingId, 'o1');
  assert.equal(p.data.cancelled, true);
  assert.equal(p.data.offer_sent, null);
  assert.equal(p.data.discount_percent, 10);
  assert.equal(p.data.description, '');
  assert.equal(p.data.internal_notes, 'Tor klemmt');
  assert.equal(proposalLabel(p), 'Auftrag „Hecke schneiden“ stornieren');
  assert.equal(proposalProblem(p, [p]), null);
  // stornierten Auftrag wieder aufnehmen
  const [r] = run({ type: 'order_change', order_change: { customer_name: 'Anna Schmidt', order_title: 'Website', cancelled: false } });
  assert.equal(proposalLabel(r), 'Auftrag „Website“ wieder aufnehmen');
  // abschließen
  const [c] = run({ type: 'order_change', order_change: { order_title: 'Hecke schneiden', completed: 'true' } });
  assert.equal(proposalLabel(c), 'Auftrag „Hecke schneiden“ abschließen');
  // nicht eindeutig -> Auftrag in der Karte wählen
  const [u] = run({ type: 'order_change', order_change: { order_title: 'Garten', completed: true } });
  assert.equal(u.order.existingId, null);
  assert.match(proposalProblem(u, [u]), /Wähle den Auftrag/);
  // keine echte Änderung -> nichts
  assert.equal(run({ type: 'order_change', order_change: { order_title: 'Hecke schneiden', offer_sent: true } }).length, 0);
});

test('Ausgabe ändern und löschen über das Kurzzeichen', () => {
  const [p] = run({ type: 'expense_change', expense_change: { ref: 'e1', amount: '14,99', ends_on: '2026-12-31', category: 'software' } });
  assert.equal(p.kind, 'expense_change');
  assert.equal(p.expense.id, 'e1');
  assert.deepEqual(p.data, {
    title: null,
    amount: 14.99,
    category: null,
    repeat: null,
    spent_on: null,
    ends_on: '2026-12-31',
    notes: null,
    remove: false,
  });
  assert.equal(proposalLabel(p), 'Ausgabe „Canva Pro“ ändern');
  const [d] = run({ type: 'expense_change', expense_change: { ref: 'E2', remove: true } });
  assert.equal(d.data.remove, true);
  assert.equal(proposalLabel(d), 'Ausgabe „Flyer“ löschen');
  // Notiz leeren
  const [n2] = run({ type: 'expense_change', expense_change: { ref: 'E2', notes: 'none' } });
  assert.equal(n2.data.notes, '');
  // unbekanntes Kurzzeichen, ungültiger Betrag -> nichts
  assert.equal(run({ type: 'expense_change', expense_change: { ref: 'E9', remove: true } }).length, 0);
  assert.equal(run({ type: 'expense_change', expense_change: { ref: 'E1', amount: -5 } }).length, 0);
});

test('Post ändern: Plattformen, Status, veröffentlicht, Zahlen – und löschen', () => {
  const [p] = run({
    type: 'post_change',
    post_change: { ref: 'P1', platforms: ['instagram', 'tiktok', 'quatsch'], status: 'ready', published_at: '2026-11-05T18:00', views: '12.000', url: 'kein link' },
  });
  assert.equal(p.kind, 'post_change');
  assert.deepEqual(p.data.platforms, ['tiktok', 'instagram']);
  assert.equal(p.data.steps, 'ready');
  assert.equal(p.data.published, true);
  assert.equal(p.data.published_at, localDateTime('2026-11-05T18:00'));
  assert.deepEqual(p.data.metrics, { views: 12000 });
  assert.equal(p.data.url, null);
  // gleiche Plattformen -> keine Änderung
  assert.equal(run({ type: 'post_change', post_change: { ref: 'P1', platforms: ['tiktok'] } }).length, 0);
  const [d] = run({ type: 'post_change', post_change: { ref: 'P1', remove: true } });
  assert.equal(proposalLabel(d), 'Post „3 Fehler beim Gründen“ löschen');
});

test('Ziel ändern, archivieren, löschen – eigene Felder nur bei eigenen Zielen', () => {
  const [p] = run({ type: 'goal_change', goal_change: { ref: 'Z1', target: '4.000', period: 'year', progress: 5, title: 'x' } });
  assert.equal(p.data.target, 4000);
  assert.equal(p.data.period, 'year');
  assert.equal(p.data.progress, null); // kein eigenes Ziel
  assert.equal(p.data.title, null);
  const [c] = run({ type: 'goal_change', goal_change: { ref: 'Z2', progress: 4, due_on: '2026-12-31', period: 'month' } });
  assert.equal(c.data.progress, 4);
  assert.equal(c.data.due_on, '2026-12-31');
  assert.equal(c.data.period, null);
  const [a] = run({ type: 'goal_change', goal_change: { ref: 'Z2', archived: true } });
  assert.equal(proposalLabel(a), 'Ziel „Google-Bewertungen“ archivieren');
  const [d] = run({ type: 'goal_change', goal_change: { ref: 'Z1', remove: true } });
  assert.match(proposalLabel(d), /^Ziel „3\.000 € Umsatz pro Monat“ löschen$/);
});

test('Firmendaten ändern: nur gültige, geänderte Felder', () => {
  const [p] = run({
    type: 'company_change',
    company_change: {
      iban: 'de89 3704 0044 0532 0130 00',
      email: 'kaputt',
      company_name: 'Lena Design', // schon so
      small_business: false,
      vat_rate: 7,
      payment_days: '21',
      website: 'none',
    },
  });
  assert.equal(p.kind, 'company_change');
  assert.deepEqual(p.data, {
    iban: 'DE89370400440532013000',
    website: null,
    small_business: false,
    vat_rate: 7,
    payment_days: 21,
  });
  assert.match(proposalLabel(p), /^Firmendaten ändern \(Website, IBAN, Kleinunternehmerregelung, Umsatzsteuersatz, Zahlungsziel\)$/);
  // ungültige IBAN / Zahlungsziel -> nichts
  assert.equal(run({ type: 'company_change', company_change: { iban: 'DE12', payment_days: 500 } }).length, 0);
});

test('Rechnung wieder auf offen setzen – nur bezahlte Rechnungen', () => {
  const [p] = run({ type: 'mark_unpaid', mark_unpaid: { number: 're-2026-0002' } });
  assert.equal(p.kind, 'mark_paid');
  assert.deepEqual(p.data, { documentId: 'd2', number: 'RE-2026-0002', paid: false });
  assert.equal(proposalLabel(p), 'RE-2026-0002 wieder auf offen setzen');
  assert.equal(run({ type: 'mark_unpaid', mark_unpaid: { number: 'RE-2026-0001' } }).length, 0); // offen
  const [b] = run({ type: 'mark_paid', mark_paid: { number: 'RE-2026-0001' } });
  assert.equal(b.data.paid, true);
});

test('Seite öffnen: Bereich, Kunde, Auftrag, Kurzzeichen, Nummer – höchstens eine', () => {
  const open = (o) => run({ type: 'open', open: o })[0]?.data;
  assert.deepEqual(open({ page: 'finanzen' }), { href: '/finanzen', label: 'Finanzen' });
  assert.deepEqual(open({ page: 'ziele' }), { href: '/aufgaben?ansicht=ziele', label: 'Ziele' });
  assert.deepEqual(open({ customer_name: 'Anna Schmidt' }), { href: '/kunden/c2', label: 'Kunde Anna Schmidt' });
  assert.deepEqual(open({ customer_name: 'Peter Müller', order_title: 'Hecke' }), {
    href: '/auftraege/o1',
    label: 'Auftrag „Hecke schneiden“',
  });
  assert.deepEqual(open({ ref: 'E1' }), { href: '/finanzen/ausgabe/e1', label: 'Ausgabe „Canva Pro“' });
  assert.deepEqual(open({ ref: 'p1' }), { href: '/social/p1', label: 'Post „3 Fehler beim Gründen“' });
  assert.equal(open({ page: 'gibtsnicht' }), undefined);
  const two = run({ type: 'open', open: { page: 'kunden' } }, { type: 'open', open: { page: 'termine' } });
  assert.equal(two.length, 1);
  assert.equal(proposalLabel(two[0]), 'Kunden öffnen');
});

test('Reihenfolge: Firmendaten vor der Rechnung, Änderungen nach dem Anlegen, Öffnen zuletzt', () => {
  const at = (k) => EXECUTION_ORDER.indexOf(k);
  assert.ok(at('company_change') < at('document'));
  assert.ok(at('customer') < at('customer_change'));
  assert.ok(at('order') < at('order_change'));
  assert.ok(at('expense') < at('expense_change'));
  assert.ok(at('post') < at('post_change'));
  assert.ok(at('goal') < at('goal_change'));
  assert.equal(EXECUTION_ORDER.at(-1), 'open');
  // jede Art kommt genau einmal vor
  assert.equal(new Set(EXECUTION_ORDER).size, EXECUTION_ORDER.length);
});
