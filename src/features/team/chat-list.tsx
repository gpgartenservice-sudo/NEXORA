import { router } from 'expo-router';
import { ShieldCheck, Users } from 'lucide-react-native';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { rgbaOf } from '@/constants/accent';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { ROLE_LABEL } from './roles';
import { chatTime, directKey, directPartner, type ChatKey, type ChatSummary } from './staff-logic';
import { CHAT_LABEL, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';

/** Anfangsbuchstaben für den Kreis („Pascal Pape“ → „PP“) */
export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Grün = hat die App gerade offen */
export const ONLINE_GREEN = '#3DDC84';

/** Anfangsbuchstaben einer Person; `color` färbt den Kreis (Gruppen-Chat), `online` = grüner Punkt */
export function PersonDot({ name, size = 40, color, online = false }: { name: string; size?: number; color?: string; online?: boolean }) {
  return (
    <View
      style={[
        styles.dot,
        { width: size, height: size, borderRadius: size / 2 },
        !!color && { backgroundColor: rgbaOf(color, 0.16), borderColor: rgbaOf(color, 0.45) },
      ]}>
      <Text style={[styles.dotText, { fontSize: size * 0.36 }, !!color && { color }]}>{initials(name)}</Text>
      {online && <OnlineDot size={size} />}
    </View>
  );
}

function OnlineDot({ size }: { size: number }) {
  const d = Math.max(9, Math.round(size * 0.27));
  return (
    <View
      accessibilityLabel="online"
      style={[styles.online, { width: d, height: d, borderRadius: d / 2, right: -1, bottom: -1 }]}
    />
  );
}

/** Bild eines Chats: Gruppe (Alle), Schild (Leitung) oder Anfangsbuchstaben der Person */
export function ChatAvatar({ chatKey, name, size = 40, online = false }: { chatKey: ChatKey; name: string; size?: number; online?: boolean }) {
  if (chatKey !== 'alle' && chatKey !== 'leitung') return <PersonDot name={name} size={size} online={online} />;
  const Icon = chatKey === 'alle' ? Users : ShieldCheck;
  return (
    <View style={[styles.dot, chatKey === 'alle' ? styles.groupDot : styles.leadDot, { width: size, height: size, borderRadius: size / 2 }]}>
      <Icon size={size * 0.47} color={Colors.text} strokeWidth={1.9} />
    </View>
  );
}

type Row = { key: ChatKey; title: string; hint: string; summary?: ChatSummary; group: boolean };

/**
 * Team → Chats: Leitung (nur Arbeitgeber), Alle im Team, dann jede Person direkt.
 * Mit `onOpen` (Mac, links neben dem offenen Chat): schmal, ohne Karten, offener Chat markiert.
 */
export function ChatList({ active, onOpen }: { active?: ChatKey; onOpen?: (key: ChatKey) => void } = {}) {
  const { team } = useTeam();
  const access = useAccess();
  const hub = useTeamHub();

  const rows = useMemo<Row[]>(() => {
    const by = new Map(hub.chats.map((c) => [c.chat, c]));
    const groups: Row[] = [];
    if (access.employer)
      groups.push({ key: 'leitung', title: CHAT_LABEL.leitung, hint: 'Nur Inhaber und Mitgründer', summary: by.get('leitung'), group: true });
    groups.push({ key: 'alle', title: CHAT_LABEL.alle, hint: 'Arbeitgeber und Mitarbeiter', summary: by.get('alle'), group: true });
    const direct = (team?.members ?? [])
      .filter((m) => m.id !== hub.me)
      .map<Row>((m) => ({
        key: directKey(m.id),
        title: m.name,
        hint: m.title ? `${ROLE_LABEL[m.role]} · ${m.title}` : ROLE_LABEL[m.role],
        summary: by.get(directKey(m.id)),
        group: false,
      }))
      .sort((a, b) => (b.summary?.at ?? '').localeCompare(a.summary?.at ?? '') || a.title.localeCompare(b.title, 'de'));
    return [...groups, ...direct];
  }, [hub.chats, hub.me, team?.members, access.employer]);

  const now = new Date();
  const groups = rows.filter((r) => r.group);
  const direct = rows.filter((r) => !r.group);

  if (onOpen) {
    const row = (r: Row, i: number) => (
      <ChatRow key={r.key} row={r} now={now} first={i === 0} slim active={r.key === active} onPress={() => onOpen(r.key)} />
    );
    return (
      <View style={styles.slimWrap}>
        {groups.map(row)}
        {direct.length > 0 && <Text style={[styles.section, styles.slimSection]}>DIREKT</Text>}
        {direct.map(row)}
      </View>
    );
  }

  const open = (key: ChatKey) => router.push({ pathname: '/team/chat/[key]', params: { key } });
  return (
    <View style={styles.wrap}>
      <Card>
        {groups.map((r, i) => (
          <ChatRow key={r.key} row={r} now={now} first={i === 0} onPress={() => open(r.key)} />
        ))}
      </Card>
      {direct.length > 0 && (
        <>
          <Text style={styles.section}>DIREKT</Text>
          <Card>
            {direct.map((r, i) => (
              <ChatRow key={r.key} row={r} now={now} first={i === 0} onPress={() => open(r.key)} />
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

function ChatRow({
  row,
  now,
  first,
  onPress,
  slim = false,
  active = false,
}: {
  row: Row;
  now: Date;
  first: boolean;
  onPress: () => void;
  slim?: boolean;
  active?: boolean;
}) {
  const hub = useTeamHub();
  const { hovered, hoverProps } = useHover();
  const s = row.summary;
  const preview = s ? (row.group || s.sender_id === hub.me ? `${hub.nameOf(s.sender_id)}: ${s.body}` : s.body) : row.hint;
  const unread = active ? 0 : (s?.unread ?? 0);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${row.title}${unread ? `, ${unread} ungelesen` : ''}`}
      {...hoverProps}
      style={[
        styles.row,
        slim ? styles.rowSlim : !first && styles.rowBorder,
        hovered && styles.rowHover,
        active && styles.rowActive,
      ]}>
      <ChatAvatar chatKey={row.key} name={row.title} size={slim ? 36 : 40} online={!row.group && hub.online.has(directPartner(row.key) ?? '')} />
      <View style={styles.texts}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {row.title}
          </Text>
          {!!s && <Text style={[styles.time, unread > 0 && styles.timeNew]}>{chatTime(s.at, now)}</Text>}
        </View>
        <View style={styles.titleRow}>
          <Text style={[styles.preview, unread > 0 && styles.previewNew]} numberOfLines={1}>
            {preview}
          </Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  slimWrap: { gap: 2 },
  slimSection: { marginTop: Spacing.md, marginBottom: Spacing.xs, marginLeft: Spacing.sm },
  rowSlim: { marginHorizontal: 0, paddingVertical: 10 },
  rowActive: { backgroundColor: 'rgba(255,255,255,0.075)' },
  section: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: Spacing.xs, marginLeft: Spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, marginHorizontal: -Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: 12 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowHover: { backgroundColor: 'rgba(255,255,255,0.04)' },
  dot: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center' },
  groupDot: { backgroundColor: Colors.accentSoft, borderColor: accentAlpha(0.35) },
  leadDot: { backgroundColor: 'rgba(167,139,250,0.14)', borderColor: 'rgba(167,139,250,0.4)' },
  dotText: { color: Colors.text, fontWeight: '700' },
  online: { position: 'absolute', backgroundColor: ONLINE_GREEN, borderWidth: 2, borderColor: Colors.background },
  texts: { flex: 1, gap: 3, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { flex: 1, color: Colors.text, fontSize: 15.5, fontWeight: '600' },
  time: { color: Colors.textFaint, fontSize: 12 },
  timeNew: { color: Colors.accent, fontWeight: '700' },
  preview: { flex: 1, color: Colors.textMuted, fontSize: 13.5 },
  previewNew: { color: Colors.text },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: Colors.onAccent, fontSize: 11.5, fontWeight: '800' },
});
