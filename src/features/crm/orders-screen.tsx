import { router } from 'expo-router';
import { Briefcase } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Colors, Spacing } from '@/constants/theme';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';

import { useCrm } from './crm-provider';
import { computeStatus, formatEuro, outstandingRevenue, recognizedRevenue, statusGroup, type StatusGroup } from './order-logic';
import { OrderRow } from './order-row';
import { CrmSetupNotice, StatRow, StatTile } from './ui';

type Filter = 'all' | StatusGroup;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'new', label: 'Neu' },
  { key: 'progress', label: 'In Bearbeitung' },
  { key: 'done', label: 'Abgeschlossen' },
  { key: 'cancelled', label: 'Storniert' },
];

/** Alle Aufträge mit Filter nach Status. */
export function OrdersScreen() {
  const { orders, customerById, loading, error, customers } = useCrm();
  const [filter, setFilter] = useState<Filter>('all');
  useAreaTutorial('auftraege');

  const groups = useMemo(() => orders.map((o) => ({ order: o, group: statusGroup(computeStatus(o)) })), [orders]);
  const count = (f: Filter) => (f === 'all' ? groups.length : groups.filter((g) => g.group === f).length);
  const visible = filter === 'all' ? groups : groups.filter((g) => g.group === filter);
  const revenue = orders.reduce((s, o) => s + recognizedRevenue(o), 0);
  const outstanding = orders.reduce((s, o) => s + outstandingRevenue(o), 0);

  const newOrder = () => router.push(customers.length ? '/auftraege/neu' : '/kunden/neu');

  return (
    <Screen maxWidth={960}>
      <PageHeader
        title="Aufträge"
        subtitle={orders.length ? `${count('new') + count('progress')} offen · ${count('done')} abgeschlossen` : undefined}
        action={
          orders.length ? (
            <TourTarget id="auftraege.neu">
              <Button label="+ Neuer Auftrag" onPress={newOrder} style={styles.action} />
            </TourTarget>
          ) : undefined
        }
        help={<TutorialButton id="auftraege" />}
      />
      <CrmSetupNotice error={error} />

      {!loading && orders.length === 0 && !error ? (
        <TourTarget id="auftraege.neu">
          <Reveal delay={200}>
            <Card style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Briefcase size={28} color={Colors.accent} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>Noch keine Aufträge</Text>
              <Text style={styles.emptyText}>
                Vom ersten Kontakt bis zum Abschluss: Trag ein, was passiert – der Status aktualisiert sich von selbst.
              </Text>
              <Button label={customers.length ? '+ Ersten Auftrag anlegen' : '+ Erst einen Kunden anlegen'} onPress={newOrder} />
            </Card>
          </Reveal>
        </TourTarget>
      ) : (
        <>
          <TourTarget id="auftraege.zahlen">
            <Reveal delay={150}>
              <StatRow>
                <StatTile label="Offene Aufträge" value={String(count('new') + count('progress'))} />
                <StatTile label="Umsatz (realisiert)" value={formatEuro(revenue)} tone="accent" />
                <StatTile label="Anstehende Einnahmen" value={formatEuro(outstanding)} />
              </StatRow>
            </Reveal>
          </TourTarget>

          <TourTarget id="auftraege.filter">
            <Reveal delay={220}>
              <View style={styles.filters} accessibilityRole="tablist">
                {FILTERS.map((f) => {
                  const active = filter === f.key;
                  return (
                    <Pressable
                      key={f.key}
                      onPress={() => setFilter(f.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      style={[styles.chip, active && styles.chipActive]}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {f.label} <Text style={styles.chipCount}>{count(f.key)}</Text>
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Reveal>
          </TourTarget>

          <View style={styles.list}>
            {visible.map(({ order }, i) => (
              <Reveal key={order.id} delay={Math.min(280 + i * 45, 760)}>
                <OrderRow order={order} customerName={customerById(order.customer_id)?.name} />
              </Reveal>
            ))}
            {visible.length === 0 && <Text style={styles.none}>Keine Aufträge in dieser Ansicht.</Text>}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: { minWidth: 170 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: Colors.text, borderColor: Colors.text },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
  chipTextActive: { color: Colors.background },
  chipCount: { opacity: 0.6 },
  list: { gap: Spacing.md },
  none: { color: Colors.textMuted, fontSize: 14, paddingVertical: Spacing.lg },
  empty: { alignItems: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: Colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 440 },
});
