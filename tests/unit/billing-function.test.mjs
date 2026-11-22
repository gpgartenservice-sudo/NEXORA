// Unit-Tests für die Server-Funktion "billing" (Stripe, ohne Netz). Start: npm run test:unit
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  handleRequest,
  hasRunningStripeSubscription,
  lookupKey,
  subscriptionRow,
  verifyStripeSignature,
} from '../../supabase/functions/billing/index.ts';

const NOW = Date.parse('2026-11-20T10:00:00Z');
const NOW_S = Math.floor(NOW / 1000);
const SECRET = 'whsec_test';
const USER = '11111111-1111-1111-1111-111111111111';
const SB = 'https://projekt.supabase.co';
const BASE = `${SB}/functions/v1/billing`;
const sign = (payload, t = NOW_S, secret = SECRET) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
const at = (iso) => Math.floor(Date.parse(iso) / 1000);

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_WEBHOOK_SECRET: SECRET,
  SUPABASE_URL: SB,
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_x',
};

/** Fake-Netz: routes = [[Prüfung(url, init), Antwort]], merkt sich jeden Aufruf */
function fakeNet(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body });
    const hit = routes.find(([match]) => match(String(url), init));
    if (!hit) throw new Error(`unerwarteter Aufruf: ${init.method ?? 'GET'} ${url}`);
    const [status, body] = typeof hit[1] === 'function' ? hit[1](String(url), init) : hit[1];
    return new Response(body === undefined ? null : JSON.stringify(body), { status });
  };
  return { calls, deps: { env: (k) => ENV[k], fetch, now: () => NOW } };
}
const is = (method, part) => (url, init) => (init.method ?? 'GET') === method && url.includes(part);
const form = (call) => Object.fromEntries(new URLSearchParams(call.body));
const signedIn = [is('GET', '/auth/v1/user'), [200, { id: USER, email: 'kunde@example.de' }]];
const post = (body, path = '') =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer jwt', apikey: 'pk', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const hook = (event, signature) => {
  const payload = JSON.stringify(event);
  return new Request(`${BASE}/webhook`, {
    method: 'POST',
    headers: { 'Stripe-Signature': signature ?? sign(payload) },
    body: payload,
  });
};

// ---------------------------------------------------------------------------

test('Lookup-Keys der Preise', () => {
  assert.equal(lookupKey('pro', 'month'), 'pro_month');
  assert.equal(lookupKey('business', 'year'), 'business_year');
});

test('Webhook-Signatur: echt, falsch, zu alt, mehrere v1', async () => {
  const p = '{"id":"evt_1"}';
  assert.equal(await verifyStripeSignature(p, sign(p), SECRET, NOW_S), true);
  assert.equal(await verifyStripeSignature(p, sign(p, NOW_S, 'whsec_falsch'), SECRET, NOW_S), false);
  assert.equal(await verifyStripeSignature(p + ' ', sign(p), SECRET, NOW_S), false, 'Inhalt verändert');
  assert.equal(await verifyStripeSignature(p, sign(p, NOW_S - 301), SECRET, NOW_S), false, 'älter als 5 Minuten');
  assert.equal(await verifyStripeSignature(p, sign(p, NOW_S - 299), SECRET, NOW_S), true);
  const both = `t=${NOW_S},v1=${'0'.repeat(64)},${sign(p).split(',')[1]}`;
  assert.equal(await verifyStripeSignature(p, both, SECRET, NOW_S), true, 'eine von mehreren v1 passt (Schlüsselwechsel)');
  assert.equal(await verifyStripeSignature(p, null, SECRET, NOW_S), false);
  assert.equal(await verifyStripeSignature(p, sign(p), undefined, NOW_S), false);
  assert.equal(await verifyStripeSignature(p, 'v1=abc', SECRET, NOW_S), false);
});

const sub = (over = {}) => ({
  id: 'sub_1',
  customer: 'cus_1',
  status: 'active',
  cancel_at_period_end: false,
  metadata: { user_id: USER },
  items: { data: [{ current_period_end: at('2026-12-20T10:00:00Z'), price: { lookup_key: 'pro_month' } }] },
  ...over,
});

test('Stripe-Abo -> Zeile in subscriptions', () => {
  assert.deepEqual(subscriptionRow(sub()), {
    tier: 'pro',
    source: 'stripe',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    status: 'active',
    current_period_end: '2026-12-20T10:00:00.000Z',
  });
  const business = sub({ items: { data: [{ current_period_end: at('2027-11-20T10:00:00Z'), price: { lookup_key: 'business_year' } }] } });
  assert.equal(subscriptionRow(business).tier, 'business');
  const teams = sub({ items: { data: [{ current_period_end: at('2027-11-20T10:00:00Z'), price: { lookup_key: 'teams_month' } }] } });
  assert.equal(subscriptionRow(teams).tier, 'teams');
  assert.equal(lookupKey('teams', 'year'), 'teams_year');
  assert.equal(subscriptionRow(business).current_period_end, '2027-11-20T10:00:00.000Z');
  // ältere API-Version: Laufzeitende am Abo statt am Posten
  const old = sub({ current_period_end: at('2026-12-01T00:00:00Z'), items: { data: [{ price: { lookup_key: 'pro_year' } }] } });
  assert.equal(subscriptionRow(old).current_period_end, '2026-12-01T00:00:00.000Z');
  assert.equal(subscriptionRow(sub({ customer: { id: 'cus_9' } })).stripe_customer_id, 'cus_9');
});

test('Status: gekündigt, Zahlung offen, beendet, unvollständig', () => {
  assert.equal(subscriptionRow(sub({ status: 'trialing' })).status, 'active');
  assert.equal(subscriptionRow(sub({ status: 'past_due' })).status, 'active', 'Stripe versucht es noch – bis Laufzeitende weiter Pro');
  const canceled = subscriptionRow(sub({ cancel_at_period_end: true }));
  assert.equal(canceled.status, 'canceled');
  assert.equal(canceled.current_period_end, '2026-12-20T10:00:00.000Z');
  const cancelAt = subscriptionRow(sub({ cancel_at: at('2026-12-05T00:00:00Z') }));
  assert.equal(cancelAt.status, 'canceled');
  assert.equal(cancelAt.current_period_end, '2026-12-05T00:00:00.000Z', 'festes Kündigungsdatum vor Laufzeitende');
  for (const s of ['canceled', 'unpaid', 'incomplete_expired', 'paused']) assert.equal(subscriptionRow(sub({ status: s })).status, 'expired', s);
  assert.equal(subscriptionRow(sub({ status: 'incomplete' })), null);
});

test('Läuft schon ein bezahltes Stripe-Abo?', () => {
  const row = { user_id: USER, source: 'stripe', stripe_subscription_id: 'sub_1', status: 'active', current_period_end: '2026-12-20T10:00:00Z' };
  assert.equal(hasRunningStripeSubscription(row, NOW), true);
  assert.equal(hasRunningStripeSubscription({ ...row, status: 'canceled' }, NOW), true, 'gekündigt, aber noch nicht abgelaufen');
  assert.equal(hasRunningStripeSubscription({ ...row, status: 'canceled', current_period_end: '2026-11-01T00:00:00Z' }, NOW), false);
  assert.equal(hasRunningStripeSubscription({ ...row, status: 'expired' }, NOW), false);
  assert.equal(hasRunningStripeSubscription({ ...row, source: 'manual' }, NOW), false);
  assert.equal(hasRunningStripeSubscription({ ...row, stripe_subscription_id: null }, NOW), false);
  assert.equal(hasRunningStripeSubscription(null, NOW), false);
});

// ---------------------------------------------------------------------------

test('Seite nach der Bezahlung', async () => {
  const { deps } = fakeNet([]);
  const ok = await handleRequest(new Request(`${BASE}/fertig?s=ok`), deps);
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Danke/);
  assert.match(await (await handleRequest(new Request(`${BASE}/fertig?s=abbruch`), deps)).text(), /nichts berechnet/);
  assert.equal((await handleRequest(new Request(`${BASE}/irgendwas`), deps)).status, 404);
});

test('Ohne Stripe-Schlüssel bzw. ohne Anmeldung', async () => {
  const none = await handleRequest(post({ mode: 'checkout', tier: 'pro', interval: 'month' }), { env: () => undefined, fetch: () => Promise.reject(new Error('kein Netz')) });
  assert.equal(none.status, 500);
  assert.equal((await none.json()).error, 'stripe_not_configured');
  const { deps } = fakeNet([[is('GET', '/auth/v1/user'), [401, { msg: 'invalid' }]]]);
  assert.equal((await handleRequest(post({ mode: 'checkout', tier: 'pro', interval: 'month' }), deps)).status, 401);
});

test('Checkout: Kunde anlegen, Preis per Lookup-Key, Bezahlseite', async () => {
  const { calls, deps } = fakeNet([
    signedIn,
    [is('GET', '/rest/v1/subscriptions'), [200, [{ user_id: USER, status: 'trial', source: 'trial' }]]],
    [is('POST', 'api.stripe.com/v1/customers'), [200, { id: 'cus_neu' }]],
    [is('PATCH', '/rest/v1/subscriptions'), [204]],
    [is('GET', 'api.stripe.com/v1/prices'), [200, { data: [{ id: 'price_biz_year' }] }]],
    [is('POST', 'api.stripe.com/v1/checkout/sessions'), [200, { url: 'https://checkout.stripe.com/c/pay/cs_1' }]],
  ]);
  const res = await handleRequest(post({ mode: 'checkout', tier: 'business', interval: 'year' }), deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { url: 'https://checkout.stripe.com/c/pay/cs_1' });

  const customer = calls.find((c) => c.url.endsWith('/v1/customers'));
  assert.equal(form(customer)['metadata[user_id]'], USER);
  assert.equal(form(customer).email, 'kunde@example.de');
  assert.equal(customer.headers['Idempotency-Key'], `customer-${USER}`);
  assert.equal(customer.headers.Authorization, 'Bearer sk_test_x');

  const saved = calls.find((c) => c.method === 'PATCH');
  assert.match(saved.url, new RegExp(`user_id=eq.${USER}`));
  assert.equal(JSON.parse(saved.body).stripe_customer_id, 'cus_neu');
  assert.equal(saved.headers.apikey, 'sb_secret_x');
  assert.equal(saved.headers.Authorization, undefined, 'neuer Secret Key nur als apikey');

  const prices = calls.find((c) => c.url.includes('/v1/prices'));
  assert.equal(new URL(prices.url).searchParams.get('lookup_keys[]'), 'business_year');

  const session = form(calls.find((c) => c.url.includes('/checkout/sessions')));
  assert.equal(session.mode, 'subscription');
  assert.equal(session.customer, 'cus_neu');
  assert.equal(session['line_items[0][price]'], 'price_biz_year');
  assert.equal(session['subscription_data[metadata][user_id]'], USER);
  assert.equal(session.client_reference_id, USER);
  assert.equal(session.success_url, `${BASE}/fertig?s=ok`);
  assert.equal(session.cancel_url, `${BASE}/fertig?s=abbruch`);
  assert.equal(session.locale, 'de');
});

test('Checkout bei laufendem Abo: Kundenportal statt doppelt zahlen', async () => {
  const { calls, deps } = fakeNet([
    signedIn,
    [
      is('GET', '/rest/v1/subscriptions'),
      [200, [{ user_id: USER, status: 'active', source: 'stripe', tier: 'pro', current_period_end: '2026-12-20T10:00:00Z', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' }]],
    ],
    [is('POST', 'billing_portal/sessions'), [200, { url: 'https://billing.stripe.com/p/session/x' }]],
  ]);
  const res = await handleRequest(post({ mode: 'checkout', tier: 'business', interval: 'month' }), deps);
  assert.deepEqual(await res.json(), { url: 'https://billing.stripe.com/p/session/x', portal: true });
  assert.equal(calls.some((c) => c.url.includes('/checkout/sessions')), false);
  assert.equal(form(calls.find((c) => c.url.includes('billing_portal'))).customer, 'cus_1');
});

test('Checkout: falsche Eingaben, fehlender Preis, falscher Stripe-Schlüssel', async () => {
  const bad = fakeNet([signedIn]);
  assert.equal((await handleRequest(post({ mode: 'checkout', tier: 'gold', interval: 'month' }), bad.deps)).status, 400);
  assert.equal((await handleRequest(post({ mode: 'nix' }), bad.deps)).status, 400);

  const row = [is('GET', '/rest/v1/subscriptions'), [200, [{ user_id: USER, status: 'trial', source: 'trial', stripe_customer_id: 'cus_1' }]]];
  const noPrice = fakeNet([signedIn, row, [is('GET', '/v1/prices'), [200, { data: [] }]]]);
  const r1 = await handleRequest(post({ mode: 'checkout', tier: 'pro', interval: 'month' }), noPrice.deps);
  assert.equal(r1.status, 500);
  assert.deepEqual(await r1.json(), { error: 'price_missing', lookup_key: 'pro_month' });

  const badKey = fakeNet([signedIn, row, [is('GET', '/v1/prices'), [401, { error: { message: 'Invalid API Key provided' } }]]]);
  const r2 = await handleRequest(post({ mode: 'checkout', tier: 'pro', interval: 'month' }), badKey.deps);
  assert.equal(r2.status, 500);
  assert.equal((await r2.json()).error, 'invalid_stripe_key');
});

test('Kundenportal: nur mit Stripe-Kunde', async () => {
  const none = fakeNet([signedIn, [is('GET', '/rest/v1/subscriptions'), [200, [{ user_id: USER, status: 'active', source: 'manual' }]]]]);
  const r = await handleRequest(post({ mode: 'portal' }), none.deps);
  assert.equal(r.status, 404);
  assert.equal((await r.json()).error, 'no_customer');

  const yes = fakeNet([
    signedIn,
    [is('GET', '/rest/v1/subscriptions'), [200, [{ user_id: USER, status: 'active', source: 'stripe', stripe_customer_id: 'cus_1' }]]],
    [is('POST', 'billing_portal/sessions'), [200, { url: 'https://billing.stripe.com/p/session/y' }]],
  ]);
  assert.deepEqual(await (await handleRequest(post({ mode: 'portal' }), yes.deps)).json(), { url: 'https://billing.stripe.com/p/session/y' });
  assert.equal(form(yes.calls.at(-1)).return_url, `${BASE}/fertig?s=portal`);
});

// ---------------------------------------------------------------------------

test('Webhook ohne gültige Signatur wird abgelehnt', async () => {
  const { calls, deps } = fakeNet([]);
  const res = await handleRequest(hook({ type: 'customer.subscription.updated', data: { object: sub() } }, 't=1,v1=abc'), deps);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test('Webhook: Abo geändert -> aktuellen Stand bei Stripe holen und eintragen', async () => {
  const current = sub({ items: { data: [{ current_period_end: at('2027-11-20T10:00:00Z'), price: { lookup_key: 'business_year' } }] } });
  const { calls, deps } = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, current]],
    [is('GET', '/rest/v1/subscriptions'), [200, [{ user_id: USER, status: 'trial', source: 'trial', stripe_customer_id: 'cus_1' }]]],
    [is('PATCH', '/rest/v1/subscriptions'), [204]],
  ]);
  // die Meldung selbst ist veraltet (noch Pro-Monat) – zählen soll der Stand von Stripe
  const event = { type: 'customer.subscription.updated', data: { object: sub() } };
  const res = await handleRequest(hook(event), deps);
  assert.equal(res.status, 200);
  const change = JSON.parse(calls.find((c) => c.method === 'PATCH').body);
  assert.equal(change.status, 'active');
  assert.equal(change.tier, 'business');
  assert.equal(change.source, 'stripe');
  assert.equal(change.current_period_end, '2027-11-20T10:00:00.000Z');
  assert.equal(change.stripe_subscription_id, 'sub_1');
});

test('Webhook: Nutzer über Stripe-Kunde finden, sonst neue Zeile', async () => {
  const byCustomer = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, sub({ status: 'canceled', metadata: {} })]],
    [is('GET', 'stripe_customer_id=eq.cus_1'), [200, [{ user_id: USER, status: 'active', source: 'stripe', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1' }]]],
    [is('PATCH', `user_id=eq.${USER}`), [204]],
  ]);
  await handleRequest(hook({ type: 'customer.subscription.deleted', data: { object: sub({ status: 'canceled', metadata: {} }) } }), byCustomer.deps);
  assert.equal(JSON.parse(byCustomer.calls.at(-1).body).status, 'expired');

  const fresh = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, sub()]],
    [is('GET', '/rest/v1/subscriptions'), [200, []]],
    [is('POST', '/rest/v1/subscriptions'), [201]],
  ]);
  await handleRequest(hook({ type: 'customer.subscription.created', data: { object: sub() } }), fresh.deps);
  const inserted = JSON.parse(fresh.calls.at(-1).body);
  assert.equal(inserted.user_id, USER);
  assert.equal(inserted.status, 'active');
});

test('Webhook: späte Meldung zu altem Abo überschreibt neues nicht', async () => {
  const { calls, deps } = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_alt'), [200, sub({ id: 'sub_alt', status: 'canceled' })]],
    [is('GET', '/rest/v1/subscriptions'), [200, [{ user_id: USER, status: 'active', source: 'stripe', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_neu' }]]],
  ]);
  const res = await handleRequest(hook({ type: 'customer.subscription.deleted', data: { object: sub({ id: 'sub_alt', status: 'canceled' }) } }), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.some((c) => c.method === 'PATCH'), false);
});

test('Webhook: Checkout abgeschlossen -> Abo bei Stripe holen und eintragen', async () => {
  const { calls, deps } = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, sub({ metadata: {} })]],
    [is('GET', `user_id=eq.${USER}`), [200, [{ user_id: USER, status: 'trial', source: 'trial', stripe_customer_id: 'cus_1' }]]],
    [is('PATCH', '/rest/v1/subscriptions'), [204]],
  ]);
  const event = { type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', client_reference_id: USER } } };
  assert.equal((await handleRequest(hook(event), deps)).status, 200);
  assert.equal(JSON.parse(calls.at(-1).body).status, 'active');
});

test('Webhook: andere Ereignisse werden nur bestätigt', async () => {
  const { calls, deps } = fakeNet([]);
  const res = await handleRequest(hook({ type: 'customer.created', data: { object: {} } }), deps);
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

const invoice = (over = {}) => ({
  id: 'in_1',
  number: 'LX-0001',
  customer: 'cus_1',
  amount_paid: 23990,
  currency: 'eur',
  status_transitions: { paid_at: at('2026-11-20T09:00:00Z') },
  parent: { subscription_details: { subscription: 'sub_1' } },
  ...over,
});

test('Webhook: Rechnung bezahlt -> Einnahme mit Stufe und Intervall eintragen', async () => {
  const yearly = sub({ items: { data: [{ current_period_end: at('2027-11-20T10:00:00Z'), price: { lookup_key: 'pro_year' } }] } });
  const { calls, deps } = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, yearly]],
    [is('POST', '/rest/v1/rpc/log_payment'), [204]],
  ]);
  const res = await handleRequest(hook({ type: 'invoice.paid', data: { object: invoice({ amount_paid: 23990 }) } }), deps);
  assert.equal(res.status, 200);
  const rpc = calls.find((c) => c.url.includes('log_payment'));
  assert.equal(rpc.headers.apikey, 'sb_secret_x');
  const body = JSON.parse(rpc.body);
  assert.equal(body.p_user, USER);
  assert.equal(body.p_betrag, 239.9);
  assert.equal(body.p_intervall, 'year');
  assert.equal(body.p_stufe, 'pro');
  assert.equal(body.p_rechnung, 'in_1');
  assert.equal(body.p_bezahlt_am, '2026-11-20T09:00:00.000Z');
});

test('Webhook: Rechnung ohne Abo-Metadaten -> Nutzer über Stripe-Kunde', async () => {
  const { calls, deps } = fakeNet([
    [is('GET', 'stripe_customer_id=eq.cus_9'), [200, [{ user_id: USER, status: 'active', stripe_customer_id: 'cus_9' }]]],
    [is('POST', '/rest/v1/rpc/log_payment'), [204]],
  ]);
  const inv = invoice({ customer: { id: 'cus_9' }, parent: null, subscription: undefined });
  assert.equal((await handleRequest(hook({ type: 'invoice.paid', data: { object: inv } }), deps)).status, 200);
  const body = JSON.parse(calls.find((c) => c.url.includes('log_payment')).body);
  assert.equal(body.p_user, USER);
  assert.equal(body.p_intervall, null);
});

test('Webhook: 0-€-Rechnung, fremde Währung und fehlendes Skript', async () => {
  const none = fakeNet([]);
  await handleRequest(hook({ type: 'invoice.paid', data: { object: invoice({ amount_paid: 0 }) } }), none.deps);
  await handleRequest(hook({ type: 'invoice.paid', data: { object: invoice({ currency: 'usd' }) } }), none.deps);
  assert.equal(none.calls.length, 0);

  const missing = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, sub()]],
    [is('POST', '/rest/v1/rpc/log_payment'), [404, { code: 'PGRST202' }]],
  ]);
  assert.equal((await handleRequest(hook({ type: 'invoice.paid', data: { object: invoice() } }), missing.deps)).status, 200);

  const broken = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, sub()]],
    [is('POST', '/rest/v1/rpc/log_payment'), [503, { message: 'down' }]],
  ]);
  assert.equal((await handleRequest(hook({ type: 'invoice.paid', data: { object: invoice() } }), broken.deps)).status, 500);
});

test('Webhook: Datenbankfehler -> 500, damit Stripe es noch einmal versucht', async () => {
  const { deps } = fakeNet([
    [is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [200, sub()]],
    [is('GET', '/rest/v1/subscriptions'), [503, { message: 'down' }]],
  ]);
  const res = await handleRequest(hook({ type: 'customer.subscription.updated', data: { object: sub() } }), deps);
  assert.equal(res.status, 500);
});

test('Webhook: Stripe nicht erreichbar -> 502, Stripe versucht es später noch einmal', async () => {
  const { calls, deps } = fakeNet([[is('GET', 'api.stripe.com/v1/subscriptions/sub_1'), [503, { error: { message: 'busy' } }]]]);
  const res = await handleRequest(hook({ type: 'customer.subscription.updated', data: { object: sub() } }), deps);
  assert.ok(res.status >= 500);
  assert.equal(calls.some((c) => c.url.includes('/rest/v1/')), false);
});
