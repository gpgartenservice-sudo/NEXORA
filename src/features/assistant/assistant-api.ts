import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { todayIso } from '@/features/documents/document-logic';
import { supabase } from '@/lib/supabase';

import type { ReceiptReading } from '@/features/finance/receipt-logic';

import type { RawResult } from './assistant-logic';

export type AskResult = {
  data?: RawResult;
  error?: string;
  notSetUp?: boolean;
  /** Gratis-Grenze erreicht */ quota?: boolean;
};

const SETUP =
  'Nexy ist noch nicht eingerichtet: Die Server-Funktion „assistant“ fehlt in Supabase (Anleitung: supabase/README.md, Abschnitt „Assistent“).';

export type HistoryEntry = { role: 'user' | 'nexy'; text: string };

type HttpFailure = { status: number; code?: string; detail?: string; limit?: number };

/** Fehlerantwort der Server-Funktion auslesen (Status, Fehlercode, kurze Beschreibung) */
async function httpFailure(error: unknown): Promise<HttpFailure | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  const res = error.context as Response;
  let code: string | undefined;
  let detail: string | undefined;
  let limit: number | undefined;
  try {
    const body = await res.json();
    code = body?.error;
    detail = typeof body?.detail === 'string' ? body.detail : undefined;
    limit = typeof body?.limit === 'number' ? body.limit : undefined;
  } catch {
    // keine JSON-Antwort
  }
  return { status: res.status, code, detail, limit };
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
    if (http.code === 'quota_exceeded')
      return {
        error: `Deine ${http.limit ?? 20} Gratis-Nachrichten an Nexy sind für diesen Monat aufgebraucht. Mit NEXORA Pro geht es gleich weiter – sonst wieder ab dem 1. des nächsten Monats.`,
        quota: true,
      };
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

export type SpeechAudioResult = {
  audio?: Blob;
  error?: string;
  /** Liegt an der Einrichtung (Schlüssel, Stimme, alte Server-Funktion) – nicht bei jeder Antwort neu versuchen */
  notSetUp?: boolean;
};

/**
 * Text -> gesprochene Sprache mit der natürlichen Stimme (Server-Funktion,
 * Modus "speak", ElevenLabs). Die Fehlertexte stehen in den Einstellungen.
 */
export async function speechAudio(text: string, signal?: AbortSignal): Promise<SpeechAudioResult> {
  const { data, error } = await supabase.functions.invoke('assistant', {
    body: { mode: 'speak', say: text },
    signal,
  });
  if (!error) {
    if (data instanceof Blob && data.size > 0) return { audio: data };
    return { error: 'ElevenLabs hat keine Sprache geliefert.' };
  }

  const http = await httpFailure(error);
  if (http) {
    if (http.status === 404) return { error: SETUP, notSetUp: true };
    // Die alte Server-Funktion kennt das Vorlesen noch nicht und vermisst den Text
    if (http.code === 'empty_text')
      return {
        error:
          'In Supabase läuft noch die alte Version der Server-Funktion „assistant“ – ohne natürliche Stimme. Bitte den neuen Code einspielen.',
        notSetUp: true,
      };
    if (http.code === 'missing_elevenlabs_key')
      return { error: 'In Supabase fehlt noch das Geheimnis ELEVENLABS_API_KEY.', notSetUp: true };
    if (http.code === 'missing_elevenlabs_voice')
      return { error: 'In Supabase fehlt noch das Geheimnis ELEVENLABS_VOICE_ID.', notSetUp: true };
    if (http.code === 'invalid_elevenlabs_key')
      return { error: 'Der ElevenLabs-Schlüssel ist ungültig oder darf kein Text to Speech.', notSetUp: true };
    if (http.code === 'elevenlabs_voice_not_found')
      return { error: 'Die Stimme aus ELEVENLABS_VOICE_ID gibt es bei ElevenLabs nicht (mehr).', notSetUp: true };
    if (http.code === 'elevenlabs_quota')
      return { error: 'Die ElevenLabs-Credits sind aufgebraucht (Limit des Schlüssels oder des Tarifs).', notSetUp: true };
    if (http.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    if (http.status === 429) return { error: 'Gerade sind es zu viele Anfragen.' };
    return { error: `ElevenLabs hat gerade nicht geantwortet (${technical(http)}).` };
  }
  if (error instanceof FunctionsFetchError) return { error: 'Keine Verbindung zu ElevenLabs.' };
  return { error: `ElevenLabs hat gerade nicht geantwortet (${String(error.message ?? error)}).` };
}

export type ReceiptResult = { data?: ReceiptReading; error?: string; notSetUp?: boolean; quota?: boolean };

/** Beleg (Foto/PDF als Base64) von Nexy lesen lassen (Server-Funktion, Modus "receipt"). */
export async function readReceipt(file: string, mime: string): Promise<ReceiptResult> {
  const { data, error } = await supabase.functions.invoke('assistant', { body: { mode: 'receipt', file, mime } });
  if (!error) return { data: (data?.receipt ?? null) as ReceiptReading };

  const http = await httpFailure(error);
  if (http) {
    if (http.status === 404) return { error: SETUP, notSetUp: true };
    if (http.code === 'missing_api_key')
      return {
        error: 'Nexy ist fast eingerichtet: In Supabase fehlt noch das Geheimnis ANTHROPIC_API_KEY.',
        notSetUp: true,
      };
    if (http.code === 'invalid_api_key')
      return {
        error: 'Der API-Schlüssel für Claude ist ungültig. Bitte prüfe ANTHROPIC_API_KEY in Supabase.',
        notSetUp: true,
      };
    // Die alte Server-Funktion kennt das Belege-Lesen noch nicht und vermisst den Text
    if (http.code === 'empty_text')
      return {
        error:
          'In Supabase läuft noch eine ältere Version der Server-Funktion „assistant“ – ohne Belege-Lesen. Bitte den neuen Code einspielen (supabase/README.md, Abschnitt 4).',
        notSetUp: true,
      };
    if (http.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    if (http.status === 429)
      return { error: 'Gerade sind es zu viele Anfragen. Versuch es in einer Minute noch einmal.' };
    if (http.code === 'quota_exceeded')
      return {
        error: `Deine ${http.limit ?? 5} Gratis-Belege zum Auslesen sind für diesen Monat aufgebraucht. Trag die Ausgabe einfach selbst ein – der Beleg wird trotzdem gespeichert. Mit NEXORA Pro liest Nexy weiter.`,
        quota: true,
      };
    if (http.code === 'file_too_large') return { error: 'Die Datei ist zu groß zum Lesen (höchstens 6 MB).' };
    if (http.code === 'unsupported_file' || http.code === 'invalid_file')
      return { error: 'Diese Datei kann Nexy nicht lesen. Bitte ein Foto (JPG/PNG) oder eine PDF nehmen.' };
    return {
      error: `Nexy konnte den Beleg gerade nicht lesen – trag die Ausgabe einfach selbst ein.\n\nTechnische Details: ${technical(http)}`,
    };
  }
  if (error instanceof FunctionsFetchError)
    return { error: 'Keine Verbindung zu Nexy. Prüfe deine Internetverbindung.' };
  return { error: `Nexy hat nicht geantwortet.\n\nTechnische Details: ${String(error.message ?? error)}` };
}
