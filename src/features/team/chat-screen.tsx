import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowUp, ChevronLeft, Trash2 } from 'lucide-react-native';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
  type TextInputKeyPressEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassBackdrop, glassSurface } from '@/components/ui/glass';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing } from '@/constants/theme';
import { AppBackdrop, useDesign, useWideBackdrop } from '@/features/design/backgrounds';
import { designActive } from '@/features/design/design-logic';
import { useSwipeBack } from '@/features/navigation/edge-swipe';
import { SIDEBAR_BREAKPOINT } from '@/features/navigation/nav-items';
import { useScreenTop } from '@/features/navigation/use-screen-top';
import { playSound } from '@/features/sound/ui-sound';
import { supabase } from '@/lib/supabase';

import { GateNotice } from './area-gate';
import { PersonDot } from './chat-list';
import { ROLE_LABEL } from './roles';
import {
  dayDivider,
  dayIso,
  directPartner,
  inChat,
  isChatKey,
  mergeMessages,
  type ChatKey,
  type ChatMessage,
} from './staff-logic';
import { staffErrorText, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';

const MAX = 4000;
const PAGE = 200;
const RELOAD_EVERY = 30_000;

const leave = () => (router.canGoBack() ? router.back() : router.navigate('/team'));

/** Team → ein Chat (Leitung, Alle im Team oder direkt mit einer Person) */
export function ChatScreen() {
  const { key: raw } = useLocalSearchParams<{ key: string }>();
  const key = isChatKey(raw) ? raw : null;
  const access = useAccess();
  const { team } = useTeam();
  const other = key ? directPartner(key) : null;
  if (!key || (key === 'leitung' && !access.employer) || (other && !team?.members.some((m) => m.id === other)))
    return (
      <GateNotice
        title="Diesen Chat gibt es nicht"
        text="Vielleicht ist die Person nicht mehr im Team oder der Chat ist nur für die Leitung."
        action={{ label: 'Zum Team', onPress: () => router.navigate('/team') }}
      />
    );
  return <Chat chatKey={key} />;
}

function Chat({ chatKey }: { chatKey: ChatKey }) {
  const hub = useTeamHub();
  const { team } = useTeam();
  const me = hub.me;
  const ws = team?.owner_id ?? '';
  const other = directPartner(chatKey);
  const person = other ? team?.members.find((m) => m.id === other) : undefined;

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width >= SIDEBAR_BREAKPOINT;
  const top = useScreenTop();
  const design = useDesign();
  const shared = useWideBackdrop();
  const pad = wide ? Spacing.xxxl : Spacing.lg;
  const scroll = useRef<ScrollViewInstance>(null);
  useSwipeBack(leave);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    let q = supabase
      .from('team_messages')
      .select('id, company_id, channel, recipient_id, sender_id, body, created_at')
      .eq('company_id', ws)
      .order('created_at', { ascending: false })
      .limit(PAGE);
    q = other
      ? q.eq('channel', 'direkt').or(`and(sender_id.eq.${me},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me})`)
      : q.eq('channel', chatKey);
    const { data, error: err } = await q;
    setLoading(false);
    if (err) {
      setError(staffErrorText(err, 'Der Chat konnte nicht geladen werden.'));
      return;
    }
    const fetched = ((data ?? []) as ChatMessage[]).reverse();
    const ids = new Set(fetched.map((m) => m.id));
    const newest = fetched.at(-1)?.created_at ?? '';
    // Was live dazukam, während geladen wurde, behalten; Gelöschtes verschwindet
    setMessages((prev) => mergeMessages(fetched, prev.filter((m) => !ids.has(m.id) && m.created_at > newest)));
  }, [ws, me, other, chatKey]);

  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => void load(), RELOAD_EVERY);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  // Live dazu + gelesen markieren, solange der Chat offen ist
  const { onMessage, markRead, setOpenChat } = hub;
  useEffect(
    () =>
      onMessage((m) => {
        if (!inChat(m, chatKey, me)) return;
        setMessages((prev) => mergeMessages(prev, [m]));
        if (m.sender_id !== me) void markRead(chatKey);
      }),
    [onMessage, markRead, chatKey, me],
  );
  useFocusEffect(
    useCallback(() => {
      setOpenChat(chatKey);
      void markRead(chatKey);
      return () => setOpenChat(null);
    }, [setOpenChat, markRead, chatKey]),
  );

  const send = async () => {
    const body = text.trim();
    if (!body || sending || !ws) return;
    setSending(true);
    setError(null);
    setText('');
    const { data, error: err } = await supabase
      .from('team_messages')
      .insert({ company_id: ws, channel: other ? 'direkt' : chatKey, recipient_id: other, body })
      .select('id, company_id, channel, recipient_id, sender_id, body, created_at')
      .single();
    setSending(false);
    if (err || !data) {
      setText(body);
      setError(staffErrorText(err ?? {}, 'Die Nachricht ist nicht angekommen.'));
      return;
    }
    playSound('tick');
    setMessages((prev) => mergeMessages(prev, [data as ChatMessage]));
    void markRead(chatKey);
    void hub.refresh();
  };

  const remove = async (id: string) => {
    setSelected(null);
    const before = messages;
    setMessages((prev) => prev.filter((m) => m.id !== id));
    const { error: err } = await supabase.from('team_messages').delete().eq('id', id);
    if (err) {
      setMessages(before);
      setError(staffErrorText(err, 'Die Nachricht konnte nicht gelöscht werden.'));
    } else void hub.refresh();
  };

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    const ev = e.nativeEvent as { key: string; shiftKey?: boolean };
    if (Platform.OS === 'web' && ev.key === 'Enter' && !ev.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const title = hub.chatName(chatKey);
  const subtitle =
    chatKey === 'leitung'
      ? 'Nur Inhaber und Mitgründer lesen mit'
      : chatKey === 'alle'
        ? `${team?.members.length ?? 1} Personen · Arbeitgeber und Mitarbeiter`
        : person
          ? person.title
            ? `${ROLE_LABEL[person.role]} · ${person.title}`
            : ROLE_LABEL[person.role]
          : '';
  const emptyHint =
    chatKey === 'leitung'
      ? 'Hier besprecht ihr als Arbeitgeber, was die Mitarbeiter nicht sehen sollen.'
      : chatKey === 'alle'
        ? 'Alle im Team lesen mit – gut für Ansagen, Fragen und Absprachen.'
        : 'Nur ihr zwei lest diesen Chat.';

  const now = new Date();
  const items = useMemo(() => messages, [messages]);

  return (
    <KeyboardAvoidingView style={[styles.root, shared && styles.clear]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {designActive(design) && !shared && <AppBackdrop />}
      <View style={[styles.head, { paddingTop: top - Spacing.md, paddingHorizontal: pad }]}>
        <View style={styles.inner}>
          <Pressable onPress={leave} accessibilityRole="link" style={styles.back} hitSlop={8}>
            <ChevronLeft size={16} color={Colors.textMuted} />
            <Text style={styles.backText}>Team</Text>
          </Pressable>
          <View style={styles.headRow}>
            {person && <PersonDot name={person.name} size={38} />}
            <View style={styles.headTexts}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
              </Text>
              {!!subtitle && (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {subtitle}
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: Spacing.md, paddingBottom: Spacing.lg }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View style={[styles.inner, { paddingHorizontal: pad }]}>
          {!loading && items.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Noch keine Nachrichten</Text>
              <Text style={styles.emptyText}>{emptyHint}</Text>
            </View>
          )}
          {items.map((m, i) => {
            const prev = items[i - 1];
            const newDay = !prev || dayIso(new Date(prev.created_at)) !== dayIso(new Date(m.created_at));
            const mine = m.sender_id === me;
            const showName = !mine && !other && (newDay || prev?.sender_id !== m.sender_id);
            const d = new Date(m.created_at);
            const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return (
              <Fragment key={m.id}>
                {newDay && <Text style={styles.divider}>{dayDivider(m.created_at, now)}</Text>}
                <View style={[styles.line, mine ? styles.lineMine : styles.lineOther]}>
                  {showName && <Text style={styles.sender}>{hub.nameOf(m.sender_id)}</Text>}
                  <Pressable
                    onLongPress={mine ? () => setSelected(m.id) : undefined}
                    onPress={mine && Platform.OS === 'web' ? () => setSelected(selected === m.id ? null : m.id) : undefined}
                    accessibilityHint={mine ? 'Gedrückt halten zum Löschen' : undefined}
                    style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Text style={styles.body} selectable>
                      {m.body}
                    </Text>
                    <Text style={styles.time}>{time}</Text>
                  </Pressable>
                  {selected === m.id && (
                    <Pressable onPress={() => void remove(m.id)} style={styles.delete} accessibilityRole="button" accessibilityLabel="Nachricht löschen">
                      <Trash2 size={14} color={Colors.danger} />
                      <Text style={styles.deleteText}>Löschen</Text>
                    </Pressable>
                  )}
                </View>
              </Fragment>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.composerWrap, { paddingHorizontal: pad, paddingBottom: Spacing.md + (wide ? 0 : insets.bottom) }]}>
        {!!error && <Notice tone="error">{error}</Notice>}
        <View style={[styles.composer, glassSurface]}>
          <GlassBackdrop radius={22} />
          <TextInput
            value={text}
            onChangeText={(v) => setText(v.slice(0, MAX))}
            placeholder={other ? `Nachricht an ${title}` : `Nachricht an „${title}“`}
            placeholderTextColor={Colors.textFaint}
            multiline
            onKeyPress={onKeyPress}
            accessibilityLabel="Nachricht"
            style={styles.input}
            selectionColor={Colors.text}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!text.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Senden"
            style={[styles.send, (!text.trim() || sending) && styles.sendOff]}>
            <ArrowUp size={18} color={Colors.onAccent} strokeWidth={2.6} />
          </Pressable>
        </View>
        {Platform.OS === 'web' && wide && <Text style={styles.foot}>Enter zum Senden · Shift + Enter für neue Zeile · eigene Nachricht anklicken zum Löschen</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  clear: { backgroundColor: 'transparent' },
  head: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.border, paddingBottom: Spacing.md },
  inner: { width: '100%', maxWidth: 860, alignSelf: 'center', gap: 6 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', marginBottom: Spacing.xs },
  backText: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headTexts: { flex: 1, gap: 2 },
  title: { color: Colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.3 },
  subtitle: { color: Colors.textMuted, fontSize: 13.5 },
  scroll: { flex: 1 },
  empty: { alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.xxxl, paddingHorizontal: Spacing.xl },
  emptyTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 380 },
  divider: { alignSelf: 'center', color: Colors.textFaint, fontSize: 12, fontWeight: '700', marginVertical: Spacing.md, letterSpacing: 0.3 },
  line: { maxWidth: '82%', gap: 3, marginBottom: 6 },
  lineMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  lineOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', marginLeft: Spacing.sm, marginTop: Spacing.xs },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, gap: 2 },
  bubbleMine: { backgroundColor: 'rgba(47,227,154,0.16)', borderWidth: 1, borderColor: 'rgba(47,227,154,0.32)', borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border, borderBottomLeftRadius: 6 },
  body: { color: Colors.text, fontSize: 15, lineHeight: 21 },
  time: { color: Colors.textFaint, fontSize: 11, alignSelf: 'flex-end' },
  delete: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: Spacing.sm },
  deleteText: { color: Colors.danger, fontSize: 13, fontWeight: '600' },
  composerWrap: { width: '100%', maxWidth: 860 + 2 * Spacing.xxxl, alignSelf: 'center', gap: 6, paddingTop: Spacing.sm },
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
  input: { flex: 1, minHeight: 38, maxHeight: 140, color: Colors.text, fontSize: 15.5, paddingVertical: 9 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.35 },
  foot: { color: Colors.textFaint, fontSize: 11.5, textAlign: 'center' },
});
