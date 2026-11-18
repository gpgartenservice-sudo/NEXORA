import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { BUSINESS_SEATS } from '@/features/plan/plan-logic';
import { supabase } from '@/lib/supabase';

/**
 * Business-Team (Skripte 20261120090000_feinschliff.sql, 20261122090000_business_3.sql): bis zu 3 Personen teilen sich
 * ein Business. Die Datenbank sorgt dafür, dass Teammitglieder die Daten des Inhabers sehen
 * (nexora_workspace()); die App braucht die ID nur dort, wo sie selbst user_id schreibt
 * (Firma-Einstellungen, Belege im Speicher).
 */

export type TeamMember = { id: string; name: string; email: string | null; owner: boolean; joined_at: string | null };
export type TeamInvite = { code: string; email: string | null; created_at: string };
export type TeamInfo = {
  role: 'solo' | 'owner' | 'member';
  owner_id: string;
  owner_name: string | null;
  seats: number;
  members: TeamMember[];
  invites: TeamInvite[];
};

type State = {
  /** Wessen Daten: eigene ID oder die des Business-Inhabers */
  workspaceId: string;
  team: TeamInfo | null;
  /** Skript fehlt noch in der Datenbank */
  missing: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST202', 'PGRST205', '42883', '42P01'];

function parseTeam(raw: unknown): TeamInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.owner_id !== 'string') return null;
  const role = r.role === 'owner' || r.role === 'member' ? r.role : 'solo';
  return {
    role,
    owner_id: r.owner_id,
    owner_name: typeof r.owner_name === 'string' ? r.owner_name : null,
    seats: typeof r.seats === 'number' ? r.seats : BUSINESS_SEATS,
    members: Array.isArray(r.members) ? (r.members as TeamMember[]) : [],
    invites: Array.isArray(r.invites) ? (r.invites as TeamInvite[]) : [],
  };
}

type Loaded = { team: TeamInfo | null; missing: boolean; failed: boolean };

async function fetchTeam(): Promise<Loaded> {
  const { data, error } = await supabase.rpc('my_team');
  if (!error) return { team: parseTeam(data), missing: false, failed: false };
  if (MISSING.includes(String(error.code)) || /my_team/.test(error.message ?? '')) return { team: null, missing: true, failed: false };
  console.warn('[Team]', error);
  return { team: null, missing: false, failed: true };
}

export function TeamProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const apply = useCallback((r: Loaded) => {
    setLoaded(true);
    setMissing(r.missing);
    // Bei einem Netzfehler das bisherige Team behalten
    if (!r.failed) setTeam(r.team);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void fetchTeam().then((r) => {
      if (active) apply(r);
    });
    return () => {
      active = false;
    };
  }, [userId, apply]);

  const refresh = useCallback(async () => {
    if (userId) apply(await fetchTeam());
  }, [userId, apply]);

  const workspaceId = team?.owner_id ?? userId;
  const value = useMemo<State>(() => ({ workspaceId, team, missing, refresh }), [workspaceId, team, missing, refresh]);
  // Bis klar ist, wessen Daten geladen werden, nichts anzeigen (sonst lädt alles zweimal)
  if (!loaded && userId) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTeam(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTeam muss innerhalb von TeamProvider verwendet werden');
  return ctx;
}

/** ID, unter der Business-Daten gespeichert werden (im Team: die des Inhabers) */
export function useWorkspaceId(): string {
  return useTeam().workspaceId;
}

const TEAM_ERRORS: Record<string, string> = {
  business_required: 'Ein Team gibt es mit Lunaxora Business.',
  team_full: `Euer Team ist voll – Business gilt für bis zu ${BUSINESS_SEATS} Personen (inklusive offener Einladungen).`,
  team_member_cannot_invite: 'Nur der Inhaber des Business kann Leute einladen.',
  invite_invalid: 'Diesen Code kennen wir nicht oder er wurde schon benutzt.',
  invite_own: 'Das ist dein eigener Einladungscode.',
  owner_has_team: 'Du hast selbst schon ein Team. Entferne zuerst deine Mitglieder, um einem anderen Team beizutreten.',
};

export function teamErrorText(message: string): string {
  const key = Object.keys(TEAM_ERRORS).find((k) => message.includes(k));
  return key ? TEAM_ERRORS[key] : `Das hat nicht geklappt. Bitte versuch es noch einmal.\n\nTechnische Details: ${message}`;
}

export async function teamInvite(email: string): Promise<{ code?: string; error?: string }> {
  const { data, error } = await supabase.rpc('team_invite', { p_email: email });
  return error ? { error: teamErrorText(error.message) } : { code: String(data) };
}

export async function teamJoin(code: string): Promise<{ ownerName?: string; error?: string }> {
  const { data, error } = await supabase.rpc('team_join', { p_code: code.trim().toUpperCase() });
  if (error) return { error: teamErrorText(error.message) };
  return { ownerName: (data as { owner_name?: string } | null)?.owner_name ?? undefined };
}

export async function teamLeave() {
  const { error } = await supabase.rpc('team_leave');
  return error ? { error: teamErrorText(error.message) } : {};
}

export async function teamRemove(memberId: string) {
  const { error } = await supabase.rpc('team_remove', { p_member: memberId });
  return error ? { error: teamErrorText(error.message) } : {};
}

export async function teamRevoke(code: string) {
  const { error } = await supabase.rpc('team_revoke', { p_code: code });
  return error ? { error: teamErrorText(error.message) } : {};
}
