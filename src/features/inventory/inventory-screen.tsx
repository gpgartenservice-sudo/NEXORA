import { router } from 'expo-router';
import { Boxes, ChevronRight, MapPin, Package } from 'lucide-react-native';
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
import { useHover } from '@/hooks/use-hover';

import {
  SORT_OPTIONS,
  categoryCounts,
  filterInventory,
  inventoryStats,
  itemValue,
  statusLabel,
  statusTone,
  type InventoryItem,
  type InventorySort,
  type InventoryStatus,
} from './inventory-logic';
import { useInventory } from './inventory-provider';

const TONE = {
  ok: { bg: Colors.accentSoft, fg: Colors.accent, border: 'rgba(47,227,154,0.4)' },
  warn: { bg: 'rgba(245,185,74,0.10)', fg: '#F5B94A', border: 'rgba(245,185,74,0.35)' },
  bad: { bg: 'rgba(255,107,107,0.08)', fg: Colors.danger, border: 'rgba(255,107,107,0.35)' },
  info: { bg: 'rgba(96,165,250,0.10)', fg: '#7DB4FF', border: 'rgba(96,165,250,0.35)' },
  muted: { bg: 'rgba(255,255,255,0.06)', fg: Colors.textMuted, border: Colors.border },
} as const;

export function InventoryStatusPill({ status }: { status: InventoryStatus }) {
  const t = TONE[statusTone(status)];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={[styles.dot, { backgroundColor: t.fg }]} />
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

/** Inventar: Geräte, Werkzeug und Material mit Wert, Zustand und Standort. */
export function InventoryScreen() {
  const { items, loading, error } = useInventory();
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<InventorySort>('newest');

  const stats = useMemo(() => inventoryStats(items), [items]);
  const cats = useMemo(() => categoryCounts(items), [items]);
  const visible = useMemo(() => filterInventory(items, { category, query, sort }), [items, category, query, sort]);

  const newButton = <Button label="+ Neues Teil" onPress={() => router.push('/inventar/neu')} />;

  return (
    <Screen maxWidth={1040}>
      <PageHeader
        title="Inventar"
        subtitle="Was dein Business besitzt – mit Wert, Zustand und Ort."
        action={items.length ? newButton : undefined}
      />
      {error && (
        <Notice tone="error">
          {error === 'setup'
            ? 'Das Inventar ist in der Datenbank noch nicht eingerichtet (Skript 20261120090000_feinschliff.sql, siehe supabase/README.md).'
            : 'Das Inventar konnte nicht geladen werden. Prüfe deine Internetverbindung.'}
        </Notice>
      )}

      {!loading && items.length === 0 && !error ? (
        <Reveal delay={150}>
          <Card style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Boxes size={28} color={Colors.accent} strokeWidth={1.8} />
            </View>
            <Text style={styles.emptyTitle}>Was gehört alles zu deinem Business?</Text>
            <Text style={styles.emptyText}>
              Trag Geräte, Werkzeug und Material ein – praktisch für Versicherung und Steuer.
            </Text>
            <Button label="+ Erstes Teil eintragen" onPress={() => router.push('/inventar/neu')} />
          </Card>
        </Reveal>
      ) : (
        <>
          <Reveal delay={120}>
            <StatRow>
              <StatTile label="Gesamtwert (im Bestand)" value={formatEuro(stats.value)} tone="accent" />
              <StatTile label="Teile im Bestand" value={String(stats.count)} />
              <StatTile label="Kategorien" value={String(stats.categories)} />
              <StatTile label="Defekt / in Reparatur" value={String(stats.broken)} tone={stats.broken ? undefined : 'muted'} />
            </StatRow>
          </Reveal>
          {stats.withoutPrice > 0 && (
            <Text style={styles.hint}>
              {stats.withoutPrice === 1 ? 'Ein Teil hat' : `${stats.withoutPrice} Teile haben`} noch keinen Preis – der
              Gesamtwert ist deshalb etwas zu niedrig.
            </Text>
          )}

          {cats.length > 0 && (
            <Reveal delay={180}>
              <View style={styles.chips}>
                <Chip label="Alle" count={items.length} active={!category} onPress={() => setCategory(null)} />
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
                  placeholder="Name, Marke, Standort, Seriennummer …"
                  autoCorrect={false}
                />
              </View>
              <Segmented label="Sortieren" value={sort} options={SORT_OPTIONS} onChange={setSort} />
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
              {query.trim() ? `Nichts gefunden für „${query.trim()}“.` : 'In dieser Kategorie ist noch nichts.'}
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
  const value = itemValue(item);
  const sold = item.status === 'verkauft';
  return (
    <Card onPress={() => router.push(`/inventar/${item.id}`)} accessibilityLabel={item.name} style={sold && styles.sold}>
      <View style={styles.cardHead}>
        <View style={styles.icon}>
          <Package size={20} color={Colors.accent} strokeWidth={1.8} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {item.quantity > 1 ? `${item.quantity}× ` : ''}
            {item.name}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {[item.brand, item.category].filter(Boolean).join(' · ') || 'Ohne Kategorie'}
          </Text>
        </View>
        <ChevronRight size={18} color={Colors.textFaint} />
      </View>
      <View style={styles.cardFoot}>
        <Text style={[styles.price, item.price === null && styles.priceMissing]}>
          {item.price === null ? 'Preis fehlt' : formatEuro(value)}
        </Text>
        {item.status !== 'in_betrieb' && <InventoryStatusPill status={item.status} />}
      </View>
      {!!item.location && (
        <View style={styles.locRow}>
          <MapPin size={13} color={Colors.textFaint} />
          <Text style={styles.loc} numberOfLines={1}>
            {item.location}
          </Text>
        </View>
      )}
    </Card>
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
  hint: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  cell: { flexGrow: 1, flexBasis: 280, maxWidth: '100%' },
  sold: { opacity: 0.55 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  name: { color: Colors.text, fontSize: 15.5, fontWeight: '700' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  price: { color: Colors.text, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
