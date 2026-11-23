import { Image } from 'expo-image';
import {
  AlertTriangle,
  Banknote,
  Camera,
  Download,
  Eye,
  FileBadge,
  FileImage,
  FileKey,
  FileSpreadsheet,
  FileText,
  FolderLock,
  Landmark,
  Lock,
  Paperclip,
  Pencil,
  ScrollText,
  ShieldCheck,
  Store,
  type LucideIcon,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

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
import { Colors, Radius, Spacing, accentAlpha } from '@/constants/theme';
import { todayIso } from '@/features/documents/document-logic';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';

import { saveVaultFile, useVault, type PreparedVaultFile } from './vault-api';
import { pickVaultFile, prepareVaultFile, vaultSupported, viewVaultFile } from './vault-file';
import {
  CATEGORY_LABEL,
  ELSTER_HINT,
  MAX_VAULT_FILES,
  VAULT_CATEGORIES,
  canView,
  categoryCounts,
  dueFiles,
  filterFiles,
  formatSize,
  germanDay,
  groupFiles,
  guessCategory,
  kindLabel,
  secretWarning,
  suggestTitle,
  validity,
  validityLabel,
  vaultErrorText,
  vaultKind,
  type VaultCategory,
  type VaultFile,
  type VaultMeta,
} from './vault-logic';

// Handy-App oder Gerät mit Touchscreen: Kamera-Knopf zeigen
const app = Platform.OS !== 'web';
const touch = app || (typeof navigator !== 'undefined' && (navigator.maxTouchPoints ?? 0) > 0);

const CATEGORY_ICON: Record<VaultCategory, LucideIcon> = {
  gewerbe: Store,
  finanzamt: Landmark,
  versicherung: ShieldCheck,
  vertrag: ScrollText,
  bank: Banknote,
  nachweis: FileBadge,
  sonstiges: FileText,
};

/** Symbol je Dateiart (Foto, ELSTER-Zertifikat, Excel, sonst Dokument) */
function FileIcon({ mime, size, color }: { mime: string; size: number; color: string }) {
  const props = { size, color, strokeWidth: 1.8 };
  if (mime.startsWith('image/')) return <FileImage {...props} />;
  if (mime === 'application/x-pkcs12') return <FileKey {...props} />;
  if (mime.includes('spreadsheet')) return <FileSpreadsheet {...props} />;
  return <FileText {...props} />;
}

type Message = { tone: 'success' | 'error'; text: string } | null;
type NewDraft = { file: PreparedVaultFile; meta: VaultMeta };

const emptyMeta = (category: VaultCategory): VaultMeta => ({ title: '', category, note: null, valid_until: null });

/**
 * Dokumente der Firma: Gewerbeanmeldung, ELSTER-Zertifikat, Versicherungen, Verträge …
 * Nur für Inhaber und Mitgründer (die Datenbank lässt Mitarbeiter nicht heran).
 */
export function VaultScreen({ companyId }: { companyId: string }) {
  const vault = useVault(companyId);
  const { files, loading } = vault;
  const [category, setCategory] = useState<VaultCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<NewDraft | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const today = todayIso();

  const counts = useMemo(() => categoryCounts(files), [files]);
  const due = useMemo(() => dueFiles(files, today), [files, today]);
  const shown = useMemo(() => groupFiles(filterFiles(files, category, query)), [files, category, query]);
  const full = files.length >= MAX_VAULT_FILES;

  /** Datei wählen -> Formular mit Vorschlägen für Name und Bereich */
  const pick = async (camera: boolean, preset?: VaultCategory) => {
    setMessage(null);
    const picked = await pickVaultFile(camera);
    if (!picked) return;
    setPreparing(true);
    try {
      const file = await prepareVaultFile(picked);
      const guessed = preset ?? (category !== 'all' ? category : guessCategory(file.name, vaultKind(file.name, file.mime)));
      setEditing(null);
      setDraft((d) => ({
        file,
        // beim Tauschen der Datei bleibt, was schon eingetragen ist
        meta: d ? { ...d.meta, title: d.meta.title || suggestTitle(file.name) } : { ...emptyMeta(guessed), title: suggestTitle(file.name) },
      }));
    } catch (e) {
      setMessage({ tone: 'error', text: vaultErrorText(e) });
    } finally {
      setPreparing(false);
    }
  };

  const saveNew = async (meta: VaultMeta) => {
    if (!draft) return 'Keine Datei gewählt.';
    const r = await vault.add(draft.file, meta);
    if (r.error) return r.error;
    playSound('check');
    setDraft(null);
    setMessage({ tone: 'success', text: `„${r.data?.title}“ ist sicher abgelegt.` });
    return null;
  };

  if (!vaultSupported) {
    return (
      <Screen maxWidth={880}>
        <PageHeader title="Dokumente" />
        <Notice>Dokumente ablegen geht hier gerade nicht.</Notice>
      </Screen>
    );
  }

  return (
    <Screen maxWidth={880}>
      <PageHeader
        title="Dokumente"
        subtitle="Gewerbeanmeldung, ELSTER-Zertifikat, Versicherungen und Verträge – sicher an einem Ort."
        action={
          !draft && files.length > 0 ? (
            <View style={styles.headerActions}>
              {touch && <ActionChip icon={Camera} label="Fotografieren" onPress={() => void pick(true)} disabled={full} />}
              <Button label="Dokument ablegen" onPress={() => void pick(false)} loading={preparing} disabled={full} />
            </View>
          ) : undefined
        }
      />

      {!!message && <Notice tone={message.tone}>{message.text}</Notice>}
      {!!vault.error && <Notice tone="error">{vault.error}</Notice>}
      {full && !draft && (
        <Notice>Ihr habt {MAX_VAULT_FILES} Dokumente abgelegt – mehr geht nicht. Lösch alte, um Platz zu machen.</Notice>
      )}

      {draft && (
        <Reveal>
          <FileForm
            title="Neues Dokument"
            initial={draft.meta}
            file={draft.file}
            onReplace={() => void pick(false)}
            replacing={preparing}
            onSave={saveNew}
            onCancel={() => setDraft(null)}
          />
        </Reveal>
      )}

      {loading ? (
        <ActivityIndicator color={Colors.accent} style={styles.loading} />
      ) : files.length === 0 ? (
        !draft && !vault.error && <EmptyState onPick={pick} busy={preparing} />
      ) : (
        <>
          {due.length > 0 && (
            <Reveal delay={100}>
              <Card>
                <View style={styles.dueHead}>
                  <AlertTriangle size={17} color="#F5B94A" strokeWidth={2} />
                  <Text style={styles.cardTitle}>{due.length === 1 ? 'Ein Dokument läuft ab' : `${due.length} Dokumente laufen ab`}</Text>
                </View>
                {due.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() => {
                      setCategory('all');
                      setQuery('');
                      setDraft(null);
                      setEditing(f.id);
                    }}
                    style={styles.dueRow}
                    accessibilityRole="button">
                    <Text style={styles.dueTitle} numberOfLines={2}>
                      {f.title}
                    </Text>
                    <ValidityPill validUntil={f.valid_until} today={today} />
                  </Pressable>
                ))}
                <Text style={styles.hint}>Verlängern, neue Fassung ablegen und das alte Dokument löschen – oder das Datum anpassen.</Text>
              </Card>
            </Reveal>
          )}

          <View style={styles.filters}>
            <ActionChip label={`Alle · ${files.length}`} active={category === 'all'} onPress={() => setCategory('all')} />
            {VAULT_CATEGORIES.filter((c) => counts[c.key] > 0).map((c) => (
              <ActionChip
                key={c.key}
                label={`${c.label} · ${counts[c.key]}`}
                active={category === c.key}
                onPress={() => setCategory(category === c.key ? 'all' : c.key)}
              />
            ))}
          </View>
          {files.length > 8 && (
            <TextField label="Suchen" value={query} onChangeText={setQuery} placeholder="Name, Notiz oder Bereich" autoCorrect={false} />
          )}

          {shown.length === 0 && <Text style={styles.empty}>Nichts gefunden.</Text>}
          {shown.map((g) => (
            <View key={g.category} style={styles.group}>
              <Text style={styles.groupTitle}>{g.label.toUpperCase()}</Text>
              {g.category === 'finanzamt' && g.files.every((f) => f.mime !== 'application/x-pkcs12') && (
                <Text style={styles.hint}>Tipp: Auch dein ELSTER-Zertifikat (.pfx) kannst du hier ablegen.</Text>
              )}
              <Card style={styles.list}>
                {g.files.map((f, i) =>
                  editing === f.id ? (
                    <FileForm
                      key={f.id}
                      title="Dokument bearbeiten"
                      initial={{ title: f.title, category: f.category, note: f.note, valid_until: f.valid_until }}
                      saved={f}
                      onSave={async (meta) => {
                        const r = await vault.update(f.id, meta);
                        if (r.error) return r.error;
                        playSound('check');
                        setEditing(null);
                        return null;
                      }}
                      onDelete={async () => {
                        const r = await vault.remove(f);
                        if (r.error) return setMessage({ tone: 'error', text: r.error });
                        setEditing(null);
                        setMessage({ tone: 'success', text: `„${f.title}“ ist gelöscht.` });
                      }}
                      onCancel={() => setEditing(null)}
                      embedded
                    />
                  ) : (
                    <FileRow
                      key={f.id}
                      file={f}
                      today={today}
                      first={i === 0}
                      onEdit={() => {
                        setDraft(null);
                        setEditing(f.id);
                      }}
                      onError={(text) => setMessage({ tone: 'error', text })}
                    />
                  ),
                )}
              </Card>
            </View>
          ))}
        </>
      )}

      <View style={styles.footer}>
        <Lock size={13} color={Colors.textFaint} strokeWidth={2} />
        <Text style={styles.footerText}>
          Nur Inhaber und Mitgründer sehen diese Dokumente – Mitarbeiter nicht. Die Dateien liegen in einem privaten Speicher
          (Server in Frankfurt am Main) und sind nicht öffentlich abrufbar. Passwörter und PINs gehören nicht hierher.
        </Text>
      </View>
    </Screen>
  );
}

/** Noch nichts abgelegt: was hier reingehört, mit einem Klick auf den Bereich direkt hochladen */
function EmptyState({ onPick, busy }: { onPick: (camera: boolean, preset?: VaultCategory) => void; busy: boolean }) {
  return (
    <>
      <Reveal delay={100}>
        <Card>
          <View style={styles.emptyHead}>
            <View style={styles.bigIcon}>
              <FolderLock size={24} color={Colors.accent} strokeWidth={1.8} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>Alle wichtigen Unterlagen griffbereit</Text>
              <Text style={styles.hint}>
                Wenn das Finanzamt, die Bank oder ein Kunde etwas sehen will, hast du es in Sekunden – am Mac und am Handy.
              </Text>
            </View>
          </View>
          <View style={styles.emptyActions}>
            <Button label="Dokument ablegen" onPress={() => onPick(false)} loading={busy} />
            {touch && <ActionChip icon={Camera} label="Brief fotografieren" onPress={() => onPick(true)} />}
          </View>
        </Card>
      </Reveal>
      <Reveal delay={180}>
        <View style={styles.group}>
          <Text style={styles.groupTitle}>WAS GEHÖRT HIER REIN?</Text>
          <Card style={styles.list}>
            {VAULT_CATEGORIES.filter((c) => c.key !== 'sonstiges').map((c, i) => (
              <CategoryRow key={c.key} category={c.key} hint={c.hint} first={i === 0} onPress={() => onPick(false, c.key)} />
            ))}
          </Card>
        </View>
      </Reveal>
      <Reveal delay={240}>
        <ElsterHint />
      </Reveal>
    </>
  );
}

function CategoryRow({ category, hint, first, onPress }: { category: VaultCategory; hint: string; first: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  const Icon = CATEGORY_ICON[category];
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      style={[styles.row, !first && styles.divider, hovered && styles.hover]}
      accessibilityRole="button"
      accessibilityLabel={`${CATEGORY_LABEL[category]} ablegen`}>
      <View style={styles.icon}>
        <Icon size={18} color={Colors.text} strokeWidth={1.8} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle}>{CATEGORY_LABEL[category]}</Text>
        <Text style={styles.rowMeta}>{hint}</Text>
      </View>
      <Paperclip size={16} color={Colors.textFaint} strokeWidth={2} />
    </Pressable>
  );
}

function ElsterHint() {
  return (
    <View style={styles.elster}>
      <FileKey size={18} color={Colors.accent} strokeWidth={1.9} />
      <Text style={styles.elsterText}>{ELSTER_HINT}</Text>
    </View>
  );
}

const TONES = {
  expired: { bg: 'rgba(255,107,107,0.08)', fg: Colors.danger, border: 'rgba(255,107,107,0.35)' },
  soon: { bg: 'rgba(245,185,74,0.10)', fg: '#F5B94A', border: 'rgba(245,185,74,0.35)' },
  ok: { bg: Colors.accentSoft, fg: Colors.accent, border: accentAlpha(0.35) },
} as const;

function ValidityPill({ validUntil, today }: { validUntil: string | null; today: string }) {
  const v = validity(validUntil, today);
  const label = validityLabel(validUntil, today);
  if (!v || !label) return null;
  const t = TONES[v.state];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function FileRow({
  file,
  today,
  first,
  onEdit,
  onError,
}: {
  file: VaultFile;
  today: string;
  first: boolean;
  onEdit: () => void;
  onError: (text: string) => void;
}) {
  const [busy, setBusy] = useState<'view' | 'save' | null>(null);
  // schmal (Handy): ohne Symbol, damit Name und Knöpfe Platz haben
  const narrow = useWindowDimensions().width < 480;
  const run = async (what: 'view' | 'save') => {
    setBusy(what);
    const error = what === 'view' ? await viewVaultFile(file.file_path) : await saveVaultFile(file);
    setBusy(null);
    if (error) onError(error);
  };
  return (
    <View style={[styles.row, styles.fileRow, !first && styles.divider]} testID="vault-file">
      {!narrow && (
        <View style={styles.icon}>
          <FileIcon mime={file.mime} size={18} color={file.mime === 'application/x-pkcs12' ? Colors.accent : Colors.text} />
        </View>
      )}
      <View style={styles.fileTexts}>
        <View style={styles.titleRow}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {file.title}
          </Text>
          <ValidityPill validUntil={file.valid_until} today={today} />
        </View>
        <Text style={styles.rowMeta} numberOfLines={2}>
          {kindLabel(file.mime)} · {formatSize(file.size_bytes)} · abgelegt am {germanDay(todayIso(new Date(file.created_at)))}
        </Text>
        {!!file.note && (
          <Text style={styles.note} numberOfLines={3}>
            {file.note}
          </Text>
        )}
        <View style={styles.chips}>
          {canView(file.mime) && (
            <ActionChip icon={Eye} label={busy === 'view' ? 'Öffnet …' : 'Ansehen'} onPress={() => void run('view')} disabled={!!busy} />
          )}
          <ActionChip
            icon={Download}
            label={busy === 'save' ? 'Lädt …' : app ? 'Teilen / Sichern' : 'Herunterladen'}
            onPress={() => void run('save')}
            disabled={!!busy}
          />
          <ActionChip icon={Pencil} label="Bearbeiten" onPress={onEdit} accessibilityLabel={`${file.title} bearbeiten`} />
        </View>
      </View>
    </View>
  );
}

/** Formular: neues Dokument (mit Datei) oder bearbeiten (mit Löschen) */
function FileForm({
  title,
  initial,
  file,
  saved,
  onReplace,
  replacing,
  onSave,
  onDelete,
  onCancel,
  embedded,
}: {
  title: string;
  initial: VaultMeta;
  file?: PreparedVaultFile;
  saved?: VaultFile;
  onReplace?: () => void;
  replacing?: boolean;
  /** null = gespeichert, sonst Fehlertext */
  onSave: (meta: VaultMeta) => Promise<string | null>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  embedded?: boolean;
}) {
  const [meta, setMeta] = useState<VaultMeta>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<VaultMeta>) => setMeta((m) => ({ ...m, ...patch }));
  const warning = secretWarning(meta.note) ?? secretWarning(meta.title);

  const save = async () => {
    setBusy(true);
    setError(null);
    const e = await onSave(meta);
    setBusy(false);
    if (e) setError(e);
  };

  const body = (
    <View style={styles.form}>
      <Text style={styles.cardTitle}>{title}</Text>
      {file && (
        <View style={styles.fileBox}>
          {file.previewUrl ? (
            <Image source={{ uri: file.previewUrl }} style={styles.thumb} contentFit="cover" accessibilityLabel="Vorschau" />
          ) : (
            <View style={[styles.thumb, styles.thumbIcon]}>
              <FileIcon mime={file.mime} size={24} color={Colors.textMuted} />
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {file.name}
            </Text>
            <Text style={styles.rowMeta}>
              {kindLabel(file.mime)} · {formatSize(file.size)}
            </Text>
            {onReplace && (
              <View style={styles.chips}>
                <ActionChip icon={Paperclip} label={replacing ? 'Lädt …' : 'Andere Datei'} onPress={onReplace} disabled={replacing} />
              </View>
            )}
          </View>
        </View>
      )}

      <TextField
        label="Name"
        value={meta.title}
        onChangeText={(t) => set({ title: t })}
        placeholder="z. B. Gewerbeanmeldung 2026"
        maxLength={120}
      />

      <View style={styles.field}>
        <Text style={styles.label}>Bereich</Text>
        <View style={styles.chips}>
          {VAULT_CATEGORIES.map((c) => (
            <ActionChip key={c.key} label={c.label} active={meta.category === c.key} onPress={() => set({ category: c.key })} />
          ))}
        </View>
        {meta.category === 'finanzamt' && <ElsterHint />}
      </View>

      <DateField
        label="Gültig bis (optional)"
        value={meta.valid_until}
        onChange={(v) => set({ valid_until: v })}
        hint="Für alles, was abläuft: ELSTER-Zertifikat, Versicherung, Genehmigung, Ausweis."
      />

      <TextField
        label="Notiz (optional)"
        value={meta.note ?? ''}
        onChangeText={(t) => set({ note: t })}
        placeholder="z. B. Aktenzeichen, Versicherungsnummer, wo das Original liegt"
        multiline
        maxLength={1000}
      />
      {!!warning && (
        <View style={styles.warn}>
          <AlertTriangle size={15} color="#F5B94A" strokeWidth={2} />
          <Text style={styles.warnText}>{warning}</Text>
        </View>
      )}

      {!!error && <Notice tone="error">{error}</Notice>}
      <View style={styles.buttons}>
        <Button label="Speichern" onPress={() => void save()} loading={busy} style={styles.flex} />
        <Button label="Abbrechen" variant="secondary" onPress={onCancel} disabled={busy} style={styles.flex} />
      </View>
      {onDelete && saved && (
        <ConfirmDelete
          label="Dokument löschen"
          question={`„${saved.title}“ wirklich löschen? Die Datei ist danach weg.`}
          onConfirm={onDelete}
        />
      )}
    </View>
  );

  return embedded ? <View style={styles.embedded}>{body}</View> : <Card>{body}</Card>;
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  loading: { marginVertical: Spacing.xxl },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  hint: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  empty: { color: Colors.textMuted, fontSize: 14, textAlign: 'center' },
  emptyHead: { flexDirection: 'row', gap: Spacing.md, alignItems: 'flex-start' },
  emptyActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  bigIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: accentAlpha(0.3),
    alignItems: 'center',
    justifyContent: 'center',
  },
  dueHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    columnGap: Spacing.md,
    rowGap: 4,
    paddingVertical: 4,
  },
  dueTitle: { color: Colors.text, fontSize: 14.5, fontWeight: '600', maxWidth: '100%' },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  group: { gap: Spacing.sm },
  groupTitle: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginLeft: Spacing.xs },
  list: { paddingVertical: Spacing.xs, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 12 },
  fileRow: { alignItems: 'flex-start' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  hover: { backgroundColor: 'rgba(255,255,255,0.045)', marginHorizontal: -Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: 12 },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileTexts: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  rowTitle: { color: Colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  rowMeta: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  note: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 2 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, maxWidth: '100%' },
  pillText: { fontSize: 12, fontWeight: '700' },
  elster: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: accentAlpha(0.3),
    backgroundColor: accentAlpha(0.05),
  },
  elsterText: { flex: 1, color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  form: { gap: Spacing.lg },
  embedded: { paddingVertical: Spacing.md },
  field: { gap: Spacing.sm },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '500', letterSpacing: 0.2 },
  fileBox: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  thumb: { width: 64, height: 84, borderRadius: Radius.md, backgroundColor: Colors.surfaceRaised },
  thumbIcon: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  warn: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  warnText: { flex: 1, color: '#F5B94A', fontSize: 13.5, lineHeight: 19 },
  buttons: { flexDirection: 'row', gap: Spacing.md },
  footer: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start', paddingHorizontal: Spacing.xs },
  footerText: { flex: 1, color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
});
