// Unit-Tests: Steuer-Überblick. Start: npm run test:unit
process.env.TZ = 'Europe/Berlin';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  expenseOccurrences,
  expensesByCategory,
  expensesCsv,
  invoiceFigures,
  invoicesCsv,
  receiptFileName,
  smallBusinessCheck,
  taxReserve,
  vatSummary,
  yearMonths,
  yearTotals,
} from '../../src/features/finance/tax-logic.ts';

const n = (s) => s.replace(/ /g, ' ');
const TODAY = new Date(2026, 10, 4, 12);

test('Monate des Jahres: laufendes Jahr bis heute', () => {
  assert.equal(yearMonths(2026, TODAY).length, 11);
  assert.equal(yearMonths(2025, TODAY).length, 12);
  assert.deepEqual(yearMonths(2027, TODAY), []);
});

test('Jahr: Einnahmen, Ausgaben, Gewinn (wie Finanzen)', () => {
  const orders = [
    { price: 1200, billing: 'once', completed: true, completed_on: '2026-03-02', execution_at: '2026-03-02T09:00:00Z' },
    { price: 800, billing: 'once', completed: true, completed_on: '2025-12-02', execution_at: '2025-12-02T09:00:00Z' },
  ];
  const expenses = [{ amount: 100, spent_on: '2026-02-01', repeat: 'once', ends_on: null }];
  assert.deepEqual(yearTotals(orders, expenses, 2026, TODAY), { income: 1200, expenses: 100, profit: 1100 });
  assert.equal(yearTotals(orders, expenses, 2025, TODAY).income, 800);
});

test('Kleinunternehmer-Grenze', () => {
  const ok = smallBusinessCheck(12000, 10000, 2026);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.ratio, 0.48);
  assert.equal(ok.left, 13000);
  assert.equal(smallBusinessCheck(21000, 10000, 2026).status, 'near');
  assert.match(n(smallBusinessCheck(21000, 10000, 2026).message), /ab 2027 kein Kleinunternehmer/);
  const over = smallBusinessCheck(26000, 10000, 2026);
  assert.equal(over.status, 'over_next_year');
  assert.equal(over.ratio, 1);
  assert.match(over.message, /1\. Januar 2027/);
  assert.equal(smallBusinessCheck(101000, 10000, 2026).status, 'over_now');
  assert.equal(smallBusinessCheck(5000, 30000, 2026).status, 'prev_over');
  assert.match(smallBusinessCheck(5000, 30000, 2026).message, /2025 lag über/);
});

test('Steuer-Topf: Prozent vom Gewinn, USt nur bei Regelbesteuerung', () => {
  assert.deepEqual(taxReserve({ profit: 10000, percent: 25, smallBusiness: true, vatPayable: 500 }), {
    incomeTax: 2500,
    vat: 0,
    total: 2500,
    percent: 25,
  });
  assert.deepEqual(taxReserve({ profit: 10000, percent: 30, smallBusiness: false, vatPayable: 900 }), {
    incomeTax: 3000,
    vat: 900,
    total: 3900,
    percent: 30,
  });
  assert.equal(taxReserve({ profit: -500, percent: 25, smallBusiness: true, vatPayable: 0 }).total, 0);
  assert.equal(taxReserve({ profit: 1000, percent: 99, smallBusiness: true, vatPayable: 0 }).percent, 60);
});

const docs = [
  {
    kind: 'invoice',
    number: 'RE-2026-0002',
    issued_on: '2026-05-10',
    total: 238,
    paid_at: '2026-05-20T10:00:00Z',
    data: {
      buyer: { name: 'Peter Müller', company: null },
      totals: { net: 200, vat_rate: 19, vat_amount: 38, gross: 238 },
      small_business: false,
    },
  },
  {
    kind: 'invoice',
    number: 'RE-2026-0001',
    issued_on: '2026-03-01',
    total: 119,
    paid_at: null,
    data: {
      buyer: { name: 'Anna', company: 'Schmidt; Bau "GmbH"' },
      totals: { net: 100, vat_rate: 19, vat_amount: 19, gross: 119 },
      small_business: false,
    },
  },
  {
    kind: 'invoice',
    number: 'RE-2025-0009',
    issued_on: '2025-12-20',
    total: 119,
    paid_at: null,
    data: {
      buyer: { name: 'X' },
      totals: { net: 100, vat_rate: 19, vat_amount: 19, gross: 119 },
      small_business: false,
    },
  },
  {
    kind: 'offer',
    number: 'AN-2026-0001',
    issued_on: '2026-03-01',
    total: 500,
    paid_at: null,
    data: {
      buyer: { name: 'Y' },
      totals: { net: 500, vat_rate: 19, vat_amount: 95, gross: 595 },
      small_business: false,
    },
  },
];
const expenses = [
  {
    id: 'e1',
    title: 'Canva Pro',
    category: 'software',
    amount: 11.99,
    spent_on: '2026-09-15',
    repeat: 'monthly',
    ends_on: null,
    vat_amount: 1.91,
    receipt_path: 'u/f.pdf',
  },
  {
    id: 'e2',
    title: 'Baumarkt',
    category: 'material',
    amount: 119,
    spent_on: '2026-04-02',
    repeat: 'once',
    ends_on: null,
    vat_amount: 19,
    notes: 'Hornbach',
  },
  {
    id: 'e3',
    title: 'Versicherung',
    category: 'insurance',
    amount: 240,
    spent_on: '2025-01-31',
    repeat: 'yearly',
    ends_on: null,
  },
];

test('Ausgaben im Jahr: wiederkehrende je Zahlung (Monatsende beachtet)', () => {
  assert.deepEqual(
    expenseOccurrences(expenses[0], 2026, TODAY).map((o) => o.day),
    ['2026-09-15', '2026-10-15', '2026-11-15'],
  );
  assert.equal(expenseOccurrences(expenses[0], 2026, TODAY)[0].vat, 1.91);
  assert.deepEqual(expenseOccurrences(expenses[2], 2026, TODAY), [{ day: '2026-01-31', amount: 240, vat: 0 }]);
  const feb = expenseOccurrences({ ...expenses[0], spent_on: '2026-01-31' }, 2026, TODAY);
  assert.equal(feb[1].day, '2026-02-28');
});

test('Umsatzsteuer: Rechnungen des Jahres minus Vorsteuer', () => {
  const v = vatSummary(docs, expenses, 2026, TODAY);
  assert.equal(v.collected, 57);
  assert.equal(v.input, 24.73); // 19 + 3 × 1,91
  assert.equal(v.payable, 32.27);
});

test('CSV für die Steuerberatung (Excel-tauglich)', () => {
  const inv = invoicesCsv(docs, 2026);
  assert.ok(inv.startsWith('﻿Rechnungsnummer;Rechnungsdatum;Kunde;Netto'));
  const lines = inv.trim().split('\r\n');
  assert.equal(lines.length, 3); // Kopf + 2 Rechnungen 2026, sortiert
  assert.equal(lines[1], 'RE-2026-0001;01.03.2026;"Schmidt; Bau ""GmbH""";100,00;19 %;19,00;119,00;');
  assert.equal(lines[2], 'RE-2026-0002;10.05.2026;Peter Müller;200,00;19 %;38,00;238,00;20.05.2026');
  const ex = expensesCsv(expenses, 2026, TODAY, (e) => `${e.id}.pdf`)
    .trim()
    .split('\r\n');
  assert.equal(ex[0], 'Datum;Wofür;Kategorie;Betrag (brutto);darin USt;Wiederkehrend;Beleg;Notiz');
  assert.equal(ex[1], '31.01.2026;Versicherung;Versicherungen;240,00;;jährlich;;');
  assert.equal(ex[2], '02.04.2026;Baumarkt;Material & Waren;119,00;19,00;;;Hornbach');
  assert.equal(ex[3], '15.09.2026;Canva Pro;Software & Abos;11,99;1,91;monatlich;e1.pdf;');
  assert.equal(ex.length, 6);
});

test('Ausgaben je Kategorie, Belegname', () => {
  assert.deepEqual(
    expensesByCategory(expenses, 2026, TODAY).map((c) => [c.category, c.amount]),
    [
      ['insurance', 240],
      ['material', 119],
      ['software', 35.97],
    ],
  );
  assert.equal(
    receiptFileName(
      { spent_on: '2026-04-02', title: 'Baumarkt: Schrauben & Farbe (Hornbach)', receipt_path: 'u/x.jpg' },
      0,
    ),
    '2026-04-02_001_Baumarkt_Schrauben_Farbe_Hornbach.jpg',
  );
  assert.equal(
    receiptFileName({ spent_on: '2026-04-02', title: 'Bürobedarf', receipt_path: 'u/x.pdf' }, 11),
    '2026-04-02_012_Buerobedarf.pdf',
  );
});

test('Rechnung mit unvollständigen Daten bricht nichts', () => {
  const old = { kind: 'invoice', number: 'RE-2026-0003', issued_on: '2026-06-01', total: 50, paid_at: null, data: { buyer: { name: 'Alt' } } };
  assert.deepEqual(invoiceFigures(old), { customer: 'Alt', net: 50, vatRate: 0, vat: 0, gross: 50, smallBusiness: false });
  assert.equal(vatSummary([old], [], 2026, TODAY).collected, 0);
  assert.match(invoicesCsv([old], 2026), /RE-2026-0003;01\.06\.2026;Alt;50,00;0 %;0,00;50,00;/);
});
