import { router } from 'expo-router';
import {
  Briefcase,
  Check,
  CircleCheck,
  Download,
  FileText,
  Megaphone,
  Receipt,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Notice } from '@/components/ui/notice';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { formatEuro } from '@/features/crm/order-logic';
import { categoryLabel, incomeProofMonths, monthLabel } from '@/features/finance/finance-logic';
import { shortDateTime } from '@/features/social/post-card';
import { FORMATS, platformLabel } from '@/features/social/social-logic';

import { proposalLabel, type Proposal } from './assistant-logic';
import { useNexy, type NexyMessage } from './nexy-provider';

const REPEAT = { once: 'einmalig', monthly: 'monatlich', yearly: 'jährlich' } as const;

function head(p: Proposal): { icon: LucideIcon; kind: string; title: string } {
  switch (p.kind) {
    case 'customer':
      return { icon: UserRound, kind: 'Neuer Kunde', title: p.data.name };
    case 'order':
      return { icon: Briefcase, kind: 'Auftrag', title: p.data.title };
    case 'expense':
      return { icon: Wallet, kind: 'Ausgabe', title: p.data.title };
    case 'post':
      return { icon: Megaphone, kind: 'Post-Idee', title: p.data.title };
    case 'document':
      return {
        icon: p.data.docKind === 'invoice' ? Receipt : FileText,
        kind: p.data.docKind === 'invoice' ? 'Rechnung als PDF' : 'Angebot als PDF',
        title: p.order.title ?? 'Auftrag wählen',
      };
    case 'income_proof':
      return { icon: FileText, kind: 'PDF', title: 'Einkommensnachweis' };
    case 'existing_pdf':
      return { icon: Download, kind: 'PDF erneut speichern', title: p.data.number };
    case 'mark_paid':
      return { icon: CircleCheck, kind: 'Rechnung bezahlt', title: p.data.number };
  }
}

function rows(p: Proposal): [string, string][] {
  const r: [string, string][] = [];
  if (p.kind === 'customer') {
    if (p.data.company) r.push(['Firma', p.data.company]);
    if (p.data.phone) r.push(['Telefon', p.data.phone]);
    if (p.data.email) r.push(['E-Mail', p.data.email]);
    if (p.data.address) r.push(['Anschrift', p.data.address]);
    if (p.data.notes) r.push(['Notiz', p.data.notes]);
  } else if (p.kind === 'order') {
    r.push(['Kunde', p.customer.name ? `${p.customer.name}${p.customer.newRef ? ' (neu)' : ''}` : '–']);
    if (p.data.price !== null)
      r.push(['Preis', `${formatEuro(p.data.price)}${p.data.billing === 'monthly' ? ' pro Monat' : ''}`]);
    if (p.data.description) r.push(['Beschreibung', p.data.description]);
    if (p.data.meeting_at) r.push(['Termin', shortDateTime(p.data.meeting_at)]);
    if (p.data.execution_at) r.push(['Ausführung', shortDateTime(p.data.execution_at)]);
  } else if (p.kind === 'expense') {
    r.push(['Betrag', `${formatEuro(p.data.amount)} · ${REPEAT[p.data.repeat]}`]);
    r.push(['Kategorie', categoryLabel(p.data.category)]);
    r.push(['Datum', p.data.spent_on.split('-').reverse().join('.')]);
  } else if (p.kind === 'post') {
    r.push(['Format', FORMATS.find((f) => f.key === p.data.format)?.label ?? p.data.format]);
    if (p.data.platforms.length) r.push(['Plattformen', p.data.platforms.map(platformLabel).join(', ')]);
    if (p.data.planned_for) r.push(['Geplant', shortDateTime(p.data.planned_for)]);
    if (p.data.script) r.push(['Notizen', p.data.script]);
  } else if (p.kind === 'document') {
    r.push(['Kunde', p.customer.name ? `${p.customer.name}${p.customer.newRef ? ' (neu)' : ''}` : '–']);
    if (p.order.newRef) r.push(['Auftrag', 'wird gerade mit angelegt']);
    if (p.data.service_date) r.push(['Leistungsdatum', p.data.service_date.split('-').reverse().join('.')]);
  } else if (p.kind === 'income_proof') {
    const m = incomeProofMonths(p.data.period);
    r.push(['Zeitraum', `${monthLabel(m[0])} bis ${monthLabel(m[m.length - 1])}`]);
  } else if (p.kind === 'mark_paid') {
    r.push(['Status', 'wird als bezahlt markiert']);
  }
  return r;
}

/** Vorschläge einer Nexy-Nachricht: an-/abwählen, fehlende Zuordnung wählen, ausführen. */
export function NexyProposals({ message }: { message: NexyMessage }) {
  const { updateProposal, execute, dismiss, executing, blockers } = useNexy();
  const { customers, orders } = useCrm();
  const all = message.proposals ?? [];
  const done = new Set(message.doneIds ?? []);
  const open = message.status === 'open';
  const chosen = all.filter((p) => p.include && !done.has(p.id));
  const blocked = chosen.some((p) => blockers(p, all).length > 0);
  const issues = all.some((p) => p.kind === 'document' && p.include && !done.has(p.id));

  return (
    <View style={styles.wrap}>
      {all.map((p) => {
        const { icon: Icon, kind, title } = head(p);
        const isDone = done.has(p.id) || (message.status === 'done' && p.include);
        const problems = open && p.include && !isDone ? blockers(p, all) : [];
        const needsCustomer = open && p.include && p.kind === 'order' && !p.customer.existingId && !p.customer.newRef;
        const needsOrder = open && p.include && p.kind === 'document' && !p.order.existingId && !p.order.newRef;
        const orderChoices = needsOrder
          ? orders.filter((o) => !p.customer.existingId || o.customer_id === p.customer.existingId).slice(0, 10)
          : [];
        const sellerIssue = problems.some((x) => !/Auftrag|Kunde|Preis|Anschrift des Kunden|Name des Kunden/.test(x));
        return (
          <View key={p.id} style={[styles.card, (!p.include || message.status === 'dismissed') && styles.off]}>
            <View style={styles.head}>
              <View style={styles.icon}>
                <Icon size={17} color={Colors.text} strokeWidth={1.8} />
              </View>
              <View style={styles.headTexts}>
                <Text style={styles.kind}>{kind}</Text>
                <Text style={styles.title}>{title}</Text>
              </View>
              {isDone ? (
                <View style={[styles.check, styles.checkOn]} accessibilityLabel={`${proposalLabel(p)} erledigt`}>
                  <Check size={15} color={Colors.onAccent} strokeWidth={3} />
                </View>
              ) : open ? (
                <Pressable
                  onPress={() => updateProposal(message.id, p.id, (x) => ({ ...x, include: !x.include }))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: p.include }}
                  accessibilityLabel={`${proposalLabel(p)} übernehmen`}
                  style={[styles.check, p.include && styles.checkOn]}>
                  {p.include && <Check size={15} color={Colors.onAccent} strokeWidth={3} />}
                </Pressable>
              ) : null}
            </View>
            {rows(p).map(([k, v]) => (
              <View key={k} style={styles.row}>
                <Text style={styles.rowKey}>{k}</Text>
                <Text style={styles.rowValue}>{v}</Text>
              </View>
            ))}
            {p.kind === 'customer' && p.duplicateOf && (
              <Text style={styles.small}>Diesen Kunden gibt es schon – er wird nicht doppelt angelegt.</Text>
            )}
            {p.kind === 'document' && p.data.docKind === 'invoice' && open && p.include && (
              <Text style={styles.small}>Bekommt eine feste Rechnungsnummer und ist danach nicht mehr änderbar.</Text>
            )}
            {needsCustomer && (
              <Picker
                label="Für welchen Kunden?"
                items={customers.slice(0, 12).map((c) => ({ id: c.id, label: c.name }))}
                empty="Du hast noch keine Kunden – nenn Nexy den Namen."
                onPick={(id, label) =>
                  updateProposal(message.id, p.id, (x) =>
                    x.kind === 'order' ? { ...x, customer: { existingId: id, newRef: null, name: label } } : x,
                  )
                }
              />
            )}
            {needsOrder && (
              <Picker
                label="Zu welchem Auftrag?"
                items={orderChoices.map((o) => ({
                  id: o.id,
                  label: `${o.title} · ${customers.find((c) => c.id === o.customer_id)?.name ?? ''}`,
                }))}
                empty="Dazu gibt es noch keinen Auftrag – sag Nexy, worum es geht."
                onPick={(id) => {
                  const o = orders.find((x) => x.id === id)!;
                  const c = customers.find((x) => x.id === o.customer_id);
                  updateProposal(message.id, p.id, (x) =>
                    x.kind === 'document'
                      ? {
                          ...x,
                          order: { existingId: o.id, newRef: null, title: o.title },
                          customer: { existingId: o.customer_id, newRef: null, name: c?.name ?? null },
                        }
                      : x,
                  );
                }}
              />
            )}
            {problems.length > 0 && !needsCustomer && !needsOrder && (
              <View style={styles.problem}>
                <Notice>Dafür fehlt noch: {problems.join(', ')}.</Notice>
                {sellerIssue && (
                  <TextLink label="Firmendaten ergänzen →" emphasis onPress={() => router.push('/firma')} />
                )}
              </View>
            )}
          </View>
        );
      })}

      {open && (
        <View style={styles.actions}>
          <Button label="Verwerfen" variant="secondary" onPress={() => dismiss(message.id)} style={styles.flex} />
          <Button
            label={chosen.length ? `Ausführen (${chosen.length})` : 'Nichts ausgewählt'}
            onPress={() => void execute(message.id)}
            loading={executing === message.id}
            disabled={!chosen.length || blocked || (executing !== null && executing !== message.id)}
            style={styles.flex}
          />
        </View>
      )}
      {open && issues && <Text style={styles.small}>PDFs werden nach dem Ausführen direkt gespeichert.</Text>}
      {message.status === 'dismissed' && <Text style={styles.small}>Verworfen.</Text>}
      {!!message.error && message.proposals && <Notice tone="error">{message.error}</Notice>}
      {!!message.results?.length && (
        <View style={styles.results}>
          {message.results.map((r, i) => (
            <View key={`${r.label}-${i}`} style={styles.resultRow}>
              <View style={styles.okDot}>
                <Check size={11} color={Colors.onAccent} strokeWidth={3.2} />
              </View>
              <Text style={styles.resultLabel}>
                {r.label}
                {r.note ? <Text style={styles.resultNote}> · {r.note}</Text> : null}
              </Text>
              {r.href && <TextLink label="Öffnen →" onPress={() => router.push(r.href as never)} />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Picker({
  label,
  items,
  empty,
  onPick,
}: {
  label: string;
  items: { id: string; label: string }[];
  empty: string;
  onPick: (id: string, label: string) => void;
}) {
  return (
    <View style={styles.pick}>
      <Text style={styles.small}>{label}</Text>
      {items.length === 0 ? (
        <Text style={styles.small}>{empty}</Text>
      ) : (
        <View style={styles.chips}>
          {items.map((it) => (
            <Pressable
              key={it.id}
              onPress={() => onPick(it.id, it.label)}
              accessibilityRole="button"
              style={styles.chip}>
              <Text style={styles.chipText}>{it.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  card: {
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
  },
  off: { opacity: 0.5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTexts: { flex: 1, gap: 1 },
  kind: { color: Colors.textFaint, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  title: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  check: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.borderFocus,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  row: { flexDirection: 'row', gap: Spacing.md },
  rowKey: { color: Colors.textFaint, fontSize: 13, width: 104 },
  rowValue: { color: Colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  small: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
  pick: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: Colors.text, fontSize: 13 },
  problem: { gap: Spacing.xs },
  actions: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap', marginTop: Spacing.xs },
  flex: { flex: 1, minWidth: 150 },
  results: {
    gap: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.3)',
    backgroundColor: Colors.accentSoft,
    padding: Spacing.md,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  okDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultLabel: { color: Colors.text, fontSize: 13.5, flex: 1 },
  resultNote: { color: Colors.textMuted },
});
