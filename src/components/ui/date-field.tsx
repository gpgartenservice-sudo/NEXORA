import { useState } from 'react';

import { TextField } from '@/components/auth/text-field';

import { fromGermanInput, toGermanInput, type DateFieldProps } from './date-utils';

/**
 * Datum / Datum + Uhrzeit (Handy). Eingabe als "TT.MM.JJJJ" bzw.
 * "TT.MM.JJJJ HH:MM". Im Web/auf dem Mac gibt es stattdessen den
 * Kalender des Systems (date-field.web.tsx).
 */
export function DateField({ label, value, onChange, withTime, hint }: DateFieldProps) {
  const [text, setText] = useState(toGermanInput(value, withTime));
  const [error, setError] = useState<string>();

  return (
    <TextField
      label={label}
      value={text}
      hint={hint}
      error={error}
      placeholder={withTime ? 'TT.MM.JJJJ HH:MM' : 'TT.MM.JJJJ'}
      keyboardType="numbers-and-punctuation"
      onChangeText={(t) => {
        setText(t);
        setError(undefined);
      }}
      onBlur={() => {
        const parsed = fromGermanInput(text, withTime);
        if (parsed === 'invalid') {
          setError(withTime ? 'Bitte als TT.MM.JJJJ HH:MM eingeben.' : 'Bitte als TT.MM.JJJJ eingeben.');
          return;
        }
        onChange(parsed);
      }}
    />
  );
}
