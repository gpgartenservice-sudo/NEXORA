import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

type Props = {
  tone?: 'info' | 'error' | 'success';
  children: ReactNode;
  /** Optional: Button o. Ä. unter dem Text */
  action?: ReactNode;
};

/** Hinweisbox für Fehler, Erfolgsmeldungen und Infos. */
export function Notice({ tone = 'info', children, action }: Props) {
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.box, tone === 'error' && styles.error, tone === 'success' && styles.success]}>
      <Text style={[styles.text, tone === 'error' && styles.errorText, tone === 'success' && styles.successText]}>
        {children}
      </Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
  },
  error: { borderColor: 'rgba(255,107,107,0.35)', backgroundColor: 'rgba(255,107,107,0.08)' },
  success: { borderColor: 'rgba(255,255,255,0.25)' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  errorText: { color: Colors.danger },
  successText: { color: Colors.text },
});
