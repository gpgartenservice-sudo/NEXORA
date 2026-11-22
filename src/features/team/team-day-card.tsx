import { router } from 'expo-router';
import { ArrowRight, CalendarClock, MessagesSquare, UserCheck } from 'lucide-react-native';
import { useEffect, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';
import { supabase } from '@/lib/supabase';

import { addDays, dayIso, dayLabel, KIND_LABEL, shiftLabel, type Shift, type TeamAbsence } from './staff-logic';
import { useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

/**
 * Startseite im Team: deine Schicht heute (oder die nächste), wer heute fehlt,
 * neue Nachrichten und – für die Leitung – offene Anträge.
 */
export function TeamDayCard() {
  const access = useAccess();
  const { team } = useTeam();
  const hub = useTeamHub();
  const ws = team?.owner_id ?? '';
  const me = hub.me;
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [away, setAway] = useState<TeamAbsence[]>([]);
  const today = dayIso(new Date());

  useEffect(() => {
    if (!access.inTeam || !ws || !me) return;
    let alive = true;
    void Promise.all([
      supabase
        .from('work_shifts')
        .select('id, member_id, day, starts_at, ends_at, note')
        .eq('company_id', ws)
        .eq('member_id', me)
        .gte('day', today)
        .lte('day', addDays(today, 13))
        .order('day')
        .order('starts_at'),
      supabase.rpc('team_absences', { p_from: today, p_to: today }),
    ]).then(([s, a]) => {
      if (!alive) return;
      setShifts(s.error ? [] : ((s.data ?? []) as Shift[]));
      setAway(Array.isArray(a.data) ? (a.data as TeamAbsence[]) : []);
    });
    return () => {
      alive = false;
    };
  }, [access.inTeam, ws, me, today, hub.absenceVersion]);

  if (!access.inTeam || shifts === null) return null;

  const todays = shifts.filter((s) => s.day === today);
  const next = shifts.find((s) => s.day > today);
  const meAway = away.find((a) => a.member_id === me);
  const others = away.filter((a) => a.member_id !== me);

  const headline = meAway
    ? `Heute: ${KIND_LABEL[meAway.kind]}`
    : todays.length
      ? `Heute ${todays.map(shiftLabel).join(' und ')}`
      : 'Heute keine Schicht';
  const sub = [
    todays.find((s) => s.note)?.note,
    !todays.length && next ? `Nächste: ${dayLabel(next.day)} · ${shiftLabel(next)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      <Pressable onPress={() => router.navigate({ pathname: '/team', params: { tab: 'plan' } })} accessibilityRole="link" style={styles.head}>
        <Text style={styles.eyebrow}>DEIN TAG IM TEAM</Text>
        <ArrowRight size={14} color={Colors.textMuted} />
      </Pressable>
      <Text style={styles.title}>{headline}</Text>
      {!!sub && <Text style={styles.sub}>{sub}</Text>}
      <View style={styles.chips}>
        {hub.unread > 0 && (
          <Chip icon={MessagesSquare} label={`${hub.unread} ${hub.unread === 1 ? 'neue Nachricht' : 'neue Nachrichten'}`} onPress={() => router.navigate('/team')} strong />
        )}
        {access.hr && hub.openRequests > 0 && (
          <Chip
            icon={UserCheck}
            label={`${hub.openRequests} ${hub.openRequests === 1 ? 'Antrag wartet' : 'Anträge warten'}`}
            onPress={() => router.navigate({ pathname: '/team', params: { tab: 'urlaub' } })}
            strong
          />
        )}
        {others.length > 0 && (
          <Chip
            icon={CalendarClock}
            label={`Heute weg: ${others.map((a) => `${hub.nameOf(a.member_id)}${access.hr ? ` (${KIND_LABEL[a.kind]})` : ''}`).join(', ')}`}
            onPress={() => router.navigate({ pathname: '/team', params: { tab: 'plan' } })}
          />
        )}
      </View>
    </Card>
  );
}

function Chip({ icon: Icon, label, onPress, strong }: { icon: Icon; label: string; onPress: () => void; strong?: boolean }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" {...hoverProps} style={[styles.chip, strong && styles.chipStrong, hovered && styles.chipHover]}>
      <Icon size={14} color={strong ? Colors.accent : Colors.textMuted} strokeWidth={2} />
      <Text style={[styles.chipText, strong && styles.chipTextStrong]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: Colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  sub: { color: Colors.textMuted, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: '100%',
  },
  chipStrong: { borderColor: 'rgba(47,227,154,0.45)', backgroundColor: Colors.accentSoft },
  chipHover: { borderColor: Colors.borderFocus },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  chipTextStrong: { color: Colors.text },
});
