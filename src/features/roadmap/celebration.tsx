import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = { message: string; onDone: () => void };

const VISIBLE_MS = 2800;

/**
 * Kurze Erfolgsmeldung, die von unten hereinfedert und wieder verschwindet.
 * Die Anzeigedauer läuft über einen Timer – so bleibt sie auch bei
 * "Bewegung reduzieren" lange genug sichtbar.
 */
export function Celebration({ message, onDone }: Props) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.set(0);
    p.set(withSpring(1, { damping: 14, stiffness: 180 }));
    const hide = setTimeout(() => p.set(withTiming(0, { duration: 350 })), VISIBLE_MS);
    const done = setTimeout(onDone, VISIBLE_MS + 400);
    return () => {
      clearTimeout(hide);
      clearTimeout(done);
    };
  }, [message, p, onDone]);

  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.get()),
    transform: [{ translateY: (1 - p.get()) * 40 }, { scale: 0.9 + 0.1 * p.get() }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, style]} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: Spacing.xxl,
    alignSelf: 'center',
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    boxShadow: `0 10px 50px ${Colors.accentGlow}`,
  },
  text: { color: Colors.onAccent, fontSize: 15, fontWeight: '700' },
});
