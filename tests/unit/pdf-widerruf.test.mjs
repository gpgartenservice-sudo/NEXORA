// Unit-Tests: Widerrufsbelehrung + Muster-Widerrufsformular im Angebots-PDF für Privatkunden. Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream } from 'pdf-lib';

import {
  computeTotals,
  EMPTY_SELLER,
  ONLINE_WITHDRAWAL_NOTE,
  earlyStartHint,
  withdrawalNotice,
} from '../../src/features/documents/document-logic.ts';
import {
  hasWithdrawalPage,
  pdfOnlineWithdrawal,
  renderDocumentPdf,
  safe,
  withdrawalPointer,
} from '../../src/features/documents/pdf.ts';

const SELLER = {
  ...EMPTY_SELLER,
  company_name: 'Max Muster Gartenservice',
  owner_name: 'Max Müller',
  street: 'Musterweg 1',
  zip: '12345',
  city: 'Musterstadt',
  phone: '0123 456',
  email: 'max@example.com',
  tax_number: '12/345/67890',
  iban: 'DE02120300000000202051',
  small_business: false,
};
const PRIVATE = { name: 'Erika Beispiel', company: null, address: 'Lindenstraße 5, 12345 Musterstadt', email: 'erika@example.com' };
const BUSINESS = { ...PRIVATE, company: 'Muster GmbH' };
const ITEM = { description: 'Heckenschnitt', details: 'inkl. Entsorgung', quantity: 1, unit: 'pauschal', unit_price: 320 };

function doc({ kind = 'offer', buyer = PRIVATE, items = [ITEM], extra = { public_token: 'A'.repeat(43) } } = {}) {
  return {
    kind,
    number: kind === 'offer' ? 'AN-2026-0003' : 'RE-2026-0003',
    issued_on: '2026-11-22',
    due_on: '2026-12-22',
    ...extra,
    data: {
      kind,
      seller: SELLER,
      buyer,
      items,
      totals: computeTotals(items, 0, false, 19),
      small_business: false,
      service_date: kind === 'invoice' ? '2026-11-20' : null,
      service_period: null,
      monthly: false,
    },
  };
}

// WinAnsi-Bytes 0x80–0x9F, die im PDF vorkommen (Rest = Latin-1)
const WIN_ANSI = { 0x80: '€', 0x84: '„', 0x85: '…', 0x93: '“', 0x94: '”', 0x96: '–', 0x97: '—' };

/** Text jeder Seite (pdf-lib schreibt Standardschrift als <hex> Tj); Zeilen mit Leerzeichen verbunden. */
async function pagesText(bytes) {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((page) => {
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
    const parts = [];
    for (const stream of streams) {
      const raw = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents();
      const ops = new TextDecoder('latin1').decode(raw);
      for (const [, hex] of ops.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
        let s = '';
        for (let i = 0; i < hex.length; i += 2) {
          const c = parseInt(hex.slice(i, i + 2), 16);
          s += WIN_ANSI[c] ?? String.fromCharCode(c);
        }
        parts.push(s);
      }
    }
    return parts.join(' ');
  });
}

test('Privatkunden-Angebot: eine Seite mehr mit Belehrung und Muster-Formular', async () => {
  const priv = await pagesText(await renderDocumentPdf(doc()));
  const biz = await pagesText(await renderDocumentPdf(doc({ buyer: BUSINESS })));
  assert.equal(priv.length, biz.length + 1);
  const last = priv.at(-1);
  assert.match(last, /Widerrufsbelehrung/);
  assert.match(last, /Muster-Widerrufsformular/);
  assert.match(last, /Anlage zum Angebot AN-2026-0003 vom 22\.11\.2026/);
  // Wortlaut wie auf der Angebotsseite (Zeilenumbrüche = Leerzeichen)
  for (const p of withdrawalNotice(SELLER).flatMap((s) => s.paragraphs)) assert.ok(last.includes(p), p.slice(0, 50));
  assert.ok(last.includes(earlyStartHint(SELLER)));
  assert.ok(last.includes('– An Max Muster Gartenservice, Musterweg 1, 12345 Musterstadt, E-Mail max@example.com:'));
  assert.ok(last.includes('(*) Unzutreffendes streichen.'));
  // Verweis unter den Summen
  assert.ok(priv[0].includes(withdrawalPointer(2)));
  assert.equal(withdrawalPointer(2), 'Widerrufsbelehrung und Muster-Widerrufsformular: siehe Seite 2.');
  // Firmenkunden: nichts davon
  assert.ok(!biz.join(' ').includes('Widerrufsbelehrung'));
  assert.ok(!biz.join(' ').includes('Muster-Widerrufsformular'));
});

test('Rechnungen bekommen keine Widerrufsseite – auch nicht an Privatkunden', async () => {
  const priv = await pagesText(await renderDocumentPdf(doc({ kind: 'invoice' })));
  const biz = await pagesText(await renderDocumentPdf(doc({ kind: 'invoice', buyer: BUSINESS })));
  assert.equal(priv.length, biz.length);
  assert.ok(!priv.join(' ').includes('Widerrufsbelehrung'));
});

test('Online-Satz nur, wenn der Kunde den Link hat (unbekannt = mit Satz)', async () => {
  const withLink = (await pagesText(await renderDocumentPdf(doc()))).at(-1);
  const noLink = (await pagesText(await renderDocumentPdf(doc({ extra: { public_token: null } })))).at(-1);
  const unknown = (await pagesText(await renderDocumentPdf(doc({ extra: {} })))).at(-1);
  assert.ok(withLink.includes(ONLINE_WITHDRAWAL_NOTE));
  assert.ok(unknown.includes(ONLINE_WITHDRAWAL_NOTE));
  assert.ok(!noLink.includes('online unter dem Link'));
  assert.ok(noLink.includes('das jedoch nicht vorgeschrieben ist. Zur Wahrung der Widerrufsfrist'));

  assert.equal(pdfOnlineWithdrawal({}), true);
  assert.equal(pdfOnlineWithdrawal({ public_token: 'A'.repeat(43) }), true);
  assert.equal(pdfOnlineWithdrawal({ public_token: null }), false);
  assert.equal(pdfOnlineWithdrawal({ public_token: ' ' }), false);
});

test('withdrawalNotice: ohne Online-Satz nur auf Wunsch, sonst Wortlaut unverändert', () => {
  const full = withdrawalNotice(SELLER);
  assert.deepEqual(withdrawalNotice(SELLER, true), full);
  assert.ok(full[0].paragraphs[2].endsWith(`das jedoch nicht vorgeschrieben ist. ${ONLINE_WITHDRAWAL_NOTE}`));
  const offline = withdrawalNotice(SELLER, false);
  assert.ok(offline[0].paragraphs[2].endsWith('das jedoch nicht vorgeschrieben ist.'));
  assert.ok(!offline[0].paragraphs[2].includes('Online-Funktion'));
  // alles andere bleibt gleich
  assert.deepEqual(
    offline.map((s) => s.paragraphs.filter((_, i) => s.heading !== 'Widerrufsrecht' || i !== 2)),
    full.map((s) => s.paragraphs.filter((_, i) => s.heading !== 'Widerrufsrecht' || i !== 2)),
  );
});

test('Wer bekommt die Seite? Privatkunde = ohne Firmenname', () => {
  const d = (kind, company) => ({ kind, data: { buyer: { ...PRIVATE, company } } });
  assert.equal(hasWithdrawalPage(d('offer', null)), true);
  assert.equal(hasWithdrawalPage(d('offer', '   ')), true);
  assert.equal(hasWithdrawalPage(d('offer', 'Muster GmbH')), false);
  assert.equal(hasWithdrawalPage(d('invoice', null)), false);
});

test('Langes Angebot: Verweis nennt die richtige Seite', async () => {
  const items = Array.from({ length: 14 }, (_, i) => ({ ...ITEM, description: `Position ${i + 1}` }));
  const pages = await pagesText(await renderDocumentPdf(doc({ items })));
  const biz = await pagesText(await renderDocumentPdf(doc({ items, buyer: BUSINESS })));
  assert.equal(biz.length, 2);
  assert.equal(pages.length, 3);
  assert.ok(pages[1].includes(withdrawalPointer(3)));
  assert.match(pages[2], /^Widerrufsbelehrung/);
});

test('Anführungszeichen und Gedankenstrich bleiben im PDF erhalten', () => {
  assert.equal(safe('„Vertrag widerrufen“ – § 355 BGB, Übermann'), '„Vertrag widerrufen“ – § 355 BGB, Übermann');
});
