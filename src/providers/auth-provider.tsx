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
      .then(({ data }) => {
        if (active) setSession(data.session);
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

/** Vorname aus den Kontodaten (bei der Registrierung angegeben). */
export function firstName(user: User | null): string {
  const full = String(user?.user_metadata?.full_name ?? '').trim();
  return full.split(/\s+/)[0] ?? '';
}
