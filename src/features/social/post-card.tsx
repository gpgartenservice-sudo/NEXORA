import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';
import { toDate } from '@/lib/dates';

import { compactNumber, computePostStatus, FORMATS, PLATFORMS, stepProgress } from './social-logic';
import type { SocialPost } from './social-provider';

const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "Do, 05.11. · 18:00" */
export function shortDateTime(value: string, withDay = true): string {
  const d = toDate(value);
  if (!d) return '–';
  const date = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withDay ? `${WEEKDAYS[d.getDay()]}, ${date} · ${time}` : time;
}

/** Kleine Kürzel der Plattformen (TT, IG, …) */
export function PlatformBadges({ platforms }: { platforms: string[] }) {
  if (!platforms.length) return null;
  return (
    <View style={styles.badges}>
      {PLATFORMS.filter((p) => platforms.includes(p.key)).map((p) => (
        <View key={p.key} style={styles.badge} accessibilityLabel={p.label}>
          <Text style={styles.badgeText}>{p.short}</Text>
        </View>
      ))}
    </View>
  );
}

/** Karte eines Posts im Board und im Wochenplan. */
export function PostCard({ post, compact }: { post: SocialPost; compact?: boolean }) {
  const { hovered, hoverProps } = useHover();
  const status = computePostStatus(post);
  const { done, total } = stepProgress(post);
  const format = FORMATS.find((f) => f.key === post.format)?.label ?? '';
  const when =
    status === 'published' && post.published_at
      ? `Veröffentlicht ${shortDateTime(post.published_at).split(' · ')[0]}`
      : post.planned_for
        ? shortDateTime(post.planned_for)
        : null;

  return (
    <Pressable
      onPress={() => router.push(`/social/${post.id}`)}
      accessibilityRole="link"
      accessibilityLabel={`${post.title}, ${format}`}
      {...hoverProps}
      style={[styles.card, compact && styles.compact, hovered && styles.cardHover]}>
      <Text style={styles.title} numberOfLines={compact ? 1 : 2}>
        {post.title}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.format}>{format}</Text>
        <PlatformBadges platforms={post.platforms} />
      </View>
      {status === 'published' ? (
        post.views ? (
          <Text style={styles.meta}>{compactNumber(post.views)} Aufrufe</Text>
        ) : null
      ) : (
        <View style={styles.progressRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(done / total) * 100}%` }]} />
          </View>
          <Text style={styles.meta}>
            {done}/{total}
          </Text>
        </View>
      )}
      {/* im Wochenplan steht die Uhrzeit schon daneben */}
      {!!when && !compact && <Text style={styles.when}>{when}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    padding: Spacing.md,
  },
  compact: { paddingVertical: 10 },
  cardHover: { borderColor: Colors.borderFocus },
  title: { color: Colors.text, fontSize: 14.5, fontWeight: '600', lineHeight: 19 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  format: { color: Colors.textMuted, fontSize: 12.5 },
  badges: { flexDirection: 'row', gap: 4 },
  badge: { borderRadius: 5, backgroundColor: Colors.surfaceRaised, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { color: Colors.textMuted, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.3 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: Colors.surfaceRaised, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: Colors.accent },
  meta: { color: Colors.textFaint, fontSize: 12, fontVariant: ['tabular-nums'] },
  when: { color: Colors.textMuted, fontSize: 12 },
});
