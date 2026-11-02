import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { EASE_OUT_EXPO } from '@/components/motion/reveal';
import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
  /** Optional: Button o. Ä. unter dem Text */
  action?: ReactNode;
};

/** Hinweisbox für Fehler, Erfolgsmeldungen und Infos – erscheint weich, Fehler wackeln kurz. */
export function Notice({ tone = 'info', children, action }: Props) {
  const appear = useSharedValue(0);
  const shake = useSharedValue(0);
  const text = typeof children === 'string' ? children : '';

  useEffect(() => {
    appear.set(0);
    appear.set(withTiming(1, { duration: 520, easing: EASE_OUT_EXPO }));
    if (tone === 'error') {
      shake.set(
        withSequence(
          withTiming(-6, { duration: 45 }),
          withTiming(6, { duration: 70 }),
          withTiming(-4, { duration: 70 }),
          withTiming(0, { duration: 60 }),
        ),
      );
    }
    // bei jeder neuen Meldung erneut abspielen
  }, [text, tone, appear, shake]);

  const animated = useAnimatedStyle(() => ({
    opacity: appear.get(),
    transform: [
      { translateY: (1 - appear.get()) * 8 },
      { translateX: shake.get() },
      { scale: 0.97 + 0.03 * appear.get() },
    ],
  }));

  return (
    <Animated.View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.box, tone === 'error' && styles.error, tone === 'success' && styles.success, animated]}>
      <Text style={[styles.text, tone === 'error' && styles.errorText, tone === 'success' && styles.successText]}>
        {children}
      </Text>
      {action}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
  },
  error: { borderColor: 'rgba(255,107,107,0.35)', backgroundColor: 'rgba(255,107,107,0.08)' },
  success: { borderColor: 'rgba(255,255,255,0.25)', boxShadow: '0 8px 30px rgba(255,255,255,0.06)' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  errorText: { color: Colors.danger },
  successText: { color: Colors.text },
});
