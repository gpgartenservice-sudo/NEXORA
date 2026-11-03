import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Bookmark,
  Camera,
  Check,
  ExternalLink,
  Eye,
  Film,
  Heart,
  MessageCircle,
  Music2,
  RefreshCw,
  Share2,
  type LucideIcon,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

import {
  CONNECTED_PLATFORMS,
  connectedLabel,
  followerGrowth,
  followerSeries,
  suggestPost,
  syncAge,
  type ConnectedPlatform,
  type SocialAccount,
  type SocialVideo,
} from './connect-logic';
import { useSocialConnect } from './connect-provider';
import { FollowerSparkline } from './follower-sparkline';
import { connectSupported } from './oauth';
import { compactNumber } from './social-logic';
import { useSocial, type SocialPost } from './social-provider';

const ICON: Record<ConnectedPlatform, LucideIcon> = { tiktok: Music2, instagram: Camera };
const ABOUT: Record<ConnectedPlatform, string> = {
  tiktok: 'Follower, Likes und die Aufrufe jedes Videos – automatisch.',
  instagram: 'Follower, Likes, Aufrufe und Gespeichert pro Beitrag (Business- oder Creator-Konto).',
};
const PAGE = 20;
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Konten: TikTok & Instagram verbinden, Follower-Verlauf, Videos den Ideen zuordnen. */
export function AccountsView() {
  const c = useSocialConnect();
  const { loadSetup, setup, setupError } = c;
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!setup && !setupError) void loadSetup();
  }, [setup, setupError, loadSetup]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        Verbinde deine Konten – dann kommen Follower, Aufrufe und Likes automatisch, und neue Videos landen bei der
        passenden Idee. Du meldest dich direkt bei TikTok bzw. Instagram an; NEXORA liest nur deine Zahlen und postet
        nichts.
      </Text>

      {c.message && (
        <Notice
          tone={c.message.tone}
          action={
            <Pressable
              onPress={c.clearMessage}
              accessibilityRole="button"
              accessibilityLabel="Hinweis schließen"
              hitSlop={8}>
              <Text style={styles.close}>Schließen</Text>
            </Pressable>
          }>
          {c.message.text}
          {c.message.setup ? '\n\nDie Schritt-für-Schritt-Anleitung steht in supabase/README.md.' : ''}
        </Notice>
      )}
      {c.tablesMissing && (
        <Notice tone="error">
          Für verbundene Konten fehlt noch das Datenbank-Skript 20261108090000_social_accounts.sql (Supabase → SQL
          Editor, Anleitung in supabase/README.md).
        </Notice>
      )}

      <View style={styles.cards}>
        {CONNECTED_PLATFORMS.map(({ key }) => (
          <AccountCard key={key} platform={key} account={c.accounts.find((a) => a.platform === key)} now={now} />
        ))}
      </View>

      <VideoList />
    </View>
  );
}

function PlatformIcon({ platform, size = 40 }: { platform: ConnectedPlatform; size?: number }) {
  const Icon = ICON[platform];
  return (
    <View style={[styles.platformIcon, { width: size, height: size, borderRadius: size / 3 }]}>
      <Icon size={size * 0.5} color={Colors.text} strokeWidth={1.9} />
    </View>
  );
}

function AccountCard({
  platform,
  account,
  now,
}: {
  platform: ConnectedPlatform;
  account?: SocialAccount;
  now: number;
}) {
  const c = useSocialConnect();
  const [confirm, setConfirm] = useState(false);
  const name = connectedLabel(platform);
  const busyHere = c.busy && (!c.busy.platform || c.busy.platform === platform) ? c.busy.action : null;
  const ready = c.setup ? c.setup[platform] : null;
  const supported = connectSupported();

  if (!account) {
    return (
      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <PlatformIcon platform={platform} />
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>{name}</Text>
            <Text style={styles.cardSub}>Nicht verbunden</Text>
          </View>
        </View>
        <Text style={styles.about}>{ABOUT[platform]}</Text>
        {ready === false && (
          <Text style={styles.hint}>
            Noch nicht eingerichtet: In Supabase fehlen die Geheimnisse{' '}
            {platform === 'tiktok'
              ? 'TIKTOK_CLIENT_KEY und TIKTOK_CLIENT_SECRET'
              : 'INSTAGRAM_APP_ID und INSTAGRAM_APP_SECRET'}
            . Anleitung: supabase/README.md.
          </Text>
        )}
        {!supported && <Text style={styles.hint}>Verbinden geht im Moment in der Mac-App oder im Browser.</Text>}
        <Button
          label={`Mit ${name} verbinden`}
          onPress={() => void c.connect(platform)}
          loading={busyHere === 'connect'}
          disabled={!supported || ready === false || c.tablesMissing || (!!c.busy && busyHere !== 'connect')}
        />
      </Card>
    );
  }

  const day = today();
  const series = followerSeries(c.stats, account.id, day, 30);
  const growth = followerGrowth(c.stats, account.id, day, 7);
  const who = account.display_name ?? account.username ?? name;
  return (
    <Card style={styles.card}>
      <View style={styles.cardHead}>
        {account.avatar_url ? (
          <Image
            source={{ uri: account.avatar_url }}
            style={styles.avatar}
            contentFit="cover"
            accessibilityLabel={`Profilbild ${who}`}
          />
        ) : (
          <PlatformIcon platform={platform} />
        )}
        <View style={styles.flex}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {who}
          </Text>
          <Pressable
            onPress={() => account.profile_url && void Linking.openURL(account.profile_url)}
            disabled={!account.profile_url}
            accessibilityRole="link"
            style={styles.profileLink}>
            <Text style={[styles.cardSub, styles.profileText]} numberOfLines={1}>
              {name}
              {account.username ? ` · @${account.username}` : ''}
            </Text>
            {!!account.profile_url && <ExternalLink size={12} color={Colors.textMuted} strokeWidth={2} />}
          </Pressable>
        </View>
        <View style={[styles.pill, account.status === 'reconnect' ? styles.pillWarn : styles.pillOk]}>
          {account.status === 'ok' && <Check size={12} color={Colors.accent} strokeWidth={2.6} />}
          <Text style={[styles.pillText, account.status === 'reconnect' && styles.pillTextWarn]}>
            {account.status === 'reconnect' ? 'Neu verbinden' : 'Verbunden'}
          </Text>
        </View>
      </View>

      <View style={styles.figure}>
        <Text style={styles.figureLabel}>Follower</Text>
        <View style={styles.figureRow}>
          <Text style={styles.figureValue} testID={`followers-${platform}`}>
            {account.followers === null ? '–' : compactNumber(account.followers)}
          </Text>
          {growth && (
            <Text style={[styles.delta, growth.delta < 0 && styles.deltaDown]}>
              {growth.delta > 0 ? '+' : growth.delta < 0 ? '−' : '±'}
              {Math.abs(growth.delta).toLocaleString('de-DE')} seit {dayLabel(growth.since)}
            </Text>
          )}
        </View>
      </View>
      <FollowerSparkline points={series} />

      <View style={styles.facts}>
        {platform === 'tiktok' && account.likes !== null && (
          <Fact label="Likes gesamt" value={compactNumber(account.likes)} />
        )}
        {account.media_count !== null && (
          <Fact label={platform === 'tiktok' ? 'Videos' : 'Beiträge'} value={compactNumber(account.media_count)} />
        )}
        {account.following !== null && <Fact label="Folgt" value={compactNumber(account.following)} />}
      </View>

      {account.status === 'reconnect' ? (
        <Text style={styles.errorText}>
          {account.last_error ?? 'Der Zugang ist abgelaufen. Bitte verbinde das Konto neu.'}
        </Text>
      ) : (
        !!account.last_error && <Text style={styles.errorText}>Letzter Abgleich: {account.last_error}</Text>
      )}

      <Text style={styles.syncAge}>Aktualisiert {syncAge(account.last_synced_at, now)}</Text>

      {confirm ? (
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            {name} trennen? Deine Posts und ihre Zahlen bleiben, der Verlauf und die Videoliste werden entfernt.
          </Text>
          <View style={styles.buttons}>
            <Button label="Abbrechen" variant="secondary" onPress={() => setConfirm(false)} style={styles.button} />
            <Button
              label="Ja, trennen"
              onPress={() => {
                setConfirm(false);
                void c.disconnect(platform);
              }}
              style={styles.button}
            />
          </View>
        </View>
      ) : (
        <View style={styles.buttons}>
          {account.status === 'reconnect' ? (
            <Button
              label="Neu verbinden"
              onPress={() => void c.connect(platform)}
              loading={busyHere === 'connect'}
              disabled={!supported || (!!c.busy && busyHere !== 'connect')}
              style={styles.button}
            />
          ) : (
            <Button
              label="Aktualisieren"
              variant="secondary"
              onPress={() => void c.sync(platform)}
              loading={busyHere === 'sync'}
              disabled={!!c.busy && busyHere !== 'sync'}
              style={styles.button}
            />
          )}
          <Button
            label="Trennen"
            variant="secondary"
            onPress={() => setConfirm(true)}
            loading={busyHere === 'disconnect'}
            disabled={!!c.busy}
            style={styles.button}
          />
        </View>
      )}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factValue}>{value}</Text>
      <Text style={styles.factLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Videos & Beiträge
// ---------------------------------------------------------------------------

type Filter = 'all' | 'open';

function VideoList() {
  const c = useSocialConnect();
  const { posts } = useSocial();
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const open = c.videos.filter((v) => !v.post_id);
  const list = filter === 'open' ? open : c.videos;
  if (!c.videos.length) return null;
  return (
    <View style={styles.videos}>
      <View style={styles.videosHead}>
        <View style={styles.flex}>
          <Text style={styles.sectionTitle}>Videos & Beiträge</Text>
          <Text style={styles.sectionSub}>
            Zugeordnete Videos geben ihre Zahlen automatisch an die Idee im Content-Board weiter.
          </Text>
        </View>
        <Pressable
          onPress={() => void c.sync()}
          disabled={!!c.busy}
          accessibilityRole="button"
          accessibilityLabel="Alle Konten aktualisieren"
          style={[styles.refresh, !!c.busy && styles.disabled]}>
          <RefreshCw size={15} color={Colors.text} strokeWidth={2} />
          <Text style={styles.refreshText}>{c.busy?.action === 'sync' ? 'Aktualisiere …' : 'Alle aktualisieren'}</Text>
        </Pressable>
      </View>
      <View style={styles.filter}>
        <Segmented
          value={filter}
          onChange={(v) => {
            setFilter(v);
            setLimit(PAGE);
          }}
          options={[
            { value: 'all', label: `Alle (${c.videos.length})` },
            { value: 'open', label: `Nicht zugeordnet (${open.length})` },
          ]}
        />
      </View>
      {list.length === 0 && <Text style={styles.sectionSub}>Alle Videos sind einer Idee zugeordnet.</Text>}
      {list.slice(0, limit).map((v) => (
        <VideoRow key={v.id} video={v} posts={posts} />
      ))}
      {list.length > limit && (
        <Button
          label={`Weitere ${Math.min(PAGE, list.length - limit)} anzeigen`}
          variant="secondary"
          onPress={() => setLimit((l) => l + PAGE)}
        />
      )}
    </View>
  );
}

function Metric({ icon: Icon, value, label }: { icon: LucideIcon; value: number | null; label: string }) {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.metric} accessibilityLabel={`${label}: ${value.toLocaleString('de-DE')}`}>
      <Icon size={13} color={Colors.textMuted} strokeWidth={2} />
      <Text style={styles.metricText}>{compactNumber(Number(value))}</Text>
    </View>
  );
}

function VideoRow({ video, posts }: { video: SocialVideo; posts: SocialPost[] }) {
  const c = useSocialConnect();
  const [picking, setPicking] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linked = video.post_id ? posts.find((p) => p.id === video.post_id) : undefined;
  const suggestion = useMemo(
    () => (video.post_id ? null : suggestPost(video, c.videos, posts)),
    [video, c.videos, posts],
  );
  // Ideen, die für diese Plattform noch frei sind (neueste zuerst)
  const choices = useMemo(() => {
    const taken = new Set(c.videos.filter((v) => v.post_id && v.platform === video.platform).map((v) => v.post_id));
    return posts.filter((p) => !taken.has(p.id)).slice(0, 12);
  }, [c.videos, posts, video.platform]);

  const run = async (fn: () => Promise<string | undefined>) => {
    setWorking(true);
    setError(null);
    const e = await fn();
    setWorking(false);
    if (e) setError(e);
    else setPicking(false);
  };
  const Fallback = video.media_type === 'video' ? Film : Camera;

  return (
    <View style={styles.row} testID="social-video">
      <Pressable
        onPress={() => video.url && void Linking.openURL(video.url)}
        disabled={!video.url}
        accessibilityRole="link"
        accessibilityLabel={`Auf ${connectedLabel(video.platform)} öffnen`}
        style={styles.thumbWrap}>
        {video.thumbnail_url ? (
          <Image source={{ uri: video.thumbnail_url }} style={styles.thumb} contentFit="cover" />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            <Fallback size={18} color={Colors.textFaint} strokeWidth={1.8} />
          </View>
        )}
      </Pressable>
      <View style={styles.rowBody}>
        <Text style={styles.caption} numberOfLines={2}>
          {video.caption?.trim() || 'Ohne Beschreibung'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>
            {connectedLabel(video.platform)} · {shortDate(video.published_at)}
          </Text>
          <Metric icon={Eye} value={video.views} label="Aufrufe" />
          <Metric icon={Heart} value={video.likes} label="Likes" />
          <Metric icon={MessageCircle} value={video.comments} label="Kommentare" />
          <Metric icon={Share2} value={video.shares} label="Geteilt" />
          <Metric icon={Bookmark} value={video.saves} label="Gespeichert" />
        </View>

        {linked ? (
          <View style={styles.linkRow}>
            <Chip label={`Idee: ${linked.title}`} tone="accent" onPress={() => router.push(`/social/${linked.id}`)} />
            <SmallLink label="Lösen" onPress={() => void run(() => c.linkVideo(video.id, null))} disabled={working} />
          </View>
        ) : (
          <View style={styles.linkRow}>
            {suggestion && !picking && (
              <Chip
                label={`Passt zu „${suggestion.title}“? Zuordnen`}
                tone="accent"
                onPress={() => void run(() => c.linkVideo(video.id, suggestion.id))}
                disabled={working}
              />
            )}
            {!picking && (
              <Chip
                label="Als Post übernehmen"
                onPress={() => void run(async () => (await c.importVideo(video.id)).error)}
                disabled={working}
              />
            )}
            {!picking && choices.length > 0 && (
              <SmallLink label="Andere Idee wählen" onPress={() => setPicking(true)} disabled={working} />
            )}
          </View>
        )}
        {picking && (
          <View style={styles.picker}>
            <Text style={styles.pickerTitle}>
              Welcher Idee gehört das {video.platform === 'tiktok' ? 'Video' : 'Beitrag'}?
            </Text>
            <View style={styles.linkRow}>
              {choices.map((p) => (
                <Chip
                  key={p.id}
                  label={p.title}
                  onPress={() => void run(() => c.linkVideo(video.id, p.id))}
                  disabled={working}
                />
              ))}
              <SmallLink label="Abbrechen" onPress={() => setPicking(false)} disabled={working} />
            </View>
          </View>
        )}
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </View>
    </View>
  );
}

function Chip({
  label,
  onPress,
  tone,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'accent';
  disabled?: boolean;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      {...hoverProps}
      style={[
        styles.chip,
        tone === 'accent' && styles.chipAccent,
        hovered && styles.chipHover,
        disabled && styles.disabled,
      ]}>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function SmallLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" hitSlop={6}>
      <Text style={[styles.smallLink, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.lg },
  flex: { flex: 1, minWidth: 0 },
  intro: { color: Colors.textMuted, fontSize: 14, lineHeight: 21, maxWidth: 760 },
  close: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  card: { flexGrow: 1, flexBasis: 320, gap: Spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  cardSub: { color: Colors.textMuted, fontSize: 13 },
  profileLink: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%' },
  profileText: { flexShrink: 1 },
  platformIcon: {
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surfaceRaised },
  about: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  hint: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  pillOk: { borderColor: 'rgba(47,227,154,0.35)', backgroundColor: Colors.accentSoft },
  pillWarn: { borderColor: 'rgba(255,107,107,0.4)', backgroundColor: 'rgba(255,107,107,0.08)' },
  pillText: { color: Colors.text, fontSize: 12, fontWeight: '600' },
  pillTextWarn: { color: Colors.danger },
  figure: { gap: 2 },
  figureLabel: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '500' },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: Spacing.md },
  figureValue: { color: Colors.text, fontSize: 34, fontWeight: '700', letterSpacing: -0.5 },
  delta: { color: Colors.accent, fontSize: 13.5, fontWeight: '600' },
  deltaDown: { color: Colors.danger },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  fact: { gap: 1 },
  factValue: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  factLabel: { color: Colors.textFaint, fontSize: 12 },
  syncAge: { color: Colors.textFaint, fontSize: 12 },
  errorText: { color: Colors.danger, fontSize: 13, lineHeight: 19 },
  // passen beide nicht nebeneinander (Handy), stehen sie untereinander
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  button: { flexGrow: 1, flexBasis: 150 },
  confirm: { gap: Spacing.sm },
  confirmText: { color: Colors.text, fontSize: 13.5, lineHeight: 19 },
  videos: { gap: Spacing.md },
  videosHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, flexWrap: 'wrap' },
  sectionTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  sectionSub: { color: Colors.textMuted, fontSize: 13, lineHeight: 19 },
  refresh: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  refreshText: { color: Colors.text, fontSize: 13, fontWeight: '600' },
  filter: { maxWidth: 420 },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  thumbWrap: { borderRadius: 8, overflow: 'hidden' },
  thumb: { width: 54, height: 72, borderRadius: 8, backgroundColor: Colors.surfaceRaised },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, gap: 6 },
  caption: { color: Colors.text, fontSize: 14, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Spacing.md, rowGap: 4 },
  meta: { color: Colors.textFaint, fontSize: 12.5 },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  linkRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipAccent: { borderColor: 'rgba(47,227,154,0.45)', backgroundColor: Colors.accentSoft },
  chipHover: { borderColor: Colors.borderFocus },
  chipText: { color: Colors.text, fontSize: 13, fontWeight: '500' },
  smallLink: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  picker: { gap: Spacing.sm, paddingTop: 4 },
  pickerTitle: { color: Colors.textMuted, fontSize: 13 },
  disabled: { opacity: 0.45 },
});
