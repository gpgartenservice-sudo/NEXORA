import { router } from 'expo-router';
import { Star } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { StepCheck } from '@/features/roadmap/step-check';
import { useHover } from '@/hooks/use-hover';

import { dueLabel, type Todo } from './goals-logic';

type Props = {
  todo: Todo;
  today: string;
  onToggle: (todo: Todo) => void;
  /** Fälligkeit nicht anzeigen (z. B. in der Gruppe "Heute") */
  hideDue?: boolean;
};

/** Ein To-do: Haken, Titel, Fälligkeit, Kunde/Auftrag – antippen zum Bearbeiten. */
export function TodoRow({ todo, today, onToggle, hideDue }: Props) {
  const { customerById, orders } = useCrm();
  const { hovered, hoverProps } = useHover();
  const order = todo.order_id ? orders.find((o) => o.id === todo.order_id) : undefined;
  const customer = todo.customer_id ? customerById(todo.customer_id) : undefined;
  const overdue = !todo.done && !!todo.due_on && todo.due_on < today;
  const meta = [
    !hideDue && todo.due_on && !todo.done ? dueLabel(todo.due_on, today) : null,
    order ? order.title : null,
    customer && !order ? customer.name : null,
  ].filter(Boolean);

  return (
    <View style={styles.row}>
      <StepCheck checked={todo.done} onToggle={() => onToggle(todo)} label={todo.title} size={24} />
      <Pressable
        onPress={() => router.push(`/aufgaben/${todo.id}`)}
        accessibilityRole="link"
        accessibilityLabel={`${todo.title} bearbeiten`}
        style={styles.body}
        {...hoverProps}>
        <View style={styles.titleRow}>
          {todo.important && !todo.done && (
            <Star size={13} color={Colors.accent} fill={Colors.accent} accessibilityLabel="wichtig" />
          )}
          <Text style={[styles.title, todo.done && styles.titleDone, hovered && styles.titleHover]} numberOfLines={2}>
            {todo.title}
          </Text>
        </View>
        {meta.length > 0 && (
          <Text style={[styles.meta, overdue && styles.metaLate]} numberOfLines={1}>
            {meta.join(' · ')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
  body: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { color: Colors.text, fontSize: 15, flexShrink: 1 },
  titleDone: { color: Colors.textFaint, textDecorationLine: 'line-through' },
  titleHover: { textDecorationLine: 'underline' },
  meta: { color: Colors.textMuted, fontSize: 12.5 },
  metaLate: { color: Colors.danger },
});
