import { router } from 'expo-router';
import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { dayLabel, KIND_LABEL, timeLabel, upcoming, type CalendarEvent } from './appointment-logic';
import { openEvent } from './event-card';
import { useCalendarEvents } from './use-calendar-events';

const MAX = 4;

/** Startseite: Termine heute und morgen (nur, wenn es welche gibt) */
export function UpcomingAppointments() {
  const events = useCalendarEvents();
  const [now] = useState(() => new Date());
  const soon = upcoming(events, now, 1);
  if (!soon.length) return null;
  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.eyebrow}>HEUTE & MORGEN</Text>
        <Pressable onPress={() => router.navigate('/termine')} accessibilityRole="link" style={styles.all}>
          <Text style={styles.allText}>Alle Termine</Text>
          <ArrowRight size={14} color={Colors.textMuted} />
        </Pressable>
      </View>
      {soon.slice(0, MAX).map((e) => (
        <Row key={e.key} event={e} now={now} />
      ))}
      {soon.length > MAX && <Text style={styles.more}>+ {soon.length - MAX} weitere</Text>}
    </Card>
  );
}

function Row({ event: e, now }: { event: CalendarEvent; now: Date }) {
  const { hovered, hoverProps } = useHover();
  const day = dayLabel(e.start, now);
  return (
    <Pressable
      onPress={() => openEvent(e)}
      accessibilityRole="button"
      {...hoverProps}
      style={[styles.row, hovered && styles.rowHover]}
      testID="upcoming-row">
      <View style={styles.when}>
        <Text style={[styles.day, day === 'Heute' && styles.today]}>{day}</Text>
        <Text style={styles.time}>{e.allDay ? 'ganztägig' : timeLabel(e).split('–')[0]}</Text>
      </View>
      <View style={styles.what}>
        <Text style={styles.title} numberOfLines={1}>
          {e.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {KIND_LABEL[e.kind]}
          {e.customerName ? ` · ${e.customerName}` : ''}
          {e.location ? ` · ${e.location}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  all: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  allText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
  row: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center', paddingVertical: 6, borderRadius: 8 },
  rowHover: { backgroundColor: Colors.surfaceRaised },
  when: { width: 74 },
  day: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  today: { color: Colors.accent },
  time: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  what: { flex: 1, minWidth: 0 },
  title: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  more: { color: Colors.textFaint, fontSize: 13 },
});
