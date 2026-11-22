import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect } from 'expo-router';
import { ArrowUpDown, Check, ChevronDown, ChevronRight, LayoutGrid, List, Mail, Users } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { TextLink } from '@/components/ui/text-link';
import { accentAlpha, Colors, Spacing } from '@/constants/theme';
import { sellerName } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';
import { useHover } from '@/hooks/use-hover';

import { useAccess } from '@/features/team/team-provider';
import { useCrm, type Customer } from './crm-provider';
import {
  allowedSort,
  customerSorts,
  customerStats,
  DEFAULT_CUSTOMER_LAYOUT,
  gridColumns,
  readCustomerLayout,
  sortCustomers,
  sortMetric,
  type CustomerSort,
  type CustomerStats,
  type CustomerView,
} from './customer-sort';
import { inviteStatus } from './invite-logic';
import { formatEuro } from './order-logic';
import { CrmSetupNotice, Initials, StatRow, StatTile } from './ui';

/** Ansicht (Liste/Raster) und Sortierung – pro Gerät gemerkt */
const LAYOUT_KEY = 'nexora.kunden-ansicht';
let savedLayout = DEFAULT_CUSTOMER_LAYOUT;
const layoutLoaded = AsyncStorage.getItem(LAYOUT_KEY)
  .then((v) => (savedLayout = readCustomerLayout(v)))
  .catch(() => savedLayout);

const GRID_GAP = Spacing.md;

/** Kundenübersicht mit Suche, Kennzahlen, Sortierung und Liste oder Raster (bis 4 nebeneinander). */
export function CustomersScreen() {
  const { customers, orders, loading, error, invites, refresh } = useCrm();
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState(savedLayout);
  useAreaTutorial('kunden');

  useEffect(() => {
    let alive = true;
    void layoutLoaded.then((l) => alive && setLayout(l));
    return () => {
      alive = false;
    };
  }, []);

  const changeLayout = (patch: Partial<typeof layout>) => {
    const next = { ...layout, ...patch };
    setLayout(next);
    savedLayout = next;
    void AsyncStorage.setItem(LAYOUT_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Wieder sichtbar -> neu laden: Kunden, die ihre Daten inzwischen eingetragen haben, erscheinen
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const stats = useMemo(() => customerStats(orders), [orders]);
  // Umsätze nur mit Recht „Finanzen“ (Mitarbeiter sehen sie standardmäßig nicht)
  const money = useAccess().can('finanzen');
  const sort = allowedSort(layout.sort, money);

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
  const visible = useMemo(() => {
    const found = q
      ? customers.filter((c) =>
          [c.name, c.company, c.phone, c.email, c.address].some((v) => v?.toLowerCase().includes(q)),
        )
      : customers;
    return sortCustomers(found, sort, stats);
  }, [customers, q, sort, stats]);

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
      {invites.length > 0 && <OpenInvites />}

      {!loading && customers.length === 0 && !error ? (
        <TourTarget id="kunden.neu">
          <Reveal delay={200}>
            <Card style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Users size={28} color={Colors.accent} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>Lege deinen ersten Kunden an</Text>
              <Text style={styles.emptyText}>
                Du brauchst nur seine E-Mail – er trägt seine Daten selbst ein. Danach siehst du alle Aufträge und seinen Umsatz an einem Ort.
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
                {money && <StatTile label="Umsatz (realisiert)" value={formatEuro(totals.revenue)} tone="accent" />}
                {money && <StatTile label="Anstehende Einnahmen" value={formatEuro(totals.outstanding)} />}
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

          <Reveal delay={260}>
            <ListToolbar
              view={layout.view}
              sort={sort}
              money={money}
              onView={(view) => changeLayout({ view })}
              onSort={(sort) => changeLayout({ sort })}
            />
          </Reveal>

          <View style={styles.list}>
            {layout.view === 'grid' ? (
              <CustomerGrid customers={visible} stats={stats} sort={sort} money={money} />
            ) : (
              visible.map((c, i) => {
                const m = sortMetric(sort, stats.get(c.id), money);
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
                          <Text style={styles.revenue}>{m.value}</Text>
                          <Text style={styles.sub}>{m.label}</Text>
                        </View>
                        <ChevronRight size={18} color={Colors.textFaint} />
                      </View>
                    </Card>
                  </Reveal>
                );
              })
            )}
            {!!q && visible.length === 0 && (
              <View style={styles.noResult}>
                <Text style={styles.sub}>Kein Kunde gefunden für „{query.trim()}“.</Text>
                <Button label="Neuen Kunden einladen" variant="secondary" onPress={() => router.push('/kunden/neu')} />
              </View>
            )}
          </View>
        </>
      )}
    </Screen>
  );
}

/** Liste oder Raster, dazu die Sortierung (aufklappbar) */
function ListToolbar({
  view,
  sort,
  money,
  onView,
  onSort,
}: {
  view: CustomerView;
  sort: CustomerSort;
  money: boolean;
  onView: (view: CustomerView) => void;
  onSort: (sort: CustomerSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const { hovered, hoverProps } = useHover();
  const sorts = customerSorts(money);
  const current = sorts.find((s) => s.key === sort)?.label ?? '';
  return (
    <View style={styles.toolbarWrap}>
      <View style={styles.toolbar}>
        <View style={styles.viewSwitch} accessibilityRole="radiogroup" accessibilityLabel="Ansicht">
          <ViewButton icon={List} label="Liste" active={view === 'list'} onPress={() => onView('list')} />
          <ViewButton icon={LayoutGrid} label="Raster" active={view === 'grid'} onPress={() => onView('grid')} />
        </View>
        <Pressable
          onPress={() => setOpen((o) => !o)}
          {...hoverProps}
          accessibilityRole="button"
          accessibilityLabel={`Sortieren: ${current}`}
          accessibilityState={{ expanded: open }}
          style={[styles.sortButton, (open || hovered) && styles.sortButtonActive]}>
          <ArrowUpDown size={16} color={Colors.textMuted} />
          <Text style={styles.sortButtonText} numberOfLines={1}>
            {current}
          </Text>
          <ChevronDown size={16} color={Colors.textMuted} style={open ? styles.chevronOpen : undefined} />
        </Pressable>
      </View>
      {open && (
        <View style={styles.sortMenu} accessibilityRole="radiogroup" accessibilityLabel="Sortieren nach">
          {sorts.map((s) => (
            <SortOption
              key={s.key}
              label={s.label}
              active={s.key === sort}
              onPress={() => {
                onSort(s.key);
                setOpen(false);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function ViewButton({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: typeof List;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      style={[styles.viewButton, active && styles.viewButtonActive, hovered && !active && styles.viewButtonHover]}>
      <Icon size={16} color={active ? Colors.text : Colors.textMuted} />
      <Text style={[styles.viewButtonText, active && styles.viewButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SortOption({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      style={[styles.sortOption, active && styles.sortOptionActive, hovered && !active && styles.viewButtonHover]}>
      {active && <Check size={14} color={Colors.accent} strokeWidth={3} />}
      <Text style={[styles.sortOptionText, active && styles.viewButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** Raster: bis zu 4 Kunden nebeneinander (auf dem Handy 2) */
function CustomerGrid({
  customers,
  stats,
  sort,
  money,
}: {
  customers: Customer[];
  stats: Map<string, CustomerStats>;
  sort: CustomerSort;
  money: boolean;
}) {
  const [width, setWidth] = useState(0);
  const cols = gridColumns(width, GRID_GAP);
  const cardWidth = width > 0 ? Math.floor((width - GRID_GAP * (cols - 1)) / cols) : undefined;
  // bei „meister Umsatz“ & Co. sieht man den Platz
  const ranked = sort === 'revenue' || sort === 'orders' || sort === 'outstanding';
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 &&
        customers.map((c, i) => {
          const m = sortMetric(sort, stats.get(c.id), money);
          return (
            <Reveal key={c.id} delay={Math.min(300 + i * 35, 800)} style={{ width: cardWidth }}>
              <Card onPress={() => router.push(`/kunden/${c.id}`)} accessibilityLabel={c.name} style={styles.gridCard}>
                {ranked && <Text style={[styles.rank, i < 3 && styles.rankTop]}>{i + 1}</Text>}
                <View style={styles.gridInner}>
                  <Initials name={c.name} size={48} />
                  <Text style={styles.gridName} numberOfLines={2}>
                    {c.name}
                  </Text>
                  <Text style={styles.gridSub} numberOfLines={1}>
                    {c.company || c.email || c.phone || 'Keine Kontaktdaten'}
                  </Text>
                  <View style={styles.gridDivider} />
                  <Text style={styles.gridValue} numberOfLines={1}>
                    {m.value}
                  </Text>
                  <Text style={styles.gridSub} numberOfLines={1}>
                    {m.label}
                  </Text>
                </View>
              </Card>
            </Reveal>
          );
        })}
    </View>
  );
}

/** Offene Datenschutz-Links: Kunde hat seine Daten noch nicht eingetragen */
function OpenInvites() {
  const { invites, resendInvite, deleteInvite } = useCrm();
  const { seller } = useDocuments();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const now = new Date();

  const resend = async (id: string, email: string) => {
    setBusy(id);
    setNote(null);
    const { error } = await resendInvite(id, { fromName: sellerName(seller) || 'Lunaxora', replyTo: seller.email?.trim() || null });
    setBusy(null);
    setNote(error ? { tone: 'error', text: error } : { tone: 'success', text: `Link erneut an ${email} geschickt.` });
  };

  const remove = async (id: string) => {
    setBusy(id);
    setNote(null);
    const { error } = await deleteInvite(id);
    setBusy(null);
    if (error) setNote({ tone: 'error', text: error });
  };

  return (
    <Reveal delay={120}>
      <Card>
        <Text style={styles.inviteTitle}>Wartet auf Daten ({invites.length})</Text>
        <Text style={styles.sub}>
          Sie erscheinen in deiner Liste, sobald sie ihre Daten eintragen.
        </Text>
        <View style={styles.inviteList}>
          {invites.map((inv) => {
            const status = inviteStatus(inv, now);
            return (
              <View key={inv.id} style={styles.inviteRow}>
                <Mail size={18} color={status.expired ? Colors.textFaint : Colors.accent} />
                <View style={styles.rowTexts}>
                  <Text style={styles.inviteEmail} numberOfLines={1}>
                    {inv.email}
                  </Text>
                  <Text style={styles.sub}>{status.text}</Text>
                </View>
                <TextLink label="Erneut senden" onPress={() => resend(inv.id, inv.email)} disabled={busy === inv.id} />
                <TextLink label="Löschen" onPress={() => remove(inv.id)} disabled={busy === inv.id} />
              </View>
            );
          })}
        </View>
        {note && <Notice tone={note.tone}>{note.text}</Notice>}
      </Card>
    </Reveal>
  );
}

const styles = StyleSheet.create({
  newButton: { minWidth: 170 },
  inviteTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  inviteList: { gap: Spacing.md, marginTop: Spacing.sm },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  inviteEmail: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  list: { gap: Spacing.md },
  toolbarWrap: { gap: Spacing.sm },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  viewSwitch: {
    flexDirection: 'row',
    gap: 4,
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  viewButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  viewButtonActive: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: accentAlpha(0.45), margin: -1 },
  viewButtonHover: { backgroundColor: Colors.surfaceRaised },
  viewButtonText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
  viewButtonTextActive: { color: Colors.text },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    maxWidth: '100%',
  },
  sortButtonActive: { borderColor: accentAlpha(0.45) },
  sortButtonText: { color: Colors.text, fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  sortMenu: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    padding: Spacing.sm,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sortOptionActive: { borderColor: Colors.accent, backgroundColor: accentAlpha(0.12) },
  sortOptionText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  // die Karte füllt ihre Spalte (gleich breit, in einer Reihe gleich hoch)
  gridCard: { flexGrow: 1 },
  // Karten haben innen viel Rand – im schmalen Raster etwas weniger
  gridInner: { alignItems: 'center', gap: 4, marginHorizontal: -Spacing.sm, marginVertical: -Spacing.xs },
  rank: { position: 'absolute', top: 10, left: 12, color: Colors.textFaint, fontSize: 13, fontWeight: '700' },
  rankTop: { color: Colors.accent },
  gridName: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 19,
    minHeight: 38,
    textAlign: 'center',
    marginTop: 6,
    textAlignVertical: 'center',
  },
  gridSub: { color: Colors.textMuted, fontSize: 12.5, textAlign: 'center', maxWidth: '100%' },
  gridDivider: { alignSelf: 'stretch', height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  gridValue: { color: Colors.text, fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'], maxWidth: '100%' },
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
