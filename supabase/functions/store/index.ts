/**
 * Server-Funktion "store": Abos aus den Handy-Apps (App Store und Google Play).
 *
 *   POST { platform: "ios", transactionId, originalTransactionId? }
 *   POST { platform: "android", productId, purchaseToken }
 *        Die App meldet einen Kauf (oder „Käufe wiederherstellen“). Die Funktion fragt direkt
 *        bei Apple bzw. Google nach, ob der Kauf echt ist und zu diesem Konto gehört, und trägt
 *        das Abo in public.subscriptions ein (source = 'apple' | 'google').
 *        -> 200 { ok: true, status, tier, current_period_end }   (erst dann schließt die App den Kauf ab)
 *        -> 200 { ok: true, pending: true }    Zahlung noch offen (z. B. „Kaufen fragen“ in der Familie)
 *        -> 200 { ok: true, ignored: true }    alter, abgelaufener Kauf – am Abo ändert sich nichts
 *        -> 403 other_account                  Kauf gehört zu einem anderen Lunaxora-Konto
 *        -> 409 admin_plan | other_subscription  schon ein anderes Abo (nicht doppelt zahlen)
 *        -> 404 not_found                      Apple/Google kennen den Kauf nicht
 *   POST /store/apple            <- App Store Server Notifications V2 ({ signedPayload })
 *   POST /store/google?key=…     <- Google Play: Echtzeit-Benachrichtigungen (Pub/Sub-Push)
 *        Verlängert, gekündigt, erstattet, abgelaufen … Die Meldung ist nur der Anlass: Die Funktion
 *        holt den aktuellen Stand immer selbst bei Apple bzw. Google (wie "billing" bei Stripe).
 *
 * Einrichtung: supabase/README.md, Abschnitt 20. „Verify JWT“ ausschalten – Apple und Google
 * melden sich nicht an; bei Käufen aus der App prüft die Funktion die Lunaxora-Anmeldung selbst.
 * Geheimnisse (Supabase -> Edge Functions -> Secrets):
 *   APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY   Schlüssel „In-App Purchase“ aus App Store Connect (.p8)
 *   APPLE_BUNDLE_ID              (optional, Standard de.lunaxora.app)
 *   GOOGLE_SERVICE_ACCOUNT_JSON  JSON-Schlüssel des Dienstkontos (Google Cloud), in der Play Console freigegeben
 *   GOOGLE_PACKAGE_NAME          (optional, Standard de.lunaxora.app)
 *   GOOGLE_RTDN_SECRET           langes Zufallswort; steht hinten in der Push-Adresse (?key=…)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
 * Produkte in beiden Stores mit denselben Namen wie die Stripe-Lookup-Keys:
 *   pro_month, pro_year, business_month, business_year, teams_month, teams_year
 *
 * Kein Paket nötig: die wenigen Aufrufe gehen direkt an die APIs (Schlüssel signiert mit WebCrypto).
 */

type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
};

export type Tier = 'pro' | 'business' | 'teams';
type Source = 'apple' | 'google';
type Environment = 'production' | 'sandbox' | 'test';
type User = { id: string };

type Row = {
  user_id: string;
  status: string;
  tier?: string;
  source?: string;
  current_period_end?: string | null;
  stripe_subscription_id?: string | null;
  store_original_id?: string | null;
};

/** Stand eines Store-Abos, frisch von Apple bzw. Google */
export type StoreState = {
  source: Source;
  /** Apple: originalTransactionId; Google: purchaseToken */
  originalId: string;
  /** Google: Token des alten Abos bei Stufenwechsel (linkedPurchaseToken) */
  linkedId: string | null;
  productId: string;
  tier: Tier | null;
  /** Lunaxora-Konto aus dem Kauf (Apple appAccountToken, Google obfuscatedAccountId) */
  account: string | null;
  environment: Environment;
  /** null = noch nichts ändern (Zahlung offen) */
  change: { status: 'active' | 'canceled' | 'expired'; current_period_end: string | null } | null;
  /** Google: Kauf noch nicht bestätigt (sonst erstattet Google ihn nach 3 Tagen) */
  needsAck: boolean;
};

export const PRODUCTS = ['pro_month', 'pro_year', 'business_month', 'business_year', 'teams_month', 'teams_year'] as const;

const APPLE_HOSTS: Record<'production' | 'sandbox', string> = {
  production: 'https://api.storekit.apple.com',
  sandbox: 'https://api.storekit-sandbox.apple.com',
};
const GOOGLE_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const DAY = 86_400_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lunaxora-company',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class StoreError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Reine Helfer (mit Unit-Tests)
// ---------------------------------------------------------------------------

/** Produkt -> Stufe („business_year“ -> business); unbekannte Produkte: null */
export function tierOf(productId: string | null | undefined): Tier | null {
  if (!productId || !(PRODUCTS as readonly string[]).includes(productId)) return null;
  return productId.split('_')[0] as Tier;
}

const iso = (ms: number | null | undefined) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null);

function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Inhalt eines JWS (Apple signiert Kauf- und Verlängerungsdaten so) lesen – ohne Prüfung der
 * Signatur. Das ist hier nur sicher, weil die Daten direkt von Apples Server kommen (HTTPS,
 * eigener Schlüssel) oder – bei Meldungen – nur als Anlass dienen, den Stand selbst zu holen.
 */
export function decodeJws<T = Record<string, unknown>>(jws: unknown): T | null {
  if (typeof jws !== 'string') return null;
  const parts = jws.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(new TextDecoder().decode(b64urlBytes(parts[1]))) as T;
  } catch {
    return null;
  }
}

/** PEM (auch mit „\n“ als Text, wie beim Einfügen ins Secret-Feld) -> DER-Bytes */
export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/\\n/g, '\n')
    .replace(/-----(BEGIN|END)[^-]+-----/g, '')
    .replace(/\s+/g, '');
  return b64urlBytes(body.replace(/\+/g, '-').replace(/\//g, '_'));
}

type AppleTransaction = {
  transactionId?: string;
  originalTransactionId?: string;
  bundleId?: string;
  productId?: string;
  expiresDate?: number;
  appAccountToken?: string;
  revocationDate?: number;
  environment?: string;
};
type AppleRenewal = {
  autoRenewStatus?: number;
  gracePeriodExpiresDate?: number;
  appAccountToken?: string;
};
type AppleStatusResponse = {
  environment?: string;
  bundleId?: string;
  data?: {
    lastTransactions?: {
      originalTransactionId?: string;
      status?: number;
      signedTransactionInfo?: string;
      signedRenewalInfo?: string;
    }[];
  }[];
};

/**
 * Antwort von „Get All Subscription Statuses“ -> Stand des Abos.
 * status: 1 aktiv, 2 abgelaufen, 3 Zahlung wird nachgeholt (ohne Kulanzzeit), 4 Kulanzzeit, 5 erstattet/entzogen.
 * wanted: gesuchte originalTransactionId (sonst das laufende bzw. erste Abo der App).
 */
export function appleState(
  res: AppleStatusResponse,
  env: 'production' | 'sandbox',
  bundleId: string,
  wanted: string | null,
): StoreState | null {
  const items = (res.data ?? [])
    .flatMap((g) => g.lastTransactions ?? [])
    .map((item) => ({
      item,
      tx: decodeJws<AppleTransaction>(item.signedTransactionInfo),
      renewal: decodeJws<AppleRenewal>(item.signedRenewalInfo),
    }))
    .filter((x) => x.tx && x.tx.bundleId === bundleId && x.tx.originalTransactionId);
  const pick =
    (wanted && items.find((x) => x.tx!.originalTransactionId === wanted || x.item.originalTransactionId === wanted)) ||
    items.find((x) => x.item.status === 1 || x.item.status === 4) ||
    items[0];
  if (!pick) return null;
  const tx = pick.tx!;
  const renewal = pick.renewal ?? {};
  const productId = tx.productId ?? '';
  const end = iso(tx.expiresDate);
  let change: StoreState['change'];
  if (tx.revocationDate || pick.item.status === 5) {
    change = { status: 'expired', current_period_end: iso(tx.revocationDate) ?? end };
  } else if (pick.item.status === 1) {
    change = { status: renewal.autoRenewStatus === 0 ? 'canceled' : 'active', current_period_end: end };
  } else if (pick.item.status === 4) {
    // Kulanzzeit: Apple versucht die Zahlung noch, der Kunde behält das Abo bis zum Ende der Kulanzzeit
    change = { status: 'active', current_period_end: iso(renewal.gracePeriodExpiresDate) ?? end };
  } else {
    change = { status: 'expired', current_period_end: end };
  }
  const account = (tx.appAccountToken || renewal.appAccountToken || '').toLowerCase() || null;
  return {
    source: 'apple',
    originalId: tx.originalTransactionId!,
    linkedId: null,
    productId,
    tier: tierOf(productId),
    account,
    environment: env,
    change,
    needsAck: false,
  };
}

type GoogleSubscription = {
  subscriptionState?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: { productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }[];
};

/** Antwort von purchases.subscriptionsv2.get -> Stand des Abos */
export function googleState(sub: GoogleSubscription, token: string, now: number): StoreState {
  const line = sub.lineItems?.[0] ?? {};
  const productId = line.productId ?? '';
  const expiry = line.expiryTime ? Date.parse(line.expiryTime) : NaN;
  const end = iso(Number.isFinite(expiry) ? expiry : null);
  let change: StoreState['change'];
  switch (sub.subscriptionState) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      change = { status: line.autoRenewingPlan?.autoRenewEnabled === false ? 'canceled' : 'active', current_period_end: end };
      break;
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      // Google versucht die Zahlung noch: mindestens einen Tag weiter freischalten, die nächste Meldung kommt
      change = { status: 'active', current_period_end: iso(Math.max(Number.isFinite(expiry) ? expiry : 0, now + DAY)) };
      break;
    case 'SUBSCRIPTION_STATE_CANCELED':
      // gekündigt, aber bis zum Laufzeitende bezahlt
      change = { status: Number.isFinite(expiry) && expiry > now ? 'canceled' : 'expired', current_period_end: end };
      break;
    case 'SUBSCRIPTION_STATE_ON_HOLD':
    case 'SUBSCRIPTION_STATE_PAUSED':
    case 'SUBSCRIPTION_STATE_EXPIRED':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      change = { status: 'expired', current_period_end: end };
      break;
    default:
      change = null; // PENDING: Zahlung noch offen
  }
  const account = (sub.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? '').toLowerCase() || null;
  return {
    source: 'google',
    originalId: token,
    linkedId: sub.linkedPurchaseToken ?? null,
    productId,
    tier: tierOf(productId),
    account,
    environment: sub.testPurchase ? 'test' : 'production',
    change,
    needsAck: sub.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING',
  };
}

/** Läuft das Abo dieser Zeile noch (bezahlt bzw. bis zum Laufzeitende)? */
function running(row: Row, now: number): boolean {
  const end = row.current_period_end ? Date.parse(row.current_period_end) : null;
  if (row.status === 'active') return end === null || end > now;
  if (row.status === 'canceled') return end !== null && end > now;
  return false;
}

/** Läuft für diese Zeile ein Abo über App Store oder Google Play? (dann nicht noch per Stripe verkaufen) */
export function hasRunningStoreSubscription(row: Row | null | undefined, now: number): boolean {
  return !!row && (row.source === 'apple' || row.source === 'google') && running(row, now);
}

export type Decision =
  | { action: 'save'; change: Record<string, unknown> }
  | { action: 'skip'; reason: 'pending' | 'old_purchase' }
  | { action: 'conflict'; error: 'admin_plan' | 'other_subscription'; with?: string };

/**
 * Was tun mit dem Store-Abo für diese Zeile? Nie zwei bezahlte Abos nebeneinander:
 * Admin-Zugang und laufendes Stripe-Abo bleiben, ein laufendes anderes Store-Abo auch.
 * Ein alter, abgelaufener Kauf (z. B. beim Wiederherstellen) ändert nichts.
 */
export function decide(row: Row | null, state: StoreState, now: number): Decision {
  if (!state.change) return { action: 'skip', reason: 'pending' };
  const sameSub =
    !!row?.store_original_id &&
    row.source === state.source &&
    (row.store_original_id === state.originalId || (!!state.linkedId && row.store_original_id === state.linkedId));
  const newRuns =
    state.change.status !== 'expired' &&
    (state.change.current_period_end === null || Date.parse(state.change.current_period_end) > now);

  if (row && !sameSub) {
    if (row.source === 'admin') return { action: 'conflict', error: 'admin_plan' };
    const paidElsewhere = (row.source === 'stripe' && !!row.stripe_subscription_id) || row.source === 'apple' || row.source === 'google';
    if (paidElsewhere && running(row, now)) {
      return newRuns ? { action: 'conflict', error: 'other_subscription', with: row.source } : { action: 'skip', reason: 'old_purchase' };
    }
  }
  // abgelaufener Kauf, der nicht (mehr) zu diesem Konto-Abo gehört: Testphase, Gutschein usw. nicht anfassen
  if (!newRuns && !sameSub) return { action: 'skip', reason: 'old_purchase' };
  return {
    action: 'save',
    change: {
      status: state.change.status,
      current_period_end: state.change.current_period_end,
      tier: state.tier,
      source: state.source,
      store_original_id: state.originalId,
      store_product_id: state.productId,
      store_environment: state.environment,
      // ein altes Stripe-Abo hängt nicht mehr an dieser Zeile (der Stripe-Kunde bleibt)
      stripe_subscription_id: null,
    },
  };
}

/** Vergleich ohne frühen Abbruch */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Supabase (Anmeldung prüfen, Tabelle subscriptions mit dem Service-Schlüssel)
// ---------------------------------------------------------------------------

async function signedInUser(req: Request, deps: Deps): Promise<User | null> {
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey');
  const url = deps.env('SUPABASE_URL');
  if (!auth?.startsWith('Bearer ') || !apikey || !url) return null;
  const res = await deps.fetch(`${url}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!res.ok) return null;
  const u = (await res.json().catch(() => null)) as { id?: string } | null;
  return u?.id ? { id: u.id.toLowerCase() } : null;
}

function serviceHeaders(deps: Deps): Record<string, string> {
  const key = deps.env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function loadRow(deps: Deps, filter: string): Promise<Row | null> {
  const res = await deps.fetch(`${deps.env('SUPABASE_URL')}/rest/v1/subscriptions?${filter}&select=*&limit=1`, {
    headers: serviceHeaders(deps),
  });
  if (!res.ok) throw new Error(`subscriptions lesen: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const rows = (await res.json()) as Row[];
  return rows[0] ?? null;
}

const byUser = (id: string) => `user_id=eq.${encodeURIComponent(id)}`;
const byStore = (source: Source, id: string) =>
  `source=eq.${source}&store_original_id=eq.${encodeURIComponent(id)}`;

/** Eintrag ändern oder anlegen; false = Konto gibt es nicht (mehr) */
async function saveRow(deps: Deps, userId: string, exists: boolean, change: Record<string, unknown>): Promise<boolean> {
  const base = `${deps.env('SUPABASE_URL')}/rest/v1/subscriptions`;
  const body = { ...change, updated_at: new Date(deps.now?.() ?? Date.now()).toISOString() };
  const res = exists
    ? await deps.fetch(`${base}?${byUser(userId)}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders(deps), Prefer: 'return=minimal' },
        body: JSON.stringify(body),
      })
    : await deps.fetch(base, {
        method: 'POST',
        headers: { ...serviceHeaders(deps), Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, ...body }),
      });
  if (res.ok) return true;
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  // Konto gelöscht (Fremdschlüssel 23503): Meldung bestätigen, sonst wiederholt der Store sie tagelang
  if (!exists && res.status === 409 && detail.includes('23503')) return false;
  // dasselbe Store-Abo hängt schon an einem anderen Konto (eindeutiger Index 23505)
  if (res.status === 409 && detail.includes('23505')) throw new StoreError(403, 'other_account');
  throw new Error(`subscriptions speichern: ${res.status} ${detail}`);
}

// ---------------------------------------------------------------------------
// Apple: App Store Server API
// ---------------------------------------------------------------------------

const appleBundle = (deps: Deps) => deps.env('APPLE_BUNDLE_ID') || 'de.lunaxora.app';
const appleReady = (deps: Deps) =>
  !!(deps.env('APPLE_IAP_KEY_ID') && deps.env('APPLE_IAP_ISSUER_ID') && deps.env('APPLE_IAP_PRIVATE_KEY'));

/** Anmeldung bei Apple: JWT mit ES256, signiert mit dem .p8-Schlüssel aus App Store Connect */
export async function appleJwt(deps: Deps): Promise<string> {
  const iat = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const header = { alg: 'ES256', kid: deps.env('APPLE_IAP_KEY_ID'), typ: 'JWT' };
  const payload = { iss: deps.env('APPLE_IAP_ISSUER_ID'), iat, exp: iat + 1200, aud: 'appstoreconnect-v1', bid: appleBundle(deps) };
  const input = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('pkcs8', pemToDer(deps.env('APPLE_IAP_PRIVATE_KEY') ?? ''), { name: 'ECDSA', namedCurve: 'P-256' }, false, [
      'sign',
    ]);
  } catch {
    throw new StoreError(500, 'apple_key_invalid');
  }
  // WebCrypto liefert die Signatur schon im JWS-Format (r||s, 64 Bytes)
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)));
  return `${input}.${b64url(sig)}`;
}

/**
 * Alle Abos des Apple-Kunden zu einer Transaktions-ID holen. Erst echte Käufe, dann Testkäufe
 * (App-Prüfung und TestFlight kaufen in der Sandbox); bei Meldungen zuerst die genannte Umgebung.
 */
async function appleStatuses(
  deps: Deps,
  anyId: string,
  first: 'production' | 'sandbox' = 'production',
): Promise<{ env: 'production' | 'sandbox'; data: AppleStatusResponse } | null> {
  const order: ('production' | 'sandbox')[] = first === 'sandbox' ? ['sandbox', 'production'] : ['production', 'sandbox'];
  const jwt = await appleJwt(deps);
  for (const env of order) {
    const res = await deps.fetch(`${APPLE_HOSTS[env]}/inApps/v1/subscriptions/${encodeURIComponent(anyId)}`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    if (res.ok) return { env, data: (await res.json()) as AppleStatusResponse };
    if (res.status === 404) continue; // in dieser Umgebung unbekannt
    const detail = (await res.text().catch(() => '')).slice(0, 200);
    if (res.status === 401) throw new StoreError(500, 'apple_auth', detail || 'Apple: Schlüssel abgelehnt');
    if (res.status === 400) return null; // ungültige Transaktions-ID
    throw new StoreError(502, 'store_error', `Apple ${res.status} ${detail}`);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Google: Play Developer API
// ---------------------------------------------------------------------------

const googlePackage = (deps: Deps) => deps.env('GOOGLE_PACKAGE_NAME') || 'de.lunaxora.app';
let googleToken: { token: string; until: number; account: string } | null = null;

/** Nur für Tests: zwischengespeicherte Google-Anmeldung vergessen */
export function resetStoreCache() {
  googleToken = null;
}

/** Anmeldung bei Google: JWT (RS256) des Dienstkontos gegen einen Zugriffs-Token tauschen */
async function googleAccessToken(deps: Deps): Promise<string> {
  const now = deps.now?.() ?? Date.now();
  let account: { client_email?: string; private_key?: string };
  try {
    account = JSON.parse(deps.env('GOOGLE_SERVICE_ACCOUNT_JSON') ?? '');
  } catch {
    throw new StoreError(500, 'google_key_invalid');
  }
  if (!account.client_email || !account.private_key) throw new StoreError(500, 'google_key_invalid');
  if (googleToken && googleToken.account === account.client_email && googleToken.until > now + 60_000) return googleToken.token;
  const iat = Math.floor(now / 1000);
  const input = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
    JSON.stringify({ iss: account.client_email, scope: GOOGLE_SCOPE, aud: GOOGLE_TOKEN_URL, iat, exp: iat + 3600 }),
  )}`;
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('pkcs8', pemToDer(account.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new StoreError(500, 'google_key_invalid');
  }
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input)));
  const res = await deps.fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${input}.${b64url(sig)}` }).toString(),
  });
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!res.ok || !data?.access_token) throw new StoreError(500, 'google_auth', `Google-Anmeldung: ${res.status}`);
  googleToken = { token: data.access_token, until: now + (data.expires_in ?? 3600) * 1000, account: account.client_email };
  return data.access_token;
}

async function googleSubscription(deps: Deps, token: string): Promise<GoogleSubscription | null> {
  const access = await googleAccessToken(deps);
  const res = await deps.fetch(
    `${GOOGLE_API}/${encodeURIComponent(googlePackage(deps))}/purchases/subscriptionsv2/tokens/${encodeURIComponent(token)}`,
    { headers: { Authorization: `Bearer ${access}` } },
  );
  if (res.ok) return (await res.json()) as GoogleSubscription;
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  if (res.status === 400 || res.status === 404 || res.status === 410) return null; // unbekannter oder zu alter Token
  if (res.status === 401 || res.status === 403) throw new StoreError(500, 'google_auth', `Google ${res.status} ${detail}`);
  throw new StoreError(502, 'store_error', `Google ${res.status} ${detail}`);
}

/** Kauf bei Google bestätigen (ohne Bestätigung erstattet Google ihn nach 3 Tagen) – Fehler nur notieren */
async function googleAcknowledge(deps: Deps, state: StoreState): Promise<boolean> {
  try {
    const access = await googleAccessToken(deps);
    const res = await deps.fetch(
      `${GOOGLE_API}/${encodeURIComponent(googlePackage(deps))}/purchases/subscriptions/${encodeURIComponent(
        state.productId,
      )}/tokens/${encodeURIComponent(state.originalId)}:acknowledge`,
      { method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' }, body: '{}' },
    );
    if (!res.ok) console.warn('store: Google-Bestätigung', res.status, (await res.text().catch(() => '')).slice(0, 200));
    return res.ok;
  } catch (e) {
    console.warn('store: Google-Bestätigung', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Abo eintragen
// ---------------------------------------------------------------------------

/**
 * Stand eintragen. userId bekannt (Kauf aus der App) oder unbekannt (Meldung von Apple/Google):
 * dann über das gemerkte Store-Abo, beim Stufenwechsel über das alte, sonst über das Konto im Kauf.
 */
async function apply(
  deps: Deps,
  state: StoreState,
  userId: string | null,
): Promise<{ decision: Decision; userId: string | null; saved: boolean }> {
  const now = deps.now?.() ?? Date.now();
  let row: Row | null = null;
  let uid = userId;
  if (uid) {
    const owner = await loadRow(deps, byStore(state.source, state.originalId));
    if (owner && owner.user_id !== uid) throw new StoreError(403, 'other_account');
    row = await loadRow(deps, byUser(uid));
  } else {
    row = await loadRow(deps, byStore(state.source, state.originalId));
    if (!row && state.linkedId) row = await loadRow(deps, byStore(state.source, state.linkedId));
    if (!row && state.account && UUID.test(state.account)) row = await loadRow(deps, byUser(state.account));
    uid = row?.user_id ?? (state.account && UUID.test(state.account) ? state.account : null);
  }
  if (!uid) return { decision: { action: 'skip', reason: 'old_purchase' }, userId: null, saved: false };
  const decision = decide(row, state, now);
  if (decision.action !== 'save') return { decision, userId: uid, saved: false };
  const saved = await saveRow(deps, uid, !!row, decision.change);
  if (saved && state.needsAck) await googleAcknowledge(deps, state);
  return { decision, userId: uid, saved };
}

async function verify(user: User, body: Record<string, unknown>, deps: Deps): Promise<Response> {
  let state: StoreState | null = null;
  if (body.platform === 'ios') {
    const tx = typeof body.transactionId === 'string' ? body.transactionId.trim() : '';
    const original = typeof body.originalTransactionId === 'string' ? body.originalTransactionId.trim() : '';
    if (!/^\d{1,40}$/.test(tx) || (original && !/^\d{1,40}$/.test(original))) return json(400, { error: 'invalid_body' });
    if (!appleReady(deps)) return json(500, { error: 'store_not_configured', platform: 'ios' });
    const found = await appleStatuses(deps, tx);
    if (found) state = appleState(found.data, found.env, appleBundle(deps), original || null);
  } else if (body.platform === 'android') {
    const token = typeof body.purchaseToken === 'string' ? body.purchaseToken.trim() : '';
    if (!token || token.length > 512 || !/^[\w.\-:]+$/.test(token)) return json(400, { error: 'invalid_body' });
    if (!deps.env('GOOGLE_SERVICE_ACCOUNT_JSON')) return json(500, { error: 'store_not_configured', platform: 'android' });
    const sub = await googleSubscription(deps, token);
    if (sub) state = googleState(sub, token, deps.now?.() ?? Date.now());
  } else {
    return json(400, { error: 'invalid_body' });
  }

  if (!state) return json(404, { error: 'not_found' });
  if (!state.tier) return json(400, { error: 'unknown_product', product: state.productId });
  // Kauf mit einem anderen Lunaxora-Konto (z. B. gleiches Apple-ID, anderes Konto angemeldet)
  if (state.account && state.account !== user.id) return json(403, { error: 'other_account' });

  const { decision } = await apply(deps, state, user.id);
  if (decision.action === 'conflict') return json(409, { error: decision.error, with: decision.with ?? null });
  if (decision.action === 'skip') return json(200, decision.reason === 'pending' ? { ok: true, pending: true } : { ok: true, ignored: true });
  const c = decision.change;
  return json(200, { ok: true, status: c.status, tier: c.tier, current_period_end: c.current_period_end });
}

// ---------------------------------------------------------------------------
// Meldungen von Apple und Google
// ---------------------------------------------------------------------------

/** Meldung eintragen; Konflikte nur notieren (eine Wiederholung durch Apple/Google änderte nichts) */
async function applyNotification(deps: Deps, where: string, state: StoreState) {
  try {
    const r = await apply(deps, state, null);
    if (r.decision.action === 'conflict')
      console.warn(`store: ${where} – anderes Abo läuft, nicht eingetragen`, r.decision.error, r.userId, state.productId);
    else if (!r.userId) console.warn(`store: ${where} – kein Konto zum Kauf gefunden`, state.productId);
  } catch (e) {
    if (e instanceof StoreError && e.status === 403) console.warn(`store: ${where} – Abo gehört schon zu einem anderen Konto`);
    else throw e;
  }
}

async function appleNotification(req: Request, deps: Deps): Promise<Response> {
  if (!appleReady(deps)) return json(500, { error: 'store_not_configured', platform: 'ios' });
  const body = (await req.json().catch(() => null)) as { signedPayload?: string } | null;
  const note = decodeJws<{ notificationType?: string; data?: { bundleId?: string; environment?: string; signedTransactionInfo?: string } }>(
    body?.signedPayload,
  );
  if (!note) return json(400, { error: 'invalid_body' });
  if (note.notificationType === 'TEST') return json(200, { received: true, test: true });
  const tx = decodeJws<AppleTransaction>(note.data?.signedTransactionInfo);
  // andere App oder keine Abo-Meldung (z. B. Zusammenfassung): nur bestätigen
  const bundle = appleBundle(deps);
  if (!tx?.originalTransactionId || tx.bundleId !== bundle || (note.data?.bundleId && note.data.bundleId !== bundle))
    return json(200, { received: true });
  if (!/^\d{1,40}$/.test(tx.originalTransactionId)) return json(200, { received: true });
  const first = String(note.data?.environment ?? '').toLowerCase() === 'sandbox' ? 'sandbox' : 'production';
  const found = await appleStatuses(deps, tx.originalTransactionId, first);
  const state = found ? appleState(found.data, found.env, appleBundle(deps), tx.originalTransactionId) : null;
  if (!state?.tier) {
    console.warn('store: Apple-Meldung ohne passendes Abo', note.notificationType, state?.productId);
    return json(200, { received: true });
  }
  await applyNotification(deps, `Apple ${note.notificationType}`, state);
  return json(200, { received: true });
}

async function googleNotification(req: Request, deps: Deps): Promise<Response> {
  const secret = deps.env('GOOGLE_RTDN_SECRET');
  if (!secret || !deps.env('GOOGLE_SERVICE_ACCOUNT_JSON')) return json(500, { error: 'store_not_configured', platform: 'android' });
  if (!safeEqual(new URL(req.url).searchParams.get('key') ?? '', secret)) return json(401, { error: 'wrong_key' });
  const body = (await req.json().catch(() => null)) as { message?: { data?: string } } | null;
  let note: {
    packageName?: string;
    testNotification?: unknown;
    subscriptionNotification?: { notificationType?: number; purchaseToken?: string };
    voidedPurchaseNotification?: { purchaseToken?: string; productType?: number };
  } | null = null;
  try {
    note = body?.message?.data ? JSON.parse(new TextDecoder().decode(b64urlBytes(body.message.data))) : null;
  } catch {
    note = null;
  }
  // Pub/Sub: 2xx = angekommen; kaputte Meldungen nicht endlos wiederholen lassen
  if (!note || note.packageName !== googlePackage(deps)) return json(200, { received: true });
  if (note.testNotification) return json(200, { received: true, test: true });
  const token =
    note.subscriptionNotification?.purchaseToken ??
    (note.voidedPurchaseNotification?.productType === 1 ? note.voidedPurchaseNotification.purchaseToken : undefined);
  if (!token || token.length > 512) return json(200, { received: true });
  const sub = await googleSubscription(deps, token);
  const state = sub ? googleState(sub, token, deps.now?.() ?? Date.now()) : null;
  if (!state?.tier) {
    console.warn('store: Google-Meldung ohne passendes Abo', note.subscriptionNotification?.notificationType, state?.productId);
    return json(200, { received: true });
  }
  await applyNotification(deps, `Google ${note.subscriptionNotification?.notificationType ?? 'voided'}`, state);
  return json(200, { received: true });
}

// ---------------------------------------------------------------------------

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const last = new URL(req.url).pathname.split('/').pop();
  try {
    // Fehler (500/502) bei Meldungen: Apple bzw. Google versuchen es später noch einmal
    if (last === 'apple') return await appleNotification(req, deps);
    if (last === 'google') return await googleNotification(req, deps);

    const user = await signedInUser(req, deps);
    if (!user) return json(401, { error: 'not_signed_in' });
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_body' });
    }
    return await verify(user, body ?? {}, deps);
  } catch (e) {
    if (e instanceof StoreError) {
      if (e.status >= 500) console.error('store', e.code, e.message);
      return json(e.status, { error: e.code, ...(e.status >= 500 && e.message !== e.code ? { detail: e.message.slice(0, 300) } : {}) });
    }
    console.error('store', e);
    return json(500, { error: 'unexpected', detail: String((e as Error)?.message ?? e).slice(0, 200) });
  }
}

// Im Supabase-Edge-Runtime (Deno) starten; in Tests wird nur handleRequest benutzt.
declare const Deno:
  | { serve?: (h: (req: Request) => Promise<Response>) => void; env: { get(key: string): string | undefined } }
  | undefined;
if (typeof Deno !== 'undefined' && Deno?.serve) {
  Deno.serve((req) => handleRequest(req, { env: (k) => Deno!.env.get(k), fetch }));
}
