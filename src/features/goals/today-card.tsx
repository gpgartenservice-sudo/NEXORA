import { router } from 'expo-router';
import { ArrowRight, Plus, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing } from '@/constants/theme';
import { todayIso } from '@/features/documents/document-logic';
import { SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/features/navigation/nav-items';
import { useProfile } from '@/providers/profile-provider';

import { GoalCard } from './goal-card';
import { todayTodos, type Todo } from './goals-logic';
import { useGoals } from './goals-provider';
import { TodoRow } from './todo-row';
import { useGoalProgress } from './use-goal-data';

/** Startseite: To-dos für heute (inkl. überfällige) und die wichtigsten Ziele. */
export function TodayCard() {
  const { todos, goals, updateTodo, createTodo, error } = useGoals();
  const { profile } = useProfile();
  const [adding, setAdding] = useState<string | null>(null);
  const [today] = useState(() => todayIso());
  const [failure, setFailure] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const contentWidth = width >= SIDEBAR_BREAKPOINT ? width - SIDEBAR_WIDTH : width;
  const row = contentWidth >= 900;
  const list = todayTodos(todos, today, 5);
  const openToday = todos.filter((t) => !t.done && t.due_on && t.due_on <= today).length;
  const progress = useGoalProgress(goals, today).slice(0, 3);

  if (error) return null;

  const toggle = async (todo: Todo) => {
    const { error: err } = await updateTodo(todo.id, { done: !todo.done });
    setFailure(err ?? null);
  };

  return (
    <Card>
      <View style={[styles.cols, row && styles.row]}>
        <View style={[styles.col, row && styles.colWide]} testID="today-todos">
          <View style={styles.head}>
            <Text style={styles.eyebrow}>HEUTE ZU TUN</Text>
            {openToday > list.length && <Text style={styles.more}>+{openToday - list.length} weitere</Text>}
          </View>
          {todos.length === 0 ? (
            // Ganz am Anfang: erster Schritt mit Vorschlägen zum Antippen
            <View style={styles.starter}>
              <View style={styles.starterHead}>
                <View style={styles.starterIcon}>
                  <Sparkles size={18} color={Colors.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.starterTitle}>Dein erstes To-do</Text>
                  <Text style={styles.body}>Tipp einen Vorschlag an – fertig.</Text>
                </View>
              </View>
              <View style={styles.chips}>
                {starterTodos(profile?.stage).map((title) => (
                  <Pressable
                    key={title}
                    disabled={!!adding}
                    accessibilityRole="button"
                    accessibilityLabel={`To-do „${title}“ für heute anlegen`}
                    onPress={async () => {
                      setAdding(title);
                      const r = await createTodo({ title, due_on: today });
                      setAdding(null);
                      setFailure(r.error ?? null);
                    }}
                    style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}>
                    <Plus size={14} color={Colors.accent} strokeWidth={2.6} />
                    <Text style={styles.chipText}>{adding === title ? 'Wird angelegt …' : title}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : list.length === 0 ? (
            <Text style={styles.body}>Heute steht nichts an. 🎉</Text>
          ) : (
            list.map((t) => <TodoRow key={t.id} todo={t} today={today} onToggle={toggle} />)
          )}
          <Link label={list.length ? 'Alle To-dos' : 'To-do hinzufügen'} onPress={() => router.navigate('/aufgaben')} />
        </View>
        <View style={[styles.col, row && styles.colNarrow]} testID="today-goals">
          <Text style={styles.eyebrow}>DEINE ZIELE</Text>
          {progress.length === 0 ? (
            <Text style={styles.body}>Noch keine Ziele – z. B. Umsatz pro Monat.</Text>
          ) : (
            progress.map(({ goal, progress: p }, i) => (
              <GoalCard key={goal.id} goal={goal} progress={p} compact delay={400 + i * 80} />
            ))
          )}
          <Link
            label={progress.length ? 'Alle Ziele' : 'Ziel setzen'}
            onPress={() => router.navigate({ pathname: '/aufgaben', params: { ansicht: 'ziele' } })}
          />
        </View>
      </View>
      {failure && <Notice tone="error">{failure}</Notice>}
    </Card>
  );
}

/** Vorschläge für das allererste To-do – passend zur Phase */
function starterTodos(stage?: string | null): string[] {
  if (stage === 'idea') return ['Meine Idee in einem Satz aufschreiben', 'Gewerbeanmeldung informieren', 'Logo-Ideen sammeln'];
  if (stage === 'growing') return ['Preise überprüfen', 'Offene Rechnungen durchgehen', 'Social-Media-Post planen'];
  if (stage === 'stuck') return ['Aufschreiben, was mich gerade aufhält', 'Einen Kunden um Feedback bitten', 'Eine Sache diese Woche ändern'];
  return ['Firmendaten & Logo eintragen', 'Ersten Kunden einladen', 'Woche planen'];
}

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
      <ArrowRight size={14} color={Colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cols: { gap: Spacing.xl },
  row: { flexDirection: 'row' },
  col: { gap: Spacing.sm },
  colWide: { flex: 1.4 },
  colNarrow: { flex: 1 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  more: { color: Colors.textFaint, fontSize: 12.5, fontWeight: '600' },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.xs, alignSelf: 'flex-start' },
  flex: { flex: 1 },
  starter: {
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.25)',
    backgroundColor: Colors.accentSoft,
  },
  starterHead: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  starterIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(47,227,154,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  starterTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  chipPressed: { borderColor: Colors.accent, transform: [{ scale: 0.97 }] },
  chipText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  linkText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
});
