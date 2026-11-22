import { router } from 'expo-router';
import { Crown } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatDate } from '@/components/ui/date-utils';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Colors, Spacing } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useAccess } from '@/features/team/team-provider';
import { useAuth } from '@/providers/auth-provider';

import { useCrm, type Order } from './crm-provider';
import { computeStatus, finalPrice, formatEuro, isMonthly } from './order-logic';
import { orderLeadDone, useOrderLead } from './order-lead';
import { StatusPill } from './status-pill';
import { StatusStepper } from './status-stepper';

/**
 * Auftrag nur ansehen (Mitarbeiter ohne Recht „Aufträge bearbeiten“): Stand, Termine, Beschreibung –
 * ohne Preise (nur mit Recht „Finanzen“), Ausgaben und interne Notizen.
 * Der Teamleiter eines Einsatzes zu diesem Auftrag kann ihn abhaken oder wieder öffnen.
 */
export function OrderView({ order }: { order: Order }) {
  const { customerById, reload } = useCrm();
  const access = useAccess();
  const { user } = useAuth();
  const lead = useOrderLead(order.id, user?.id);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const customer = customerById(order.customer_id);
  const money = access.can('finanzen');
  const status = computeStatus(order);

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    const r = await orderLeadDone(order.id, !order.completed);
    setBusy(false);
    if (r.error) return setMessage({ tone: 'error', text: r.error });
    playSound('check');
    setMessage({ tone: 'success', text: r.completed ? 'Auftrag abgeschlossen – die Leitung sieht es sofort.' : 'Auftrag ist wieder offen.' });
    await reload();
  };

  return (
    <Screen maxWidth={720}>
      <PageHeader
        title={order.title}
        back={{ label: 'Aufträge', onPress: () => router.navigate('/auftraege') }}
        meta={
          <View style={styles.meta}>
            <StatusPill status={status} />
            {!!customer && <Text style={styles.customer}>{customer.name}</Text>}
          </View>
        }
      />

      <Reveal delay={150}>
        <Card>
          <StatusStepper status={status} />
          {status === 'cancelled' && <Text style={styles.cancelled}>Dieser Auftrag ist storniert.</Text>}
        </Card>
      </Reveal>

      {lead && !order.cancelled && (
        <Reveal delay={200}>
          <Card>
            <View style={styles.leadHead}>
              <Crown size={16} color="#FBBF24" strokeWidth={2.2} />
              <Text style={styles.leadTitle}>Du bist Teamleiter bei diesem Auftrag</Text>
            </View>
            <Text style={styles.hint}>
              {order.completed ? 'Erledigt. Falls doch noch etwas fehlt, öffne ihn wieder.' : 'Ist alles fertig? Dann hak den Auftrag ab.'}
            </Text>
            <Button
              label={order.completed ? 'Wieder öffnen' : 'Auftrag erledigt ✓'}
              variant={order.completed ? 'secondary' : 'primary'}
              onPress={() => void toggle()}
              loading={busy}
            />
          </Card>
        </Reveal>
      )}
      {!!message && <Notice tone={message.tone}>{message.text}</Notice>}

      <Reveal delay={250}>
        <Card>
          <Text style={styles.cardTitle}>Details</Text>
          <Field label="Termin" value={order.meeting_at ? formatDate(order.meeting_at, true) : null} />
          <Field label="Ausführung" value={order.execution_at ? formatDate(order.execution_at, true) : null} />
          {!!customer?.address && access.can('kunden') && <Field label="Adresse" value={customer.address} />}
          {money && (
            <Field
              label="Preis"
              value={order.price === null ? null : `${formatEuro(finalPrice(order))}${isMonthly(order) ? ' / Monat' : ''}`}
            />
          )}
          {!!order.description && <Text style={styles.description}>{order.description}</Text>}
          {!order.meeting_at && !order.execution_at && !order.description && (
            <Text style={styles.hint}>Noch keine Details eingetragen.</Text>
          )}
        </Card>
      </Reveal>

      {lead === false && (
        <Text style={styles.footnote}>
          Diesen Auftrag ändert die Leitung. Abhaken kann der Teamleiter des Einsatzes – das legt die Leitung im Arbeitsplan fest.
        </Text>
      )}
    </Screen>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xs, flexWrap: 'wrap' },
  customer: { color: Colors.textMuted, fontSize: 14 },
  cancelled: { color: Colors.danger, fontSize: 14 },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  leadHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  leadTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  field: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  fieldLabel: { color: Colors.textMuted, fontSize: 14 },
  fieldValue: { color: Colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  description: { color: Colors.text, fontSize: 15, lineHeight: 22 },
  footnote: { color: Colors.textFaint, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
