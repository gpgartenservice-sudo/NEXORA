import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Spacing } from '@/constants/theme';
import { formatEuro, parseEuro } from '@/features/crm/order-logic';
import { todayIso } from '@/features/documents/document-logic';

import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseRepeat } from './finance-logic';
import { useFinance, type Expense } from './finance-provider';

/** Zurück zu Finanzen – mit dem dort gewählten Zeitraum (sonst neu öffnen). */
const back = () => (router.canGoBack() ? router.back() : router.navigate('/finanzen'));

/** Neue Ausgabe */
export function ExpenseNewScreen() {
  return <ExpenseEditor />;
}

/** Ausgabe bearbeiten (Route /finanzen/ausgabe/[id]) */
export function ExpenseEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { expenses, loading } = useFinance();
  const expense = expenses.find((e) => e.id === id);
  if (!expense) {
    return (
      <Screen maxWidth={640}>
        <PageHeader title="Ausgabe" back={{ label: 'Finanzen', onPress: back }} />
        {!loading && <Notice>Diese Ausgabe gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  return <ExpenseEditor key={expense.id} expense={expense} />;
}

function ExpenseEditor({ expense }: { expense?: Expense }) {
  const { createExpense, updateExpense, deleteExpense, error: setupError } = useFinance();
  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(
    expense ? expense.amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
  );
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'other');
  const [repeat, setRepeat] = useState<ExpenseRepeat>(expense?.repeat ?? 'once');
  const [spentOn, setSpentOn] = useState<string | null>(expense?.spent_on ?? todayIso());
  const [endsOn, setEndsOn] = useState<string | null>(expense?.ends_on ?? null);
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [errors, setErrors] = useState<{ title?: string; amount?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const recurring = repeat !== 'once';
  const parsed = parseEuro(amount);

  const save = async () => {
    const next = {
      title: title.trim() ? undefined : 'Wofür war die Ausgabe?',
      amount:
        parsed === null
          ? 'Bitte gib einen Betrag ein.'
          : parsed === 'invalid' || parsed <= 0
            ? 'Bitte einen Betrag wie 49,90 eingeben.'
            : undefined,
    };
    setErrors(next);
    setFailure(null);
    if (next.title || next.amount || typeof parsed !== 'number') return;
    if (!spentOn) return setFailure('Bitte ein Datum wählen.');
    if (recurring && endsOn && endsOn < spentOn) return setFailure('Das Ende liegt vor dem Start.');
    setSaving(true);
    const input = {
      title: title.trim(),
      amount: parsed,
      category,
      repeat,
      spent_on: spentOn,
      ends_on: recurring ? endsOn : null,
      notes: notes.trim() || null,
    };
    const { error } = expense ? await updateExpense(expense.id, input) : await createExpense(input);
    setSaving(false);
    if (error) return setFailure(error);
    back();
  };

  return (
    <Screen maxWidth={640}>
      <PageHeader
        title={expense ? 'Ausgabe bearbeiten' : 'Neue Ausgabe'}
        subtitle={expense ? undefined : 'Für alles, was dein Business kostet – einmalig oder regelmäßig.'}
        back={{ label: 'Finanzen', onPress: back }}
      />
      {setupError === 'setup' && (
        <Notice tone="error">Das Datenbank-Skript für Finanzen fehlt noch (siehe supabase/README.md).</Notice>
      )}
      <Reveal delay={160}>
        <Card>
          <TextField
            label="Wofür? *"
            value={title}
            onChangeText={(v) => {
              setTitle(v);
              setErrors((e) => ({ ...e, title: undefined }));
            }}
            error={errors.title}
            placeholder="z. B. Canva Pro, Akku-Schrauber, Flyer"
            maxLength={200}
          />
          <TextField
            label={repeat === 'monthly' ? 'Betrag pro Monat in € *' : repeat === 'yearly' ? 'Betrag pro Jahr in € *' : 'Betrag in € *'}
            value={amount}
            onChangeText={(v) => {
              setAmount(v);
              setErrors((e) => ({ ...e, amount: undefined }));
            }}
            error={errors.amount}
            placeholder="z. B. 49,90"
            keyboardType="decimal-pad"
          />
          <Segmented
            label="Wie oft?"
            value={repeat}
            onChange={setRepeat}
            options={[
              { value: 'once', label: 'Einmalig' },
              { value: 'monthly', label: 'Monatlich' },
              { value: 'yearly', label: 'Jährlich' },
            ]}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <DateField label={recurring ? 'Erste Zahlung' : 'Datum'} value={spentOn} onChange={setSpentOn} />
            </View>
            {recurring && (
              <View style={styles.flex}>
                <DateField label="Letzte Zahlung" value={endsOn} onChange={setEndsOn} hint="Leer = läuft weiter" />
              </View>
            )}
          </View>
          {recurring && typeof parsed === 'number' && parsed > 0 && (
            <Text style={styles.hint}>
              {repeat === 'monthly'
                ? `Das sind ${formatEuro(parsed * 12)} im Jahr.`
                : `Das sind ${formatEuro(parsed / 12)} pro Monat.`}
            </Text>
          )}
        </Card>
      </Reveal>

      <Reveal delay={220}>
        <Card>
          <Text style={styles.label}>Kategorie</Text>
          <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Kategorie">
            {EXPENSE_CATEGORIES.map((c) => {
              const active = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  onPress={() => setCategory(c.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <TextField
            label="Notiz"
            value={notes}
            onChangeText={setNotes}
            placeholder="optional, z. B. Rechnungsnummer des Händlers"
            multiline
            style={styles.multiline}
            maxLength={2000}
          />
        </Card>
      </Reveal>

      {failure && <Notice tone="error">{failure}</Notice>}
      <Button label={expense ? 'Änderungen speichern' : 'Ausgabe speichern'} onPress={save} loading={saving} />
      {expense && (
        <ConfirmDelete
          label="Ausgabe löschen"
          question={`„${expense.title}“ wirklich löschen?${expense.repeat !== 'once' ? ' Sie verschwindet dann aus allen Monaten.' : ''}`}
          onConfirm={async () => {
            const { error } = await deleteExpense(expense.id);
            if (error) setFailure(error);
            else back();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  flex: { flex: 1, minWidth: 200 },
  hint: { color: Colors.textFaint, fontSize: 13 },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipActive: { borderColor: 'rgba(47,227,154,0.5)', backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '500' },
  chipTextActive: { color: Colors.text, fontWeight: '600' },
  multiline: { minHeight: 80, paddingVertical: Spacing.md, textAlignVertical: 'top' },
});
