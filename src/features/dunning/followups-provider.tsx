import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isProRequired, proRequiredText } from '@/features/plan/plan-logic';
import { supabase } from '@/lib/supabase';

import type { Followup, FollowupKind } from './dunning-logic';

type Result<T = undefined> = { data?: T; error?: string };

type State = {
  followups: Followup[];
  loading: boolean;
  /** 'setup' = Datenbank-Skript fürs Mahnwesen fehlt */
  error: 'setup' | 'failed' | null;
  /** Vermerken, dass eine Erinnerung/Mahnung bzw. Bewertungsbitte verschickt wurde */
  record: (input: {
    document_id: string;
    kind: FollowupKind;
    fee?: number;
    new_due_on?: string | null;
  }) => Promise<Result<Followup>>;
  /** Vermerk zurücknehmen */
  remove: (id: string) => Promise<Result>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];
const SETUP_TEXT =
  'Erinnerungen und Mahnungen können noch nicht vermerkt werden: Das Datenbank-Skript dafür fehlt (20261110090000_invoice_followups.sql, siehe supabase/README.md).';

const toFollowup = (row: Record<string, unknown>): Followup => ({
  ...(row as unknown as Followup),
  fee: Number(row.fee ?? 0),
});

/** Vermerke zu Rechnungen: Zahlungserinnerungen, Mahnungen, Bewertungsbitten. */
export function FollowupsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<State['error']>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase
      .from('invoice_followups')
      .select('*')
      .order('sent_on')
      .then(({ data, error: err }) => {
        if (!active) return;
        setLoading(false);
        if (err) {
          if (MISSING.includes(err.code)) return setError('setup');
          console.warn('[Mahnwesen]', err);
          return setError('failed');
        }
        setError(null);
        setFollowups(((data ?? []) as Record<string, unknown>[]).map(toFollowup));
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const record = useCallback<State['record']>(async ({ document_id, kind, fee = 0, new_due_on = null }) => {
    const { data, error: err } = await supabase
      .from('invoice_followups')
      .insert({ document_id, kind, fee, new_due_on })
      .select('*')
      .single();
    if (err) {
      if (MISSING.includes(err.code)) return { error: SETUP_TEXT };
      if (isProRequired(err)) return { error: proRequiredText('dunning') };
      return { error: `Das konnte nicht vermerkt werden.\n\nTechnische Details: ${err.message}` };
    }
    const row = toFollowup(data as Record<string, unknown>);
    setFollowups((list) => [...list, row]);
    return { data: row };
  }, []);

  const remove = useCallback<State['remove']>(async (id) => {
    const { error: err } = await supabase.from('invoice_followups').delete().eq('id', id);
    if (err) return { error: `Das konnte nicht zurückgenommen werden.\n\nTechnische Details: ${err.message}` };
    setFollowups((list) => list.filter((f) => f.id !== id));
    return {};
  }, []);

  const value = useMemo<State>(
    () => ({ followups, loading, error, record, remove }),
    [followups, loading, error, record, remove],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFollowups(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFollowups muss innerhalb von FollowupsProvider verwendet werden');
  return ctx;
}
