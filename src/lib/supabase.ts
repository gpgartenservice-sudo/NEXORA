import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { companyFetch } from './company-header';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error(
    'Supabase ist nicht eingerichtet: EXPO_PUBLIC_SUPABASE_URL und EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY fehlen in der .env-Datei.',
  );
}

/** Adresse des Supabase-Projekts (z. B. für Links zu Server-Funktionen) */
export const SUPABASE_URL = url;

export const supabase = createClient(url, publishableKey, {
  auth: {
    // Im Web/auf dem Mac speichert Supabase die Sitzung selbst im Browser-Speicher,
    // auf dem Handy im App-Speicher – so bleibt man angemeldet.
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    // Bestätigung läuft über einen Code in der App, nicht über Links
    detectSessionInUrl: false,
  },
  // offene Firma mitschicken (mehrere Firmen in einem Konto)
  global: { fetch: companyFetch },
});

const KEY: string = publishableKey;
let side: SupabaseClient | null = null;

/**
 * Zweiter Anmelde-Client ohne Speicher: meldet weitere Konten an bzw. prüft sie, ohne das
 * aktive Konto anzufassen (siehe lib/accounts.ts).
 */
export function sideAuth() {
  side ??= createClient(SUPABASE_URL, KEY, {
    auth: { storageKey: 'nexora-side-auth', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return side.auth;
}

// Handy: Sitzung nur erneuern, solange die App im Vordergrund ist
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
