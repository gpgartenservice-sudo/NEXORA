import { Check } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Colors } from '@/constants/theme';

type Props = {
  checked: boolean;
  onToggle: () => void;
  label: string;
  size?: number;
};

/**
 * Runder Haken zum Abhaken: füllt sich weiß, das Häkchen springt herein
 * und ein Lichtring breitet sich aus.
 */
export function StepCheck({ checked, onToggle, label, size = 26 }: Props) {
  const fill = useSharedValue(checked ? 1 : 0);
  const pop = useSharedValue(checked ? 1 : 0);
  const ring = useSharedValue(0);
  const hover = useSharedValue(0);
  const first = useRef(true);

  useEffect(() => {
    fill.set(withTiming(checked ? 1 : 0, { duration: 220 }));
    pop.set(checked ? withSpring(1, { damping: 10, stiffness: 300 }) : withTiming(0, { duration: 150 }));
    // Lichtring nur beim echten Abhaken, nicht beim ersten Anzeigen
    if (checked && !first.current) {
      ring.set(0);
      ring.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 650 })));
    }
    first.current = false;
  }, [checked, fill, pop, ring]);

  const circle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(fill.get(), [0, 1], ['rgba(255,255,255,0)', Colors.text]),
    borderColor: interpolateColor(Math.max(fill.get(), hover.get()), [0, 1], [Colors.borderFocus, Colors.text]),
    transform: [{ scale: 1 + 0.08 * hover.get() * (1 - fill.get()) }],
  }));
  const tick = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.get()), transform: [{ scale: pop.get() }] }));
  const ripple = useAnimatedStyle(() => ({
    opacity: ring.get() === 0 ? 0 : 0.6 * (1 - ring.get()),
    transform: [{ scale: 1 + 1.4 * ring.get() }],
  }));

  return (
    <Pressable
      onPress={onToggle}
      hitSlop={8}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      aria-checked={checked}
      accessibilityLabel={label}
      onHoverIn={() => hover.set(withTiming(1, { duration: 150 }))}
      onHoverOut={() => hover.set(withTiming(0, { duration: 200 }))}>
      <View style={{ width: size, height: size }}>
        <Animated.View style={[styles.ring, { borderRadius: size / 2 }, ripple]} />
        <Animated.View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }, circle]}>
          <Animated.View style={tick}>
            <Check size={size * 0.58} color={Colors.background} strokeWidth={3.2} />
          </Animated.View>
        </Animated.View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: { borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderColor: Colors.text,
  },
});
