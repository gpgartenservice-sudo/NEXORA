import { router } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import { PostCard, shortDateTime } from './post-card';
import { computePostStatus, dayKey, isoWeek, startOfWeek, weekDays } from './social-logic';
import type { SocialPost } from './social-provider';

const DAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const pad = (n: number) => String(n).padStart(2, '0');
const short = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;

/** Wochenplan: was wann gepostet wird (geplant bzw. veröffentlicht). */
export function WeekView({ posts }: { posts: SocialPost[] }) {
  const [monday, setMonday] = useState(() => startOfWeek(new Date()));
  const days = weekDays(monday);
  const today = dayKey(new Date());
  const shift = (weeks: number) => setMonday((m) => new Date(m.getFullYear(), m.getMonth(), m.getDate() + weeks * 7));

  const byDay = new Map<string, SocialPost[]>();
  for (const p of posts) {
    const when = computePostStatus(p) === 'published' ? (p.published_at ?? p.planned_for) : p.planned_for;
    if (!when) continue;
    const key = dayKey(when);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => (a.planned_for ?? a.published_at ?? '').localeCompare(b.planned_for ?? b.published_at ?? ''));
  }
  const unplannedReady = posts.filter((p) => computePostStatus(p) === 'ready' && !p.planned_for).length;
  const isThisWeek = dayKey(monday) === dayKey(startOfWeek(new Date()));

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        <Step dir={-1} onPress={() => shift(-1)} />
        <View style={styles.navTexts}>
          <Text style={styles.navTitle} accessibilityRole="header">
            KW {isoWeek(monday)} · {short(days[0])} – {short(days[6])}
          </Text>
          {!isThisWeek && (
            <Text
              style={styles.todayLink}
              onPress={() => setMonday(startOfWeek(new Date()))}
              accessibilityRole="button">
              Zur aktuellen Woche
            </Text>
          )}
        </View>
        <Step dir={1} onPress={() => shift(1)} />
      </View>
      {unplannedReady > 0 && (
        <Text style={styles.hint}>
          {unplannedReady === 1 ? '1 Post ist bereit' : `${unplannedReady} Posts sind bereit`}, aber noch nicht
          eingeplant – gib im Post ein Datum an.
        </Text>
      )}
      {days.map((d, i) => {
        const key = dayKey(d);
        const list = byDay.get(key) ?? [];
        const isToday = key === today;
        return (
          <Card key={key} style={[styles.day, isToday && styles.today]}>
            <View style={styles.dayHead}>
              <Text style={[styles.dayName, isToday && styles.dayToday]}>
                {DAY_NAMES[i]} <Text style={styles.dayDate}>{short(d)}</Text>
                {isToday ? <Text style={styles.todayTag}> · heute</Text> : null}
              </Text>
              <Text
                style={styles.plan}
                onPress={() => router.push({ pathname: '/social/neu', params: { datum: key } })}
                accessibilityRole="button"
                accessibilityLabel={`Post am ${DAY_NAMES[i]}, ${short(d)} planen`}>
                + planen
              </Text>
            </View>
            {list.length === 0 ? (
              <Text style={styles.empty}>Nichts geplant</Text>
            ) : (
              list.map((p) => (
                <View key={p.id} style={styles.entry}>
                  <Text style={styles.time}>{shortDateTime((p.planned_for ?? p.published_at)!, false)}</Text>
                  <View style={styles.flex}>
                    <PostCard post={p} compact />
                  </View>
                </View>
              ))
            )}
          </Card>
        );
      })}
    </View>
  );
}

function Step({ dir, onPress }: { dir: 1 | -1; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  const Icon = dir === 1 ? ChevronRight : ChevronLeft;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dir === 1 ? 'Nächste Woche' : 'Vorherige Woche'}
      {...hoverProps}
      style={[styles.step, hovered && styles.stepHover]}>
      <Icon size={18} color={Colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  navTexts: { alignItems: 'center', gap: 2, flex: 1 },
  navTitle: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  todayLink: { color: Colors.textMuted, fontSize: 12.5, textDecorationLine: 'underline' },
  step: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepHover: { borderColor: Colors.borderFocus },
  hint: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  day: { gap: Spacing.sm, paddingVertical: Spacing.md },
  today: { borderColor: 'rgba(47,227,154,0.45)' },
  dayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayName: { color: Colors.text, fontSize: 14.5, fontWeight: '700' },
  dayToday: { color: Colors.text },
  dayDate: { color: Colors.textMuted, fontWeight: '500' },
  todayTag: { color: Colors.accent, fontWeight: '600' },
  plan: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  empty: { color: Colors.textFaint, fontSize: 13 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  time: { color: Colors.textMuted, fontSize: 13, width: 44, fontVariant: ['tabular-nums'] },
  flex: { flex: 1 },
});
