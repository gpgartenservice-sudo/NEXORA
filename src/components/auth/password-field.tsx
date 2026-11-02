import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, Text, type TextInputInstance, type TextInputProps } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { TextField } from './text-field';

type Props = TextInputProps & { label: string; error?: string; hint?: string };

/** Passwortfeld mit "Anzeigen/Verbergen". */
export const PasswordField = forwardRef<TextInputInstance, Props>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  const { hovered, hoverProps } = useHover();

  return (
    <TextField
      ref={ref}
      placeholder="••••••••"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      secureTextEntry={!visible}
      trailing={
        <Pressable
          onPress={() => setVisible((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Passwort verbergen' : 'Passwort anzeigen'}
          {...hoverProps}>
          <Text style={[styles.toggle, hovered && styles.toggleHover]}>{visible ? 'Verbergen' : 'Anzeigen'}</Text>
        </Pressable>
      }
    />
  );
});

const styles = StyleSheet.create({
  toggle: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', paddingLeft: Spacing.md },
  toggleHover: { color: Colors.text },
});
