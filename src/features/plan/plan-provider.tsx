import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { setPdfBranding } from '@/features/documents/pdf-branding';
import { supabase } from '@/lib/supabase';

import { isPro, parsePlan, type PlanInfo, type ProFeature } from './plan-logic';
import { showPlanWall } from './plan-wall';

type State = {
  info: PlanInfo | null;
  /** Abo-Skript fehlt in der Datenbank -> alles freigeschaltet, keine Hinweise */
  missing: boolean;
  /** Pro oder Testphase (solange unbekannt: true, der Server prüft ohnehin) */
  pro: boolean;
  /** Von Hand vergebenes Abo (Herkunft „admin“): kostenlos, nichts zu kaufen oder zu verwalten */
  admin: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST202', 'PGRST205', '42883', '42P01'];

/** Abo des angemeldeten Nutzers (Gratis / Testphase / Pro) und Verbrauch im Monat. */
export function PlanProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase.rpc('my_plan');
    if (error) {
      if (MISSING.includes(String(error.code)) || /my_plan/.test(error.message ?? '')) setMissing(true);
      else console.warn('[Abo]', error);
      return;
    }
    setMissing(false);
    setInfo(parsePlan(data));
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (userId)
      supabase.rpc('my_plan').then(({ data, error }) => {
        if (!active) return;
        if (error) {
          if (MISSING.includes(String(error.code)) || /my_plan/.test(error.message ?? '')) setMissing(true);
          else console.warn('[Abo]', error);
          return;
        }
        setInfo(parsePlan(data));
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const pro = missing || !info || isPro(info.plan);

  // Herkunft des Abos (eigene Zeile; im Team gilt das Abo des Inhabers – dann nicht sichtbar)
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let active = true;
    if (userId && info)
      supabase
        .from('subscriptions')
        .select('source')
        .maybeSingle()
        .then(({ data }) => active && setAdmin((data as { source?: string } | null)?.source === 'admin'));
    return () => {
      active = false;
    };
  }, [userId, info]);

  // Gratis: „Erstellt mit Lunaxora“ unten auf den PDFs
  useEffect(() => {
    setPdfBranding(!pro);
  }, [pro]);

  const value = useMemo<State>(() => ({ info, missing, pro, admin, refresh: load }), [info, missing, pro, admin, load]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlan(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlan muss innerhalb von PlanProvider verwendet werden');
  return ctx;
}

/** Pro-Funktion nutzen: true = los; false = gesperrt, das Abo-Fenster erscheint. */
export function useProGate() {
  const { pro } = usePlan();
  return useCallback(
    (feature: ProFeature): boolean => {
      if (pro) return true;
      showPlanWall({ feature });
      return false;
    },
    [pro],
  );
}

/** Abo-Seite öffnen (z. B. nach „Grenze erreicht“) */
export function openPlanScreen(feature?: ProFeature) {
  router.push(feature ? { pathname: '/profil/abo', params: { funktion: feature } } : '/profil/abo');
}
