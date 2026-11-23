// Unit-Tests: Abo über App Store / Google Play in der App (reine Logik). Start: npm run test:unit
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isStoreSku,
  mergeResults,
  purchaseErrorOutcome,
  STORE_SKUS,
  storeBlockText,
  storeName,
  storeSku,
  verifyOutcome,
} from '../../src/features/plan/store-logic.ts';
import { lookupKey } from '../../supabase/functions/billing/index.ts';
import { PRODUCTS } from '../../supabase/functions/store/index.ts';

test('Produkt-IDs: gleich in App, Server und Stripe', () => {
  assert.equal(storeSku('pro', 'month'), 'pro_month');
  assert.equal(storeSku('teams', 'year'), 'teams_year');
  assert.deepEqual([...PRODUCTS], STORE_SKUS);
  for (const tier of ['pro', 'business', 'teams'])
    for (const interval of ['month', 'year']) assert.equal(storeSku(tier, interval), lookupKey(tier, interval));
  assert.equal(isStoreSku('business_month'), true);
  assert.equal(isStoreSku('fremde_app_abo'), false);
  assert.equal(isStoreSku(null), false);
  assert.equal(storeName('ios'), 'App Store');
  assert.equal(storeName('google'), 'Google Play');
});

test('Kaufen gesperrt: Admin, Website-Abo, anderer Store, Gutschein – frei: Gratis, Test, eigener Store', () => {
  const block = (row, platform = 'ios') => storeBlockText(row, platform);
  assert.match(block({ source: 'admin', plan: 'teams' }), /Admin-Zugang/);
  assert.match(block({ source: 'stripe', plan: 'pro', status: 'active' }), /Website/);
  assert.match(block({ source: 'google', plan: 'business', status: 'active' }), /Google Play/);
  assert.match(block({ source: 'apple', plan: 'pro', status: 'canceled' }, 'android'), /App Store/);
  assert.equal(
    block({ source: 'voucher', plan: 'pro', status: 'active', current_period_end: '2027-02-28T10:00:00Z' }),
    'Dein Gutschein läuft noch bis zum 28.02.2027. Danach kannst du hier ein Abo abschließen.',
  );
  assert.equal(block({ source: 'apple', plan: 'pro', status: 'active' }), null, 'eigener Store: Stufe wechseln geht');
  assert.equal(block({ source: 'google', plan: 'teams' }, 'android'), null);
  assert.equal(block({ source: 'trial', plan: 'trial' }), null);
  assert.equal(block({ source: 'stripe', plan: 'free', status: 'expired' }), null, 'Website-Abo vorbei');
  assert.equal(block({ source: null, plan: 'free' }), null);
});

test('Antwort des Servers -> abschließen oder nicht', () => {
  assert.deepEqual(verifyOutcome(200, { ok: true, status: 'active' }, 'ios'), { ok: true, finish: true });
  assert.deepEqual(verifyOutcome(200, { ok: true, ignored: true }, 'android'), { finish: true }, 'alter Kauf: abschließen, nicht als Freischaltung zählen');
  const pending = verifyOutcome(200, { ok: true, pending: true }, 'ios');
  assert.equal(pending.pending, true);
  assert.equal(pending.finish, undefined, 'offene Zahlung nicht abschließen');

  // Konflikt: iPhone schließt ab (sonst kommt der Kauf bei jedem Start wieder), Android nicht (Google erstattet)
  const ios = verifyOutcome(409, { error: 'other_subscription', with: 'stripe' }, 'ios');
  assert.equal(ios.finish, true);
  assert.match(ios.error, /über unsere Website/);
  assert.match(ios.error, /Erstattung kannst du bei Apple/);
  const android = verifyOutcome(409, { error: 'other_subscription', with: 'apple' }, 'android');
  assert.equal(android.finish, false);
  assert.match(android.error, /über App Store/);
  assert.match(android.error, /erstattet diesen Kauf in den nächsten 3 Tagen/);
  const other = verifyOutcome(403, { error: 'other_account' }, 'ios');
  assert.equal(other.quiet, true, 'Kauf eines anderen Kontos auf diesem Gerät: im Hintergrund nicht melden');
  assert.match(other.error, /anderen Lunaxora-Konto/);
  assert.match(verifyOutcome(409, { error: 'admin_plan' }, 'android').error, /Admin-Zugang/);

  for (const [status, body, re] of [
    [401, {}, /Anmeldung ist abgelaufen/],
    [404, { error: 'not_found' }, /App Store kennt diesen Kauf/],
    [500, { error: 'store_not_configured' }, /Abschnitt 20/],
    [500, { error: 'apple_auth' }, /noch nicht fertig eingerichtet/],
    [400, { error: 'unknown_product', product: 'x_y' }, /x_y/],
    [502, { error: 'store_error' }, /bezahlt wird dabei nichts/],
  ]) {
    const r = verifyOutcome(status, body, 'ios');
    assert.match(r.error, re, `${status} ${body.error}`);
    assert.ok(!r.finish, `${status}: nicht abschließen, damit der Kauf wiederkommt`);
  }
});

test('Fehler aus dem Store', () => {
  assert.deepEqual(purchaseErrorOutcome('user-cancelled', 'x', 'ios'), { cancelled: true });
  assert.equal(purchaseErrorOutcome('deferred-payment', '', 'ios').pending, true);
  assert.match(purchaseErrorOutcome('already-owned', '', 'android').error, /Käufe wiederherstellen/);
  assert.match(purchaseErrorOutcome('network-error', '', 'android').error, /Google Play ist gerade nicht erreichbar/);
  assert.match(purchaseErrorOutcome('sku-not-found', '', 'ios').error, /nicht verfügbar/);
  const other = purchaseErrorOutcome('service-error', 'kaputt', 'ios');
  assert.match(other.error, /nichts abgebucht/);
  assert.match(other.error, /service-error kaputt/);
});

test('Wiederherstellen: mehrere Käufe zusammenfassen', () => {
  assert.match(mergeResults([]).info, /keine Lunaxora-Käufe/);
  assert.deepEqual(mergeResults([{ finish: true }, { ok: true, finish: true }]), { ok: true });
  assert.match(mergeResults([{ finish: true }]).info, /keine laufenden/);
  assert.equal(mergeResults([{ finish: true }, { error: 'kaputt' }]).error, 'kaputt');
  assert.equal(mergeResults([{ pending: true, info: 'wartet' }]).info, 'wartet');
});
