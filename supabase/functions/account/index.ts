/**
 * Server-Funktion "account": das eigene Konto in der App löschen
 * (App Store Richtlinie 5.1.1(v), Art. 17 DSGVO). Konten in auth.users löschen geht nur mit
 * dem Service-Schlüssel – deshalb hier und nicht in der App.
 *
 *   POST { mode: "check" }
 *        -> was beim Löschen passiert (für die Warnungen in der App):
 *           { email, blocked, subscription, companies, team_people, memberships }
 *   POST { mode: "delete", confirm: "<E-Mail des Kontos>" }
 *        1. prüfen: angemeldet, E-Mail richtig abgetippt, kein laufendes Stripe-Abo
 *           (sonst 409 subscription_active – erst kündigen, sonst bucht Stripe weiter ab)
 *        2. account_delete_prepare: Abo noch einmal prüfen, Missbrauchsschutz, Kündigung
 *           „ganzes Konto“ erledigt, Kalender-Links fremder Teams neu, Besitz an Dateien lösen
 *        3. TikTok-Zugang auch bei TikTok zurückziehen (über die Funktion "social", wenn verbunden)
 *        4. Belege ("receipts") und Dokumente ("business-files") aller eigenen Firmen im Speicher
 *           löschen (Ordner = Firmen-ID)
 *        5. Konto löschen (Auth-Admin-API) – alles Weitere löscht die Datenbank mit
 *           (on delete cascade, siehe 20261206090000_konto_loeschen.sql)
 *        -> { deleted: true }
 *
 * Unsere eigenen Rechnungen an den Kunden liegen bei Stripe und bleiben dort (Aufbewahrungspflicht).
 *
 * Einrichtung: supabase/README.md, Abschnitt 18. Vorher das Skript 20261206090000_konto_loeschen.sql
 * ausführen. „Verify JWT“ ausschalten – die Funktion prüft die Anmeldung selbst.
 * Keine eigenen Geheimnisse: SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase bereit.
 */

type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
};

type User = { id: string; email: string | null };

export type DeletionInfo = {
  subscription: {
    status: string;
    source: string;
    tier: string | null;
    current_period_end: string | null;
    /** Stripe-Abo läuft und ist nicht gekündigt */
    running: boolean;
    /** Abo über App Store / Google Play */
    store: boolean;
    /** Kündigung über lunaxora.de/kuendigen/ ist eingegangen, aber noch nicht eingetragen */
    cancel_pending: boolean;
  } | null;
  companies: { id: string; name: string | null; primary: boolean; members: number }[];
  team_people: number;
  memberships: { company_id: string; name: string | null }[];
};

/** Speicher mit Ordnern je Firma: Belege und Dokumente (Gewerbe, ELSTER, Verträge …) */
export const BUCKETS = ['receipts', 'business-files'] as const;
const PAGE = 1000;
/** höchstens so viele Seiten je Firma (= 50.000 Belege) */
const MAX_PAGES = 50;
const SOCIAL_TIMEOUT_MS = 8000;
/** Wer keine E-Mail-Adresse hat, tippt dieses Wort */
export const CONFIRM_WORD = 'LÖSCHEN';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-lunaxora-company',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

class Failure extends Error {
  status: number;
  code: string;
  detail?: string;
  constructor(status: number, code: string, detail?: string) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// Reine Helfer (mit Unit-Tests)
// ---------------------------------------------------------------------------

/** Hat der Nutzer die E-Mail seines Kontos richtig abgetippt? (Groß/klein und Leerzeichen egal) */
export function confirmMatches(typed: unknown, email: string | null): boolean {
  if (typeof typed !== 'string') return false;
  const t = typed.normalize('NFC').trim().toLowerCase();
  const expected = ((email ?? '').trim() || CONFIRM_WORD).normalize('NFC').toLowerCase();
  return t.length > 0 && t === expected;
}

/** Was verhindert das Löschen gerade? null = nichts */
export function blockedReason(info: Pick<DeletionInfo, 'subscription'> | null): 'subscription_active' | null {
  return info?.subscription?.running ? 'subscription_active' : null;
}

// ---------------------------------------------------------------------------
// Supabase
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

const base = (deps: Deps) => (deps.env('SUPABASE_URL') ?? '').replace(/\/+$/, '');
const short = async (res: Response) => `${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`.trim();

/** Datenbank-Funktion mit dem Service-Schlüssel aufrufen */
async function rpc<T>(deps: Deps, name: string, args: Record<string, unknown>): Promise<T> {
  const res = await deps.fetch(`${base(deps)}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serviceHeaders(deps),
    body: JSON.stringify(args),
  });
  if (res.ok) return (await res.json()) as T;
  const text = await res.text().catch(() => '');
  // Skript 20261206090000_konto_loeschen.sql fehlt noch
  if (res.status === 404 || /PGRST202|42883/.test(text)) throw new Failure(500, 'setup_missing', name);
  if (/subscription_active/.test(text)) throw new Failure(409, 'subscription_active');
  throw new Failure(500, 'db_error', `${name}: ${res.status} ${text.slice(0, 200)}`);
}

async function loadInfo(deps: Deps, user: User): Promise<DeletionInfo> {
  const info = await rpc<DeletionInfo | null>(deps, 'account_deletion_info', { p_user: user.id });
  if (!info) throw new Failure(404, 'user_not_found');
  return {
    subscription: info.subscription ?? null,
    companies: info.companies ?? [],
    team_people: info.team_people ?? 0,
    memberships: info.memberships ?? [],
  };
}

/**
 * Alle Dateien eines Ordners im Speicher löschen: Seite für Seite auflisten und löschen,
 * bis nichts mehr übrig ist. Gibt die Anzahl gelöschter Dateien zurück.
 */
export async function purgeFolder(deps: Deps, bucket: string, folder: string): Promise<number> {
  let removed = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const list = await deps.fetch(`${base(deps)}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: serviceHeaders(deps),
      body: JSON.stringify({ prefix: folder, limit: PAGE, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!list.ok) {
      const text = await list.text().catch(() => '');
      // Speicher gibt es (noch) nicht -> nichts zu löschen
      if (/bucket not found/i.test(text)) return removed;
      throw new Failure(502, 'storage_failed', `Liste ${folder}: ${list.status} ${text.slice(0, 200)}`);
    }
    const items = ((await list.json().catch(() => [])) as { name?: string; id?: string | null }[]) ?? [];
    // Unterordner (id null) gibt es hier nicht: <Firma>/<Datei>
    const paths = items.filter((i) => i?.name && i.id !== null).map((i) => `${folder}/${i.name}`);
    if (!paths.length) return removed;
    const del = await deps.fetch(`${base(deps)}/storage/v1/object/${bucket}`, {
      method: 'DELETE',
      headers: serviceHeaders(deps),
      body: JSON.stringify({ prefixes: paths }),
    });
    if (!del.ok) throw new Failure(502, 'storage_failed', `Löschen ${folder}: ${await short(del)}`);
    removed += paths.length;
    if (items.length < PAGE) return removed;
  }
  throw new Failure(502, 'storage_failed', `${folder}: zu viele Dateien`);
}

/**
 * TikTok: Zugang auch bei TikTok zurückziehen – über die Funktion "social" (die kennt den
 * Schlüssel der verschlüsselten Zugangsdaten). Nur „best effort“: klappt es nicht, löscht die
 * Datenbank die Verbindung trotzdem mit dem Konto.
 */
async function revokeTikTok(req: Request, deps: Deps, user: User): Promise<boolean> {
  try {
    const rows = await deps.fetch(
      `${base(deps)}/rest/v1/social_accounts?user_id=eq.${encodeURIComponent(user.id)}&platform=eq.tiktok&select=id&limit=1`,
      { headers: serviceHeaders(deps) },
    );
    if (!rows.ok) return false;
    const found = (await rows.json().catch(() => [])) as unknown[];
    if (!Array.isArray(found) || !found.length) return false;
    const res = await deps.fetch(`${base(deps)}/functions/v1/social`, {
      method: 'POST',
      headers: {
        Authorization: req.headers.get('Authorization') ?? '',
        apikey: req.headers.get('apikey') ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'disconnect', platform: 'tiktok' }),
      signal: AbortSignal.timeout(SOCIAL_TIMEOUT_MS),
    });
    return res.ok;
  } catch (e) {
    console.warn('account: TikTok trennen', String((e as Error)?.message ?? e).slice(0, 200));
    return false;
  }
}

async function deleteAuthUser(deps: Deps, userId: string) {
  const res = await deps.fetch(`${base(deps)}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: serviceHeaders(deps),
    body: JSON.stringify({ should_soft_delete: false }),
  });
  // schon weg (z. B. doppelt getippt) -> auch gut
  if (res.ok || res.status === 404) return;
  throw new Failure(500, 'delete_failed', await short(res));
}

// ---------------------------------------------------------------------------

async function check(user: User, deps: Deps): Promise<Response> {
  const info = await loadInfo(deps, user);
  return json(200, { email: user.email, blocked: blockedReason(info), ...info });
}

async function remove(req: Request, user: User, body: Record<string, unknown>, deps: Deps): Promise<Response> {
  if (!confirmMatches(body.confirm, user.email)) return json(400, { error: 'confirm_mismatch' });

  const info = await loadInfo(deps, user);
  const blocked = blockedReason(info);
  if (blocked) return json(409, { error: blocked, subscription: info.subscription });

  // prüft das Abo noch einmal in der Datenbank, bevor irgendetwas endgültig weg ist
  const prepared = await rpc<{ companies?: string[]; files_released?: number }>(deps, 'account_delete_prepare', {
    p_user: user.id,
  });

  const tiktok = await revokeTikTok(req, deps, user);

  // Belege und Dokumente aller eigenen Firmen (erste Firma = Konto-ID, weitere Firmen eigene IDs)
  const companies = new Set([...(prepared?.companies ?? []), ...info.companies.map((c) => c.id)]);
  let files = 0;
  for (const bucket of BUCKETS) for (const id of companies) files += await purgeFolder(deps, bucket, id);

  await deleteAuthUser(deps, user.id);

  console.log(
    'account: Konto gelöscht',
    JSON.stringify({ companies: info.companies.length, team_people: info.team_people, files, tiktok, released: prepared?.files_released ?? 0 }),
  );
  return json(200, { deleted: true, files });
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  if (!deps.env('SUPABASE_URL') || !deps.env('SUPABASE_SERVICE_ROLE_KEY')) return json(500, { error: 'not_configured' });

  try {
    const user = await signedInUser(req, deps);
    if (!user) return json(401, { error: 'not_signed_in' });
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: 'invalid_body' });
    }
    if (body?.mode === 'check') return await check(user, deps);
    if (body?.mode === 'delete') return await remove(req, user, body, deps);
    return json(400, { error: 'invalid_mode' });
  } catch (e) {
    if (e instanceof Failure) {
      if (e.status >= 500) console.error('account', e.code, e.detail ?? '');
      return json(e.status, { error: e.code, ...(e.detail ? { detail: e.detail } : {}) });
    }
    console.error('account', e);
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
