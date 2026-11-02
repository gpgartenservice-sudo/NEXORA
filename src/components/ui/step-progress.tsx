import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { EASE_OUT_EXPO } from '@/components/motion/reveal';
import { Colors } from '@/constants/theme';

type Props = { steps: number; current: number };

/** Fortschrittsbalken aus Segmenten – das aktuelle Segment füllt sich animiert. */
export function StepProgress({ steps, current }: Props) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: steps, now: current + 1 }}
      accessibilityLabel={`Schritt ${current + 1} von ${steps}`}>
      {Array.from({ length: steps }, (_, i) => (
        <Segment key={i} filled={i <= current} />
      ))}
    </View>
  );
}

function Segment({ filled }: { filled: boolean }) {
  const p = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(filled ? 1 : 0, { duration: 600, easing: EASE_OUT_EXPO }));
  }, [filled, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View style={styles.track}>
      <Animated.View style={[styles.fill, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2, backgroundColor: Colors.text, boxShadow: '0 0 12px rgba(255,255,255,0.5)' },
});
