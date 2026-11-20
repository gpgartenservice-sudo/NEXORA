// Unit-Tests: mehrere Firmen in einem Konto. Start: npm run test:unit
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  canAddCompany,
  chooseCompany,
  companyErrorText,
  parseCompanies,
} from '../../src/features/companies/company-logic.ts';
import { COMPARISON, EXTRA_COMPANY_PRICE, formatPrice } from '../../src/features/plan/plan-logic.ts';

const A = 'aaaaaaaa-0000-0000-0000-000000000000';
const X = 'bbbbbbbb-0000-0000-0000-000000000000';
const T = 'cccccccc-0000-0000-0000-000000000000';

const raw = (o = {}) => ({
  default_id: A,
  extra_allowed: 1,
  extra_used: 1,
  companies: [
    { id: A, name: 'Grau Gartenservice', primary: true, role: 'owner' },
    { id: X, name: 'Lunaxora GbR', primary: false, role: 'owner' },
    { id: T, name: '  ', primary: true, role: 'member' },
  ],
  ...o,
});

test('parseCompanies liest die Antwort der Datenbank', () => {
  const c = parseCompanies(raw());
  assert.equal(c.defaultId, A);
  assert.equal(c.extraAllowed, 1);
  assert.equal(c.extraUsed, 1);
  assert.deepEqual(c.list.map((x) => x.id), [A, X, T]);
  assert.equal(c.list[2].name, 'Firma ohne Namen');
  assert.equal(c.list[2].role, 'member');
  assert.equal(parseCompanies(null), null);
  assert.equal(parseCompanies({ companies: [] }), null);
  assert.equal(parseCompanies(raw({ extra_allowed: -3, extra_used: 'x' })).extraAllowed, 0);
  assert.deepEqual(parseCompanies(raw({ companies: [null, { name: 'ohne id' }] })).list, []);
});

test('chooseCompany: gewünschte Firma nur, solange man dazugehört', () => {
  const c = parseCompanies(raw());
  assert.deepEqual(chooseCompany(c, X, A), { id: X, header: X });
  assert.deepEqual(chooseCompany(c, null, A), { id: A, header: null });
  assert.deepEqual(chooseCompany(c, A, A), { id: A, header: null }, 'Standard-Firma ohne Kopfzeile');
  assert.deepEqual(chooseCompany(c, 'weg', A), { id: A, header: null }, 'nicht mehr dabei -> Standard');
  assert.deepEqual(chooseCompany(parseCompanies(raw({ default_id: T })), null, A), { id: T, header: null }, 'Teammitglied: Standard = Team');
});

test('chooseCompany offline / ohne Skript: gemerkte Firma oder gar keine Kopfzeile', () => {
  assert.deepEqual(chooseCompany(null, X, A), { id: X, header: X });
  assert.deepEqual(chooseCompany(null, null, A), { id: A, header: null });
});

test('canAddCompany: nur mit freier gebuchter Firma', () => {
  assert.equal(canAddCompany(parseCompanies(raw())), false);
  assert.equal(canAddCompany(parseCompanies(raw({ extra_allowed: 2 }))), true);
  assert.equal(canAddCompany(null), false);
});

test('Fehlertexte', () => {
  assert.match(companyErrorText('company_limit'), /dazugebucht/);
  assert.match(companyErrorText('invalid_name'), /Namen/);
  assert.match(companyErrorText('boom'), /Technische Details: boom/);
});

test('Preis weitere Firma: 9,99 € im Monat, Jahr = 10 Monate, in Vergleich und Datenbank gleich', () => {
  assert.equal(formatPrice(EXTRA_COMPANY_PRICE.month).replace(/\s/g, ' '), '9,99 €');
  assert.equal(Math.round(EXTRA_COMPANY_PRICE.year * 100), 10 * Math.round(EXTRA_COMPANY_PRICE.month * 100));
  const row = COMPARISON.find((r) => r.label.startsWith('Weitere Firma'));
  assert.deepEqual([row.free, row.pro, row.business], [false, '9,99 €', '9,99 €']);
  const sql = readFileSync(new URL('../../supabase/migrations/20261127090000_mehrere_firmen.sql', import.meta.url), 'utf8');
  assert.match(sql, /9,99 €/);
  assert.match(sql, /x-lunaxora-company/);
});

test('companyFetch: Firma nur an Datenbank und Funktionen, nie an Anmeldung/Speicher', async () => {
  const { COMPANY_HEADER, companyFetch, setCompanyHeader } = await import('../../src/lib/company-header.ts');
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response('{}');
  };
  try {
    const base = 'https://x.supabase.co';
    setCompanyHeader(null);
    await companyFetch(`${base}/rest/v1/customers`, { headers: { apikey: 'k' } });
    assert.equal(seen.at(-1).headers.get(COMPANY_HEADER), null, 'ohne Auswahl keine Kopfzeile');

    setCompanyHeader(X);
    await companyFetch(`${base}/rest/v1/rpc/my_plan`, { method: 'POST', headers: { apikey: 'k', Authorization: 'Bearer t' } });
    assert.equal(seen.at(-1).headers.get(COMPANY_HEADER), X);
    assert.equal(seen.at(-1).headers.get('authorization'), 'Bearer t', 'andere Kopfzeilen bleiben');
    await companyFetch(`${base}/functions/v1/assistant`, { headers: new Headers({ apikey: 'k' }) });
    assert.equal(seen.at(-1).headers.get(COMPANY_HEADER), X);
    await companyFetch(`${base}/auth/v1/token?grant_type=refresh_token`, { headers: { apikey: 'k' } });
    assert.equal(seen.at(-1).headers.get(COMPANY_HEADER), null, 'Anmeldung ohne Firma');
    await companyFetch(`${base}/storage/v1/object/receipts/a.jpg`, {});
    assert.equal(seen.at(-1).headers.get(COMPANY_HEADER), null, 'Speicher ohne Firma');
  } finally {
    setCompanyHeader(null);
    globalThis.fetch = original;
  }
});
