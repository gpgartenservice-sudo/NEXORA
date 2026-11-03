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
import { readReceipt } from '@/features/assistant/assistant-api';
import { formatEuro, parseEuro } from '@/features/crm/order-logic';
import { todayIso } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { useAuth } from '@/providers/auth-provider';

import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseRepeat } from './finance-logic';
import { useFinance, type Expense } from './finance-provider';
import { ReceiptCard, type ReceiptState } from './receipt-card';
import {
  deleteReceipt,
  openReceipt,
  pickReceiptFile,
  prepareReceipt,
  receiptErrorText,
  uploadReceipt,
} from './receipt-file';
import { possibleDuplicate, receiptToDraft } from './receipt-logic';

/** Zurück zu Finanzen – mit dem dort gewählten Zeitraum (sonst neu öffnen). */
const back = () => (router.canGoBack() ? router.back() : router.navigate('/finanzen'));

/** Neue Ausgabe */
export function ExpenseNewScreen() {
  return <ExpenseEditor />;
}

/** Beleg erfassen (Route /finanzen/beleg): Beleg wählen, Nexy füllt die Ausgabe aus */
export function ReceiptNewScreen() {
  const { n } = useLocalSearchParams<{ n?: string }>();
  return <ExpenseEditor key={n ?? 'beleg'} receiptMode nextKey={String(Number(n ?? 0) + 1)} />;
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

function ExpenseEditor({
  expense,
  receiptMode,
  nextKey,
}: {
  expense?: Expense;
  receiptMode?: boolean;
  /** Beleg-Modus: Schlüssel für den nächsten Beleg (frisches Formular) */
  nextKey?: string;
}) {
  const { expenses, createExpense, updateExpense, deleteExpense, error: setupError } = useFinance();
  const { user } = useAuth();
  // Vorsteuer nur bei Regelbesteuerung (Kleinunternehmer: Feld ausgeblendet)
  const { seller } = useDocuments();
  const showVat = !seller.small_business;
  const [title, setTitle] = useState(expense?.title ?? '');
  const [amount, setAmount] = useState(
    expense ? expense.amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
  );
  const [category, setCategory] = useState<ExpenseCategory>(expense?.category ?? 'other');
  const [repeat, setRepeat] = useState<ExpenseRepeat>(expense?.repeat ?? 'once');
  const [spentOn, setSpentOn] = useState<string | null>(expense?.spent_on ?? todayIso());
  const [endsOn, setEndsOn] = useState<string | null>(expense?.ends_on ?? null);
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [vat, setVat] = useState(
    expense?.vat_amount ? expense.vat_amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
  );
  const [errors, setErrors] = useState<{ title?: string; amount?: string; vat?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptState>(
    expense?.receipt_path
      ? { kind: 'saved', path: expense.receipt_path, mime: expense.receipt_mime ?? 'image/jpeg' }
      : null,
  );
  const [reading, setReading] = useState(false);
  const [hints, setHints] = useState<string[]>([]);

  const recurring = repeat !== 'once';
  const parsed = parseEuro(amount);
  const parsedVat = parseEuro(vat);
  const duplicate = possibleDuplicate(expenses, typeof parsed === 'number' ? parsed : null, spentOn, expense?.id);

  /** Beleg wählen; bei einer neuen Ausgabe liest Nexy ihn gleich aus */
  const pick = async (camera: boolean) => {
    const file = await pickReceiptFile(camera);
    if (!file) return;
    setFailure(null);
    let prepared;
    try {
      prepared = await prepareReceipt(file);
    } catch (e) {
      return setFailure(receiptErrorText(e));
    }
    setReceipt({ kind: 'new', file: prepared });
    if (expense) return;
    setReading(true);
    setHints([]);
    const { data, error } = await readReceipt(prepared.base64, prepared.mime);
    setReading(false);
    if (error) return setHints([error]);
    const { draft, warnings } = receiptToDraft(data, todayIso());
    setHints(warnings);
    if (!draft) return;
    // nur übernehmen, was noch leer bzw. unverändert ist
    if (!title.trim()) setTitle(draft.title);
    if (!amount.trim() && draft.amount !== null)
      setAmount(draft.amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    if (category === 'other') setCategory(draft.category);
    if (repeat === 'once') setRepeat(draft.repeat);
    if (draft.spent_on && (!spentOn || spentOn === todayIso())) setSpentOn(draft.spent_on);
    if (!notes.trim() && draft.notes) setNotes(draft.notes);
    if (!vat.trim() && draft.vat_amount !== null)
      setVat(draft.vat_amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setErrors({});
  };

  const save = async (next?: 'next') => {
    const problems = {
      title: title.trim() ? undefined : 'Wofür war die Ausgabe?',
      amount:
        parsed === null
          ? 'Bitte gib einen Betrag ein.'
          : parsed === 'invalid' || parsed <= 0
            ? 'Bitte einen Betrag wie 49,90 eingeben.'
            : undefined,
      vat:
        !showVat || parsedVat === null
          ? undefined
          : parsedVat === 'invalid' || parsedVat < 0
            ? 'Bitte einen Betrag wie 7,97 eingeben.'
            : typeof parsed === 'number' && parsedVat >= parsed
              ? 'Die Umsatzsteuer muss kleiner als der Betrag sein.'
              : undefined,
    };
    setErrors(problems);
    setFailure(null);
    if (problems.title || problems.amount || problems.vat || typeof parsed !== 'number') return;
    if (!spentOn) return setFailure('Bitte ein Datum wählen.');
    if (recurring && endsOn && endsOn < spentOn) return setFailure('Das Ende liegt vor dem Start.');
    setSaving(true);
    // neuer Beleg: erst sicher ablegen, dann die Ausgabe speichern
    let uploaded: string | null = null;
    if (receipt?.kind === 'new') {
      if (!user) {
        setSaving(false);
        return setFailure('Bitte melde dich neu an.');
      }
      const up = await uploadReceipt(user.id, receipt.file);
      if (up.error || !up.path) {
        setSaving(false);
        return setFailure(up.error ?? 'Der Beleg konnte nicht hochgeladen werden.');
      }
      uploaded = up.path;
    }
    const previous = expense?.receipt_path ?? null;
    const receiptFields =
      receipt?.kind === 'new'
        ? { receipt_path: uploaded, receipt_mime: receipt.file.mime }
        : receipt
          ? {}
          : previous
            ? { receipt_path: null, receipt_mime: null }
            : {};
    const input = {
      title: title.trim(),
      amount: parsed,
      category,
      repeat,
      spent_on: spentOn,
      ends_on: recurring ? endsOn : null,
      notes: notes.trim() || null,
      ...receiptFields,
      // nur senden, wenn sichtbar und etwas drinsteht bzw. vorher drinstand
      ...(showVat && (typeof parsedVat === 'number' || expense?.vat_amount)
        ? { vat_amount: typeof parsedVat === 'number' && parsedVat > 0 ? parsedVat : null }
        : {}),
    };
    const { error } = expense ? await updateExpense(expense.id, input) : await createExpense(input);
    setSaving(false);
    if (error) {
      if (uploaded) void deleteReceipt(uploaded);
      return setFailure(error);
    }
    // ersetzter oder entfernter Beleg: alte Datei weg
    if (previous && (receipt?.kind === 'new' || !receipt)) void deleteReceipt(previous);
    if (next === 'next') router.replace({ pathname: '/finanzen/beleg', params: { n: nextKey ?? '1' } });
    else back();
  };

  return (
    <Screen maxWidth={640}>
      <PageHeader
        title={expense ? 'Ausgabe bearbeiten' : receiptMode ? 'Beleg erfassen' : 'Neue Ausgabe'}
        subtitle={
          expense
            ? undefined
            : receiptMode
              ? 'Kassenbon, Rechnung oder Quittung – als Foto oder PDF.'
              : 'Für alles, was dein Business kostet – einmalig oder regelmäßig.'
        }
        back={{ label: 'Finanzen', onPress: back }}
      />
      {setupError === 'setup' && (
        <Notice tone="error">Das Datenbank-Skript für Finanzen fehlt noch (siehe supabase/README.md).</Notice>
      )}
      {receiptMode && (
        <Reveal delay={120}>
          <ReceiptCard
            receipt={receipt}
            reading={reading}
            prominent
            onPick={(camera) => void pick(camera)}
            onRemove={() => setReceipt(null)}
            onView={() => undefined}
          />
        </Reveal>
      )}
      {hints.map((h) => (
        <Notice key={h}>{h}</Notice>
      ))}
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
          {showVat && (
            <TextField
              label={repeat === 'once' ? 'Darin enthaltene Umsatzsteuer in €' : 'Darin enthaltene Umsatzsteuer je Zahlung in €'}
              value={vat}
              onChangeText={(v) => {
                setVat(v);
                setErrors((e) => ({ ...e, vat: undefined }));
              }}
              error={errors.vat}
              placeholder="optional, z. B. 7,97 – steht auf dem Beleg"
              keyboardType="decimal-pad"
            />
          )}
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
                  aria-checked={active}
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

      {!receiptMode && (
        <Reveal delay={260}>
          <ReceiptCard
            receipt={receipt}
            reading={reading}
            onPick={(camera) => void pick(camera)}
            onRemove={() => setReceipt(null)}
            onView={async () => {
              if (receipt?.kind !== 'saved') return;
              const err = await openReceipt(receipt.path);
              if (err) setFailure(err);
            }}
          />
        </Reveal>
      )}

      {duplicate && (
        <Notice>
          {`Sieht aus wie „${duplicate.title}“ vom ${duplicate.spent_on.split('-').reverse().join('.')} (gleicher Betrag) – schon erfasst?`}
        </Notice>
      )}
      {failure && <Notice tone="error">{failure}</Notice>}
      <Button
        label={expense ? 'Änderungen speichern' : 'Ausgabe speichern'}
        onPress={() => void save()}
        loading={saving}
        disabled={reading}
      />
      {receiptMode && (
        <Button
          label="Speichern & nächster Beleg"
          variant="secondary"
          onPress={() => void save('next')}
          disabled={saving || reading}
        />
      )}
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
