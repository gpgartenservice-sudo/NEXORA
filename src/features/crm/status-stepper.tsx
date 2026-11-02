import { useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Colors, Spacing } from '@/constants/theme';

import { PIPELINE, type OrderStatus } from './order-logic';

/** Fortschritt des Auftrags durch alle Stationen – die aktuelle leuchtet. */
export function StatusStepper({ status }: { status: OrderStatus }) {
  const current = PIPELINE.findIndex((s) => s.key === status);
  const cancelled = status === 'cancelled';

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {PIPELINE.map((stage, i) => {
        const done = !cancelled && i < current;
        const active = !cancelled && i === current;
        return (
          <View key={stage.key} style={styles.item}>
            <View style={styles.track}>
              <View style={[styles.line, i === 0 && styles.hidden, (done || active) && styles.lineDone]} />
              <Dot done={done} active={active} />
              <View style={[styles.line, i === PIPELINE.length - 1 && styles.hidden, done && styles.lineDone]} />
            </View>
            <Text style={[styles.label, (done || active) && styles.labelOn, active && styles.labelActive]} numberOfLines={2}>
              {stage.label}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Dot({ done, active }: { done: boolean; active: boolean }) {
  const scale = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    scale.set(withSpring(active ? 1 : 0, { damping: 12, stiffness: 220 }));
  }, [active, scale]);
  const pulse = useAnimatedStyle(() => ({ opacity: scale.get(), transform: [{ scale: 0.6 + 0.6 * scale.get() }] }));
  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.halo, pulse]} />
      <View style={[styles.dot, (done || active) && styles.dotOn]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: Spacing.sm },
  item: { width: 104, alignItems: 'center', gap: Spacing.sm },
  track: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 2, backgroundColor: Colors.border },
  lineDone: { backgroundColor: Colors.accent },
  hidden: { opacity: 0 },
  dotWrap: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.accentSoft, borderWidth: 1, borderColor: Colors.accent },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.border },
  dotOn: { backgroundColor: Colors.accent },
  label: { color: Colors.textFaint, fontSize: 12, textAlign: 'center', paddingHorizontal: 4 },
  labelOn: { color: Colors.textMuted },
  labelActive: { color: Colors.text, fontWeight: '600' },
});
