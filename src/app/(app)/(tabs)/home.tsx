import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { UpcomingAppointments } from '@/features/appointments/upcoming-card';
import { formatToday, greeting, impulseOfTheDay } from '@/features/dashboard/content';
import { FocusCard } from '@/features/dashboard/focus-card';
import { MoneyCard } from '@/features/dashboard/money-card';
import { TodayCard } from '@/features/goals/today-card';
import { useSidebarWidth } from '@/features/navigation/sidebar-state';
import { nextSteps, stepsFor } from '@/features/roadmap/content';
import { useRoadmap } from '@/features/roadmap/roadmap-provider';
import { StepCheck } from '@/features/roadmap/step-check';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';
import { useProfile } from '@/providers/profile-provider';

/** Startseite nach dem Login – passend zu den Antworten aus dem Onboarding. */
export default function DashboardScreen() {
  const { profile } = useProfile();
  const { width } = useWindowDimensions();
  // Seitenleiste am Mac (eingeklappt schmaler) abziehen
  const contentWidth = width - useSidebarWidth();
  const twoColumns = contentWidth >= 900;

  const name = profile?.display_name?.trim().split(/\s+/)[0] ?? '';
  const { done, toggle } = useRoadmap();
  const upcoming = nextSteps(profile?.stage, done, 3);
  const totalSteps = stepsFor(profile?.stage).length;
  const doneSteps = stepsFor(profile?.stage).filter((s) => done.has(s.key)).length;
  useAreaTutorial('home');

  return (
    <Screen>
      {/* Begrüßung */}
      <View style={styles.header}>
        <View style={styles.dateRow}>
          <Reveal distance={8}>
            <Text style={styles.date}>{formatToday()}</Text>
          </Reveal>
          <TutorialButton id="home" />
        </View>
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

      {/* Gewinn, Einnahmen, Ausgaben – ganz oben, ab den ersten Zahlen (zählen beim Öffnen hoch) */}
      <TourTarget id="home.money">
        <Reveal delay={240}>
          <MoneyCard />
        </Reveal>
      </TourTarget>

      {/* Termine heute & morgen (nur wenn es welche gibt) */}
      <Reveal delay={280}>
        <UpcomingAppointments />
      </Reveal>

      {/* To-dos für heute und Ziele */}
      <TourTarget id="home.today">
        <Reveal delay={300}>
          <TodayCard />
        </Reveal>
      </TourTarget>

      <TourTarget id="home.focus" style={[styles.grid, twoColumns && styles.gridRow]}>
        {/* Fokus nach deinen Schwerpunkten */}
        <Reveal delay={320} style={twoColumns ? styles.colWide : undefined}>
          <FocusCard />
        </Reveal>

        {/* Impuls des Tages */}
        <Reveal delay={420} style={twoColumns ? styles.colNarrow : undefined}>
          <Card style={styles.fill}>
            <Text style={styles.eyebrow}>IMPULS DES TAGES</Text>
            <Text style={styles.impulse}>„{impulseOfTheDay()}“</Text>
          </Card>
        </Reveal>
      </TourTarget>

      {/* Nächste Schritte */}
      <TourTarget id="home.steps">
        <Reveal delay={520}>
          <Card>
            <View style={styles.stepsHead}>
              <Text style={styles.eyebrow}>DEINE NÄCHSTEN SCHRITTE</Text>
              <Text style={styles.stepsCount}>
                {doneSteps} von {totalSteps} erledigt
              </Text>
            </View>
            {upcoming.length === 0 ? (
              <Text style={styles.body}>Dein Fahrplan ist komplett erledigt. Stark! 🎉</Text>
            ) : (
              upcoming.map((step) => (
                <View key={step.key} style={styles.step}>
                  <StepCheck
                    checked={done.has(step.key)}
                    onToggle={() => toggle(step.key)}
                    label={step.title}
                    size={24}
                  />
                  <Pressable
                    style={styles.stepPress}
                    onPress={() => router.navigate('/fahrplan')}
                    accessibilityRole="link">
                    <Text style={styles.stepText}>{step.title}</Text>
                  </Pressable>
                </View>
              ))
            )}
            <Pressable onPress={() => router.navigate('/fahrplan')} accessibilityRole="link" style={styles.allLink}>
              <Text style={styles.allLinkText}>Ganzen Fahrplan ansehen</Text>
              <ArrowRight size={14} color={Colors.textMuted} />
            </Pressable>
          </Card>
        </Reveal>
      </TourTarget>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.xs, marginBottom: Spacing.sm },
  date: { color: Colors.textFaint, fontSize: 13, fontWeight: '600', letterSpacing: 0.4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  title: { color: Colors.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.7, lineHeight: 42 },
  subtitle: { color: Colors.textMuted, fontSize: 16 },
  grid: { gap: Spacing.lg },
  gridRow: { flexDirection: 'row', alignItems: 'stretch' },
  colWide: { flex: 1.6 },
  colNarrow: { flex: 1 },
  fill: { flex: 1 },
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  body: { color: Colors.textMuted, fontSize: 15, lineHeight: 22 },
  impulse: { color: Colors.text, fontSize: 19, lineHeight: 28, fontWeight: '500', letterSpacing: -0.2 },
  step: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepPress: { flex: 1 },
  stepsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepsCount: { color: Colors.textFaint, fontSize: 12.5, fontWeight: '600' },
  allLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs },
  allLinkText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
  stepText: { color: Colors.text, fontSize: 15, flex: 1 },
});
