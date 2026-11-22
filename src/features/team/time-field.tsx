import { useState } from 'react';

import { TextField } from '@/components/auth/text-field';

import { parseTime } from './staff-logic';

/** Uhrzeit „HH:MM“ – tippen wie man mag („8“, „1630“, „16.30“), beim Verlassen wird sie ordentlich. */
export function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [error, setError] = useState<string>();
  // Wert von außen geändert (z. B. Vorlage „Früh“): Feld nachziehen
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return (
    <TextField
      label={label}
      value={text}
      error={error}
      placeholder="08:00"
      keyboardType="numbers-and-punctuation"
      maxLength={5}
      onChangeText={(t) => {
        setText(t);
        setError(undefined);
        const parsed = /^\d{1,2}[:.]\d{2}$/.test(t.trim()) ? parseTime(t) : null;
        if (parsed) onChange(parsed);
      }}
      onBlur={() => {
        const parsed = parseTime(text);
        if (!parsed) {
          setError('Bitte als HH:MM eingeben, z. B. 08:00.');
          return;
        }
        setText(parsed);
        onChange(parsed);
      }}
    />
  );
}
