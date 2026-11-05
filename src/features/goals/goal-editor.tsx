import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { OptionCard } from '@/components/ui/option-card';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { TourTarget } from '@/features/tutorial/tour-target';
import { todayIso } from '@/features/documents/document-logic';

import { GoalCard } from './goal-card';
import {
  GOAL_KINDS,
  goalProgress,
  goalTitle,
  parseTarget,
  PERIOD_LABEL,
  periodsFor,
  type Goal,
  type GoalKind,
  type GoalPeriod,
} from './goals-logic';
import { useGoals, type GoalInput } from './goals-provider';
import { useGoalData } from './use-goal-data';

const back = () =>
  router.canGoBack() ? router.back() : router.navigate({ pathname: '/aufgaben', params: { ansicht: 'ziele' } });

const isKind = (v?: string): v is GoalKind => GOAL_KINDS.some((k) => k.kind === v);
const asText = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 }).replace(/\./g, '');

/** Neues Ziel (Route /aufgaben/ziele/neu, optional ?art=&zeitraum=&ziel=) */
export function GoalNewScreen() {
  const { art, zeitraum, ziel } = useLocalSearchParams<{ art?: string; zeitraum?: string; ziel?: string }>();
  return <GoalEditor key={`${art}-${zeitraum}-${ziel}`} preset={{ art, zeitraum, ziel }} />;
}

/** Ziel bearbeiten (Route /aufgaben/ziele/[id]) */
export function GoalEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { goals, loading } = useGoals();
  const goal = goals.find((g) => g.id === id);
  if (!goal) {
    return (
      <Screen maxWidth={680}>
        <PageHeader title="Ziel" back={{ label: 'Ziele', onPress: back }} />
        {!loading && <Notice>Dieses Ziel gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  return <GoalEditor key={goal.id} goal={goal} />;
}

function GoalEditor({ goal, preset }: { goal?: Goal; preset?: { art?: string; zeitraum?: string; ziel?: string } }) {
  const { createGoal, updateGoal, deleteGoal, error: setupError } = useGoals();
  const data = useGoalData();
  const [kind, setKind] = useState<GoalKind>(goal?.kind ?? (isKind(preset?.art) ? preset.art : 'revenue'));
  const initialPeriod = (k: GoalKind, wanted?: string): GoalPeriod =>
    periodsFor(k).includes(wanted as GoalPeriod) ? (wanted as GoalPeriod) : periodsFor(k)[0];
  const [period, setPeriod] = useState<GoalPeriod>(goal?.period ?? initialPeriod(kind, preset?.zeitraum));
  const [target, setTarget] = useState(goal ? asText(goal.target) : (preset?.ziel ?? ''));
  const [title, setTitle] = useState(goal?.title ?? '');
  const [progress, setProgress] = useState(goal ? asText(goal.progress) : '0');
  const [due, setDue] = useState<string | null>(goal?.due_on ?? null);
  const [archived, setArchived] = useState(goal?.archived ?? false);
  const [errors, setErrors] = useState<{ target?: string; title?: string; progress?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickKind = (k: GoalKind) => {
    setKind(k);
    setPeriod(initialPeriod(k, period));
    setErrors({});
  };

  const parsedTarget = parseTarget(target);
  const parsedProgress = kind === 'custom' ? (parseTarget(progress, true) ?? 0) : null;
  // Vorschau mit den eingegebenen Werten
  const draft: Goal | null =
    typeof parsedTarget === 'number'
      ? {
          id: goal?.id ?? 'neu',
          kind,
          period,
          target: parsedTarget,
          title: kind === 'custom' ? title.trim() || null : null,
          progress: typeof parsedProgress === 'number' ? parsedProgress : 0,
          due_on: kind === 'custom' ? due : null,
          archived: false,
          created_at: '',
          updated_at: '',
        }
      : null;
  const today = todayIso();
  const preview = draft ? goalProgress(draft, data, new Date(`${today}T12:00:00`)) : null;

  const save = async () => {
    const next: typeof errors = {};
    if (parsedTarget === null) next.target = 'Wie viel willst du erreichen?';
    else if (parsedTarget === 'invalid') next.target = 'Bitte eine Zahl größer als 0 eingeben (z. B. 3.000).';
    if (kind === 'custom' && !title.trim()) next.title = 'Wie heißt dein Ziel?';
    if (kind === 'custom' && parsedProgress === 'invalid') next.progress = 'Bitte eine Zahl eingeben.';
    setErrors(next);
    if (Object.keys(next).length || typeof parsedTarget !== 'number') return;
    const input: GoalInput = {
      kind,
      period,
      target: parsedTarget,
      title: kind === 'custom' ? title.trim() : null,
      progress: kind === 'custom' && typeof parsedProgress === 'number' ? parsedProgress : 0,
      due_on: kind === 'custom' ? due : null,
      archived,
    };
    setSaving(true);
    setFailure(null);
    const { error } = goal ? await updateGoal(goal.id, input) : await createGoal(input);
    setSaving(false);
    if (error) return setFailure(error);
    back();
  };

  const unit = GOAL_KINDS.find((k) => k.kind === kind)?.unit ?? '';

  return (
    <Screen maxWidth={680}>
      <PageHeader title={goal ? goalTitle(goal) : 'Neues Ziel'} back={{ label: 'Ziele', onPress: back }} />
      {setupError === 'setup' && (
        <Notice>
          Ziele brauchen noch das Datenbank-Skript 20261111090000_todos_goals.sql (siehe supabase/README.md).
        </Notice>
      )}
      <TourTarget id="guide.goal">
        <Reveal delay={120}>
          <Card>
            <Text style={styles.cardTitle}>Was willst du erreichen?</Text>
            <View style={styles.options} accessibilityRole="radiogroup" accessibilityLabel="Art des Ziels">
              {GOAL_KINDS.map((k) => (
                <OptionCard
                  key={k.kind}
                  compact
                  title={k.label}
                  description={k.description}
                  selected={kind === k.kind}
                  onPress={() => pickKind(k.kind)}
                />
              ))}
            </View>
          </Card>
        </Reveal>
      </TourTarget>

      <Reveal delay={200}>
        <Card>
          {kind === 'custom' && (
            <TextField
              label="Name des Ziels"
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setErrors((e) => ({ ...e, title: undefined }));
              }}
              placeholder="z. B. 10 Google-Bewertungen"
              error={errors.title}
              maxLength={120}
            />
          )}
          <TextField
            label={kind === 'revenue' ? 'Ziel in €' : kind === 'custom' ? 'Zielwert' : `Ziel (Anzahl ${unit})`}
            value={target}
            onChangeText={(v) => {
              setTarget(v);
              setErrors((e) => ({ ...e, target: undefined }));
            }}
            placeholder={kind === 'revenue' ? 'z. B. 3.000' : 'z. B. 5'}
            keyboardType="decimal-pad"
            error={errors.target}
          />
          {kind !== 'custom' ? (
            <Segmented
              label="Zeitraum"
              value={period}
              onChange={setPeriod}
              options={periodsFor(kind).map((p) => ({
                value: p,
                label: PERIOD_LABEL[p as Exclude<GoalPeriod, 'once'>],
              }))}
            />
          ) : (
            <>
              <TextField
                label="Schon erreicht"
                value={progress}
                onChangeText={(v) => {
                  setProgress(v);
                  setErrors((e) => ({ ...e, progress: undefined }));
                }}
                keyboardType="decimal-pad"
                error={errors.progress}
              />
              <DateField label="Bis wann? (optional)" value={due} onChange={setDue} />
            </>
          )}
          {goal && <ToggleRow label="Archiviert (nicht mehr anzeigen)" value={archived} onChange={setArchived} />}
        </Card>
      </Reveal>

      {draft && preview && (
        <Reveal delay={260}>
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>So sieht es gerade aus</Text>
            <GoalCard goal={draft} progress={preview} preview />
          </View>
        </Reveal>
      )}

      {failure && <Notice tone="error">{failure}</Notice>}
      <Button
        label={goal ? 'Änderungen speichern' : 'Ziel speichern'}
        onPress={() => void save()}
        loading={saving}
        disabled={setupError === 'setup'}
      />
      {goal && (
        <ConfirmDelete
          label="Ziel löschen"
          question={`„${goalTitle(goal)}“ wirklich löschen?`}
          onConfirm={async () => {
            const { error } = await deleteGoal(goal.id);
            if (error) setFailure(error);
            else back();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  options: { gap: Spacing.sm },
  preview: { gap: Spacing.sm },
  previewLabel: { color: Colors.textFaint, fontSize: 12.5, fontWeight: '600', letterSpacing: 0.3 },
});
