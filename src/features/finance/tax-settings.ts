import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabase';

import { DEFAULT_RESERVE_PERCENT } from './tax-logic';

/**
 * Prozentsatz für den Steuer-Topf (Firmendaten, Spalte tax_reserve_percent).
 * Fehlt das Datenbank-Skript, gilt der Vorschlag von 25 % (nur lokal).
 */
export function useTaxReservePercent(userId: string | null | undefined) {
  const [percent, setPercent] = useState(DEFAULT_RESERVE_PERCENT);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase
      .from('business_settings')
      .select('tax_reserve_percent')
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) return setMissing(true);
        const v = (data as { tax_reserve_percent?: number | string | null } | null)?.tax_reserve_percent;
        if (v !== null && v !== undefined) setPercent(Number(v));
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const save = useCallback(
    async (value: number): Promise<string | null> => {
      setPercent(value);
      if (!userId) return null;
      const { error } = await supabase
        .from('business_settings')
        .upsert({ user_id: userId, tax_reserve_percent: value }, { onConflict: 'user_id' });
      if (error) {
        setMissing(true);
        return 'Der Prozentsatz gilt erst einmal nur hier: Zum Speichern fehlt das Datenbank-Skript 20261114090000_tax.sql (siehe supabase/README.md).';
      }
      return null;
    },
    [userId],
  );

  return { percent, save, missing };
}
