import { router } from 'expo-router';
import { TriangleAlert, CalendarPlus, Check, MapPin, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { KIND_LABEL, mapUrl, timeLabel, type CalendarEvent } from './appointment-logic';
import { addToCalendar, calendarFileSupported, openGoogleCalendar } from './calendar-export';

/** Farbe je Art: Erstgespräch, Ausführung (grün), eigener Termin */
const KIND_COLOR: Record<CalendarEvent['kind'], string> = {
  meeting: '#9085E9',
  execution: Colors.accent,
  appointment: '#8E8E93',
};

/** Wohin ein Klick auf den Termin führt */
export function openEvent(e: CalendarEvent) {
  if (e.orderId) router.push(`/auftraege/${e.orderId}`);
  else if (e.appointmentId) router.push(`/termine/${e.appointmentId}`);
}

/** Kleine Karte für die Wochenansicht */
export function EventChip({ event: e, overlap }: { event: CalendarEvent; overlap?: boolean }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={() => openEvent(e)}
      accessibilityRole="button"
      accessibilityLabel={`${KIND_LABEL[e.kind]} ${timeLabel(e)}: ${e.title}${e.customerName ? `, ${e.customerName}` : ''}`}
      {...hoverProps}
      testID="event-chip"
      style={[
        styles.chip,
        { borderLeftColor: KIND_COLOR[e.kind] },
        hovered && styles.chipHover,
        e.done && styles.doneFade,
      ]}>
      <View style={styles.chipTop}>
        <Text style={styles.chipTime}>{e.allDay ? 'Ganztägig' : timeLabel(e).split('–')[0]}</Text>
        {overlap && <TriangleAlert size={12} color={Colors.danger} strokeWidth={2.2} />}
        {e.done && <Check size={12} color={Colors.accent} strokeWidth={2.6} />}
      </View>
      <Text style={[styles.chipTitle, e.done && styles.doneText]} numberOfLines={2}>
        {e.title}
      </Text>
      {!!e.customerName && (
        <Text style={styles.chipSub} numberOfLines={1}>
          {e.customerName}
        </Text>
      )}
    </Pressable>
  );
}

/** Große Karte für die Liste – mit Karte, Anruf und "In Kalender" */
export function EventRow({ event: e, overlap }: { event: CalendarEvent; overlap?: boolean }) {
  const { hovered, hoverProps } = useHover();
  const [note, setNote] = useState<string | null>(null);
  return (
    <View style={[styles.row, hovered && styles.rowHover]} {...hoverProps} testID="event-row">
      <Pressable onPress={() => openEvent(e)} accessibilityRole="button" style={styles.rowMain}>
        <View style={[styles.bar, { backgroundColor: KIND_COLOR[e.kind] }]} />
        <View style={styles.time}>
          <Text style={styles.timeText}>{e.allDay ? 'Ganztägig' : timeLabel(e).split('–')[0]}</Text>
          {!e.allDay && <Text style={styles.timeEnd}>bis {timeLabel(e).split('–')[1] ?? ''}</Text>}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.badges}>
            <Text style={[styles.kind, { color: KIND_COLOR[e.kind] }]}>{KIND_LABEL[e.kind]}</Text>
            {e.done && (
              <View style={styles.badge}>
                <Check size={11} color={Colors.accent} strokeWidth={2.6} />
                <Text style={styles.badgeText}>Erledigt</Text>
              </View>
            )}
            {overlap && (
              <View style={[styles.badge, styles.badgeWarn]}>
                <TriangleAlert size={11} color={Colors.danger} strokeWidth={2.2} />
                <Text style={[styles.badgeText, styles.badgeWarnText]}>Überschneidung</Text>
              </View>
            )}
          </View>
          <Text style={[styles.title, e.done && styles.doneText]} numberOfLines={2}>
            {e.title}
          </Text>
          {!!e.customerName && <Text style={styles.sub}>{e.customerName}</Text>}
        </View>
      </Pressable>
      <View style={styles.actions}>
        {!!e.location && (
          <SmallAction icon={MapPin} label={e.location} onPress={() => void Linking.openURL(mapUrl(e.location!))} />
        )}
        {!!e.phone && (
          <SmallAction
            icon={Phone}
            label="Anrufen"
            onPress={() => void Linking.openURL(`tel:${e.phone!.replace(/[^\d+]/g, '')}`)}
          />
        )}
        {calendarFileSupported && (
          <SmallAction
            icon={CalendarPlus}
            label="In Kalender"
            onPress={async () => {
              const r = await addToCalendar(e);
              setNote(
                r.error ?? (r.opened ? 'Im Kalender geöffnet.' : 'Kalender-Datei gespeichert – öffnen zum Übernehmen.'),
              );
            }}
          />
        )}
        <SmallAction label="Google Kalender" onPress={() => openGoogleCalendar(e)} />
      </View>
      {!!note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

function SmallAction({ icon: Icon, label, onPress }: { icon?: typeof MapPin; label: string; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      {...hoverProps}
      style={[styles.action, hovered && styles.actionHover]}>
      {Icon && <Icon size={13} color={Colors.textMuted} strokeWidth={2} />}
      <Text style={styles.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    borderLeftWidth: 3,
    backgroundColor: Colors.surfaceRaised,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
  },
  chipHover: { borderColor: Colors.borderFocus },
  chipTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipTime: { color: Colors.textMuted, fontSize: 11.5, fontWeight: '600' },
  chipTitle: { color: Colors.text, fontSize: 12.5, fontWeight: '600', lineHeight: 16 },
  chipSub: { color: Colors.textFaint, fontSize: 11.5 },
  doneFade: { opacity: 0.6 },
  doneText: { textDecorationLine: 'line-through' },
  row: {
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  rowHover: { borderColor: Colors.borderFocus },
  rowMain: { flexDirection: 'row', gap: Spacing.md, alignItems: 'stretch' },
  bar: { width: 3, borderRadius: 2 },
  time: { width: 64 },
  timeText: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  timeEnd: { color: Colors.textFaint, fontSize: 12 },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  kind: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
    backgroundColor: Colors.accentSoft,
  },
  badgeText: { color: Colors.text, fontSize: 11, fontWeight: '600' },
  badgeWarn: { backgroundColor: 'rgba(255,107,107,0.1)' },
  badgeWarnText: { color: Colors.danger },
  title: { color: Colors.text, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  sub: { color: Colors.textMuted, fontSize: 13 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 3 + Spacing.md + 64 + Spacing.md },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  actionHover: { borderColor: Colors.borderFocus },
  actionText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600', flexShrink: 1 },
  note: { color: Colors.textMuted, fontSize: 12.5, paddingLeft: 3 + Spacing.md + 64 + Spacing.md },
});
