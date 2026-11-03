import { router } from 'expo-router';
import { Music2 } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { ComingSoonPanel, SoonButton } from '@/components/ui/coming-soon';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import { StatRow, StatTile } from '@/features/crm/ui';

import { BoardView } from './board-view';
import { HashtagSetsView } from './hashtag-sets-view';
import { MetricsView } from './metrics-view';
import { computePostStatus, dayKey, startOfWeek } from './social-logic';
import { useSocial } from './social-provider';
import { WeekView } from './week-view';

type View_ = 'board' | 'week' | 'numbers' | 'tags';

/** Bereich Social Media: Content-Board, Wochenplan, Zahlen, Hashtag-Sets. */
export function SocialScreen() {
  const { posts, loading, error } = useSocial();
  const [view, setView] = useState<View_>('board');
  const [connectInfo, setConnectInfo] = useState(false);

  const count = (s: ReturnType<typeof computePostStatus>) => posts.filter((p) => computePostStatus(p) === s).length;
  const monday = startOfWeek(new Date());
  const weekStart = dayKey(monday);
  const weekEnd = dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
  const thisWeek = posts.filter((p) => {
    const when = p.planned_for ?? p.published_at;
    if (!when) return false;
    const k = dayKey(when);
    return k >= weekStart && k <= weekEnd;
  }).length;

  return (
    <Screen maxWidth={1180}>
      <PageHeader
        title="Social Media"
        subtitle="Von der Idee bis zum Post – plane deinen Content und behalte deine Zahlen im Blick."
        action={
          <View style={styles.actions}>
            <SoonButton
              icon={Music2}
              label="TikTok & Instagram verbinden"
              open={connectInfo}
              onPress={() => setConnectInfo((v) => !v)}
            />
            <Button label="+ Idee" onPress={() => router.push('/social/neu')} style={styles.action} />
          </View>
        }
      />
      {connectInfo && (
        <Reveal>
          <ComingSoonPanel
            icon={Music2}
            title="TikTok & Instagram verbinden"
            intro="Verbinde deine Konten – dann musst du deine Zahlen nicht mehr abtippen:"
            points={[
              'Aufrufe, Likes und Kommentare kommen automatisch zu jedem Post',
              'Follower-Wachstum Woche für Woche',
              'Neue Videos werden automatisch der passenden Idee zugeordnet',
            ]}
            safety="Sicher: Du meldest dich direkt bei TikTok bzw. Instagram an. NEXORA liest nur deine Zahlen und postet nichts ohne dich."
            onClose={() => setConnectInfo(false)}
          />
        </Reveal>
      )}
      {error && (
        <Notice tone="error">
          {error === 'setup'
            ? 'Social Media kann noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (siehe supabase/README.md).'
            : 'Deine Posts konnten nicht geladen werden. Prüfe deine Internetverbindung.'}
        </Notice>
      )}

      <Reveal delay={150}>
        <StatRow>
          <StatTile label="Ideen" value={String(count('idea'))} />
          <StatTile label="In Arbeit" value={String(count('in_progress'))} />
          <StatTile
            label="Bereit zum Posten"
            value={String(count('ready'))}
            tone={count('ready') ? 'accent' : undefined}
          />
          <StatTile label="Diese Woche geplant" value={String(thisWeek)} />
        </StatRow>
      </Reveal>

      <Reveal delay={210}>
        <View style={styles.tabs}>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'board', label: 'Board' },
              { value: 'week', label: 'Wochenplan' },
              { value: 'numbers', label: 'Zahlen' },
              { value: 'tags', label: 'Hashtags' },
            ]}
          />
        </View>
      </Reveal>

      {!loading && (
        <Reveal delay={260}>
          {view === 'board' && <BoardView posts={posts} />}
          {view === 'week' && <WeekView posts={posts} />}
          {view === 'numbers' && <MetricsView posts={posts} />}
          {view === 'tags' && <HashtagSetsView />}
        </Reveal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  action: { minWidth: 120 },
  tabs: { maxWidth: 560 },
});
