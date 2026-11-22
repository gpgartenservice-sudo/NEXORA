/**
 * Teamleiter eines Einsatzes (Arbeitsplan) darf den Auftrag dazu abhaken oder wieder öffnen –
 * auch ohne Recht „Aufträge bearbeiten“. Die Regel prüft die Datenbank (order_lead_done,
 * Skript 20261202090000_teamleiter_einsatz.sql).
 */
import { useEffect, useState } from 'react';

import { roleErrorText } from '@/features/team/roles';
import { supabase } from '@/lib/supabase';

export const ORDER_LEAD_SCRIPT = 'Das Abhaken als Teamleiter braucht noch das Datenbank-Skript 20261202090000_teamleiter_einsatz.sql.';

export async function orderLeadDone(orderId: string, done: boolean): Promise<{ completed?: boolean; title?: string; error?: string }> {
  const { data, error } = await supabase.rpc('order_lead_done', { p_order: orderId, p_done: done });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return { error: ORDER_LEAD_SCRIPT };
    return { error: roleErrorText(error.message) ?? 'Das hat nicht geklappt. Bitte versuch es noch einmal.' };
  }
  const r = (data ?? {}) as { completed?: boolean; title?: string };
  return { completed: !!r.completed, title: r.title };
}

/** Bin ich Teamleiter eines Einsatzes zu diesem Auftrag? (null = wird noch geladen) */
export function useOrderLead(orderId: string | null | undefined, me: string | null | undefined): boolean | null {
  const [state, setState] = useState<{ key: string; lead: boolean } | null>(null);
  const key = `${orderId ?? ''}|${me ?? ''}`;
  useEffect(() => {
    if (!orderId || !me) return;
    let alive = true;
    void supabase
      .from('work_shifts')
      .select('id')
      .eq('order_id', orderId)
      .eq('member_id', me)
      .eq('is_lead', true)
      .limit(1)
      .then(({ data, error }) => {
        if (alive) setState({ key, lead: !error && (data ?? []).length > 0 });
      });
    return () => {
      alive = false;
    };
  }, [orderId, me, key]);
  if (!orderId || !me) return false;
  return state?.key === key ? state.lead : null;
}
