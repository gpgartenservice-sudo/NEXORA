import { forwardRef } from 'react';
import { StyleSheet, type TextInputInstance, type TextInputProps } from 'react-native';

import { TextField } from './text-field';

type Props = Omit<TextInputProps, 'onChangeText'> & {
  label?: string;
  error?: string;
  onChangeText: (code: string) => void;
};

/** Eingabe für den Bestätigungscode aus der E-Mail (nur Ziffern). */
export const CodeField = forwardRef<TextInputInstance, Props>(function CodeField(
  { label = 'Code aus der E-Mail', onChangeText, ...props },
  ref,
) {
  return (
    <TextField
      ref={ref}
      label={label}
      placeholder="000000"
      keyboardType="number-pad"
      inputMode="numeric"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      maxLength={10}
      style={styles.code}
      onChangeText={(v) => onChangeText(v.replace(/\D/g, ''))}
      {...props}
    />
  );
});

const styles = StyleSheet.create({
  code: { fontSize: 24, fontWeight: '600', letterSpacing: 8, textAlign: 'center' },
});
