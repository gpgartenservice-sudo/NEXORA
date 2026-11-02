import { Pressable, StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';

import { Colors } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

type Props = {
  label: string;
  onPress: () => void;
  emphasis?: boolean;
  disabled?: boolean;
  style?: StyleProp<TextStyle>;
};

export function TextLink({ label, onPress, emphasis, disabled, style }: Props) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="link" hitSlop={6} {...hoverProps}>
      <Text
        style={[
          styles.link,
          emphasis && styles.emphasis,
          hovered && !disabled && (emphasis ? styles.emphasisHover : styles.hover),
          disabled && styles.disabled,
          style,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { color: Colors.textMuted, fontSize: 14, fontWeight: '500' },
  hover: { color: Colors.text },
  emphasis: { color: Colors.text, fontWeight: '600' },
  emphasisHover: { textDecorationLine: 'underline' },
  disabled: { opacity: 0.45 },
});
