import { ChevronDown, Target } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { EASE_OUT_EXPO } from '@/components/motion/reveal';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Goal } from '@/features/onboarding/options';

import type { RoadmapStep } from './content';
import { StepCheck } from './step-check';

type Props = {
  step: RoadmapStep;
  done: boolean;
  onToggle: () => void;
  userGoals: Goal[];
  /** Nächster offener Schritt – leicht hervorgehoben */
  isNext?: boolean;
};

/** Ein Schritt im Fahrplan: abhaken, aufklappen für "Warum" und "So geht's". */
export function StepRow({ step, done, onToggle, userGoals, isNext }: Props) {
  const [open, setOpen] = useState(false);
  const expand = useSharedValue(0);
  const hover = useSharedValue(0);
  const matchesGoal = step.goals?.some((g) => userGoals.includes(g));

  useEffect(() => {
    expand.set(withTiming(open ? 1 : 0, { duration: 380, easing: EASE_OUT_EXPO }));
  }, [open, expand]);

  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${expand.get() * 180}deg` }] }));
  const details = useAnimatedStyle(() => ({ opacity: expand.get(), transform: [{ translateY: (1 - expand.get()) * -6 }] }));
  const rowBg = useAnimatedStyle(() => ({ backgroundColor: `rgba(255,255,255,${0.035 * hover.get()})` }));

  return (
    <Animated.View style={[styles.row, isNext && !done && styles.rowNext, rowBg]}>
      <View style={styles.head}>
        <StepCheck checked={done} onToggle={onToggle} label={step.title} />
        <Pressable
          style={styles.titleArea}
          onPress={() => setOpen((o) => !o)}
          onHoverIn={() => hover.set(withTiming(1, { duration: 150 }))}
          onHoverOut={() => hover.set(withTiming(0, { duration: 200 }))}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${step.title} – Details ${open ? 'zuklappen' : 'aufklappen'}`}>
          <View style={styles.titleTexts}>
            <Text style={[styles.title, done && styles.titleDone]}>{step.title}</Text>
            {(matchesGoal || (isNext && !done)) && (
              <View style={styles.badges}>
                {isNext && !done && (
                  <View style={[styles.badge, styles.badgeNext]}>
                    <Text style={styles.badgeNextText}>Als Nächstes</Text>
                  </View>
                )}
                {matchesGoal && (
                  <View style={styles.badge}>
                    <Target size={11} color={Colors.textMuted} strokeWidth={2.2} />
                    <Text style={styles.badgeText}>Passt zu deinem Ziel</Text>
                  </View>
                )}
              </View>
            )}
          </View>
          <Animated.View style={chevron}>
            <ChevronDown size={18} color={Colors.textFaint} />
          </Animated.View>
        </Pressable>
      </View>

      {open && (
        <Animated.View style={[styles.details, details]}>
          <Text style={styles.why}>{step.why}</Text>
          <Text style={styles.howTitle}>So geht&apos;s</Text>
          {step.tips.map((tip) => (
            <View key={tip} style={styles.tip}>
              <View style={styles.dot} />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </Animated.View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: Radius.md, paddingVertical: Spacing.md, paddingHorizontal: Spacing.md },
  rowNext: { borderWidth: 1, borderColor: 'rgba(47,227,154,0.35)', boxShadow: '0 0 30px rgba(47,227,154,0.08)' },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },
  titleArea: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, minHeight: 26 },
  titleTexts: { flex: 1, gap: 6, paddingTop: 2 },
  title: { color: Colors.text, fontSize: 15.5, fontWeight: '500', lineHeight: 22 },
  titleDone: { color: Colors.textFaint, textDecorationLine: 'line-through' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '500' },
  badgeNext: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  badgeNextText: { color: Colors.onAccent, fontSize: 11.5, fontWeight: '700' },
  details: { marginLeft: 26 + Spacing.md, marginTop: Spacing.md, gap: Spacing.sm },
  why: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 22 },
  howTitle: { color: Colors.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.3, marginTop: Spacing.xs },
  tip: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Colors.textMuted, marginTop: 8 },
  tipText: { color: Colors.text, fontSize: 14.5, lineHeight: 22, flex: 1 },
});
