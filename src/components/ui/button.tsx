import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { Colors, Radius } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

const PRESS_SPRING = { damping: 18, stiffness: 420, mass: 0.6 };

/**
 * Button mit Effekten: federt beim Drücken leicht ein, hebt sich beim
 * Darüberfahren mit der Maus an und leuchtet (Hauptbutton) weich auf.
 */
export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const primary = variant === 'primary';
  const inactive = !!(disabled || loading);
  const press = useSharedValue(0);
  const hover = useSharedValue(0);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -1.5 * hover.get() }, { scale: 1 - 0.03 * press.get() }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: hover.get() * (1 - 0.5 * press.get()) }));

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      onPressIn={() => press.set(withSpring(1, PRESS_SPRING))}
      onPressOut={() => press.set(withSpring(0, PRESS_SPRING))}
      onHoverIn={() => !inactive && hover.set(withTiming(1, { duration: 220 }))}
      onHoverOut={() => hover.set(withTiming(0, { duration: 260 }))}
      style={[styles.outer, disabled && !loading && styles.disabled, style]}>
      <Animated.View style={bodyStyle}>
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, primary ? styles.glowPrimary : styles.glowSecondary, glowStyle]}
        />
        <Animated.View style={[styles.base, primary ? styles.primary : styles.secondary]}>
          {loading ? (
            <ActivityIndicator color={primary ? Colors.buttonPrimaryText : Colors.text} />
          ) : (
            <Text style={[styles.label, primary ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {},
  base: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: Colors.buttonPrimary },
  secondary: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  glow: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: Radius.md },
  glowPrimary: { boxShadow: '0 0 0 1px rgba(255,255,255,0.35), 0 10px 40px rgba(255,255,255,0.28)' },
  glowSecondary: { boxShadow: '0 0 0 1px rgba(255,255,255,0.18), 0 8px 28px rgba(255,255,255,0.08)' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  primaryLabel: { color: Colors.buttonPrimaryText },
  secondaryLabel: { color: Colors.text },
});
