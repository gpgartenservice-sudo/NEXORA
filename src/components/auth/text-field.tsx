import { forwardRef, useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputInstance,
  type TextInputProps,
} from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = TextInputProps & {
  label: string;
  error?: string;
  /** Kleiner Hinweis unter dem Feld (wird durch einen Fehler ersetzt) */
  hint?: string;
  /** Optionales Element rechts im Feld, z. B. "Anzeigen" beim Passwort. */
  trailing?: ReactNode;
};

export const TextField = forwardRef<TextInputInstance, Props>(function TextField(
  { label, error, hint, trailing, style, onFocus, onBlur, ...inputProps },
  ref,
) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[
          styles.field,
          focused && styles.fieldFocused,
          !!error && styles.fieldError,
        ]}>
        <TextInput
          ref={ref}
          placeholderTextColor={Colors.textFaint}
          selectionColor={Colors.text}
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
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : (
        !!hint && <Text style={styles.hint}>{hint}</Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
  },
  fieldFocused: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
  fieldError: { borderColor: Colors.danger },
  input: { flex: 1, height: '100%', color: Colors.text, fontSize: 16 },
  error: { color: Colors.danger, fontSize: 13 },
  hint: { color: Colors.textFaint, fontSize: 13 },
});
