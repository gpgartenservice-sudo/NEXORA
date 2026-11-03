import { useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';

import { PostCard } from './post-card';
import { computePostStatus, STATUS, type PostStatus } from './social-logic';
import type { SocialPost } from './social-provider';

const HINT: Record<PostStatus, string> = {
  idea: 'Sammle hier jede Idee – auch halbe.',
  in_progress: 'Sobald du einen Schritt abhakst, landet die Idee hier.',
  ready: 'Alle Schritte erledigt – bereit zum Posten.',
  published: 'Veröffentlichte Posts mit ihren Zahlen.',
};

const PUBLISHED_LIMIT = 8;

/** Sortierung: Geplante zuerst (früheste oben), dann zuletzt bearbeitete. Veröffentlichte: neueste oben. */
function sortFor(status: PostStatus) {
  return (a: SocialPost, b: SocialPost) => {
    if (status === 'published') return (b.published_at ?? '').localeCompare(a.published_at ?? '');
    if (a.planned_for && b.planned_for) return a.planned_for.localeCompare(b.planned_for);
    if (a.planned_for) return -1;
    if (b.planned_for) return 1;
    return b.updated_at.localeCompare(a.updated_at);
  };
}

/** Content-Board: Spalten Idee / In Arbeit / Bereit / Veröffentlicht. Am Handy mit Filter statt Spalten. */
export function BoardView({ posts }: { posts: SocialPost[] }) {
  const { width } = useWindowDimensions();
  const wide = width >= 1100;
  const [filter, setFilter] = useState<PostStatus>('idea');
  const [showAll, setShowAll] = useState(false);

  const groups = Object.fromEntries(
    STATUS.map((s) => [s.key, posts.filter((p) => computePostStatus(p) === s.key).sort(sortFor(s.key))]),
  ) as Record<PostStatus, SocialPost[]>;

  const column = (status: PostStatus) => {
    const list = groups[status];
    const visible = status === 'published' && !showAll ? list.slice(0, PUBLISHED_LIMIT) : list;
    return (
      <View style={styles.cards}>
        {list.length === 0 ? (
          <Text style={styles.empty}>{HINT[status]}</Text>
        ) : (
          visible.map((p) => <PostCard key={p.id} post={p} />)
        )}
        {status === 'published' && list.length > PUBLISHED_LIMIT && (
          <Text style={styles.more} onPress={() => setShowAll((v) => !v)} accessibilityRole="button">
            {showAll ? 'Weniger anzeigen' : `Alle ${list.length} anzeigen`}
          </Text>
        )}
      </View>
    );
  };

  if (!wide) {
    return (
      <View style={styles.narrow}>
        <View style={styles.filters} accessibilityRole="radiogroup" accessibilityLabel="Status">
          {STATUS.map((s) => {
            const active = filter === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => setFilter(s.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${s.label} ${groups[s.key].length}`}
                style={[styles.filter, active && styles.filterActive]}>
                <Text style={[styles.filterText, active && styles.filterTextActive]}>
                  {s.label} <Text style={styles.filterCount}>{groups[s.key].length}</Text>
                </Text>
              </Pressable>
            );
          })}
        </View>
        {column(filter)}
      </View>
    );
  }

  return (
    <View style={styles.columns}>
      {STATUS.map((s) => (
        <View key={s.key} style={styles.column} accessibilityRole="list" accessibilityLabel={s.label}>
          <View style={styles.columnHead}>
            <Text style={styles.columnTitle}>{s.label}</Text>
            <Text style={styles.count}>{groups[s.key].length}</Text>
          </View>
          {column(s.key)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  narrow: { gap: Spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  filter: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 7 },
  filterActive: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
  filterText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '500' },
  filterTextActive: { color: Colors.text, fontWeight: '600' },
  filterCount: { color: Colors.textFaint, fontVariant: ['tabular-nums'] },
  columns: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  column: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
  },
  columnHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  columnTitle: { color: Colors.text, fontSize: 14, fontWeight: '700' },
  count: { color: Colors.textFaint, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  cards: { gap: Spacing.sm },
  empty: { color: Colors.textFaint, fontSize: 13, lineHeight: 18, paddingHorizontal: 4, paddingVertical: Spacing.sm },
  more: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
    paddingHorizontal: 4,
  },
});
