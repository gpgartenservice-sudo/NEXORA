// Unit-Tests: Übersicht, die Luna mitbekommt. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNexyContext, nexyExpenses, nexyPosts } from '../../src/features/assistant/nexy-context.ts';
import { EMPTY_SELLER } from '../../src/features/documents/document-logic.ts';

const TODAY = new Date(2026, 10, 3, 12);
const seller = { ...EMPTY_SELLER, company_name: 'Lena Design', owner_name: 'Lena', iban: 'DE89 3704', tax_number: '1', street: 'A 1', zip: '1', city: 'B' };
const customers = [{ id: 'c1', name: 'Peter Müller', company: null, phone: '0171', email: 'p@x.de', address: 'Geheimweg 1' }];
const orders = [
  { id: 'o1', title: 'Website', customer_id: 'c1', price: 1500, billing: 'once', completed: true, execution_at: '2026-11-02T10:00:00Z', updated_at: '2026-11-02T10:00:00Z', created_at: '2026-10-01T10:00:00Z', discount_percent: 0 },
  { id: 'o2', title: 'Pflege', customer_id: 'c1', price: 100, billing: 'monthly', contract_start: '2026-09-01', completed: false, updated_at: '2026-10-02T10:00:00Z', discount_percent: 0 },
];
const doc = (o) => ({ id: 'd', order_id: 'o1', kind: 'invoice', number: 'RE-2026-0001', issued_on: '2026-10-01', due_on: '2026-10-15', total: 1500, paid_at: null, data: { buyer: { name: 'Peter Müller' } }, ...o });

test('Übersicht: Firma, Kunden ohne Kontaktdaten, Aufträge mit Status und Dokumenten', () => {
  const c = buildNexyContext({ seller, customers, orders, documents: [doc()], expenses: [{ amount: 12, spent_on: '2026-01-01', repeat: 'monthly', ends_on: null }], posts: [], today: TODAY });
  assert.equal(c.firma.name, 'Lena Design');
  assert.deepEqual(c.firma.fehlt_fuer_rechnungen, []);
  assert.deepEqual(c.kunden, [{ name: 'Peter Müller', auftraege: 2 }]);
  const json = JSON.stringify(c);
  assert.ok(!json.includes('0171') && !json.includes('p@x.de') && !json.includes('Geheimweg'), 'keine Kontaktdaten');
  assert.equal(c.auftraege[0].titel, 'Website');
  assert.equal(c.auftraege[0].status, 'Abgeschlossen');
  assert.deepEqual(c.auftraege[0].dokumente, ['RE-2026-0001']);
  assert.deepEqual(c.offene_rechnungen, [{ nummer: 'RE-2026-0001', kunde: 'Peter Müller', betrag: 1500, faellig: '2026-10-15', ueberfaellig: true }]);
});

test('Übersicht: Finanzzahlen dieser/letzter Monat, Fixkosten', () => {
  const c = buildNexyContext({ seller, customers, orders, documents: [], expenses: [{ amount: 12, spent_on: '2026-01-01', repeat: 'monthly', ends_on: null }], posts: [], today: TODAY });
  assert.deepEqual(c.finanzen.dieser_monat, { income: 1500, expenses: 12, profit: 1488 });
  assert.deepEqual(c.finanzen.letzter_monat, { income: 100, expenses: 12, profit: 88 });
  assert.equal(c.finanzen.fixkosten_pro_monat, 12);
});

test('Übersicht bleibt bei vielen Einträgen unter der Größengrenze', () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, name: `Kunde Nummer ${i} mit einem langen Namen`, company: `Firma ${i} GmbH & Co. KG` }));
  const manyOrders = Array.from({ length: 300 }, (_, i) => ({ id: `o${i}`, title: `Auftrag ${i} mit ausführlicher Bezeichnung`, customer_id: `c${i}`, price: 100, billing: 'once', updated_at: '2026-10-01T10:00:00Z' }));
  const c = buildNexyContext({ seller, customers: many, orders: manyOrders, documents: [], expenses: [], posts: [], today: TODAY });
  assert.ok(JSON.stringify(c).length <= 26000, String(JSON.stringify(c).length));
  assert.ok(c.kunden.length >= 10 && c.auftraege.length >= 10);
});

test('Übersicht: verbundene Social-Konten mit Followern', () => {
  const c = buildNexyContext({
    seller,
    customers: [],
    orders: [],
    documents: [],
    expenses: [],
    posts: [],
    accounts: [{ platform: 'tiktok', username: 'lena.design', followers: 1520, likes: 23400, media_count: 41, growth7: 34 }],
    today: TODAY,
  });
  assert.deepEqual(c.social.verbundene_konten, [
    { plattform: 'TikTok', name: 'lena.design', follower: 1520, follower_plus_7_tage: 34, likes_gesamt: 23400, beitraege: 41 },
  ]);
  assert.deepEqual(buildNexyContext({ seller, customers: [], orders: [], documents: [], expenses: [], posts: [], today: TODAY }).social.verbundene_konten, []);
});

test('Übersicht: nächste Termine', () => {
  const c = buildNexyContext({ seller, customers: [], orders: [], documents: [], expenses: [], posts: [], upcoming: [{ wann: 'Do., 05.11., 09:00', art: 'Erstgespräch', was: 'Hecke schneiden', kunde: 'Peter Müller' }], today: TODAY });
  assert.equal(c.termine[0].was, 'Hecke schneiden');
  assert.deepEqual(buildNexyContext({ seller, customers: [], orders: [], documents: [], expenses: [], posts: [], today: TODAY }).termine, []);
});

test('Übersicht: Termine der Aufträge (lokale Zeit) für order_dates', () => {
  const c = buildNexyContext({ seller, customers, orders: [{ ...orders[1], meeting_at: '2026-11-05T09:30:00' }], documents: [], expenses: [], posts: [], today: TODAY });
  assert.equal(c.auftraege[0].erstgespraech, '2026-11-05T09:30'); // lokale Zeit
  assert.equal(c.auftraege[0].ausfuehrung, undefined);
});

test('Übersicht: Mahnstand offener Rechnungen', () => {
  const c = buildNexyContext({
    seller,
    customers,
    orders,
    documents: [doc({ id: 'd1', due_on: '2026-10-15' })],
    expenses: [],
    posts: [],
    followups: [
      { document_id: 'd1', kind: 'reminder', sent_on: '2026-10-20', new_due_on: '2026-10-27' },
      { document_id: 'd1', kind: 'dunning1', sent_on: '2026-10-29', new_due_on: '2026-11-05' },
      { document_id: 'd1', kind: 'review', sent_on: '2026-10-30', new_due_on: null },
    ],
    today: TODAY,
  });
  assert.equal(c.offene_rechnungen[0].mahnstufe, '1. Mahnung');
  assert.equal(c.offene_rechnungen[0].neue_frist, '2026-11-05');
  assert.equal(c.offene_rechnungen[0].gemahnt_am, '2026-10-29');
});

test('Übersicht: Steuer-Orientierung (Rücklage, Kleinunternehmer-Grenze bzw. Umsatzsteuer)', () => {
  const expenses = [{ amount: 12, spent_on: '2026-01-01', repeat: 'monthly', ends_on: null }];
  const klein = buildNexyContext({ seller: { ...seller, small_business: true }, customers, orders, documents: [doc()], expenses, posts: [], taxPercent: 30, today: TODAY });
  const jahr = klein.finanzen.dieses_jahr;
  assert.equal(klein.steuern.kleinunternehmer, true);
  assert.equal(klein.steuern.ruecklage_prozent_vom_gewinn, 30);
  assert.equal(klein.steuern.ruecklage_empfohlen_dieses_jahr, Math.round(jahr.profit * 30) / 100);
  assert.equal(klein.steuern.umsatz_dieses_jahr, jahr.income);
  assert.equal(klein.steuern.kleinunternehmer_grenze, 25000);
  assert.match(klein.steuern.grenze_stand, /grünen Bereich/);
  assert.equal(klein.steuern.umsatzsteuer_zahllast_geschaetzt, undefined);

  const invoice = doc({ data: { buyer: { name: 'Peter Müller' }, totals: { net: 1260.5, vat_rate: 19, vat_amount: 239.5, gross: 1500 }, small_business: false } });
  const regel = buildNexyContext({ seller: { ...seller, small_business: false }, customers, orders, documents: [invoice], expenses: [{ ...expenses[0], vat_amount: 2 }], posts: [], today: TODAY });
  assert.equal(regel.steuern.ruecklage_prozent_vom_gewinn, 25);
  assert.equal(regel.steuern.umsatzsteuer_ausgewiesen, 239.5);
  assert.equal(regel.steuern.vorsteuer_erfasst, 22); // 11 Monate × 2 €
  assert.equal(regel.steuern.umsatzsteuer_zahllast_geschaetzt, 217.5);
  assert.equal(regel.steuern.kleinunternehmer_grenze, undefined);
});

test('Ausgaben und Posts mit Kurzzeichen: Abos zuerst bzw. zuletzt bearbeitet zuerst', () => {
  const e = nexyExpenses([
    { id: 'a', title: 'Flyer', amount: 49.9, category: 'marketing', repeat: 'once', spent_on: '2026-11-02', ends_on: null },
    { id: 'b', title: 'Canva', amount: 11.99, category: 'software', repeat: 'monthly', spent_on: '2026-01-05', ends_on: '2026-12-31' },
    { id: 'c', title: 'Bohrer', amount: 89, category: 'tools', repeat: 'once', spent_on: '2026-10-01', ends_on: null },
  ]);
  assert.deepEqual(e.refs, { E1: 'b', E2: 'a', E3: 'c' });
  assert.deepEqual(e.entries[0], {
    ref: 'E1',
    titel: 'Canva',
    betrag: 11.99,
    wie_oft: 'monatlich',
    kategorie: 'Software & Abos',
    seit: '2026-01-05',
    bis: '2026-12-31',
  });
  assert.equal(e.entries[1].datum, '2026-11-02');
  assert.deepEqual(e.list.map((x) => x.id), ['b', 'a', 'c']);

  const p = nexyPosts([
    { id: 'p1', title: 'Alt', format: 'video', planned_for: null, published_at: null, updated_at: '2026-10-01T10:00:00Z' },
    { id: 'p2', title: 'Neu', format: 'image', step_concept: true, step_produced: true, step_edited: true, step_caption: true, planned_for: null, published_at: null, updated_at: '2026-11-01T10:00:00Z' },
  ]);
  assert.deepEqual(p.refs, { P1: 'p2', P2: 'p1' });
  assert.equal(p.entries[0].status, 'Bereit');
  assert.equal(p.entries[1].format, 'Video');
});
