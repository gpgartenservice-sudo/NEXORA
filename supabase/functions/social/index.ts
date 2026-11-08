/**
 * Lunaxora – TikTok & Instagram verbinden (Supabase Edge Function "social")
 *
 * - Anmeldung über die offiziellen Login-Seiten von TikTok bzw. Instagram (OAuth).
 *   Lunaxora bekommt nur Lese-Rechte: Profil, Follower, Videos/Posts und deren Zahlen.
 * - Die Zugangsdaten (Tokens) werden verschlüsselt in der Datenbank gespeichert;
 *   entschlüsseln kann sie nur diese Funktion (Schlüssel aus dem App-Secret der Plattform).
 * - "sync" holt Profilzahlen und die neuesten Videos/Posts und speichert sie mit den
 *   Rechten des angemeldeten Nutzers (Row Level Security bleibt aktiv).
 *
 * Einrichtung: siehe supabase/README.md (Abschnitt "TikTok & Instagram verbinden").
 * Geheimnisse (Supabase -> Edge Functions -> Secrets):
 *   TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET      (für TikTok)
 *   INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET       (für Instagram)
 *   SOCIAL_APP_ORIGINS   (optional) Web-Adressen der App für die Rückleitung, mit Komma getrennt
 *   TIKTOK_SCOPES / INSTAGRAM_SCOPES (optional) abweichende Berechtigungen
 *   INSTAGRAM_API_VERSION (optional) z. B. v25.0 – Standard: Version der Meta-App
 */

type Platform = 'tiktok' | 'instagram';
type Deps = {
  env: (key: string) => string | undefined;
  fetch: typeof fetch;
  now?: () => number;
};

const PLATFORMS: Platform[] = ['tiktok', 'instagram'];
const TIKTOK_SCOPES = 'user.info.basic,user.info.profile,user.info.stats,video.list';
const INSTAGRAM_SCOPES = 'instagram_business_basic,instagram_business_manage_insights';
const TIKTOK_PROFILE_FIELDS =
  'open_id,avatar_url,display_name,username,profile_deep_link,follower_count,following_count,likes_count,video_count';
const TIKTOK_BASIC_FIELDS = 'open_id,avatar_url,display_name';
/**
 * Bestätigungsdateien von TikTok (Developer-Portal › URL properties): TikTok prüft damit, dass die
 * Rückleitungs-Adresse uns gehört. Dateiname → Inhalt, genau wie in der heruntergeladenen Datei.
 * Nicht geheim – die Datei ist absichtlich öffentlich abrufbar.
 */
const TIKTOK_VERIFICATION = new Map<string, string>([
  ['tiktok8dNMQMbxTA4JNvPNsbsLdmVIDnjddSwV.txt', 'tiktok-developers-site-verification=8dNMQMbxTA4JNvPNsbsLdmVIDnjddSwV'],
]);
const TIKTOK_VIDEO_FIELDS =
  'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count';
const TIKTOK_PAGES = 3; // je 20 Videos
const INSTAGRAM_MEDIA_LIMIT = 50;
const INSTAGRAM_INSIGHTS_FOR = 25; // Zahlen (Aufrufe, Gespeichert, Geteilt) für die neuesten Posts
const STATE_MAX_AGE = 15 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const text = (status: number, body: string) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/** Fehler, die als verständliche Meldung an die App gehen */
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
// Verschlüsselung (Web Crypto): signierter "state", verschlüsselte Tokens
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s: string) {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function derive(secret: string, purpose: 'state' | 'tokens'): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'HKDF', false, ['deriveKey']);
  const params = { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('nexora-social-v1'), info: enc.encode(purpose) };
  return purpose === 'state'
    ? crypto.subtle.deriveKey(params, base, { name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify'])
    : crypto.subtle.deriveKey(params, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

type StatePayload = { u: string; p: Platform; n: string; t: number; r?: string };

export async function signState(payload: StatePayload, secret: string): Promise<string> {
  const body = b64u(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await derive(secret, 'state'), enc.encode(body));
  return `${body}.${b64u(new Uint8Array(sig))}`;
}

export async function readState(
  state: string,
  secretFor: (p: Platform) => string | undefined,
  now: number,
): Promise<StatePayload | null> {
  const [body, sig, extra] = state.split('.');
  if (!body || !sig || extra !== undefined) return null;
  let payload: StatePayload;
  try {
    payload = JSON.parse(dec.decode(fromB64u(body)));
  } catch {
    return null;
  }
  if (!payload || !PLATFORMS.includes(payload.p) || typeof payload.u !== 'string' || typeof payload.t !== 'number')
    return null;
  const secret = secretFor(payload.p);
  if (!secret) return null;
  let valid = false;
  try {
    valid = await crypto.subtle.verify('HMAC', await derive(secret, 'state'), fromB64u(sig), enc.encode(body));
  } catch {
    return null;
  }
  if (!valid || now - payload.t > STATE_MAX_AGE || payload.t > now + 60_000) return null;
  return payload;
}

export type Tokens = { access_token: string; refresh_token?: string; expires_at: number; refresh_expires_at?: number };

export async function sealTokens(tokens: Tokens, secret: string, aad: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    await derive(secret, 'tokens'),
    enc.encode(JSON.stringify(tokens)),
  );
  return `v1.${b64u(iv)}.${b64u(new Uint8Array(data))}`;
}

export async function openTokens(sealed: string | null, secret: string, aad: string): Promise<Tokens | null> {
  const [version, iv, data] = (sealed ?? '').split('.');
  if (version !== 'v1' || !iv || !data) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64u(iv), additionalData: enc.encode(aad) },
      await derive(secret, 'tokens'),
      fromB64u(data),
    );
    return JSON.parse(dec.decode(plain));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------
type Config = { id: string; secret: string; scopes: string };

function config(platform: Platform, env: Deps['env']): Config | null {
  const [id, secret] =
    platform === 'tiktok'
      ? [env('TIKTOK_CLIENT_KEY'), env('TIKTOK_CLIENT_SECRET')]
      : [env('INSTAGRAM_APP_ID'), env('INSTAGRAM_APP_SECRET')];
  if (!id?.trim() || !secret?.trim()) return null;
  const scopes = (platform === 'tiktok' ? env('TIKTOK_SCOPES') : env('INSTAGRAM_SCOPES'))?.trim();
  return {
    id: id.trim(),
    secret: secret.trim(),
    scopes: scopes || (platform === 'tiktok' ? TIKTOK_SCOPES : INSTAGRAM_SCOPES),
  };
}

const redirectUri = (env: Deps['env']) => `${(env('SUPABASE_URL') ?? '').replace(/\/+$/, '')}/functions/v1/social/callback`;

/** Darf nach der Anmeldung im Browser dorthin zurückgeleitet werden? (Schutz vor fremden Seiten) */
export function allowedReturn(target: string | undefined, env: Deps['env']): boolean {
  if (!target) return false;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return true;
  const allowed = (env('SOCIAL_APP_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return url.protocol === 'https:' && allowed.includes(url.origin);
}

/** Datum in Deutschland (für den Follower-Verlauf: ein Eintrag pro Tag) */
export function berlinDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms));
}

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : null;
const str = (v: unknown, max: number): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// ---------------------------------------------------------------------------
// Supabase: Nutzer + Datenbank (mit den Rechten des Nutzers)
// ---------------------------------------------------------------------------
type Db = (path: string, init?: { method?: string; body?: unknown; prefer?: string }) => Promise<unknown>;

async function currentUser(req: Request, deps: Deps): Promise<{ id: string; db: Db } | null> {
  const auth = req.headers.get('Authorization');
  const apikey = req.headers.get('apikey');
  const base = deps.env('SUPABASE_URL');
  if (!auth?.startsWith('Bearer ') || !apikey || !base) return null;
  const res = await deps.fetch(`${base}/auth/v1/user`, { headers: { Authorization: auth, apikey } });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  if (!user?.id) return null;
  const db: Db = async (path, init = {}) => {
    const r = await deps.fetch(`${base}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: auth,
        apikey,
        'Content-Type': 'application/json',
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const raw = await r.text();
    if (!r.ok) {
      let code = '';
      try {
        code = JSON.parse(raw)?.code ?? '';
      } catch {
        // keine JSON-Antwort
      }
      if (['PGRST205', '42P01', 'PGRST106'].includes(code)) throw new Failure(500, 'missing_tables');
      throw new Failure(500, 'db_error', `${r.status} ${raw.slice(0, 200)}`);
    }
    return raw ? JSON.parse(raw) : null;
  };
  return { id: user.id, db };
}

const ACCOUNT_COLUMNS =
  'id,platform,external_id,username,display_name,avatar_url,profile_url,followers,following,likes,media_count,status,last_error,last_synced_at,created_at,updated_at';

type AccountRow = { id: string; platform: Platform; token_data: string | null } & Record<string, unknown>;

// ---------------------------------------------------------------------------
// Plattformen
// ---------------------------------------------------------------------------
type Profile = {
  external_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
  media_count: number | null;
};

export type Video = {
  external_id: string;
  caption: string | null;
  url: string | null;
  thumbnail_url: string | null;
  media_type: 'video' | 'carousel' | 'image' | 'story';
  published_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

/** Fehler der Plattform. reconnect = Zugang ungültig/entzogen */
class PlatformError extends Error {
  reconnect: boolean;
  code?: string;
  constructor(reconnect: boolean, message: string, code?: string) {
    super(message);
    this.reconnect = reconnect;
    this.code = code;
  }
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) ?? {};
  } catch {
    return {};
  }
}

// --- TikTok -----------------------------------------------------------------
const TIKTOK_API = 'https://open.tiktokapis.com';

async function tiktokToken(deps: Deps, cfg: Config, params: Record<string, string>, now: number): Promise<{ tokens: Tokens; openId?: string }> {
  const res = await deps.fetch(`${TIKTOK_API}/v2/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams({ client_key: cfg.id, client_secret: cfg.secret, ...params }),
  });
  const body = await readJson(res);
  if (!res.ok || typeof body.access_token !== 'string') {
    const reason = String(body.error_description ?? body.error ?? res.status);
    throw new PlatformError(params.grant_type === 'refresh_token', `TikTok: ${reason}`.slice(0, 300));
  }
  return {
    openId: typeof body.open_id === 'string' ? body.open_id : undefined,
    tokens: {
      access_token: body.access_token,
      refresh_token: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
      expires_at: now + (num(body.expires_in) ?? 86400) * 1000,
      refresh_expires_at: num(body.refresh_expires_in) ? now + num(body.refresh_expires_in)! * 1000 : undefined,
    },
  };
}

async function tiktokApi(deps: Deps, token: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await deps.fetch(`${TIKTOK_API}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await readJson(res);
  const error = (data.error ?? {}) as { code?: string; message?: string };
  if (!res.ok || (error.code && error.code !== 'ok')) {
    const reconnect = res.status === 401 || error.code === 'access_token_invalid' || error.code === 'scope_not_authorized';
    throw new PlatformError(
      reconnect,
      `TikTok: ${error.code ?? res.status} ${error.message ?? ''}`.trim().slice(0, 300),
      error.code,
    );
  }
  return (data.data ?? {}) as Record<string, unknown>;
}

async function tiktokProfile(deps: Deps, token: string): Promise<Profile> {
  let user: Record<string, unknown>;
  try {
    user = (await tiktokApi(deps, token, `/v2/user/info/?fields=${TIKTOK_PROFILE_FIELDS}`)).user as Record<string, unknown>;
  } catch (e) {
    // ohne Freigabe für Profil/Zahlen: wenigstens Name und Bild
    if ((e as PlatformError).code !== 'scope_not_authorized') throw e;
    user = (await tiktokApi(deps, token, `/v2/user/info/?fields=${TIKTOK_BASIC_FIELDS}`)).user as Record<string, unknown>;
  }
  user = user ?? {};
  const username = str(user.username, 200);
  return {
    external_id: String(user.open_id ?? ''),
    username,
    display_name: str(user.display_name, 200),
    avatar_url: str(user.avatar_url, 4000),
    profile_url: str(user.profile_deep_link, 1000) ?? (username ? `https://www.tiktok.com/@${username}` : null),
    followers: num(user.follower_count),
    following: num(user.following_count),
    likes: num(user.likes_count),
    media_count: num(user.video_count),
  };
}

async function tiktokVideos(deps: Deps, token: string): Promise<Video[]> {
  const videos: Video[] = [];
  let cursor: number | undefined;
  for (let page = 0; page < TIKTOK_PAGES; page++) {
    const data = await tiktokApi(deps, token, `/v2/video/list/?fields=${TIKTOK_VIDEO_FIELDS}`, {
      max_count: 20,
      ...(cursor !== undefined ? { cursor } : {}),
    });
    for (const v of (data.videos ?? []) as Record<string, unknown>[]) {
      if (!v?.id) continue;
      const created = num(v.create_time);
      videos.push({
        external_id: String(v.id),
        caption: str(v.title, 5000) ?? str(v.video_description, 5000),
        url: str(v.share_url, 1000),
        thumbnail_url: str(v.cover_image_url, 4000),
        media_type: 'video',
        published_at: created ? new Date(created * 1000).toISOString() : null,
        views: num(v.view_count),
        likes: num(v.like_count),
        comments: num(v.comment_count),
        shares: num(v.share_count),
        saves: null,
      });
    }
    if (!data.has_more || data.cursor === undefined) break;
    cursor = Number(data.cursor);
  }
  return videos;
}

// --- Instagram ----------------------------------------------------------------
const igBase = (env: Deps['env']) => {
  const v = env('INSTAGRAM_API_VERSION')?.trim();
  return `https://graph.instagram.com${v ? `/${v.replace(/^\/+|\/+$/g, '')}` : ''}`;
};

async function igApi(deps: Deps, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await deps.fetch(`${igBase(deps.env)}${path}?${new URLSearchParams(params)}`);
  const body = await readJson(res);
  const error = body.error as { message?: string; code?: number; type?: string } | undefined;
  if (!res.ok || error) {
    const reconnect = res.status === 401 || error?.code === 190;
    throw new PlatformError(reconnect, `Instagram: ${error?.message ?? res.status}`.slice(0, 300));
  }
  return body;
}

async function instagramToken(deps: Deps, cfg: Config, code: string, now: number): Promise<{ tokens: Tokens; userId?: string }> {
  const res = await deps.fetch('https://api.instagram.com/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.id,
      client_secret: cfg.secret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri(deps.env),
      code: code.replace(/#_$/, ''),
    }),
  });
  const body = await readJson(res);
  // neue Antwort: { data: [{ access_token, user_id, permissions }] }, ältere: { access_token, user_id }
  const entry = (Array.isArray(body.data) ? body.data[0] : body) as Record<string, unknown> | undefined;
  if (!res.ok || typeof entry?.access_token !== 'string') {
    const reason = body.error_message ?? (body.error as { message?: string })?.message ?? res.status;
    throw new PlatformError(false, `Instagram: ${reason}`.slice(0, 300));
  }
  // kurzlebig (1 Stunde) -> langlebig (60 Tage)
  const long = await igApi(deps, '/access_token', {
    grant_type: 'ig_exchange_token',
    client_secret: cfg.secret,
    access_token: entry.access_token,
  });
  if (typeof long.access_token !== 'string') throw new PlatformError(false, 'Instagram: kein langlebiger Zugang');
  return {
    userId: entry.user_id !== undefined ? String(entry.user_id) : undefined,
    tokens: { access_token: long.access_token, expires_at: now + (num(long.expires_in) ?? 60 * 86400) * 1000 },
  };
}

async function instagramRefresh(deps: Deps, tokens: Tokens, now: number): Promise<Tokens> {
  const body = await igApi(deps, '/refresh_access_token', {
    grant_type: 'ig_refresh_token',
    access_token: tokens.access_token,
  });
  if (typeof body.access_token !== 'string') throw new PlatformError(false, 'Instagram: Verlängern fehlgeschlagen');
  return { access_token: body.access_token, expires_at: now + (num(body.expires_in) ?? 60 * 86400) * 1000 };
}

async function instagramProfile(deps: Deps, token: string): Promise<Profile> {
  const me = await igApi(deps, '/me', {
    fields: 'user_id,username,name,profile_picture_url,followers_count,follows_count,media_count',
    access_token: token,
  });
  const username = str(me.username, 200);
  return {
    external_id: String(me.user_id ?? me.id ?? ''),
    username,
    display_name: str(me.name, 200),
    avatar_url: str(me.profile_picture_url, 4000),
    profile_url: username ? `https://www.instagram.com/${username}/` : null,
    followers: num(me.followers_count),
    following: num(me.follows_count),
    likes: null,
    media_count: num(me.media_count),
  };
}

function igMediaType(m: Record<string, unknown>): Video['media_type'] {
  if (m.media_product_type === 'STORY') return 'story';
  if (m.media_type === 'VIDEO' || m.media_product_type === 'REELS') return 'video';
  if (m.media_type === 'CAROUSEL_ALBUM') return 'carousel';
  return 'image';
}

/** Wert aus einer Insights-Antwort (alte Form: values[0].value, neue: total_value.value) */
export function insightValue(data: unknown, name: string): number | null {
  if (!Array.isArray(data)) return null;
  const entry = data.find((d) => d?.name === name);
  if (!entry) return null;
  return num(entry.total_value?.value ?? entry.values?.[0]?.value);
}

async function instagramMedia(deps: Deps, token: string): Promise<Video[]> {
  const body = await igApi(deps, '/me/media', {
    fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
    limit: String(INSTAGRAM_MEDIA_LIMIT),
    access_token: token,
  });
  const list = ((body.data ?? []) as Record<string, unknown>[]).filter((m) => m?.id);
  const videos: Video[] = list.map((m) => {
    const type = igMediaType(m);
    return {
      external_id: String(m.id),
      caption: str(m.caption, 5000),
      url: str(m.permalink, 1000),
      thumbnail_url: str(m.thumbnail_url, 4000) ?? (type === 'video' ? null : str(m.media_url, 4000)),
      media_type: type,
      published_at: typeof m.timestamp === 'string' ? new Date(m.timestamp).toISOString() : null,
      views: null,
      likes: num(m.like_count),
      comments: num(m.comments_count),
      shares: null,
      saves: null,
    };
  });
  // Aufrufe, Gespeichert, Geteilt – je Post eine Anfrage, nur für die neuesten
  await Promise.all(
    videos.slice(0, INSTAGRAM_INSIGHTS_FOR).map(async (v) => {
      if (v.media_type === 'story') return;
      try {
        const res = await igApi(deps, `/${v.external_id}/insights`, { metric: 'views,saved,shares', access_token: token });
        v.views = insightValue(res.data, 'views');
        v.saves = insightValue(res.data, 'saved');
        v.shares = insightValue(res.data, 'shares');
      } catch (e) {
        if ((e as PlatformError).reconnect) throw e;
        // Zahlen für diesen Post gibt es nicht (z. B. sehr alt) – dann ohne
      }
    }),
  );
  return videos;
}

// ---------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------
function authorizeUrl(platform: Platform, cfg: Config, state: string, env: Deps['env']): string {
  if (platform === 'tiktok') {
    const q = new URLSearchParams({
      client_key: cfg.id,
      response_type: 'code',
      scope: cfg.scopes,
      redirect_uri: redirectUri(env),
      state,
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
  }
  const q = new URLSearchParams({
    enable_fb_login: '0',
    force_authentication: '1',
    client_id: cfg.id,
    redirect_uri: redirectUri(env),
    response_type: 'code',
    scope: cfg.scopes,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${q}`;
}

const aadFor = (userId: string, platform: Platform) => `${userId}:${platform}`;

/** Profil + Videos holen und speichern (Tokens vorher verlängern, falls nötig) */
async function syncAccount(
  deps: Deps,
  user: { id: string; db: Db },
  account: AccountRow,
  cfg: Config,
  now: number,
  given?: Tokens,
): Promise<{ account: Record<string, unknown>; videos: number; error?: string }> {
  const aad = aadFor(user.id, account.platform);
  const patchAccount = async (patch: Record<string, unknown>) => {
    const rows = (await user.db(`social_accounts?id=eq.${account.id}&select=${ACCOUNT_COLUMNS}`, {
      method: 'PATCH',
      body: patch,
      prefer: 'return=representation',
    })) as Record<string, unknown>[];
    return rows?.[0] ?? { ...account, ...patch, token_data: undefined };
  };
  const fail = async (reconnect: boolean, message: string) => ({
    account: await patchAccount({ status: reconnect ? 'reconnect' : 'ok', last_error: message.slice(0, 500) }),
    videos: 0,
    error: message,
  });

  let tokens = given ?? (await openTokens(account.token_data, cfg.secret, aad));
  if (!tokens) return fail(true, 'Der Zugang ist nicht mehr gültig. Bitte verbinde das Konto neu.');
  let refreshed = !!given;

  try {
    if (account.platform === 'tiktok' && tokens.expires_at - now < 5 * 60 * 1000) {
      if (!tokens.refresh_token || (tokens.refresh_expires_at && tokens.refresh_expires_at < now))
        return fail(true, 'Der TikTok-Zugang ist abgelaufen. Bitte verbinde das Konto neu.');
      tokens = (await tiktokToken(deps, cfg, { grant_type: 'refresh_token', refresh_token: tokens.refresh_token }, now)).tokens;
      refreshed = true;
    }
    if (account.platform === 'instagram') {
      if (tokens.expires_at < now) return fail(true, 'Der Instagram-Zugang ist abgelaufen. Bitte verbinde das Konto neu.');
      // langlebiger Zugang (60 Tage): rechtzeitig verlängern
      if (tokens.expires_at - now < 30 * DAY) {
        try {
          tokens = await instagramRefresh(deps, tokens, now);
          refreshed = true;
        } catch (e) {
          if ((e as PlatformError).reconnect) throw e;
        }
      }
    }

    const profile =
      account.platform === 'tiktok' ? await tiktokProfile(deps, tokens.access_token) : await instagramProfile(deps, tokens.access_token);
    const videos =
      account.platform === 'tiktok' ? await tiktokVideos(deps, tokens.access_token) : await instagramMedia(deps, tokens.access_token);

    const saved = await patchAccount({
      ...(profile.external_id ? { external_id: profile.external_id } : {}),
      username: profile.username,
      display_name: profile.display_name,
      avatar_url: profile.avatar_url,
      profile_url: profile.profile_url,
      followers: profile.followers,
      following: profile.following,
      likes: profile.likes,
      media_count: profile.media_count,
      ...(refreshed ? { token_data: await sealTokens(tokens, cfg.secret, aad), token_expires_at: new Date(tokens.expires_at).toISOString() } : {}),
      status: 'ok',
      last_error: null,
      last_synced_at: new Date(now).toISOString(),
    });

    await user.db('social_account_stats?on_conflict=account_id,day', {
      method: 'POST',
      body: {
        account_id: account.id,
        day: berlinDay(now),
        followers: profile.followers,
        following: profile.following,
        likes: profile.likes,
        media_count: profile.media_count,
      },
      prefer: 'resolution=merge-duplicates,return=minimal',
    });

    if (videos.length) {
      await user.db('social_videos?on_conflict=account_id,external_id', {
        method: 'POST',
        // post_id/auto_link bleiben unberührt (nicht in den Daten)
        body: videos.map((v) => ({
          ...v,
          account_id: account.id,
          platform: account.platform,
          synced_at: new Date(now).toISOString(),
        })),
        prefer: 'resolution=merge-duplicates,return=minimal',
      });
    }
    return { account: saved, videos: videos.length };
  } catch (e) {
    if (e instanceof PlatformError) return fail(e.reconnect, e.message);
    throw e;
  }
}

export async function handleRequest(req: Request, deps: Deps): Promise<Response> {
  const now = deps.now?.() ?? Date.now();
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const secretFor = (p: Platform) => config(p, deps.env)?.secret;

  // Rückleitung von TikTok/Instagram (ohne Anmeldung – im Browserfenster der Anmeldung)
  if (req.method === 'GET') {
    const url = new URL(req.url);
    // z. B. …/social/callback/tiktok….txt oder …/social/tiktok….txt
    const verification = TIKTOK_VERIFICATION.get(url.pathname.split('/').pop() ?? '');
    if (verification) return text(200, verification);
    if (!url.pathname.replace(/\/+$/, '').endsWith('/callback')) return text(404, 'Nicht gefunden');
    const state = url.searchParams.get('state') ?? '';
    const payload = state ? await readState(state, secretFor, now) : null;
    if (payload?.r && allowedReturn(payload.r, deps.env)) {
      const back = new URL(payload.r);
      back.searchParams.set('social_platform', payload.p);
      for (const key of ['code', 'state', 'error', 'error_description']) {
        const value = url.searchParams.get(key);
        if (value) back.searchParams.set(`social_${key}`, value.replace(/#_$/, ''));
      }
      return new Response(null, { status: 302, headers: { Location: back.toString() } });
    }
    return text(200, 'Lunaxora: Die Anmeldung ist abgeschlossen. Du kannst dieses Fenster schließen und in der App weitermachen.');
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const user = await currentUser(req, deps);
  if (!user) return json(401, { error: 'not_signed_in' });

  let body: { action?: unknown; platform?: unknown; code?: unknown; state?: unknown; return_to?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_body' });
  }
  if (!body || typeof body !== 'object') return json(400, { error: 'invalid_body' });
  const platform = PLATFORMS.includes(body.platform as Platform) ? (body.platform as Platform) : null;

  try {
    switch (body.action) {
      case 'status':
        return json(200, {
          tiktok: !!config('tiktok', deps.env),
          instagram: !!config('instagram', deps.env),
          redirect_uri: redirectUri(deps.env),
        });

      case 'start': {
        if (!platform) return json(400, { error: 'unknown_platform' });
        const cfg = config(platform, deps.env);
        if (!cfg) return json(400, { error: 'not_configured', platform });
        const returnTo = typeof body.return_to === 'string' ? body.return_to : undefined;
        if (returnTo && !allowedReturn(returnTo, deps.env)) return json(400, { error: 'return_not_allowed' });
        const state = await signState(
          { u: user.id, p: platform, n: b64u(crypto.getRandomValues(new Uint8Array(12))), t: now, ...(returnTo ? { r: returnTo } : {}) },
          cfg.secret,
        );
        return json(200, { url: authorizeUrl(platform, cfg, state, deps.env), state, redirect_uri: redirectUri(deps.env) });
      }

      case 'finish': {
        if (!platform) return json(400, { error: 'unknown_platform' });
        const cfg = config(platform, deps.env);
        if (!cfg) return json(400, { error: 'not_configured', platform });
        const code = typeof body.code === 'string' ? body.code.trim() : '';
        const payload = typeof body.state === 'string' ? await readState(body.state, secretFor, now) : null;
        if (!code || !payload || payload.u !== user.id || payload.p !== platform) return json(400, { error: 'invalid_state' });

        let tokens: Tokens;
        try {
          tokens =
            platform === 'tiktok'
              ? (await tiktokToken(deps, cfg, { code, grant_type: 'authorization_code', redirect_uri: redirectUri(deps.env) }, now)).tokens
              : (await instagramToken(deps, cfg, code, now)).tokens;
        } catch (e) {
          if (e instanceof PlatformError) return json(502, { error: 'platform_error', platform, detail: e.message });
          throw e;
        }
        let profile: Profile;
        try {
          profile = platform === 'tiktok' ? await tiktokProfile(deps, tokens.access_token) : await instagramProfile(deps, tokens.access_token);
        } catch (e) {
          if (e instanceof PlatformError) return json(502, { error: 'platform_error', platform, detail: e.message });
          throw e;
        }
        if (!profile.external_id) return json(502, { error: 'platform_error', platform, detail: 'Kein Profil erhalten' });

        const rows = (await user.db(`social_accounts?on_conflict=user_id,platform&select=${ACCOUNT_COLUMNS},token_data`, {
          method: 'POST',
          body: {
            platform,
            external_id: profile.external_id,
            username: profile.username,
            display_name: profile.display_name,
            avatar_url: profile.avatar_url,
            profile_url: profile.profile_url,
            token_data: await sealTokens(tokens, cfg.secret, aadFor(user.id, platform)),
            token_expires_at: new Date(tokens.expires_at).toISOString(),
            status: 'ok',
            last_error: null,
          },
          prefer: 'resolution=merge-duplicates,return=representation',
        })) as AccountRow[];
        const account = rows?.[0];
        if (!account) return json(500, { error: 'db_error', detail: 'Konto nicht gespeichert' });
        // gleich die ersten Zahlen holen
        const synced = await syncAccount(deps, user, account, cfg, now, tokens);
        return json(200, { account: synced.account, videos: synced.videos, warning: synced.error });
      }

      case 'sync': {
        const filter = platform ? `&platform=eq.${platform}` : '';
        const accounts = (await user.db(`social_accounts?select=id,platform,token_data${filter}`)) as AccountRow[];
        const results = [];
        for (const account of accounts ?? []) {
          const cfg = config(account.platform, deps.env);
          if (!cfg) {
            results.push({ platform: account.platform, error: 'not_configured' });
            continue;
          }
          const r = await syncAccount(deps, user, account, cfg, now);
          results.push({ platform: account.platform, account: r.account, videos: r.videos, error: r.error });
        }
        return json(200, { results });
      }

      case 'disconnect': {
        if (!platform) return json(400, { error: 'unknown_platform' });
        const rows = (await user.db(`social_accounts?select=id,platform,token_data&platform=eq.${platform}`)) as AccountRow[];
        const account = rows?.[0];
        const cfg = config(platform, deps.env);
        // TikTok: Zugang auch dort zurückziehen (best effort)
        if (account && cfg && platform === 'tiktok') {
          const tokens = await openTokens(account.token_data, cfg.secret, aadFor(user.id, platform));
          if (tokens) {
            await deps
              .fetch(`${TIKTOK_API}/v2/oauth/revoke/`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({ client_key: cfg.id, client_secret: cfg.secret, token: tokens.access_token }),
              })
              .catch(() => null);
          }
        }
        await user.db(`social_accounts?platform=eq.${platform}`, { method: 'DELETE', prefer: 'return=minimal' });
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: 'unknown_action' });
    }
  } catch (e) {
    if (e instanceof Failure) return json(e.status, { error: e.code, detail: e.detail });
    console.error('social', e);
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
