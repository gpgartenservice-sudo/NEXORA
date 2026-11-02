import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Macht die Karte klickbar – mit Hover- und Drück-Effekt */
  onPress?: () => void;
  accessibilityLabel?: string;
};

/** Karte für Inhalte. Klickbare Karten heben sich unter der Maus und federn beim Drücken. */
export function Card({ children, style, onPress, accessibilityLabel }: Props) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <PressableCard style={style} onPress={onPress} accessibilityLabel={accessibilityLabel}>
      {children}
    </PressableCard>
  );
}

function PressableCard({ children, style, onPress, accessibilityLabel }: Props & { onPress: () => void }) {
  const hover = useSharedValue(0);
  const press = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    borderColor: interpolateColor(hover.get(), [0, 1], [Colors.border, '#3A3A40']),
    transform: [{ translateY: -3 * hover.get() }, { scale: 1 - 0.015 * press.get() }],
    boxShadow: `0 ${14 * hover.get()}px ${40 * hover.get()}px rgba(255,255,255,${0.06 * hover.get()})`,
  }));
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onHoverIn={() => hover.set(withTiming(1, { duration: 200 }))}
      onHoverOut={() => hover.set(withTiming(0, { duration: 260 }))}
      onPressIn={() => press.set(withSpring(1, { damping: 18, stiffness: 420 }))}
      onPressOut={() => press.set(withSpring(0, { damping: 18, stiffness: 420 }))}
      style={style}>
      <Animated.View style={[styles.card, styles.fill, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    gap: Spacing.md,
    overflow: 'hidden',
  },
  fill: { flexGrow: 1 },
});
