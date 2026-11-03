import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { todayIso } from '@/features/documents/document-logic';
import { supabase } from '@/lib/supabase';

import type { RawResult } from './assistant-logic';

export type AskResult = { data?: RawResult; error?: string; notSetUp?: boolean };

const SETUP =
  'Nexy ist noch nicht eingerichtet: Die Server-Funktion „assistant“ fehlt in Supabase (Anleitung: supabase/README.md, Abschnitt „Assistent“).';

export type HistoryEntry = { role: 'user' | 'nexy'; text: string };

type HttpFailure = { status: number; code?: string; detail?: string };

/** Fehlerantwort der Server-Funktion auslesen (Status, Fehlercode, kurze Beschreibung) */
async function httpFailure(error: unknown): Promise<HttpFailure | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
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
  return { status: res.status, code, detail };
}

const technical = (f: HttpFailure) => `${f.status} ${f.code ?? ''}${f.detail ? ` – ${f.detail}` : ''}`.trim();

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

  const http = await httpFailure(error);
  if (http) {
    if (http.status === 404) return { error: SETUP, notSetUp: true };
    if (http.code === 'missing_api_key') {
      return {
        error: 'Nexy ist fast eingerichtet: In Supabase fehlt noch das Geheimnis ANTHROPIC_API_KEY.',
        notSetUp: true,
      };
    }
    if (http.code === 'invalid_api_key')
      return {
        error: 'Der API-Schlüssel für Claude ist ungültig. Bitte prüfe ANTHROPIC_API_KEY in Supabase.',
        notSetUp: true,
      };
    if (http.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    if (http.status === 429)
      return { error: 'Gerade sind es zu viele Anfragen. Versuch es in einer Minute noch einmal.' };
    if (http.code === 'refused') return { error: 'Dabei kann Nexy nicht helfen. Formulier es bitte anders.' };
    if (http.code === 'text_too_long') return { error: 'Bitte schreib höchstens 2.000 Zeichen auf einmal.' };
    return {
      error: `Nexy konnte das gerade nicht auswerten. Versuch es noch einmal.\n\nTechnische Details: ${technical(http)}`,
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

export type TranscribeResult = { text?: string; error?: string; notSetUp?: boolean };

/**
 * Sprachaufnahme -> Text (Server-Funktion, Modus "transcribe").
 * `hints`: Namen (z. B. Kunden), damit sie richtig geschrieben werden.
 */
export async function transcribe(audio: string, mime: string, hints: string[] = []): Promise<TranscribeResult> {
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { mode: 'transcribe', audio, mime, hints: hints.slice(0, 20) },
  });
  if (!error) return { text: typeof data?.text === 'string' ? data.text : '' };

  const http = await httpFailure(error);
  if (http) {
    if (http.status === 404) return { error: SETUP, notSetUp: true };
    if (http.code === 'missing_groq_key')
      return {
        error:
          'Der Sprachmodus ist fast eingerichtet: In Supabase fehlt noch das Geheimnis GROQ_API_KEY (Anleitung: supabase/README.md, Abschnitt „Sprachmodus“).',
        notSetUp: true,
      };
    if (http.code === 'invalid_groq_key')
      return {
        error: 'Der API-Schlüssel für die Spracherkennung ist ungültig. Bitte prüfe GROQ_API_KEY in Supabase.',
        notSetUp: true,
      };
    // Die alte Server-Funktion kennt den Sprachmodus noch nicht und vermisst den Text
    if (http.code === 'empty_text')
      return {
        error:
          'In Supabase läuft noch die alte Version der Server-Funktion „assistant“ – ohne Sprachmodus. Bitte den neuen Code einspielen (supabase/README.md, Abschnitt „Sprachmodus“).',
        notSetUp: true,
      };
    if (http.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    if (http.status === 429)
      return { error: 'Gerade sind es zu viele Anfragen. Versuch es in einer Minute noch einmal.' };
    if (http.code === 'audio_too_large') return { error: 'Die Aufnahme war zu lang. Sag es bitte etwas kürzer.' };
    if (http.code === 'unsupported_audio' || http.code === 'invalid_audio')
      return { error: 'Die Aufnahme konnte nicht gelesen werden. Versuch es noch einmal.' };
    return {
      error: `Ich konnte dich gerade nicht verstehen. Versuch es noch einmal.\n\nTechnische Details: ${technical(http)}`,
    };
  }
  if (error instanceof FunctionsFetchError) {
    return { error: 'Keine Verbindung zu Nexy. Prüfe deine Internetverbindung.' };
  }
  return {
    error: `Die Spracherkennung hat nicht geantwortet.\n\nTechnische Details: ${String(error.message ?? error)}`,
  };
}
