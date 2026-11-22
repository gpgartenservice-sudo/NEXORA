import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { notifyNow } from '@/features/notifications/notify-platform';
import { loadNotifyPrefs } from '@/features/notifications/notify-prefs';
import { playSound } from '@/features/sound/ui-sound';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

import { roleErrorText } from './roles';
import {
  addDays,
  dayIso,
  directPartner,
  isChatKey,
  isoWeek,
  KIND_LABEL,
  rangeLabel,
  weekStart,
  type AbsenceKind,
  type ChatKey,
  type ChatMessage,
  type ChatSummary,
} from './staff-logic';
import { useAccess, useTeam } from './team-provider';

/**
 * Was im Team gerade los ist – für Menü-Abzeichen und Mitteilungen:
 * ungelesene Chats (live über Supabase Realtime, sonst alle 30 Sekunden), offene
 * Urlaubsanträge (wer Personal verwaltet) und Antworten auf eigene Anträge.
 * Skript: 20261128090000_teams.sql (team_chats, team_chat_read, absences).
 */

type Hub = {
  /** Team mit mehr als einer Person (sonst gibt es nichts zu laden) */
  active: boolean;
  me: string;
  chats: ChatSummary[];
  unread: number;
  /** Offene Urlaubsanträge (nur wer Personal verwaltet) */
  openRequests: number;
  /** Ändert sich, sobald jemand einen Antrag stellt oder entschieden wird → Listen neu laden */
  absenceVersion: number;
  /** Ändert sich, sobald ein Wochenplan fertiggestellt, aktualisiert oder zurückgezogen wird */
  planVersion: number;
  refresh: () => Promise<void>;
  refreshAbsences: () => Promise<void>;
  refreshPlans: () => Promise<void>;
  /** Chat, der gerade offen ist: dafür keine Mitteilung */
  setOpenChat: (key: ChatKey | null) => void;
  markRead: (key: ChatKey) => Promise<void>;
  /** Neue Nachricht (live): Rückgabe = abmelden */
  onMessage: (fn: (m: ChatMessage) => void) => () => void;
  nameOf: (id: string) => string;
  chatName: (key: ChatKey) => string;
};

const Ctx = createContext<Hub | null>(null);

const CHATS_EVERY = 30_000;
const ABSENCES_EVERY = 60_000;

export const CHAT_LABEL = { alle: 'Alle im Team', leitung: 'Leitung' } as const;

function parseSummaries(raw: unknown): ChatSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r) => r && isChatKey(r.chat))
    .map((r) => ({
      chat: r.chat as ChatKey,
      body: String(r.body ?? ''),
      sender_id: String(r.sender_id ?? ''),
      at: String(r.at ?? ''),
      unread: Number(r.unread) || 0,
    }));
}

type AbsenceRow = {
  id: string;
  member_id: string;
  kind: AbsenceKind;
  starts_on: string;
  ends_on: string;
  status: string;
  decided_by: string | null;
};

export function TeamHubProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const me = user?.id ?? '';
  const { team } = useTeam();
  const access = useAccess();
  const ws = team?.owner_id ?? '';
  const active = !!me && !!ws && access.inTeam;
  const hr = access.hr;

  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [openRequests, setOpenRequests] = useState(0);
  const [absenceVersion, setAbsenceVersion] = useState(0);
  const [planVersion, setPlanVersion] = useState(0);
  const openChat = useRef<ChatKey | null>(null);
  const listeners = useRef(new Set<(m: ChatMessage) => void>());

  const members = team?.members;
  const names = useMemo(() => new Map((members ?? []).map((m) => [m.id, m.name])), [members]);
  const nameOf = useCallback((id: string) => (id === me ? 'Du' : (names.get(id) ?? 'Jemand')), [names, me]);
  const chatName = useCallback(
    (key: ChatKey) => {
      if (key === 'alle' || key === 'leitung') return CHAT_LABEL[key];
      const other = directPartner(key);
      return other ? (names.get(other) ?? 'Ehemaliges Mitglied') : '';
    },
    [names],
  );
  const latest = useRef({ nameOf, chatName });
  useEffect(() => {
    latest.current = { nameOf, chatName };
  });

  // --- Chats ---------------------------------------------------------------
  // zuletzt gemeldete Nachricht je Chat (erstes Laden: nichts nachträglich melden)
  const notified = useRef<Map<string, string> | null>(null);

  const refresh = useCallback(async () => {
    if (!active) return;
    const { data, error } = await supabase.rpc('team_chats');
    if (error) {
      if (!/team_chats|PGRST202/.test(`${error.message} ${error.code}`)) console.warn('[Team-Chat]', error);
      return;
    }
    const list = parseSummaries(data);
    setChats((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));

    const first = !notified.current;
    const seen = notified.current ?? new Map<string, string>();
    notified.current = seen;
    const fresh = list.filter((c) => c.unread > 0 && c.sender_id !== me && (seen.get(c.chat) ?? '') < c.at);
    for (const c of list) if ((seen.get(c.chat) ?? '') < c.at) seen.set(c.chat, c.at);
    if (first || !fresh.length) return;
    const prefs = await loadNotifyPrefs();
    for (const c of fresh) {
      if (c.chat === openChat.current) continue;
      const who = latest.current.nameOf(c.sender_id);
      const where = c.chat.startsWith('direkt:') ? '' : ` · ${latest.current.chatName(c.chat)}`;
      if (prefs.team) void notifyNow(`${who}${where}`, c.body);
    }
  }, [active, me]);

  const markRead = useCallback(
    async (key: ChatKey) => {
      setChats((prev) => prev.map((c) => (c.chat === key && c.unread ? { ...c, unread: 0 } : c)));
      const { error } = await supabase.rpc('team_chat_read', { p_chat: key });
      if (error) console.warn('[Team-Chat]', error);
    },
    [],
  );

  const setOpenChat = useCallback((key: ChatKey | null) => {
    openChat.current = key;
  }, []);

  const onMessage = useCallback((fn: (m: ChatMessage) => void) => {
    listeners.current.add(fn);
    return () => {
      listeners.current.delete(fn);
    };
  }, []);

  // Live: neue Nachrichten der Firma (die Datenbank schickt nur, was man sehen darf)
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const channel = supabase
      .channel(`team-chat-${ws}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `company_id=eq.${ws}` },
        (payload) => {
          const m = payload.new as ChatMessage;
          for (const fn of listeners.current) fn(m);
          if (m.sender_id !== me && openChat.current) playSound('tick');
          clearTimeout(timer);
          timer = setTimeout(() => void refresh(), 300);
        },
      )
      .subscribe();
    return () => {
      clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [active, ws, me, refresh]);

  // --- Urlaub & Krankmeldungen --------------------------------------------
  const seenAbsences = useRef<Map<string, string> | null>(null);

  const refreshAbsences = useCallback(async () => {
    if (!active) return;
    const since = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
    // wer Personal verwaltet: neue Anträge und Krankmeldungen; alle: Antworten auf eigene Anträge
    const query = supabase
      .from('absences')
      .select('id, member_id, kind, starts_on, ends_on, status, decided_by')
      .eq('company_id', ws)
      .gte('created_at', since);
    const { data, error } = await (hr ? query : query.eq('member_id', me));
    if (error) {
      if (!/absences|PGRST205/.test(`${error.message} ${error.code}`)) console.warn('[Urlaub]', error);
      return;
    }
    const rows = (data ?? []) as AbsenceRow[];
    setOpenRequests(hr ? rows.filter((r) => r.status === 'offen' && r.member_id !== me).length : 0);

    const first = !seenAbsences.current;
    const seen = seenAbsences.current ?? new Map<string, string>();
    seenAbsences.current = seen;
    const notes: { title: string; body: string }[] = [];
    let changed = false;
    for (const r of rows) {
      const before = seen.get(r.id);
      if (before === r.status) continue;
      seen.set(r.id, r.status);
      changed = true;
      if (first) continue;
      const when = rangeLabel(r.starts_on, r.ends_on);
      const mine = r.member_id === me;
      if (mine && r.decided_by && r.decided_by !== me && (r.status === 'genehmigt' || r.status === 'abgelehnt'))
        notes.push({
          title: r.status === 'genehmigt' ? `${KIND_LABEL[r.kind]} genehmigt ✓` : `${KIND_LABEL[r.kind]} abgelehnt`,
          body: `${when} – Details unter Team → Urlaub.`,
        });
      else if (!mine && hr && !before && r.status === 'offen')
        notes.push({ title: `Neuer Antrag: ${latest.current.nameOf(r.member_id)}`, body: `${KIND_LABEL[r.kind]} ${when}` });
      else if (!mine && hr && !before && r.status === 'gemeldet')
        notes.push({ title: `Krankmeldung: ${latest.current.nameOf(r.member_id)}`, body: when });
    }
    if (changed && !first) setAbsenceVersion((v) => v + 1);
    if (!notes.length) return;
    const prefs = await loadNotifyPrefs();
    if (prefs.team) for (const n of notes) void notifyNow(n.title, n.body);
  }, [active, ws, hr, me]);

  // --- Fertige Wochenpläne (Skript 20261129090000_einsaetze.sql) -----------------
  const seenPlans = useRef<Map<string, number> | null>(null);

  const refreshPlans = useCallback(async () => {
    if (!active) return;
    const from = addDays(weekStart(dayIso(new Date())), -7);
    const { data, error } = await supabase
      .from('work_plans')
      .select('week_start, version, published_by')
      .eq('company_id', ws)
      .gte('week_start', from);
    if (error) {
      if (!/work_plans|PGRST205|42P01/.test(`${error.message} ${error.code}`)) console.warn('[Arbeitsplan]', error);
      return;
    }
    const rows = (data ?? []) as { week_start: string; version: number; published_by: string | null }[];
    const first = !seenPlans.current;
    const seen = seenPlans.current ?? new Map<string, number>();
    seenPlans.current = seen;
    let changed = false;
    const notes: { title: string; body: string }[] = [];
    for (const r of rows) {
      const before = seen.get(r.week_start);
      if (before === r.version) continue;
      seen.set(r.week_start, r.version);
      changed = true;
      if (first || r.published_by === me) continue;
      notes.push({
        title: before ? `Arbeitsplan KW ${isoWeek(r.week_start)} geändert` : `Arbeitsplan KW ${isoWeek(r.week_start)} ist fertig`,
        body: 'Ansehen unter Team → Arbeitsplan.',
      });
    }
    // zurückgezogen
    for (const week of [...seen.keys()])
      if (!rows.some((r) => r.week_start === week)) {
        seen.delete(week);
        changed = true;
      }
    if (changed && !first) setPlanVersion((v) => v + 1);
    if (!notes.length) return;
    const prefs = await loadNotifyPrefs();
    if (prefs.team) for (const n of notes) void notifyNow(n.title, n.body);
  }, [active, ws, me]);

  useEffect(() => {
    if (!active) return;
    // Firma oder Rolle gewechselt: neu anfangen (nichts nachträglich melden)
    notified.current = null;
    seenAbsences.current = null;
    seenPlans.current = null;
    const first = setTimeout(() => {
      void refresh();
      void refreshAbsences();
      void refreshPlans();
    }, 0);
    const chatTimer = setInterval(() => void refresh(), CHATS_EVERY);
    const absenceTimer = setInterval(() => {
      void refreshAbsences();
      void refreshPlans();
    }, ABSENCES_EVERY);
    const onActive = () => {
      void refresh();
      void refreshAbsences();
      void refreshPlans();
    };
    const sub = AppState.addEventListener('change', (s) => s === 'active' && onActive());
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    if (web) window.addEventListener('focus', onActive);
    return () => {
      clearTimeout(first);
      clearInterval(chatTimer);
      clearInterval(absenceTimer);
      sub.remove();
      if (web) window.removeEventListener('focus', onActive);
    };
  }, [active, refresh, refreshAbsences, refreshPlans]);

  const unread = useMemo(() => chats.reduce((s, c) => s + c.unread, 0), [chats]);

  const value = useMemo<Hub>(
    () => ({
      active,
      me,
      chats,
      unread,
      openRequests,
      absenceVersion,
      planVersion,
      refresh,
      refreshAbsences,
      refreshPlans,
      setOpenChat,
      markRead,
      onMessage,
      nameOf,
      chatName,
    }),
    [active, me, chats, unread, openRequests, absenceVersion, planVersion, refresh, refreshAbsences, refreshPlans, setOpenChat, markRead, onMessage, nameOf, chatName],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTeamHub(): Hub {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTeamHub muss innerhalb von TeamHubProvider verwendet werden');
  return ctx;
}

/** Für das Menü: außerhalb des Providers einfach nichts */
export const useTeamHubOptional = () => useContext(Ctx);

/** Fehlertext für Chat, Arbeitsplan und Urlaub */
export function staffErrorText(error: { code?: string; message?: string }, fallback: string): string {
  const msg = error.message ?? '';
  const role = roleErrorText(msg);
  if (role) return role;
  if (/row-level security|violates row-level/i.test(msg))
    return `${fallback} Ein Team mit Chat, Arbeitsplan und Urlaub gibt es mit Lunaxora Business und Teams.`;
  if (/work_plans|work_plan_publish|site|assignment_id|is_lead/.test(msg) && ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(String(error.code)))
    return 'Die Datenbank ist für Einsätze und den fertigen Plan noch nicht eingerichtet (Skript 20261129090000_einsaetze.sql fehlt).';
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(String(error.code)))
    return 'Die Datenbank ist dafür noch nicht eingerichtet (Skript 20261128090000_teams.sql fehlt).';
  return `${fallback}\n\nTechnische Details: ${msg || 'unbekannt'}`;
}
