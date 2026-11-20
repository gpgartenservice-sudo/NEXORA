import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * iPhone: Push-Mitteilungen vom Server (z. B. „Angebot angenommen“, auch wenn Lunaxora zu ist).
 * Das Gerät meldet sein Expo-Push-Kennzeichen an (Tabelle push_tokens); verschickt wird beim
 * Server (supabase/migrations/20261125090000_push_angebote.sql). Braucht ein eingerichtetes
 * Expo-Projekt (extra.eas.projectId) und die Erlaubnis für Mitteilungen – sonst passiert nichts.
 */
type Mod = typeof import('expo-notifications');
let N: Mod | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  N = require('expo-notifications') as Mod;
} catch {
  N = null;
}

const MISSING = ['PGRST202', '42883', 'PGRST205', '42P01'];
let token: string | null = null;
let ready: Promise<boolean> = Promise.resolve(false);

function projectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

async function deviceToken(): Promise<string | null> {
  const id = projectId();
  if (!N || !id) return null;
  const permission = await N.getPermissionsAsync().catch(() => null);
  if (!permission?.granted) return null;
  const { data } = await N.getExpoPushTokenAsync({ projectId: id });
  return data || null;
}

/** Dieses iPhone für Push-Mitteilungen des angemeldeten Kontos eintragen */
export function registerPush(): Promise<boolean> {
  ready = (async () => {
    try {
      const t = await deviceToken();
      if (!t) return false;
      const { error } = await supabase.rpc('push_register', {
        p_token: t,
        p_platform: Platform.OS === 'android' ? 'android' : 'ios',
      });
      if (error) {
        if (!MISSING.includes(String(error.code))) console.warn('[Push]', error);
        return false;
      }
      token = t;
      return true;
    } catch (e) {
      console.warn('[Push]', e);
      return false;
    }
  })();
  return ready;
}

/** Abmelden oder Angebots-Mitteilungen aus: dieses iPhone nicht mehr benachrichtigen */
export async function unregisterPush(): Promise<void> {
  ready = Promise.resolve(false);
  try {
    const t = token ?? (await deviceToken());
    token = null;
    if (t) await supabase.rpc('push_unregister', { p_token: t });
  } catch {
    // ohne Verbindung: bleibt eingetragen, bis sich hier jemand anderes anmeldet
  }
}

/** Läuft Push auf diesem Gerät? Dann meldet die App Antworten nicht noch einmal selbst. */
export function pushActive(): Promise<boolean> {
  return ready;
}

/** Tippen auf eine Push-Mitteilung (data aus der Nachricht, z. B. order_id) */
export function onPushOpen(open: (data: Record<string, unknown>) => void): () => void {
  if (!N) return () => {};
  const sub = N.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    if (data && typeof data === 'object') open(data as Record<string, unknown>);
  });
  return () => sub.remove();
}
