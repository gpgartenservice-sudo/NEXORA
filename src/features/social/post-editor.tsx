import { router, useLocalSearchParams } from 'expo-router';
import { Copy } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { ActionChip } from '@/components/ui/action-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDelete } from '@/components/ui/confirm-delete';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { Segmented } from '@/components/ui/segmented';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { TourTarget } from '@/features/tutorial/tour-target';

import { copyText } from './copy-text';
import {
  checkLimits,
  computePostStatus,
  engagementRate,
  FORMATS,
  mergeHashtags,
  PLATFORMS,
  postText,
  statusLabel,
  stepsFor,
  type Platform,
  type PostFormat,
  type StepKey,
} from './social-logic';
import { useSocial, type PostInput, type SocialPost } from './social-provider';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/social'));

const METRICS = [
  { key: 'views', label: 'Aufrufe' },
  { key: 'likes', label: 'Likes' },
  { key: 'comments', label: 'Kommentare' },
  { key: 'shares', label: 'Geteilt' },
  { key: 'saves', label: 'Gespeichert' },
  { key: 'followers', label: 'Neue Follower' },
] as const;
type MetricKey = (typeof METRICS)[number]['key'];

/** "12.000" / "12 000" -> 12000; leer = null; sonst 'invalid' */
function parseCount(s: string): number | null | 'invalid' {
  const t = s.replace(/[\s.]/g, '');
  if (!t) return null;
  return /^\d{1,10}$/.test(t) ? Number(t) : 'invalid';
}

/** Neuer Post (optional mit ?datum=JJJJ-MM-TT aus dem Wochenplan) */
export function PostNewScreen() {
  const { datum } = useLocalSearchParams<{ datum?: string }>();
  const planned = datum && /^\d{4}-\d{2}-\d{2}$/.test(datum) ? new Date(`${datum}T18:00:00`).toISOString() : null;
  return <PostEditor planned={planned} />;
}

/** Post bearbeiten (Route /social/[id]) */
export function PostEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { posts, loading } = useSocial();
  const post = posts.find((p) => p.id === id);
  if (!post) {
    return (
      <Screen maxWidth={760}>
        <PageHeader title="Post" back={{ label: 'Social Media', onPress: back }} />
        {!loading && <Notice>Diesen Post gibt es nicht (mehr).</Notice>}
      </Screen>
    );
  }
  return <PostEditor key={post.id} post={post} />;
}

function PostEditor({ post, planned = null }: { post?: SocialPost; planned?: string | null }) {
  const { createPost, updatePost, deletePost, sets, error: setupError } = useSocial();
  const [title, setTitle] = useState(post?.title ?? '');
  const [format, setFormat] = useState<PostFormat>(post?.format ?? 'video');
  const [platforms, setPlatforms] = useState<Platform[]>(post?.platforms ?? []);
  const [steps, setSteps] = useState<Record<StepKey, boolean>>({
    step_concept: post?.step_concept ?? false,
    step_produced: post?.step_produced ?? false,
    step_edited: post?.step_edited ?? false,
    step_caption: post?.step_caption ?? false,
  });
  const [script, setScript] = useState(post?.script ?? '');
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [hashtags, setHashtags] = useState(post?.hashtags ?? '');
  const [plannedFor, setPlannedFor] = useState<string | null>(post?.planned_for ?? planned);
  const [publishedAt, setPublishedAt] = useState<string | null>(post?.published_at ?? null);
  const [url, setUrl] = useState(post?.url ?? '');
  const [metrics, setMetrics] = useState<Record<MetricKey, string>>(
    () =>
      Object.fromEntries(
        METRICS.map((m) => [m.key, post?.[m.key] != null ? post[m.key]!.toLocaleString('de-DE') : '']),
      ) as Record<MetricKey, string>,
  );
  const [errors, setErrors] = useState<Partial<Record<'title' | MetricKey, string>>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const status = computePostStatus({ format, ...steps, published_at: publishedAt });
  const limits = checkLimits(platforms, caption, hashtags);
  const parsedMetrics = Object.fromEntries(METRICS.map((m) => [m.key, parseCount(metrics[m.key])])) as Record<
    MetricKey,
    number | null | 'invalid'
  >;
  const num = (v: number | null | 'invalid') => (typeof v === 'number' ? v : null);
  const rate = engagementRate({
    views: num(parsedMetrics.views),
    likes: num(parsedMetrics.likes),
    comments: num(parsedMetrics.comments),
    shares: num(parsedMetrics.shares),
    saves: num(parsedMetrics.saves),
  });

  const togglePlatform = (p: Platform) =>
    setPlatforms((list) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]));

  const copy = async () => {
    const ok = await copyText(postText(caption, hashtags));
    setCopied(ok);
    if (!ok) setFailure('Kopieren hat nicht geklappt.');
    else setTimeout(() => setCopied(false), 2000);
  };

  const save = async () => {
    const next: typeof errors = { title: title.trim() ? undefined : 'Worum geht es? Ein Stichwort reicht.' };
    for (const m of METRICS) if (parsedMetrics[m.key] === 'invalid') next[m.key] = 'Nur ganze Zahlen.';
    setErrors(next);
    setFailure(null);
    if (Object.values(next).some(Boolean)) return;
    setSaving(true);
    const input: PostInput = {
      title: title.trim(),
      format,
      platforms,
      ...steps,
      script: script.trim() || null,
      caption: caption.trim() || null,
      hashtags: hashtags.trim() ? mergeHashtags('', hashtags) : null,
      planned_for: plannedFor,
      published_at: publishedAt,
      url: url.trim() || null,
      ...(Object.fromEntries(METRICS.map((m) => [m.key, num(parsedMetrics[m.key])])) as Record<
        MetricKey,
        number | null
      >),
    };
    const { error } = post ? await updatePost(post.id, input) : await createPost(input);
    setSaving(false);
    if (error) return setFailure(error);
    back();
  };

  return (
    <Screen maxWidth={760}>
      <PageHeader
        title={post ? 'Post bearbeiten' : 'Neue Idee'}
        back={{ label: 'Social Media', onPress: back }}
        meta={
          <View style={styles.status}>
            <Text style={styles.statusText}>{statusLabel(status)}</Text>
          </View>
        }
      />
      {setupError === 'setup' && (
        <Notice tone="error">Das Datenbank-Skript für Social Media fehlt noch (siehe supabase/README.md).</Notice>
      )}

      <TourTarget id="guide.post">
        <Reveal delay={140}>
          <Card>
            <TextField
              label="Idee / Thema *"
              value={title}
              onChangeText={(v) => {
                setTitle(v);
                setErrors((e) => ({ ...e, title: undefined }));
              }}
              error={errors.title}
              placeholder="z. B. 3 Fehler, die ich als Gründerin gemacht habe"
              maxLength={200}
            />
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={FORMATS.map((f) => ({ value: f.key, label: f.label }))}
            />
            <Text style={styles.label}>Plattformen</Text>
            <View style={styles.chips}>
              {PLATFORMS.map((p) => {
                const active = platforms.includes(p.key);
                return (
                  <Pressable
                    key={p.key}
                    onPress={() => togglePlatform(p.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={p.label}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{p.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </Reveal>
      </TourTarget>

      <Reveal delay={200}>
        <Card>
          <Text style={styles.cardTitle}>Schritte</Text>
          <Text style={styles.hint}>Hak ab, was erledigt ist – der Status passt sich automatisch an.</Text>
          {stepsFor(format).map((s) => (
            <ToggleRow
              key={s.key}
              label={s.label}
              value={steps[s.key]}
              onChange={(v) => setSteps((st) => ({ ...st, [s.key]: v }))}
            />
          ))}
          <TextField
            label={format === 'video' ? 'Skript / Ablauf' : 'Notizen'}
            value={script}
            onChangeText={setScript}
            placeholder={format === 'video' ? 'Hook in den ersten 3 Sekunden, dann …' : 'Was soll rein?'}
            multiline
            style={styles.multilineLarge}
            maxLength={10000}
          />
        </Card>
      </Reveal>

      <Reveal delay={260}>
        <Card>
          <Text style={styles.cardTitle}>Caption & Hashtags</Text>
          <TextField
            label="Caption"
            value={caption}
            onChangeText={setCaption}
            placeholder="Der Text unter deinem Post"
            multiline
            style={styles.multilineLarge}
            maxLength={5000}
          />
          <TextField
            label="Hashtags"
            value={hashtags}
            onChangeText={setHashtags}
            placeholder="gründen startup motivation"
            autoCapitalize="none"
            hint="Das # ergänzt NEXORA automatisch."
          />
          {sets.length > 0 && (
            <View style={styles.setRow}>
              <Text style={styles.setLabel}>Set einfügen:</Text>
              {sets.map((s) => (
                <ActionChip
                  key={s.id}
                  label={`+ ${s.name}`}
                  accessibilityLabel={`Hashtag-Set ${s.name} einfügen`}
                  onPress={() => setHashtags((h) => mergeHashtags(h, s.tags))}
                />
              ))}
            </View>
          )}
          <Text style={[styles.counter, (limits.tooLong || limits.tooManyTags) && styles.counterBad]}>
            {limits.maxChars !== null
              ? `${limits.chars.toLocaleString('de-DE')} / ${limits.maxChars.toLocaleString('de-DE')} Zeichen (${limits.charsPlatform})`
              : `${limits.chars.toLocaleString('de-DE')} Zeichen`}
            {' · '}
            {limits.maxHashtags !== null
              ? `${limits.hashtags} / ${limits.maxHashtags} Hashtags`
              : `${limits.hashtags} Hashtags`}
          </Text>
          {(limits.tooLong || limits.tooManyTags) && (
            <Notice>
              {limits.tooLong
                ? `Zu lang für ${limits.charsPlatform} – kürze die Caption oder nimm weniger Hashtags.`
                : 'Zu viele Hashtags für Instagram (höchstens 30).'}
            </Notice>
          )}
          <View style={styles.copyRow}>
            <ActionChip
              icon={Copy}
              label={copied ? 'Kopiert ✓' : 'Caption + Hashtags kopieren'}
              onPress={copy}
              disabled={!caption.trim() && !hashtags.trim()}
            />
          </View>
        </Card>
      </Reveal>

      <Reveal delay={320}>
        <Card>
          <Text style={styles.cardTitle}>Planen & Veröffentlichen</Text>
          <DateField
            label="Geplant für"
            value={plannedFor}
            onChange={setPlannedFor}
            withTime
            hint="Erscheint dann im Wochenplan."
          />
          <ToggleRow
            label="Veröffentlicht"
            hint="Ab jetzt zählt der Post zu deinen Zahlen."
            value={!!publishedAt}
            onChange={(v) =>
              setPublishedAt(
                v ? (plannedFor && new Date(plannedFor) <= new Date() ? plannedFor : new Date().toISOString()) : null,
              )
            }
          />
          {!!publishedAt && (
            <>
              <DateField label="Veröffentlicht am" value={publishedAt} onChange={(v) => setPublishedAt(v)} withTime />
              <TextField
                label="Link zum Post"
                value={url}
                onChangeText={setUrl}
                placeholder="https://…"
                autoCapitalize="none"
                keyboardType="url"
                maxLength={500}
              />
              <Text style={styles.label}>Zahlen</Text>
              <View style={styles.metrics}>
                {METRICS.map((m) => (
                  <View key={m.key} style={styles.metric}>
                    <TextField
                      label={m.label}
                      value={metrics[m.key]}
                      onChangeText={(v) => {
                        setMetrics((x) => ({ ...x, [m.key]: v }));
                        setErrors((e) => ({ ...e, [m.key]: undefined }));
                      }}
                      error={errors[m.key]}
                      keyboardType="number-pad"
                      placeholder="0"
                    />
                  </View>
                ))}
              </View>
              {rate !== null && (
                <Text style={styles.hint}>Interaktionsrate: {rate.toLocaleString('de-DE')} % der Aufrufe</Text>
              )}
            </>
          )}
        </Card>
      </Reveal>

      {failure && <Notice tone="error">{failure}</Notice>}
      <Button label={post ? 'Änderungen speichern' : 'Idee speichern'} onPress={save} loading={saving} />
      {post && (
        <ConfirmDelete
          label="Post löschen"
          question={`„${post.title}“ wirklich löschen?`}
          onConfirm={async () => {
            const { error } = await deletePost(post.id);
            if (error) setFailure(error);
            else back();
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.4)',
    backgroundColor: Colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusText: { color: Colors.accent, fontSize: 12.5, fontWeight: '600' },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  hint: { color: Colors.textFaint, fontSize: 13, lineHeight: 18 },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12, paddingVertical: 7 },
  chipActive: { borderColor: 'rgba(47,227,154,0.5)', backgroundColor: Colors.accentSoft },
  chipText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '500' },
  chipTextActive: { color: Colors.text, fontWeight: '600' },
  multilineLarge: { minHeight: 110, paddingVertical: Spacing.md, textAlignVertical: 'top' },
  setRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  setLabel: { color: Colors.textMuted, fontSize: 13 },
  counter: { color: Colors.textFaint, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  counterBad: { color: Colors.danger },
  copyRow: { flexDirection: 'row' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
  metric: { flexGrow: 1, flexBasis: 150 },
});
