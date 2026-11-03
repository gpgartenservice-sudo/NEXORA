import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { todayIso } from '@/features/documents/document-logic';
import { supabase } from '@/lib/supabase';

import type { RawResult } from './assistant-logic';

export type AskResult = { data?: RawResult; error?: string; notSetUp?: boolean };

const SETUP =
  'Der Assistent ist noch nicht eingerichtet: Die Server-Funktion „assistant“ fehlt in Supabase (Anleitung: supabase/README.md, Abschnitt „Assistent“).';

/** Text an die Server-Funktion schicken – sie lässt Claude Vorschläge daraus machen. */
export async function askAssistant(text: string): Promise<AskResult> {
  const { data, error } = await supabase.functions.invoke('assistant', { body: { text, today: todayIso() } });
  if (!error) return { data: (data ?? {}) as RawResult };

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let code: string | undefined;
    try {
      code = (await res.json())?.error;
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 404) return { error: SETUP, notSetUp: true };
    if (code === 'missing_api_key') {
      return {
        error: 'Der Assistent ist fast eingerichtet: In Supabase fehlt noch das Geheimnis ANTHROPIC_API_KEY.',
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
    if (code === 'refused') return { error: 'Dazu kann der Assistent nichts anlegen. Formulier es bitte anders.' };
    if (code === 'text_too_long') return { error: 'Bitte schreib höchstens 2.000 Zeichen auf einmal.' };
    return {
      error:
        `Der Assistent konnte das gerade nicht auswerten. Versuch es noch einmal.\n\nTechnische Details: ${res.status} ${code ?? ''}`.trim(),
    };
  }
  if (error instanceof FunctionsFetchError) {
    return {
      error:
        'Keine Verbindung zum Assistenten. Prüfe deine Internetverbindung – oder ob die Server-Funktion „assistant“ in Supabase eingerichtet ist.',
    };
  }
  return { error: `Der Assistent hat nicht geantwortet.\n\nTechnische Details: ${String(error.message ?? error)}` };
}
