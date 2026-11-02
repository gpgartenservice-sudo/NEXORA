import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { fromLocalInput, toLocalInput, type DateFieldProps } from './date-utils';

/** Web/Mac: Datum bzw. Datum + Uhrzeit mit dem Kalender des Systems. */
export function DateField({ label, value, onChange, withTime, hint }: DateFieldProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, focused && styles.labelFocused]}>{label}</Text>
      <input
        type={withTime ? 'datetime-local' : 'date'}
        aria-label={label}
        value={toLocalInput(value, withTime)}
        onChange={(e) => onChange(fromLocalInput(e.target.value, withTime))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          height: 52,
          borderRadius: Radius.md,
          border: `1px solid ${focused ? Colors.borderFocus : Colors.border}`,
          background: focused ? Colors.surfaceRaised : Colors.surface,
          color: value ? Colors.text : Colors.textFaint,
          padding: `0 ${Spacing.lg}px`,
          fontSize: 16,
          fontFamily: 'inherit',
          colorScheme: 'dark',
          outline: 'none',
          boxShadow: focused ? '0 0 0 4px rgba(255,255,255,0.06)' : 'none',
          transition: 'border-color .2s, background .2s, box-shadow .2s',
        }}
      />
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  labelFocused: { color: Colors.text },
  hint: { color: Colors.textFaint, fontSize: 13 },
});
