import { forwardRef, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { EASE_OUT_EXPO } from '@/components/motion/reveal';
import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** Kleiner Hinweis unter dem Feld (wird durch einen Fehler ersetzt) */
  hint?: string;
  /** Optionales Element rechts im Feld, z. B. "Anzeigen" beim Passwort. */
  trailing?: ReactNode;
};

/**
 * Eingabefeld mit Effekten: beim Fokus leuchtet der Rahmen auf und ein
 * weicher Lichtschein erscheint, bei einem Fehler wackelt das Feld kurz.
 */
export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, hint, trailing, style, onFocus, onBlur, ...inputProps },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const focus = useSharedValue(0);
  const shake = useSharedValue(0);
  const message = useSharedValue(0);
  const hasError = !!error;

  useEffect(() => {
    focus.set(withTiming(focused ? 1 : 0, { duration: 260, easing: EASE_OUT_EXPO }));
  }, [focused, focus]);

  useEffect(() => {
    if (!error) {
      message.set(0);
      return;
    }
    message.set(withTiming(1, { duration: 420, easing: EASE_OUT_EXPO }));
    shake.set(
      withSequence(
        withTiming(-7, { duration: 45 }),
        withTiming(7, { duration: 70 }),
        withTiming(-5, { duration: 70 }),
        withTiming(4, { duration: 70 }),
        withTiming(0, { duration: 60 }),
      ),
    );
  }, [error, message, shake]);

  const fieldStyle = useAnimatedStyle(() => ({
    borderColor: hasError
      ? Colors.danger
      : interpolateColor(focus.get(), [0, 1], [Colors.border, Colors.borderFocus]),
    backgroundColor: interpolateColor(focus.get(), [0, 1], [Colors.surface, Colors.surfaceRaised]),
    transform: [{ translateX: shake.get() }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: focus.get(),
    transform: [{ translateX: shake.get() }, { scale: 0.98 + 0.02 * focus.get() }],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: hasError ? Colors.danger : interpolateColor(focus.get(), [0, 1], [Colors.textMuted, Colors.text]),
  }));

  const messageStyle = useAnimatedStyle(() => ({
    opacity: message.get(),
    transform: [{ translateY: (1 - message.get()) * -6 }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.Text style={[styles.label, labelStyle]}>{label}</Animated.Text>
      <View>
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, hasError ? styles.glowError : styles.glowFocus, glowStyle]}
        />
        <Animated.View style={[styles.field, fieldStyle]}>
          <TextInput
            ref={ref}
            placeholderTextColor={Colors.textFaint}
            selectionColor={Colors.text}
            cursorColor={Colors.text}
            style={[styles.input, style]}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...inputProps}
          />
          {trailing}
        </Animated.View>
      </View>
      {error ? (
        <Animated.Text style={[styles.error, messageStyle]} accessibilityLiveRegion="polite">
          {error}
        </Animated.Text>
      ) : (
        !!hint && <Animated.Text style={styles.hint}>{hint}</Animated.Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  label: { fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
  },
  glow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.md,
  },
  glowFocus: {
    boxShadow: '0 0 0 4px rgba(255,255,255,0.06), 0 10px 32px rgba(255,255,255,0.07)',
  },
  glowError: {
    boxShadow: '0 0 0 4px rgba(255,107,107,0.10), 0 10px 32px rgba(255,107,107,0.08)',
  },
  input: { flex: 1, height: '100%', color: Colors.text, fontSize: 16 },
  error: { color: Colors.danger, fontSize: 13 },
  hint: { color: Colors.textFaint, fontSize: 13 },
});
