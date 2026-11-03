import { router } from 'expo-router';
import { Briefcase, Check, Megaphone, Sparkles, UserRound, Wallet } from 'lucide-react-native';
import { useState, type ComponentType } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { formatEuro } from '@/features/crm/order-logic';
import { todayIso } from '@/features/documents/document-logic';
import { categoryLabel } from '@/features/finance/finance-logic';
import { useFinance } from '@/features/finance/finance-provider';
import { shortDateTime } from '@/features/social/post-card';
import { FORMATS, platformLabel } from '@/features/social/social-logic';
import { useSocial } from '@/features/social/social-provider';
import { useHover } from '@/hooks/use-hover';

import { askAssistant } from './assistant-api';
import { buildProposals, proposalProblem, replyText, type Proposal } from './assistant-logic';

const MAX = 2000;

const EXAMPLES = [
  'Neuer Kunde Lisa Wagner, 0171 2345678, will eine Website für 1.500 €. Erstgespräch Donnerstag um 10 Uhr.',
  'Gestern 49,90 € für Flyer bezahlt. Canva Pro kostet mich 12 € im Monat.',
  'Idee fürs nächste TikTok: meine 3 größten Fehler als Gründerin – am Freitag posten.',
];

type Icon = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const KIND: Record<Proposal['kind'], { label: string; icon: Icon }> = {
  customer: { label: 'Neuer Kunde', icon: UserRound },
  order: { label: 'Auftrag', icon: Briefcase },
  expense: { label: 'Ausgabe', icon: Wallet },
  post: { label: 'Post-Idee', icon: Megaphone },
};
const REPEAT = { once: 'einmalig', monthly: 'monatlich', yearly: 'jährlich' } as const;

type Saved = { label: string; href: string };

/** Assistent: frei schreiben -> Vorschläge -> bestätigen -> speichern. */
export function AssistantScreen() {
  const { customers, createCustomer, createOrder } = useCrm();
  const { createExpense } = useFinance();
  const { createPost } = useSocial();
  const [text, setText] = useState('');
  const [thinking, setThinking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);
  const [error, setError] = useState<{ text: string; setup?: boolean } | null>(null);
  const [saved, setSaved] = useState<Saved[] | null>(null);

  const ask = async () => {
    if (!text.trim()) return;
    setThinking(true);
    setError(null);
    setSaved(null);
    setProposals(null);
    setReply(null);
    const { data, error: err, notSetUp } = await askAssistant(text.trim());
    setThinking(false);
    if (err || !data) return setError({ text: err ?? 'Keine Antwort.', setup: notSetUp });
    setReply(replyText(data));
    setProposals(buildProposals(data, customers, todayIso()));
  };

  const update = (id: string, change: (p: Proposal) => Proposal) =>
    setProposals((list) => list?.map((p) => (p.id === id ? change(p) : p)) ?? null);

  const chosen = (proposals ?? []).filter((p) => p.include);
  const blocked = chosen.some((p) => proposalProblem(p, proposals ?? []));

  const save = async () => {
    if (!proposals) return;
    setSaving(true);
    setError(null);
    const done: Saved[] = [];
    const newCustomers = new Map<string, string>();
    const fail = (msg: string) => {
      setSaving(false);
      setSaved(done.length ? done : null);
      setError({
        text: done.length ? `${msg}\n\nBis dahin gespeichert: ${done.map((d) => d.label).join(', ')}.` : msg,
      });
    };
    // Reihenfolge: Kunden zuerst, damit Aufträge sie finden
    for (const p of chosen) {
      if (p.kind !== 'customer') continue;
      const { data, error: err } = await createCustomer(p.data);
      if (err || !data) return fail(err ?? 'Der Kunde konnte nicht gespeichert werden.');
      newCustomers.set(p.id, data.id);
      done.push({ label: `Kunde ${data.name}`, href: `/kunden/${data.id}` });
    }
    for (const p of chosen) {
      if (p.kind === 'order') {
        const customerId =
          p.customer.existingId ?? (p.customer.newRef ? newCustomers.get(p.customer.newRef) : undefined);
        if (!customerId) return fail(`Für „${p.data.title}“ fehlt der Kunde.`);
        const { data, error: err } = await createOrder({ customer_id: customerId, ...p.data });
        if (err || !data) return fail(err ?? 'Der Auftrag konnte nicht gespeichert werden.');
        done.push({ label: `Auftrag ${data.title}`, href: `/auftraege/${data.id}` });
      } else if (p.kind === 'expense') {
        const { data, error: err } = await createExpense({ ...p.data, ends_on: null, notes: null });
        if (err || !data) return fail(err ?? 'Die Ausgabe konnte nicht gespeichert werden.');
        done.push({ label: `Ausgabe ${data.title}`, href: `/finanzen/ausgabe/${data.id}` });
      } else if (p.kind === 'post') {
        const { data, error: err } = await createPost(p.data);
        if (err || !data) return fail(err ?? 'Die Post-Idee konnte nicht gespeichert werden.');
        done.push({ label: `Post-Idee ${data.title}`, href: `/social/${data.id}` });
      }
    }
    setSaving(false);
    setSaved(done);
    setProposals(null);
    setReply(null);
    setText('');
  };

  const reset = () => {
    setProposals(null);
    setReply(null);
    setError(null);
  };

  return (
    <Screen maxWidth={820}>
      <PageHeader
        title="Assistent"
        subtitle="Schreib einfach drauflos – ich mache daraus Kunden, Aufträge, Ausgaben und Post-Ideen. Du bestätigst, bevor etwas gespeichert wird."
      />

      <Reveal delay={160}>
        <Card>
          <TextField
            label="Was ist passiert, was steht an?"
            value={text}
            onChangeText={(v) => setText(v.slice(0, MAX))}
            placeholder="z. B. Neuer Kunde Lisa Wagner will eine Website für 1.500 € …"
            multiline
            style={styles.input}
            hint={`${text.length.toLocaleString('de-DE')} / ${MAX.toLocaleString('de-DE')} Zeichen`}
          />
          <Button
            label={thinking ? 'Denke nach …' : 'Verstehen'}
            onPress={ask}
            loading={thinking}
            disabled={!text.trim()}
          />
          {!text && !proposals && (
            <View style={styles.examples}>
              <Text style={styles.small}>Beispiele zum Ausprobieren:</Text>
              {EXAMPLES.map((e) => (
                <Example key={e} text={e} onPress={() => setText(e)} />
              ))}
            </View>
          )}
          <Text style={styles.small}>
            Tipp: Auf dem Mac kannst du auch diktieren – mit der Diktierfunktion (Standard: zweimal die Fn-Taste). Dein
            Text wird zur Auswertung an Claude von Anthropic geschickt.
          </Text>
        </Card>
      </Reveal>

      {error && <Notice tone="error">{error.text}</Notice>}
      {error?.setup && (
        <Card>
          <Text style={styles.cardTitle}>Assistent einrichten (einmalig)</Text>
          <Text style={styles.text}>
            1. API-Schlüssel bei console.anthropic.com erstellen.{'\n'}2. In Supabase die Server-Funktion „assistant“
            anlegen (Code: supabase/functions/assistant/index.ts).{'\n'}3. Den Schlüssel dort als Geheimnis
            ANTHROPIC_API_KEY speichern.
          </Text>
          <Text style={styles.small}>Die genaue Anleitung steht in supabase/README.md.</Text>
        </Card>
      )}

      {saved && (
        <Reveal>
          <Card>
            <View style={styles.savedHead}>
              <View style={styles.okIcon}>
                <Check size={16} color={Colors.onAccent} strokeWidth={3} />
              </View>
              <Text style={styles.cardTitle}>Gespeichert</Text>
            </View>
            {saved.map((s) => (
              <View key={s.href} style={styles.savedRow}>
                <Text style={styles.savedLabel}>{s.label}</Text>
                <TextLink label="Öffnen →" onPress={() => router.push(s.href as never)} />
              </View>
            ))}
          </Card>
        </Reveal>
      )}

      {proposals && (
        <Reveal>
          <View style={styles.results}>
            <View style={styles.bubble}>
              <Sparkles size={16} color={Colors.accent} strokeWidth={2} />
              <Text style={styles.bubbleText}>
                {reply ??
                  (proposals.length ? 'Das habe ich erkannt:' : 'Dazu habe ich nichts gefunden, was ich anlegen kann.')}
              </Text>
            </View>
            {proposals.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                problem={p.include ? proposalProblem(p, proposals) : null}
                customers={customers}
                onToggle={() => update(p.id, (x) => ({ ...x, include: !x.include }))}
                onPickCustomer={(id, name) =>
                  update(p.id, (x) =>
                    x.kind === 'order' ? { ...x, customer: { existingId: id, newRef: null, name } } : x,
                  )
                }
              />
            ))}
            {proposals.length > 0 ? (
              <View style={styles.actions}>
                <Button label="Verwerfen" variant="secondary" onPress={reset} style={styles.flex} />
                <Button
                  label={chosen.length ? `${chosen.length} speichern` : 'Nichts ausgewählt'}
                  onPress={save}
                  loading={saving}
                  disabled={!chosen.length || blocked}
                  style={styles.flex}
                />
              </View>
            ) : (
              <Text style={styles.text}>
                Schreib zum Beispiel, wer angefragt hat und was es kostet, was du bezahlt hast oder welche Idee du für
                einen Post hast.
              </Text>
            )}
          </View>
        </Reveal>
      )}
    </Screen>
  );
}

function Example({ text, onPress }: { text: string; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...hoverProps}
      style={[styles.example, hovered && styles.exampleHover]}>
      <Text style={styles.exampleText}>„{text}“</Text>
    </Pressable>
  );
}

function ProposalCard({
  proposal: p,
  problem,
  customers,
  onToggle,
  onPickCustomer,
}: {
  proposal: Proposal;
  problem: string | null;
  customers: { id: string; name: string }[];
  onToggle: () => void;
  onPickCustomer: (id: string, name: string) => void;
}) {
  const { label, icon: Icon } = KIND[p.kind];
  const rows: [string, string][] = [];
  let title = '';
  let note: string | null = null;

  if (p.kind === 'customer') {
    title = p.data.name;
    if (p.data.company) rows.push(['Firma', p.data.company]);
    if (p.data.phone) rows.push(['Telefon', p.data.phone]);
    if (p.data.email) rows.push(['E-Mail', p.data.email]);
    if (p.data.address) rows.push(['Anschrift', p.data.address]);
    if (p.data.notes) rows.push(['Notiz', p.data.notes]);
    if (p.duplicateOf) note = 'Diesen Kunden gibt es schon – er wird nicht doppelt angelegt.';
  } else if (p.kind === 'order') {
    title = p.data.title;
    rows.push(['Kunde', p.customer.name ? `${p.customer.name}${p.customer.newRef ? ' (neu)' : ''}` : '–']);
    if (p.data.price !== null)
      rows.push(['Preis', `${formatEuro(p.data.price)}${p.data.billing === 'monthly' ? ' pro Monat' : ''}`]);
    if (p.data.description) rows.push(['Beschreibung', p.data.description]);
    if (p.data.meeting_at) rows.push(['Termin', shortDateTime(p.data.meeting_at)]);
    if (p.data.execution_at) rows.push(['Ausführung', shortDateTime(p.data.execution_at)]);
  } else if (p.kind === 'expense') {
    title = p.data.title;
    rows.push(['Betrag', `${formatEuro(p.data.amount)} · ${REPEAT[p.data.repeat]}`]);
    rows.push(['Kategorie', categoryLabel(p.data.category)]);
    rows.push(['Datum', p.data.spent_on.split('-').reverse().join('.')]);
  } else {
    title = p.data.title;
    rows.push(['Format', FORMATS.find((f) => f.key === p.data.format)?.label ?? p.data.format]);
    if (p.data.platforms.length) rows.push(['Plattformen', p.data.platforms.map(platformLabel).join(', ')]);
    if (p.data.planned_for) rows.push(['Geplant', shortDateTime(p.data.planned_for)]);
    if (p.data.script) rows.push(['Notizen', p.data.script]);
  }

  const needsCustomer = p.kind === 'order' && !p.customer.existingId && !p.customer.newRef;

  return (
    <Card style={[styles.proposal, !p.include && styles.proposalOff]}>
      <View style={styles.head}>
        <View style={styles.kindIcon}>
          <Icon size={18} color={Colors.text} strokeWidth={1.8} />
        </View>
        <View style={styles.headTexts}>
          <Text style={styles.kind}>{label}</Text>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: p.include }}
          accessibilityLabel={`${label} ${title} übernehmen`}
          style={[styles.check, p.include && styles.checkOn]}>
          {p.include && <Check size={15} color={Colors.onAccent} strokeWidth={3} />}
        </Pressable>
      </View>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={styles.rowKey}>{k}</Text>
          <Text style={styles.rowValue}>{v}</Text>
        </View>
      ))}
      {note && <Text style={styles.small}>{note}</Text>}
      {needsCustomer && p.include && (
        <View style={styles.pick}>
          <Text style={styles.small}>Für welchen Kunden?</Text>
          <View style={styles.chips}>
            {customers.slice(0, 12).map((c) => (
              <Pressable
                key={c.id}
                onPress={() => onPickCustomer(c.id, c.name)}
                accessibilityRole="button"
                style={styles.chip}>
                <Text style={styles.chipText}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
          {customers.length === 0 && (
            <Text style={styles.small}>Du hast noch keine Kunden – nenn den Namen im Text mit.</Text>
          )}
        </View>
      )}
      {problem && !needsCustomer && <Notice>{problem}</Notice>}
    </Card>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: 120, paddingVertical: Spacing.md, textAlignVertical: 'top' },
  examples: { gap: Spacing.sm },
  example: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
  },
  exampleHover: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
  exampleText: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  small: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  results: { gap: Spacing.md },
  bubble: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.3)',
    padding: Spacing.md,
  },
  bubbleText: { color: Colors.text, fontSize: 14.5, lineHeight: 21, flex: 1 },
  proposal: { gap: Spacing.sm },
  proposalOff: { opacity: 0.55 },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  kindIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTexts: { flex: 1, gap: 1 },
  kind: { color: Colors.textFaint, fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  title: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.borderFocus,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  row: { flexDirection: 'row', gap: Spacing.md },
  rowKey: { color: Colors.textFaint, fontSize: 13.5, width: 100 },
  rowValue: { color: Colors.text, fontSize: 13.5, flex: 1, lineHeight: 19 },
  pick: { gap: Spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { color: Colors.text, fontSize: 13 },
  actions: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  flex: { flex: 1, minWidth: 160 },
  savedHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  okIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  savedLabel: { color: Colors.text, fontSize: 14.5, flex: 1 },
});
