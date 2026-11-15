import { supabase } from '@/lib/supabase';

/**
 * Gutscheincode einlösen (Skript 20261120090000_feinschliff.sql, Funktion redeem_voucher).
 * Jeder Code geht genau einmal – z. B. 3 Monate Pro für die Warteliste.
 */
export async function redeemVoucher(code: string): Promise<{ months?: number; until?: string; error?: string }> {
  const clean = code.trim().toUpperCase().replace(/\s+/g, '');
  if (clean.length < 4) return { error: 'Bitte gib deinen Gutscheincode ein.' };
  const { data, error } = await supabase.rpc('redeem_voucher', { p_code: clean });
  if (error) {
    if (/voucher_used/.test(error.message)) return { error: 'Dieser Code wurde schon eingelöst.' };
    if (/voucher_invalid/.test(error.message)) return { error: 'Diesen Code kennen wir nicht. Prüf ihn bitte noch einmal.' };
    if (/voucher_paid/.test(error.message)) return { error: 'Du hast schon ein bezahltes Abo – der Code wird dafür nicht gebraucht.' };
    if (['PGRST202', '42883'].includes(String(error.code)))
      return { error: 'Gutscheine sind noch nicht eingerichtet (Skript 20261120090000_feinschliff.sql).' };
    return { error: `Das hat nicht geklappt. Bitte versuch es noch einmal.\n\nTechnische Details: ${error.message}` };
  }
  const r = (data ?? {}) as { months?: number; until?: string };
  return { months: r.months ?? 3, until: r.until };
}
