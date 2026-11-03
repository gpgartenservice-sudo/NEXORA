import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing } from '@/constants/theme';
import { todayIso } from '@/features/documents/document-logic';
import { SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/features/navigation/nav-items';

import { GoalCard } from './goal-card';
import { todayTodos, type Todo } from './goals-logic';
import { useGoals } from './goals-provider';
import { TodoRow } from './todo-row';
import { useGoalProgress } from './use-goal-data';

/** Startseite: To-dos für heute (inkl. überfällige) und die wichtigsten Ziele. */
export function TodayCard() {
  const { todos, goals, updateTodo, error } = useGoals();
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
          {list.length === 0 ? (
            <Text style={styles.body}>Für heute steht nichts an.</Text>
          ) : (
            list.map((t) => <TodoRow key={t.id} todo={t} today={today} onToggle={toggle} />)
          )}
          <Link label={list.length ? 'Alle To-dos' : 'To-do hinzufügen'} onPress={() => router.navigate('/aufgaben')} />
        </View>
        <View style={[styles.col, row && styles.colNarrow]} testID="today-goals">
          <Text style={styles.eyebrow}>DEINE ZIELE</Text>
          {progress.length === 0 ? (
            <Text style={styles.body}>Noch keine Ziele – z. B. Umsatz pro Monat oder neue Kunden pro Woche.</Text>
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
  linkText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
});
