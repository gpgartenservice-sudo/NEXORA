import { router, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Colors, MonoFont, Spacing } from '@/constants/theme';
import { copyText } from '@/features/social/copy-text';

/**
 * Statt Absturz: verständliche Fehlerseite mit „Nochmal versuchen“ und dem
 * Fehlertext zum Kopieren (zum Weitergeben). Wird von den _layout-Dateien
 * als ErrorBoundary benutzt – die Navigation bleibt bedienbar.
 */
export function AppError({ error, retry }: ErrorBoundaryProps) {
  const [copied, setCopied] = useState(false);
  const details = `${error?.name ?? 'Fehler'}: ${error?.message ?? String(error)}\n${(error?.stack ?? '').split('\n').slice(0, 8).join('\n')}`;
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title} accessibilityRole="header">
        Da ist etwas schiefgelaufen
      </Text>
      <Text style={styles.body}>
        Deine Daten sind sicher. Versuch es noch einmal – und wenn es wieder passiert, kopier den Fehlertext und schick
        ihn an den Support.
      </Text>
      <View style={styles.box} testID="app-error">
        <Text style={styles.code} selectable>
          {details}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button label="Nochmal versuchen" onPress={() => void retry()} />
        <Button
          label={copied ? 'Kopiert' : 'Fehlertext kopieren'}
          variant="secondary"
          onPress={async () => setCopied(await copyText(details))}
        />
        <Button label="Zur Startseite" variant="secondary" onPress={() => router.navigate('/home')} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.xl, paddingTop: 64, gap: Spacing.lg, maxWidth: 640, width: '100%', alignSelf: 'center' },
  title: { color: Colors.text, fontSize: 24, fontWeight: '700' },
  body: { color: Colors.textMuted, fontSize: 15, lineHeight: 22 },
  box: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    backgroundColor: Colors.surface,
  },
  code: { color: Colors.textMuted, fontSize: 12, lineHeight: 17, fontFamily: MonoFont },
  actions: { gap: Spacing.sm },
});
