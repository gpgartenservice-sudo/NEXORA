import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

import { GradientFill } from './gradient';

/**
 * Kennzeichnung im ganzen App: „PRO“ (ab Pro), „BUSINESS“ (nur Business) oder
 * „LIMIT“ (geht in jedem Abo, aber mit Monatsgrenze – siehe Profil → Abo).
 */
export function ProBadge({ kind = 'pro', label }: { kind?: 'pro' | 'business' | 'limit'; label?: string }) {
  const text = label ?? (kind === 'pro' ? 'PRO' : kind === 'business' ? 'BUSINESS' : 'LIMIT');
  return (
    <View
      style={[styles.badge, kind === 'pro' && styles.pro, kind === 'limit' && styles.limit]}
      accessibilityLabel={kind === 'pro' ? 'Pro-Funktion' : kind === 'business' ? 'Business-Funktion' : 'begrenzt je Monat'}>
      {kind === 'business' && <GradientFill />}
      <Text style={[styles.text, kind === 'limit' && styles.limitText, kind === 'business' && styles.businessText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
    alignSelf: 'center',
  },
  pro: { backgroundColor: Colors.accent },
  limit: { borderWidth: 1, borderColor: Colors.borderFocus },
  text: { color: '#000', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  limitText: { color: Colors.textMuted },
  businessText: { color: '#fff' },
});
