import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  ChevronLeft,
  Clock3,
  Copy,
  CornerUpLeft,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react-native';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
  type TextInputInstance,
  type TextInputKeyPressEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBackdrop, glassSurface } from '@/components/ui/glass';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { AppBackdrop, useDesign, useWideBackdrop } from '@/features/design/backgrounds';
import { designActive } from '@/features/design/design-logic';
import { useSwipeBack } from '@/features/navigation/edge-swipe';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { useScreenTop } from '@/features/navigation/use-screen-top';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';
import { supabase } from '@/lib/supabase';

import { GateNotice } from './area-gate';
import { ChatAvatar, ChatList, PersonDot } from './chat-list';
import { ROLE_LABEL, isEmployer } from './roles';
import {
  chatTopic,
  dayDivider,
  directPartner,
  inChat,
  isChatKey,
  layoutMessages,
  linkParts,
  mergeMessages,
  personColor,
  quoteText,
  readLine,
  readState,
  readersOf,
  typingLine,
  type ChatKey,
  type ChatMessage,
  type ChatReader,
} from './staff-logic';
import { staffErrorText, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';

const MAX = 4000;
const PAGE = 200;
const RELOAD_EVERY = 30_000;
const BASE_FIELDS = 'id, company_id, channel, recipient_id, sender_id, body, created_at';
/** Antworten gibt es erst mit Skript 20261130090000_krank_chat.sql – bis dahin ohne */
let withReply = true;
const noReply = () => {
  withReply = false;
};
const fields = () => (withReply ? `${BASE_FIELDS}, reply_to` : BASE_FIELDS);
const nowMs = () => Date.now();
const missingReply = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42703' || e.code === 'PGRST204') && /reply_to/.test(e.message ?? '');
/** „schreibt …“ höchstens alle 2,5 s senden, beim anderen 4,5 s lang zeigen */
const TYPING_EVERY = 2500;
const TYPING_SHOWN = 4500;
/** Ab dieser Breite (Mac): Chat-Liste links, offener Chat rechts */
const SPLIT_MIN = 1040;
const SIDE_WIDTH = 300;
const INPUT_MIN = 38;
const INPUT_MAX = 140;

/** Nachricht in der App: noch unterwegs oder nicht angekommen */
type Msg = ChatMessage & { state?: 'sending' | 'failed' };

/** Angefangene Nachrichten je Chat (Chat wechseln verliert nichts) */
const drafts = new Map<ChatKey, string>();
let tempId = 0;

const leave = () => (router.canGoBack() ? router.back() : router.navigate('/team'));
const clock = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Team → ein Chat (Leitung, Alle im Team oder direkt mit einer Person) */
export function ChatScreen() {
  const { key: raw } = useLocalSearchParams<{ key: string }>();
  const key = isChatKey(raw) ? raw : null;
  const access = useAccess();
  const { team } = useTeam();
  const { width } = useWindowDimensions();
  const other = key ? directPartner(key) : null;
  if (!key || (key === 'leitung' && !access.employer) || (other && !team?.members.some((m) => m.id === other)))
    return (
      <GateNotice
        title="Diesen Chat gibt es nicht"
        text="Vielleicht ist die Person nicht mehr im Team oder der Chat ist nur für die Leitung."
        action={{ label: 'Zum Team', onPress: () => router.navigate('/team') }}
      />
    );
  // Mac: wie ein Chat-Programm – links alle Chats, rechts der offene
  if (width >= SPLIT_MIN) return <SplitChat chatKey={key} />;
  return <Chat key={key} chatKey={key} />;
}

function SplitChat({ chatKey }: { chatKey: ChatKey }) {
  const design = useDesign();
  const shared = useWideBackdrop();
  return (
    <View style={[styles.split, !shared && styles.splitSolid]}>
      {designActive(design) && !shared && <AppBackdrop />}
      <ChatSide active={chatKey} />
      <View style={styles.splitMain}>
        <Chat key={chatKey} chatKey={chatKey} split />
      </View>
    </View>
  );
}

function ChatSide({ active }: { active: ChatKey }) {
  const top = useScreenTop();
  return (
    <View style={styles.side}>
      <View style={[styles.sideHead, { paddingTop: top - Spacing.md }]}>
        <BackLink />
        <Text style={styles.sideTitle}>Chats</Text>
      </View>
      <ScrollView contentContainerStyle={styles.sideList} showsVerticalScrollIndicator={false}>
        <ChatList active={active} onOpen={(key) => key !== active && router.setParams({ key })} />
      </ScrollView>
    </View>
  );
}

function BackLink() {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable onPress={leave} accessibilityRole="link" style={styles.back} hitSlop={8} {...hoverProps}>
      <ChevronLeft size={16} color={hovered ? Colors.text : Colors.textMuted} />
      <Text style={[styles.backText, hovered && styles.backHover]}>Team</Text>
    </Pressable>
  );
}

function Chat({ chatKey, split = false }: { chatKey: ChatKey; split?: boolean }) {
  const hub = useTeamHub();
  const { nameOf, onMessage, markRead, setOpenChat } = hub;
  const { team } = useTeam();
  const me = hub.me;
  const ws = team?.owner_id ?? '';
  const other = directPartner(chatKey);
  const teamMembers = team?.members;
  const person = other ? teamMembers?.find((m) => m.id === other) : undefined;
  const group = !other;
  /** Wer außer mir diesen Chat liest */
  const others = useMemo(
    () =>
      other
        ? [other]
        : (teamMembers ?? []).filter((m) => m.id !== me && (chatKey !== 'leitung' || isEmployer(m.role))).map((m) => m.id),
    [other, teamMembers, me, chatKey],
  );
  const firstName = useCallback(
    (id: string) => {
      const n = nameOf(id);
      return n.trim().split(/\s+/)[0] || n;
    },
    [nameOf],
  );

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const top = useScreenTop();
  const design = useDesign();
  const shared = useWideBackdrop();
  const pad = split ? Spacing.xxl : wide ? Spacing.xxxl : Spacing.lg;
  const scroll = useRef<ScrollViewInstance>(null);
  const input = useRef<TextInputInstance>(null);
  useSwipeBack(leave);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState(() => drafts.get(chatKey) ?? '');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  /** Kurz hervorgehoben (nach Antippen eines Zitats) */
  const [flash, setFlash] = useState<string | null>(null);
  const rowY = useRef(new Map<string, number>());
  // Wer bis wann gelesen hat, und wer gerade schreibt (Benutzer → zeigen bis)
  const [readers, setReaders] = useState<ChatReader[]>([]);
  const [typing, setTyping] = useState<ReadonlyMap<string, number>>(() => new Map());
  const live = useRef<RealtimeChannel | null>(null);
  const joined = useRef(false);
  const typedAt = useRef(0);
  // Beim Öffnen ungelesen: darüber die Linie „Neue Nachrichten“
  const [unreadAtOpen] = useState(() => hub.chats.find((c) => c.chat === chatKey)?.unread ?? 0);
  // Weiter oben am Lesen: nicht nach unten springen, sondern „neue Nachricht“ anbieten
  const atBottom = useRef(true);
  const scrolled = useRef(false);
  const [below, setBelow] = useState(0);

  // Live-Kanal dieses Chats: „schreibt …“ und „gelesen“ (privat, nur wer den Chat lesen darf)
  const sendLive = useCallback(
    (event: 'typing' | 'stop' | 'read') => {
      const ch = live.current;
      if (ch && joined.current) void ch.send({ type: 'broadcast', event, payload: { user: me } });
    },
    [me],
  );

  const updateText = (v: string) => {
    const next = v.slice(0, MAX);
    drafts.set(chatKey, next);
    setText(next);
    const now = nowMs();
    if (next.trim() && now - typedAt.current > TYPING_EVERY) {
      typedAt.current = now;
      sendLive('typing');
    } else if (!next.trim() && typedAt.current) {
      typedAt.current = 0;
      sendLive('stop');
    }
  };

  const loadReaders = useCallback(async () => {
    if (!ws) return;
    const { data, error: err } = await supabase.rpc('team_chat_readers', { p_chat: chatKey });
    if (err) return; // Skript fehlt noch: dann ohne „Gelesen“
    const list = (Array.isArray(data) ? (data as Partial<ChatReader>[]) : []).filter(
      (r): r is ChatReader => typeof r?.user_id === 'string' && typeof r?.read_at === 'string',
    );
    setReaders((prev) => (JSON.stringify(prev) === JSON.stringify(list) ? prev : list));
  }, [ws, chatKey]);

  const load = useCallback(async () => {
    if (!ws) return;
    const query = () => {
      const q = supabase.from('team_messages').select(fields()).eq('company_id', ws).order('created_at', { ascending: false }).limit(PAGE);
      return other
        ? q.eq('channel', 'direkt').or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
        : q.eq('channel', chatKey);
    };
    let res = await query();
    if (missingReply(res.error)) {
      noReply();
      res = await query();
    }
    const { data, error: err } = res;
    setLoading(false);
    if (err) {
      setError(staffErrorText(err, 'Der Chat konnte nicht geladen werden.'));
      return;
    }
    const fetched = ((data ?? []) as unknown as ChatMessage[]).reverse();
    const ids = new Set(fetched.map((m) => m.id));
    const newest = fetched.at(-1)?.created_at ?? '';
    // Behalten: was live dazukam, während geladen wurde, und eigene, die noch unterwegs sind
    setMessages((prev) => mergeMessages(fetched, prev.filter((m) => m.state || (!ids.has(m.id) && m.created_at > newest))));
  }, [ws, me, other, chatKey]);

  useEffect(() => {
    const first = setTimeout(() => {
      void load();
      void loadReaders();
    }, 0);
    const t = setInterval(() => {
      void load();
      void loadReaders();
    }, RELOAD_EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load, loadReaders]);

  useEffect(() => {
    if (!ws || !me) return;
    const ch = supabase.channel(chatTopic(ws, chatKey, me), { config: { private: true, broadcast: { self: false } } });
    const mark = (user: unknown, on: boolean) => {
      if (typeof user !== 'string' || user === me) return;
      setTyping((prev) => {
        if (!on && !prev.has(user)) return prev;
        const next = new Map(prev);
        if (on) next.set(user, Date.now() + TYPING_SHOWN);
        else next.delete(user);
        return next;
      });
    };
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => mark(payload?.user, true))
      .on('broadcast', { event: 'stop' }, ({ payload }) => mark(payload?.user, false))
      .on('broadcast', { event: 'read' }, () => void loadReaders())
      .subscribe((status) => {
        joined.current = status === 'SUBSCRIBED';
      });
    live.current = ch;
    return () => {
      joined.current = false;
      live.current = null;
      void supabase.removeChannel(ch);
    };
  }, [ws, me, chatKey, loadReaders]);

  // „schreibt …“ verschwindet von selbst, wenn nichts mehr kommt
  const typingCount = typing.size;
  useEffect(() => {
    if (!typingCount) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTyping((prev) => {
        const next = new Map([...prev].filter(([, until]) => until > now));
        return next.size === prev.size ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [typingCount]);

  /** Gelesen markieren und den anderen Bescheid geben (für ihre Häkchen) */
  const readNow = useCallback(() => {
    void markRead(chatKey).then(() => sendLive('read'));
  }, [markRead, chatKey, sendLive]);

  // Live dazu + gelesen markieren, solange der Chat offen ist
  useEffect(
    () =>
      onMessage((m) => {
        if (!inChat(m, chatKey, me)) return;
        setMessages((prev) => mergeMessages(prev, [m]));
        if (m.sender_id === me) return;
        setTyping((prev) => {
          if (!prev.has(m.sender_id)) return prev;
          const next = new Map(prev);
          next.delete(m.sender_id);
          return next;
        });
        readNow();
        void loadReaders();
        if (!atBottom.current) setBelow((n) => n + 1);
      }),
    [onMessage, readNow, loadReaders, chatKey, me],
  );
  useFocusEffect(
    useCallback(() => {
      setOpenChat(chatKey);
      readNow();
      return () => setOpenChat(null);
    }, [setOpenChat, readNow, chatKey]),
  );

  // Mac: direkt lostippen können
  useEffect(() => {
    if (Platform.OS !== 'web' || !wide) return;
    const t = setTimeout(() => input.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [wide]);

  const deliver = async (temp: Msg) => {
    const insert = () =>
      supabase
        .from('team_messages')
        .insert({
          company_id: ws,
          channel: other ? 'direkt' : chatKey,
          recipient_id: other,
          body: temp.body,
          ...(withReply && temp.reply_to ? { reply_to: temp.reply_to } : {}),
        })
        .select(fields())
        .single();
    let res = await insert();
    if (missingReply(res.error)) {
      noReply();
      res = await insert();
    }
    const { data, error: err } = res;
    if (err || !data) {
      setMessages((prev) => prev.map((m) => (m.id === temp.id ? { ...m, state: 'failed' } : m)));
      setError(staffErrorText(err ?? {}, 'Die Nachricht ist nicht angekommen.'));
      return;
    }
    // Die echte Nachricht kann live schon da sein – dann nur die vorläufige entfernen
    setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== temp.id), [data as unknown as ChatMessage]));
    void markRead(chatKey);
    void hub.refresh();
  };

  const send = () => {
    const body = text.trim();
    if (!body || !ws) return;
    const temp: Msg = {
      id: `tmp-${++tempId}`,
      company_id: ws,
      channel: other ? 'direkt' : (chatKey as 'alle' | 'leitung'),
      recipient_id: other,
      sender_id: me,
      body,
      created_at: new Date().toISOString(),
      reply_to: replyTo && withReply ? replyTo.id : null,
      state: 'sending',
    };
    playSound('tick');
    setError(null);
    setReplyTo(null);
    updateText('');
    setInputHeight(INPUT_MIN);
    atBottom.current = true;
    setMessages((prev) => [...prev, temp]);
    void deliver(temp);
  };

  const retry = (m: Msg) => {
    setSelected(null);
    setError(null);
    const again: Msg = { ...m, state: 'sending' };
    setMessages((prev) => prev.map((x) => (x.id === m.id ? again : x)));
    void deliver(again);
  };

  const remove = async (m: Msg) => {
    setSelected(null);
    if (replyTo?.id === m.id) setReplyTo(null);
    const before = messages;
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    if (m.state) return; // nie angekommen: nur hier weg
    const { error: err } = await supabase.from('team_messages').delete().eq('id', m.id);
    if (err) {
      setMessages(before);
      setError(staffErrorText(err, 'Die Nachricht konnte nicht gelöscht werden.'));
    } else void hub.refresh();
  };

  const copy = async (m: Msg) => {
    setSelected(null);
    await Clipboard.setStringAsync(m.body);
    setCopied(m.id);
    setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1400);
  };

  const startReply = (m: Msg) => {
    setSelected(null);
    setReplyTo(m);
    setTimeout(() => input.current?.focus(), 30);
  };

  /** Zitat angetippt: zur Original-Nachricht springen und sie kurz hervorheben */
  const showOriginal = (id: string) => {
    const y = rowY.current.get(id);
    if (y === undefined) return;
    atBottom.current = false;
    scroll.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1600);
  };

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    const ev = e.nativeEvent as { key: string; shiftKey?: boolean; isComposing?: boolean };
    if (Platform.OS !== 'web') return;
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      e.preventDefault();
      send();
    } else if (ev.key === 'Escape' && replyTo) setReplyTo(null);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 120;
    if (atBottom.current && below) setBelow(0);
  };
  const toEnd = () => {
    setBelow(0);
    atBottom.current = true;
    scroll.current?.scrollToEnd({ animated: true });
  };

  const title = hub.chatName(chatKey);
  const members = teamMembers ?? [];
  const typingNames = [...typing.keys()].filter((id) => others.includes(id)).map(firstName);
  const onlineHere = others.filter((id) => hub.online.has(id)).length;
  const partnerOnline = !!other && hub.online.has(other);
  const baseSubtitle =
    chatKey === 'leitung'
      ? 'Nur Inhaber und Mitgründer lesen mit'
      : chatKey === 'alle'
        ? peopleLine(members.map((m) => (m.id === me ? 'Du' : (m.name.trim().split(/\s+/)[0] ?? m.name))))
        : person
          ? person.title
            ? `${ROLE_LABEL[person.role]} · ${person.title}`
            : ROLE_LABEL[person.role]
          : '';
  const subtitle = other
    ? partnerOnline
      ? `online · ${baseSubtitle}`
      : baseSubtitle
    : onlineHere
      ? `${baseSubtitle} · ${onlineHere} online`
      : baseSubtitle;
  const emptyHint =
    chatKey === 'leitung'
      ? 'Hier besprecht ihr als Arbeitgeber, was die Mitarbeiter nicht sehen sollen.'
      : chatKey === 'alle'
        ? 'Alle im Team lesen mit – gut für Ansagen, Fragen und Absprachen.'
        : `Nur du und ${title} lest diesen Chat.`;

  const now = new Date();
  const layout = useMemo(() => layoutMessages(messages), [messages]);
  // Erste ungelesene Nachricht (von anderen), als der Chat geöffnet wurde
  const firstUnread = useMemo(() => {
    if (!unreadAtOpen) return null;
    let left = unreadAtOpen;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].sender_id === me) continue;
      if (--left === 0) return messages[i].id;
    }
    return null;
  }, [messages, unreadAtOpen, me]);

  const canSend = !!text.trim();

  // Zitate und „Gelesen“
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const quoteOf = (m: Msg): Quote | null => {
    if (!m.reply_to) return null;
    const o = byId.get(m.reply_to);
    if (!o) return { id: null, name: '', color: Colors.textFaint, text: 'Ältere Nachricht' };
    return {
      id: o.id,
      name: o.sender_id === me ? 'Du' : nameOf(o.sender_id),
      color: o.sender_id === me ? Colors.accent : personColor(o.sender_id),
      text: quoteText(o.body),
    };
  };
  const lastMine = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender_id === me && !messages[i].state) return messages[i].id;
    return null;
  }, [messages, me]);
  const seenLine = useMemo(() => {
    const m = lastMine ? byId.get(lastMine) : undefined;
    if (!m) return '';
    const read = new Set(readersOf(m, readers));
    const ids = others.filter((id) => read.has(id));
    if (!ids.length) return '';
    return other ? 'Gelesen' : readLine(ids.map(firstName), ids.length === others.length);
  }, [lastMine, byId, readers, others, other, firstName]);
  const replyColor = replyTo ? (replyTo.sender_id === me ? Colors.accent : personColor(replyTo.sender_id)) : Colors.accent;

  return (
    <KeyboardAvoidingView style={[styles.root, (shared || split) && styles.clear]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {designActive(design) && !shared && !split && <AppBackdrop />}
      <View style={[styles.head, { paddingTop: top - Spacing.md, paddingHorizontal: pad }]}>
        <View style={styles.inner}>
          {!split && <BackLink />}
          <View style={styles.headRow}>
            <ChatAvatar chatKey={chatKey} name={title} size={40} online={partnerOnline} />
            <View style={styles.headTexts}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {typingNames.length > 0 ? (
                <Text style={[styles.subtitle, styles.subtitleLive]} numberOfLines={1}>
                  {other ? 'schreibt …' : typingLine(typingNames)}
                </Text>
              ) : (
                !!subtitle && (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {subtitle}
                  </Text>
                )
              )}
            </View>
          </View>
        </View>
      </View>

      <View style={styles.scrollWrap}>
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: Spacing.lg }}
          keyboardDismissMode="interactive"
          onScroll={onScroll}
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            // Erstes Laden: ohne Animation ans Ende; danach nur, wenn man ohnehin unten ist
            if (!scrolled.current) {
              scroll.current?.scrollToEnd({ animated: false });
              if (messages.length) scrolled.current = true;
            } else if (atBottom.current) scroll.current?.scrollToEnd({ animated: true });
          }}>
          <View style={[styles.inner, { paddingHorizontal: pad }]}>
            {!loading && messages.length === 0 && (
              <View style={styles.empty}>
                <ChatAvatar chatKey={chatKey} name={title} size={56} />
                <Text style={styles.emptyTitle}>Noch keine Nachrichten</Text>
                <Text style={styles.emptyText}>{emptyHint}</Text>
              </View>
            )}
            {messages.map((m, i) => {
              const l = layout[i];
              const mine = m.sender_id === me;
              return (
                <Fragment key={m.id}>
                  {l.newDay && (
                    <View style={styles.dayWrap}>
                      <Text style={styles.day}>{dayDivider(m.created_at, now)}</Text>
                    </View>
                  )}
                  {m.id === firstUnread && (
                    <View style={styles.unreadLine}>
                      <View style={styles.unreadRule} />
                      <Text style={styles.unreadText}>Neue Nachrichten</Text>
                      <View style={styles.unreadRule} />
                    </View>
                  )}
                  <Bubble
                    m={m}
                    mine={mine}
                    first={l.first || m.id === firstUnread}
                    last={l.last}
                    sender={group && !mine ? nameOf(m.sender_id) : null}
                    senderColor={personColor(m.sender_id)}
                    quote={quoteOf(m)}
                    ticks={mine && !m.state ? readState(m, readers, others) : null}
                    flash={flash === m.id}
                    selected={selected === m.id}
                    copied={copied === m.id}
                    onLayoutY={(y) => rowY.current.set(m.id, y)}
                    onSelect={() => setSelected(selected === m.id ? null : m.id)}
                    onQuote={showOriginal}
                    onReply={m.state ? undefined : () => startReply(m)}
                    onCopy={() => void copy(m)}
                    onDelete={mine ? () => void remove(m) : undefined}
                    onRetry={m.state === 'failed' ? () => retry(m) : undefined}
                  />
                  {m.id === lastMine && !!seenLine && <Text style={styles.seen}>{seenLine}</Text>}
                </Fragment>
              );
            })}
            {typingNames.length > 0 && (
              <View style={styles.typingRow} accessibilityLiveRegion="polite">
                <View style={styles.typingBubble}>
                  <Text style={styles.typingDots}>•••</Text>
                </View>
                <Text style={styles.typingText} numberOfLines={1}>
                  {typingLine(typingNames)}
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
        {below > 0 && (
          <Pressable onPress={toEnd} style={styles.below} accessibilityRole="button" accessibilityLabel="Zu den neuen Nachrichten">
            <ArrowDown size={15} color={Colors.onAccent} strokeWidth={2.6} />
            <Text style={styles.belowText}>{below === 1 ? 'Neue Nachricht' : `${below} neue Nachrichten`}</Text>
          </Pressable>
        )}
      </View>

      <View style={[styles.composerWrap, { paddingHorizontal: pad, paddingBottom: Spacing.md + (wide ? 0 : insets.bottom) }]}>
        {!!error && <Notice tone="error">{error}</Notice>}
        {replyTo && (
          <View style={[styles.replyBar, { borderLeftColor: replyColor }]}>
            <CornerUpLeft size={15} color={replyColor} strokeWidth={2.2} />
            <View style={styles.replyTexts}>
              <Text style={[styles.replyName, { color: replyColor }]} numberOfLines={1}>
                {replyTo.sender_id === me ? 'Antwort auf deine Nachricht' : `Antwort an ${nameOf(replyTo.sender_id)}`}
              </Text>
              <Text style={styles.replyText} numberOfLines={1}>
                {quoteText(replyTo.body)}
              </Text>
            </View>
            <Pressable
              onPress={() => setReplyTo(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Antwort abbrechen"
              style={styles.replyClose}>
              <X size={16} color={Colors.textMuted} />
            </Pressable>
          </View>
        )}
        <View style={[styles.composer, glassSurface]}>
          <GlassBackdrop radius={22} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={updateText}
            placeholder={other ? `Nachricht an ${title}` : `Nachricht an „${title}“`}
            placeholderTextColor={Colors.textFaint}
            multiline
            onKeyPress={onKeyPress}
            onContentSizeChange={(e) =>
              setInputHeight(Math.min(INPUT_MAX, Math.max(INPUT_MIN, Math.ceil(e.nativeEvent.contentSize.height))))
            }
            accessibilityLabel="Nachricht"
            // Im Web wächst das Feld nicht von selbst mit – dort die Höhe vorgeben
            style={[styles.input, Platform.OS === 'web' && { height: inputHeight }]}
            selectionColor={Colors.text}
          />
          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Senden"
            style={[styles.send, !canSend && styles.sendOff]}>
            <ArrowUp size={18} color={Colors.onAccent} strokeWidth={2.6} />
          </Pressable>
        </View>
        {Platform.OS === 'web' && wide && (
          <Text style={styles.foot}>
            {replyTo ? 'Enter zum Senden · Esc bricht die Antwort ab' : 'Enter zum Senden · Shift + Enter für eine neue Zeile'}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

/** „Du, Pascal, Lisa und 2 weitere“ */
function peopleLine(names: string[]): string {
  if (names.length <= 1) return 'Nur du bist im Team';
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return rest > 0 ? `${shown.join(', ')} und ${rest} weitere` : `${shown.slice(0, -1).join(', ')} und ${shown.at(-1)}`;
}

/** Zitat in einer Antwort; id null = Original ist nicht (mehr) geladen */
type Quote = { id: string | null; name: string; color: string; text: string };

type BubbleProps = {
  m: Msg;
  mine: boolean;
  first: boolean;
  last: boolean;
  /** Name über dem Block (Gruppen-Chats, nur andere) – null: ohne Namen und Bild */
  sender: string | null;
  senderColor: string;
  quote: Quote | null;
  /** Häkchen unter eigenen Nachrichten */
  ticks: 'sent' | 'some' | 'all' | null;
  flash: boolean;
  selected: boolean;
  copied: boolean;
  onLayoutY: (y: number) => void;
  onSelect: () => void;
  onQuote: (id: string) => void;
  onReply?: () => void;
  onCopy: () => void;
  onDelete?: () => void;
  onRetry?: () => void;
};

/** Eine Nachricht: Blase mit Text, Uhrzeit und Status; Aktionen beim Drüberfahren (Mac) bzw. Gedrückthalten */
function Bubble({
  m,
  mine,
  first,
  last,
  sender,
  senderColor,
  quote,
  ticks,
  flash,
  selected,
  copied,
  onLayoutY,
  onSelect,
  onQuote,
  onReply,
  onCopy,
  onDelete,
  onRetry,
}: BubbleProps) {
  const { hovered, hoverProps } = useHover();
  const web = Platform.OS === 'web';
  const failed = m.state === 'failed';
  const parts = useMemo(() => linkParts(m.body), [m.body]);
  const showActions = selected || (web && hovered);

  const actions = (
    <View style={[styles.actions, !showActions && styles.actionsHidden]} pointerEvents={showActions ? 'auto' : 'none'}>
      {onRetry && <Action icon={RotateCw} label="Nochmal senden" onPress={onRetry} />}
      {onReply && <Action icon={CornerUpLeft} label="Antworten" onPress={onReply} />}
      {!m.state && <Action icon={copied ? Check : Copy} label={copied ? 'Kopiert' : 'Kopieren'} onPress={onCopy} />}
      {onDelete && <Action icon={Trash2} label={m.state ? 'Verwerfen' : 'Löschen'} danger onPress={onDelete} />}
    </View>
  );

  return (
    // Pressable nur wegen „Maus drüber“ (ein View kennt das im Browser nicht)
    <Pressable
      {...(web ? hoverProps : {})}
      focusable={false}
      accessible={false}
      onLayout={(e) => onLayoutY(e.nativeEvent.layout.y)}
      style={[styles.line, mine ? styles.lineMine : styles.lineOther, { marginTop: first ? 10 : 2 }]}>
      {sender !== null && <View style={styles.avatarCol}>{last && <PersonDot name={sender} size={28} color={senderColor} />}</View>}
      {mine && web && actions}
      <View style={[styles.bubbleCol, mine ? styles.colMine : styles.colOther]}>
        {sender !== null && first && <Text style={[styles.sender, { color: senderColor }]}>{sender}</Text>}
        <Pressable
          onLongPress={onSelect}
          onPress={failed ? onRetry : selected ? onSelect : undefined}
          delayLongPress={300}
          accessibilityHint={web ? undefined : 'Gedrückt halten für Antworten, Kopieren und Löschen'}
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleOther,
            mine ? { borderTopRightRadius: first ? 18 : 6 } : { borderTopLeftRadius: first ? 18 : 6 },
            m.state === 'sending' && styles.bubbleSending,
            failed && styles.bubbleFailed,
            flash && styles.bubbleFlash,
          ]}>
          {quote && (
            <Pressable
              onPress={quote.id ? () => onQuote(quote.id as string) : undefined}
              disabled={!quote.id}
              accessibilityRole={quote.id ? 'button' : undefined}
              accessibilityLabel={`Antwort auf ${quote.name || 'eine ältere Nachricht'}: ${quote.text}`}
              style={[styles.quote, { borderLeftColor: quote.color }]}>
              {!!quote.name && (
                <Text style={[styles.quoteName, { color: quote.color }]} numberOfLines={1}>
                  {quote.name}
                </Text>
              )}
              <Text style={[styles.quoteText, !quote.id && styles.quoteGone]} numberOfLines={2}>
                {quote.text}
              </Text>
            </Pressable>
          )}
          <Text style={styles.body} selectable={web}>
            {parts.map((p, i) =>
              p.url ? (
                <Text key={i} style={styles.link} onPress={() => void Linking.openURL(p.url as string)} accessibilityRole="link">
                  {p.text}
                </Text>
              ) : (
                <Fragment key={i}>{p.text}</Fragment>
              ),
            )}
          </Text>
          <View style={styles.meta}>
            {m.state === 'sending' && <Clock3 size={11} color={Colors.textFaint} />}
            {failed ? (
              <>
                <AlertCircle size={12} color={Colors.danger} />
                <Text style={styles.failedText}>Nicht gesendet – antippen zum Wiederholen</Text>
              </>
            ) : (
              <Text style={styles.time}>{clock(m.created_at)}</Text>
            )}
            {ticks === 'sent' && <Check size={13} color={Colors.textFaint} strokeWidth={2.4} accessibilityLabel="Gesendet" />}
            {(ticks === 'some' || ticks === 'all') && (
              <CheckCheck
                size={13}
                color={ticks === 'all' ? Colors.accent : Colors.textFaint}
                strokeWidth={2.4}
                accessibilityLabel={ticks === 'all' ? 'Gelesen' : 'Von manchen gelesen'}
              />
            )}
          </View>
        </Pressable>
        {!web && selected && actions}
      </View>
      {!mine && web && actions}
    </Pressable>
  );
}

function Action({ icon: Icon, label, onPress, danger = false }: { icon: typeof Copy; label: string; onPress: () => void; danger?: boolean }) {
  const { hovered, hoverProps } = useHover();
  const web = Platform.OS === 'web';
  const color = danger ? Colors.danger : hovered ? Colors.text : Colors.textMuted;
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.action, hovered && styles.actionHover, !web && styles.actionTouch]}>
      <Icon size={14} color={color} strokeWidth={2} />
      {!web && <Text style={[styles.actionText, { color }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  clear: { backgroundColor: 'transparent' },
  // Mac: Liste + Chat
  split: { flex: 1, flexDirection: 'row' },
  splitSolid: { backgroundColor: Colors.background },
  splitMain: { flex: 1, minWidth: 0 },
  side: { width: SIDE_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: Colors.border, backgroundColor: 'rgba(0,0,0,0.28)' },
  sideHead: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm, gap: 2 },
  sideTitle: { color: Colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  sideList: { paddingHorizontal: Spacing.sm, paddingBottom: Spacing.xl },

  head: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, paddingBottom: Spacing.md },
  inner: { width: '100%', maxWidth: 860, alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: Spacing.xs },
  backText: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' },
  backHover: { color: Colors.text },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headTexts: { flex: 1, gap: 2 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { color: Colors.textMuted, fontSize: 13.5 },
  subtitleLive: { color: Colors.accent, fontWeight: '600' },

  scrollWrap: { flex: 1 },
  scroll: { flex: 1 },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: '700', marginTop: Spacing.sm },
  emptyText: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 380 },
  dayWrap: { alignItems: 'center', marginTop: Spacing.lg, marginBottom: Spacing.xs },
  day: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  unreadLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.md },
  unreadRule: { flex: 1, height: 1, backgroundColor: accentAlpha(0.35) },
  unreadText: { color: Colors.accent, fontSize: 12, fontWeight: '700' },

  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, maxWidth: '86%' },
  lineMine: { alignSelf: 'flex-end' },
  lineOther: { alignSelf: 'flex-start' },
  avatarCol: { width: 28 },
  bubbleCol: { flexShrink: 1, gap: 3 },
  colMine: { alignItems: 'flex-end' },
  colOther: { alignItems: 'flex-start' },
  sender: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginLeft: Spacing.sm },
  bubble: { borderRadius: 18, paddingHorizontal: 13, paddingTop: 8, paddingBottom: 6, gap: 1 },
  bubbleMine: { backgroundColor: accentAlpha(0.16), borderWidth: 1, borderColor: accentAlpha(0.32), borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 6 },
  bubbleSending: { opacity: 0.6 },
  bubbleFailed: { borderColor: 'rgba(255,107,107,0.6)', backgroundColor: 'rgba(255,107,107,0.08)' },
  bubbleFlash: { borderColor: Colors.accent, backgroundColor: accentAlpha(0.26) },
  quote: {
    borderLeftWidth: 3,
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 1,
    marginBottom: 5,
    backgroundColor: 'rgba(0,0,0,0.22)',
    gap: 1,
  },
  quoteName: { fontSize: 12, fontWeight: '700' },
  quoteText: { color: Colors.textMuted, fontSize: 13, lineHeight: 17 },
  quoteGone: { fontStyle: 'italic' },
  seen: { alignSelf: 'flex-end', color: Colors.textFaint, fontSize: 11.5, marginTop: 3, marginRight: 4 },
  typingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 10, alignSelf: 'flex-start' },
  typingBubble: {
    borderRadius: 16,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typingDots: { color: Colors.textMuted, fontSize: 15, letterSpacing: 2 },
  typingText: { color: Colors.textFaint, fontSize: 12.5, flexShrink: 1 },
  body: { color: Colors.text, fontSize: 15, lineHeight: 21 },
  link: { color: Colors.accent, textDecorationLine: 'underline' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  time: { color: Colors.textFaint, fontSize: 11 },
  failedText: { color: Colors.danger, fontSize: 11.5, fontWeight: '600' },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'center' },
  actionsHidden: { opacity: 0 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6, borderRadius: 8 },
  actionHover: { backgroundColor: 'rgba(255,255,255,0.08)' },
  actionTouch: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.06)' },
  actionText: { fontSize: 13, fontWeight: '600' },

  below: {
    position: 'absolute',
    bottom: Spacing.md,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: Colors.accent,
  },
  belowText: { color: Colors.onAccent, fontSize: 13, fontWeight: '700' },

  composerWrap: { width: '100%', maxWidth: 860 + 2 * Spacing.xxxl, alignSelf: 'center', gap: 6, paddingTop: Spacing.sm },
  replyBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderLeftWidth: 3,
    borderRadius: 12,
    paddingLeft: Spacing.md,
    paddingRight: 6,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  replyTexts: { flex: 1, minWidth: 0, gap: 1 },
  replyName: { fontSize: 12.5, fontWeight: '700' },
  replyText: { color: Colors.textMuted, fontSize: 13 },
  replyClose: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.borderFocus,
    paddingLeft: Spacing.lg,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: { flex: 1, minHeight: INPUT_MIN, maxHeight: INPUT_MAX, color: Colors.text, fontSize: 15.5, paddingVertical: 9 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  foot: { color: Colors.textFaint, fontSize: 11.5, textAlign: 'center' },
});
