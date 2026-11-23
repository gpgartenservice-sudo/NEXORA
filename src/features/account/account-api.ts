import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import { deleteErrorText, type DeletionInfo } from './account-delete-logic';

/**
 * Server-Funktion "account": prüfen, was beim Löschen passiert, und das Konto endgültig löschen
 * (supabase/functions/account, Einrichtung: supabase/README.md, Abschnitt 18).
 */
type Result<T> = { data?: T; error?: string; code?: string };

async function call<T>(body: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.functions.invoke('account', { body });
  if (!error) return { data: data as T };
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const b = await res.json();
      code = typeof b?.error === 'string' ? b.error : undefined;
      detail = typeof b?.detail === 'string' ? b.detail : undefined;
    } catch {
      // keine JSON-Antwort
    }
    return { code: code ?? `http_${res.status}`, error: deleteErrorText(code, res.status, detail) };
  }
  if (error instanceof FunctionsFetchError) return { code: 'offline', error: deleteErrorText('offline', 0) };
  return { error: deleteErrorText(undefined, 0, String(error.message ?? error)) };
}

/** Was hängt am Konto? (Abo, Firmen, Team) – löscht nichts */
export const loadDeletionInfo = () => call<DeletionInfo>({ mode: 'check' });

/** Konto endgültig löschen; confirm = E-Mail-Adresse des Kontos */
export const deleteMyAccount = (confirm: string) => call<{ deleted: boolean; files?: number }>({ mode: 'delete', confirm });
