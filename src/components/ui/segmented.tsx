import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';

import { GlassBackdrop, HAS_GLASS, glassSurface } from './glass';

type Props<T extends string> = {
  label?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
};

/** Umschalter zwischen wenigen Möglichkeiten (z. B. Einmalig / Monatlich). */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <View style={styles.wrap}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.row, glassSurface]} accessibilityRole="radiogroup" accessibilityLabel={label}>
        <GlassBackdrop radius={Radius.md} />
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => {
                if (!active) playSound('tick');
                onChange(o.value);
              }}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: active }}
              aria-checked={active}
              style={[styles.item, active && (HAS_GLASS ? styles.itemActiveGlass : styles.itemActive)]}>
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  row: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 4,
    gap: 4,
  },
  item: { flex: 1, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  itemActive: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.borderFocus },
  // auf Liquid Glass: helle Glas-Pille statt dunkler Fläche
  itemActiveGlass: { backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
  itemText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600' },
  itemTextActive: { color: Colors.text },
});
