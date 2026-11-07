import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { ActionChip } from '@/components/ui/action-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing } from '@/constants/theme';

import { copyText } from './copy-text';
import { parseHashtags } from './social-logic';
import { useSocial, type HashtagSet } from './social-provider';

/** Hashtag-Sets: Gruppen von Hashtags, die man immer wieder nutzt. */
export function HashtagSetsView() {
  const { sets } = useSocial();
  const [editing, setEditing] = useState<string | 'new' | null>(sets.length ? null : 'new');
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (s: HashtagSet) => {
    if (await copyText(parseHashtags(s.tags).join(' '))) {
      setCopied(s.id);
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 2000);
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.intro}>
        Leg dir Gruppen von Hashtags an, die du oft brauchst – im Post fügst du sie mit einem Klick ein.
      </Text>
      {sets.map((s) =>
        editing === s.id ? (
          <SetForm key={s.id} set={s} onDone={() => setEditing(null)} />
        ) : (
          <Card key={s.id}>
            <View style={styles.head}>
              <Text style={styles.name}>{s.name}</Text>
              <Text style={styles.count}>{parseHashtags(s.tags).length} Hashtags</Text>
            </View>
            <Text style={styles.tags}>{parseHashtags(s.tags).join(' ')}</Text>
            <View style={styles.actions}>
              <ActionChip
                label={copied === s.id ? 'Kopiert ✓' : 'Kopieren'}
                onPress={() => copy(s)}
                accessibilityLabel={`${s.name} kopieren`}
              />
              <ActionChip
                label="Bearbeiten"
                onPress={() => setEditing(s.id)}
                accessibilityLabel={`${s.name} bearbeiten`}
              />
            </View>
          </Card>
        ),
      )}
      {editing === 'new' ? (
        <SetForm onDone={() => setEditing(null)} />
      ) : (
        <Button label="+ Hashtag-Set" variant="secondary" onPress={() => setEditing('new')} />
      )}
    </View>
  );
}

function SetForm({ set, onDone }: { set?: HashtagSet; onDone: () => void }) {
  const { saveSet, deleteSet } = useSocial();
  const [name, setName] = useState(set?.name ?? '');
  const [tags, setTags] = useState(set?.tags ?? '');
  const [errors, setErrors] = useState<{ name?: string; tags?: string }>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parsed = parseHashtags(tags);

  const save = async () => {
    const next = {
      name: name.trim() ? undefined : 'Gib dem Set einen Namen.',
      tags: parsed.length ? undefined : 'Mindestens ein Hashtag.',
    };
    setErrors(next);
    if (next.name || next.tags) return;
    setBusy(true);
    const { error } = await saveSet({ id: set?.id, name: name.trim(), tags: parsed.join(' ') });
    setBusy(false);
    if (error) setFailure(error);
    else onDone();
  };

  return (
    <Card>
      <Text style={styles.name}>{set ? 'Hashtag-Set bearbeiten' : 'Neues Hashtag-Set'}</Text>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        error={errors.name}
        placeholder="z. B. Gründen, Motivation, Region"
        maxLength={80}
      />
      <TextField
        label="Hashtags"
        value={tags}
        onChangeText={setTags}
        error={errors.tags}
        hint={
          parsed.length
            ? `${parsed.length} Hashtags · das # ergänzt Lunaxora automatisch`
            : 'Mit Leerzeichen oder Komma trennen'
        }
        placeholder="gründen startup selbstständig"
        multiline
        style={styles.multiline}
        autoCapitalize="none"
      />
      {failure && <Notice tone="error">{failure}</Notice>}
      <View style={styles.actions}>
        <Button label="Abbrechen" variant="secondary" onPress={onDone} style={styles.flex} />
        <Button label="Speichern" onPress={save} loading={busy} style={styles.flex} />
      </View>
      {set && (
        <Text
          style={styles.delete}
          accessibilityRole="button"
          onPress={async () => {
            const { error } = await deleteSet(set.id);
            if (error) setFailure(error);
            else onDone();
          }}>
          Set löschen
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.lg },
  intro: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  name: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  count: { color: Colors.textFaint, fontSize: 12.5 },
  tags: { color: Colors.textMuted, fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  flex: { flex: 1, minWidth: 140 },
  multiline: { minHeight: 80, paddingVertical: Spacing.md, textAlignVertical: 'top' },
  delete: { color: Colors.danger, fontSize: 13.5, fontWeight: '600', alignSelf: 'flex-start' },
});
