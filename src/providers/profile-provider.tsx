import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import type { Goal, Industry, Stage } from '@/features/onboarding/options';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  display_name: string | null;
  business_name: string | null;
  stage: Stage | null;
  industry: Industry | null;
  goals: Goal[];
  onboarding_completed_at: string | null;
  /** Einführungen (fehlen, solange das Skript 20261115090000_tutorials.sql nicht ausgeführt ist) */
  tutorials_done?: string[];
  tutorials_off?: boolean;
};

export type ProfileUpdate = Partial<Omit<Profile, 'id'>>;

type ProfileState = {
  profile: Profile | null;
  loading: boolean;
  /** 'setup' = Tabelle fehlt (SQL noch nicht in Supabase ausgeführt) */
  error: 'setup' | 'failed' | null;
  reload: () => Promise<void>;
  save: (values: ProfileUpdate) => Promise<{ error?: string }>;
};

const ProfileContext = createContext<ProfileState | null>(null);

/** Fehlercodes, wenn die Tabelle in der Datenbank noch nicht existiert */
const MISSING_TABLE = ['PGRST205', '42P01', 'PGRST106'];

async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return { data: (data as Profile | null) ?? null, error };
}

/** Lädt das Profil des angemeldeten Nutzers und speichert Änderungen. */
export function ProfileProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ProfileState['error']>(null);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchProfile>>) => {
    if (result.error) {
      console.warn('[Profil]', result.error);
      setError(MISSING_TABLE.includes(result.error.code) ? 'setup' : 'failed');
    } else {
      setError(null);
      setProfile(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetchProfile(userId).then((result) => {
      if (active) apply(result);
    });
    return () => {
      active = false;
    };
  }, [userId, apply]);

  const reload = useCallback(async () => {
    setLoading(true);
    apply(await fetchProfile(userId));
  }, [userId, apply]);

  const save = useCallback(
    async (values: ProfileUpdate) => {
      const { data, error: saveError } = await supabase
        .from('profiles')
        .upsert({ id: userId, ...values })
        .select('*')
        .single();
      if (saveError) {
        console.warn('[Profil]', saveError);
        // 23503: das Konto zur gespeicherten Anmeldung existiert nicht mehr
        if (saveError.code === '23503') {
          await supabase.auth.signOut({ scope: 'local' });
          return { error: 'Dein Konto wurde nicht gefunden. Bitte melde dich neu an oder registriere dich erneut.' };
        }
        return {
          error: MISSING_TABLE.includes(saveError.code)
            ? 'Die Datenbank ist noch nicht eingerichtet (siehe supabase/README.md).'
            : `Speichern hat nicht geklappt. Bitte versuch es noch einmal.\n\nTechnische Details: ${saveError.message}`,
        };
      }
      setProfile(data as Profile);
      return {};
    },
    [userId],
  );

  return (
    <ProfileContext.Provider value={{ profile, loading, error, reload, save }}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile muss innerhalb von ProfileProvider verwendet werden');
  return ctx;
}
