import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import type { PlanKind } from '@/features/plan/plan-logic';
import { supabase } from '@/lib/supabase';
import type { ProfileUpdate } from '@/providers/profile-provider';

import {
  can as canWith,
  DEFAULT_ACCESS,
  isEmployer,
  parseRole,
  parseAccess,
  roleErrorText,
  type Access,
  type Area,
  type EditableRole,
  type MemberRole,
} from './roles';

/**
 * Business-Team (Skript 20261120090000_feinschliff.sql): bis zu 5 Personen teilen sich
 * ein Business. Die Datenbank sorgt dafür, dass Teammitglieder die Daten des Inhabers sehen
 * (nexora_workspace()); die App braucht die ID nur dort, wo sie selbst user_id schreibt
 * (Firma-Einstellungen, Belege im Speicher).
 */

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  owner: boolean;
  joined_at: string | null;
  /** seit 20261128090000_teams.sql; ältere Datenbank: Inhaber bzw. Mitgründer */
  role: MemberRole;
  title: string | null;
  vacation_days: number | null;
};
export type TeamInvite = { code: string; email: string | null; created_at: string; role: MemberRole };
export type TeamInfo = {
  role: 'solo' | 'owner' | 'member';
  /** Rolle in der offenen Firma */
  my_role: MemberRole;
  owner_id: string;
  owner_name: string | null;
  plan: PlanKind | null;
  seats: number;
  seats_used: number;
  /** null = alles erlaubt */
  access: Access | null;
  roles: Record<EditableRole, Access>;
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

const PLANS: PlanKind[] = ['free', 'trial', 'pro', 'business', 'teams'];

export function parseTeam(raw: unknown): TeamInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.owner_id !== 'string') return null;
  const role = r.role === 'owner' || r.role === 'member' ? r.role : 'solo';
  // ältere Datenbank ohne Rollen: Mitglieder sahen alles (= Mitgründer)
  const myRole: MemberRole = parseRole(r.my_role) ?? (role === 'member' ? 'mitgruender' : 'inhaber');
  const rolesRaw = (r.roles ?? {}) as Record<string, unknown>;
  const members = (Array.isArray(r.members) ? r.members : []).map((m: Record<string, unknown>) => ({
    id: String(m.id),
    name: typeof m.name === 'string' && m.name ? m.name : '?',
    email: typeof m.email === 'string' ? m.email : null,
    owner: !!m.owner,
    joined_at: typeof m.joined_at === 'string' ? m.joined_at : null,
    role: parseRole(m.role) ?? (m.owner ? 'inhaber' : 'mitgruender'),
    title: typeof m.title === 'string' && m.title ? m.title : null,
    vacation_days: typeof m.vacation_days === 'number' ? m.vacation_days : m.vacation_days != null ? Number(m.vacation_days) : null,
  })) as TeamMember[];
  const invites = (Array.isArray(r.invites) ? r.invites : []).map((i: Record<string, unknown>) => ({
    code: String(i.code),
    email: typeof i.email === 'string' ? i.email : null,
    created_at: String(i.created_at ?? ''),
    role: parseRole(i.role) ?? 'mitarbeiter',
  })) as TeamInvite[];
  return {
    role,
    my_role: myRole,
    owner_id: r.owner_id,
    owner_name: typeof r.owner_name === 'string' ? r.owner_name : null,
    plan: PLANS.includes(r.plan as PlanKind) ? (r.plan as PlanKind) : null,
    seats: typeof r.seats === 'number' ? r.seats : 5,
    seats_used: typeof r.seats_used === 'number' ? r.seats_used : (members.length || 1) + invites.length,
    access: isEmployer(myRole) || !r.access ? null : parseAccess(r.access, DEFAULT_ACCESS[myRole as EditableRole] ?? DEFAULT_ACCESS.mitarbeiter),
    roles: {
      mitarbeiter: parseAccess(rolesRaw.mitarbeiter, DEFAULT_ACCESS.mitarbeiter),
    },
    members,
    invites,
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
    // Bei einem Netzfehler das bisherige Team behalten. Unverändert → altes Objekt behalten,
    // sonst würde beim regelmäßigen Nachsehen jedes Mal die ganze App neu gezeichnet.
    if (!r.failed) setTeam((prev) => (JSON.stringify(prev) === JSON.stringify(r.team) ? prev : r.team));
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

  // Tritt jemand bei oder wird entfernt, passiert das auf einem anderen Gerät – darum
  // beim Zurückkommen in die App und jede Minute nachsehen (die Team-Seite selbst öfter).
  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(() => void refresh(), 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void refresh());
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    const onFocus = () => void refresh();
    if (web) window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      sub.remove();
      if (web) window.removeEventListener('focus', onFocus);
    };
  }, [userId, refresh]);

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

export type AccessState = {
  /** Rolle in der offenen Firma (allein: inhaber) */
  role: MemberRole;
  /** Inhaber oder Mitgründer */
  employer: boolean;
  /** Arbeitsplan eintragen, Urlaub genehmigen */
  hr: boolean;
  /** Ist man mit anderen in einem Team? */
  inTeam: boolean;
  can: (area: Area, level?: 'read' | 'write') => boolean;
};

/** Rechte des angemeldeten Nutzers in der offenen Firma */
export function useAccess(): AccessState {
  const { team } = useTeam();
  return useMemo(() => {
    const access = team?.access ?? null;
    const role = team?.my_role ?? 'inhaber';
    return {
      role,
      employer: isEmployer(role),
      hr: canWith(access, 'personal', 'write'),
      inTeam: !!team && (team.role !== 'solo' || team.members.length > 1),
      can: (area: Area, level: 'read' | 'write' = 'read') => canWith(access, area, level),
    };
  }, [team]);
}

const TEAM_ERRORS: Record<string, string> = {
  business_required: 'Ein Team gibt es mit Lunaxora Business und Teams.',
  team_full: 'Euer Team ist voll (inklusive offener Einladungen). Business gilt für bis zu 5 Personen, Teams für bis zu 30.',
  team_member_cannot_invite: 'Nur Inhaber und Mitgründer können Leute einladen.',
  not_team_admin: 'Das können nur Inhaber und Mitgründer.',
  owner_only: 'Mitgründer ernennen oder ändern kann nur der Inhaber.',
  invalid_role: 'Diese Rolle gibt es nicht.',
  invalid_vacation_days: 'Bitte zwischen 0 und 60 Urlaubstagen eintragen.',
  member_not_found: 'Diese Person ist nicht mehr im Team.',
  invite_invalid: 'Diesen Code kennen wir nicht oder er wurde schon benutzt.',
  invite_own: 'Das ist dein eigener Einladungscode.',
  owner_has_team: 'Du hast selbst schon ein Team. Entferne zuerst deine Mitglieder, um einem anderen Team beizutreten.',};

export function teamErrorText(message: string): string {
  const role = roleErrorText(message);
  if (role) return role;
  const key = Object.keys(TEAM_ERRORS).find((k) => message.includes(k));
  return key ? TEAM_ERRORS[key] : `Das hat nicht geklappt. Bitte versuch es noch einmal.\n\nTechnische Details: ${message}`;
}

export async function teamInvite(email: string, role: Exclude<MemberRole, 'inhaber'> = 'mitarbeiter'): Promise<{ code?: string; error?: string }> {
  const { data, error } = await supabase.rpc('team_invite', { p_email: email, p_role: role });
  return error ? { error: teamErrorText(error.message) } : { code: String(data) };
}

/** Rolle, Bezeichnung (leer = löschen) oder Urlaubstage einer Person ändern */
export async function teamSetMember(
  memberId: string,
  change: { role?: Exclude<MemberRole, 'inhaber'>; title?: string; vacationDays?: number },
): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('team_set_member', {
    p_member: memberId,
    p_role: change.role ?? null,
    p_title: change.title ?? null,
    p_vacation_days: change.vacationDays ?? null,
  });
  return error ? { error: teamErrorText(error.message) } : {};
}

/** Rechte der Mitarbeiter speichern */
export async function teamSetAccess(role: EditableRole, access: Partial<Access>): Promise<{ access?: Access; error?: string }> {
  const { data, error } = await supabase.rpc('team_set_access', { p_role: role, p_access: access });
  return error ? { error: teamErrorText(error.message) } : { access: parseAccess(data, DEFAULT_ACCESS[role]) };
}

export async function teamJoin(code: string): Promise<{ ownerName?: string; companyId?: string; error?: string }> {
  const { data, error } = await supabase.rpc('team_join', { p_code: code.trim().toUpperCase() });
  if (error) return { error: teamErrorText(error.message) };
  const r = data as { owner_name?: string; company_id?: string } | null;
  // company_id: Firma, der man beigetreten ist (seit 20261127090000_mehrere_firmen.sql)
  return { ownerName: r?.owner_name ?? undefined, companyId: r?.company_id ?? undefined };
}

/** Antworten des Inhabers aus dessen Anmeldung (Skript 20261126090000_team_antworten.sql) */
export type TeamAnswers = Pick<ProfileUpdate, 'business_name' | 'stage' | 'industry' | 'industry_other' | 'legal_form' | 'goals'>;

/** Nur für Teammitglieder – sonst (oder ohne Skript) null */
export async function teamAnswers(): Promise<TeamAnswers | null> {
  const { data, error } = await supabase.rpc('team_answers');
  if (error) {
    if (!MISSING.includes(String(error.code))) console.warn('[Team]', error);
    return null;
  }
  return data && typeof data === 'object' ? (data as TeamAnswers) : null;
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
