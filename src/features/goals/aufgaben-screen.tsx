import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Star } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type TextInputInstance } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { todayIso } from '@/features/documents/document-logic';

import { GoalCard } from './goal-card';
import { DUE_PRESETS, goalTitle, groupTodos, presetDue, type DuePreset, type Todo } from './goals-logic';
import { useGoals } from './goals-provider';
import { TodoRow } from './todo-row';
import { useGoalProgress } from './use-goal-data';

type View_ = 'todos' | 'ziele';

const SUGGESTIONS = [
  { label: '3.000 € Umsatz pro Monat', art: 'revenue', zeitraum: 'month', ziel: '3000' },
  { label: '3 neue Kunden pro Monat', art: 'customers', zeitraum: 'month', ziel: '3' },
  { label: '3 Posts pro Woche', art: 'posts', zeitraum: 'week', ziel: '3' },
] as const;

export const SETUP_HINT =
  'To-dos und Ziele brauchen noch das Datenbank-Skript 20261111090000_todos_goals.sql (siehe supabase/README.md, Abschnitt 3).';

/** Bereich "To-dos & Ziele" (Route /aufgaben, ?ansicht=ziele) */
export function AufgabenScreen() {
  const { ansicht } = useLocalSearchParams<{ ansicht?: string }>();
  const view: View_ = ansicht === 'ziele' ? 'ziele' : 'todos';
  const { error } = useGoals();

  return (
    <Screen maxWidth={820}>
      <PageHeader title="To-dos & Ziele" subtitle="Was ansteht – und wo du hinwillst." />
      <Reveal delay={120}>
        <Segmented
          value={view}
          onChange={(v) => router.setParams({ ansicht: v })}
          options={[
            { value: 'todos', label: 'To-dos' },
            { value: 'ziele', label: 'Ziele' },
          ]}
        />
      </Reveal>
      {error === 'setup' && <Notice>{SETUP_HINT}</Notice>}
      {error === 'failed' && <Notice tone="error">To-dos und Ziele konnten nicht geladen werden.</Notice>}
      {view === 'todos' ? <TodosView /> : <GoalsView />}
    </Screen>
  );
}

function TodosView() {
  const { todos, createTodo, updateTodo, error: loadError } = useGoals();
  const [today] = useState(() => todayIso());
  const [title, setTitle] = useState('');
  const [preset, setPreset] = useState<DuePreset>('none');
  const [important, setImportant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const input = useRef<TextInputInstance>(null);
  const { groups, done, openCount } = groupTodos(todos, today);

  const add = async () => {
    const t = title.trim();
    if (!t) {
      input.current?.focus();
      return;
    }
    setSaving(true);
    setFailure(null);
    const { error } = await createTodo({ title: t, due_on: presetDue(preset, today), important });
    setSaving(false);
    if (error) return setFailure(error);
    setTitle('');
    setImportant(false);
    input.current?.focus();
  };

  const toggle = async (todo: Todo) => {
    const { error } = await updateTodo(todo.id, { done: !todo.done });
    if (error) setFailure(error);
  };

  return (
    <>
      <Reveal delay={180}>
        <Card>
          <TextField
            ref={input}
            label="Neues To-do"
            value={title}
            onChangeText={setTitle}
            placeholder="z. B. Steuerberater anrufen"
            onSubmitEditing={() => void add()}
            returnKeyType="done"
            maxLength={200}
            editable={loadError !== 'setup'}
          />
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Fällig">
            {DUE_PRESETS.map((p) => {
              const active = p.key === preset;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => setPreset(p.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  aria-checked={active}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                </Pressable>
              );
            })}
            <Pressable
              onPress={() => setImportant((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: important }}
              aria-checked={important}
              accessibilityLabel="Wichtig"
              style={[styles.chip, important && styles.chipActive]}>
              <Star
                size={13}
                color={important ? Colors.accent : Colors.textMuted}
                fill={important ? Colors.accent : 'transparent'}
              />
              <Text style={[styles.chipText, important && styles.chipTextActive]}>Wichtig</Text>
            </Pressable>
          </View>
          <Button label="Hinzufügen" onPress={() => void add()} loading={saving} disabled={loadError === 'setup'} />
        </Card>
      </Reveal>
      {failure && <Notice tone="error">{failure}</Notice>}

      {groups.length === 0 && loadError !== 'setup' && (
        <Reveal delay={240}>
          <Card>
            <Text style={styles.emptyTitle}>{done.length ? 'Alles erledigt. Stark! 🎉' : 'Noch keine To-dos'}</Text>
            <Text style={styles.body}>
              Schreib oben auf, was ansteht – oder sag es Nexy, z. B. „Erinner mich Freitag an die Steuer“.
            </Text>
          </Card>
        </Reveal>
      )}

      {groups.map((g, i) => (
        <Reveal key={g.key} delay={240 + i * 60}>
          <Card>
            <View style={styles.groupHead}>
              <Text style={[styles.groupTitle, g.key === 'overdue' && styles.late]}>{g.label}</Text>
              <Text style={styles.count}>{g.items.length}</Text>
            </View>
            <View testID={`todo-group-${g.key}`}>
              {g.items.map((t) => (
                <TodoRow key={t.id} todo={t} today={today} onToggle={toggle} hideDue={g.key === 'today'} />
              ))}
            </View>
          </Card>
        </Reveal>
      ))}

      {done.length > 0 && (
        <View style={styles.doneWrap}>
          <TextLink
            label={showDone ? 'Erledigte ausblenden' : `Zuletzt erledigt anzeigen (${done.length})`}
            onPress={() => setShowDone((v) => !v)}
          />
          {showDone && (
            <Card>
              {done.map((t) => (
                <TodoRow key={t.id} todo={t} today={today} onToggle={toggle} />
              ))}
            </Card>
          )}
        </View>
      )}
      {openCount > 0 && (
        <Text style={styles.footer}>{openCount === 1 ? '1 offenes To-do' : `${openCount} offene To-dos`}</Text>
      )}
    </>
  );
}

function GoalsView() {
  const { goals, updateGoal, error: loadError } = useGoals();
  const [today] = useState(() => todayIso());
  const [failure, setFailure] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const active = useGoalProgress(goals, today);
  const archived = goals.filter((g) => g.archived);

  const step = async (id: string, current: number, delta: number) => {
    const { error } = await updateGoal(id, { progress: Math.max(0, current + delta) });
    if (error) setFailure(error);
  };

  return (
    <>
      <Reveal delay={180}>
        <View style={styles.goalsHead}>
          <Text style={styles.body}>Ziele zählen automatisch mit – aus deinen Aufträgen, Kunden und Posts.</Text>
          <Button
            label="+ Ziel hinzufügen"
            variant="secondary"
            onPress={() => router.push('/aufgaben/ziele/neu')}
            disabled={loadError === 'setup'}
          />
        </View>
      </Reveal>
      {failure && <Notice tone="error">{failure}</Notice>}

      {active.length === 0 && loadError !== 'setup' && (
        <Reveal delay={240}>
          <Card>
            <Text style={styles.emptyTitle}>Noch keine Ziele</Text>
            <Text style={styles.body}>Ein klares Ziel hilft dranzubleiben. Zum Beispiel:</Text>
            <View style={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s.label}
                  onPress={() =>
                    router.push({
                      pathname: '/aufgaben/ziele/neu',
                      params: { art: s.art, zeitraum: s.zeitraum, ziel: s.ziel },
                    })
                  }
                  accessibilityRole="button"
                  style={styles.chip}>
                  <Plus size={13} color={Colors.textMuted} />
                  <Text style={styles.chipText}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        </Reveal>
      )}

      <View style={styles.goals}>
        {active.map(({ goal, progress }, i) => (
          <Reveal key={goal.id} delay={240 + i * 60}>
            <GoalCard
              goal={goal}
              progress={progress}
              delay={300 + i * 60}
              onStep={goal.kind === 'custom' ? (d) => void step(goal.id, goal.progress, d) : undefined}
            />
          </Reveal>
        ))}
      </View>

      {archived.length > 0 && (
        <View style={styles.doneWrap}>
          <TextLink
            label={showArchive ? 'Archiv ausblenden' : `Archivierte Ziele (${archived.length})`}
            onPress={() => setShowArchive((v) => !v)}
          />
          {showArchive &&
            archived.map((g) => (
              <TextLink key={g.id} label={goalTitle(g)} onPress={() => router.push(`/aufgaben/ziele/${g.id}`)} />
            ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { borderColor: 'rgba(47,227,154,0.5)', backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '500' },
  chipTextActive: { color: Colors.text, fontWeight: '600' },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21, flexShrink: 1 },
  groupHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  groupTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  late: { color: Colors.danger },
  count: { color: Colors.textFaint, fontSize: 13, fontWeight: '600' },
  doneWrap: { gap: Spacing.sm },
  footer: { color: Colors.textFaint, fontSize: 12.5, textAlign: 'center' },
  goalsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.lg,
    flexWrap: 'wrap',
  },
  goals: { gap: Spacing.md },
});
