import { router } from 'expo-router';
import { Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressBar } from '@/components/ui/progress-bar';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { goalTitle, STATUS_LABEL, type Goal, type GoalProgress } from './goals-logic';

type Props = {
  goal: Goal;
  progress: GoalProgress;
  /** eigene Ziele: Fortschritt um 1 ändern */
  onStep?: (delta: number) => void;
  compact?: boolean;
  delay?: number;
  /** nur Vorschau (nicht anklickbar) */
  preview?: boolean;
};

/** Ziel mit Fortschrittsbalken, Stand und Hinweis – antippen zum Bearbeiten. */
export function GoalCard({ goal, progress: p, onStep, compact, delay = 0, preview }: Props) {
  const { hovered, hoverProps } = useHover();
  const title = goalTitle(goal);
  return (
    <View style={[styles.card, compact && styles.compact]}>
      <Pressable
        onPress={() => router.push(`/aufgaben/ziele/${goal.id}`)}
        disabled={preview}
        accessibilityRole={preview ? undefined : 'link'}
        accessibilityLabel={preview ? undefined : `Ziel ${title} bearbeiten`}
        style={styles.head}
        {...hoverProps}>
        <Text style={[styles.title, hovered && !preview && styles.titleHover]} numberOfLines={2}>
          {title}
        </Text>
        <View
          style={[styles.badge, p.status === 'done' && styles.badgeDone, p.status === 'behind' && styles.badgeBehind]}>
          <Text
            style={[
              styles.badgeText,
              p.status === 'done' && styles.badgeTextDone,
              p.status === 'behind' && styles.badgeTextBehind,
            ]}>
            {STATUS_LABEL[p.status]}
          </Text>
        </View>
      </Pressable>
      <ProgressBar value={p.ratio} delay={delay} />
      <View style={styles.foot}>
        <View style={styles.texts}>
          <Text style={styles.summary} testID="goal-summary">
            {p.summary}
            {p.periodLabel ? <Text style={styles.period}> · {p.periodLabel}</Text> : null}
          </Text>
          {!compact && <Text style={styles.hint}>{p.hint}</Text>}
        </View>
        {onStep && (
          <View style={styles.steps}>
            <StepButton icon="minus" label={`${title}: eins weniger`} onPress={() => onStep(-1)} />
            <StepButton icon="plus" label={`${title}: eins mehr`} onPress={() => onStep(1)} />
          </View>
        )}
      </View>
    </View>
  );
}

function StepButton({ icon, label, onPress }: { icon: 'plus' | 'minus'; label: string; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  const Icon = icon === 'plus' ? Plus : Minus;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={[styles.step, hovered && styles.stepHover]}
      {...hoverProps}>
      <Icon size={15} color={Colors.text} strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
  },
  compact: { padding: Spacing.sm + 2, backgroundColor: 'transparent' },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md },
  title: { color: Colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  titleHover: { textDecorationLine: 'underline' },
  badge: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 2 },
  badgeDone: { borderColor: 'rgba(47,227,154,0.5)', backgroundColor: Colors.accentSoft },
  badgeBehind: { borderColor: 'rgba(255,107,107,0.45)' },
  badgeText: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  badgeTextDone: { color: Colors.accent },
  badgeTextBehind: { color: Colors.danger },
  foot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  texts: { flex: 1, gap: 2 },
  summary: { color: Colors.text, fontSize: 13.5, fontWeight: '500' },
  period: { color: Colors.textFaint, fontWeight: '400' },
  hint: { color: Colors.textMuted, fontSize: 12.5 },
  steps: { flexDirection: 'row', gap: Spacing.xs },
  step: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepHover: { borderColor: Colors.borderFocus },
});
