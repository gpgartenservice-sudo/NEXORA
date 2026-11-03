// Unit-Tests: Zahlungserinnerungen, Mahnungen, Bewertungsbitte. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  dunningHistory,
  dunningState,
  dunningSummary,
  overdueDays,
  reminderFileName,
  reminderText,
  reviewText,
  suggestedDueDate,
  totalFees,
  validReviewUrl,
} from '../../src/features/dunning/dunning-logic.ts';

const seller = {
  company_name: 'Lena Garten',
  owner_name: 'Lena Gründerin',
  street: 'Gartenweg 5',
  zip: '59755',
  city: 'Arnsberg',
  phone: '0171 1',
  email: null,
  website: null,
  tax_number: '1',
  vat_id: null,
  bank_name: 'Sparkasse',
  iban: 'DE89 3704 0044 0532 0130 00',
  bic: 'COBADEFFXXX',
  small_business: true,
  vat_rate: 19,
  payment_days: 14,
  offer_validity_days: 30,
  logo_id: null,
};
const doc = (o) => ({
  id: 'd1',
  kind: 'invoice',
  number: 'RE-2026-0007',
  issued_on: '2026-10-01',
  due_on: '2026-10-15',
  total: 120,
  paid_at: null,
  data: {
    seller,
    buyer: { name: 'Peter Müller', company: null, address: 'Hauptstraße 12', email: null },
    items: [{ description: 'Hecke schneiden', quantity: 1, unit: 'pauschal', unit_price: 120 }],
    totals: { gross: 120 },
  },
  ...o,
});
// Beträge enthalten ein geschütztes Leerzeichen vor dem €-Zeichen
const n = (t) => ({ ...t, body: t.body.replace(/\u00a0/g, ' '), chat: t.chat.replace(/\u00a0/g, ' ') });
const f = (o) => ({
  id: Math.random().toString(36),
  document_id: 'd1',
  fee: 0,
  new_due_on: null,
  sent_on: '2026-10-20',
  created_at: '2026-10-20T10:00:00Z',
  ...o,
});

test('Überfällig: Tage seit Fälligkeit', () => {
  assert.equal(overdueDays(doc({}), '2026-10-15'), 0);
  assert.equal(overdueDays(doc({}), '2026-10-27'), 12);
  assert.equal(overdueDays(doc({ paid_at: 'x' }), '2026-10-27'), 0);
  assert.equal(overdueDays(doc({ due_on: null }), '2026-10-27'), 0);
});

test('Ablauf: nicht fällig -> Erinnerung -> Frist läuft -> 1. Mahnung -> letzte -> Mahnverfahren', () => {
  assert.equal(dunningState(doc({}), [], '2026-10-10').step, 'none');
  let s = dunningState(doc({}), [], '2026-10-20');
  assert.equal(s.step, 'due');
  assert.equal(s.next.kind, 'reminder');
  assert.equal(s.overdue, 5);
  const r = f({ kind: 'reminder', new_due_on: '2026-10-27', sent_on: '2026-10-20' });
  s = dunningState(doc({}), [r], '2026-10-27');
  assert.equal(s.step, 'waiting');
  assert.equal(s.until, '2026-10-27');
  s = dunningState(doc({}), [r], '2026-10-28');
  assert.equal(s.step, 'due');
  assert.equal(s.next.kind, 'dunning1');
  const m1 = f({ kind: 'dunning1', new_due_on: '2026-11-05', sent_on: '2026-10-29' });
  const m2 = f({ kind: 'dunning2', new_due_on: '2026-11-15', sent_on: '2026-11-06' });
  assert.equal(dunningState(doc({}), [m1, r], '2026-11-06').next.kind, 'dunning2');
  assert.equal(dunningState(doc({}), [r, m1, m2], '2026-11-10').step, 'waiting');
  assert.equal(dunningState(doc({}), [r, m1, m2], '2026-11-16').step, 'escalate');
  assert.equal(dunningState(doc({ paid_at: '2026-11-01T10:00:00Z' }), [r], '2026-11-16').step, 'paid');
  assert.equal(dunningState(doc({ kind: 'offer' }), [], '2026-11-16').step, 'none');
  // Bewertungsbitten und andere Rechnungen zählen nicht
  assert.equal(dunningHistory([r, f({ kind: 'review' }), f({ kind: 'reminder', document_id: 'd2' })], 'd1').length, 1);
});

test('Kurztext für Listen', () => {
  assert.equal(
    dunningSummary(dunningState(doc({}), [], '2026-10-16')),
    'überfällig seit 1 Tag – Zahlungserinnerung ist dran',
  );
  assert.equal(
    dunningSummary(dunningState(doc({}), [f({ kind: 'reminder', new_due_on: '2026-10-27' })], '2026-10-21')),
    'Zahlungserinnerung verschickt, Frist bis 27.10.2026',
  );
  assert.equal(dunningSummary({ step: 'none' }), null);
});

test('Gebühren und neue Frist', () => {
  assert.equal(totalFees([f({ fee: 2.5 }), f({ fee: '1.20' })], 3), 6.7);
  assert.equal(suggestedDueDate('reminder', '2026-10-28'), '2026-11-04');
});

test('Texte: Zahlungserinnerung freundlich, mit Frist und Bankverbindung', () => {
  const t = n(
    reminderText({
      kind: 'reminder',
      doc: doc({}),
      history: [],
      fee: 0,
      newDueOn: '2026-11-04',
      customerName: 'Peter Müller',
    }),
  );
  assert.equal(t.subject, 'Zahlungserinnerung – Rechnung RE-2026-0007');
  assert.ok(t.body.startsWith('Guten Tag Peter Müller,'));
  assert.ok(t.body.includes('Rechnung RE-2026-0007 vom 01.10.2026 über 120,00 €'));
  assert.ok(t.body.includes('fällig seit 15.10.2026'));
  assert.ok(t.body.includes('bis zum 04.11.2026'));
  assert.ok(t.body.includes('als gegenstandslos'));
  assert.ok(t.body.includes('IBAN DE89 3704 0044 0532 0130 00'));
  assert.ok(t.body.endsWith('Mit freundlichen Grüßen\nLena Gründerin\nLena Garten\nTel. 0171 1'));
  assert.ok(!t.body.includes('Mahngebühr'));
  assert.equal(t.total, 120);
  assert.ok(t.chat.includes('kurze Erinnerung') && t.chat.endsWith('Viele Grüße, Lena Gründerin'));
});

test('Texte: 1. Mahnung mit Gebühr und Bezug auf die Erinnerung', () => {
  const r = f({ kind: 'reminder', new_due_on: '2026-10-27', sent_on: '2026-10-20' });
  const t = n(reminderText({ kind: 'dunning1', doc: doc({}), history: [r], fee: 2.5, newDueOn: '2026-11-05' }));
  assert.equal(t.subject, '1. Mahnung – Rechnung RE-2026-0007');
  assert.ok(t.body.includes('trotz meiner Zahlungserinnerung vom 20.10.2026'));
  assert.ok(t.body.includes('Zusammen mit einer Mahngebühr von 2,50 € sind damit 122,50 € offen.'));
  assert.ok(t.body.includes('den Gesamtbetrag bis zum 05.11.2026'));
  assert.equal(t.total, 122.5);
});

test('Texte: letzte Mahnung mit Mahnverfahren und allen Gebühren', () => {
  const r = f({ kind: 'reminder', sent_on: '2026-10-20', new_due_on: '2026-10-27' });
  const m1 = f({ kind: 'dunning1', fee: 2.5, sent_on: '2026-10-29', new_due_on: '2026-11-05' });
  const t = n(reminderText({ kind: 'dunning2', doc: doc({}), history: [r, m1], fee: 2.5, newDueOn: '2026-11-13' }));
  assert.equal(t.subject, 'Letzte Mahnung – Rechnung RE-2026-0007');
  assert.ok(t.body.includes('trotz meiner Zahlungserinnerung vom 20.10.2026 und 1. Mahnung vom 29.10.2026'));
  assert.ok(t.body.includes('den Mahngebühren von 5,00 €'));
  assert.ok(t.body.includes('letztmalig'));
  assert.ok(t.body.includes('gerichtliche Mahnverfahren'));
  assert.equal(t.total, 125);
  assert.ok(t.chat.includes('125,00 €'));
});

test('Bewertungsbitte', () => {
  const t = reviewText({ doc: doc({}), reviewUrl: 'https://g.page/r/abc/review', customerName: 'Peter Müller' });
  assert.equal(t.subject, 'Danke für „Hecke schneiden“ – eine kleine Bitte');
  assert.ok(t.body.includes('https://g.page/r/abc/review'));
  assert.ok(t.body.includes('Rechnung RE-2026-0007'));
  assert.ok(t.chat.includes('https://g.page/r/abc/review'));
});

test('Dateiname und Bewertungs-Link', () => {
  assert.equal(reminderFileName('dunning1', doc({})), 'Mahnung_1_RE-2026-0007_Peter_Mueller.pdf');
  assert.equal(reminderFileName('reminder', doc({})), 'Zahlungserinnerung_RE-2026-0007_Peter_Mueller.pdf');
  assert.equal(reminderFileName('dunning2', doc({})), 'Letzte_Mahnung_RE-2026-0007_Peter_Mueller.pdf');
  assert.equal(validReviewUrl('https://g.page/r/abc/review'), true);
  assert.equal(validReviewUrl('http://g.page/r/abc'), false);
  assert.equal(validReviewUrl('javascript:alert(1)'), false);
  assert.equal(validReviewUrl(''), false);
});
