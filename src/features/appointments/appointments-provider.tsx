import { getRandomBytes } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { isProRequired, proRequiredText } from '@/features/plan/plan-logic';
import { supabase } from '@/lib/supabase';

import { feedToken, type Appointment } from './appointment-logic';

export type AppointmentInput = Pick<
  Appointment,
  'title' | 'starts_at' | 'ends_at' | 'all_day' | 'location' | 'customer_id' | 'notes'
> & {
  done?: boolean;
};

type Result<T = undefined> = { data?: T; error?: string };

type State = {
  appointments: Appointment[];
  loading: boolean;
  /** 'setup' = Datenbank-Skript für Termine fehlt */
  error: 'setup' | 'failed' | null;
  createAppointment: (input: AppointmentInput) => Promise<Result<Appointment>>;
  updateAppointment: (id: string, input: Partial<AppointmentInput>) => Promise<Result<Appointment>>;
  deleteAppointment: (id: string) => Promise<Result>;
  /** geheimer Abo-Schlüssel (null = kein Kalender-Abo) */
  feed: string | null;
  createFeed: () => Promise<Result<string>>;
  /** neuer Link – der alte wird ungültig */
  renewFeed: () => Promise<Result<string>>;
  deleteFeed: () => Promise<Result>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];

function message(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING.includes(error.code)) {
    return 'Termine können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (siehe supabase/README.md).';
  }
  if (error.code === '23514') return 'Eine Angabe ist ungültig – z. B. endet der Termin vor dem Beginn.';
  if (isProRequired(error)) return proRequiredText('calendar_feed');
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

const byStart = (a: Appointment, b: Appointment) => a.starts_at.localeCompare(b.starts_at);
const random = (n: number) => getRandomBytes(n);

type Loaded = { appointments: Appointment[]; feed: string | null } | { missing: true } | { failed: true };

async function fetchAll(): Promise<Loaded> {
  const [a, f] = await Promise.all([
    supabase.from('appointments').select('*').order('starts_at'),
    supabase.from('calendar_feeds').select('token').maybeSingle(),
  ]);
  const err = a.error ?? f.error;
  if (err) {
    if (MISSING.includes(err.code)) return { missing: true };
    console.warn('[Termine]', err);
    return { failed: true };
  }
  return { appointments: (a.data ?? []) as Appointment[], feed: (f.data as { token?: string } | null)?.token ?? null };
}

/** Eigene Termine und Kalender-Abo des angemeldeten Nutzers. */
export function AppointmentsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [feed, setFeed] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<State['error']>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchAll().then((r) => {
      if (!active) return;
      setLoading(false);
      if ('missing' in r) return setError('setup');
      if ('failed' in r) return setError('failed');
      setError(null);
      setAppointments(r.appointments.sort(byStart));
      setFeed(r.feed);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const createAppointment = useCallback(async (input: AppointmentInput): Promise<Result<Appointment>> => {
    const { data, error: err } = await supabase.from('appointments').insert(input).select('*').single();
    if (err) return { error: message(err, 'Der Termin konnte nicht gespeichert werden.') };
    const row = data as Appointment;
    setAppointments((list) => [...list, row].sort(byStart));
    return { data: row };
  }, []);

  const updateAppointment = useCallback(
    async (id: string, input: Partial<AppointmentInput>): Promise<Result<Appointment>> => {
      const { data, error: err } = await supabase.from('appointments').update(input).eq('id', id).select('*').single();
      if (err) return { error: message(err, 'Die Änderung konnte nicht gespeichert werden.') };
      const row = data as Appointment;
      setAppointments((list) => [row, ...list.filter((a) => a.id !== id)].sort(byStart));
      return { data: row };
    },
    [],
  );

  const deleteAppointment = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('appointments').delete().eq('id', id);
    if (err) return { error: message(err, 'Der Termin konnte nicht gelöscht werden.') };
    setAppointments((list) => list.filter((a) => a.id !== id));
    return {};
  }, []);

  const createFeed = useCallback(async (): Promise<Result<string>> => {
    const token = feedToken(random);
    const { error: err } = await supabase.from('calendar_feeds').insert({ token });
    if (err) return { error: message(err, 'Der Abo-Link konnte nicht erstellt werden.') };
    setFeed(token);
    return { data: token };
  }, []);

  const renewFeed = useCallback(async (): Promise<Result<string>> => {
    const token = feedToken(random);
    const { data, error: err } = await supabase
      .from('calendar_feeds')
      .update({ token })
      .not('token', 'is', null)
      .select('token');
    if (err) return { error: message(err, 'Der neue Link konnte nicht erstellt werden.') };
    if (!data?.length) return createFeed();
    setFeed(token);
    return { data: token };
  }, [createFeed]);

  const deleteFeed = useCallback(async (): Promise<Result> => {
    const { error: err } = await supabase.from('calendar_feeds').delete().not('token', 'is', null);
    if (err) return { error: message(err, 'Das Abo konnte nicht beendet werden.') };
    setFeed(null);
    return {};
  }, []);

  const value = useMemo<State>(
    () => ({
      appointments,
      loading,
      error,
      createAppointment,
      updateAppointment,
      deleteAppointment,
      feed,
      createFeed,
      renewFeed,
      deleteFeed,
    }),
    [
      appointments,
      loading,
      error,
      createAppointment,
      updateAppointment,
      deleteAppointment,
      feed,
      createFeed,
      renewFeed,
      deleteFeed,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppointments(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAppointments muss innerhalb von AppointmentsProvider verwendet werden');
  return ctx;
}
