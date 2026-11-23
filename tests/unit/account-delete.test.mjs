// Unit-Tests für die Server-Funktion "account" (Konto löschen, ohne Netz). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { blockedReason, confirmMatches, handleRequest, purgeFolder } from '../../supabase/functions/account/index.ts';

const SB = 'https://projekt.supabase.co';
const USER = '11111111-1111-4111-8111-111111111111';
const EXTRA = '22222222-2222-4222-8222-222222222222';
const ENV = { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x' };

const INFO = {
  subscription: { status: 'canceled', source: 'stripe', tier: 'pro', current_period_end: '2026-12-20T10:00:00Z', running: false, store: false, cancel_pending: false },
  companies: [
    { id: USER, name: 'Grau Gartenservice', primary: true, members: 2 },
    { id: EXTRA, name: 'Zweitfirma', primary: false, members: 0 },
  ],
  team_people: 2,
  memberships: [],
};

/** Fake-Netz: routes = [[Prüfung(url, init), Antwort]], merkt sich jeden Aufruf */
function fakeNet(routes, env = ENV) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    const hit = routes.find(([match]) => match(String(url), init));
    if (!hit) throw new Error(`unerwarteter Aufruf: ${init.method ?? 'GET'} ${url}`);
    const [status, body] = typeof hit[1] === 'function' ? hit[1](String(url), init, calls) : hit[1];
    return new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { calls, deps: { env: (k) => env[k], fetch } };
}
const is = (method, part) => (url, init) => (init.method ?? 'GET') === method && url.includes(part);
const signedIn = [is('GET', '/auth/v1/user'), [200, { id: USER, email: 'Tom@Example.de' }]];
const info = (over = {}) => [is('POST', '/rpc/account_deletion_info'), [200, { ...INFO, ...over }]];
const post = (body, headers = {}) =>
  new Request(`${SB}/functions/v1/account`, {
    method: 'POST',
    headers: { Authorization: 'Bearer user-jwt', apikey: 'sb_publishable_x', 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** Speicher: je Ordner eine Liste, die nach dem Löschen leer ist */
function storage(files) {
  const left = new Map(Object.entries(files));
  return [
    [
      is('POST', '/storage/v1/object/list/receipts'),
      (_url, init) => {
        const { prefix, limit } = JSON.parse(init.body);
        return [200, (left.get(prefix) ?? []).slice(0, limit).map((name) => ({ name, id: `id-${name}` }))];
      },
    ],
    [
      is('DELETE', '/storage/v1/object/receipts'),
      (_url, init) => {
        for (const p of JSON.parse(init.body).prefixes) {
          const [folder, name] = p.split('/');
          left.set(folder, (left.get(folder) ?? []).filter((n) => n !== name));
        }
        return [200, []];
      },
    ],
  ];
}

// ---------------------------------------------------------------------------

test('Bestätigung: E-Mail des Kontos, Groß-/Kleinschreibung und Leerzeichen egal', () => {
  assert.equal(confirmMatches(' tom@example.de ', 'Tom@Example.de'), true);
  assert.equal(confirmMatches('tom@example.com', 'Tom@Example.de'), false);
  assert.equal(confirmMatches('', 'Tom@Example.de'), false);
  assert.equal(confirmMatches(undefined, 'Tom@Example.de'), false);
  assert.equal(confirmMatches(42, 'Tom@Example.de'), false);
  // Konto ohne E-Mail: das Wort LÖSCHEN (auch in zerlegter Unicode-Form)
  assert.equal(confirmMatches('löschen', null), true);
  assert.equal(confirmMatches('LÖSCHEN', ''), true);
  assert.equal(confirmMatches('', null), false);
});

test('blockedReason: nur ein laufendes, ungekündigtes Stripe-Abo hält auf', () => {
  assert.equal(blockedReason(null), null);
  assert.equal(blockedReason({ subscription: null }), null);
  assert.equal(blockedReason({ subscription: { ...INFO.subscription, running: true } }), 'subscription_active');
  assert.equal(blockedReason({ subscription: { ...INFO.subscription, store: true } }), null);
});

test('ohne Anmeldung, falsche Methode, ohne Einrichtung', async () => {
  const anon = fakeNet([[is('GET', '/auth/v1/user'), [401, { msg: 'invalid JWT' }]]]);
  const res = await handleRequest(post({ mode: 'check' }), anon.deps);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'not_signed_in' });
  assert.equal(anon.calls.length, 1);

  const noHeader = fakeNet([]);
  const r2 = await handleRequest(new Request(`${SB}/functions/v1/account`, { method: 'POST', body: '{}' }), noHeader.deps);
  assert.equal(r2.status, 401);
  assert.equal(noHeader.calls.length, 0, 'ohne Anmeldung kein Aufruf');

  assert.equal((await handleRequest(new Request(`${SB}/functions/v1/account`), fakeNet([]).deps)).status, 405);
  assert.equal((await handleRequest(new Request(`${SB}/functions/v1/account`, { method: 'OPTIONS' }), fakeNet([]).deps)).status, 200);
  const unconfigured = await handleRequest(post({ mode: 'check' }), fakeNet([], { SUPABASE_URL: SB }).deps);
  assert.deepEqual(await unconfigured.json(), { error: 'not_configured' });
});

test('check: Infos für die Warnungen, mit Service-Schlüssel für das angemeldete Konto', async () => {
  const { calls, deps } = fakeNet([signedIn, info()]);
  const res = await handleRequest(post({ mode: 'check', p_user: 'fremd' }), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.email, 'Tom@Example.de');
  assert.equal(body.blocked, null);
  assert.equal(body.companies.length, 2);
  assert.equal(body.team_people, 2);
  const rpc = calls.find((c) => c.url.endsWith('/rpc/account_deletion_info'));
  assert.deepEqual(JSON.parse(rpc.body), { p_user: USER }, 'immer das eigene Konto, nie eine ID aus der Anfrage');
  assert.equal(rpc.headers.apikey, 'sb_secret_x');
  assert.equal(rpc.headers.Authorization, undefined, 'neuer Secret Key nur als apikey');
  // Prüfen löscht nichts
  assert.equal(calls.some((c) => c.method === 'DELETE'), false);
});

test('check: laufendes Abo -> blocked, fehlendes Skript -> setup_missing', async () => {
  const running = fakeNet([signedIn, info({ subscription: { ...INFO.subscription, status: 'active', running: true } })]);
  assert.equal((await (await handleRequest(post({ mode: 'check' }), running.deps)).json()).blocked, 'subscription_active');

  const missing = fakeNet([signedIn, [is('POST', '/rpc/account_deletion_info'), [404, { code: 'PGRST202' }]]]);
  const res = await handleRequest(post({ mode: 'check' }), missing.deps);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'setup_missing');
});

test('delete: falsche Bestätigung -> nichts passiert', async () => {
  const { calls, deps } = fakeNet([signedIn]);
  const res = await handleRequest(post({ mode: 'delete', confirm: 'jemand@anders.de' }), deps);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'confirm_mismatch' });
  assert.equal(calls.length, 1, 'nur die Anmeldung geprüft');
});

test('delete: laufendes Stripe-Abo -> 409, nichts gelöscht', async () => {
  const sub = { ...INFO.subscription, status: 'active', running: true };
  const { calls, deps } = fakeNet([signedIn, info({ subscription: sub })]);
  const res = await handleRequest(post({ mode: 'delete', confirm: 'tom@example.de' }), deps);
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, 'subscription_active');
  assert.equal(body.subscription.running, true);
  assert.equal(calls.some((c) => c.url.includes('account_delete_prepare') || c.method === 'DELETE'), false);
});

test('delete: Abo in der Datenbank doch noch aktiv (zweite Sicherung) -> 409 vor dem Löschen der Dateien', async () => {
  const { calls, deps } = fakeNet([
    signedIn,
    info(),
    [is('POST', '/rpc/account_delete_prepare'), [400, { code: 'PT409', message: 'subscription_active' }]],
  ]);
  const res = await handleRequest(post({ mode: 'delete', confirm: 'tom@example.de' }), deps);
  assert.equal(res.status, 409);
  assert.equal(calls.some((c) => c.url.includes('/storage/') || c.url.includes('/admin/users')), false);
});

test('delete: alles in der richtigen Reihenfolge – Vorbereitung, TikTok, Belege aller Firmen, Konto', async () => {
  const { calls, deps } = fakeNet([
    signedIn,
    info(),
    [is('POST', '/rpc/account_delete_prepare'), [200, { companies: [USER, EXTRA], files_released: 1 }]],
    [is('GET', '/rest/v1/social_accounts'), [200, [{ id: 'sa1' }]]],
    [is('POST', '/functions/v1/social'), [200, { ok: true }]],
    ...storage({ [USER]: ['a.pdf', 'b.jpg'], [EXTRA]: ['c.png'] }),
    [is('DELETE', `/auth/v1/admin/users/${USER}`), [200, {}]],
  ]);
  const res = await handleRequest(post({ mode: 'delete', confirm: 'TOM@example.de' }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { deleted: true, files: 3 });

  const order = calls.map((c) => `${c.method} ${new URL(c.url).pathname}`);
  const at = (part) => order.findIndex((o) => o.includes(part));
  assert.ok(at('account_delete_prepare') < at('/functions/v1/social'), 'erst prüfen/vorbereiten');
  assert.ok(at('/functions/v1/social') < at('/storage/v1/object/list'), 'dann TikTok');
  assert.ok(order.lastIndexOf(`DELETE /storage/v1/object/receipts`) < at('/auth/v1/admin/users'), 'Konto zuletzt');

  // TikTok trennen mit der Anmeldung des Nutzers (die Funktion "social" kennt den Token-Schlüssel)
  const social = calls.find((c) => c.url.endsWith('/functions/v1/social'));
  assert.equal(social.headers.Authorization, 'Bearer user-jwt');
  assert.deepEqual(JSON.parse(social.body), { action: 'disconnect', platform: 'tiktok' });
  // Belege beider Firmen
  const deleted = calls.filter((c) => c.method === 'DELETE' && c.url.endsWith('/object/receipts')).flatMap((c) => JSON.parse(c.body).prefixes);
  assert.deepEqual(deleted.sort(), [`${USER}/a.pdf`, `${USER}/b.jpg`, `${EXTRA}/c.png`]);
  // Konto über die Admin-API, endgültig
  const del = calls.find((c) => c.url.includes('/auth/v1/admin/users/'));
  assert.equal(del.headers.apikey, 'sb_secret_x');
  assert.deepEqual(JSON.parse(del.body), { should_soft_delete: false });
});

test('delete: ohne TikTok kein Aufruf von "social"; TikTok-Fehler hält nicht auf', async () => {
  const none = fakeNet([
    signedIn,
    info({ companies: [{ id: USER, name: null, primary: true, members: 0 }], team_people: 0 }),
    [is('POST', '/rpc/account_delete_prepare'), [200, { companies: [USER], files_released: 0 }]],
    [is('GET', '/rest/v1/social_accounts'), [200, []]],
    ...storage({}),
    [is('DELETE', '/auth/v1/admin/users/'), [200, {}]],
  ]);
  assert.equal((await handleRequest(post({ mode: 'delete', confirm: 'tom@example.de' }), none.deps)).status, 200);
  assert.equal(none.calls.some((c) => c.url.includes('/functions/v1/social')), false);

  const broken = fakeNet([
    signedIn,
    info({ companies: [{ id: USER, name: null, primary: true, members: 0 }] }),
    [is('POST', '/rpc/account_delete_prepare'), [200, { companies: [USER] }]],
    [is('GET', '/rest/v1/social_accounts'), [200, [{ id: 'sa1' }]]],
    [is('POST', '/functions/v1/social'), () => { throw new Error('timeout'); }],
    ...storage({ [USER]: ['a.pdf'] }),
    [is('DELETE', '/auth/v1/admin/users/'), [200, {}]],
  ]);
  const res = await handleRequest(post({ mode: 'delete', confirm: 'tom@example.de' }), broken.deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).files, 1);
});

test('delete: Speicher kaputt -> 502, Konto bleibt (noch einmal versuchen)', async () => {
  const { calls, deps } = fakeNet([
    signedIn,
    info(),
    [is('POST', '/rpc/account_delete_prepare'), [200, { companies: [USER, EXTRA] }]],
    [is('GET', '/rest/v1/social_accounts'), [200, []]],
    [is('POST', '/storage/v1/object/list/receipts'), [500, { message: 'boom' }]],
  ]);
  const res = await handleRequest(post({ mode: 'delete', confirm: 'tom@example.de' }), deps);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'storage_failed');
  assert.equal(calls.some((c) => c.url.includes('/admin/users')), false);
});

test('delete: Konto-Löschen scheitert -> 500 delete_failed; schon gelöscht (404) -> ok', async () => {
  const routes = (status) => [
    signedIn,
    info({ companies: [{ id: USER, name: null, primary: true, members: 0 }] }),
    [is('POST', '/rpc/account_delete_prepare'), [200, { companies: [USER] }]],
    [is('GET', '/rest/v1/social_accounts'), [404, { code: '42P01' }]],
    ...storage({}),
    [is('DELETE', '/auth/v1/admin/users/'), [status, { msg: 'Database error deleting user' }]],
  ];
  const failed = await handleRequest(post({ mode: 'delete', confirm: 'tom@example.de' }), fakeNet(routes(500)).deps);
  assert.equal(failed.status, 500);
  const body = await failed.json();
  assert.equal(body.error, 'delete_failed');
  assert.match(body.detail, /Database error deleting user/);
  assert.equal((await handleRequest(post({ mode: 'delete', confirm: 'tom@example.de' }), fakeNet(routes(404)).deps)).status, 200);
});

test('purgeFolder: seitenweise löschen, Ordner überspringen, fehlender Speicher = nichts zu tun', async () => {
  const many = Array.from({ length: 1500 }, (_, i) => `f${i}.pdf`);
  const { calls, deps } = fakeNet(storage({ [USER]: many }));
  assert.equal(await purgeFolder(deps, 'receipts', USER), 1500);
  assert.equal(calls.filter((c) => c.method === 'DELETE').length, 2);
  assert.equal(JSON.parse(calls[0].body).prefix, USER);

  const folders = fakeNet([[is('POST', '/object/list/receipts'), [200, [{ name: 'unterordner', id: null }]]]]);
  assert.equal(await purgeFolder(folders.deps, 'receipts', USER), 0);
  assert.equal(folders.calls.some((c) => c.method === 'DELETE'), false);

  const noBucket = fakeNet([[is('POST', '/object/list/receipts'), [400, { error: 'Bucket not found', message: 'Bucket not found' }]]]);
  assert.equal(await purgeFolder(noBucket.deps, 'receipts', USER), 0);
});

test('ungültige Anfragen', async () => {
  assert.equal((await handleRequest(post('kein json'), fakeNet([signedIn]).deps)).status, 400);
  const res = await handleRequest(post({ mode: 'alles' }), fakeNet([signedIn]).deps);
  assert.deepEqual(await res.json(), { error: 'invalid_mode' });
});
