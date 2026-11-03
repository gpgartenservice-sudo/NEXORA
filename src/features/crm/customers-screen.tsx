import { router } from 'expo-router';
import { ChevronRight, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Colors, Spacing } from '@/constants/theme';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';

import { useCrm } from './crm-provider';
import { formatEuro, outstandingRevenue, recognizedRevenue } from './order-logic';
import { CrmSetupNotice, Initials, StatRow, StatTile } from './ui';

/** Kundenübersicht mit Suche und Kennzahlen. */
export function CustomersScreen() {
  const { customers, orders, loading, error } = useCrm();
  const [query, setQuery] = useState('');
  useAreaTutorial('kunden');

  const stats = useMemo(() => {
    const per = new Map<string, { count: number; revenue: number; outstanding: number }>();
    for (const o of orders) {
      const s = per.get(o.customer_id) ?? { count: 0, revenue: 0, outstanding: 0 };
      s.count++;
      s.revenue += recognizedRevenue(o);
      s.outstanding += outstandingRevenue(o);
      per.set(o.customer_id, s);
    }
    return per;
  }, [orders]);

  const totals = useMemo(() => {
    let revenue = 0;
    let outstanding = 0;
    stats.forEach((s) => {
      revenue += s.revenue;
      outstanding += s.outstanding;
    });
    return { revenue, outstanding };
  }, [stats]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? customers.filter((c) =>
        [c.name, c.company, c.phone, c.email, c.address].some((v) => v?.toLowerCase().includes(q)),
      )
    : customers;

  const newButton = (
    <TourTarget id="kunden.neu">
      <Button label="+ Neuer Kunde" onPress={() => router.push('/kunden/neu')} style={styles.newButton} />
    </TourTarget>
  );

  return (
    <Screen maxWidth={960}>
      <PageHeader
        title="Kunden"
        subtitle={customers.length ? `${customers.length} ${customers.length === 1 ? 'Kunde' : 'Kunden'}` : undefined}
        action={customers.length ? newButton : undefined}
        help={<TutorialButton id="kunden" />}
      />
      <CrmSetupNotice error={error} />

      {!loading && customers.length === 0 && !error ? (
        <TourTarget id="kunden.neu">
          <Reveal delay={200}>
            <Card style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Users size={28} color={Colors.accent} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>Lege deinen ersten Kunden an</Text>
              <Text style={styles.emptyText}>
                Kontaktdaten, Notizen und alle Aufträge an einem Ort – und du siehst sofort, wie viel Umsatz jeder Kunde
                bringt.
              </Text>
              <Button label="+ Ersten Kunden anlegen" onPress={() => router.push('/kunden/neu')} />
            </Card>
          </Reveal>
        </TourTarget>
      ) : (
        <>
          <TourTarget id="kunden.zahlen">
            <Reveal delay={150}>
              <StatRow>
                <StatTile label="Kunden" value={String(customers.length)} />
                <StatTile label="Umsatz (realisiert)" value={formatEuro(totals.revenue)} tone="accent" />
                <StatTile label="Anstehende Einnahmen" value={formatEuro(totals.outstanding)} />
              </StatRow>
            </Reveal>
          </TourTarget>

          <TourTarget id="kunden.suche">
            <Reveal delay={230}>
              <TextField
                label="Suchen"
                value={query}
                onChangeText={setQuery}
                placeholder="Name, Firma, Telefon oder E-Mail"
                autoCorrect={false}
              />
            </Reveal>
          </TourTarget>

          <View style={styles.list}>
            {visible.map((c, i) => {
              const s = stats.get(c.id);
              return (
                <Reveal key={c.id} delay={Math.min(300 + i * 45, 800)}>
                  <Card onPress={() => router.push(`/kunden/${c.id}`)} accessibilityLabel={c.name}>
                    <View style={styles.row}>
                      <Initials name={c.name} />
                      <View style={styles.rowTexts}>
                        <Text style={styles.name} numberOfLines={1}>
                          {c.name}
                        </Text>
                        <Text style={styles.sub} numberOfLines={1}>
                          {[c.company, c.phone, c.email].filter(Boolean).join(' · ') || 'Keine Kontaktdaten'}
                        </Text>
                      </View>
                      <View style={styles.rowStats}>
                        <Text style={styles.revenue}>{formatEuro(s?.revenue ?? 0)}</Text>
                        <Text style={styles.sub}>
                          {s?.count ?? 0} {(s?.count ?? 0) === 1 ? 'Auftrag' : 'Aufträge'}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={Colors.textFaint} />
                    </View>
                  </Card>
                </Reveal>
              );
            })}
            {q && visible.length === 0 && (
              <View style={styles.noResult}>
                <Text style={styles.sub}>Kein Kunde gefunden für „{query.trim()}“.</Text>
                <Button
                  label={`„${query.trim()}“ als neuen Kunden anlegen`}
                  variant="secondary"
                  onPress={() => router.push({ pathname: '/kunden/neu', params: { name: query.trim() } })}
                />
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  newButton: { minWidth: 170 },
  list: { gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  rowTexts: { flex: 1, gap: 2 },
  rowStats: { alignItems: 'flex-end', gap: 2 },
  name: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  revenue: { color: Colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  noResult: { gap: Spacing.md, alignItems: 'flex-start' },
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
