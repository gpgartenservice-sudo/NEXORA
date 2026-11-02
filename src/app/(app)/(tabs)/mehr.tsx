import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { NAV_ITEMS } from '@/features/navigation/nav-items';

/** Handy: alle Bereiche, die nicht direkt in der Tab-Leiste stehen. */
export default function MoreScreen() {
  const items = NAV_ITEMS.filter((i) => !i.mobileTab);
  return (
    <Screen maxWidth={640}>
      <AnimatedTitle text="Mehr" style={styles.title} align="left" />
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <Reveal key={item.name} delay={120 + i * 60}>
            <Card onPress={() => router.navigate(item.href)} accessibilityLabel={item.label} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Icon size={20} color={Colors.text} strokeWidth={1.8} />
                </View>
                <View style={styles.texts}>
                  <Text style={styles.label}>
                    {item.label}
                    {item.soon ? <Text style={styles.soon}>  · bald</Text> : null}
                  </Text>
                  <Text style={styles.description} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>
                <ChevronRight size={18} color={Colors.textFaint} />
              </View>
            </Card>
          </Reveal>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5 },
  card: {},
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texts: { flex: 1, gap: 2 },
  label: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  soon: { color: Colors.textFaint, fontSize: 13, fontWeight: '500' },
  description: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
});
