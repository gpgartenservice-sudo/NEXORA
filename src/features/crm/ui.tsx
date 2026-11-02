import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Notice } from '@/components/ui/notice';
import { Colors, Radius, Spacing } from '@/constants/theme';

/** Kennzahl-Kachel (z. B. "Umsatz"). */
export function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'muted' }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, tone === 'accent' && styles.statAccent, tone === 'muted' && styles.statMuted]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

/** Runder Kreis mit Anfangsbuchstaben. */
export function Initials({ name, size = 40 }: { name: string; size?: number }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return (
    <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.38 }]}>{letters || '?'}</Text>
    </View>
  );
}

/** Hinweis, wenn das Datenbank-Skript für Kunden & Aufträge noch fehlt. */
export function CrmSetupNotice({ error }: { error: 'setup' | 'failed' | null }) {
  if (!error) return null;
  return (
    <Notice tone="error">
      {error === 'setup'
        ? 'Kunden und Aufträge können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt. Anleitung: supabase/README.md'
        : 'Kunden und Aufträge konnten nicht geladen werden. Prüfe deine Internetverbindung.'}
    </Notice>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  stat: {
    flexGrow: 1,
    flexBasis: 150,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    gap: 2,
  },
  statValue: { color: Colors.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  statAccent: { color: Colors.accent },
  statMuted: { color: Colors.textMuted },
  statLabel: { color: Colors.textFaint, fontSize: 12.5, fontWeight: '500' },
  initials: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: { color: Colors.text, fontWeight: '700' },
});
