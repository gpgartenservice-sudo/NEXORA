import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Colors, Spacing } from '@/constants/theme';
import { useProfile } from '@/providers/profile-provider';

import { Celebration } from './celebration';
import { phasesFor, type RoadmapPhase } from './content';
import { useRoadmap } from './roadmap-provider';
import { StepRow } from './step-row';

const INTRO: Record<string, string> = {
  idea: 'Von der Idee bis zum ersten bezahlten Auftrag – Schritt für Schritt.',
  started: 'Die Basis steht. Jetzt geht es um Kunden, Struktur und Routinen.',
  stuck: 'Wir fangen beim Neu-Ausrichten an. Danach geht es Schritt für Schritt weiter.',
  growing: 'Mehr Überblick, bessere Abläufe, mehr Umsatz.',
};

/** Der persönliche Gründer-Fahrplan. */
export function RoadmapScreen() {
  const { profile } = useProfile();
  const { done, error, saveError, toggle } = useRoadmap();
  const [celebration, setCelebration] = useState<string | null>(null);
  const clearCelebration = useCallback(() => setCelebration(null), []);

  const phases = phasesFor(profile?.stage);
  const allSteps = phases.flatMap((p) => p.steps);
  const doneCount = allSteps.filter((s) => done.has(s.key)).length;
  const total = allSteps.length;
  const nextKey = allSteps.find((s) => !done.has(s.key))?.key;
  const currentPhaseKey = phases.find((p) => p.steps.some((s) => !done.has(s.key)))?.key;
  const goals = profile?.goals ?? [];

  const onToggle = async (phase: RoadmapPhase, stepKey: string) => {
    const completing = !done.has(stepKey);
    const phaseNowDone = completing && phase.steps.every((s) => s.key === stepKey || done.has(s.key));
    const allNowDone = completing && doneCount + 1 === total;
    await toggle(stepKey);
    if (allNowDone) setCelebration('🏆 Fahrplan komplett geschafft!');
    else if (phaseNowDone) setCelebration(`🎉 Phase „${phase.title}“ geschafft!`);
  };

  const progressText =
    doneCount === 0
      ? 'Hak deinen ersten Schritt ab – jeder Haken bringt dich weiter.'
      : doneCount === total
        ? 'Alles erledigt. Stark! 🎉'
        : doneCount / total >= 0.5
          ? 'Mehr als die Hälfte geschafft – bleib dran!'
          : 'Guter Start – weiter so!';

  return (
    <View style={styles.root}>
      <Screen maxWidth={860}>
        <View style={styles.header}>
          <AnimatedTitle text="Dein Fahrplan" style={styles.title} align="left" />
          <Reveal delay={200}>
            <Text style={styles.subtitle}>{INTRO[profile?.stage ?? 'started']}</Text>
          </Reveal>
        </View>

        {error === 'setup' && (
          <Notice tone="error">
            Dein Fortschritt kann noch nicht gespeichert werden: Das Datenbank-Skript für den Fahrplan fehlt. Anleitung:
            supabase/README.md
          </Notice>
        )}
        {saveError && <Notice tone="error">{saveError}</Notice>}

        <Reveal delay={300}>
          <Card>
            <View style={styles.progressHead}>
              <Text style={styles.progressNumber}>
                {doneCount}
                <Text style={styles.progressTotal}> / {total}</Text>
              </Text>
              <Text style={styles.progressPercent}>{Math.round((doneCount / total) * 100)} %</Text>
            </View>
            <ProgressBar value={doneCount / total} height={8} delay={400} />
            <Text style={styles.progressText}>{progressText}</Text>
          </Card>
        </Reveal>

        {phases.map((phase, i) => {
          const phaseDone = phase.steps.filter((s) => done.has(s.key)).length;
          const complete = phaseDone === phase.steps.length;
          const recommended = phase.key === currentPhaseKey;
          return (
            <Reveal key={phase.key} delay={420 + i * 90}>
              <Card style={[recommended && styles.cardRecommended, complete && styles.cardComplete]}>
                <View style={styles.phaseHead}>
                  <View style={[styles.phaseIcon, complete && styles.phaseIconDone]}>
                    <Text style={styles.phaseEmoji}>{phase.emoji}</Text>
                  </View>
                  <View style={styles.phaseTexts}>
                    <View style={styles.phaseTitleRow}>
                      <Text style={styles.phaseTitle}>{phase.title}</Text>
                      {recommended && (
                        <View style={styles.pillLight}>
                          <Text style={styles.pillLightText}>Jetzt dran</Text>
                        </View>
                      )}
                      {complete && (
                        <View style={styles.pill}>
                          <Text style={styles.pillText}>Geschafft ✓</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.phaseDescription}>{phase.description}</Text>
                  </View>
                  <Text style={styles.phaseCount}>
                    {phaseDone}/{phase.steps.length}
                  </Text>
                </View>
                <ProgressBar value={phaseDone / phase.steps.length} height={3} delay={500 + i * 90} />
                <View style={styles.steps}>
                  {phase.steps.map((step) => (
                    <StepRow
                      key={step.key}
                      step={step}
                      done={done.has(step.key)}
                      isNext={step.key === nextKey}
                      userGoals={goals}
                      onToggle={() => onToggle(phase, step.key)}
                    />
                  ))}
                </View>
              </Card>
            </Reveal>
          );
        })}

        <Text style={styles.disclaimer}>
          Alle Hinweise nach bestem Wissen (Stand 2026) – sie ersetzen keine Rechts- oder Steuerberatung.
        </Text>
      </Screen>

      {celebration && <Celebration message={celebration} onDone={clearCelebration} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { gap: Spacing.xs },
  title: { color: Colors.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.7, lineHeight: 42 },
  subtitle: { color: Colors.textMuted, fontSize: 16, lineHeight: 23 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  progressNumber: { color: Colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  progressTotal: { color: Colors.textFaint, fontSize: 20, fontWeight: '600' },
  progressPercent: { color: Colors.textMuted, fontSize: 15, fontWeight: '600' },
  progressText: { color: Colors.textMuted, fontSize: 14.5 },
  cardRecommended: { borderColor: 'rgba(47,227,154,0.3)' },
  cardComplete: { opacity: 0.85 },
  phaseHead: { flexDirection: 'row', gap: Spacing.lg, alignItems: 'flex-start' },
  phaseIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseIconDone: { borderColor: Colors.accent, boxShadow: `0 0 24px ${Colors.accentSoft}` },
  phaseEmoji: { fontSize: 22 },
  phaseTexts: { flex: 1, gap: 4 },
  phaseTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  phaseTitle: { color: Colors.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  phaseDescription: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  phaseCount: { color: Colors.textFaint, fontSize: 14, fontWeight: '600', paddingTop: 2 },
  pill: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { color: Colors.accent, fontSize: 11.5, fontWeight: '600' },
  pillLight: { borderRadius: 999, backgroundColor: Colors.accent, paddingHorizontal: 8, paddingVertical: 2 },
  pillLightText: { color: Colors.onAccent, fontSize: 11.5, fontWeight: '700' },
  steps: { gap: 2, marginHorizontal: -Spacing.md },
  disclaimer: { color: Colors.textFaint, fontSize: 12.5, textAlign: 'center', marginTop: Spacing.md },
});
