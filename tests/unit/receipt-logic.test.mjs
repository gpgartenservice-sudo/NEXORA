// Unit-Tests: Belege. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { possibleDuplicate, receiptPath, receiptToDraft } from '../../src/features/finance/receipt-logic.ts';

const TODAY = '2026-11-04';
const r = (o) => ({
  is_receipt: true,
  merchant: 'Hornbach',
  title: 'Baumarkt: Schrauben und Farbe',
  amount: 49.9,
  date: '2026-11-02',
  category: 'material',
  repeat: 'once',
  vat_rate: 19,
  vat_amount: 7.97,
  currency: 'EUR',
  note: '',
  ...o,
});

test('Beleg -> Ausgabe: Felder, Notiz mit Händler und USt', () => {
  const { draft, warnings } = receiptToDraft(r(), TODAY);
  assert.deepEqual(draft, {
    title: 'Baumarkt: Schrauben und Farbe',
    amount: 49.9,
    category: 'material',
    repeat: 'once',
    spent_on: '2026-11-02',
    notes: 'Hornbach · darin 7,97 € USt (19 %)',
    vat_amount: 7.97,
  });
  assert.deepEqual(warnings, []);
});

test('Beleg: Abo, unbekannte Kategorie, Titel fehlt', () => {
  const { draft } = receiptToDraft(
    r({ title: '', category: 'essen', repeat: 'monthly', vat_amount: null, vat_rate: null }),
    TODAY,
  );
  assert.equal(draft.title, 'Hornbach');
  assert.equal(draft.category, 'other');
  assert.equal(draft.repeat, 'monthly');
  assert.equal(draft.notes, null);
  assert.equal(draft.vat_amount, null);
  // Umsatzsteuer nicht kleiner als der Betrag -> nicht übernehmen
  assert.equal(receiptToDraft(r({ amount: 10, vat_amount: 12 }), TODAY).draft.vat_amount, null);
});

test('Beleg: unsicher -> Hinweise', () => {
  const { draft, warnings } = receiptToDraft(
    r({ amount: null, date: '2026-02-30', note: 'Betrag schlecht lesbar' }),
    TODAY,
  );
  assert.equal(draft.amount, null);
  assert.equal(draft.spent_on, null);
  assert.deepEqual(warnings, [
    'Betrag schlecht lesbar',
    'Den Betrag konnte ich nicht sicher lesen – bitte eintragen.',
    'Das Datum konnte ich nicht lesen – bitte prüfen.',
  ]);
  assert.ok(
    receiptToDraft(r({ date: '2026-12-01' }), TODAY).warnings.includes(
      'Das Datum liegt in der Zukunft – bitte prüfen.',
    ),
  );
  assert.ok(receiptToDraft(r({ currency: 'usd' }), TODAY).warnings[0].includes('USD'));
  assert.equal(receiptToDraft(r({ amount: -5 }), TODAY).draft.amount, null);
});

test('Kein Beleg / leere Antwort', () => {
  assert.deepEqual(receiptToDraft(r({ is_receipt: false, note: 'Das ist ein Foto einer Katze.' }), TODAY), {
    draft: null,
    warnings: ['Das ist ein Foto einer Katze.'],
  });
  assert.equal(receiptToDraft(null, TODAY).draft, null);
  assert.equal(receiptToDraft(null, TODAY).warnings.length, 1);
});

test('Speicherpfad und doppelte Belege', () => {
  assert.equal(receiptPath('u1', 'f1', 'image/jpeg'), 'u1/f1.jpg');
  assert.equal(receiptPath('u1', 'f1', 'application/pdf'), 'u1/f1.pdf');
  assert.equal(receiptPath('u1', 'f1', 'image/png'), 'u1/f1.png');
  const list = [{ id: 'e1', title: 'Baumarkt', amount: 49.9, spent_on: '2026-11-01' }];
  assert.equal(possibleDuplicate(list, 49.9, '2026-11-03')?.id, 'e1');
  assert.equal(possibleDuplicate(list, 49.9, '2026-11-06'), null); // 5 Tage
  assert.equal(possibleDuplicate(list, 49.91, '2026-11-01'), null);
  assert.equal(possibleDuplicate(list, 49.9, '2026-11-01', 'e1'), null);
  assert.equal(possibleDuplicate(list, null, '2026-11-01'), null);
});
