// Unit-Tests für die Server-Funktion "store" (App Store / Google Play, ohne Netz). Start: npm run test:unit
import assert from 'node:assert/strict';
import { createVerify, generateKeyPairSync } from 'node:crypto';
import { beforeEach, test } from 'node:test';

import {
  appleJwt,
  appleState,
  decide,
  decodeJws,
  googleState,
  handleRequest,
  hasRunningStoreSubscription,
  pemToDer,
  resetStoreCache,
  tierOf,
} from '../../supabase/functions/store/index.ts';

const NOW = Date.parse('2026-11-23T10:00:00Z');
const USER = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
const SB = 'https://projekt.supabase.co';
const BASE = `${SB}/functions/v1/store`;
const BUNDLE = 'de.lunaxora.app';
const LATER = Date.parse('2026-12-23T10:00:00Z');
const EARLIER = Date.parse('2026-10-23T10:00:00Z');

const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const EC_PEM = ec.privateKey.export({ type: 'pkcs8', format: 'pem' });
const RSA_PEM = rsa.privateKey.export({ type: 'pkcs8', format: 'pem' });

const ENV = {
  SUPABASE_URL: SB,
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
  APPLE_IAP_KEY_ID: 'KEY123',
  APPLE_IAP_ISSUER_ID: 'issuer-1',
  // so landet der Schlüssel oft im Secret-Feld: Zeilenumbrüche als „\n“
  APPLE_IAP_PRIVATE_KEY: EC_PEM.replace(/\n/g, '\\n'),
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'iap@projekt.iam.gserviceaccount.com', private_key: RSA_PEM }),
  GOOGLE_RTDN_SECRET: 'geheim-lang-zufall',
};

const b64url = (s) => Buffer.from(s).toString('base64url');
const jws = (payload) => `${b64url('{"alg":"ES256"}')}.${b64url(JSON.stringify(payload))}.c2ln`;

function fakeNet(routes, env = ENV) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    const hit = routes.find(([match]) => match(String(url), init));
    if (!hit) throw new Error(`unerwarteter Aufruf: ${init.method ?? 'GET'} ${url}`);
    const [status, body] = typeof hit[1] === 'function' ? hit[1](String(url), init) : hit[1];
    return new Response(body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { calls, deps: { env: (k) => env[k], fetch, now: () => NOW } };
}
const is = (method, part) => (url, init) => (init.method ?? 'GET') === method && url.includes(part);
const signedIn = [is('GET', '/auth/v1/user'), [200, { id: USER }]];
const post = (body, path = '') =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', apikey: 'pk', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const saved = (calls) => calls.filter((c) => c.url.includes('/rest/v1/subscriptions') && c.method !== 'GET');

beforeEach(() => resetStoreCache());

// --- Apple-Antworten -----------------------------------------------------------
const appleTx = (over = {}) => ({
  transactionId: '2000000100',
  originalTransactionId: '2000000001',
  bundleId: BUNDLE,
  productId: 'pro_month',
  expiresDate: LATER,
  appAccountToken: USER,
  environment: 'Production',
  ...over,
});
const appleStatus = ({ status = 1, tx = {}, renewal = { autoRenewStatus: 1 } } = {}) => ({
  environment: 'Production',
  bundleId: BUNDLE,
  data: [
    {
      subscriptionGroupIdentifier: '21000000',
      lastTransactions: [
        { originalTransactionId: tx.originalTransactionId ?? '2000000001', status, signedTransactionInfo: jws(appleTx(tx)), signedRenewalInfo: jws(renewal) },
      ],
    },
  ],
});

// --- Google-Antworten ----------------------------------------------------------
const googleSub = (over = {}) => ({
  kind: 'androidpublisher#subscriptionPurchaseV2',
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
  externalAccountIdentifiers: { obfuscatedExternalAccountId: USER },
  lineItems: [{ productId: 'business_year', expiryTime: new Date(LATER).toISOString(), autoRenewingPlan: { autoRenewEnabled: true } }],
  ...over,
});
const googleToken = [is('POST', 'oauth2.googleapis.com/token'), [200, { access_token: 'ya29.test', expires_in: 3600 }]];

// ---------------------------------------------------------------------------

test('Produkte -> Stufe, unbekannte Produkte nicht', () => {
  assert.equal(tierOf('pro_month'), 'pro');
  assert.equal(tierOf('business_year'), 'business');
  assert.equal(tierOf('teams_month'), 'teams');
  assert.equal(tierOf('extra_company_month'), null);
  assert.equal(tierOf('pro'), null);
  assert.equal(tierOf(undefined), null);
});

test('JWS lesen und PEM mit „\\n“ als Text', () => {
  assert.deepEqual(decodeJws(jws({ a: 1, ü: 'ä' })), { a: 1, ü: 'ä' });
  assert.equal(decodeJws('kaputt'), null);
  assert.equal(decodeJws('a.%%%.c'), null);
  assert.equal(decodeJws(undefined), null);
  const der = ec.privateKey.export({ type: 'pkcs8', format: 'der' });
  assert.deepEqual(Buffer.from(pemToDer(EC_PEM)), der);
  assert.deepEqual(Buffer.from(pemToDer(EC_PEM.replace(/\n/g, '\\n'))), der);
});

test('Apple-Anmeldung: ES256-JWT mit Schlüssel-ID, Aussteller, Bundle-ID', async () => {
  const { deps } = fakeNet([]);
  const token = await appleJwt(deps);
  const [h, p, s] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
  const payload = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(payload.iss, 'issuer-1');
  assert.equal(payload.aud, 'appstoreconnect-v1');
  assert.equal(payload.bid, BUNDLE);
  assert.equal(payload.iat, NOW / 1000);
  assert.ok(payload.exp - payload.iat <= 3600, 'höchstens 60 Minuten gültig');
  const ok = createVerify('SHA256').update(`${h}.${p}`).verify({ key: ec.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.equal(ok, true, 'Signatur passt zum Schlüssel');
});

test('Apple-Stand: aktiv, gekündigt, Kulanzzeit, Zahlung offen, erstattet', () => {
  const st = (o) => appleState(appleStatus(o), 'production', BUNDLE, null);
  const active = st({});
  assert.equal(active.source, 'apple');
  assert.equal(active.originalId, '2000000001');
  assert.equal(active.tier, 'pro');
  assert.equal(active.account, USER);
  assert.equal(active.environment, 'production');
  assert.deepEqual(active.change, { status: 'active', current_period_end: new Date(LATER).toISOString() });

  assert.equal(st({ renewal: { autoRenewStatus: 0 } }).change.status, 'canceled', 'Verlängerung aus = gekündigt zum Laufzeitende');
  const grace = st({ status: 4, tx: { expiresDate: EARLIER }, renewal: { autoRenewStatus: 1, gracePeriodExpiresDate: LATER } });
  assert.deepEqual(grace.change, { status: 'active', current_period_end: new Date(LATER).toISOString() });
  assert.equal(st({ status: 3, tx: { expiresDate: EARLIER } }).change.status, 'expired', 'Zahlung wird nachgeholt, ohne Kulanzzeit');
  assert.equal(st({ status: 2, tx: { expiresDate: EARLIER } }).change.status, 'expired');
  const refunded = st({ status: 5, tx: { revocationDate: NOW - 1000 } });
  assert.deepEqual(refunded.change, { status: 'expired', current_period_end: new Date(NOW - 1000).toISOString() });
  assert.equal(st({ tx: { productId: 'business_year' } }).tier, 'business');
  assert.equal(appleState(appleStatus({}), 'sandbox', BUNDLE, null).environment, 'sandbox');
});

test('Apple-Stand: fremde App ignorieren, gesuchtes Abo wählen', () => {
  assert.equal(appleState(appleStatus({ tx: { bundleId: 'com.andere.app' } }), 'production', BUNDLE, null), null);
  const two = appleStatus({ status: 2, tx: { originalTransactionId: '1', productId: 'pro_year', expiresDate: EARLIER } });
  two.data[0].lastTransactions.push({
    originalTransactionId: '2',
    status: 1,
    signedTransactionInfo: jws(appleTx({ originalTransactionId: '2', productId: 'teams_month' })),
    signedRenewalInfo: jws({ autoRenewStatus: 1 }),
  });
  assert.equal(appleState(two, 'production', BUNDLE, '1').productId, 'pro_year', 'gewünschte ID');
  assert.equal(appleState(two, 'production', BUNDLE, null).productId, 'teams_month', 'sonst das laufende');
  assert.equal(appleState({ data: [] }, 'production', BUNDLE, null), null);
});

test('Google-Stand: aktiv, gekündigt, Kulanzzeit, ausgesetzt, offen, Testkauf, Stufenwechsel', () => {
  const st = (o) => googleState(googleSub(o), 'tok-1', NOW);
  const active = st({});
  assert.equal(active.source, 'google');
  assert.equal(active.originalId, 'tok-1');
  assert.equal(active.tier, 'business');
  assert.equal(active.account, USER);
  assert.equal(active.needsAck, true);
  assert.equal(active.environment, 'production');
  assert.deepEqual(active.change, { status: 'active', current_period_end: new Date(LATER).toISOString() });

  assert.equal(st({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED' }).change.status, 'canceled');
  const canceledOld = st({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', lineItems: [{ productId: 'pro_month', expiryTime: new Date(EARLIER).toISOString() }] });
  assert.equal(canceledOld.change.status, 'expired', 'gekündigt und Laufzeit vorbei');
  const grace = st({ subscriptionState: 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', lineItems: [{ productId: 'pro_month', expiryTime: new Date(EARLIER).toISOString() }] });
  assert.deepEqual(grace.change, { status: 'active', current_period_end: new Date(NOW + 86_400_000).toISOString() });
  for (const s of ['SUBSCRIPTION_STATE_ON_HOLD', 'SUBSCRIPTION_STATE_PAUSED', 'SUBSCRIPTION_STATE_EXPIRED', 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED'])
    assert.equal(st({ subscriptionState: s }).change.status, 'expired', s);
  assert.equal(st({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' }).change, null, 'Zahlung offen: nichts ändern');
  assert.equal(st({ testPurchase: {} }).environment, 'test');
  assert.equal(st({ acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' }).needsAck, false);
  assert.equal(st({ linkedPurchaseToken: 'tok-alt' }).linkedId, 'tok-alt');
  assert.equal(st({ externalAccountIdentifiers: undefined }).account, null);
});

const state = (over = {}) => ({
  source: 'apple',
  originalId: '2000000001',
  linkedId: null,
  productId: 'pro_month',
  tier: 'pro',
  account: USER,
  environment: 'production',
  change: { status: 'active', current_period_end: new Date(LATER).toISOString() },
  needsAck: false,
  ...over,
});
const row = (over = {}) => ({ user_id: USER, status: 'trial', source: 'trial', current_period_end: null, ...over });

test('Nie zwei bezahlte Abos: Admin, Stripe, anderer Store, anderes Apple-Konto', () => {
  assert.deepEqual(decide(row({ source: 'admin', status: 'active' }), state(), NOW), { action: 'conflict', error: 'admin_plan' });
  const stripe = row({ source: 'stripe', status: 'active', stripe_subscription_id: 'sub_1', current_period_end: new Date(LATER).toISOString() });
  assert.deepEqual(decide(stripe, state(), NOW), { action: 'conflict', error: 'other_subscription', with: 'stripe' });
  const google = row({ source: 'google', status: 'canceled', store_original_id: 'tok', current_period_end: new Date(LATER).toISOString() });
  assert.deepEqual(decide(google, state(), NOW), { action: 'conflict', error: 'other_subscription', with: 'google' });
  const otherApple = row({ source: 'apple', status: 'active', store_original_id: '999', current_period_end: new Date(LATER).toISOString() });
  assert.equal(decide(otherApple, state(), NOW).action, 'conflict');
  // altes abgelaufenes Store-Abo daneben: nur ignorieren, kein Fehler
  const expired = state({ change: { status: 'expired', current_period_end: new Date(EARLIER).toISOString() } });
  assert.deepEqual(decide(stripe, expired, NOW), { action: 'skip', reason: 'old_purchase' });
});

test('Eintragen: über Testphase, Gutschein, abgelaufenes Stripe-Abo; altes Abo nicht', () => {
  const save = decide(row(), state(), NOW);
  assert.deepEqual(save, {
    action: 'save',
    change: {
      status: 'active',
      current_period_end: new Date(LATER).toISOString(),
      tier: 'pro',
      source: 'apple',
      store_original_id: '2000000001',
      store_product_id: 'pro_month',
      store_environment: 'production',
      stripe_subscription_id: null,
    },
  });
  assert.equal(decide(null, state(), NOW).action, 'save', 'noch keine Zeile');
  assert.equal(decide(row({ source: 'voucher', status: 'active', current_period_end: new Date(LATER).toISOString() }), state(), NOW).action, 'save');
  const oldStripe = row({ source: 'stripe', status: 'expired', stripe_subscription_id: 'sub_1', current_period_end: new Date(EARLIER).toISOString() });
  assert.equal(decide(oldStripe, state(), NOW).action, 'save');
  // abgelaufener Kauf beim Wiederherstellen: Testphase bleibt
  const expired = state({ change: { status: 'expired', current_period_end: new Date(EARLIER).toISOString() } });
  assert.deepEqual(decide(row(), expired, NOW), { action: 'skip', reason: 'old_purchase' });
  assert.deepEqual(decide(row(), state({ change: null }), NOW), { action: 'skip', reason: 'pending' });
});

test('Gleiches Abo: Verlängerung, Ablauf, Stufenwechsel bei Google', () => {
  const mine = row({ source: 'apple', status: 'active', store_original_id: '2000000001', current_period_end: new Date(EARLIER).toISOString() });
  const expired = state({ change: { status: 'expired', current_period_end: new Date(EARLIER).toISOString() } });
  assert.equal(decide(mine, expired, NOW).change.status, 'expired', 'eigenes Abo abgelaufen -> eintragen');
  assert.equal(decide(mine, state({ productId: 'teams_year', tier: 'teams' }), NOW).change.tier, 'teams');
  const g = row({ source: 'google', status: 'active', store_original_id: 'tok-alt', current_period_end: new Date(LATER).toISOString() });
  const upgrade = state({ source: 'google', originalId: 'tok-neu', linkedId: 'tok-alt', productId: 'business_month', tier: 'business' });
  const d = decide(g, upgrade, NOW);
  assert.equal(d.action, 'save');
  assert.equal(d.change.store_original_id, 'tok-neu');
  assert.equal(decide(g, state({ source: 'google', originalId: 'tok-fremd' }), NOW).action, 'conflict', 'zweites Google-Abo ohne Wechsel');
});

test('Store-Abo läuft? (für die Sperre bei Stripe)', () => {
  assert.equal(hasRunningStoreSubscription(row({ source: 'apple', status: 'active', current_period_end: new Date(LATER).toISOString() }), NOW), true);
  assert.equal(hasRunningStoreSubscription(row({ source: 'google', status: 'canceled', current_period_end: new Date(LATER).toISOString() }), NOW), true);
  assert.equal(hasRunningStoreSubscription(row({ source: 'apple', status: 'active', current_period_end: new Date(EARLIER).toISOString() }), NOW), false);
  assert.equal(hasRunningStoreSubscription(row({ source: 'stripe', status: 'active' }), NOW), false);
  assert.equal(hasRunningStoreSubscription(null, NOW), false);
});

// --- Kauf aus der App ------------------------------------------------------------

test('Ohne Anmeldung, falsche Eingaben, nicht eingerichtet', async () => {
  const { deps } = fakeNet([[is('GET', '/auth/v1/user'), [401, {}]]]);
  assert.equal((await handleRequest(post({ platform: 'ios', transactionId: '1' }), deps)).status, 401);
  const ok = fakeNet([signedIn]);
  for (const body of [{}, { platform: 'ios', transactionId: 'abc' }, { platform: 'android', purchaseToken: '' }, { platform: 'web' }]) {
    const res = await handleRequest(post(body), ok.deps);
    assert.equal(res.status, 400, JSON.stringify(body));
  }
  const bare = fakeNet([signedIn], { SUPABASE_URL: SB, SUPABASE_SERVICE_ROLE_KEY: 'x' });
  const res = await handleRequest(post({ platform: 'ios', transactionId: '2000000100' }), bare.deps);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'store_not_configured', platform: 'ios' });
  assert.equal((await handleRequest(new Request(BASE, { method: 'GET' }), ok.deps)).status, 405);
});

test('iPhone-Kauf: echte Käufe zuerst, dann Sandbox; Abo eintragen', async () => {
  const { deps, calls } = fakeNet([
    signedIn,
    [is('GET', 'api.storekit.apple.com/inApps/v1/subscriptions/2000000100'), [404, { errorCode: 4040010 }]],
    [is('GET', 'api.storekit-sandbox.apple.com/inApps/v1/subscriptions/2000000100'), [200, appleStatus({})]],
    [is('GET', 'store_original_id=eq.2000000001'), [200, []]],
    [is('GET', `user_id=eq.${USER}`), [200, [row()]]],
    [is('PATCH', `user_id=eq.${USER}`), [204]],
  ]);
  const res = await handleRequest(post({ platform: 'ios', transactionId: '2000000100', originalTransactionId: '2000000001' }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: 'active', tier: 'pro', current_period_end: new Date(LATER).toISOString() });
  const apple = calls.find((c) => c.url.includes('storekit'));
  assert.match(apple.headers.Authorization, /^Bearer ey/);
  const [patch] = saved(calls);
  const body = JSON.parse(patch.body);
  assert.equal(body.source, 'apple');
  assert.equal(body.store_environment, 'sandbox');
  assert.equal(body.store_original_id, '2000000001');
  assert.equal(body.updated_at, new Date(NOW).toISOString());
});

test('iPhone-Kauf: anderes Lunaxora-Konto, unbekannter Kauf, fremdes Produkt, Abo schon woanders', async () => {
  const base = [signedIn, [is('GET', 'api.storekit.apple.com'), [200, appleStatus({ tx: { appAccountToken: OTHER } })]]];
  let res = await handleRequest(post({ platform: 'ios', transactionId: '2000000100' }), fakeNet(base).deps);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'other_account' });

  const none = fakeNet([signedIn, [is('GET', 'storekit'), [404, { errorCode: 4040010 }]]]);
  res = await handleRequest(post({ platform: 'ios', transactionId: '2000000100' }), none.deps);
  assert.equal(res.status, 404);
  assert.equal(none.calls.filter((c) => c.url.includes('storekit')).length, 2, 'beide Umgebungen gefragt');

  const extra = fakeNet([signedIn, [is('GET', 'api.storekit.apple.com'), [200, appleStatus({ tx: { productId: 'extra_company_month' } })]]]);
  res = await handleRequest(post({ platform: 'ios', transactionId: '2000000100' }), extra.deps);
  assert.equal(res.status, 400);

  const taken = fakeNet([
    signedIn,
    [is('GET', 'api.storekit.apple.com'), [200, appleStatus({ tx: { appAccountToken: undefined } })]],
    [is('GET', 'store_original_id=eq.2000000001'), [200, [row({ user_id: OTHER, source: 'apple', store_original_id: '2000000001' })]]],
  ]);
  res = await handleRequest(post({ platform: 'ios', transactionId: '2000000100' }), taken.deps);
  assert.equal(res.status, 403, 'Kauf ohne Konto-Kennung, aber schon an einem anderen Konto');
  assert.equal(saved(taken.calls).length, 0);
});

test('iPhone-Kauf bei laufendem Stripe-Abo -> 409, nichts eingetragen', async () => {
  const { deps, calls } = fakeNet([
    signedIn,
    [is('GET', 'api.storekit.apple.com'), [200, appleStatus({})]],
    [is('GET', 'store_original_id='), [200, []]],
    [
      is('GET', `user_id=eq.${USER}`),
      [200, [row({ source: 'stripe', status: 'active', stripe_subscription_id: 'sub_1', current_period_end: new Date(LATER).toISOString() })]],
    ],
  ]);
  const res = await handleRequest(post({ platform: 'ios', transactionId: '2000000100' }), deps);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'other_subscription', with: 'stripe' });
  assert.equal(saved(calls).length, 0);
});

test('Apple antwortet mit 401 bzw. 500 -> verständlicher Fehler', async () => {
  let res = await handleRequest(post({ platform: 'ios', transactionId: '1' }), fakeNet([signedIn, [is('GET', 'storekit'), [401, '']]]).deps);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'apple_auth');
  res = await handleRequest(post({ platform: 'ios', transactionId: '1' }), fakeNet([signedIn, [is('GET', 'storekit'), [500, '']]]).deps);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'store_error');
});

test('Android-Kauf: bei Google anmelden, prüfen, eintragen, bestätigen', async () => {
  const { deps, calls } = fakeNet([
    signedIn,
    googleToken,
    [is('GET', '/applications/de.lunaxora.app/purchases/subscriptionsv2/tokens/tok-1'), [200, googleSub()]],
    [is('GET', 'store_original_id=eq.tok-1'), [200, []]],
    [is('GET', `user_id=eq.${USER}`), [200, []]],
    [is('POST', '/rest/v1/subscriptions'), [201]],
    [is('POST', '/purchases/subscriptions/business_year/tokens/tok-1:acknowledge'), [204]],
  ]);
  const res = await handleRequest(post({ platform: 'android', productId: 'business_year', purchaseToken: 'tok-1' }), deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).tier, 'business');
  const tokenCall = calls.find((c) => c.url.includes('oauth2'));
  const form = new URLSearchParams(tokenCall.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const [h, p, s] = form.get('assertion').split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/androidpublisher');
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.iss, 'iap@projekt.iam.gserviceaccount.com');
  assert.equal(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(rsa.publicKey, Buffer.from(s, 'base64url')), true);
  const google = calls.find((c) => c.url.includes('subscriptionsv2'));
  assert.equal(google.headers.Authorization, 'Bearer ya29.test');
  const insert = saved(calls).find((c) => c.method === 'POST');
  assert.equal(JSON.parse(insert.body).user_id, USER);
  assert.ok(calls.some((c) => c.url.endsWith(':acknowledge')), 'Kauf bestätigt (sonst Erstattung nach 3 Tagen)');
});

test('Android-Kauf bei laufendem Apple-Abo -> 409 und NICHT bestätigen (Google erstattet)', async () => {
  const { deps, calls } = fakeNet([
    signedIn,
    googleToken,
    [is('GET', 'subscriptionsv2'), [200, googleSub()]],
    [is('GET', 'store_original_id='), [200, []]],
    [
      is('GET', `user_id=eq.${USER}`),
      [200, [row({ source: 'apple', status: 'active', store_original_id: '2000000001', current_period_end: new Date(LATER).toISOString() })]],
    ],
  ]);
  const res = await handleRequest(post({ platform: 'android', productId: 'business_year', purchaseToken: 'tok-1' }), deps);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'other_subscription', with: 'apple' });
  assert.equal(calls.some((c) => c.url.includes(':acknowledge')), false);
  assert.equal(saved(calls).length, 0);
});

test('Android: Zahlung noch offen, Token unbekannt, Dienstkonto ohne Rechte', async () => {
  const pending = fakeNet([signedIn, googleToken, [is('GET', 'subscriptionsv2'), [200, googleSub({ subscriptionState: 'SUBSCRIPTION_STATE_PENDING' })]], [is('GET', '/rest/v1/'), [200, []]]]);
  let res = await handleRequest(post({ platform: 'android', productId: 'pro_month', purchaseToken: 'tok-1' }), pending.deps);
  assert.deepEqual(await res.json(), { ok: true, pending: true });
  assert.equal(saved(pending.calls).length, 0);

  res = await handleRequest(post({ platform: 'android', productId: 'pro_month', purchaseToken: 'tok-1' }), fakeNet([signedIn, googleToken, [is('GET', 'subscriptionsv2'), [410, {}]]]).deps);
  assert.equal(res.status, 404);

  res = await handleRequest(post({ platform: 'android', productId: 'pro_month', purchaseToken: 'tok-1' }), fakeNet([signedIn, googleToken, [is('GET', 'subscriptionsv2'), [403, {}]]]).deps);
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error, 'google_auth');
});

// --- Meldungen ---------------------------------------------------------------------

const appleNote = (type, txOver = {}, environment = 'Production') =>
  new Request(`${BASE}/apple`, {
    method: 'POST',
    body: JSON.stringify({
      signedPayload: jws({ notificationType: type, data: { bundleId: BUNDLE, environment, signedTransactionInfo: jws(appleTx(txOver)) } }),
    }),
  });

test('Apple-Meldung: Test, fremde App, kaputt', async () => {
  const { deps, calls } = fakeNet([]);
  assert.deepEqual(await (await handleRequest(appleNote('TEST'), deps)).json(), { received: true, test: true });
  assert.equal((await handleRequest(appleNote('DID_RENEW', { bundleId: 'com.andere.app' }), deps)).status, 200);
  const broken = new Request(`${BASE}/apple`, { method: 'POST', body: '{"signedPayload":"x"}' });
  assert.equal((await handleRequest(broken, deps)).status, 400);
  assert.equal(calls.length, 0, 'nichts nachgefragt');
});

test('Apple-Meldung Verlängert: Stand bei Apple holen, über das gemerkte Abo eintragen', async () => {
  const { deps, calls } = fakeNet([
    [is('GET', 'api.storekit-sandbox.apple.com/inApps/v1/subscriptions/2000000001'), [200, appleStatus({ tx: { productId: 'pro_year' } })]],
    [is('GET', 'source=eq.apple&store_original_id=eq.2000000001'), [200, [row({ source: 'apple', status: 'active', store_original_id: '2000000001' })]]],
    [is('PATCH', `user_id=eq.${USER}`), [204]],
  ]);
  const res = await handleRequest(appleNote('DID_RENEW', {}, 'Sandbox'), deps);
  assert.equal(res.status, 200);
  assert.ok(calls[0].url.includes('storekit-sandbox'), 'Sandbox-Meldung: zuerst Sandbox fragen');
  const body = JSON.parse(saved(calls)[0].body);
  assert.equal(body.store_product_id, 'pro_year');
  assert.equal(body.tier, 'pro');
});

test('Apple-Meldung Erstattet: Abo endet; Konto über appAccountToken, wenn noch nicht gemerkt', async () => {
  const { deps, calls } = fakeNet([
    [is('GET', 'api.storekit.apple.com'), [200, appleStatus({ status: 5, tx: { revocationDate: NOW - 5000 } })]],
    [is('GET', 'store_original_id='), [200, []]],
    [is('GET', `user_id=eq.${USER}`), [200, [row({ source: 'apple', status: 'active', store_original_id: '2000000001' })]]],
    [is('PATCH', `user_id=eq.${USER}`), [204]],
  ]);
  await handleRequest(appleNote('REFUND'), deps);
  assert.equal(JSON.parse(saved(calls)[0].body).status, 'expired');
});

test('Apple-Meldung bei Datenbankfehler -> 500, damit Apple es noch einmal schickt', async () => {
  const { deps } = fakeNet([
    [is('GET', 'storekit'), [200, appleStatus({})]],
    [is('GET', '/rest/v1/'), [503, 'down']],
  ]);
  assert.equal((await handleRequest(appleNote('DID_RENEW'), deps)).status, 500);
});

const googleNote = (note, key = ENV.GOOGLE_RTDN_SECRET) =>
  new Request(`${BASE}/google?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    body: JSON.stringify({
      message: { data: Buffer.from(JSON.stringify(note)).toString('base64'), messageId: '1' },
      subscription: 'projects/p/subscriptions/s',
    }),
  });

test('Google-Meldung: falscher Schlüssel, fremde App, Test', async () => {
  const { deps, calls } = fakeNet([]);
  assert.equal((await handleRequest(googleNote({ packageName: 'de.lunaxora.app' }, 'falsch'), deps)).status, 401);
  assert.equal((await handleRequest(googleNote({ packageName: 'com.andere.app', subscriptionNotification: { purchaseToken: 't' } }), deps)).status, 200);
  const test1 = await handleRequest(googleNote({ packageName: 'de.lunaxora.app', testNotification: { version: '1.0' } }), deps);
  assert.deepEqual(await test1.json(), { received: true, test: true });
  assert.equal(calls.length, 0);
});

test('Google-Meldung Stufenwechsel: altes Abo finden, neuen Token eintragen und bestätigen', async () => {
  const { deps, calls } = fakeNet([
    googleToken,
    [is('GET', 'subscriptionsv2/tokens/tok-neu'), [200, googleSub({ linkedPurchaseToken: 'tok-alt' })]],
    [is('GET', 'store_original_id=eq.tok-neu'), [200, []]],
    [is('GET', 'store_original_id=eq.tok-alt'), [200, [row({ source: 'google', status: 'active', store_original_id: 'tok-alt' })]]],
    [is('PATCH', `user_id=eq.${USER}`), [204]],
    [is('POST', ':acknowledge'), [204]],
  ]);
  const res = await handleRequest(
    googleNote({ packageName: 'de.lunaxora.app', subscriptionNotification: { notificationType: 4, purchaseToken: 'tok-neu' } }),
    deps,
  );
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(saved(calls)[0].body).store_original_id, 'tok-neu');
  assert.ok(calls.some((c) => c.url.includes('tok-neu:acknowledge')));
});

test('Google-Meldung: altes Abo läuft aus, Konto hat schon ein neues -> nichts ändern', async () => {
  const { deps, calls } = fakeNet([
    googleToken,
    [is('GET', 'subscriptionsv2/tokens/tok-alt'), [200, googleSub({ subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED', acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED' })]],
    [is('GET', 'store_original_id=eq.tok-alt'), [200, []]],
    [is('GET', `user_id=eq.${USER}`), [200, [row({ source: 'google', status: 'active', store_original_id: 'tok-neu', current_period_end: new Date(LATER).toISOString() })]]],
  ]);
  const res = await handleRequest(
    googleNote({ packageName: 'de.lunaxora.app', subscriptionNotification: { notificationType: 13, purchaseToken: 'tok-alt' } }),
    deps,
  );
  assert.equal(res.status, 200);
  assert.equal(saved(calls).length, 0);
});
