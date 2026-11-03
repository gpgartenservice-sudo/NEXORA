import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { StatRow, StatTile } from '@/features/crm/ui';
import { useHover } from '@/hooks/use-hover';

import { PlatformBadges } from './post-card';
import { compactNumber, computePostStatus, engagementRate, PLATFORMS, summarizeMetrics } from './social-logic';
import type { SocialPost } from './social-provider';

type Range = '30' | '90' | 'all';

/** Zahlen der veröffentlichten Posts: Aufrufe, Interaktionen, Follower, Top-Posts. */
export function MetricsView({ posts }: { posts: SocialPost[] }) {
  const [range, setRange] = useState<Range>('30');
  // Zeitpunkt einmal beim Öffnen festhalten (Darstellung bleibt stabil)
  const [now] = useState(() => Date.now());
  const since = range === 'all' ? null : now - Number(range) * 86400000;
  const published = posts.filter(
    (p) => computePostStatus(p) === 'published' && (!since || new Date(p.published_at!).getTime() >= since),
  );
  const s = summarizeMetrics(published);
  const top = [...published]
    .filter((p) => (p.views ?? 0) > 0)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, 5);
  const missing = published.length - s.withNumbers;
  const perPlatform = PLATFORMS.map((pl) => ({
    ...pl,
    count: published.filter((p) => p.platforms.includes(pl.key)).length,
  })).filter((p) => p.count > 0);

  return (
    <View style={styles.wrap}>
      <View style={styles.rangeWrap}>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '30', label: '30 Tage' },
            { value: '90', label: '90 Tage' },
            { value: 'all', label: 'Gesamt' },
          ]}
        />
      </View>
      <StatRow>
        <StatTile label="Veröffentlicht" value={String(s.posts)} />
        <StatTile label="Aufrufe" value={compactNumber(s.views)} />
        <StatTile label="Ø Aufrufe pro Post" value={compactNumber(s.avgViews)} />
        <StatTile
          label="Interaktionsrate"
          value={s.rate === null ? '–' : `${s.rate.toLocaleString('de-DE')} %`}
          tone={s.rate === null ? 'muted' : undefined}
        />
        <StatTile
          label="Neue Follower"
          value={`+${compactNumber(s.followers)}`}
          tone={s.followers ? 'accent' : 'muted'}
        />
      </StatRow>
      {missing > 0 && (
        <Text style={styles.hint}>
          Bei {missing === 1 ? '1 Post fehlen' : `${missing} Posts fehlen`} noch Zahlen – trag Aufrufe & Likes im Post
          ein.
        </Text>
      )}

      <Card>
        <Text style={styles.cardTitle}>Top-Posts</Text>
        {top.length === 0 ? (
          <Text style={styles.empty}>
            Sobald du bei veröffentlichten Posts Aufrufe einträgst, siehst du hier deine besten.
          </Text>
        ) : (
          top.map((p, i) => <TopRow key={p.id} rank={i + 1} post={p} />)
        )}
      </Card>

      {perPlatform.length > 0 && (
        <Card>
          <Text style={styles.cardTitle}>Posts pro Plattform</Text>
          {perPlatform.map((p) => (
            <View key={p.key} style={styles.platformRow}>
              <Text style={styles.platformName}>{p.label}</Text>
              <Text style={styles.platformCount}>{p.count}</Text>
            </View>
          ))}
        </Card>
      )}
      <Text style={styles.footnote}>
        Interaktionsrate = (Likes + Kommentare + Geteilt + Gespeichert) ÷ Aufrufe. Die Zahlen trägst du selbst ein – die
        automatische Verbindung zu TikTok & Instagram kommt bald.
      </Text>
    </View>
  );
}

function TopRow({ rank, post }: { rank: number; post: SocialPost }) {
  const { hovered, hoverProps } = useHover();
  const rate = engagementRate(post);
  return (
    <Pressable
      onPress={() => router.push(`/social/${post.id}`)}
      accessibilityRole="link"
      {...hoverProps}
      style={[styles.top, hovered && styles.topHover]}>
      <Text style={styles.rank}>{rank}</Text>
      <View style={styles.topTexts}>
        <Text style={styles.topTitle} numberOfLines={1}>
          {post.title}
        </Text>
        <PlatformBadges platforms={post.platforms} />
      </View>
      <View style={styles.topNumbers}>
        <Text style={styles.views}>{compactNumber(post.views ?? 0)} Aufrufe</Text>
        {rate !== null && <Text style={styles.rate}>{rate.toLocaleString('de-DE')} % Interaktion</Text>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.lg },
  rangeWrap: { maxWidth: 360 },
  hint: { color: Colors.textMuted, fontSize: 13.5 },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  empty: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  topHover: { backgroundColor: Colors.surfaceRaised },
  rank: { color: Colors.textFaint, fontSize: 15, fontWeight: '700', width: 18, textAlign: 'center' },
  topTexts: { flex: 1, gap: 4 },
  topTitle: { color: Colors.text, fontSize: 14.5, fontWeight: '600' },
  topNumbers: { alignItems: 'flex-end', gap: 2 },
  views: { color: Colors.text, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'] },
  rate: { color: Colors.textMuted, fontSize: 12 },
  platformRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  platformName: { color: Colors.text, fontSize: 14 },
  platformCount: { color: Colors.textMuted, fontSize: 14, fontVariant: ['tabular-nums'] },
  footnote: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
});
