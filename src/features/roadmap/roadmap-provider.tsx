import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

type RoadmapState = {
  /** Schlüssel aller erledigten Schritte */
  done: Set<string>;
  loading: boolean;
  /** 'setup' = Tabelle fehlt (Datenbank-Skript noch nicht ausgeführt) */
  error: 'setup' | 'failed' | null;
  /** Fehlermeldung, falls ein Haken nicht gespeichert werden konnte */
  saveError: string | null;
  toggle: (stepKey: string) => Promise<void>;
};

const RoadmapContext = createContext<RoadmapState | null>(null);
const MISSING_TABLE = ['PGRST205', '42P01', 'PGRST106'];

async function fetchProgress() {
  const { data, error } = await supabase.from('roadmap_progress').select('step_key');
  return { keys: (data ?? []).map((r: { step_key: string }) => r.step_key), error };
}

/** Lädt und speichert, welche Fahrplan-Schritte erledigt sind. */
export function RoadmapProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<RoadmapState['error']>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchProgress().then(({ keys, error: loadError }) => {
      if (!active) return;
      if (loadError) {
        console.warn('[Fahrplan]', loadError);
        setError(MISSING_TABLE.includes(loadError.code) ? 'setup' : 'failed');
      } else {
        setDone(new Set(keys));
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const toggle = useCallback(
    async (stepKey: string) => {
      const wasDone = done.has(stepKey);
      // sofort anzeigen, im Hintergrund speichern
      const update = (add: boolean) =>
        setDone((current) => {
          const next = new Set(current);
          if (add) next.add(stepKey);
          else next.delete(stepKey);
          return next;
        });
      update(!wasDone);
      setSaveError(null);

      const { error: saveErr } = wasDone
        ? await supabase.from('roadmap_progress').delete().eq('user_id', userId).eq('step_key', stepKey)
        : await supabase.from('roadmap_progress').upsert({ user_id: userId, step_key: stepKey }, { onConflict: 'user_id,step_key' });

      if (saveErr) {
        console.warn('[Fahrplan]', saveErr);
        update(wasDone); // zurücknehmen
        setSaveError(
          MISSING_TABLE.includes(saveErr.code)
            ? 'Der Fortschritt kann noch nicht gespeichert werden – das Datenbank-Skript für den Fahrplan fehlt (siehe supabase/README.md).'
            : 'Das hat nicht geklappt. Bitte versuch es noch einmal.',
        );
      }
    },
    [done, userId],
  );

  return (
    <RoadmapContext.Provider value={{ done, loading, error, saveError, toggle }}>{children}</RoadmapContext.Provider>
  );
}

export function useRoadmap(): RoadmapState {
  const ctx = useContext(RoadmapContext);
  if (!ctx) throw new Error('useRoadmap muss innerhalb von RoadmapProvider verwendet werden');
  return ctx;
}
