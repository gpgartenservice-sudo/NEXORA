import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { EASE_OUT_EXPO } from '@/components/motion/reveal';
import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = {
  title: string;
  description?: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  /** Mehrfachauswahl (Häkchen-Kästchen) statt Einfachauswahl (Kreis) */
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
};

const SPRING = { damping: 16, stiffness: 380, mass: 0.6 };

/**
 * Auswahlkarte fürs Onboarding: hebt sich beim Darüberfahren an, federt
 * beim Antippen, leuchtet ausgewählt auf und das Häkchen "ploppt" herein.
 */
export function OptionCard({ title, description, emoji, selected, onPress, multiple, disabled, compact }: Props) {
  const press = useSharedValue(0);
  const hover = useSharedValue(0);
  const active = useSharedValue(selected ? 1 : 0);
  const check = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    active.set(withTiming(selected ? 1 : 0, { duration: 280, easing: EASE_OUT_EXPO }));
    check.set(selected ? withSpring(1, { damping: 11, stiffness: 320 }) : withTiming(0, { duration: 160 }));
  }, [selected, active, check]);

  const cardStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(Math.max(active.get(), hover.get() * 0.5), [0, 1], [Colors.border, Colors.accent]),
    backgroundColor: interpolateColor(active.get(), [0, 1], [Colors.surface, Colors.surfaceRaised]),
    transform: [{ translateY: -2 * hover.get() }, { scale: 1 - 0.025 * press.get() }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: active.get(),
    transform: [{ translateY: -2 * hover.get() }, { scale: 1 - 0.025 * press.get() }],
  }));
  const emojiStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + 0.12 * check.get() }, { rotate: `${-8 * check.get()}deg` }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, check.get()),
    transform: [{ scale: check.get() }],
  }));

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected, disabled }}
      aria-checked={selected}
      aria-disabled={disabled}
      accessibilityLabel={description ? `${title}. ${description}` : title}
      onPressIn={() => press.set(withSpring(1, SPRING))}
      onPressOut={() => press.set(withSpring(0, SPRING))}
      onHoverIn={() => hover.set(withTiming(1, { duration: 200 }))}
      onHoverOut={() => hover.set(withTiming(0, { duration: 240 }))}
      style={disabled && !selected ? styles.disabled : undefined}>
      <Animated.View pointerEvents="none" style={[styles.glow, glowStyle]} />
      <Animated.View style={[styles.card, compact && styles.cardCompact, cardStyle]}>
        {!!emoji && <Animated.Text style={[styles.emoji, compact && styles.emojiCompact, emojiStyle]}>{emoji}</Animated.Text>}
        <View style={styles.texts}>
          <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
          {!!description && <Text style={styles.description}>{description}</Text>}
        </View>
        <View style={[styles.indicator, multiple ? styles.box : styles.circle]}>
          <Animated.View style={[styles.indicatorFill, multiple ? styles.boxFill : styles.circleFill, checkStyle]}>
            <Text style={styles.checkmark}>✓</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
  },
  cardCompact: { paddingVertical: 14 },
  glow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.lg,
    boxShadow: '0 0 0 3px rgba(47,227,154,0.12), 0 12px 36px rgba(47,227,154,0.14)',
  },
  emoji: { fontSize: 28 },
  emojiCompact: { fontSize: 22 },
  texts: { flex: 1, gap: 2 },
  title: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  titleCompact: { fontSize: 15 },
  description: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  indicator: {
    width: 22,
    height: 22,
    borderWidth: 1.5,
    borderColor: Colors.borderFocus,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circle: { borderRadius: 11 },
  box: { borderRadius: 6 },
  indicatorFill: {
    position: 'absolute',
    top: -1.5,
    left: -1.5,
    width: 22,
    height: 22,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleFill: { borderRadius: 11 },
  boxFill: { borderRadius: 6 },
  checkmark: { color: Colors.onAccent, fontSize: 13, fontWeight: '800', marginTop: -1 },
  disabled: { opacity: 0.45 },
});
