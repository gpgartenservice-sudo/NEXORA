import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { notifyNow, onNotificationOpen } from '@/features/notifications/notify-platform';
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
  onlineTopic,
  rangeLabel,
  unseenSickNotes,
  weekStart,
  type Absence,
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
  /** Offene Anträge + neue Krankmeldungen (nur wer Personal verwaltet) */
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
  /** Wer aus der Firma gerade die App offen hat (ohne mich) */
  online: ReadonlySet<string>;
};

const Ctx = createContext<Hub | null>(null);

/**
 * Sieht man die App gerade? (Mac: Fenster vorn und nicht ausgeblendet, Handy: App im Vordergrund)
 * Nur dann gilt ein offener Chat als gelesen – sonst kommt eine Mitteilung.
 */
export function appInFront(): boolean {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') return true;
    return document.visibilityState === 'visible' && document.hasFocus();
  }
  return AppState.currentState === 'active';
}

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
  created_at: string;
  doctor?: boolean;
  seen_by?: string | null;
  seen_at?: string | null;
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
    if (!prefs.team) return;
    for (const c of fresh) {
      // Chat offen und man schaut gerade hin: keine Mitteilung
      if (c.chat === openChat.current && appInFront()) continue;
      const who = latest.current.nameOf(c.sender_id);
      const more = c.unread > 1 ? ` · ${c.unread} neue Nachrichten` : '';
      // Gruppe: oben der Chat, darunter „Anna Berg: …“ – direkt: oben die Person
      const direct = c.chat.startsWith('direkt:');
      void notifyNow(direct ? `${who}${more}` : `${latest.current.chatName(c.chat)}${more}`, direct ? c.body : `${who}: ${c.body}`, {
        kind: 'team',
        chat: c.chat,
      });
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
          if (m.sender_id !== me && openChat.current && appInFront()) playSound('tick');
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

  // Live: wer gerade online ist (privater Kanal der Firma, Skript 20261130090000_krank_chat.sql).
  // Fehlt das Skript, klappt der Kanal nicht – dann zeigt die App einfach niemanden als online.
  const [online, setOnline] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    if (!active) return;
    const channel = supabase.channel(onlineTopic(ws), { config: { private: true, presence: { key: me } } });
    let joined = false;
    const here = () => void channel.track({ since: new Date().toISOString() });
    channel
      .on('presence', { event: 'sync' }, () => {
        const ids = Object.keys(channel.presenceState())
          .filter((id) => id !== me)
          .sort();
        setOnline((prev) => (prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids)));
      })
      .subscribe((status) => {
        joined = status === 'SUBSCRIBED';
        if (joined && AppState.currentState !== 'background') here();
      });
    // App im Hintergrund: nicht mehr online
    const sub = AppState.addEventListener('change', (s) => {
      if (!joined) return;
      if (s === 'active') here();
      else if (s === 'background') void channel.untrack();
    });
    return () => {
      sub.remove();
      setOnline(new Set());
      void supabase.removeChannel(channel);
    };
  }, [active, ws, me]);

  // --- Urlaub & Krankmeldungen --------------------------------------------
  const seenAbsences = useRef<Map<string, string> | null>(null);

  const refreshAbsences = useCallback(async () => {
    if (!active) return;
    const since = new Date(Date.now() - 60 * 24 * 3600_000).toISOString();
    // wer Personal verwaltet: neue Anträge und Krankmeldungen; alle: Antworten auf eigene Anträge
    const query = supabase
      .from('absences')
      // alle Spalten: ohne das Skript für Krankmeldungen fehlen seen_at/doctor einfach
      .select('*')
      .eq('company_id', ws)
      .gte('created_at', since);
    const { data, error } = await (hr ? query : query.eq('member_id', me));
    if (error) {
      if (!/absences|PGRST205/.test(`${error.message} ${error.code}`)) console.warn('[Urlaub]', error);
      return;
    }
    const rows = (data ?? []) as AbsenceRow[];
    // Leitung: offene Anträge + Krankmeldungen, die noch niemand gesehen hat
    const today = dayIso(new Date());
    setOpenRequests(
      hr
        ? rows.filter((r) => r.status === 'offen' && r.member_id !== me).length +
            unseenSickNotes(rows as unknown as Absence[], me, today).length
        : 0,
    );

    const first = !seenAbsences.current;
    const seen = seenAbsences.current ?? new Map<string, string>();
    seenAbsences.current = seen;
    const notes: { title: string; body: string }[] = [];
    let changed = false;
    for (const r of rows) {
      // Stand: Status, gesehen und Ende (Krankmeldung verlängert)
      const state = `${r.status}|${r.seen_at ? 1 : 0}|${r.ends_on}`;
      const before = seen.get(r.id);
      if (before === state) continue;
      seen.set(r.id, state);
      changed = true;
      if (first) continue;
      const [beforeStatus, beforeSeen, beforeEnd] = before?.split('|') ?? [];
      const when = rangeLabel(r.starts_on, r.ends_on);
      const mine = r.member_id === me;
      const name = latest.current.nameOf(r.member_id);
      if (mine && r.decided_by && r.decided_by !== me && beforeStatus !== r.status && (r.status === 'genehmigt' || r.status === 'abgelehnt'))
        notes.push({
          title: r.status === 'genehmigt' ? `${KIND_LABEL[r.kind]} genehmigt ✓` : `${KIND_LABEL[r.kind]} abgelehnt`,
          body: `${when} – Details unter Team → Krank & Urlaub.`,
        });
      else if (mine && r.kind === 'krank' && r.seen_at && r.seen_by !== me && beforeSeen === '0')
        notes.push({ title: 'Krankmeldung gesehen ✓', body: 'Die Leitung weiß Bescheid. Gute Besserung!' });
      else if (!mine && hr && !before && r.status === 'offen')
        notes.push({ title: `Neuer Antrag: ${name}`, body: `${KIND_LABEL[r.kind]} ${when}` });
      else if (!mine && hr && !before && r.status === 'gemeldet' && !r.seen_at)
        notes.push({ title: `Krankmeldung: ${name}`, body: `${when}${r.doctor ? ' · war beim Arzt' : ''}` });
      else if (!mine && hr && before && r.kind === 'krank' && beforeEnd !== r.ends_on && !r.seen_at)
        notes.push({ title: `Krankmeldung geändert: ${name}`, body: `jetzt ${when}` });
    }
    if (changed && !first) setAbsenceVersion((v) => v + 1);
    if (!notes.length) return;
    const prefs = await loadNotifyPrefs();
    if (prefs.team) for (const n of notes) void notifyNow(n.title, n.body, { kind: 'team', tab: 'urlaub' });
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
    if (prefs.team) for (const n of notes) void notifyNow(n.title, n.body, { kind: 'team', tab: 'plan' });
  }, [active, ws, me]);

  // Mitteilung angetippt/angeklickt: den Chat bzw. den Bereich im Team öffnen
  useEffect(
    () =>
      onNotificationOpen((data) => {
        if (data.kind !== 'team') return;
        if (isChatKey(data.chat)) router.push({ pathname: '/team/chat/[key]', params: { key: data.chat } });
        else if (data.tab === 'urlaub' || data.tab === 'plan') router.push({ pathname: '/team', params: { tab: data.tab } });
        else router.push('/team');
      }),
    [],
  );

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
      online,
    }),
    [
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
      online,
    ],
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
  if (/seen_at|seen_by|doctor|absence_seen|absence_sick_update|reply_to|team_chat_readers/.test(msg) && ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(String(error.code)))
    return 'Die Datenbank ist für Krankmeldungen und den neuen Chat noch nicht eingerichtet (Skript 20261130090000_krank_chat.sql fehlt).';
  if (/work_plans|work_plan_publish|site|assignment_id|is_lead/.test(msg) && ['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(String(error.code)))
    return 'Die Datenbank ist für Einsätze und den fertigen Plan noch nicht eingerichtet (Skript 20261129090000_einsaetze.sql fehlt).';
  if (['PGRST202', 'PGRST205', '42P01', '42883'].includes(String(error.code)))
    return 'Die Datenbank ist dafür noch nicht eingerichtet (Skript 20261128090000_teams.sql fehlt).';
  return `${fallback}\n\nTechnische Details: ${msg || 'unbekannt'}`;
}
