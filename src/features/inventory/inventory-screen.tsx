import { router } from 'expo-router';
import { AlertTriangle, Boxes, ChevronRight, MapPin, Minus, Package, Plus, Wrench } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Spacing } from '@/constants/theme';
import { formatEuro } from '@/features/crm/order-logic';
import { StatRow, StatTile } from '@/features/crm/ui';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';

import {
  SORT_OPTIONS,
  categoryCounts,
  filterInventory,
  formatAmount,
  formatQuantity,
  inventoryStats,
  itemValue,
  needsRestock,
  statusLabel,
  statusTone,
  stepFor,
  stockLevel,
  type InventoryItem,
  type InventoryKind,
  type InventorySort,
  type InventoryStatus,
  type KindFilter,
} from './inventory-logic';
import { useInventory } from './inventory-provider';

const TONE = {
  ok: { bg: Colors.accentSoft, fg: Colors.accent, border: 'rgba(47,227,154,0.4)' },
  warn: { bg: 'rgba(245,185,74,0.10)', fg: '#F5B94A', border: 'rgba(245,185,74,0.35)' },
  bad: { bg: 'rgba(255,107,107,0.08)', fg: Colors.danger, border: 'rgba(255,107,107,0.35)' },
  info: { bg: 'rgba(96,165,250,0.10)', fg: '#7DB4FF', border: 'rgba(96,165,250,0.35)' },
  muted: { bg: 'rgba(255,255,255,0.06)', fg: Colors.textMuted, border: Colors.border },
} as const;

function Pill({ tone, label }: { tone: keyof typeof TONE; label: string }) {
  const t = TONE[tone];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function InventoryStatusPill({ status, kind = 'geraet' }: { status: InventoryStatus; kind?: InventoryKind }) {
  return <Pill tone={statusTone(status)} label={statusLabel(status, kind)} />;
}

const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
  { value: 'all', label: 'Alles' },
  { value: 'geraet', label: 'Geräte' },
  { value: 'produkt', label: 'Produkte' },
];

const newHref = (kind: KindFilter) => `/inventar/neu?art=${kind === 'produkt' ? 'produkt' : 'geraet'}` as const;

/** Lagerbestand: Geräte & Werkzeug sowie Produkte & Material – was du da hast. */
export function InventoryScreen() {
  const { items, loading, error } = useInventory();
  const [kind, setKind] = useState<KindFilter>('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<InventorySort>('newest');

  const stats = useMemo(() => inventoryStats(items), [items]);
  const ofKind = useMemo(() => (kind === 'all' ? items : items.filter((it) => it.kind === kind)), [items, kind]);
  const cats = useMemo(() => categoryCounts(ofKind), [ofKind]);
  const visible = useMemo(
    () => filterInventory(items, { category, query, sort, kind, lowOnly }),
    [items, category, query, sort, kind, lowOnly],
  );
  const low = useMemo(() => items.filter(needsRestock), [items]);

  const newButton = <Button label="+ Eintragen" onPress={() => router.push(newHref(kind))} />;

  return (
    <Screen maxWidth={1040}>
      <PageHeader
        title="Lagerbestand"
        subtitle="Was du da hast – Geräte, Werkzeug, Produkte und Material."
        action={items.length ? newButton : undefined}
      />
      {error && (
        <Notice tone="error">
          {error === 'setup'
            ? 'Der Lagerbestand ist in der Datenbank noch nicht eingerichtet (Skript 20261120090000_feinschliff.sql, siehe supabase/README.md).'
            : 'Der Lagerbestand konnte nicht geladen werden. Prüfe deine Internetverbindung.'}
        </Notice>
      )}

      {!loading && items.length === 0 && !error ? (
        <Reveal delay={150}>
          <Card style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Boxes size={28} color={Colors.accent} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>Was hast du alles da?</Text>
            <Text style={styles.emptyText}>
              Geräte und Werkzeug mit Wert und Zustand – Produkte und Material mit Menge und Mindestbestand.
            </Text>
            <View style={styles.emptyActions}>
              <Button label="+ Produkt eintragen" onPress={() => router.push(newHref('produkt'))} />
              <Button label="+ Gerät eintragen" variant="secondary" onPress={() => router.push(newHref('geraet'))} />
            </View>
          </Card>
        </Reveal>
      ) : (
        <>
          <Reveal delay={100}>
            <Segmented
              value={kind}
              options={KIND_OPTIONS}
              onChange={(v) => {
                setKind(v);
                setCategory(null);
              }}
            />
          </Reveal>

          <Reveal delay={120}>
            <StatRow>
              <StatTile label="Lagerwert (Einkauf)" value={formatEuro(stats.value)} tone="accent" />
              <StatTile label="Geräte" value={String(stats.devices)} tone={stats.devices ? undefined : 'muted'} />
              <StatTile label="Produkte" value={String(stats.products)} tone={stats.products ? undefined : 'muted'} />
              <StatTile
                label={stats.broken ? 'Defekt / Reparatur' : 'Wird knapp'}
                value={String(stats.broken || stats.low)}
                tone={stats.broken || stats.low ? undefined : 'muted'}
              />
            </StatRow>
          </Reveal>
          {(stats.withoutPrice > 0 || stats.saleValue > 0) && (
            <Text style={styles.hint}>
              {[
                stats.saleValue > 0 ? `Verkaufswert der Produkte im Lager: ${formatEuro(stats.saleValue)}` : null,
                stats.withoutPrice > 0
                  ? `${stats.withoutPrice === 1 ? 'Ein Eintrag hat' : `${stats.withoutPrice} Einträge haben`} noch keinen Preis`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          )}

          {low.length > 0 && (
            <Reveal delay={150}>
              <Card style={styles.lowCard}>
                <View style={styles.lowHead}>
                  <AlertTriangle size={18} color="#F5B94A" />
                  <Text style={styles.lowTitle}>Nachbestellen ({low.length})</Text>
                  <Pressable
                    onPress={() => setLowOnly((v) => !v)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.lowToggle, pressed && styles.pressed]}>
                    <Text style={styles.lowToggleText}>{lowOnly ? 'Alle zeigen' : 'Nur diese zeigen'}</Text>
                  </Pressable>
                </View>
                <Text style={styles.lowList} numberOfLines={3}>
                  {low
                    .slice(0, 8)
                    .map((it) => `${it.name} (${stockLevel(it) === 'empty' ? 'leer' : formatQuantity(it)})`)
                    .join(' · ')}
                  {low.length > 8 ? ` · +${low.length - 8} weitere` : ''}
                </Text>
              </Card>
            </Reveal>
          )}

          {cats.length > 0 && (
            <Reveal delay={180}>
              <View style={styles.chips}>
                <Chip label="Alle" count={ofKind.length} active={!category} onPress={() => setCategory(null)} />
                {cats.map((c) => (
                  <Chip
                    key={c.name}
                    label={c.name}
                    count={c.count}
                    active={category === c.name}
                    onPress={() => setCategory(category === c.name ? null : c.name)}
                  />
                ))}
              </View>
            </Reveal>
          )}

          <Reveal delay={220}>
            <View style={styles.tools}>
              <View style={styles.search}>
                <TextField
                  label="Suchen"
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Name, Marke, Standort, Artikelnummer …"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.sortBox}>
                <Segmented label="Sortieren" value={sort} options={SORT_OPTIONS} onChange={setSort} />
              </View>
            </View>
          </Reveal>

          <View style={styles.grid}>
            {visible.map((it, i) => (
              <Reveal key={it.id} delay={Math.min(260 + i * 40, 700)} style={styles.cell}>
                <ItemCard item={it} />
              </Reveal>
            ))}
          </View>
          {visible.length === 0 && !loading && (
            <Text style={styles.hint}>
              {query.trim()
                ? `Nichts gefunden für „${query.trim()}“.`
                : lowOnly
                  ? 'Nichts wird knapp. 👍'
                  : kind === 'produkt'
                    ? 'Noch keine Produkte – trag oben welche ein.'
                    : kind === 'geraet'
                      ? 'Noch keine Geräte – trag oben welche ein.'
                      : 'In dieser Kategorie ist noch nichts.'}
            </Text>
          )}
        </>
      )}
    </Screen>
  );
}

function Chip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive, hovered && !active && styles.chipHover]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
      <Text style={[styles.chipCount, active && styles.chipTextActive]}>{count}</Text>
    </Pressable>
  );
}

function ItemCard({ item }: { item: InventoryItem }) {
  const product = item.kind === 'produkt';
  const open = () => router.push(`/inventar/${item.id}`);
  if (product) return <ProductCard item={item} open={open} />;
  const value = itemValue(item);
  const sold = item.status === 'verkauft';
  return (
    <Card onPress={open} accessibilityLabel={item.name} style={sold && styles.sold}>
      <CardHead item={item} />
      <View style={styles.cardFoot}>
        <Text style={[styles.price, item.price === null && styles.priceMissing]}>
          {item.price === null ? 'Preis fehlt' : formatEuro(value)}
        </Text>
        {item.status !== 'in_betrieb' && <InventoryStatusPill status={item.status} />}
      </View>
      <Location item={item} />
    </Card>
  );
}

/**
 * Produkt-Karte: Kopf, Menge und Fuß öffnen den Eintrag, − und + daneben ändern nur die Menge.
 * (Die Knöpfe liegen bewusst nicht in der klickbaren Fläche – Knopf im Knopf geht im Browser nicht.)
 */
function ProductCard({ item, open }: { item: InventoryItem; open: () => void }) {
  const { hovered, hoverProps } = useHover();
  const value = itemValue(item);
  const sold = item.status === 'verkauft';
  const level = stockLevel(item);
  const area = { onPress: open, ...hoverProps };
  return (
    <Card style={[sold && styles.sold, hovered && styles.cardHover, level !== 'ok' && styles.cardLow]}>
      <Pressable {...area} accessibilityRole="button" accessibilityLabel={item.name}>
        <CardHead item={item} />
      </Pressable>
      <View style={styles.stockRow}>
        <Pressable {...area} focusable={false} style={styles.flex}>
          <Text style={[styles.amount, level === 'empty' && styles.amountEmpty, level === 'low' && styles.amountLow]}>
            {formatQuantity(item)}
          </Text>
          {item.min_quantity !== null && (
            <Text style={styles.minText}>Mindestens {formatQuantity({ quantity: item.min_quantity, unit: item.unit })}</Text>
          )}
        </Pressable>
        {!sold && <Stepper item={item} />}
      </View>
      <Pressable {...area} focusable={false} style={styles.footArea}>
        <View style={styles.cardFoot}>
          <Text style={[styles.valueSmall, item.price === null && styles.priceMissing]}>
            {item.price === null ? 'Einkaufspreis fehlt' : `Wert ${formatEuro(value)}`}
          </Text>
          {level === 'empty' && <Pill tone="bad" label="Leer" />}
          {level === 'low' && <Pill tone="warn" label="Wird knapp" />}
          {item.status !== 'in_betrieb' && <InventoryStatusPill status={item.status} kind="produkt" />}
        </View>
        <Location item={item} />
      </Pressable>
    </Card>
  );
}

function CardHead({ item }: { item: InventoryItem }) {
  const product = item.kind === 'produkt';
  const Icon = product ? Package : Wrench;
  return (
      <View style={styles.cardHead}>
        <View style={[styles.icon, product && styles.iconProduct]}>
          <Icon size={20} color={product ? '#B9A4FF' : Colors.accent} strokeWidth={1.8} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {!product && item.quantity > 1 ? `${item.quantity}× ` : ''}
            {item.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[item.brand, item.category].filter(Boolean).join(' · ') || (product ? 'Produkt' : 'Gerät')}
          </Text>
        </View>
        <ChevronRight size={18} color={Colors.textFaint} />
      </View>
  );
}

function Location({ item }: { item: InventoryItem }) {
  if (!item.location) return null;
  return (
    <View style={styles.locRow}>
      <MapPin size={13} color={Colors.textFaint} />
      <Text style={styles.loc} numberOfLines={1}>
        {item.location}
      </Text>
    </View>
  );
}

/** − und + direkt auf der Karte (öffnet die Karte nicht) */
function Stepper({ item }: { item: InventoryItem }) {
  const { adjustQuantity } = useInventory();
  const [failed, setFailed] = useState<string | null>(null);
  const step = stepFor(item);
  const change = (delta: number) => {
    if (delta < 0 && item.quantity <= 0) return;
    playSound('tick');
    setFailed(null);
    void adjustQuantity(item.id, delta).then((r) => r.error && setFailed(r.error));
  };
  return (
    <View style={styles.stepperWrap}>
      <View style={styles.stepper}>
        <Pressable
          onPress={() => change(-step)}
          disabled={item.quantity <= 0}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}: ${formatAmount(step)} ${item.unit} weniger`}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, pressed && styles.pressed, item.quantity <= 0 && styles.stepOff]}>
          <Minus size={16} color={Colors.text} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          onPress={() => change(step)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}: ${formatAmount(step)} ${item.unit} mehr`}
          hitSlop={6}
          style={({ pressed }) => [styles.stepBtn, styles.stepPlus, pressed && styles.pressed]}>
          <Plus size={16} color={Colors.onAccent} strokeWidth={2.4} />
        </Pressable>
      </View>
      {!!failed && (
        <Text style={styles.stepError} numberOfLines={3}>
          {failed}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'flex-start', gap: Spacing.md },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: Colors.text, fontSize: 19, fontWeight: '700' },
  emptyText: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21, maxWidth: 560 },
  emptyActions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  hint: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  lowCard: { borderColor: 'rgba(245,185,74,0.35)' },
  lowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  lowTitle: { color: Colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  lowToggle: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245,185,74,0.45)',
  },
  lowToggleText: { color: '#F5B94A', fontSize: 12.5, fontWeight: '700' },
  lowList: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  chipHover: { backgroundColor: Colors.surfaceRaised },
  chipActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  chipText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
  chipCount: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  chipTextActive: { color: Colors.onAccent },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: Spacing.lg },
  search: { flexGrow: 1, flexBasis: 260 },
  sortBox: { flexGrow: 0, flexBasis: 320, maxWidth: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  cell: { flexGrow: 1, flexBasis: 280, maxWidth: '100%' },
  sold: { opacity: 0.55 },
  cardLow: { borderColor: 'rgba(245,185,74,0.35)' },
  cardHover: { borderColor: '#3A3A40' },
  footArea: { gap: Spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconProduct: { backgroundColor: 'rgba(139,92,246,0.16)' },
  flex: { flex: 1 },
  name: { color: Colors.text, fontSize: 15.5, fontWeight: '700' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  amount: { color: Colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  amountLow: { color: '#F5B94A' },
  amountEmpty: { color: Colors.danger },
  minText: { color: Colors.textFaint, fontSize: 12.5 },
  stepperWrap: { alignItems: 'flex-end', gap: 4, maxWidth: 180 },
  stepper: { flexDirection: 'row', gap: Spacing.sm },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepPlus: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  stepOff: { opacity: 0.35 },
  stepError: { color: Colors.danger, fontSize: 11.5, textAlign: 'right' },
  pressed: { opacity: 0.7, transform: [{ scale: 0.96 }] },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  price: { color: Colors.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  valueSmall: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600', fontVariant: ['tabular-nums'], flex: 1 },
  priceMissing: { color: '#F5B94A', fontSize: 13.5, fontWeight: '600' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  loc: { color: Colors.textFaint, fontSize: 12.5, flexShrink: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 12, fontWeight: '600' },
});
