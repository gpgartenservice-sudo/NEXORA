import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { EASE_OUT_EXPO } from '@/components/motion/reveal';
import { Colors } from '@/constants/theme';

type Props = {
  /** 0 bis 1 */
  value: number;
  height?: number;
  delay?: number;
};

/** Fortschrittsbalken, der sich weich auffüllt und leicht leuchtet. */
export function ProgressBar({ value, height = 6, delay = 0 }: Props) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withDelay(delay, withTiming(Math.max(0, Math.min(1, value)), { duration: 900, easing: EASE_OUT_EXPO })));
  }, [value, delay, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(1, value)) * 100)}>
      <Animated.View style={[styles.fill, { borderRadius: height / 2 }, fill]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', backgroundColor: Colors.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Colors.accent, boxShadow: `0 0 14px ${Colors.accentGlow}` },
});
