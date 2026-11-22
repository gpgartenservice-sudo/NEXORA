import { router } from 'expo-router';
import { ArrowRight, CalendarClock, CheckCircle2, MessagesSquare, UserCheck } from 'lucide-react-native';
import { useEffect, useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';
import { supabase } from '@/lib/supabase';

import {
  addDays,
  dayIso,
  dayLabel,
  groupJobs,
  KIND_LABEL,
  myPlanJobs,
  parsePlanSnapshot,
  SHIFT_COLUMNS,
  shiftLabel,
  weekStart,
  type Shift,
  type TeamAbsence,
} from './staff-logic';

import { useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';

/** Eigener Einsatz (aus dem Plan – Mitarbeiter: aus dem fertigen Plan) */
type MyJob = {
  day: string;
  starts_at: string;
  ends_at: string;
  site: string | null;
  note: string | null;
  lead: boolean;
  crew: number;
  order_id?: string | null;
};

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
  const [shifts, setShifts] = useState<MyJob[] | null>(null);
  const [away, setAway] = useState<TeamAbsence[]>([]);
  const today = dayIso(new Date());
  const hr = access.hr;

  useEffect(() => {
    if (!access.inTeam || !ws || !me) return;
    let alive = true;
    const until = addDays(today, 13);
    // Leitung: der aktuelle Plan. Mitarbeiter: nur, was fertiggestellt ist.
    const mine = hr
      ? supabase
          .from('work_shifts')
          .select(SHIFT_COLUMNS)
          .eq('company_id', ws)
          .gte('day', today)
          .lte('day', until)
          .order('day')
          .order('starts_at')
          .then(({ data, error }) =>
            error
              ? []
              : groupJobs((data ?? []) as Shift[])
                  .filter((j) => j.members.includes(me))
                  .map<MyJob>((j) => ({ ...j, lead: j.lead === me, crew: j.members.length })),
          )
      : supabase
          .from('work_plans')
          .select('snapshot')
          .eq('company_id', ws)
          .gte('week_start', weekStart(today))
          .lte('week_start', weekStart(until))
          .then(({ data, error }) =>
            error
              ? []
              : (data ?? [])
                  .map((r) => parsePlanSnapshot(r.snapshot))
                  .flatMap((p) => (p ? myPlanJobs(p, me) : []))
                  .filter((j) => j.day >= today && j.day <= until)
                  .sort((a, b) => a.day.localeCompare(b.day) || a.starts_at.localeCompare(b.starts_at))
                  .map<MyJob>((j) => ({ ...j, lead: j.lead === me, crew: j.members.length })),
          );
    void Promise.all([mine, supabase.rpc('team_absences', { p_from: today, p_to: today })]).then(([jobs, a]) => {
      if (!alive) return;
      setShifts(jobs);
      setAway(Array.isArray(a.data) ? (a.data as TeamAbsence[]) : []);
    });
    return () => {
      alive = false;
    };
  }, [access.inTeam, ws, me, today, hr, hub.absenceVersion, hub.planVersion]);

  if (!access.inTeam || shifts === null) return null;

  const todays = shifts.filter((s) => s.day === today);
  const next = shifts.find((s) => s.day > today);
  const where = (j: MyJob) => [j.site, j.lead && (j.crew > 1 || j.order_id) ? 'du bist Teamleiter' : null].filter(Boolean).join(' · ');
  // Teamleiter mit Auftrag heute: zum Abhaken in den Plan
  const leadOrder = todays.some((j) => j.lead && j.order_id);
  const meAway = away.find((a) => a.member_id === me);
  const others = away.filter((a) => a.member_id !== me);

  const headline = meAway
    ? `Heute: ${KIND_LABEL[meAway.kind]}`
    : todays.length
      ? `Heute ${todays.map(shiftLabel).join(' und ')}`
      : 'Heute kein Einsatz';
  const sub = [
    ...todays.map(where),
    todays.find((s) => s.note)?.note,
    !todays.length && next ? `Nächster Einsatz: ${dayLabel(next.day)} · ${shiftLabel(next)}${next.site ? ` · ${next.site}` : ''}` : null,
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
        {leadOrder && (
          <Chip
            icon={CheckCircle2}
            label="Auftrag abhaken"
            onPress={() => router.navigate({ pathname: '/team', params: { tab: 'plan' } })}
            strong
          />
        )}
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
  chipStrong: { borderColor: accentAlpha(0.45), backgroundColor: Colors.accentSoft },
  chipHover: { borderColor: Colors.borderFocus },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  chipTextStrong: { color: Colors.text },
});
