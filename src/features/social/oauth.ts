import { Platform } from 'react-native';

import { desktop } from '@/lib/desktop';

import { startConnect } from './connect-api';
import { connectedLabel, type ConnectedPlatform } from './connect-logic';

/**
 * Anmeldung bei TikTok bzw. Instagram:
 * - Mac-App: eigenes Anmeldefenster, das bei der Rückleitung schließt.
 * - Browser: Seite wechselt zur Anmeldung und kommt danach nach /social zurück.
 */
export type AuthOutcome =
  | { kind: 'code'; platform: ConnectedPlatform; code: string; state: string }
  | { kind: 'redirecting' }
  | { kind: 'cancelled' }
  | { kind: 'error'; error: string; setup?: boolean };

const PENDING_KEY = 'nexora.social.pending';

/** Kann hier verbunden werden? (Mac-App oder Browser) */
export function connectSupported(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

function denied(platform: ConnectedPlatform, error: string, description?: string | null): string {
  const name = connectedLabel(platform);
  if (error === 'access_denied' || error === 'user_denied') return `Du hast die Anmeldung bei ${name} abgebrochen.`;
  return `${name} hat die Anmeldung abgelehnt.\n\nTechnische Details: ${error}${description ? ` – ${description}` : ''}`;
}

export async function authorize(platform: ConnectedPlatform): Promise<AuthOutcome> {
  const bridge = desktop();
  if (bridge?.openAuthWindow) {
    const start = await startConnect(platform);
    if (!start.data) return { kind: 'error', error: start.error ?? 'Unbekannter Fehler', setup: start.setup };
    let result: { url?: string; cancelled?: boolean };
    try {
      result = await bridge.openAuthWindow({ url: start.data.url, callbackUrl: start.data.redirect_uri });
    } catch (e) {
      return { kind: 'error', error: `Das Anmeldefenster ließ sich nicht öffnen.\n\nTechnische Details: ${String(e)}` };
    }
    if (result.cancelled || !result.url) return { kind: 'cancelled' };
    const params = new URL(result.url).searchParams;
    const error = params.get('error');
    if (error) return { kind: 'error', error: denied(platform, error, params.get('error_description')) };
    const code = params.get('code');
    const state = params.get('state');
    if (!code || state !== start.data.state)
      return { kind: 'error', error: 'Die Anmeldung passt nicht zusammen. Bitte verbinde noch einmal.' };
    return { kind: 'code', platform, code, state };
  }

  if (!connectSupported()) {
    return {
      kind: 'error',
      error: 'Verbinden geht im Moment in der Mac-App oder im Browser – danach siehst du deine Zahlen auch hier.',
    };
  }
  const start = await startConnect(platform, `${window.location.origin}/social`);
  if (!start.data) return { kind: 'error', error: start.error ?? 'Unbekannter Fehler', setup: start.setup };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ platform, state: start.data.state }));
  } catch {
    // ohne Speicher klappt die Prüfung nach der Rückkehr nicht – dann lieber abbrechen
    return { kind: 'error', error: 'Dein Browser blockiert den Zwischenspeicher. Bitte verbinde über die Mac-App.' };
  }
  window.location.assign(start.data.url);
  return { kind: 'redirecting' };
}

export type ReturnParams = {
  social_platform?: string;
  social_code?: string;
  social_state?: string;
  social_error?: string;
  social_error_description?: string;
};

/** Rückkehr von der Anmeldeseite (Browser): gehört sie zu dieser Sitzung? */
export function readReturn(params: ReturnParams): AuthOutcome | null {
  if (!params.social_state && !params.social_error) return null;
  let pending: { platform?: string; state?: string } | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    pending = null;
  }
  const platform = params.social_platform;
  if (platform !== 'tiktok' && platform !== 'instagram') return { kind: 'error', error: 'Unbekannte Plattform.' };
  if (!pending || pending.platform !== platform || pending.state !== params.social_state)
    return { kind: 'error', error: 'Diese Anmeldung gehört nicht zu dieser Sitzung. Bitte verbinde noch einmal.' };
  if (params.social_error)
    return { kind: 'error', error: denied(platform, params.social_error, params.social_error_description) };
  if (!params.social_code)
    return { kind: 'error', error: 'Die Anmeldung hat keinen Code geliefert. Bitte noch einmal.' };
  return { kind: 'code', platform, code: params.social_code, state: params.social_state! };
}
