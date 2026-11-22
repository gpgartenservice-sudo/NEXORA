import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors, accentAlpha } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';

/** Kleiner Auswahl-Knopf (Person, Schicht-Vorlage, Art der Abwesenheit) */
export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={() => {
        playSound('tick');
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      {...hoverProps}
      style={[styles.chip, hovered && styles.hover, active && styles.active]}>
      <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  hover: { borderColor: Colors.borderFocus },
  active: { backgroundColor: Colors.accentSoft, borderColor: accentAlpha(0.55) },
  text: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
  textActive: { color: Colors.text },
});
