import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TextField } from '@/components/auth/text-field';
import { AnimatedTitle, Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { OptionCard } from '@/components/ui/option-card';
import { StepProgress } from '@/components/ui/step-progress';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useProfile } from '@/providers/profile-provider';

import {
  GOALS,
  INDUSTRIES,
  industryLabel,
  MAX_GOALS,
  STAGES,
  stageLabel,
  type Goal,
  type Industry,
  type Stage,
} from './options';
import { SuccessBurst } from './success-burst';

/** Die Fragen, in dieser Reihenfolge. 'done' ist der Abschluss-Screen. */
const STEPS = ['name', 'stage', 'business', 'industry', 'goals', 'done'] as const;
type Step = (typeof STEPS)[number];
const QUESTION_COUNT = STEPS.length - 1;

/** Kurze Pause, bevor es nach einer Einfachauswahl automatisch weitergeht */
const AUTO_ADVANCE_MS = 420;

/**
 * Onboarding nach der Registrierung: ein Screen pro Frage, mit animierten
 * Übergängen. Die Antworten landen in der Tabelle "profiles".
 */
export function OnboardingFlow() {
  const { user } = useAuth();
  const { profile, save } = useProfile();
  const { width } = useWindowDimensions();

  const [stepIndex, setStepIndex] = useState(0);
  const step: Step = STEPS[stepIndex];

  // Antworten (vorbelegt, falls das Onboarding wiederholt wird)
  const metaName = String(user?.user_metadata?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
  const [name, setName] = useState(profile?.display_name ?? metaName);
  const [stage, setStage] = useState<Stage | null>(profile?.stage ?? null);
  const [business, setBusiness] = useState(profile?.business_name ?? '');
  const [industry, setIndustry] = useState<Industry | null>(profile?.industry ?? null);
  const [goals, setGoals] = useState<Goal[]>(profile?.goals ?? []);

  const [nameError, setNameError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- Übergang zwischen den Schritten: alter Inhalt gleitet raus, neuer blendet ein
  const leave = useSharedValue(0);
  const direction = useSharedValue(1);
  const busy = useRef(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(autoTimer.current), []);

  const goTo = (next: number) => {
    if (busy.current || next < 0 || next >= STEPS.length) return;
    busy.current = true;
    direction.set(next > stepIndex ? 1 : -1);
    const switchStep = () => {
      setStepIndex(next);
      leave.set(0);
      busy.current = false;
    };
    leave.set(
      withTiming(1, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(switchStep);
      }),
    );
  };
  const next = () => goTo(stepIndex + 1);
  const back = () => goTo(stepIndex - 1);

  const leaveStyle = useAnimatedStyle(() => ({
    opacity: 1 - leave.get(),
    transform: [{ translateX: -28 * direction.get() * leave.get() }],
  }));

  const autoAdvance = () => {
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(next, AUTO_ADVANCE_MS);
  };

  // --- Aktionen pro Schritt
  const submitName = () => {
    if (name.trim().length < 2) {
      setNameError('Bitte gib deinen Namen ein.');
      return;
    }
    setNameError(undefined);
    next();
  };

  const toggleGoal = (key: Goal) => {
    setGoals((current) =>
      current.includes(key) ? current.filter((g) => g !== key) : current.length < MAX_GOALS ? [...current, key] : current,
    );
  };

  const finish = async () => {
    setSaving(true);
    setSaveError(null);
    const { error } = await save({
      display_name: name.trim(),
      stage,
      business_name: business.trim() || null,
      industry,
      goals,
      onboarding_completed_at: profile?.onboarding_completed_at ?? new Date().toISOString(),
    });
    setSaving(false);
    if (error) {
      setSaveError(error);
      return;
    }
    next();
  };

  const firstName = name.trim().split(/\s+/)[0];
  const twoColumns = width >= 640;

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.column, step === 'industry' && twoColumns && styles.columnWide]}>
            {step !== 'done' && (
              <View style={styles.topBar}>
                <StepProgress steps={QUESTION_COUNT} current={stepIndex} />
                <View style={styles.topRow}>
                  <Text style={styles.stepLabel}>
                    Schritt {stepIndex + 1} von {QUESTION_COUNT}
                  </Text>
                  {stepIndex > 0 ? (
                    <TextLink label="← Zurück" onPress={back} />
                  ) : (
                    <TextLink label="Abmelden" onPress={() => supabase.auth.signOut()} />
                  )}
                </View>
              </View>
            )}

            {/* key = Schritt: bei jedem Wechsel spielen die Einblend-Effekte neu ab */}
            <Animated.View key={step} style={[styles.stepBody, leaveStyle]}>
              {step === 'name' && (
                <StepLayout title="Wie dürfen wir dich nennen?" subtitle="So sprechen wir dich in Lunaxora an.">
                  <Reveal delay={420}>
                    <TextField
                      label="Dein Vorname"
                      value={name}
                      onChangeText={(v) => {
                        setName(v);
                        if (nameError) setNameError(undefined);
                      }}
                      error={nameError}
                      placeholder="z. B. Lena"
                      autoFocus
                      autoComplete="given-name"
                      textContentType="givenName"
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={submitName}
                      maxLength={80}
                    />
                  </Reveal>
                  <Reveal delay={520}>
                    <Button label="Weiter" onPress={submitName} />
                  </Reveal>
                </StepLayout>
              )}

              {step === 'stage' && (
                <StepLayout eyebrow={`Hallo ${firstName} 👋`} title="Wo stehst du gerade?" subtitle="Damit wir dich genau da abholen, wo du bist.">
                  <View style={styles.options}>
                    {STAGES.map((s, i) => (
                      <Reveal key={s.key} delay={380 + i * 70}>
                        <OptionCard
                          emoji={s.emoji}
                          title={s.title}
                          description={s.description}
                          selected={stage === s.key}
                          onPress={() => {
                            setStage(s.key);
                            autoAdvance();
                          }}
                        />
                      </Reveal>
                    ))}
                  </View>
                </StepLayout>
              )}

              {step === 'business' && (
                <StepLayout
                  title={stage === 'idea' ? 'Hat deine Idee schon einen Namen?' : 'Wie heißt dein Business?'}
                  subtitle="Kein Problem, wenn es noch keinen Namen gibt – das kannst du jederzeit ergänzen.">
                  <Reveal delay={420}>
                    <TextField
                      label={stage === 'idea' ? 'Name deiner Idee' : 'Name deines Business'}
                      value={business}
                      onChangeText={setBusiness}
                      placeholder="z. B. Lena Design Studio"
                      autoFocus
                      autoCapitalize="words"
                      returnKeyType="next"
                      onSubmitEditing={next}
                      maxLength={120}
                    />
                  </Reveal>
                  <Reveal delay={520}>
                    <Button label={business.trim() ? 'Weiter' : 'Überspringen'} variant={business.trim() ? 'primary' : 'secondary'} onPress={next} />
                  </Reveal>
                </StepLayout>
              )}

              {step === 'industry' && (
                <StepLayout title="In welcher Branche bist du unterwegs?" subtitle="Wähle, was am besten passt.">
                  <View style={[styles.options, twoColumns && styles.grid]}>
                    {INDUSTRIES.map((s, i) => (
                      <Reveal key={s.key} delay={360 + i * 55} style={twoColumns ? styles.gridItem : undefined}>
                        <OptionCard
                          compact
                          emoji={s.emoji}
                          title={s.title}
                          selected={industry === s.key}
                          onPress={() => {
                            setIndustry(s.key);
                            autoAdvance();
                          }}
                        />
                      </Reveal>
                    ))}
                  </View>
                </StepLayout>
              )}

              {step === 'goals' && (
                <StepLayout title="Was ist dir gerade am wichtigsten?" subtitle={`Wähle bis zu ${MAX_GOALS} Punkte – darauf richten wir deinen Fahrplan aus.`}>
                  <View style={styles.options}>
                    {GOALS.map((g, i) => (
                      <Reveal key={g.key} delay={360 + i * 55}>
                        <OptionCard
                          compact
                          multiple
                          emoji={g.emoji}
                          title={g.title}
                          selected={goals.includes(g.key)}
                          disabled={!goals.includes(g.key) && goals.length >= MAX_GOALS}
                          onPress={() => toggleGoal(g.key)}
                        />
                      </Reveal>
                    ))}
                  </View>
                  <Reveal delay={760}>
                    <Text style={styles.counter}>
                      {goals.length} von {MAX_GOALS} ausgewählt
                    </Text>
                  </Reveal>
                  {saveError && <Notice tone="error">{saveError}</Notice>}
                  <Reveal delay={820}>
                    <Button label="Fertig" onPress={finish} loading={saving} disabled={goals.length === 0} />
                  </Reveal>
                </StepLayout>
              )}

              {step === 'done' && (
                <View style={styles.done}>
                  <SuccessBurst />
                  <AnimatedTitle text={`Dein Lunaxora ist bereit, ${firstName}.`} style={styles.title} delay={450} />
                  <Reveal delay={800}>
                    <Text style={styles.subtitle}>Wir haben alles auf dich eingestellt.</Text>
                  </Reveal>
                  <View style={styles.pills}>
                    {[
                      stage && `${STAGES.find((s) => s.key === stage)?.emoji} ${stageLabel(stage)}`,
                      industry && `${INDUSTRIES.find((s) => s.key === industry)?.emoji} ${industryLabel(industry)}`,
                      ...goals.map((g) => `${GOALS.find((x) => x.key === g)?.emoji} ${GOALS.find((x) => x.key === g)?.title}`),
                    ]
                      .filter(Boolean)
                      .map((label, i) => (
                        <Reveal key={String(label)} delay={950 + i * 80} distance={10}>
                          <View style={styles.pill}>
                            <Text style={styles.pillText}>{label}</Text>
                          </View>
                        </Reveal>
                      ))}
                  </View>
                  <Reveal delay={1350} style={styles.doneButton}>
                    <Button label="Los geht's" onPress={() => router.replace('/home')} />
                  </Reveal>
                </View>
              )}
            </Animated.View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StepLayout({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.header}>
        {!!eyebrow && (
          <Reveal delay={0} distance={8}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
          </Reveal>
        )}
        <AnimatedTitle text={title} style={styles.title} delay={eyebrow ? 120 : 0} />
        {!!subtitle && (
          <Reveal delay={260}>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </Reveal>
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.xxxl },
  column: { width: '100%', maxWidth: 460, alignSelf: 'center', gap: Spacing.xxl },
  columnWide: { maxWidth: 640 },
  topBar: { gap: Spacing.md },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepLabel: { color: Colors.textFaint, fontSize: 13, fontWeight: '500' },
  stepBody: { width: '100%' },
  step: { gap: Spacing.xl },
  header: { gap: Spacing.sm, alignItems: 'center', marginBottom: Spacing.sm },
  eyebrow: { color: Colors.textMuted, fontSize: 15, fontWeight: '600', textAlign: 'center' },
  title: { color: Colors.text, fontSize: 30, fontWeight: '700', letterSpacing: -0.5, lineHeight: 38, textAlign: 'center' },
  subtitle: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  options: { gap: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '48.8%' },
  counter: { color: Colors.textFaint, fontSize: 13, textAlign: 'center' },
  done: { alignItems: 'center', gap: Spacing.lg },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.sm, maxWidth: 520 },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  pillText: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  doneButton: { width: '100%', maxWidth: 320, marginTop: Spacing.lg },
});
