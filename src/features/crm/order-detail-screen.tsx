import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { TextLink } from '@/components/ui/text-link';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';

import { useDocuments } from '@/features/documents/documents-provider';
import { OrderDocumentsCard } from '@/features/documents/order-documents-card';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';

import { useCrm, type Order } from './crm-provider';
import {
  computeStatus,
  elapsedMonths,
  finalPrice,
  formatEuro,
  outstandingRevenue,
  parseEuro,
  recognizedRevenue,
  totalMonths,
  type Billing,
  type OrderFacts,
} from './order-logic';
import { StatusPill } from './status-pill';
import { StatusStepper } from './status-stepper';

type Draft = {
  title: string;
  description: string;
  price: string;
  discount: string;
  billing: Billing;
  contract_start: string | null;
  contract_end: string | null;
  meeting_at: string | null;
  meeting_done: boolean;
  offer_sent: boolean;
  offer_accepted: boolean;
  execution_at: string | null;
  completed: boolean;
  cancelled: boolean;
  expenses: string;
  internal_notes: string;
};

const euroText = (n: number | null) => (n === null ? '' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function toDraft(o: Order): Draft {
  return {
    title: o.title,
    description: o.description ?? '',
    price: euroText(o.price),
    discount: o.discount_percent ? String(o.discount_percent).replace('.', ',') : '',
    billing: o.billing,
    contract_start: o.contract_start,
    contract_end: o.contract_end,
    meeting_at: o.meeting_at,
    meeting_done: o.meeting_done,
    offer_sent: o.offer_sent,
    offer_accepted: o.offer_accepted,
    execution_at: o.execution_at,
    completed: o.completed,
    cancelled: o.cancelled,
    expenses: euroText(o.expenses),
    internal_notes: o.internal_notes ?? '',
  };
}

const num = (v: number | null | 'invalid') => (v === 'invalid' ? null : v);

function toFacts(d: Draft): OrderFacts {
  return {
    ...d,
    price: num(parseEuro(d.price)),
    discount_percent: num(parseEuro(d.discount)) ?? 0,
  };
}

/** Auftrag im Detail: Ablauf eintragen, Status aktualisiert sich von selbst. */
export function OrderDetailScreen() {
  const { id, mahnen } = useLocalSearchParams<{ id: string; mahnen?: string }>();
  const { orders, loading, reload: reloadOrders } = useCrm();
  const { documents, reload: reloadDocuments } = useDocuments();
  const order = orders.find((o) => o.id === id);

  // Beim Öffnen: neuester Stand der Angebote (online angenommen/abgelehnt?)
  useFocusEffect(
    useCallback(() => {
      void reloadDocuments();
    }, [reloadDocuments]),
  );
  // Online angenommen, der Auftrag weiß es aber noch nicht -> Aufträge neu laden
  const acceptedOnline = documents.some((d) => d.order_id === id && d.kind === 'offer' && !!d.accepted_at);
  const knowsAccepted = !!order?.offer_accepted;
  useEffect(() => {
    if (acceptedOnline && order && !knowsAccepted) void reloadOrders();
  }, [acceptedOnline, knowsAccepted, order, reloadOrders]);

  if (!order) {
    return (
      <Screen maxWidth={720}>
        <PageHeader title="Auftrag" back={{ label: 'Aufträge', onPress: () => router.navigate('/auftraege') }} />
        {!loading && <Notice>Diesen Auftrag gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  // key: bei einem anderen Auftrag frisch mit dessen Daten starten
  // (neu starten, wenn das Angebot inzwischen online angenommen wurde)
  return <OrderEditor key={`${order.id}-${order.offer_accepted ? 'a' : 'o'}`} order={order} mahnen={mahnen} />;
}

/** Eigene Änderungen behalten, alles andere auf den neuen Stand bringen */
function rebaseDraft(draft: Draft, before: Draft, fresh: Draft): Draft {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const next = { ...fresh };
  for (const key of Object.keys(fresh) as (keyof Draft)[]) {
    if (!same(draft[key], before[key]) && !same(draft[key], fresh[key])) Object.assign(next, { [key]: draft[key] });
  }
  return next;
}

function OrderEditor({ order, mahnen }: { order: Order; mahnen?: string }) {
  const { customerById, updateOrder, deleteOrder } = useCrm();
  const customer = customerById(order.customer_id);
  const [initial, setInitial] = useState(() => toDraft(order));
  const [draft, setDraft] = useState(initial);
  // Von außen geändert (z. B. hat Nexy gerade gespeichert)? Dann die neuen Werte
  // übernehmen – nur eigene, noch nicht gespeicherte Eingaben bleiben stehen.
  const fresh = toDraft(order);
  const freshKey = JSON.stringify(fresh);
  const [seenKey, setSeenKey] = useState(freshKey);
  if (seenKey !== freshKey) {
    setSeenKey(freshKey);
    setInitial(fresh);
    setDraft((d) => rebaseDraft(d, initial, fresh));
  }
  const [errors, setErrors] = useState<{ title?: string; price?: string; discount?: string; expenses?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useAreaTutorial('auftrag');

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  };

  const facts = useMemo(() => toFacts(draft), [draft]);
  const status = computeStatus(facts);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const monthly = draft.billing === 'monthly';
  const total = totalMonths(facts);

  const save = async () => {
    const price = parseEuro(draft.price);
    const discount = parseEuro(draft.discount);
    const expenses = parseEuro(draft.expenses);
    const next = {
      title: draft.title.trim() ? undefined : 'Bitte gib an, was zu tun ist.',
      price: price === 'invalid' ? 'Bitte einen Betrag wie 1.250,00 eingeben.' : undefined,
      discount: discount === 'invalid' || (typeof discount === 'number' && (discount < 0 || discount > 100)) ? 'Rabatt zwischen 0 und 100 %.' : undefined,
      expenses: expenses === 'invalid' ? 'Bitte einen Betrag wie 45,90 eingeben.' : undefined,
    };
    setErrors(next);
    setFailure(null);
    if (next.title || next.price || next.discount || next.expenses) return;
    if (monthly && draft.contract_start && draft.contract_end && draft.contract_end < draft.contract_start) {
      setFailure('Das Vertragsende liegt vor dem Start.');
      return;
    }
    setSaving(true);
    // Nur geänderte Felder speichern – so überschreibt das Formular nichts, was
    // inzwischen anderswo geändert wurde (z. B. Angebot online angenommen, Nexy).
    const payload = (d: Draft) => {
      const m = d.billing === 'monthly';
      return {
        title: d.title.trim(),
        description: d.description.trim() || null,
        price: num(parseEuro(d.price)),
        discount_percent: num(parseEuro(d.discount)) ?? 0,
        billing: d.billing,
        contract_start: m ? d.contract_start : null,
        contract_end: m ? d.contract_end : null,
        meeting_at: d.meeting_at,
        meeting_done: d.meeting_done,
        offer_sent: d.offer_sent,
        offer_accepted: d.offer_accepted,
        execution_at: d.execution_at,
        completed: d.completed,
        cancelled: d.cancelled,
        expenses: num(parseEuro(d.expenses)),
        internal_notes: d.internal_notes.trim() || null,
      };
    };
    const now = payload(draft);
    const before = payload(initial);
    const changes = Object.fromEntries(
      Object.entries(now).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k as keyof typeof before])),
    ) as Partial<typeof now>;
    if (Object.keys(changes).length === 0) {
      setSaving(false);
      setInitial(draft);
      setSaved(true);
      return;
    }
    const { data, error } = await updateOrder(order.id, changes);
    setSaving(false);
    if (error || !data) {
      setFailure(error ?? 'Speichern hat nicht geklappt.');
      return;
    }
    const fresh = toDraft(data);
    setInitial(fresh);
    setDraft(fresh);
    setSaved(true);
  };

  /** Aus "Angebot verschicken": nur dieses Häkchen speichern, andere offene Änderungen bleiben stehen. */
  const markOfferSent = async () => {
    const { data, error } = await updateOrder(order.id, { offer_sent: true });
    if (error || !data) return { error: error ?? 'Speichern hat nicht geklappt.' };
    setInitial((i) => ({ ...i, offer_sent: true }));
    setDraft((d) => ({ ...d, offer_sent: true }));
    return {};
  };

  return (
    <Screen maxWidth={1000}>
      <TourTarget id="guide.order">
        <PageHeader
          title={draft.title || 'Auftrag'}
          back={{ label: 'Aufträge', onPress: () => router.navigate('/auftraege') }}
          help={<TutorialButton id="auftrag" />}
          meta={
            <View style={styles.meta}>
              <StatusPill status={status} />
              {customer && <TextLink label={customer.name} emphasis onPress={() => router.push(`/kunden/${customer.id}`)} />}
            </View>
          }
        />
      </TourTarget>

      <TourTarget id="auftrag.status">
        <Reveal delay={180}>
          <Card>
            <StatusStepper status={status} />
            {status === 'cancelled' && <Text style={styles.cancelled}>Dieser Auftrag ist storniert und zählt nicht zum Umsatz.</Text>}
          </Card>
        </Reveal>
      </TourTarget>

      <TourTarget id="auftrag.ablauf" style={styles.columns}>
        <Reveal delay={260} style={styles.column}>
          <Card style={styles.fill}>
            <Text style={styles.cardTitle}>Ablauf</Text>
            <Text style={styles.cardHint}>Trag ein, was passiert ist – der Status oben passt sich automatisch an.</Text>
            <TourTarget id="guide.order.meeting">
              <DateField label="Termin (z. B. Erstgespräch, Besichtigung)" value={draft.meeting_at} onChange={(v) => set('meeting_at', v)} withTime />
            </TourTarget>
            <ToggleRow label="Termin erledigt" value={draft.meeting_done} onChange={(v) => set('meeting_done', v)} />
            <View style={styles.divider} />
            <ToggleRow label="Angebot verschickt" value={draft.offer_sent} onChange={(v) => set('offer_sent', v)} />
            <ToggleRow label="Angebot angenommen" value={draft.offer_accepted} onChange={(v) => set('offer_accepted', v)} />
            <View style={styles.divider} />
            <TourTarget id="guide.order.execution">
              <DateField label="Ausführung" value={draft.execution_at} onChange={(v) => set('execution_at', v)} withTime />
            </TourTarget>
            <ToggleRow label="Abgeschlossen" hint="Ab jetzt zählt der Auftrag zum Umsatz." value={draft.completed} onChange={(v) => set('completed', v)} />
            <ToggleRow label="Storniert" danger value={draft.cancelled} onChange={(v) => set('cancelled', v)} />
          </Card>
        </Reveal>

        <Reveal delay={340} style={styles.column}>
          <Card style={styles.fill}>
            <Text style={styles.cardTitle}>Preis & Umsatz</Text>
            <Segmented
              label="Abrechnung"
              value={draft.billing}
              onChange={(v) => set('billing', v)}
              options={[
                { value: 'once', label: 'Einmalig' },
                { value: 'monthly', label: 'Monatlich' },
              ]}
            />
            <TourTarget id="guide.order.price" style={styles.row}>
              <View style={styles.flex}>
                <TextField
                  label={monthly ? 'Preis pro Monat in €' : 'Preis in €'}
                  value={draft.price}
                  onChangeText={(v) => set('price', v)}
                  error={errors.price}
                  placeholder="z. B. 1.250,00"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.small}>
                <TextField label="Rabatt in %" value={draft.discount} onChangeText={(v) => set('discount', v)} error={errors.discount} placeholder="0" keyboardType="decimal-pad" />
              </View>
            </TourTarget>
            {monthly && (
              <View style={styles.row}>
                <View style={styles.flex}>
                  <DateField label="Start" value={draft.contract_start} onChange={(v) => set('contract_start', v)} />
                </View>
                <View style={styles.flex}>
                  <DateField label="Ende" value={draft.contract_end} onChange={(v) => set('contract_end', v)} hint="Leer = läuft unbefristet" />
                </View>
              </View>
            )}

            <View style={styles.sums}>
              <SumRow label={monthly ? 'Preis nach Rabatt / Monat' : 'Preis nach Rabatt'} value={formatEuro(finalPrice(facts))} />
              {monthly && draft.contract_start && (
                <SumRow
                  label="Laufzeit"
                  value={total === null ? `${elapsedMonths(facts)} Monate, unbefristet` : `${elapsedMonths(facts)} von ${total} Monaten`}
                />
              )}
              <SumRow label="Umsatz (realisiert)" value={formatEuro(recognizedRevenue(facts))} accent />
              <SumRow label="Anstehende Einnahmen" value={formatEuro(outstandingRevenue(facts))} />
            </View>
          </Card>
        </Reveal>
      </TourTarget>

      {customer && (
        <TourTarget id="auftrag.dokumente">
          <Reveal delay={400}>
            <OrderDocumentsCard
              order={order}
              customer={customer}
              dirty={dirty}
              offerSent={initial.offer_sent}
              onMarkOfferSent={markOfferSent}
              openDunningFor={mahnen}
            />
          </Reveal>
        </TourTarget>
      )}

      <Reveal delay={440}>
        <Card>
          <Text style={styles.cardTitle}>Details</Text>
          <TextField label="Leistung *" value={draft.title} onChangeText={(v) => set('title', v)} error={errors.title} maxLength={200} />
          <TextField
            label="Beschreibung"
            value={draft.description}
            onChangeText={(v) => set('description', v)}
            multiline
            style={styles.multiline}
            maxLength={5000}
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label="Ausgaben in € (Material, Fahrtkosten …)"
                value={draft.expenses}
                onChangeText={(v) => set('expenses', v)}
                error={errors.expenses}
                placeholder="0,00"
                keyboardType="decimal-pad"
              />
            </View>
          </View>
          <TextField
            label="Interne Notizen"
            value={draft.internal_notes}
            onChangeText={(v) => set('internal_notes', v)}
            placeholder="Nur für dich sichtbar"
            multiline
            style={styles.multiline}
            maxLength={5000}
          />
        </Card>
      </Reveal>

      {failure && <Notice tone="error">{failure}</Notice>}
      {saved && !dirty && <Notice tone="success">Gespeichert.</Notice>}
      <Button label={dirty ? 'Änderungen speichern' : 'Gespeichert'} onPress={save} loading={saving} disabled={!dirty} />

      <ConfirmDelete
        label="Auftrag löschen"
        question={`„${order.title}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`}
        onConfirm={async () => {
          const { error } = await deleteOrder(order.id);
          if (error) setFailure(error);
          else router.navigate(customer ? `/kunden/${customer.id}` : '/auftraege');
        }}
      />
    </Screen>
  );
}

function SumRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.sumRow}>
      <Text style={styles.sumLabel}>{label}</Text>
      <Text style={[styles.sumValue, accent && styles.sumAccent]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xs, flexWrap: 'wrap' },
  cancelled: { color: Colors.danger, fontSize: 14 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  column: { flexGrow: 1, flexBasis: 360 },
  fill: { flex: 1 },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  cardHint: { color: Colors.textFaint, fontSize: 13, marginTop: -Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.border },
  row: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 160 },
  small: { width: 120 },
  multiline: { minHeight: 90, paddingVertical: Spacing.md, textAlignVertical: 'top' },
  sums: { gap: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.md },
  sumLabel: { color: Colors.textMuted, fontSize: 14 },
  sumValue: { color: Colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sumAccent: { color: Colors.accent },
});
