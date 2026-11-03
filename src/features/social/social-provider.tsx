import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import type { Platform, PostFormat } from './social-logic';

export type SocialPost = {
  id: string;
  title: string;
  format: PostFormat;
  platforms: Platform[];
  step_concept: boolean;
  step_produced: boolean;
  step_edited: boolean;
  step_caption: boolean;
  script: string | null;
  caption: string | null;
  hashtags: string | null;
  planned_for: string | null;
  published_at: string | null;
  url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  followers: number | null;
  created_at: string;
  updated_at: string;
};

export type PostInput = Partial<Omit<SocialPost, 'id' | 'created_at' | 'updated_at'>> & { title: string };

export type HashtagSet = { id: string; name: string; tags: string; created_at: string; updated_at: string };

type Result<T = undefined> = { data?: T; error?: string };

type State = {
  posts: SocialPost[];
  sets: HashtagSet[];
  loading: boolean;
  /** 'setup' = Datenbank-Skript für Social Media fehlt */
  error: 'setup' | 'failed' | null;
  createPost: (input: PostInput) => Promise<Result<SocialPost>>;
  updatePost: (id: string, input: Partial<PostInput>) => Promise<Result<SocialPost>>;
  deletePost: (id: string) => Promise<Result>;
  saveSet: (input: { id?: string; name: string; tags: string }) => Promise<Result<HashtagSet>>;
  deleteSet: (id: string) => Promise<Result>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];

function message(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING.includes(error.code)) {
    return 'Social Media kann noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (siehe supabase/README.md).';
  }
  if (error.code === '23514') return 'Eine Angabe ist ungültig. Bitte prüfe deine Eingaben.';
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

const newestFirst = <T extends { updated_at: string }>(a: T, b: T) => b.updated_at.localeCompare(a.updated_at);
const byName = (a: HashtagSet, b: HashtagSet) => a.name.localeCompare(b.name, 'de');

/** Posts (Content-Board) und Hashtag-Sets des angemeldeten Nutzers. */
export function SocialProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [sets, setSets] = useState<HashtagSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<State['error']>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('social_posts').select('*').order('updated_at', { ascending: false }),
      supabase.from('hashtag_sets').select('*').order('name'),
    ]).then(([p, s]) => {
      if (!active) return;
      const err = p.error ?? s.error;
      if (err) {
        console.warn('[Social]', err);
        setError(MISSING.includes(err.code) ? 'setup' : 'failed');
      } else {
        setError(null);
        setPosts(((p.data ?? []) as SocialPost[]).sort(newestFirst));
        setSets(((s.data ?? []) as HashtagSet[]).sort(byName));
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const createPost = useCallback(async (input: PostInput): Promise<Result<SocialPost>> => {
    const { data, error: err } = await supabase.from('social_posts').insert(input).select('*').single();
    if (err) return { error: message(err, 'Der Post konnte nicht gespeichert werden.') };
    const row = data as SocialPost;
    setPosts((list) => [row, ...list]);
    return { data: row };
  }, []);

  const updatePost = useCallback(async (id: string, input: Partial<PostInput>): Promise<Result<SocialPost>> => {
    const { data, error: err } = await supabase.from('social_posts').update(input).eq('id', id).select('*').single();
    if (err) return { error: message(err, 'Die Änderung konnte nicht gespeichert werden.') };
    const row = data as SocialPost;
    setPosts((list) => [row, ...list.filter((p) => p.id !== id)].sort(newestFirst));
    return { data: row };
  }, []);

  const deletePost = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('social_posts').delete().eq('id', id);
    if (err) return { error: message(err, 'Der Post konnte nicht gelöscht werden.') };
    setPosts((list) => list.filter((p) => p.id !== id));
    return {};
  }, []);

  const saveSet = useCallback(
    async ({ id, name, tags }: { id?: string; name: string; tags: string }): Promise<Result<HashtagSet>> => {
      const query = id
        ? supabase.from('hashtag_sets').update({ name, tags }).eq('id', id)
        : supabase.from('hashtag_sets').insert({ name, tags });
      const { data, error: err } = await query.select('*').single();
      if (err) return { error: message(err, 'Das Hashtag-Set konnte nicht gespeichert werden.') };
      const row = data as HashtagSet;
      setSets((list) => [row, ...list.filter((s) => s.id !== row.id)].sort(byName));
      return { data: row };
    },
    [],
  );

  const deleteSet = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('hashtag_sets').delete().eq('id', id);
    if (err) return { error: message(err, 'Das Hashtag-Set konnte nicht gelöscht werden.') };
    setSets((list) => list.filter((s) => s.id !== id));
    return {};
  }, []);

  const value = useMemo<State>(
    () => ({ posts, sets, loading, error, createPost, updatePost, deletePost, saveSet, deleteSet }),
    [posts, sets, loading, error, createPost, updatePost, deletePost, saveSet, deleteSet],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSocial(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSocial muss innerhalb von SocialProvider verwendet werden');
  return ctx;
}
