/**
 * TikTok & Instagram verbinden – reine Logik (ohne App/Netz, mit Unit-Tests):
 * Videos den Ideen im Content-Board zuordnen, Zahlen übernehmen,
 * Video als neuen Post übernehmen, Follower-Verlauf.
 */
import { stepsFor, type Platform, type PostFormat } from './social-logic';

export type ConnectedPlatform = 'tiktok' | 'instagram';
export const CONNECTED_PLATFORMS: { key: ConnectedPlatform; label: string }[] = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'instagram', label: 'Instagram' },
];
export const connectedLabel = (p: ConnectedPlatform) => (p === 'tiktok' ? 'TikTok' : 'Instagram');

export type SocialAccount = {
  id: string;
  platform: ConnectedPlatform;
  external_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  followers: number | null;
  following: number | null;
  likes: number | null;
  media_count: number | null;
  status: 'ok' | 'reconnect';
  last_error: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountStat = {
  account_id: string;
  day: string;
  followers: number | null;
  following: number | null;
  likes: number | null;
  media_count: number | null;
};

export type SocialVideo = {
  id: string;
  account_id: string;
  platform: ConnectedPlatform;
  external_id: string;
  caption: string | null;
  url: string | null;
  thumbnail_url: string | null;
  media_type: 'video' | 'carousel' | 'image' | 'story' | null;
  published_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  post_id: string | null;
  auto_link: boolean;
  synced_at: string;
};

/** Was die Zuordnung von einem Post braucht */
export type LinkablePost = {
  id: string;
  title: string;
  caption: string | null;
  hashtags: string | null;
  url: string | null;
  format: PostFormat;
  platforms: Platform[];
  planned_for: string | null;
  published_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
};

const DAY = 24 * 60 * 60 * 1000;
const INT_MAX = 2_147_483_647;

// ---------------------------------------------------------------------------
// Ähnlichkeit
// ---------------------------------------------------------------------------

/** Links vergleichbar machen: ohne www, Abfrage, Anker und Schrägstrich am Ende */
export function normalizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return `${u.hostname.replace(/^www\./, '').toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

const STOP = new Set(
  'und oder aber der die das den dem des ein eine einen einem einer eines ich du er sie es wir ihr mit für von vom zum zur auf aus bei bis nach über unter vor im in am an als auch wie was wer wo so noch nur mal mein meine dein deine sein ist sind war hat habe hast nicht kein keine ganz sehr mehr dass dann denn doch schon jetzt heute hier the and for you your this that with from'.split(
    ' ',
  ),
);

/** Wichtige Wörter eines Textes (klein, ohne Füllwörter, mind. 3 Buchstaben; Hashtags zählen mit) */
export function keywords(text: string | null | undefined): Set<string> {
  const words = (text ?? '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^a-z0-9äöüß]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return new Set(words);
}

/** Übereinstimmung zweier Wortmengen: gemeinsame Wörter und Anteil (bezogen auf die kleinere Menge) */
export function overlap(a: Set<string>, b: Set<string>): { shared: number; score: number } {
  if (!a.size || !b.size) return { shared: 0, score: 0 };
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return { shared, score: shared / Math.min(a.size, b.size) };
}

const postWords = (p: LinkablePost) => keywords(`${p.title} ${p.caption ?? ''} ${p.hashtags ?? ''}`);

// ---------------------------------------------------------------------------
// Zuordnung Video -> Idee
// ---------------------------------------------------------------------------

export type Match = { videoId: string; postId: string; reason: 'url' | 'text' };

/** Welche Plattformen sind je Post schon belegt (durch zugeordnete Videos) */
function usedPlatforms(videos: SocialVideo[]): Map<string, Set<ConnectedPlatform>> {
  const used = new Map<string, Set<ConnectedPlatform>>();
  for (const v of videos) {
    if (!v.post_id) continue;
    if (!used.has(v.post_id)) used.set(v.post_id, new Set());
    used.get(v.post_id)!.add(v.platform);
  }
  return used;
}

function dateOf(p: LinkablePost): number | null {
  const d = p.published_at ?? p.planned_for;
  return d ? new Date(d).getTime() : null;
}

type Scored = { post: LinkablePost; shared: number; score: number };

function candidates(video: SocialVideo, posts: LinkablePost[], used: Map<string, Set<ConnectedPlatform>>): Scored[] {
  const words = keywords(video.caption);
  return posts
    .filter((p) => !used.get(p.id)?.has(video.platform))
    .map((post) => ({ post, ...overlap(words, postWords(post)) }))
    .filter((c) => c.shared > 0)
    .sort((a, b) => b.score - a.score || b.shared - a.shared);
}

/**
 * Neue Videos automatisch der passenden Idee zuordnen – vorsichtig:
 * 1. gleicher Link, oder
 * 2. Text passt deutlich (mind. 2 gemeinsame Wörter, 60 % Übereinstimmung),
 *    Datum der Idee höchstens 14 Tage entfernt und eindeutig der beste Treffer.
 * Je Idee höchstens ein Video pro Plattform. Von Hand gelöste Zuordnungen bleiben gelöst.
 */
export function matchVideos(videos: SocialVideo[], posts: LinkablePost[]): Match[] {
  const used = usedPlatforms(videos);
  const matches: Match[] = [];
  const open = videos
    .filter((v) => !v.post_id && v.auto_link)
    .sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''));
  const take = (video: SocialVideo, post: LinkablePost, reason: Match['reason']) => {
    matches.push({ videoId: video.id, postId: post.id, reason });
    if (!used.has(post.id)) used.set(post.id, new Set());
    used.get(post.id)!.add(video.platform);
  };
  for (const video of open) {
    const link = normalizeUrl(video.url);
    const byUrl = link
      ? posts.find((p) => normalizeUrl(p.url) === link && !used.get(p.id)?.has(video.platform))
      : undefined;
    if (byUrl) {
      take(video, byUrl, 'url');
      continue;
    }
    const when = video.published_at ? new Date(video.published_at).getTime() : null;
    const list = candidates(video, posts, used).filter((c) => {
      if (c.shared < 2 || c.score < 0.6) return false;
      const d = dateOf(c.post);
      return d === null || when === null || Math.abs(d - when) <= 14 * DAY;
    });
    if (!list.length) continue;
    // nicht eindeutig -> lieber nichts zuordnen
    if (list[1] && list[1].score === list[0].score && list[1].shared === list[0].shared) continue;
    take(video, list[0].post, 'text');
  }
  return matches;
}

/** Vorschlag für ein nicht zugeordnetes Video: "Passt zu „…“?" */
export function suggestPost(video: SocialVideo, videos: SocialVideo[], posts: LinkablePost[]): LinkablePost | null {
  const best = candidates(video, posts, usedPlatforms(videos))[0];
  return best && best.score >= 0.34 ? best.post : null;
}

// ---------------------------------------------------------------------------
// Zahlen übernehmen
// ---------------------------------------------------------------------------

export type PostPatch = Partial<
  Pick<LinkablePost, 'views' | 'likes' | 'comments' | 'shares' | 'saves' | 'published_at' | 'url' | 'platforms'>
>;

const sum = (values: (number | null)[]): number | null => {
  const real = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  return real.length
    ? Math.min(
        INT_MAX,
        real.reduce((a, b) => a + Number(b), 0),
      )
    : null;
};

/**
 * Zahlen der zugeordneten Videos in den Post übernehmen (bei TikTok + Instagram
 * zusammengezählt). Nur was sich ändert; null = nichts zu tun.
 * Eigene Zahlen werden nur überschrieben, wenn die Plattform einen Wert liefert.
 */
export function postPatchFromVideos(post: LinkablePost, linked: SocialVideo[]): PostPatch | null {
  if (!linked.length) return null;
  const sorted = [...linked].sort((a, b) => (a.published_at ?? '').localeCompare(b.published_at ?? ''));
  const patch: PostPatch = {};
  for (const key of ['views', 'likes', 'comments', 'shares', 'saves'] as const) {
    const total = sum(linked.map((v) => (v[key] === null || v[key] === undefined ? null : Number(v[key]))));
    if (total !== null && total !== post[key]) patch[key] = total;
  }
  const first = sorted.find((v) => v.published_at)?.published_at ?? null;
  if (!post.published_at && first) patch.published_at = first;
  const url = sorted.find((v) => v.url)?.url ?? null;
  if (!post.url && url) patch.url = url;
  const platforms = [...new Set<Platform>([...post.platforms, ...linked.map((v) => v.platform)])];
  if (platforms.length !== post.platforms.length) patch.platforms = platforms;
  return Object.keys(patch).length ? patch : null;
}

// ---------------------------------------------------------------------------
// Video als neuen Post übernehmen
// ---------------------------------------------------------------------------

/** #hashtags aus einem Text */
export function extractHashtags(text: string | null | undefined): string[] {
  return [...new Set((text ?? '').match(/#[\p{L}\p{N}_]+/gu) ?? [])];
}

/** Titel aus der Beschreibung: erste Zeile ohne Hashtags, höchstens 80 Zeichen */
export function captionTitle(
  caption: string | null | undefined,
  platform: ConnectedPlatform,
  publishedAt: string | null,
): string {
  const line =
    (caption ?? '')
      .split('\n')
      .map((l) =>
        l
          .replace(/#[\p{L}\p{N}_]+/gu, '')
          .replace(/\s+/g, ' ')
          .trim(),
      )
      .find((l) => l.length > 0) ?? '';
  if (line) return line.length > 80 ? `${line.slice(0, 77).trimEnd()} …` : line;
  const date = publishedAt
    ? new Date(publishedAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;
  return `${connectedLabel(platform)}-${platform === 'tiktok' ? 'Video' : 'Post'}${date ? ` vom ${date}` : ''}`;
}

export const formatOf = (video: SocialVideo): PostFormat =>
  video.media_type === 'carousel'
    ? 'carousel'
    : video.media_type === 'image'
      ? 'image'
      : video.media_type === 'story'
        ? 'story'
        : 'video';

/** Neuer Post (veröffentlicht, alle Schritte erledigt) aus einem Video */
export function postFromVideo(video: SocialVideo) {
  const format = formatOf(video);
  const tags = extractHashtags(video.caption);
  const caption = (video.caption ?? '')
    .replace(/#[\p{L}\p{N}_]+/gu, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  const steps = Object.fromEntries(stepsFor(format).map((s) => [s.key, true]));
  const clamp = (v: number | null) => (v === null || v === undefined ? null : Math.min(INT_MAX, Number(v)));
  return {
    title: captionTitle(video.caption, video.platform, video.published_at),
    format,
    platforms: [video.platform] as Platform[],
    caption: caption || null,
    hashtags: tags.length ? tags.join(' ') : null,
    published_at: video.published_at ?? new Date().toISOString(),
    url: video.url,
    views: clamp(video.views),
    likes: clamp(video.likes),
    comments: clamp(video.comments),
    shares: clamp(video.shares),
    saves: clamp(video.saves),
    ...steps,
  };
}

// ---------------------------------------------------------------------------
// Follower-Verlauf
// ---------------------------------------------------------------------------

/** Tag als JJJJ-MM-TT, x Tage vor `day` */
export function dayBefore(day: string, days: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

/** Follower je Tag (aufsteigend) für die letzten `days` Tage */
export function followerSeries(stats: AccountStat[], accountId: string, today: string, days = 30) {
  const from = dayBefore(today, days - 1);
  return stats
    .filter((s) => s.account_id === accountId && s.day >= from && s.day <= today && s.followers !== null)
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((s) => ({ day: s.day, followers: Number(s.followers) }));
}

/**
 * Zuwachs seit `days` Tagen: aktueller Wert minus Wert an diesem Tag (oder dem
 * letzten davor). Gibt es so alte Werte noch nicht, zählt der älteste vorhandene.
 * null, wenn es nur einen Wert gibt.
 */
export function followerGrowth(
  stats: AccountStat[],
  accountId: string,
  today: string,
  days = 7,
): { delta: number; since: string } | null {
  const mine = stats
    .filter((s) => s.account_id === accountId && s.followers !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
  const latest = mine[mine.length - 1];
  if (!latest || mine.length < 2) return null;
  const cutoff = dayBefore(today, days);
  const base = [...mine].reverse().find((s) => s.day <= cutoff) ?? mine[0];
  if (base === latest) return null;
  return { delta: Number(latest.followers) - Number(base.followers), since: base.day };
}

/** "gerade eben", "vor 5 Min.", "vor 3 Std.", "vor 2 Tagen" */
export function syncAge(iso: string | null, now: number): string {
  if (!iso) return 'noch nie';
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
}

/** Sollten die Zahlen neu geholt werden? (ältester Stand älter als `hours`) */
export function needsSync(accounts: SocialAccount[], now: number, hours = 6): boolean {
  return accounts.some(
    (a) =>
      a.status === 'ok' && (!a.last_synced_at || now - new Date(a.last_synced_at).getTime() > hours * 60 * 60 * 1000),
  );
}
