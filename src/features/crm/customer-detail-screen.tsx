import { router, useLocalSearchParams } from 'expo-router';
import { Mail, Phone } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { TourTarget } from '@/features/tutorial/tour-target';
import { useHover } from '@/hooks/use-hover';

import { useCrm } from './crm-provider';
import { CustomerForm } from './customer-form';
import { formatEuro, outstandingRevenue, recognizedRevenue } from './order-logic';
import { OrderRow } from './order-row';
import { StatRow, StatTile } from './ui';

/** Kundenakte: Kennzahlen, Kontakt, Aufträge, Daten bearbeiten. */
export function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { customerById, ordersFor, updateCustomer, deleteCustomer, loading } = useCrm();
  const customer = customerById(id);

  if (!customer) {
    return (
      <Screen maxWidth={720}>
        <PageHeader title="Kunde" back={{ label: 'Kunden', onPress: () => router.navigate('/kunden') }} />
        {!loading && <Notice>Diesen Kunden gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }

  const orders = ordersFor(customer.id);
  const revenue = orders.reduce((sum, o) => sum + recognizedRevenue(o), 0);
  const outstanding = orders.reduce((sum, o) => sum + outstandingRevenue(o), 0);
  const expenses = orders.reduce((sum, o) => sum + (o.expenses ?? 0), 0);

  return (
    <Screen maxWidth={960}>
      <TourTarget id="guide.customer">
        <PageHeader
          title={customer.name}
          subtitle={customer.company ?? undefined}
          back={{ label: 'Kunden', onPress: () => router.navigate('/kunden') }}
          action={
            <Button
              label="+ Neuer Auftrag"
              onPress={() => router.push({ pathname: '/auftraege/neu', params: { customer: customer.id } })}
              style={styles.action}
            />
          }
          meta={
            (customer.phone || customer.email) && (
              <View style={styles.quick}>
                {!!customer.phone && (
                  <QuickAction
                    icon={<Phone size={15} color={Colors.text} />}
                    label={customer.phone}
                    onPress={() => Linking.openURL(`tel:${customer.phone!.replace(/[^\d+]/g, '')}`)}
                  />
                )}
                {!!customer.email && (
                  <QuickAction
                    icon={<Mail size={15} color={Colors.text} />}
                    label="E-Mail senden"
                    onPress={() => Linking.openURL(`mailto:${customer.email}`)}
                  />
                )}
              </View>
            )
          }
        />
      </TourTarget>

      <Reveal delay={200}>
        <StatRow>
          <StatTile label="Aufträge" value={String(orders.length)} />
          <StatTile label="Umsatz (realisiert)" value={formatEuro(revenue)} tone="accent" />
          <StatTile label="Anstehende Einnahmen" value={formatEuro(outstanding)} />
          <StatTile label="Ausgaben" value={formatEuro(expenses)} tone="muted" />
        </StatRow>
      </Reveal>

      <Reveal delay={300}>
        <Text style={styles.section}>Aufträge</Text>
      </Reveal>
      {orders.length === 0 ? (
        <Reveal delay={340}>
          <Card>
            <Text style={styles.muted}>Noch keine Aufträge für {customer.name}.</Text>
            <Button
              label="+ Ersten Auftrag anlegen"
              variant="secondary"
              onPress={() => router.push({ pathname: '/auftraege/neu', params: { customer: customer.id } })}
            />
          </Card>
        </Reveal>
      ) : (
        <View style={styles.list}>
          {orders.map((o, i) => (
            <Reveal key={o.id} delay={Math.min(340 + i * 50, 700)}>
              <TourTarget id={`guide.order.${o.id}`}>
                <OrderRow order={o} />
              </TourTarget>
            </Reveal>
          ))}
        </View>
      )}

      <Reveal delay={420}>
        <Text style={styles.section}>Kundendaten</Text>
      </Reveal>
      <Reveal delay={460}>
        <Card>
          <CustomerForm
            key={customer.id}
            initial={customer}
            submitLabel="Änderungen speichern"
            onSubmit={(input) => updateCustomer(customer.id, input)}
          />
        </Card>
      </Reveal>

      <Reveal delay={520}>
        <ConfirmDelete
          label="Kunde löschen"
          question={`${customer.name} wirklich löschen? Das lässt sich nicht rückgängig machen.`}
          disabled={orders.length > 0}
          disabledHint="Ein Kunde lässt sich nur löschen, solange ihm keine Aufträge zugeordnet sind."
          onConfirm={async () => {
            const { error } = await deleteCustomer(customer.id);
            if (!error) router.navigate('/kunden');
          }}
        />
      </Reveal>
    </Screen>
  );
}

function QuickAction({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" {...hoverProps} style={[styles.quickItem, hovered && styles.quickHover]}>
      {icon}
      <Text style={styles.quickText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  action: { minWidth: 170 },
  quick: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', marginTop: Spacing.sm },
  quickItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  quickHover: { borderColor: Colors.borderFocus },
  quickText: { color: Colors.text, fontSize: 13.5, fontWeight: '500' },
  section: { color: Colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, marginTop: Spacing.sm },
  list: { gap: Spacing.md },
  muted: { color: Colors.textMuted, fontSize: 15 },
});
