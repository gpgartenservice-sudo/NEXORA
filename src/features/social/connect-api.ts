import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

import { connectedLabel, type ConnectedPlatform, type SocialAccount } from './connect-logic';

/**
 * Server-Funktion "social" (TikTok & Instagram verbinden).
 * Fehler kommen als verständlicher Text zurück; `setup` = in Supabase fehlt noch etwas.
 */
export type Reply<T> = { data?: T; error?: string; setup?: boolean };

export type SetupStatus = { tiktok: boolean; instagram: boolean; redirect_uri: string };
export type StartReply = { url: string; state: string; redirect_uri: string };
export type FinishReply = { account: SocialAccount; videos: number; warning?: string };
export type SyncReply = {
  results: { platform: ConnectedPlatform; account?: SocialAccount; videos?: number; error?: string }[];
};

const MISSING_FUNCTION =
  'Die Server-Funktion „social“ fehlt noch in Supabase. Anleitung: supabase/README.md, Abschnitt „TikTok & Instagram verbinden“.';

async function invoke<T>(body: Record<string, unknown>, platform?: ConnectedPlatform): Promise<Reply<T>> {
  const { data, error } = await supabase.functions.invoke('social', { body });
  if (!error) return { data: data as T };

  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let code: string | undefined;
    let detail: string | undefined;
    let which: ConnectedPlatform | undefined = platform;
    try {
      const b = await res.json();
      code = b?.error;
      detail = typeof b?.detail === 'string' ? b.detail : undefined;
      if (b?.platform === 'tiktok' || b?.platform === 'instagram') which = b.platform;
    } catch {
      // keine JSON-Antwort
    }
    const name = which ? connectedLabel(which) : 'Die Plattform';
    if (res.status === 404) return { error: MISSING_FUNCTION, setup: true };
    if (code === 'not_configured') {
      const keys =
        which === 'instagram'
          ? 'INSTAGRAM_APP_ID und INSTAGRAM_APP_SECRET'
          : 'TIKTOK_CLIENT_KEY und TIKTOK_CLIENT_SECRET';
      return { error: `${name} ist noch nicht eingerichtet: In Supabase fehlen die Geheimnisse ${keys}.`, setup: true };
    }
    if (code === 'missing_tables')
      return {
        error:
          'Das Datenbank-Skript für verbundene Konten fehlt noch (20261108090000_social_accounts.sql, siehe supabase/README.md).',
        setup: true,
      };
    if (code === 'return_not_allowed')
      return {
        error:
          'Diese Web-Adresse ist für die Rückleitung nicht freigegeben. Trag sie in Supabase als Geheimnis SOCIAL_APP_ORIGINS ein – oder verbinde über die Mac-App.',
        setup: true,
      };
    if (code === 'invalid_state') return { error: 'Die Anmeldung ist abgelaufen. Bitte verbinde noch einmal.' };
    if (code === 'platform_error')
      return { error: `${name} hat die Anmeldung abgelehnt.\n\nTechnische Details: ${detail ?? res.status}` };
    if (res.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    return {
      error:
        `Das hat gerade nicht geklappt. Versuch es noch einmal.\n\nTechnische Details: ${res.status} ${code ?? ''}${detail ? ` – ${detail}` : ''}`.trim(),
    };
  }
  if (error instanceof FunctionsFetchError) {
    return { error: 'Keine Verbindung zum Server. Prüfe deine Internetverbindung.' };
  }
  return { error: `Das hat gerade nicht geklappt.\n\nTechnische Details: ${String(error.message ?? error)}` };
}

export const setupStatus = () => invoke<SetupStatus>({ action: 'status' });
export const startConnect = (platform: ConnectedPlatform, returnTo?: string) =>
  invoke<StartReply>({ action: 'start', platform, ...(returnTo ? { return_to: returnTo } : {}) }, platform);
export const finishConnect = (platform: ConnectedPlatform, code: string, state: string) =>
  invoke<FinishReply>({ action: 'finish', platform, code, state }, platform);
export const syncAccounts = (platform?: ConnectedPlatform) =>
  invoke<SyncReply>({ action: 'sync', ...(platform ? { platform } : {}) }, platform);
export const disconnectAccount = (platform: ConnectedPlatform) =>
  invoke<{ ok: true }>({ action: 'disconnect', platform }, platform);
