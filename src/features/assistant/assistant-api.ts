import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { todayIso } from '@/features/documents/document-logic';
import { supabase } from '@/lib/supabase';

import type { RawResult } from './assistant-logic';

export type AskResult = { data?: RawResult; error?: string; notSetUp?: boolean };

const SETUP =
  'Nexy ist noch nicht eingerichtet: Die Server-Funktion „assistant“ fehlt in Supabase (Anleitung: supabase/README.md, Abschnitt „Assistent“).';

export type HistoryEntry = { role: 'user' | 'nexy'; text: string };

/** Nachricht an Nexy (Server-Funktion) – mit bisherigem Gespräch und Übersicht über das Business. */
export async function askAssistant(
  text: string,
  history: HistoryEntry[] = [],
  context: object = {},
): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { text, today: todayIso(), history, context },
  });
  if (!error) return { data: (data ?? {}) as RawResult };

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const body = await res.json();
      code = body?.error;
      detail = typeof body?.detail === 'string' ? body.detail : undefined;
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 404) return { error: SETUP, notSetUp: true };
    if (code === 'missing_api_key') {
      return {
        error: 'Nexy ist fast eingerichtet: In Supabase fehlt noch das Geheimnis ANTHROPIC_API_KEY.',
        notSetUp: true,
      };
    }
    if (code === 'invalid_api_key')
      return {
        error: 'Der API-Schlüssel für Claude ist ungültig. Bitte prüfe ANTHROPIC_API_KEY in Supabase.',
        notSetUp: true,
      };
    if (res.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    if (res.status === 429)
      return { error: 'Gerade sind es zu viele Anfragen. Versuch es in einer Minute noch einmal.' };
    if (code === 'refused') return { error: 'Dabei kann Nexy nicht helfen. Formulier es bitte anders.' };
    if (code === 'text_too_long') return { error: 'Bitte schreib höchstens 2.000 Zeichen auf einmal.' };
    return {
      error:
        `Nexy konnte das gerade nicht auswerten. Versuch es noch einmal.\n\nTechnische Details: ${res.status} ${code ?? ''}${detail ? ` – ${detail}` : ''}`.trim(),
    };
  }
  if (error instanceof FunctionsFetchError) {
    return {
      error:
        'Keine Verbindung zu Nexy. Prüfe deine Internetverbindung – oder ob die Server-Funktion „assistant“ in Supabase eingerichtet ist.',
    };
  }
  return { error: `Nexy hat nicht geantwortet.\n\nTechnische Details: ${String(error.message ?? error)}` };
}
