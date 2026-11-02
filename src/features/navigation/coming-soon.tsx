import { Check } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';

import { navItem } from './nav-items';

/** Platzhalter-Seite für Bereiche, die noch gebaut werden. */
export function ComingSoon({ name }: { name: string }) {
  const item = navItem(name);
  if (!item) return null;
  const Icon = item.icon;

  return (
    <Screen maxWidth={640}>
      <View style={styles.center}>
        <Reveal>
          <View style={styles.iconWrap}>
            <Icon size={30} color={Colors.text} strokeWidth={1.6} />
          </View>
        </Reveal>
        <Reveal delay={80}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>IN ARBEIT</Text>
          </View>
        </Reveal>
        <AnimatedTitle text={item.label} style={styles.title} delay={120} />
        <Reveal delay={300}>
          <Text style={styles.description}>{item.description}</Text>
        </Reveal>
      </View>

      {!!item.planned?.length && (
        <Reveal delay={420}>
          <Card>
            <Text style={styles.cardTitle}>Das kommt hier rein</Text>
            {item.planned.map((p) => (
              <View key={p} style={styles.row}>
                <View style={styles.check}>
                  <Check size={13} color={Colors.background} strokeWidth={3} />
                </View>
                <Text style={styles.rowText}>{p}</Text>
              </View>
            ))}
          </Card>
        </Reveal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xxl },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 40px rgba(255,255,255,0.08)',
  },
  badge: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: Colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: Colors.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  description: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 460 },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.text, alignItems: 'center', justifyContent: 'center' },
  rowText: { color: Colors.text, fontSize: 14.5, flex: 1 },
});
