import type { ComponentType } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

type Props = {
  label: string;
  onPress: () => void;
  icon?: ComponentType<IconProps>;
  /** Name für Bedienhilfen, falls er genauer sein soll als die Beschriftung */
  accessibilityLabel?: string;
  disabled?: boolean;
  /** Hervorgehoben, z. B. wenn das zugehörige Feld aufgeklappt ist */
  active?: boolean;
};

/** Kleiner Knopf mit Symbol, z. B. "PDF" oder "Senden" in einer Liste. */
export function ActionChip({ label, onPress, icon: Icon, accessibilityLabel, disabled, active }: Props) {
  const { hovered, hoverProps } = useHover();
  const color = active ? Colors.accent : Colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      aria-expanded={active}
      {...hoverProps}
      style={[styles.chip, hovered && !disabled && styles.hover, active && styles.active, disabled && styles.disabled]}>
      {Icon && <Icon size={15} color={color} strokeWidth={1.9} />}
      <Text style={[styles.text, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hover: { borderColor: Colors.borderFocus },
  active: { borderColor: 'rgba(47,227,154,0.45)', backgroundColor: Colors.accentSoft },
  disabled: { opacity: 0.45 },
  text: { fontSize: 13, fontWeight: '600' },
});
