import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { formatEuro } from '@/features/crm/order-logic';
import { useFinance } from '@/features/finance/finance-provider';
import { useGoals } from '@/features/goals/goals-provider';
import { GOALS, type Goal } from '@/features/onboarding/options';
import { stepsFor } from '@/features/roadmap/content';
import { useRoadmap } from '@/features/roadmap/roadmap-provider';
import { useTeam } from '@/features/team/team-provider';
import { useProfile } from '@/providers/profile-provider';

import { FOCUS, focusGoalOfDay, GOAL_FOCUS } from './content';
import { monthNumbers } from './money';

const GLOW = require('@/assets/images/glow.png');

/**
 * „Dein Fokus“ – richtet sich nach den Schwerpunkten aus dem Onboarding (wechselt täglich,
 * per Antippen der Schwerpunkte auch direkt). Mit einer echten Zahl aus der App.
 * Ohne Schwerpunkte: Fokus nach Phase wie bisher.
 */
export function FocusCard() {
  const { profile } = useProfile();
  const goals = (profile?.goals ?? []) as Goal[];
  const [picked, setPicked] = useState<Goal | null>(null);
  const goal = picked && goals.includes(picked) ? picked : focusGoalOfDay(goals);
  const metric = useGoalMetric(goal);

  if (!goal) {
    const focus = FOCUS[profile?.stage ?? 'started'];
    return (
      <Card style={styles.fill}>
        <Image source={GLOW} style={styles.glow} contentFit="fill" tintColor={Colors.accent} pointerEvents="none" />
        <Text style={styles.eyebrow}>DEIN FOKUS</Text>
        <View style={styles.head}>
          <Text style={styles.emoji}>{focus.emoji}</Text>
          <Text style={styles.title}>{focus.title}</Text>
        </View>
        <Text style={styles.body}>{focus.text}</Text>
        <View style={styles.action}>
          <Button label="Zum Fahrplan" onPress={() => router.navigate('/fahrplan')} />
        </View>
      </Card>
    );
  }

  const focus = GOAL_FOCUS[goal];
  const text = (profile?.stage && focus.text[profile.stage]) || focus.text.default;

  return (
    <Card style={styles.fill}>
      <Image source={GLOW} style={styles.glow} contentFit="fill" tintColor={Colors.accent} pointerEvents="none" />
      <Text style={styles.eyebrow}>DEIN FOKUS</Text>
      <View style={styles.head}>
        <Text style={styles.emoji}>{focus.emoji}</Text>
        <Text style={styles.title}>{focus.title}</Text>
      </View>
      <Text style={styles.body}>{text}</Text>
      {metric && (
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text style={styles.metricLabel}>{metric.label}</Text>
        </View>
      )}
      <View style={styles.action}>
        <Button label={focus.action.label} onPress={() => router.navigate(focus.action.href)} />
      </View>
      {goals.length > 1 && (
        <View style={styles.chips}>
          {goals.map((g) => {
            const info = GOALS.find((x) => x.key === g);
            const active = g === goal;
            return (
              <Pressable
                key={g}
                onPress={() => setPicked(g)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {info?.emoji} {info?.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

/** Eine passende Zahl zum Schwerpunkt */
function useGoalMetric(goal: Goal | null): { value: string; label: string } | null {
  const { customers, orders } = useCrm();
  const { expenses } = useFinance();
  const { todos } = useGoals();
  const { done } = useRoadmap();
  const { profile } = useProfile();
  const { team } = useTeam();
  if (!goal) return null;
  const month = monthNumbers(orders, expenses);
  switch (goal) {
    case 'first_customers':
      return { value: String(customers.length), label: customers.length === 1 ? 'Kunde bisher' : 'Kunden bisher' };
    case 'more_revenue':
      return { value: formatEuro(month.income), label: 'Umsatz diesen Monat' };
    case 'organization': {
      const open = todos.filter((t) => !t.done).length;
      return { value: String(open), label: open === 1 ? 'offenes To-do' : 'offene To-dos' };
    }
    case 'finances':
      return { value: formatEuro(month.expenses), label: 'Ausgaben diesen Monat eingetragen' };
    case 'motivation': {
      const steps = stepsFor(profile?.stage);
      return { value: `${steps.filter((s) => done.has(s.key)).length}/${steps.length}`, label: 'Schritte im Fahrplan geschafft' };
    }
    case 'team': {
      const n = team?.members.length || 1;
      return { value: String(n), label: n === 1 ? 'Person im Business' : 'Personen im Business' };
    }
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  glow: { position: 'absolute', top: -220, right: -200, width: 520, height: 520, opacity: 0.14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  emoji: { fontSize: 30 },
  title: { color: Colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, flex: 1 },
  body: { color: Colors.textMuted, fontSize: 15, lineHeight: 22 },
  metric: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm },
  metricValue: { color: Colors.accent, fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  metricLabel: { color: Colors.textMuted, fontSize: 14 },
  action: { flexDirection: 'row', marginTop: Spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  chipActive: { borderColor: Colors.accent, backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  chipTextActive: { color: Colors.text },
});
