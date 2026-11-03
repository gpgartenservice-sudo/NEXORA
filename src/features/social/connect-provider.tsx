import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import { disconnectAccount, finishConnect, setupStatus, syncAccounts, type SetupStatus } from './connect-api';
import {
  connectedLabel,
  dayBefore,
  matchVideos,
  needsSync,
  postFromVideo,
  postPatchFromVideos,
  type AccountStat,
  type ConnectedPlatform,
  type SocialAccount,
  type SocialVideo,
} from './connect-logic';
import { authorize, readReturn, type AuthOutcome, type ReturnParams } from './oauth';
import { useSocial } from './social-provider';

export type ConnectMessage = { tone: 'error' | 'success' | 'info'; text: string; setup?: boolean };
export type ConnectBusy = { action: 'connect' | 'sync' | 'disconnect'; platform?: ConnectedPlatform } | null;

type State = {
  accounts: SocialAccount[];
  stats: AccountStat[];
  videos: SocialVideo[];
  loading: boolean;
  /** Datenbank-Skript für verbundene Konten fehlt */
  tablesMissing: boolean;
  /** Welche Plattformen in Supabase eingerichtet sind (null = noch nicht gefragt) */
  setup: SetupStatus | null;
  setupError: string | null;
  busy: ConnectBusy;
  message: ConnectMessage | null;
  clearMessage: () => void;
  loadSetup: () => Promise<void>;
  connect: (platform: ConnectedPlatform) => Promise<void>;
  /** Rückkehr von der Anmeldeseite (Browser). true = es war eine Rückkehr */
  finishReturn: (params: ReturnParams) => Promise<boolean>;
  sync: (platform?: ConnectedPlatform, quiet?: boolean) => Promise<void>;
  /** Zahlen holen, wenn sie älter als ein paar Stunden sind (einmal pro Sitzung) */
  autoSync: () => void;
  disconnect: (platform: ConnectedPlatform) => Promise<void>;
  linkVideo: (videoId: string, postId: string | null) => Promise<string | undefined>;
  importVideo: (videoId: string) => Promise<{ postId?: string; error?: string }>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];
const ACCOUNT_COLUMNS =
  'id,platform,external_id,username,display_name,avatar_url,profile_url,followers,following,likes,media_count,status,last_error,last_synced_at,created_at,updated_at';
const VIDEO_COLUMNS =
  'id,account_id,platform,external_id,caption,url,thumbnail_url,media_type,published_at,views,likes,comments,shares,saves,post_id,auto_link,synced_at';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('de-DE')} ${n === 1 ? one : many}`;

type Loaded =
  | { accounts: SocialAccount[]; stats: AccountStat[]; videos: SocialVideo[] }
  | { missing: true }
  | { failed: true };

/** Konten, Follower-Verlauf (120 Tage) und Videos laden */
async function fetchAll(): Promise<Loaded> {
  const [a, s, v] = await Promise.all([
    supabase.from('social_accounts').select(ACCOUNT_COLUMNS).order('platform'),
    supabase
      .from('social_account_stats')
      .select('account_id,day,followers,following,likes,media_count')
      .gte('day', dayBefore(today(), 120))
      .order('day'),
    supabase.from('social_videos').select(VIDEO_COLUMNS).order('published_at', { ascending: false }).limit(300),
  ]);
  const err = a.error ?? s.error ?? v.error;
  if (err) {
    if (MISSING.includes(err.code)) return { missing: true };
    console.warn('[Social-Konten]', err);
    return { failed: true };
  }
  return {
    accounts: (a.data ?? []) as SocialAccount[],
    stats: (s.data ?? []) as AccountStat[],
    videos: (v.data ?? []) as SocialVideo[],
  };
}

/** Verbundene Konten (TikTok, Instagram), Follower-Verlauf und Videos – samt Zuordnung zu den Ideen. */
export function SocialConnectProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const social = useSocial();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [stats, setStats] = useState<AccountStat[]>([]);
  const [videos, setVideos] = useState<SocialVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [tablesMissing, setTablesMissing] = useState(false);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ConnectBusy>(null);
  const [message, setMessage] = useState<ConnectMessage | null>(null);
  const autoSynced = useRef(false);

  // immer der aktuelle Stand für asynchrone Abläufe
  const live = useRef({ social, accounts, videos });
  useEffect(() => {
    live.current = { social, accounts, videos };
  }, [social, accounts, videos]);

  /** Geladene Daten übernehmen; liefert die Videos (null bei Fehler) */
  const apply = useCallback((r: Loaded): SocialVideo[] | null => {
    setLoading(false);
    if ('missing' in r) {
      setTablesMissing(true);
      return null;
    }
    if ('failed' in r) return null;
    setTablesMissing(false);
    setAccounts(r.accounts);
    setStats(r.stats);
    setVideos(r.videos);
    return r.videos;
  }, []);

  /** Konten, Verlauf und Videos (neu) laden */
  const reload = useCallback(async () => apply(await fetchAll()), [apply]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchAll().then((r) => {
      if (active) apply(r);
    });
    return () => {
      active = false;
    };
  }, [userId, apply]);

  /** Neue Videos den Ideen zuordnen und Zahlen in die Posts übernehmen */
  const applyLinks = useCallback(async (list: SocialVideo[]): Promise<number> => {
    const { social: s } = live.current;
    const matches = matchVideos(list, s.posts);
    let next = list;
    let linked = 0;
    for (const m of matches) {
      const { error } = await supabase.from('social_videos').update({ post_id: m.postId }).eq('id', m.videoId);
      if (error) continue;
      linked++;
      next = next.map((v) => (v.id === m.videoId ? { ...v, post_id: m.postId } : v));
    }
    setVideos(next);
    const byPost = new Map<string, SocialVideo[]>();
    for (const v of next) if (v.post_id) byPost.set(v.post_id, [...(byPost.get(v.post_id) ?? []), v]);
    for (const [postId, list2] of byPost) {
      const post = s.posts.find((p) => p.id === postId);
      if (!post) continue;
      const patch = postPatchFromVideos(post, list2);
      if (patch) await s.updatePost(postId, patch);
    }
    return linked;
  }, []);

  const loadSetup = useCallback(async () => {
    const r = await setupStatus();
    if (r.data) {
      setSetup(r.data);
      setSetupError(null);
    } else {
      setSetupError(r.error ?? 'Unbekannter Fehler');
    }
  }, []);

  const finish = useCallback(
    async (outcome: Extract<AuthOutcome, { kind: 'code' }>) => {
      setBusy({ action: 'connect', platform: outcome.platform });
      const r = await finishConnect(outcome.platform, outcome.code, outcome.state);
      if (!r.data) {
        setMessage({ tone: 'error', text: r.error ?? 'Unbekannter Fehler', setup: r.setup });
        setBusy(null);
        return;
      }
      const vids = await reload();
      const linked = vids ? await applyLinks(vids) : 0;
      const acc = r.data.account;
      const who = acc.username ? `@${acc.username}` : (acc.display_name ?? '');
      setMessage(
        r.data.warning
          ? {
              tone: 'error',
              text: `${connectedLabel(outcome.platform)} ist verbunden, aber die Zahlen kamen nicht an.\n\n${r.data.warning}`,
            }
          : {
              tone: 'success',
              text: `${connectedLabel(outcome.platform)} verbunden${who ? `: ${who}` : ''} – ${plural(r.data.videos, outcome.platform === 'tiktok' ? 'Video' : 'Beitrag', outcome.platform === 'tiktok' ? 'Videos' : 'Beiträge')} geladen${linked ? `, ${plural(linked, 'davon einer Idee zugeordnet', 'davon Ideen zugeordnet')}` : ''}.`,
            },
      );
      setBusy(null);
    },
    [reload, applyLinks],
  );

  const connect = useCallback(
    async (platform: ConnectedPlatform) => {
      setMessage(null);
      setBusy({ action: 'connect', platform });
      const outcome = await authorize(platform);
      if (outcome.kind === 'redirecting') return; // Seite wechselt zur Anmeldung
      if (outcome.kind === 'cancelled') return setBusy(null);
      if (outcome.kind === 'error') {
        setMessage({ tone: 'error', text: outcome.error, setup: outcome.setup });
        return setBusy(null);
      }
      await finish(outcome);
    },
    [finish],
  );

  const finishReturn = useCallback(
    async (params: ReturnParams) => {
      const outcome = readReturn(params);
      if (!outcome) return false;
      if (outcome.kind === 'error') setMessage({ tone: 'error', text: outcome.error, setup: outcome.setup });
      if (outcome.kind === 'code') await finish(outcome);
      return true;
    },
    [finish],
  );

  const sync = useCallback(
    async (platform?: ConnectedPlatform, quiet = false) => {
      setBusy({ action: 'sync', platform });
      if (!quiet) setMessage(null);
      const r = await syncAccounts(platform);
      if (!r.data) {
        if (!quiet || r.setup) setMessage({ tone: 'error', text: r.error ?? 'Unbekannter Fehler', setup: r.setup });
        setBusy(null);
        return;
      }
      const vids = await reload();
      const linked = vids ? await applyLinks(vids) : 0;
      const failed = r.data.results.filter((x) => x.error);
      if (failed.length) {
        setMessage({
          tone: 'error',
          text: failed
            .map(
              (f) =>
                `${connectedLabel(f.platform)}: ${f.error === 'not_configured' ? 'In Supabase fehlen die Geheimnisse für diese Plattform.' : f.error}`,
            )
            .join('\n'),
        });
      } else if (!quiet) {
        const count = r.data.results.reduce((n, x) => n + (x.videos ?? 0), 0);
        setMessage({
          tone: 'success',
          text: `Zahlen aktualisiert – ${plural(count, 'Video/Beitrag', 'Videos/Beiträge')}${linked ? `, ${plural(linked, 'neu zugeordnet', 'neu zugeordnet')}` : ''}.`,
        });
      }
      setBusy(null);
    },
    [reload, applyLinks],
  );

  const autoSync = useCallback(() => {
    if (autoSynced.current || loading) return;
    autoSynced.current = true;
    if (needsSync(live.current.accounts, Date.now())) void sync(undefined, true);
  }, [loading, sync]);

  const disconnect = useCallback(
    async (platform: ConnectedPlatform) => {
      setBusy({ action: 'disconnect', platform });
      setMessage(null);
      const r = await disconnectAccount(platform);
      if (!r.data) {
        setMessage({ tone: 'error', text: r.error ?? 'Unbekannter Fehler', setup: r.setup });
      } else {
        await reload();
        setMessage({
          tone: 'info',
          text: `${connectedLabel(platform)} ist getrennt. Deine Posts und ihre Zahlen bleiben erhalten.`,
        });
      }
      setBusy(null);
    },
    [reload],
  );

  const linkVideo = useCallback(async (videoId: string, postId: string | null): Promise<string | undefined> => {
    const { videos: list, social: s } = live.current;
    const video = list.find((v) => v.id === videoId);
    if (!video) return 'Dieses Video gibt es nicht mehr.';
    const { error } = await supabase
      .from('social_videos')
      .update({ post_id: postId, auto_link: postId !== null })
      .eq('id', videoId);
    if (error) return `Die Zuordnung konnte nicht gespeichert werden.\n\nTechnische Details: ${error.message}`;
    const next = list.map((v) => (v.id === videoId ? { ...v, post_id: postId, auto_link: postId !== null } : v));
    setVideos(next);
    // Zahlen in die betroffenen Posts (beim Lösen bleiben die bisherigen Zahlen stehen)
    for (const id of [postId, video.post_id]) {
      if (!id) continue;
      const post = s.posts.find((p) => p.id === id);
      const patch = post
        ? postPatchFromVideos(
            post,
            next.filter((v) => v.post_id === id),
          )
        : null;
      if (patch) {
        const r = await s.updatePost(id, patch);
        if (r.error) return r.error;
      }
    }
    return undefined;
  }, []);

  const importVideo = useCallback(
    async (videoId: string) => {
      const video = live.current.videos.find((v) => v.id === videoId);
      if (!video) return { error: 'Dieses Video gibt es nicht mehr.' };
      const created = await live.current.social.createPost(postFromVideo(video));
      if (!created.data) return { error: created.error };
      const error = await linkVideo(videoId, created.data.id);
      return error ? { error } : { postId: created.data.id };
    },
    [linkVideo],
  );

  const value = useMemo<State>(
    () => ({
      accounts,
      stats,
      videos,
      loading,
      tablesMissing,
      setup,
      setupError,
      busy,
      message,
      clearMessage: () => setMessage(null),
      loadSetup,
      connect,
      finishReturn,
      sync,
      autoSync,
      disconnect,
      linkVideo,
      importVideo,
    }),
    [
      accounts,
      stats,
      videos,
      loading,
      tablesMissing,
      setup,
      setupError,
      busy,
      message,
      loadSetup,
      connect,
      finishReturn,
      sync,
      autoSync,
      disconnect,
      linkVideo,
      importVideo,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocialConnect(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSocialConnect muss innerhalb von SocialConnectProvider verwendet werden');
  return ctx;
}
