import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type AuthError, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';

import { sideAuth, supabase } from './supabase';

/**
 * Mehrere Konten auf einem Gerät: Wer hier ein weiteres Konto anmeldet, bleibt mit dem ersten
 * angemeldet und wechselt im Profil (über „Abmelden“) zwischen ihnen. Gemerkt wird pro Konto die
 * Sitzung – so wie Supabase es für das aktive Konto ohnehin tut, nur auf diesem Gerät.
 */
export type SavedAccount = {
  id: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  /** zuletzt aktiv (ms) – nach dem Abmelden geht es mit dem zuletzt benutzten weiter */
  usedAt: number;
};

const KEY = 'nexora.accounts.v1';
let accounts: SavedAccount[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function isAccount(a: unknown): a is SavedAccount {
  if (!a || typeof a !== 'object') return false;
  const x = a as Record<string, unknown>;
  return typeof x.id === 'string' && typeof x.accessToken === 'string' && typeof x.refreshToken === 'string';
}

export function parseAccounts(raw: string | null): SavedAccount[] {
  try {
    const list: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(list)
      ? list.filter(isAccount).map((a) => ({ ...a, email: String(a.email ?? ''), name: String(a.name ?? ''), usedAt: Number(a.usedAt) || 0 }))
      : [];
  } catch {
    return [];
  }
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      accounts = parseAccounts(raw);
      notify();
    })
    .catch(() => {});
  return loading;
}
void load();

function persist(next: SavedAccount[]) {
  accounts = next;
  notify();
  void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

/** Bei jeder Anmeldung und Erneuerung: Sitzung des aktiven Kontos merken */
export async function rememberSession(session: Session | null) {
  if (!session?.user || !session.refresh_token) return;
  await load();
  const u = session.user;
  const entry: SavedAccount = {
    id: u.id,
    email: u.email ?? '',
    name: String(u.user_metadata?.full_name ?? '').trim(),
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    usedAt: Date.now(),
  };
  persist([entry, ...accounts.filter((a) => a.id !== u.id)]);
}

export async function forgetAccount(id: string) {
  await load();
  persist(accounts.filter((a) => a.id !== id));
}

export type SwitchResult = 'ok' | 'expired' | 'offline';

const failure = (error: AuthError): SwitchResult => (isAuthRetryableFetchError(error) ? 'offline' : 'expired');

/** Zu einem gemerkten Konto wechseln – das bisherige bleibt angemeldet und gemerkt. */
export async function switchAccount(id: string): Promise<SwitchResult> {
  await load();
  const target = accounts.find((a) => a.id === id);
  if (!target) return 'expired';
  // erst nebenher erneuern: klappt das nicht (abgemeldet, abgelaufen), bleibt das aktive Konto unberührt
  const { data, error } = await sideAuth().refreshSession({ refresh_token: target.refreshToken });
  if (error || !data.session) {
    const result = error ? failure(error) : 'expired';
    if (result === 'expired') await forgetAccount(id);
    return result;
  }
  const { error: setError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  return setError ? failure(setError) : 'ok';
}

/** Nach dem Abmelden: mit dem zuletzt benutzten anderen Konto weitermachen (false = keins mehr da) */
export async function switchToNextAccount(exceptId?: string): Promise<boolean> {
  await load();
  const others = accounts.filter((a) => a.id !== exceptId).sort((a, b) => b.usedAt - a.usedAt);
  for (const a of others) {
    const result = await switchAccount(a.id);
    if (result === 'ok') return true;
    if (result === 'offline') return false;
  }
  return false;
}

export type AddResult = { ok: true } | { ok: false; error?: AuthError; same?: boolean };

/** Weiteres Konto anmelden, ohne das aktive abzumelden – danach ist das neue Konto aktiv. */
export async function addAccount(email: string, password: string, currentId?: string): Promise<AddResult> {
  const { data, error } = await sideAuth().signInWithPassword({ email, password });
  if (error || !data.session) return { ok: false, error: error ?? undefined };
  if (data.session.user.id === currentId) return { ok: false, same: true };
  const { error: setError } = await supabase.auth.setSession({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
  return setError ? { ok: false, error: setError } : { ok: true };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Alle auf diesem Gerät angemeldeten Konten (das aktive eingeschlossen) */
export function useSavedAccounts(): SavedAccount[] {
  return useSyncExternalStore(subscribe, () => accounts, () => accounts);
}
