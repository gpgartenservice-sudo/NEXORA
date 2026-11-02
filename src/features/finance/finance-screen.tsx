import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Receipt, Repeat, Wallet } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { formatEuro } from '@/features/crm/order-logic';
import { StatRow, StatTile } from '@/features/crm/ui';
import { formatDay } from '@/features/documents/document-logic';
import { invoiceState, useDocuments } from '@/features/documents/documents-provider';
import { useHover } from '@/hooks/use-hover';

import { FinanceChart } from './finance-chart';
import {
  addMonths,
  amountIn,
  categoryLabel,
  expenseByMonth,
  fixedCostsPerMonth,
  monthKey,
  monthLabel,
  monthRange,
  orderExpenseByMonth,
  orderIncomeByMonth,
  summarize,
  sumUp,
  type MonthKey,
} from './finance-logic';
import { useFinance } from './finance-provider';
import { IncomeProofCard } from './income-proof-card';

type Mode = 'month' | 'year';

const REPEAT_LABEL = { once: '', monthly: 'monatlich', yearly: 'jährlich' } as const;

/** Bereich Finanzen: Einnahmen, Ausgaben, Gewinn, offene Rechnungen. */
export function FinanceScreen() {
  const { orders, customerById, error: crmError } = useCrm();
  const { documents, setPaid } = useDocuments();
  const { expenses, error } = useFinance();
  const current = monthKey(new Date());
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<MonthKey>(current);

  const year = anchor.slice(0, 4);
  const periodMonths = useMemo(
    () => (mode === 'month' ? [anchor] : monthRange(`${year}-01`, `${year}-12`)),
    [mode, anchor, year],
  );
  const period = useMemo(() => new Set(periodMonths), [periodMonths]);
  const chartMonths = useMemo(
    () => (mode === 'month' ? monthRange(addMonths(anchor, -11), anchor) : periodMonths),
    [mode, anchor, periodMonths],
  );

  const chartRows = useMemo(() => summarize(orders, expenses, chartMonths), [orders, expenses, chartMonths]);
  const totals = sumUp(summarize(orders, expenses, periodMonths));
  const fixed = fixedCostsPerMonth(expenses);

  const canNext = mode === 'month' ? anchor < current : year < current.slice(0, 4);
  const shift = (dir: 1 | -1) => setAnchor((a) => addMonths(a, mode === 'month' ? dir : dir * 12));
  const periodLabel = mode === 'month' ? monthLabel(anchor) : `Jahr ${year}`;

  // Einnahmen im Zeitraum: welche Aufträge?
  const incomeRows = orders
    .map((o) => ({ order: o, amount: amountIn(orderIncomeByMonth(o), period) }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Ausgaben im Zeitraum: allgemeine + bei Aufträgen eingetragene
  const expenseRows = [
    ...expenses.map((e) => ({ key: e.id, kind: 'general' as const, expense: e, amount: amountIn(expenseByMonth(e), period) })),
    ...orders.map((o) => ({ key: o.id, kind: 'order' as const, order: o, amount: amountIn(orderExpenseByMonth(o), period) })),
  ]
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const openInvoices = documents
    .filter((d) => d.kind === 'invoice' && !d.paid_at)
    .sort((a, b) => (a.due_on ?? '').localeCompare(b.due_on ?? ''));
  const openSum = openInvoices.reduce((s, d) => s + d.total, 0);
  const overdue = openInvoices.filter((d) => invoiceState(d) === 'overdue').length;

  return (
    <Screen maxWidth={1000}>
      <PageHeader
        title="Finanzen"
        subtitle="Einnahmen aus deinen Aufträgen, deine Ausgaben – und was übrig bleibt."
        action={<Button label="+ Ausgabe" onPress={() => router.push('/finanzen/ausgabe/neu')} style={styles.action} />}
      />
      {error === 'setup' && (
        <Notice tone="error">
          Ausgaben können noch nicht gespeichert werden: Das Datenbank-Skript für Finanzen fehlt (siehe supabase/README.md).
        </Notice>
      )}
      {crmError && <Notice tone="error">Aufträge konnten nicht geladen werden – die Einnahmen sind deshalb unvollständig.</Notice>}

      {/* Zeitraum: gilt für alles darunter */}
      <Reveal delay={120}>
        <View style={styles.periodBar}>
          <View style={styles.modeWrap}>
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                if (m === 'year' && anchor > current) setAnchor(current);
              }}
              options={[
                { value: 'month', label: 'Monat' },
                { value: 'year', label: 'Jahr' },
              ]}
            />
          </View>
          <View style={styles.stepper}>
            <StepButton dir={-1} label={mode === 'month' ? 'Vorheriger Monat' : 'Vorheriges Jahr'} onPress={() => shift(-1)} />
            <Text style={styles.periodLabel} accessibilityRole="header">
              {periodLabel}
            </Text>
            <StepButton
              dir={1}
              label={mode === 'month' ? 'Nächster Monat' : 'Nächstes Jahr'}
              onPress={() => shift(1)}
              disabled={!canNext}
            />
          </View>
        </View>
      </Reveal>

      <Reveal delay={180}>
        <StatRow>
          <StatTile label="Einnahmen" value={formatEuro(totals.income)} />
          <StatTile label="Ausgaben" value={formatEuro(totals.expenses)} />
          <StatTile
            label={totals.profit < 0 ? 'Verlust' : 'Gewinn'}
            value={formatEuro(totals.profit)}
            tone={totals.profit > 0 ? 'accent' : undefined}
          />
          <StatTile
            label={openInvoices.length ? `Offene Rechnungen (${openInvoices.length})` : 'Offene Rechnungen'}
            value={formatEuro(openSum)}
            tone={openInvoices.length ? undefined : 'muted'}
          />
        </StatRow>
      </Reveal>

      <Reveal delay={240}>
        <Card>
          <Text style={styles.cardTitle}>{mode === 'month' ? 'Die letzten 12 Monate' : `Verlauf ${year}`}</Text>
          <FinanceChart
            rows={chartRows}
            selected={mode === 'month' ? anchor : null}
            onSelect={(m) => {
              setMode('month');
              setAnchor(m);
            }}
          />
          <Text style={styles.hint}>Tipp: Klick auf einen Monat zeigt seine Zahlen unten.</Text>
        </Card>
      </Reveal>

      <View style={styles.columns}>
        <Reveal delay={300} style={styles.column}>
          <Card style={styles.fill}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>Offene Rechnungen</Text>
              {overdue > 0 && (
                <View style={styles.overduePill}>
                  <Text style={styles.overdueText}>{overdue} überfällig</Text>
                </View>
              )}
            </View>
            {openInvoices.length === 0 ? (
              <Text style={styles.empty}>Alles bezahlt – keine offenen Rechnungen.</Text>
            ) : (
              openInvoices.map((d) => {
                const late = invoiceState(d) === 'overdue';
                return (
                  <Row
                    key={d.id}
                    icon={<Receipt size={17} color={Colors.text} strokeWidth={1.8} />}
                    title={d.number}
                    meta={[d.data.buyer.name, d.due_on ? `${late ? 'überfällig seit' : 'fällig'} ${formatDay(d.due_on)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                    metaDanger={late}
                    amount={formatEuro(d.total)}
                    onPress={d.order_id ? () => router.push(`/auftraege/${d.order_id}`) : undefined}
                    action={
                      <Pressable
                        onPress={() => setPaid(d.id, true)}
                        accessibilityRole="button"
                        accessibilityLabel={`${d.number} als bezahlt markieren`}
                        style={styles.paidBtn}>
                        <Text style={styles.paidText}>Bezahlt</Text>
                      </Pressable>
                    }
                  />
                );
              })
            )}
          </Card>
        </Reveal>

        <Reveal delay={360} style={styles.column}>
          <Card style={styles.fill}>
            <View style={styles.titleRow}>
              <Text style={styles.cardTitle}>Ausgaben · {periodLabel}</Text>
            </View>
            {fixed > 0 && (
              <Text style={styles.hint}>Laufende Fixkosten: {formatEuro(fixed)} pro Monat</Text>
            )}
            {expenseRows.length === 0 ? (
              <Text style={styles.empty}>Keine Ausgaben in diesem Zeitraum.</Text>
            ) : (
              expenseRows.map((r) =>
                r.kind === 'general' ? (
                  <Row
                    key={r.key}
                    icon={
                      r.expense.repeat === 'once' ? (
                        <Wallet size={17} color={Colors.text} strokeWidth={1.8} />
                      ) : (
                        <Repeat size={17} color={Colors.text} strokeWidth={1.8} />
                      )
                    }
                    title={r.expense.title}
                    meta={[categoryLabel(r.expense.category), REPEAT_LABEL[r.expense.repeat]].filter(Boolean).join(' · ')}
                    amount={formatEuro(r.amount)}
                    onPress={() => router.push(`/finanzen/ausgabe/${r.expense.id}`)}
                  />
                ) : (
                  <Row
                    key={r.key}
                    icon={<Wallet size={17} color={Colors.text} strokeWidth={1.8} />}
                    title={r.order.title}
                    meta="Ausgabe beim Auftrag"
                    amount={formatEuro(r.amount)}
                    onPress={() => router.push(`/auftraege/${r.order.id}`)}
                  />
                ),
              )
            )}
            <Button label="+ Ausgabe eintragen" variant="secondary" onPress={() => router.push('/finanzen/ausgabe/neu')} />
          </Card>
        </Reveal>
      </View>

      <Reveal delay={420}>
        <Card>
          <Text style={styles.cardTitle}>Einnahmen · {periodLabel}</Text>
          {incomeRows.length === 0 ? (
            <Text style={styles.empty}>
              Noch keine Einnahmen in diesem Zeitraum. Einnahmen zählen, sobald ein Auftrag abgeschlossen ist (monatliche
              Aufträge Monat für Monat).
            </Text>
          ) : (
            incomeRows.map(({ order, amount }) => (
              <Row
                key={order.id}
                icon={<Text style={styles.euro}>€</Text>}
                title={order.title}
                meta={[customerById(order.customer_id)?.name, order.billing === 'monthly' ? 'monatlich' : null]
                  .filter(Boolean)
                  .join(' · ')}
                amount={formatEuro(amount)}
                onPress={() => router.push(`/auftraege/${order.id}`)}
              />
            ))
          )}
        </Card>
      </Reveal>

      <Reveal delay={480}>
        <IncomeProofCard />
      </Reveal>

      <Text style={styles.disclaimer}>
        Vereinfachte Übersicht aus deinen Aufträgen und Ausgaben – ersetzt keine Buchhaltung und keine Steuerberatung.
      </Text>
    </Screen>
  );
}

function StepButton({ dir, label, onPress, disabled }: { dir: 1 | -1; label: string; onPress: () => void; disabled?: boolean }) {
  const { hovered, hoverProps } = useHover();
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      {...hoverProps}
      style={[styles.step, hovered && !disabled && styles.stepHover, disabled && styles.stepDisabled]}>
      <Icon size={18} color={Colors.text} />
    </Pressable>
  );
}

function Row({
  icon,
  title,
  meta,
  metaDanger,
  amount,
  onPress,
  action,
}: {
  icon: ReactNode;
  title: string;
  meta?: string;
  metaDanger?: boolean;
  amount: string;
  onPress?: () => void;
  action?: ReactNode;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <View style={styles.rowWrap}>
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        accessibilityRole={onPress ? 'link' : undefined}
        {...hoverProps}
        style={[styles.row, hovered && !!onPress && styles.rowHover]}>
        <View style={styles.rowIcon}>{icon}</View>
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Text>
          {!!meta && <Text style={[styles.rowMeta, metaDanger && styles.danger]}>{meta}</Text>}
        </View>
        <Text style={styles.rowAmount}>{amount}</Text>
      </Pressable>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { paddingHorizontal: Spacing.xl },
  periodBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  modeWrap: { width: 220 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  periodLabel: { color: Colors.text, fontSize: 17, fontWeight: '700', minWidth: 150, textAlign: 'center' },
  step: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepHover: { borderColor: Colors.borderFocus },
  stepDisabled: { opacity: 0.35 },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  hint: { color: Colors.textFaint, fontSize: 13, lineHeight: 18 },
  empty: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  column: { flexGrow: 1, flexBasis: 340 },
  fill: { flex: 1 },
  overduePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,107,107,0.35)',
    backgroundColor: 'rgba(255,107,107,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  overdueText: { color: Colors.danger, fontSize: 12, fontWeight: '600' },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  rowHover: { backgroundColor: Colors.surfaceRaised },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  euro: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  rowTexts: { flex: 1, gap: 1 },
  rowTitle: { color: Colors.text, fontSize: 14.5, fontWeight: '600' },
  rowMeta: { color: Colors.textMuted, fontSize: 12.5 },
  danger: { color: Colors.danger },
  rowAmount: { color: Colors.text, fontSize: 14.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  paidBtn: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  paidText: { color: Colors.text, fontSize: 12.5, fontWeight: '600' },
  disclaimer: { color: Colors.textFaint, fontSize: 12.5, textAlign: 'center' },
});
