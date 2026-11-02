import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const { hovered, hoverProps } = useHover();
  const primary = variant === 'primary';
  const inactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      {...hoverProps}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.secondary,
        hovered && !inactive && (primary ? styles.primaryHover : styles.secondaryHover),
        pressed && styles.pressed,
        disabled && !loading && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={primary ? Colors.buttonPrimaryText : Colors.text} />
      ) : (
        <Text style={[styles.label, primary ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: Colors.buttonPrimary },
  primaryHover: { opacity: 0.92 },
  secondary: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface },
  secondaryHover: { borderColor: Colors.borderFocus },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.4 },
  label: { fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
  primaryLabel: { color: Colors.buttonPrimaryText },
  secondaryLabel: { color: Colors.text },
});
