import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';

import { Screen } from '@/components/layout/screen';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { FOCUS, formatToday, greeting, impulseOfTheDay } from '@/features/dashboard/content';
import { NAV_ITEMS, SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/features/navigation/nav-items';
import { GOALS } from '@/features/onboarding/options';
import { useProfile } from '@/providers/profile-provider';

const GLOW = require('@/assets/images/glow.png');

/** Startseite nach dem Login – passend zu den Antworten aus dem Onboarding. */
export default function DashboardScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  const contentWidth = width >= SIDEBAR_BREAKPOINT ? width - SIDEBAR_WIDTH : width;
  const twoColumns = contentWidth >= 900;
  const [toolsWidth, setToolsWidth] = useState(0);
  const toolColumns = contentWidth >= 900 ? 3 : contentWidth >= 560 ? 2 : 1;
  const toolWidth = toolsWidth > 0 ? (toolsWidth - Spacing.lg * (toolColumns - 1)) / toolColumns : undefined;

  const name = profile?.display_name?.trim().split(/\s+/)[0] ?? '';
  const focus = FOCUS[profile?.stage ?? 'started'];
  const goals = GOALS.filter((g) => profile?.goals?.includes(g.key));
  const tools = NAV_ITEMS.filter((i) => ['kunden', 'auftraege', 'finanzen', 'social', 'assistent'].includes(i.name));

  return (
    <Screen>
      {/* Begrüßung */}
      <View style={styles.header}>
        <Reveal distance={8}>
          <Text style={styles.date}>{formatToday()}</Text>
        </Reveal>
        <AnimatedTitle
          text={name ? `${greeting()}, ${name}` : greeting()}
          style={styles.title}
          align="left"
          delay={80}
        />
        {!!profile?.business_name && (
          <Reveal delay={260}>
            <Text style={styles.subtitle}>{profile.business_name}</Text>
          </Reveal>
        )}
      </View>

      <View style={[styles.grid, twoColumns && styles.gridRow]}>
        {/* Fokus nach Phase */}
        <Reveal delay={320} style={twoColumns ? styles.colWide : undefined}>
          <Card style={styles.fill}>
            <Image source={GLOW} style={styles.focusGlow} contentFit="fill" pointerEvents="none" />
            <Text style={styles.eyebrow}>DEIN FOKUS</Text>
            <View style={styles.focusHead}>
              <Text style={styles.focusEmoji}>{focus.emoji}</Text>
              <Text style={styles.focusTitle}>{focus.title}</Text>
            </View>
            <Text style={styles.body}>{focus.text}</Text>
            <View style={styles.focusAction}>
              <Button label="Zum Fahrplan" onPress={() => router.navigate('/fahrplan')} />
            </View>
          </Card>
        </Reveal>

        {/* Impuls des Tages */}
        <Reveal delay={420} style={twoColumns ? styles.colNarrow : undefined}>
          <Card style={styles.fill}>
            <Text style={styles.eyebrow}>IMPULS DES TAGES</Text>
            <Text style={styles.impulse}>„{impulseOfTheDay()}“</Text>
          </Card>
        </Reveal>
      </View>

      <View style={[styles.grid, twoColumns && styles.gridRow]}>
        {/* Nächste Schritte */}
        <Reveal delay={520} style={twoColumns ? styles.colWide : undefined}>
          <Card style={styles.fill}>
            <Text style={styles.eyebrow}>DEINE NÄCHSTEN SCHRITTE</Text>
            {focus.steps.map((step, i) => (
              <View key={step} style={styles.step}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
            <Text style={styles.hint}>Im Fahrplan kannst du bald jeden Schritt abhaken.</Text>
          </Card>
        </Reveal>

        {/* Schwerpunkte */}
        <Reveal delay={600} style={twoColumns ? styles.colNarrow : undefined}>
          <Card style={styles.fill}>
            <Text style={styles.eyebrow}>DEINE SCHWERPUNKTE</Text>
            <View style={styles.pills}>
              {goals.length ? (
                goals.map((g) => (
                  <View key={g.key} style={styles.pill}>
                    <Text style={styles.pillText}>
                      {g.emoji} {g.title}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.body}>Noch keine ausgewählt.</Text>
              )}
            </View>
          </Card>
        </Reveal>
      </View>

      {/* Werkzeuge */}
      <Reveal delay={700}>
        <Text style={styles.sectionTitle}>Deine Werkzeuge</Text>
      </Reveal>
      <View style={styles.tools} onLayout={(e) => setToolsWidth(e.nativeEvent.layout.width)}>
        {tools.map((tool, i) => {
          const Icon = tool.icon;
          return (
            <Reveal key={tool.name} delay={760 + i * 60} style={[styles.tool, { width: toolWidth ?? '100%' }]}>
              <Card onPress={() => router.navigate(tool.href)} accessibilityLabel={tool.label} style={styles.fill}>
                <View style={styles.toolHead}>
                  <View style={styles.toolIcon}>
                    <Icon size={20} color={Colors.text} strokeWidth={1.8} />
                  </View>
                  {tool.soon && <Text style={styles.soon}>bald</Text>}
                </View>
                <Text style={styles.toolTitle}>{tool.label}</Text>
                <Text style={styles.toolText} numberOfLines={2}>
                  {tool.description}
                </Text>
                <View style={styles.toolArrow}>
                  <ArrowRight size={16} color={Colors.textMuted} />
                </View>
              </Card>
            </Reveal>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.xs, marginBottom: Spacing.sm },
  date: { color: Colors.textFaint, fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  title: { color: Colors.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.7, lineHeight: 42 },
  subtitle: { color: Colors.textMuted, fontSize: 16 },
  grid: { gap: Spacing.lg },
  gridRow: { flexDirection: 'row', alignItems: 'stretch' },
  colWide: { flex: 1.6 },
  colNarrow: { flex: 1 },
  fill: { flex: 1 },
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  focusGlow: { position: 'absolute', top: -220, right: -200, width: 520, height: 520, opacity: 0.09 },
  focusHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  focusEmoji: { fontSize: 30 },
  focusTitle: { color: Colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, flex: 1 },
  body: { color: Colors.textMuted, fontSize: 15, lineHeight: 22 },
  focusAction: { flexDirection: 'row', marginTop: Spacing.sm },
  impulse: { color: Colors.text, fontSize: 19, lineHeight: 28, fontWeight: '500', letterSpacing: -0.2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.borderFocus,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  stepText: { color: Colors.text, fontSize: 15, flex: 1 },
  hint: { color: Colors.textFaint, fontSize: 13, marginTop: Spacing.xs },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  pillText: { color: Colors.text, fontSize: 13.5, fontWeight: '500' },
  sectionTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginTop: Spacing.md },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  tool: {},
  toolHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soon: { color: Colors.textFaint, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  toolTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  toolText: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  toolArrow: { alignItems: 'flex-end' },
});
