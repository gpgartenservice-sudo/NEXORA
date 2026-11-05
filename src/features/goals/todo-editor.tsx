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
import { TextLink } from '@/components/ui/text-link';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { TourTarget } from '@/features/tutorial/tour-target';
import { useCrm } from '@/features/crm/crm-provider';

import type { Todo } from './goals-logic';
import { useGoals } from './goals-provider';

/** Zurück zu den To-dos (sonst neu öffnen) */
const back = () => (router.canGoBack() ? router.back() : router.navigate('/aufgaben'));

/** To-do bearbeiten (Route /aufgaben/[id]) */
export function TodoEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { todos, loading } = useGoals();
  const todo = todos.find((t) => t.id === id);
  if (!todo) {
    return (
      <Screen maxWidth={680}>
        <PageHeader title="To-do" back={{ label: 'To-dos', onPress: back }} />
        {!loading && <Notice>Dieses To-do gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  // Schlüssel aus dem Inhalt: von außen geändert (z. B. Nexy) -> frisch mit den neuen Werten
  return <TodoEditor key={JSON.stringify(todo)} todo={todo} />;
}

function TodoEditor({ todo }: { todo: Todo }) {
  const { updateTodo, deleteTodo } = useGoals();
  const { customers, orders, customerById } = useCrm();
  const [title, setTitle] = useState(todo.title);
  const [notes, setNotes] = useState(todo.notes ?? '');
  const [due, setDue] = useState<string | null>(todo.due_on);
  const [important, setImportant] = useState(todo.important);
  const [done, setDone] = useState(todo.done);
  const [customerId, setCustomerId] = useState<string | null>(todo.customer_id);
  const [orderId, setOrderId] = useState<string | null>(todo.order_id);
  const [query, setQuery] = useState('');
  const [titleError, setTitleError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const order = orderId ? orders.find((o) => o.id === orderId) : undefined;
  const customer = customerId ? customerById(customerId) : undefined;
  const q = query.trim().toLowerCase();
  // Suche über Kunden und Aufträge
  const customerMatches = q
    ? customers.filter((c) => [c.name, c.company].some((v) => v?.toLowerCase().includes(q))).slice(0, 4)
    : [];
  const orderMatches = q
    ? orders
        .filter(
          (o) => !o.cancelled && [o.title, customerById(o.customer_id)?.name].some((v) => v?.toLowerCase().includes(q)),
        )
        .slice(0, 4)
    : [];

  const save = async () => {
    if (!title.trim()) return setTitleError('Was ist zu tun?');
    setSaving(true);
    setFailure(null);
    setInfo(null);
    const { error } = await updateTodo(todo.id, {
      title: title.trim(),
      notes: notes.trim() || null,
      due_on: due,
      important,
      done,
      customer_id: order ? order.customer_id : customerId,
      order_id: orderId,
    });
    setSaving(false);
    if (error) return setFailure(error);
    setInfo('Gespeichert.');
  };

  return (
    <Screen maxWidth={680}>
      <PageHeader title="To-do" back={{ label: 'To-dos', onPress: back }} />
      <TourTarget id="guide.todo">
        <Reveal delay={120}>
          <Card>
            <TextField
              label="Was ist zu tun?"
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setTitleError(undefined);
              }}
              error={titleError}
              maxLength={200}
            />
            <DateField label="Fällig am (optional)" value={due} onChange={setDue} />
            {due && <TextLink label="Ohne Datum" onPress={() => setDue(null)} />}
            <ToggleRow label="Wichtig" value={important} onChange={setImportant} />
            <ToggleRow label="Erledigt" value={done} onChange={setDone} />
          </Card>
        </Reveal>
      </TourTarget>

      <Reveal delay={200}>
        <Card>
          <Text style={styles.cardTitle}>Gehört zu (optional)</Text>
          {order || customer ? (
            <View style={styles.selected}>
              <Text style={styles.selectedName}>
                {order
                  ? `Auftrag: ${order.title}${customerById(order.customer_id) ? ` · ${customerById(order.customer_id)!.name}` : ''}`
                  : `Kunde: ${customer!.name}`}
              </Text>
              <TextLink
                label="Entfernen"
                onPress={() => {
                  setOrderId(null);
                  setCustomerId(null);
                }}
              />
            </View>
          ) : (
            <View style={styles.picker}>
              <TextField
                label="Kunde oder Auftrag"
                value={query}
                onChangeText={setQuery}
                placeholder="Name oder Auftrag suchen"
                autoCorrect={false}
              />
              {orderMatches.map((o) => (
                <OptionCard
                  key={o.id}
                  compact
                  title={o.title}
                  description={`Auftrag · ${customerById(o.customer_id)?.name ?? ''}`}
                  selected={false}
                  onPress={() => {
                    setOrderId(o.id);
                    setCustomerId(o.customer_id);
                    setQuery('');
                  }}
                />
              ))}
              {customerMatches.map((c) => (
                <OptionCard
                  key={c.id}
                  compact
                  title={c.name}
                  description="Kunde"
                  selected={false}
                  onPress={() => {
                    setCustomerId(c.id);
                    setQuery('');
                  }}
                />
              ))}
            </View>
          )}
          {order && <TextLink label="Auftrag öffnen →" onPress={() => router.push(`/auftraege/${order.id}`)} />}
          {!order && customer && (
            <TextLink label="Kunde öffnen →" onPress={() => router.push(`/kunden/${customer.id}`)} />
          )}
          <TextField
            label="Notiz"
            value={notes}
            onChangeText={setNotes}
            placeholder="optional"
            multiline
            style={styles.multiline}
            maxLength={2000}
          />
        </Card>
      </Reveal>

      {failure && <Notice tone="error">{failure}</Notice>}
      {info && <Notice tone="success">{info}</Notice>}
      <Button label="Änderungen speichern" onPress={() => void save()} loading={saving} />
      <ConfirmDelete
        label="To-do löschen"
        question={`„${todo.title}“ wirklich löschen?`}
        onConfirm={async () => {
          const { error } = await deleteTodo(todo.id);
          if (error) setFailure(error);
          else back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  selected: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  selectedName: { color: Colors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  picker: { gap: Spacing.sm },
  multiline: { minHeight: 80, paddingVertical: Spacing.md, textAlignVertical: 'top' },
});
