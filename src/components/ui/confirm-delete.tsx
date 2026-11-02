import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { Button } from './button';

type Props = {
  label: string;
  question: string;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  disabledHint?: string;
};

/** Löschen mit Rückfrage direkt auf der Seite (ohne System-Dialog). */
export function ConfirmDelete({ label, question, onConfirm, disabled, disabledHint }: Props) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!asking) {
    return (
      <View style={styles.wrap}>
        <Button label={label} variant="secondary" onPress={() => setAsking(true)} disabled={disabled} />
        {disabled && !!disabledHint && <Text style={styles.hint}>{disabledHint}</Text>}
      </View>
    );
  }
  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.question}>{question}</Text>
      <View style={styles.row}>
        <Button label="Abbrechen" variant="secondary" onPress={() => setAsking(false)} style={styles.flex} />
        <Button
          label="Ja, löschen"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await onConfirm();
            setBusy(false);
            setAsking(false);
          }}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  hint: { color: Colors.textFaint, fontSize: 13 },
  box: {
    gap: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
    backgroundColor: 'rgba(255,107,107,0.06)',
    padding: Spacing.lg,
  },
  question: { color: Colors.text, fontSize: 15, fontWeight: '500' },
  row: { flexDirection: 'row', gap: Spacing.md },
  flex: { flex: 1 },
});
