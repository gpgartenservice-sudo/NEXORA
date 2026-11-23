/**
 * Server-Funktion "billing": Abo bezahlen mit Stripe.
 *
 *   POST { mode: "checkout", tier: "pro" | "business" | "teams", interval: "month" | "year" }
 *        -> { url } zur Stripe-Bezahlseite (hat der Nutzer schon ein laufendes Abo:
 *           { url, portal: true } zum Kundenportal – dort Stufe wechseln, nicht doppelt zahlen;
 *           läuft das Abo über App Store / Google Play: 409 store_plan)
 *   POST { mode: "portal" } -> { url } zum Stripe-Kundenportal (Abo kündigen, wechseln,
 *        Zahlungsart, Rechnungen)
 *   POST /billing/webhook   <- Stripe meldet Änderungen; die Funktion trägt sie in
 *        public.subscriptions ein (Status, Stufe, Laufzeitende) und jede bezahlte Rechnung
 *        (invoice.paid) in kosten.zahlungen – für die Einnahmen je Kunde (20261122090000_einnahmen.sql)
 *   GET  /billing/fertig?s=ok|abbruch|portal -> kurze Seite nach der Bezahlung
 *
 * Einrichtung: supabase/README.md, Abschnitt 14. „Verify JWT“ ausschalten – Stripe meldet
 * sich nicht an; bei checkout/portal prüft die Funktion die Lunaxora-Anmeldung selbst.
 * Geheimnisse (Supabase -> Edge Functions -> Secrets):
 *   STRIPE_SECRET_KEY      (Pflicht) Secret Key aus Stripe (sk_test_… zum Testen, sk_live_… echt)
 *   STRIPE_WEBHOOK_SECRET  (Pflicht) Signing Secret des Webhook-Endpunkts (whsec_…)
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY stellt Supabase selbst bereit.
 * Preise in Stripe mit Lookup-Keys: pro_month, pro_year, business_month, business_year, teams_month, teams_year.
 *
 * Kein Stripe-Paket nötig: die wenigen Aufrufe gehen direkt an die Stripe-API.
 */

type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
};

export type Tier = 'pro' | 'business' | 'teams';
export type Interval = 'month' | 'year';
type User = { id: string; email: string | null };
type SubscriptionRow = {
  user_id: string;
  status: string;
  tier?: string;
  source?: string;
  current_period_end?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
};

const STRIPE_API = 'https://api.stripe.com/v1';
const SIGNATURE_TOLERANCE = 300; // Sekunden – ältere Webhook-Aufrufe werden abgelehnt

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lunaxora-company',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const text = (status: number, body: string) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

const PAGES: Record<string, string> = {
  ok: 'Danke! Deine Zahlung ist angekommen – dein Abo wird in Lunaxora gleich freigeschaltet.\n\nDu kannst dieses Fenster schließen und zur App zurückkehren.',
  abbruch: 'Bezahlung abgebrochen – es wurde nichts berechnet.\n\nDu kannst dieses Fenster schließen und zur App zurückkehren.',
  portal: 'Fertig. Du kannst dieses Fenster schließen und zu Lunaxora zurückkehren.',
};

class StripeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Reine Helfer (mit Unit-Tests)
// ---------------------------------------------------------------------------

/** Lookup-Key des Preises in Stripe, z. B. "pro_month" */
export const lookupKey = (tier: Tier, interval: Interval) => `${tier}_${interval}`;

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Kommt der Webhook wirklich von Stripe? (Header Stripe-Signature: t=…,v1=…) */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string | undefined,
  nowSeconds: number,
): Promise<boolean> {
  if (!header || !secret) return false;
  const pairs = header.split(',').map((p) => {
    const i = p.indexOf('=');
    return [p.slice(0, i).trim(), p.slice(i + 1).trim()] as const;
  });
  const t = pairs.find(([k]) => k === 't')?.[1];
  const signatures = pairs.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !/^\d+$/.test(t) || !signatures.length) return false;
  if (Math.abs(nowSeconds - Number(t)) > SIGNATURE_TOLERANCE) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const expected = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  // Vergleich ohne frühen Abbruch
  return signatures.some((s) => {
    if (s.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < s.length; i++) diff |= s.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
}

type StripeSubscription = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end?: boolean;
  cancel_at?: number | null;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: { current_period_end?: number; price?: { lookup_key?: string | null } }[] };
};

type StripeRef = string | { id: string } | null | undefined;

type StripeInvoice = {
  id?: string;
  number?: string | null;
  customer?: StripeRef;
  amount_paid?: number;
  currency?: string;
  created?: number;
  status_transitions?: { paid_at?: number | null };
  /** ältere API-Versionen */
  subscription?: StripeRef;
  /** neuere API-Versionen */
  parent?: { subscription_details?: { subscription?: StripeRef } | null } | null;
};

const refId = (r: StripeRef) => (typeof r === 'string' ? r : r?.id) || undefined;

const iso = (seconds: number | null | undefined) => (seconds ? new Date(seconds * 1000).toISOString() : null);
const customerId = (c: StripeSubscription['customer']) => (typeof c === 'string' ? c : c?.id);

/**
 * Stripe-Abo -> Eintrag in public.subscriptions; null = (noch) nichts ändern
 * (z. B. Zahlung noch nicht abgeschlossen).
 * Laufzeitende: neuere Stripe-API-Versionen haben es am Posten, ältere am Abo.
 */
export function subscriptionRow(sub: StripeSubscription): Omit<SubscriptionRow, 'user_id'> | null {
  const item = sub.items?.data?.[0];
  const key = item?.price?.lookup_key ?? '';
  const tier: Tier = key.startsWith('teams') ? 'teams' : key.startsWith('business') ? 'business' : 'pro';
  const periodEnd = iso(item?.current_period_end ?? sub.current_period_end);
  const base = {
    tier,
    source: 'stripe',
    stripe_customer_id: customerId(sub.customer) ?? null,
    stripe_subscription_id: sub.id,
  };
  switch (sub.status) {
    case 'active':
    case 'trialing':
    case 'past_due': {
      // gekündigt zum Laufzeitende (oder zu einem festen Datum): bis dahin weiter Pro
      if (sub.cancel_at_period_end || sub.cancel_at) {
        const end = sub.cancel_at && periodEnd ? Math.min(sub.cancel_at * 1000, Date.parse(periodEnd)) : null;
        return { ...base, status: 'canceled', current_period_end: end ? new Date(end).toISOString() : periodEnd };
      }
      // past_due: Stripe versucht es noch einmal; ohne Zahlung endet Pro mit dem Laufzeitende
      return { ...base, status: 'active', current_period_end: periodEnd };
    }
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
    case 'paused':
      return { ...base, status: 'expired', current_period_end: periodEnd };
    default:
      return null; // incomplete: Zahlung läuft noch
  }
}

/** Läuft für diesen Eintrag ein Abo über App Store oder Google Play? (Funktion "store" – dann hier nichts verkaufen) */
export function hasRunningStoreSubscription(row: SubscriptionRow | null | undefined, now: number): boolean {
  if (!row || (row.source !== 'apple' && row.source !== 'google')) return false;
  const end = row.current_period_end ? Date.parse(row.current_period_end) : null;
  if (row.status === 'active') return end === null || end > now;
  if (row.status === 'canceled') return end !== null && end > now;
  return false;
}

/** Läuft für diesen Eintrag ein bezahltes Stripe-Abo? (dann nicht noch einmal verkaufen) */
export function hasRunningStripeSubscription(row: SubscriptionRow | null | undefined, now: number): boolean {
  if (!row?.stripe_subscription_id || row.source !== 'stripe') return false;
  const end = row.current_period_end ? Date.parse(row.current_period_end) : null;
  if (row.status === 'active') return end === null || end > now;
  if (row.status === 'canceled') return end !== null && end > now;
  return false;
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
  const u = (await res.json().catch(() => null)) as { id?: string; email?: string } | null;
  return u?.id ? { id: u.id, email: u.email ?? null } : null;
}

function serviceHeaders(deps: Deps): Record<string, string> {
  const key = deps.env('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  // neue Secret Keys (sb_secret_…) nur als apikey, alte service_role-Schlüssel (JWT) zusätzlich als Bearer
  return key.startsWith('sb_')
    ? { apikey: key, 'Content-Type': 'application/json' }
    : { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
}

async function loadRow(deps: Deps, filter: string): Promise<SubscriptionRow | null> {
  const res = await deps.fetch(`${deps.env('SUPABASE_URL')}/rest/v1/subscriptions?${filter}&select=*&limit=1`, {
    headers: serviceHeaders(deps),
  });
  if (!res.ok) throw new Error(`subscriptions lesen: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const rows = (await res.json()) as SubscriptionRow[];
  return rows[0] ?? null;
}

/** Eintrag ändern (oder anlegen, falls es noch keinen gibt) */
async function saveRow(deps: Deps, userId: string, exists: boolean, change: Record<string, unknown>) {
  const base = `${deps.env('SUPABASE_URL')}/rest/v1/subscriptions`;
  const body = JSON.stringify({ ...change, updated_at: new Date(deps.now?.() ?? Date.now()).toISOString() });
  const res = exists
    ? await deps.fetch(`${base}?user_id=eq.${encodeURIComponent(userId)}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders(deps), Prefer: 'return=minimal' },
        body,
      })
    : await deps.fetch(base, {
        method: 'POST',
        headers: { ...serviceHeaders(deps), Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, ...JSON.parse(body) }),
      });
  if (res.ok) return;
  const detail = (await res.text().catch(() => '')).slice(0, 200);
  // Konto inzwischen gelöscht (Fremdschlüssel 23503): nichts mehr einzutragen – sonst
  // wiederholt Stripe die Meldung tagelang (z. B. das Ende eines gekündigten Abos)
  if (!exists && res.status === 409 && detail.includes('23503')) {
    console.warn('billing: Konto gelöscht, Abo-Meldung übersprungen', userId);
    return;
  }
  throw new Error(`subscriptions speichern: ${res.status} ${detail}`);
}

// ---------------------------------------------------------------------------
// Stripe-API
// ---------------------------------------------------------------------------

async function stripe<T>(
  deps: Deps,
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, string> = {},
  idempotencyKey?: string,
): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${deps.env('STRIPE_SECRET_KEY')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  const res = await deps.fetch(`${STRIPE_API}/${path}${method === 'GET' && query ? `?${query}` : ''}`, {
    method,
    headers,
    body: method === 'POST' ? query : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!res.ok || !data) throw new StripeError(res.status, data?.error?.message ?? `HTTP ${res.status}`);
  return data;
}

const returnUrl = (deps: Deps, s: keyof typeof PAGES) => `${deps.env('SUPABASE_URL')}/functions/v1/billing/fertig?s=${s}`;

async function portalUrl(deps: Deps, customer: string): Promise<string> {
  const session = await stripe<{ url: string }>(deps, 'POST', 'billing_portal/sessions', {
    customer,
    return_url: returnUrl(deps, 'portal'),
    locale: 'de',
  });
  return session.url;
}

async function checkout(user: User, body: Record<string, unknown>, deps: Deps): Promise<Response> {
  const tier: Tier | null =
    body.tier === 'teams' ? 'teams' : body.tier === 'business' ? 'business' : body.tier === 'pro' ? 'pro' : null;
  const interval = body.interval === 'year' ? 'year' : body.interval === 'month' ? 'month' : null;
  if (!tier || !interval) return json(400, { error: 'invalid_plan' });

  const row = await loadRow(deps, `user_id=eq.${encodeURIComponent(user.id)}`);
  // Von Hand vergebenes Abo (Admin): nichts verkaufen, es soll nie etwas abgebucht werden
  if (row?.source === 'admin') return json(409, { error: 'admin_plan' });
  // Abo läuft über App Store / Google Play: dort ändern oder kündigen, nicht zusätzlich per Stripe zahlen
  if (hasRunningStoreSubscription(row, deps.now?.() ?? Date.now())) return json(409, { error: 'store_plan', store: row!.source });
  // Läuft schon ein Abo: Wechsel (z. B. Pro -> Business) im Kundenportal statt doppelt zu zahlen
  if (row?.stripe_customer_id && hasRunningStripeSubscription(row, deps.now?.() ?? Date.now())) {
    return json(200, { url: await portalUrl(deps, row.stripe_customer_id), portal: true });
  }

  let customer = row?.stripe_customer_id ?? null;
  if (!customer) {
    const created = await stripe<{ id: string }>(
      deps,
      'POST',
      'customers',
      { ...(user.email ? { email: user.email } : {}), 'metadata[user_id]': user.id, preferred_locales: 'de' },
      `customer-${user.id}`,
    );
    customer = created.id;
    await saveRow(deps, user.id, !!row, { stripe_customer_id: customer });
  }

  const prices = await stripe<{ data: { id: string }[] }>(deps, 'GET', 'prices', {
    'lookup_keys[]': lookupKey(tier, interval),
    active: 'true',
    limit: '1',
  });
  const price = prices.data?.[0]?.id;
  if (!price) return json(500, { error: 'price_missing', lookup_key: lookupKey(tier, interval) });

  const session = await stripe<{ url: string }>(deps, 'POST', 'checkout/sessions', {
    mode: 'subscription',
    customer,
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    client_reference_id: user.id,
    'metadata[user_id]': user.id,
    'subscription_data[metadata][user_id]': user.id,
    allow_promotion_codes: 'true',
    billing_address_collection: 'required',
    'customer_update[address]': 'auto',
    'customer_update[name]': 'auto',
    locale: 'de',
    success_url: returnUrl(deps, 'ok'),
    cancel_url: returnUrl(deps, 'abbruch'),
  });
  return json(200, { url: session.url });
}

async function portal(user: User, deps: Deps): Promise<Response> {
  const row = await loadRow(deps, `user_id=eq.${encodeURIComponent(user.id)}`);
  if (!row?.stripe_customer_id) return json(404, { error: 'no_customer' });
  return json(200, { url: await portalUrl(deps, row.stripe_customer_id) });
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

async function applySubscription(deps: Deps, sub: StripeSubscription, userHint?: string | null) {
  const change = subscriptionRow(sub);
  if (!change) return;
  const customer = customerId(sub.customer);
  let row: SubscriptionRow | null = null;
  let userId = sub.metadata?.user_id || userHint || null;
  if (userId) row = await loadRow(deps, `user_id=eq.${encodeURIComponent(userId)}`);
  else if (customer) {
    row = await loadRow(deps, `stripe_customer_id=eq.${encodeURIComponent(customer)}`);
    userId = row?.user_id ?? null;
  }
  if (!userId) {
    console.error('billing: kein Nutzer zu Stripe-Abo', sub.id, customer);
    return;
  }
  // Späte Meldung zu einem alten Abo darf ein neueres, laufendes nicht überschreiben
  if (row?.stripe_subscription_id && row.stripe_subscription_id !== sub.id && change.status !== 'active') return;
  // … auch kein Abo über App Store / Google Play (Funktion "store" hat die Stripe-Abo-ID dann geleert)
  if (row && row.stripe_subscription_id !== sub.id && change.status !== 'active' && hasRunningStoreSubscription(row, deps.now?.() ?? Date.now()))
    return;
  await saveRow(deps, userId, !!row, change);
}

/**
 * Bezahlte Rechnung -> kosten.zahlungen (Einnahmen je Kunde). Dieselbe Rechnung zählt nur
 * einmal (Rechnungs-ID). Fehlt das Skript noch, wird die Zahlung nur übersprungen.
 */
async function recordPayment(deps: Deps, inv: StripeInvoice) {
  const cents = inv.amount_paid ?? 0;
  if (!inv.id || cents <= 0 || (inv.currency && inv.currency.toLowerCase() !== 'eur')) return;
  const subId = refId(inv.subscription) ?? refId(inv.parent?.subscription_details?.subscription);
  const sub = subId ? await stripe<StripeSubscription>(deps, 'GET', `subscriptions/${encodeURIComponent(subId)}`) : null;
  let userId = sub?.metadata?.user_id || null;
  const customer = refId(inv.customer) ?? (sub ? customerId(sub.customer) : undefined);
  if (!userId && customer) userId = (await loadRow(deps, `stripe_customer_id=eq.${encodeURIComponent(customer)}`))?.user_id ?? null;
  if (!userId) {
    console.error('billing: kein Nutzer zu Rechnung', inv.id, customer);
    return;
  }
  // Lookup-Key wie „pro_year“ -> Stufe und Intervall
  const [tier, interval] = (sub?.items?.data?.[0]?.price?.lookup_key ?? '').split('_');
  const res = await deps.fetch(`${deps.env('SUPABASE_URL')}/rest/v1/rpc/log_payment`, {
    method: 'POST',
    headers: serviceHeaders(deps),
    body: JSON.stringify({
      p_user: userId,
      p_betrag: cents / 100,
      p_quelle: 'stripe',
      p_intervall: interval || null,
      p_stufe: tier || null,
      p_rechnung: inv.id,
      p_beschreibung: `Stripe-Rechnung ${inv.number ?? inv.id}`,
      p_bezahlt_am: iso(inv.status_transitions?.paid_at ?? inv.created),
    }),
  });
  if (res.status === 404) {
    console.warn('billing: Skript 20261122090000_einnahmen.sql fehlt – Zahlung nicht eingetragen', inv.id);
    return;
  }
  if (!res.ok) throw new Error(`Zahlung speichern: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
}

async function webhook(req: Request, deps: Deps): Promise<Response> {
  const payload = await req.text();
  const now = Math.floor((deps.now?.() ?? Date.now()) / 1000);
  const valid = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), deps.env('STRIPE_WEBHOOK_SECRET'), now);
  if (!valid) return json(400, { error: 'invalid_signature' });

  const event = JSON.parse(payload) as { type?: string; data?: { object?: Record<string, unknown> } };
  const obj = event.data?.object ?? {};
  switch (event.type) {
    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription' || typeof obj.subscription !== 'string') break;
      const sub = await stripe<StripeSubscription>(deps, 'GET', `subscriptions/${encodeURIComponent(obj.subscription)}`);
      await applySubscription(deps, sub, typeof obj.client_reference_id === 'string' ? obj.client_reference_id : null);
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Stripe hält die Reihenfolge der Meldungen nicht ein – deshalb immer den aktuellen Stand holen,
      // damit eine verspätete ältere Meldung keinen neueren Stand überschreibt
      if (typeof obj.id !== 'string') break;
      const sub = await stripe<StripeSubscription>(deps, 'GET', `subscriptions/${encodeURIComponent(obj.id)}`);
      await applySubscription(deps, sub);
      break;
    }
    case 'invoice.paid':
      await recordPayment(deps, obj as StripeInvoice);
      break;
  }
  return json(200, { received: true });
}

// ---------------------------------------------------------------------------

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const last = url.pathname.split('/').pop();

  if (req.method === 'GET') {
    if (last !== 'fertig') return text(404, 'Nicht gefunden.');
    return text(200, PAGES[url.searchParams.get('s') ?? ''] ?? PAGES.portal);
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!deps.env('STRIPE_SECRET_KEY')) return json(500, { error: 'stripe_not_configured' });

  try {
    if (last === 'webhook') return await webhook(req, deps);

    const user = await signedInUser(req, deps);
    if (!user) return json(401, { error: 'not_signed_in' });
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_body' });
    }
    if (body?.mode === 'checkout') return await checkout(user, body, deps);
    if (body?.mode === 'portal') return await portal(user, deps);
    return json(400, { error: 'invalid_mode' });
  } catch (e) {
    if (e instanceof StripeError) {
      console.error('Stripe', e.status, e.message);
      if (e.status === 401) return json(500, { error: 'invalid_stripe_key' });
      return json(502, { error: 'stripe_error', status: e.status, detail: e.message.slice(0, 300) });
    }
    console.error('billing', e);
    // 500 beim Webhook: Stripe versucht es später noch einmal
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
