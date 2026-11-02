import { router } from 'expo-router';
import { Download, FileText, Receipt, Send } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionChip } from '@/components/ui/action-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Customer, Order } from '@/features/crm/crm-provider';

import {
  formatDay,
  formatMoney,
  missingBuyerFields,
  missingSellerFields,
  todayIso,
  type DocumentKind,
} from './document-logic';
import { invoiceState, useDocuments, type StoredDocument } from './documents-provider';
import { savePdf } from './save-pdf';
import { SendPanel } from './send-panel';

type Props = {
  order: Order;
  customer: Customer;
  dirty: boolean;
  /** Gespeicherter Stand: Steht der Auftrag schon auf "Angebot verschickt"? */
  offerSent: boolean;
  onMarkOfferSent: () => Promise<{ error?: string }>;
};

function monthRange(today = todayIso()) {
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, '0');
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}` };
}

/** Angebote und Rechnungen zu einem Auftrag: erstellen, als PDF speichern, verschicken, bezahlt markieren. */
export function OrderDocumentsCard({ order, customer, dirty, offerSent, onMarkOfferSent }: Props) {
  const { seller, error, issue, setPaid, documentsFor } = useDocuments();
  const docs = documentsFor(order.id);
  const monthly = order.billing === 'monthly';
  const [composing, setComposing] = useState<DocumentKind | null>(null);
  const [serviceDate, setServiceDate] = useState<string | null>(
    order.execution_at ? order.execution_at.slice(0, 10) : todayIso(),
  );
  const [period, setPeriod] = useState(monthRange());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  /** Bei welchem Dokument ist "Senden" aufgeklappt? */
  const [sending, setSending] = useState<string | null>(null);

  const blockers = (kind: DocumentKind): string[] => {
    const list: string[] = [];
    if (order.price === null) list.push('Preis im Auftrag');
    const missing = [
      ...missingSellerFields(seller, kind),
      ...missingBuyerFields(
        { name: customer.name, company: customer.company, address: customer.address, email: customer.email },
        kind,
      ),
    ];
    return [...list, ...missing];
  };

  const create = async (kind: DocumentKind) => {
    setBusy(true);
    setMessage(null);
    const service =
      kind === 'invoice' ? (monthly ? { date: null, period } : { date: serviceDate, period: null }) : undefined;
    const { data, error: err } = await issue(kind, order, customer, service);
    if (err || !data) {
      setBusy(false);
      setMessage({ tone: 'error', text: err ?? 'Das hat nicht geklappt.' });
      return;
    }
    const pdf = await savePdf(data);
    setBusy(false);
    setComposing(null);
    // gleich die Versand-Möglichkeiten zeigen
    setSending(data.id);
    setMessage(
      pdf.error
        ? { tone: 'error', text: `${data.number} wurde erstellt. ${pdf.error}` }
        : {
            tone: 'success',
            text: `${kind === 'offer' ? 'Angebot' : 'Rechnung'} ${data.number} erstellt und als PDF gespeichert. Jetzt nur noch verschicken.`,
          },
    );
  };

  if (error === 'setup') {
    return (
      <Card>
        <Text style={styles.title}>Angebot & Rechnung</Text>
        <Notice tone="error">
          Angebote und Rechnungen sind noch nicht eingerichtet: Das Datenbank-Skript dafür fehlt (siehe
          supabase/README.md).
        </Notice>
      </Card>
    );
  }

  const composeBlockers = composing ? blockers(composing) : [];

  return (
    <Card>
      <Text style={styles.title}>Angebot & Rechnung</Text>

      {docs.length > 0 && (
        <View style={styles.list}>
          {docs.map((d) => (
            <DocumentRow
              key={d.id}
              doc={d}
              onSave={async () =>
                setMessage(
                  (await savePdf(d)).error ? { tone: 'error', text: 'Das PDF konnte nicht gespeichert werden.' } : null,
                )
              }
              onPaid={(paid) => setPaid(d.id, paid)}
              sendOpen={sending === d.id}
              onToggleSend={() => setSending((id) => (id === d.id ? null : d.id))}>
              <SendPanel doc={d} customer={customer} offerSent={offerSent} onMarkOfferSent={onMarkOfferSent} />
            </DocumentRow>
          ))}
        </View>
      )}

      {dirty ? (
        <Text style={styles.hint}>
          Speichere zuerst deine Änderungen am Auftrag – dann kannst du ein Angebot oder eine Rechnung erstellen.
        </Text>
      ) : composing ? (
        <View style={styles.compose}>
          <Text style={styles.composeTitle}>{composing === 'offer' ? 'Neues Angebot' : 'Neue Rechnung'}</Text>
          {composing === 'invoice' &&
            (monthly ? (
              <View style={styles.row}>
                <View style={styles.flex}>
                  <DateField
                    label="Leistungszeitraum von"
                    value={period.from}
                    onChange={(v) => v && setPeriod((p) => ({ ...p, from: v }))}
                  />
                </View>
                <View style={styles.flex}>
                  <DateField label="bis" value={period.to} onChange={(v) => v && setPeriod((p) => ({ ...p, to: v }))} />
                </View>
              </View>
            ) : (
              <DateField
                label="Leistungsdatum"
                value={serviceDate}
                onChange={setServiceDate}
                hint="Wann die Leistung erbracht wurde – Pflichtangabe auf Rechnungen."
              />
            ))}
          <Text style={styles.summary}>
            {order.title} · {formatMoney(order.price ?? 0)}
            {monthly ? ' pro Monat' : ''}
            {order.discount_percent ? ` · ${order.discount_percent.toLocaleString('de-DE')} % Rabatt` : ''} ·{' '}
            {seller.small_business ? 'Kleinunternehmer (ohne USt)' : `zzgl. ${seller.vat_rate} % USt`}
          </Text>
          {composeBlockers.length > 0 ? (
            <Notice>Dafür fehlt noch: {composeBlockers.join(', ')}.</Notice>
          ) : (
            composing === 'invoice' && (
              <Text style={styles.hint}>
                Rechnungen bekommen eine feste Nummer und lassen sich danach nicht mehr ändern.
              </Text>
            )
          )}
          <View style={styles.row}>
            <Button label="Abbrechen" variant="secondary" onPress={() => setComposing(null)} style={styles.flex} />
            <Button
              label={composing === 'offer' ? 'Angebot erstellen' : 'Rechnung erstellen'}
              onPress={() => create(composing)}
              loading={busy}
              disabled={composeBlockers.length > 0 || (composing === 'invoice' && !monthly && !serviceDate)}
              style={styles.flex}
            />
          </View>
          {composeBlockers.some(
            (b) => !['Preis im Auftrag', 'Anschrift des Kunden', 'Name des Kunden'].includes(b),
          ) && <TextLink label="Firmendaten ergänzen →" emphasis onPress={() => router.push('/profil/firma')} />}
          {composeBlockers.includes('Anschrift des Kunden') && (
            <TextLink
              label="Anschrift beim Kunden eintragen →"
              emphasis
              onPress={() => router.push(`/kunden/${customer.id}`)}
            />
          )}
        </View>
      ) : (
        <View style={styles.row}>
          <Button label="+ Angebot" variant="secondary" onPress={() => setComposing('offer')} style={styles.flex} />
          <Button label="+ Rechnung" variant="secondary" onPress={() => setComposing('invoice')} style={styles.flex} />
        </View>
      )}

      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </Card>
  );
}

function DocumentRow({
  doc,
  onSave,
  onPaid,
  sendOpen,
  onToggleSend,
  children,
}: {
  doc: StoredDocument;
  onSave: () => void;
  onPaid: (paid: boolean) => void;
  sendOpen: boolean;
  onToggleSend: () => void;
  /** Versand-Feld, wird bei "Senden" aufgeklappt */
  children: ReactNode;
}) {
  const isInvoice = doc.kind === 'invoice';
  const state = isInvoice ? invoiceState(doc) : null;
  const Icon = isInvoice ? Receipt : FileText;
  return (
    <View style={[styles.doc, sendOpen && styles.docOpen]}>
      <View style={styles.docRow}>
        <View style={styles.docIcon}>
          <Icon size={18} color={Colors.text} strokeWidth={1.8} />
        </View>
        <View style={styles.docTexts}>
          <Text style={styles.docNumber}>
            {isInvoice ? 'Rechnung' : 'Angebot'} {doc.number}
          </Text>
          <Text style={styles.docMeta}>
            {formatDay(doc.issued_on)} · {formatMoney(doc.total)}
            {isInvoice && doc.due_on && !doc.paid_at ? ` · fällig ${formatDay(doc.due_on)}` : ''}
            {!isInvoice && doc.due_on ? ` · gültig bis ${formatDay(doc.due_on)}` : ''}
          </Text>
        </View>
        {state && (
          <Pressable
            onPress={() => onPaid(state !== 'paid')}
            accessibilityRole="button"
            accessibilityLabel={
              state === 'paid' ? `${doc.number} als offen markieren` : `${doc.number} als bezahlt markieren`
            }
            style={[
              styles.state,
              state === 'paid' ? styles.statePaid : state === 'overdue' ? styles.stateOverdue : styles.stateOpen,
            ]}>
            <Text
              style={[
                styles.stateText,
                state === 'paid' ? styles.stateTextPaid : state === 'overdue' ? styles.stateTextOverdue : null,
              ]}>
              {state === 'paid' ? 'Bezahlt ✓' : state === 'overdue' ? 'Überfällig' : 'Offen'}
            </Text>
          </Pressable>
        )}
        <ActionChip
          icon={Send}
          label="Senden"
          accessibilityLabel={`${doc.number} verschicken`}
          onPress={onToggleSend}
          active={sendOpen}
        />
        <ActionChip
          icon={Download}
          label="PDF"
          accessibilityLabel={`${doc.number} als PDF speichern`}
          onPress={onSave}
        />
      </View>
      {sendOpen && children}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  list: { gap: Spacing.sm },
  hint: { color: Colors.textFaint, fontSize: 13.5, lineHeight: 19 },
  compose: { gap: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: Spacing.md },
  composeTitle: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  summary: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  row: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 150 },
  doc: {
    gap: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: Spacing.md,
  },
  docOpen: { borderColor: Colors.borderFocus },
  docRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.md,
  },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  docTexts: { flex: 1, minWidth: 190, gap: 2 },
  docNumber: { color: Colors.text, fontSize: 14.5, fontWeight: '600' },
  docMeta: { color: Colors.textMuted, fontSize: 12.5 },
  state: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  stateOpen: { borderColor: 'rgba(245,185,74,0.35)', backgroundColor: 'rgba(245,185,74,0.10)' },
  statePaid: { borderColor: 'rgba(47,227,154,0.4)', backgroundColor: Colors.accentSoft },
  stateOverdue: { borderColor: 'rgba(255,107,107,0.35)', backgroundColor: 'rgba(255,107,107,0.08)' },
  stateText: { color: '#F5B94A', fontSize: 12, fontWeight: '600' },
  stateTextPaid: { color: Colors.accent },
  stateTextOverdue: { color: Colors.danger },
});
