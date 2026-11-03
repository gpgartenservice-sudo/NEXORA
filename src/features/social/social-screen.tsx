import { router, useLocalSearchParams } from 'expo-router';
import { Music2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { ActionChip } from '@/components/ui/action-chip';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { Spacing } from '@/constants/theme';
import { StatRow, StatTile } from '@/features/crm/ui';
import { TourTarget, TutorialButton, useAreaTutorial } from '@/features/tutorial/tour-target';

import { AccountsView } from './accounts-view';
import { BoardView } from './board-view';
import { useSocialConnect } from './connect-provider';
import { HashtagSetsView } from './hashtag-sets-view';
import { MetricsView } from './metrics-view';
import { computePostStatus, dayKey, startOfWeek } from './social-logic';
import { useSocial } from './social-provider';
import type { ReturnParams } from './oauth';
import { WeekView } from './week-view';

type View_ = 'board' | 'week' | 'numbers' | 'tags' | 'accounts';

/** Bereich Social Media: Content-Board, Wochenplan, Zahlen, Hashtag-Sets, verbundene Konten. */
export function SocialScreen() {
  const { posts, loading, error } = useSocial();
  const connect = useSocialConnect();
  const { finishReturn, autoSync, loading: accountsLoading } = connect;
  const params = useLocalSearchParams<ReturnParams>();
  const { width } = useWindowDimensions();
  useAreaTutorial('social');
  const returning = !!(params.social_state || params.social_error);
  const [chosen, setView] = useState<View_>('board');
  // Rückkehr von der Anmeldung: gleich die Konten zeigen
  const view: View_ = returning ? 'accounts' : chosen;
  const handled = useRef(false);

  // Rückkehr von der Anmeldung bei TikTok/Instagram (Browser)
  useEffect(() => {
    if (handled.current || !returning) return;
    handled.current = true;
    void finishReturn(params).then(() => {
      setView('accounts');
      // Code & Co. aus der Adresse entfernen (ohne die Seite neu aufzubauen)
      router.setParams({
        social_platform: undefined,
        social_code: undefined,
        social_state: undefined,
        social_error: undefined,
        social_error_description: undefined,
      });
    });
  }, [returning, params, finishReturn]);

  // Zahlen der verbundenen Konten auffrischen, wenn sie älter als ein paar Stunden sind
  useEffect(() => {
    if (!accountsLoading) autoSync();
  }, [accountsLoading, autoSync]);

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
        help={<TutorialButton id="social" />}
        action={
          <TourTarget id="social.aktionen" style={styles.actions}>
            <ActionChip
              icon={Music2}
              label={connect.accounts.length ? 'TikTok & Instagram' : 'TikTok & Instagram verbinden'}
              active={view === 'accounts'}
              onPress={() => setView('accounts')}
            />
            <Button label="+ Idee" onPress={() => router.push('/social/neu')} style={styles.action} />
          </TourTarget>
        }
      />
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

      <TourTarget id="social.ansicht">
        <Reveal delay={210}>
          <View style={styles.tabs}>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'board', label: 'Board' },
                { value: 'week', label: width < 480 ? 'Woche' : 'Wochenplan' },
                { value: 'numbers', label: 'Zahlen' },
                { value: 'tags', label: 'Hashtags' },
                { value: 'accounts', label: 'Konten' },
              ]}
            />
          </View>
        </Reveal>
      </TourTarget>

      {!loading && (
        <Reveal delay={260}>
          {view === 'board' && <BoardView posts={posts} />}
          {view === 'week' && <WeekView posts={posts} />}
          {view === 'numbers' && <MetricsView posts={posts} />}
          {view === 'tags' && <HashtagSetsView />}
          {view === 'accounts' && <AccountsView />}
        </Reveal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  action: { minWidth: 120 },
  tabs: { maxWidth: 640 },
});
