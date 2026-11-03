import { router } from 'expo-router';
import { CalendarSync, ChevronLeft, ChevronRight, Navigation, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { ActionChip } from '@/components/ui/action-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { StatRow, StatTile } from '@/features/crm/ui';
import { formatMoney, todayIso } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { dunningState } from '@/features/dunning/dunning-logic';
import { useFollowups } from '@/features/dunning/followups-provider';
import { SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/features/navigation/nav-items';
import { dayKey, isoWeek, startOfWeek, weekDays } from '@/features/social/social-logic';
import { useHover } from '@/hooks/use-hover';

import {
  dayLabel,
  eventsByDay,
  OPEN_LABEL,
  openItems,
  overlapping,
  routeUrl,
  sellerAddress,
  upcoming,
  type CalendarEvent,
  type OpenItem,
} from './appointment-logic';
import { useAppointments } from './appointments-provider';
import { CalendarSubscription } from './calendar-subscription';
import { EventChip, EventRow } from './event-card';
import { useCalendarEvents } from './use-calendar-events';

type View_ = 'week' | 'list';
const LIST_DAYS = 60;
const WEEKDAY = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const shortDate = (d: Date) => d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
const newOn = (day: string) => router.push({ pathname: '/termine/neu', params: { datum: day } });

/** Bereich Termine: Woche, Liste, offene Punkte, Tagesroute, Kalender-Abo. */
export function TermineScreen() {
  const crm = useCrm();
  const { seller, documents } = useDocuments();
  const { followups } = useFollowups();
  const { error: setupError } = useAppointments();
  const events = useCalendarEvents();
  const { width } = useWindowDimensions();
  const contentWidth = width >= SIDEBAR_BREAKPOINT ? width - SIDEBAR_WIDTH : width;
  const columns = contentWidth >= 1000;
  // Zeitpunkt beim Öffnen festhalten (Darstellung bleibt stabil)
  const [now] = useState(() => new Date());
  const [view, setView] = useState<View_>('week');
  const [offset, setOffset] = useState(0);
  const [showAbo, setShowAbo] = useState(false);

  const byDay = useMemo(() => eventsByDay(events), [events]);
  const overlaps = useMemo(() => overlapping(events), [events]);
  const open = useMemo(() => openItems(crm.orders, crm.customers, now), [crm.orders, crm.customers, now]);
  // überfällige Rechnungen, bei denen die nächste Mahnstufe dran ist
  const payments = useMemo(() => {
    const today = todayIso(now);
    return documents
      .filter((d) => d.kind === 'invoice' && !d.paid_at && d.order_id)
      .map((d) => ({ doc: d, state: dunningState(d, followups, today) }))
      .filter((x) => x.state.step === 'due' || x.state.step === 'escalate')
      .map(({ doc, state }) => ({
        key: `pay-${doc.id}`,
        orderId: doc.order_id!,
        docId: doc.id,
        label:
          state.step === 'due'
            ? `Rechnung überfällig – ${state.next.label} ist dran`
            : 'Letzte Mahnung ohne Zahlung – Mahnverfahren?',
        title: `${doc.number} · ${doc.data.buyer.name} · ${formatMoney(doc.total)}`,
      }));
  }, [documents, followups, now]);
  const origin = sellerAddress(seller);
  const thisMonday = startOfWeek(now);
  const monday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() + offset * 7);
  const days = weekDays(monday);
  const todayKey = dayKey(now);
  const todayCount = (byDay.get(todayKey) ?? []).length;
  const thisWeek = weekDays(thisMonday).reduce((n, d) => n + (byDay.get(dayKey(d))?.length ?? 0), 0);

  return (
    <Screen maxWidth={1240}>
      <PageHeader
        title="Termine"
        subtitle="Erstgespräche, Ausführungen und eigene Termine – mit Tagesroute und Kalender-Abo."
        action={
          <View style={styles.headerActions}>
            <ActionChip
              icon={CalendarSync}
              label="Kalender-Abo"
              active={showAbo}
              onPress={() => setShowAbo((v) => !v)}
            />
            <Button label="+ Termin" onPress={() => router.push('/termine/neu')} style={styles.newButton} />
          </View>
        }
      />
      {showAbo && (
        <Reveal>
          <CalendarSubscription onClose={() => setShowAbo(false)} />
        </Reveal>
      )}
      {setupError === 'setup' && (
        <Notice tone="error">
          Für eigene Termine fehlt noch das Datenbank-Skript 20261109090000_appointments.sql (siehe supabase/README.md).
          Termine aus Aufträgen siehst du trotzdem.
        </Notice>
      )}

      <Reveal delay={120}>
        <StatRow>
          <StatTile label="Heute" value={String(todayCount)} tone={todayCount ? 'accent' : undefined} />
          <StatTile label="Diese Woche" value={String(thisWeek)} />
          <StatTile
            label="Offene Punkte"
            value={String(open.length + payments.length)}
            tone={open.length + payments.length ? 'accent' : 'muted'}
          />
        </StatRow>
      </Reveal>

      {open.length + payments.length > 0 && (
        <Reveal delay={170}>
          <OpenItems items={open} payments={payments} />
        </Reveal>
      )}

      <Reveal delay={220}>
        <View style={styles.toolbar}>
          <View style={styles.segment}>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'week', label: 'Woche' },
                { value: 'list', label: 'Liste' },
              ]}
            />
          </View>
          <Legend />
        </View>
      </Reveal>

      <Reveal delay={260}>
        {view === 'week' ? (
          <View style={styles.week}>
            <View style={styles.weekNav}>
              <NavButton label="Vorige Woche" onPress={() => setOffset((o) => o - 1)} icon={ChevronLeft} />
              <Text style={styles.weekLabel} testID="week-label">
                KW {isoWeek(monday)} · {shortDate(days[0])} – {shortDate(days[6])} {days[6].getFullYear()}
              </Text>
              <NavButton label="Nächste Woche" onPress={() => setOffset((o) => o + 1)} icon={ChevronRight} />
              {offset !== 0 && (
                <Pressable onPress={() => setOffset(0)} accessibilityRole="button" style={styles.todayButton}>
                  <Text style={styles.todayText}>Heute</Text>
                </Pressable>
              )}
            </View>
            <View style={columns ? styles.columns : styles.dayList}>
              {days.map((d) => {
                const key = dayKey(d);
                const list = byDay.get(key) ?? [];
                return columns ? (
                  <DayColumn
                    key={key}
                    day={d}
                    today={key === todayKey}
                    events={list}
                    overlaps={overlaps}
                    origin={origin}
                  />
                ) : (
                  <DaySection key={key} day={d} now={now} events={list} overlaps={overlaps} origin={origin} showEmpty />
                );
              })}
            </View>
          </View>
        ) : (
          <ListView events={events} now={now} overlaps={overlaps} origin={origin} />
        )}
      </Reveal>
    </Screen>
  );
}

function Legend() {
  const items: [string, string][] = [
    ['#9085E9', 'Erstgespräch'],
    [Colors.accent, 'Ausführung'],
    ['#8E8E93', 'Eigener Termin'],
  ];
  return (
    <View style={styles.legend} accessibilityLabel="Farben: Erstgespräch lila, Ausführung grün, eigener Termin grau">
      {items.map(([color, label]) => (
        <View key={label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: color }]} />
          <Text style={styles.legendText}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function NavButton({ label, onPress, icon: Icon }: { label: string; onPress: () => void; icon: typeof ChevronLeft }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...hoverProps}
      style={[styles.navButton, hovered && styles.navButtonHover]}>
      <Icon size={18} color={Colors.text} strokeWidth={2} />
    </Pressable>
  );
}

function RouteLink({ events, origin }: { events: CalendarEvent[]; origin: string | null }) {
  const url = routeUrl(
    origin,
    events.filter((e) => !e.allDay).map((e) => e.location),
  );
  if (!url) return null;
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="link"
      accessibilityLabel="Tagesroute in Google Maps"
      hitSlop={6}
      style={styles.route}>
      <Navigation size={12} color={Colors.textMuted} strokeWidth={2.2} />
      <Text style={styles.routeText}>Route</Text>
    </Pressable>
  );
}

/** Mac: ein Tag als Spalte */
function DayColumn({
  day,
  today,
  events,
  overlaps,
  origin,
}: {
  day: Date;
  today: boolean;
  events: CalendarEvent[];
  overlaps: Set<string>;
  origin: string | null;
}) {
  const key = dayKey(day);
  return (
    <View style={[styles.column, today && styles.columnToday]} testID={`day-${key}`}>
      <View style={styles.columnHead}>
        <Text style={[styles.columnDay, today && styles.columnDayToday]}>
          {WEEKDAY[(day.getDay() + 6) % 7]} {day.getDate()}.
        </Text>
        <RouteLink events={events} origin={origin} />
      </View>
      {events.map((e) => (
        <EventChip key={e.key} event={e} overlap={overlaps.has(e.key)} />
      ))}
      <AddButton day={key} />
    </View>
  );
}

function AddButton({ day }: { day: string }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={() => newOn(day)}
      accessibilityRole="button"
      accessibilityLabel={`Termin am ${day} hinzufügen`}
      {...hoverProps}
      style={[styles.add, hovered && styles.addHover]}>
      <Plus size={14} color={hovered ? Colors.text : Colors.textFaint} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Handy bzw. Liste: ein Tag mit Überschrift und großen Karten */
function DaySection({
  day,
  now,
  events,
  overlaps,
  origin,
  showEmpty,
}: {
  day: Date;
  now: Date;
  events: CalendarEvent[];
  overlaps: Set<string>;
  origin: string | null;
  showEmpty?: boolean;
}) {
  const key = dayKey(day);
  const label = dayLabel(day, now);
  const relative = ['Heute', 'Morgen', 'Gestern'].includes(label);
  return (
    <View style={styles.section} testID={`day-${key}`}>
      <View style={styles.sectionHead}>
        <Text style={[styles.sectionTitle, label === 'Heute' && styles.sectionToday]}>
          {label}
          {relative && (
            <Text style={styles.sectionDate}>
              {' '}
              · {day.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })}
            </Text>
          )}
        </Text>
        <RouteLink events={events} origin={origin} />
        <AddButton day={key} />
      </View>
      {events.length === 0 && showEmpty && <Text style={styles.empty}>Keine Termine</Text>}
      {events.map((e) => (
        <EventRow key={e.key} event={e} overlap={overlaps.has(e.key)} />
      ))}
    </View>
  );
}

function ListView({
  events,
  now,
  overlaps,
  origin,
}: {
  events: CalendarEvent[];
  now: Date;
  overlaps: Set<string>;
  origin: string | null;
}) {
  const list = upcoming(events, now, LIST_DAYS);
  const days = [...eventsByDay(list).entries()];
  if (!days.length) {
    return (
      <Card>
        <Text style={styles.emptyTitle}>Keine Termine in den nächsten {LIST_DAYS} Tagen.</Text>
        <Text style={styles.empty}>
          Trag Erstgespräche und Ausführungen im Auftrag ein – oder lege einen eigenen Termin an.
        </Text>
        <View style={styles.emptyAction}>
          <Button label="+ Termin" onPress={() => router.push('/termine/neu')} />
        </View>
      </Card>
    );
  }
  return (
    <View style={styles.dayList}>
      {days.map(([key, dayEvents]) => (
        <DaySection
          key={key}
          day={new Date(`${key}T12:00:00`)}
          now={now}
          events={dayEvents}
          overlaps={overlaps}
          origin={origin}
        />
      ))}
    </View>
  );
}

/** Offene Punkte: Erstgespräch bestätigen, Termin vereinbaren, Auftrag abschließen */
type PaymentItem = { key: string; orderId: string; docId: string; label: string; title: string };

function OpenItems({ items, payments }: { items: OpenItem[]; payments: PaymentItem[] }) {
  const { updateOrder } = useCrm();
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const total = items.length + payments.length;
  const shownPayments = all ? payments : payments.slice(0, 4);
  const shown = all ? items : items.slice(0, Math.max(0, 4 - shownPayments.length));
  const act = async (item: OpenItem, patch: { meeting_done?: boolean; completed?: boolean }) => {
    setBusy(item.key);
    setError(null);
    const r = await updateOrder(item.orderId, patch);
    setBusy(null);
    if (r.error) setError(r.error);
  };
  return (
    <Card>
      <Text style={styles.cardTitle}>Zu erledigen</Text>
      {shownPayments.map((p) => (
        <View key={p.key} style={styles.openRow} testID="open-item">
          <View style={styles.openText}>
            <Text style={[styles.openLabel, styles.openLabelMoney]}>{p.label}</Text>
            <Text style={styles.openTitle} numberOfLines={1}>
              {p.title}
            </Text>
          </View>
          <View style={styles.openActions}>
            <ActionChip label="Mahnen" onPress={() => router.push(`/auftraege/${p.orderId}?mahnen=${p.docId}`)} />
          </View>
        </View>
      ))}
      {shown.map((item) => (
        <View key={item.key} style={styles.openRow} testID="open-item">
          <View style={styles.openText}>
            <Text style={styles.openLabel}>{OPEN_LABEL[item.kind]}</Text>
            <Text style={styles.openTitle} numberOfLines={1}>
              {item.title}
              {item.customerName ? ` · ${item.customerName}` : ''}
              {item.when && item.kind !== 'schedule_meeting'
                ? ` · ${new Date(item.when).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}`
                : ''}
            </Text>
          </View>
          <View style={styles.openActions}>
            {item.kind === 'confirm_meeting' && (
              <ActionChip
                label="Ja, erledigt"
                onPress={() => void act(item, { meeting_done: true })}
                disabled={busy === item.key}
              />
            )}
            {item.kind === 'finish_order' && (
              <ActionChip
                label="Abschließen"
                onPress={() => void act(item, { completed: true })}
                disabled={busy === item.key}
              />
            )}
            <ActionChip
              label={item.kind.startsWith('schedule') ? 'Termin eintragen' : 'Auftrag öffnen'}
              onPress={() => router.push(`/auftraege/${item.orderId}`)}
            />
          </View>
        </View>
      ))}
      {total > 4 && (
        <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" style={styles.more}>
          <Text style={styles.moreText}>{all ? 'Weniger anzeigen' : `Alle ${total} anzeigen`}</Text>
        </Pressable>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md },
  newButton: { minWidth: 130 },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  segment: { width: 260 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: Colors.textMuted, fontSize: 12.5 },
  week: { gap: Spacing.md },
  weekNav: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  weekLabel: { color: Colors.text, fontSize: 16, fontWeight: '700', minWidth: 220, textAlign: 'center' },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonHover: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
  todayButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  todayText: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  columns: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'stretch' },
  column: {
    flex: 1,
    minWidth: 0,
    minHeight: 220,
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 8,
  },
  columnToday: { borderColor: 'rgba(47,227,154,0.45)' },
  columnHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 2 },
  columnDay: { color: Colors.textMuted, fontSize: 13, fontWeight: '700' },
  columnDayToday: { color: Colors.accent },
  add: {
    marginTop: 'auto',
    height: 28,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  addHover: { borderColor: Colors.borderFocus },
  route: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  routeText: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', textDecorationLine: 'underline' },
  dayList: { gap: Spacing.lg },
  section: { gap: Spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  sectionTitle: { flex: 1, color: Colors.text, fontSize: 16, fontWeight: '700' },
  sectionToday: { color: Colors.accent },
  sectionDate: { color: Colors.textMuted, fontWeight: '500', fontSize: 14 },
  empty: { color: Colors.textFaint, fontSize: 13.5, lineHeight: 19 },
  emptyTitle: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  emptyAction: { flexDirection: 'row' },
  cardTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  openRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  openText: { flex: 1, minWidth: 220, gap: 1 },
  openLabel: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  openLabelMoney: { color: Colors.danger },
  openTitle: { color: Colors.textMuted, fontSize: 13 },
  openActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  more: { alignSelf: 'flex-start' },
  moreText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
});
