import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Colors, Spacing } from '@/constants/theme';

type Props = {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Rot statt Grün (z. B. "Storniert") */
  danger?: boolean;
};

/** Schalter mit Beschriftung – der Knopf gleitet federnd zur Seite. */
export function ToggleRow({ label, hint, value, onChange, danger }: Props) {
  const p = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    p.set(withSpring(value ? 1 : 0, { damping: 16, stiffness: 260 }));
  }, [value, p]);

  const on = danger ? Colors.danger : Colors.accent;
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(Math.min(1, Math.max(0, p.get())), [0, 1], [Colors.border, on]),
  }));
  const knob = useAnimatedStyle(() => ({ transform: [{ translateX: p.get() * 18 }] }));

  return (
    <Pressable
      onPress={() => onChange(!value)}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={label}
      style={styles.row}>
      <View style={styles.texts}>
        <Text style={styles.label}>{label}</Text>
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, paddingVertical: Spacing.sm },
  texts: { flex: 1, gap: 2 },
  label: { color: Colors.text, fontSize: 15, fontWeight: '500' },
  hint: { color: Colors.textFaint, fontSize: 13 },
  track: { width: 44, height: 26, borderRadius: 13, padding: 3 },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.text, boxShadow: '0 1px 4px rgba(0,0,0,0.4)' },
});
