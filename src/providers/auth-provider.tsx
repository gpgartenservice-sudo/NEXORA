import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  /** true, solange die gespeicherte Sitzung beim Start noch geladen wird */
  initializing: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, user: null, initializing: true });

/** Stellt der ganzen App bereit, ob und wer angemeldet ist. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        let current = data.session;
        // Gespeicherte Anmeldung beim Server prüfen: Gibt es das Konto noch?
        // (z. B. wenn es in Supabase gelöscht wurde) – sonst lokal abmelden.
        if (current) {
          const { error } = await supabase.auth.getUser();
          if (error && accountIsGone(error)) {
            await supabase.auth.signOut({ scope: 'local' });
            current = null;
          }
        }
        if (active) setSession(current);
      })
      .finally(() => {
        if (active) setInitializing(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setInitializing(false);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, initializing }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * true, wenn der Server sagt, dass die gespeicherte Anmeldung nicht mehr
 * gültig ist (Konto gelöscht, Sitzung widerrufen). Netzwerkfehler zählen
 * nicht – offline bleibt man angemeldet.
 */
function accountIsGone(error: { status?: number; code?: string }): boolean {
  return (
    error.status === 401 ||
    error.status === 403 ||
    ['user_not_found', 'session_not_found', 'bad_jwt'].includes(error.code ?? '')
  );
}

/** Vorname aus den Kontodaten (bei der Registrierung angegeben). */
export function firstName(user: User | null): string {
  const full = String(user?.user_metadata?.full_name ?? '').trim();
  return full.split(/\s+/)[0] ?? '';
}
