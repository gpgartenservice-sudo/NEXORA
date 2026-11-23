/**
 * Abo über App Store / Google Play (In-App-Kauf mit expo-iap, StoreKit 2 bzw. Play Billing).
 *
 * Ablauf: Kaufen -> der Store meldet den Kauf -> die Server-Funktion "store" prüft ihn direkt
 * bei Apple bzw. Google und schaltet das Abo frei -> erst dann wird der Kauf abgeschlossen
 * (finishTransaction). Fällt dazwischen etwas aus, meldet der Store den Kauf beim nächsten
 * Start noch einmal; Apple und Google melden Verlängerungen und Kündigungen zusätzlich direkt
 * an den Server.
 *
 * Der Kauf trägt die Lunaxora-Konto-ID (Apple: appAccountToken, Google: obfuscatedAccountId),
 * damit ein Abo nie ein fremdes Konto freischaltet. Läuft schon ein anderes bezahltes Abo, lässt
 * die Abo-Seite gar nicht erst kaufen; der Server prüft es noch einmal (409).
 */
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import {
  deepLinkToSubscriptions,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type ProductSubscription,
  type Purchase,
  type RequestSubscriptionAndroidProps,
} from 'expo-iap';
import { useEffect } from 'react';
import { Linking, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import type { PaidTier } from './plan-logic';
import {
  isStoreSku,
  mergeResults,
  purchaseErrorOutcome,
  STORE_SKUS,
  storeName,
  storeSku,
  verifyOutcome,
  type StoreInterval,
  type StorePlatform,
  type StoreResult,
} from './store-logic';

export const STORE_PLATFORM: StorePlatform | null = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : null;
const platform: StorePlatform = Platform.OS === 'ios' ? 'ios' : 'android';
const PACKAGE = 'de.lunaxora.app';
/** so lange wartet „Kaufen“ höchstens auf die Antwort des Stores */
const WAIT_MS = 5 * 60_000;

const unreachable = (): StoreResult => ({
  error: `${storeName(platform)} ist gerade nicht erreichbar. Prüfe deine Internetverbindung und versuch es noch einmal.`,
});

// ---------------------------------------------------------------------------
// Verbindung, Preise
// ---------------------------------------------------------------------------

let connection: Promise<boolean> | null = null;
function connect(): Promise<boolean> {
  connection ??= initConnection().then(
    () => true,
    (e: unknown) => {
      console.warn('[Store] Verbindung', e);
      connection = null;
      return false;
    },
  );
  return connection;
}

const prices: Record<string, string> = {};
/** Google: Angebot (Basis-Abo) je Produkt – muss beim Kauf mitgeschickt werden */
const offers: Record<string, string> = {};

export async function loadStorePrices(): Promise<Record<string, string>> {
  if (!(await connect())) return { ...prices };
  try {
    const list = ((await fetchProducts({ skus: STORE_SKUS, type: 'subs' })) ?? []) as ProductSubscription[];
    for (const p of list) {
      if (!isStoreSku(p.id)) continue;
      prices[p.id] = p.displayPrice;
      if (p.platform === 'android') {
        const offer =
          p.subscriptionOffers?.find((o) => o.offerTokenAndroid && !o.offerTagsAndroid?.length) ??
          p.subscriptionOffers?.find((o) => o.offerTokenAndroid);
        if (offer?.offerTokenAndroid) offers[p.id] = offer.offerTokenAndroid;
      }
    }
  } catch (e) {
    console.warn('[Store] Preise', e);
  }
  return { ...prices };
}

// ---------------------------------------------------------------------------
// Prüfen und abschließen
// ---------------------------------------------------------------------------

async function verify(p: Purchase): Promise<StoreResult> {
  const ios = p as Purchase & { originalTransactionIdentifierIOS?: string | null };
  const body =
    platform === 'ios'
      ? {
          platform,
          transactionId: p.transactionId || p.id,
          ...(ios.originalTransactionIdentifierIOS ? { originalTransactionId: ios.originalTransactionIdentifierIOS } : {}),
        }
      : { platform, productId: p.productId, purchaseToken: p.purchaseToken };
  const { data, error } = await supabase.functions.invoke('store', { body });
  if (!error) return verifyOutcome(200, data as Record<string, unknown> | null, platform);
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const b = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return verifyOutcome(res.status, b, platform);
  }
  if (error instanceof FunctionsFetchError)
    return {
      error:
        'Der Lunaxora-Server antwortet gerade nicht. Dein Kauf ist sicher – tippe gleich auf „Käufe wiederherstellen“, bezahlt wird dabei nichts.',
    };
  return { error: `Die Freischaltung hat gerade nicht geklappt.\n\nTechnische Details: ${String(error.message ?? error)}` };
}

const inFlight = new Map<string, Promise<StoreResult>>();
let planChanged: (() => void) | null = null;

/** Kauf prüfen lassen und – wenn der Server es sagt – beim Store abschließen */
function processPurchase(p: Purchase): Promise<StoreResult> {
  const key = (platform === 'ios' ? p.transactionId || p.id : p.purchaseToken) || p.id;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async (): Promise<StoreResult> => {
    if (!isStoreSku(p.productId)) return {};
    if (p.purchaseState === 'pending')
      return { pending: true, info: 'Die Zahlung ist noch nicht abgeschlossen. Sobald sie bestätigt ist, schalten wir dein Abo frei.' };
    const result = await verify(p);
    if (result.finish) {
      try {
        await finishTransaction({ purchase: p, isConsumable: false });
      } catch (e) {
        // z. B. schon vom Server bestätigt (Google) – das Abo ist trotzdem freigeschaltet
        console.warn('[Store] abschließen', e);
      }
    }
    if (result.ok) planChanged?.();
    return result;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

// ---------------------------------------------------------------------------
// Kaufen
// ---------------------------------------------------------------------------

let waiting: { sku: string; resolve: (r: StoreResult) => void; timer: ReturnType<typeof setTimeout> } | null = null;
const notices = new Set<(r: StoreResult) => void>();

function settle(result: StoreResult) {
  if (!waiting) return;
  clearTimeout(waiting.timer);
  const done = waiting.resolve;
  waiting = null;
  done(result);
}

function onUpdate(p: Purchase) {
  void processPurchase(p).then((result) => {
    if (waiting && waiting.sku === p.productId) settle(result);
    else if ((result.error && !result.quiet) || result.pending) notices.forEach((fn) => fn(result));
  });
}

function onError(e: { code?: string; message?: string }) {
  if (waiting) settle(purchaseErrorOutcome(e.code, e.message, platform));
}

export async function buyInStore(tier: PaidTier, interval: StoreInterval, userId: string): Promise<StoreResult> {
  if (waiting) return { error: 'Ein Kauf läuft gerade schon. Bitte schließ ihn zuerst ab.' };
  if (!(await connect())) return unreachable();
  const sku = storeSku(tier, interval);

  let google: RequestSubscriptionAndroidProps | undefined;
  if (platform === 'android') {
    if (!offers[sku]) await loadStorePrices();
    // Stufe oder Zeitraum wechseln: altes Abo ersetzen (Restzeit wird angerechnet), nicht ein zweites kaufen
    const owned = await getAvailablePurchases().catch(() => [] as Purchase[]);
    const old = owned.find((p) => isStoreSku(p.productId) && p.productId !== sku && p.purchaseToken);
    google = {
      skus: [sku],
      obfuscatedAccountId: userId,
      ...(offers[sku] ? { subscriptionOffers: [{ sku, offerToken: offers[sku] }] } : {}),
      ...(old?.purchaseToken
        ? {
            purchaseToken: old.purchaseToken,
            subscriptionProductReplacementParams: { oldProductId: old.productId, replacementMode: 'with-time-proration' as const },
          }
        : {}),
    };
  }

  const result = new Promise<StoreResult>((resolve) => {
    waiting = { sku, resolve, timer: setTimeout(() => settle({}), WAIT_MS) };
  });
  try {
    await requestPurchase({ request: { apple: { sku, appAccountToken: userId }, google }, type: 'subs' });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    settle(purchaseErrorOutcome(err.code, err.message, platform));
  }
  return result;
}

/** „Käufe wiederherstellen“: beim Store nachfragen und jeden Lunaxora-Kauf neu prüfen lassen */
export async function restoreStorePurchases(): Promise<StoreResult> {
  if (!(await connect())) return unreachable();
  try {
    await restorePurchases(); // iPhone: fragt evtl. nach dem Apple-Account-Passwort
  } catch (e) {
    const r = purchaseErrorOutcome((e as { code?: string }).code, (e as Error).message, platform);
    if (r.cancelled) return r;
    console.warn('[Store] wiederherstellen', e);
  }
  let owned: Purchase[];
  try {
    owned = await getAvailablePurchases();
  } catch (e) {
    console.warn('[Store] Käufe lesen', e);
    return unreachable();
  }
  const results = await Promise.all(owned.filter((p) => isStoreSku(p.productId)).map(processPurchase));
  return mergeResults(results);
}

export async function openStoreSubscriptions(sku?: string | null): Promise<void> {
  try {
    await connect();
    await deepLinkToSubscriptions(platform === 'android' ? { packageNameAndroid: PACKAGE, skuAndroid: sku ?? undefined } : undefined);
  } catch (e) {
    console.warn('[Store] Abo-Verwaltung', e);
    await Linking.openURL(
      platform === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : `https://play.google.com/store/account/subscriptions?package=${PACKAGE}${sku ? `&sku=${encodeURIComponent(sku)}` : ''}`,
    );
  }
}

/**
 * In PlanProvider: Käufe annehmen, die ohne „Kaufen“-Tippen ankommen (App abgebrochen,
 * „Kaufen fragen“ bestätigt, Wechsel im Store …) und danach das Abo neu laden.
 */
export function useStoreSync(userId: string, onChange: () => void): void {
  useEffect(() => {
    if (!userId) return;
    planChanged = onChange;
    const updates = purchaseUpdatedListener(onUpdate);
    const errors = purchaseErrorListener(onError);
    void connect();
    return () => {
      updates.remove();
      errors.remove();
      if (planChanged === onChange) planChanged = null;
    };
  }, [userId, onChange]);
}

export function onStoreNotice(fn: (result: StoreResult) => void): () => void {
  notices.add(fn);
  return () => {
    notices.delete(fn);
  };
}
