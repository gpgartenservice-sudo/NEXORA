import { router } from 'expo-router';
import { Check, Plus, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ProBadge } from '@/components/ui/pro-badge';
import { Segmented } from '@/components/ui/segmented';
import { TextLink } from '@/components/ui/text-link';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { LunaHatArt } from '@/features/assistant/luna-hat';
import { LUNA_COLORS, LUNA_HATS, type LunaHat, type LunaLook } from '@/features/assistant/luna-look';
import { NexyAvatar } from '@/features/assistant/nexy-avatar';
import { usePlan, useProGate } from '@/features/plan/plan-provider';
import { useHover } from '@/hooks/use-hover';
import { useProfile } from '@/providers/profile-provider';

import { DesignProvider } from './backgrounds';
import { IconGlyph } from './sprites';
import {
  DEFAULT_DESIGN,
  designActive,
  designToJson,
  DIRECTIONS,
  directionVector,
  GRADIENT_PRESETS,
  ICON_OPTIONS,
  normalizeHex,
  readDesign,
  sameDesign,
  strengthOpacity,
  SWATCHES,
  type BaseMode,
  type Density,
  type DesignSettings,
  type GradientDirection,
  type IconKey,
  type Strength,
} from './design-logic';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));

const BASE_OPTIONS: { value: BaseMode; label: string }[] = [
  { value: 'classic', label: 'Klassisch' },
  { value: 'color', label: 'Farbe' },
  { value: 'gradient', label: 'Farbverlauf' },
];
const STRENGTH_OPTIONS: { value: Strength; label: string }[] = [
  { value: 'soft', label: 'Dezent' },
  { value: 'medium', label: 'Mittel' },
  { value: 'strong', label: 'Kräftig' },
];
const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: 'few', label: 'Wenige' },
  { value: 'normal', label: 'Normal' },
  { value: 'many', label: 'Viele' },
];

/**
 * Profil → Design: Lunas Farbe und Hut (alle Abos), dazu Hintergrund – Farbe oder Farbverlauf –
 * und Symbole (Pro/Business). Wirkt sofort, speichert von selbst.
 */
export function DesignScreen() {
  const { profile } = useProfile();
  if (!profile) {
    return (
      <Screen maxWidth={760}>
        <PageHeader title="Design" back={{ label: 'Profil', onPress: back }} />
      </Screen>
    );
  }
  return <DesignEditor key={profile.id} initial={readDesign(profile.design)} />;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function DesignEditor({ initial }: { initial: DesignSettings }) {
  const { save } = useProfile();
  const { pro } = usePlan();
  const gate = useProGate();
  const [draft, setDraft] = useState<DesignSettings>(initial);
  const [saved, setSaved] = useState<DesignSettings>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  // welche Farbe des Verlaufs gerade geändert wird
  const [slot, setSlot] = useState(0);
  const [hex, setHex] = useState('');
  const [hexError, setHexError] = useState<string | undefined>();

  /** Änderung übernehmen – alles außer „Klassisch ohne Symbole“ gibt es mit Pro */
  const update = (patch: Partial<DesignSettings>) => {
    const next = { ...draft, ...patch };
    if (!pro && designActive(next)) {
      gate('design');
      return;
    }
    setDraft(next);
  };
  /** Luna gibt es für alle – auch wenn ein früherer Pro-Hintergrund noch gespeichert ist */
  const updateLuna = (patch: Partial<LunaLook>) => setDraft((d) => ({ ...d, luna: { ...d.luna, ...patch } }));

  // von selbst speichern, kurz nachdem sich nichts mehr ändert
  useEffect(() => {
    if (sameDesign(draft, saved)) return;
    const t = setTimeout(() => {
      setState('saving');
      void save({ design: designToJson(draft) }).then((r) => {
        if (r.error) {
          setState('error');
          setError(r.error);
          return;
        }
        setError(null);
        setSaved(draft);
        setState('saved');
      });
    }, 600);
    return () => clearTimeout(t);
  }, [draft, saved, save]);

  const gradient = draft.base === 'gradient';
  const target = gradient ? (draft.gradient[slot] ?? draft.gradient[0]) : draft.color;

  const setColor = (value: string) => {
    if (gradient) {
      const colors = [...draft.gradient];
      colors[Math.min(slot, colors.length - 1)] = value;
      update({ gradient: colors });
    } else {
      update({ color: value });
    }
  };

  const chooseSwatch = (value: string) => {
    setHex('');
    setHexError(undefined);
    setColor(value);
  };

  const typeHex = (text: string) => {
    setHex(text);
    const clean = text.trim();
    if (!clean) return setHexError(undefined);
    const value = normalizeHex(clean);
    if (value && clean.replace('#', '').length === 6) {
      setHexError(undefined);
      setColor(value);
    } else if (clean.replace('#', '').length >= 6) {
      setHexError('Bitte eine Farbe wie #FF8800 eingeben.');
    } else {
      setHexError(undefined);
    }
  };

  const addSlot = () => {
    if (draft.gradient.length >= 3) return;
    update({ gradient: [...draft.gradient, draft.gradient[draft.gradient.length - 1]] });
    setSlot(draft.gradient.length);
  };
  const removeSlot = (i: number) => {
    if (draft.gradient.length <= 2) return;
    update({ gradient: draft.gradient.filter((_, k) => k !== i) });
    setSlot(0);
  };

  const shown = pro ? draft : { ...DEFAULT_DESIGN, luna: draft.luna };

  return (
    <DesignProvider design={shown}>
      <Screen maxWidth={760}>
        <PageHeader
          title="Design"
          subtitle="Lunas Farbe und Hut, dazu Hintergrund und Motive wie Geldscheine oder Blitze – wirkt sofort."
          back={{ label: 'Profil', onPress: back }}
        />
        {error && <Notice tone="error">{error}</Notice>}

        <Reveal delay={40}>
          <LunaCard look={draft.luna} onChange={updateLuna} />
        </Reveal>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Hintergrund & Symbole</Text>
          <ProBadge />
        </View>
        {!pro && <Notice>Hintergrund und Symbole gibt es mit Lunaxora Pro und Business. Luna kannst du mit jedem Abo anpassen.</Notice>}

        <Reveal delay={80}>
          <Preview design={shown} />
        </Reveal>

        <Reveal delay={140}>
          <Card>
            <Text style={styles.cardTitle}>Hintergrund</Text>
            <Segmented value={draft.base} options={BASE_OPTIONS} onChange={(base) => update({ base })} />

            {draft.base !== 'classic' && (
              <>
                {gradient && (
                  <>
                    <Text style={styles.label}>VORLAGEN</Text>
                    <View style={styles.wrap}>
                      {GRADIENT_PRESETS.map((p) => (
                        <PresetChip
                          key={p.key}
                          id={p.key}
                          title={p.title}
                          colors={p.colors}
                          active={draft.gradient.join() === p.colors.join()}
                          onPress={() => {
                            update({ gradient: [...p.colors] });
                            setSlot(0);
                          }}
                        />
                      ))}
                    </View>
                    <Text style={styles.label}>FARBEN DES VERLAUFS</Text>
                    <View style={styles.slots}>
                      {draft.gradient.map((c, i) => (
                        <Slot
                          key={i}
                          color={c}
                          index={i}
                          active={slot === i}
                          removable={draft.gradient.length > 2}
                          onPress={() => setSlot(i)}
                          onRemove={() => removeSlot(i)}
                        />
                      ))}
                      {draft.gradient.length < 3 && (
                        <Pressable
                          onPress={addSlot}
                          accessibilityRole="button"
                          accessibilityLabel="Dritte Farbe hinzufügen"
                          style={[styles.slot, styles.addSlot]}>
                          <Plus size={20} color={Colors.textMuted} />
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.hint}>Tippe eine Farbe des Verlaufs an und wähle darunter die neue Farbe.</Text>
                  </>
                )}

                {!gradient && <Text style={styles.label}>FARBE</Text>}
                <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Farbe">
                  {SWATCHES.map((s) => (
                    <Swatch key={s.hex} hex={s.hex} name={s.name} active={target === s.hex} onPress={() => chooseSwatch(s.hex)} />
                  ))}
                </View>
                <View style={styles.hexRow}>
                  <View style={[styles.hexPreview, { backgroundColor: target }]} />
                  <View style={styles.flex}>
                    <TextField
                      label="Eigene Farbe (Hex)"
                      value={hex}
                      onChangeText={typeHex}
                      placeholder={target}
                      autoCapitalize="characters"
                      autoCorrect={false}
                      maxLength={7}
                      error={hexError}
                    />
                  </View>
                </View>

                {gradient && (
                  <>
                    <Segmented
                      label="Richtung"
                      value={draft.direction}
                      options={DIRECTIONS.map((d) => ({ value: d.value, label: d.label }))}
                      onChange={(direction: GradientDirection) => update({ direction })}
                    />
                    <ToggleRow
                      label="Bewegter Verlauf"
                      hint="Farben wandern als weiche Lichter über den Bildschirm."
                      value={draft.moving}
                      onChange={(moving) => update({ moving })}
                    />
                  </>
                )}

                <Segmented label="Stärke" value={draft.strength} options={STRENGTH_OPTIONS} onChange={(strength) => update({ strength })} />
              </>
            )}
          </Card>
        </Reveal>

        <Reveal delay={200}>
          <Card>
            <Text style={styles.cardTitle}>Symbole</Text>
            <Text style={styles.hint}>Bewegte Symbole über dem Hintergrund – passt zu jeder Farbe.</Text>
            <View style={styles.grid}>
              {ICON_OPTIONS.map((o) => (
                <IconTile
                  key={o.key}
                  keyName={o.key}
                  title={o.title}
                  text={o.text}
                  active={draft.icons === o.key}
                  onPress={() => update({ icons: o.key })}
                />
              ))}
            </View>
            {draft.icons !== 'none' && (
              <Segmented label="Menge" value={draft.density} options={DENSITY_OPTIONS} onChange={(density) => update({ density })} />
            )}
          </Card>
        </Reveal>

        <Card>
          <Text style={styles.status}>
            {state === 'saving'
              ? 'Wird gespeichert …'
              : state === 'saved'
                ? 'Gespeichert ✓'
                : state === 'error'
                  ? 'Nicht gespeichert – versuch es noch einmal.'
                  : 'Änderungen speichern sich von selbst.'}
          </Text>
          <Text style={styles.hint}>
            Mit „Bewegung reduzieren“ auf deinem Gerät bleibt alles ruhig.
          </Text>
          {designActive(draft) && (
            <TextLink
              label="Auf Klassisch zurücksetzen"
              onPress={() => {
                setSlot(0);
                update({ ...DEFAULT_DESIGN, gradient: [...DEFAULT_DESIGN.gradient], luna: draft.luna });
              }}
            />
          )}
        </Card>
      </Screen>
    </DesignProvider>
  );
}

/** Luna anpassen: große Vorschau, Farben und Hüte (für alle Abos) */
function LunaCard({ look, onChange }: { look: LunaLook; onChange: (patch: Partial<LunaLook>) => void }) {
  const colorName = LUNA_COLORS.find((c) => c.hex === look.color)?.name ?? '';
  const hatName = LUNA_HATS.find((h) => h.key === look.hat)?.title ?? '';
  return (
    <Card>
      <Text style={styles.cardTitle}>Luna</Text>
      <Text style={styles.hint}>Gib deiner Assistentin eine Farbe und einen Hut – für alle Abos.</Text>
      <View style={styles.lunaRow}>
        <View style={styles.lunaStage} accessibilityLabel={`Luna in ${colorName}${look.hat !== 'none' ? ` mit ${hatName}` : ''}`}>
          <NexyAvatar size={96} interactive look={look} />
        </View>
        <View style={styles.lunaControls}>
          <Text style={styles.label}>FARBE · {colorName.toUpperCase()}</Text>
          <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel="Lunas Farbe">
            {LUNA_COLORS.map((c) => (
              <Swatch
                key={c.hex}
                hex={c.hex}
                name={c.name}
                active={look.color === c.hex}
                onPress={() => onChange({ color: c.hex })}
              />
            ))}
          </View>
        </View>
      </View>
      <Text style={styles.label}>HUT</Text>
      <View style={styles.hats} accessibilityRole="radiogroup" accessibilityLabel="Lunas Hut">
        {LUNA_HATS.map((h) => (
          <HatTile
            key={h.key}
            hat={h.key}
            title={h.title}
            accent={look.color}
            active={look.hat === h.key}
            onPress={() => onChange({ hat: h.key })}
          />
        ))}
      </View>
    </Card>
  );
}

function HatTile({
  hat,
  title,
  accent,
  active,
  onPress,
}: {
  hat: LunaHat;
  title: string;
  accent: string;
  active: boolean;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={title}
      style={[styles.hat, active && styles.hatActive, hovered && !active && styles.tileHover]}>
      <View style={styles.hatArt}>
        {hat === 'none' ? <X size={22} color={Colors.textFaint} /> : <LunaHatArt hat={hat} width={44} accent={accent} />}
      </View>
      <Text style={[styles.hatTitle, active && styles.hatTitleActive]} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Kleine Vorschau: Hintergrund + ein paar Symbole (ohne Bewegung) */
function Preview({ design }: { design: DesignSettings }) {
  const v = directionVector(design.direction);
  return (
    <View style={styles.preview} accessibilityLabel="Vorschau des Designs">
      {design.base === 'color' && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: design.color, opacity: strengthOpacity(design.strength) }]} />
      )}
      {design.base === 'gradient' && (
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 100">
          <Defs>
            <LinearGradient id="design-preview" x1={v.x1} y1={v.y1} x2={v.x2} y2={v.y2}>
              {design.gradient.map((c, i) => (
                <Stop key={c + i} offset={i / Math.max(1, design.gradient.length - 1)} stopColor={c} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#design-preview)" opacity={strengthOpacity(design.strength)} />
        </Svg>
      )}
      {design.icons !== 'none' &&
        PREVIEW_SPOTS.map((p, i) => (
          <View key={i} style={[styles.previewIcon, { left: `${p.x}%`, top: `${p.y}%`, transform: [{ rotate: `${p.r}deg` }] }]}>
            <IconGlyph kind={design.icons} size={p.size} />
          </View>
        ))}
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>Vorschau</Text>
        <Text style={styles.previewText}>So sieht es hinter deinen Seiten aus.</Text>
      </View>
    </View>
  );
}

const PREVIEW_SPOTS = [
  { x: 6, y: 12, size: 26, r: -12 },
  { x: 80, y: 8, size: 22, r: 10 },
  { x: 88, y: 60, size: 28, r: -6 },
  { x: 12, y: 66, size: 22, r: 14 },
  { x: 50, y: 74, size: 20, r: -18 },
];

function Swatch({ hex, name, active, onPress }: { hex: string; name: string; active: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: active }}
      style={[styles.swatchRing, active && styles.swatchRingActive, hovered && !active && styles.swatchRingHover]}>
      <View style={[styles.swatch, { backgroundColor: hex }]}>{active && <Check size={16} color="#000" strokeWidth={3} />}</View>
    </Pressable>
  );
}

function Slot({
  color,
  index,
  active,
  removable,
  onPress,
  onRemove,
}: {
  color: string;
  index: number;
  active: boolean;
  removable: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <View>
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityLabel={`Farbe ${index + 1} ändern`}
        accessibilityState={{ checked: active }}
        style={[styles.slot, active && styles.slotActive]}>
        <View style={[styles.slotFill, { backgroundColor: color }]} />
        <Text style={styles.slotNumber}>{index + 1}</Text>
      </Pressable>
      {removable && (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Farbe ${index + 1} entfernen`}
          style={styles.slotRemove}
          hitSlop={8}>
          <X size={12} color={Colors.text} strokeWidth={3} />
        </Pressable>
      )}
    </View>
  );
}

function PresetChip({
  id,
  title,
  colors,
  active,
  onPress,
}: {
  id: string;
  title: string;
  colors: string[];
  active: boolean;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="button"
      accessibilityLabel={`Vorlage ${title}`}
      style={[styles.preset, active && styles.presetActive, hovered && !active && styles.presetHover]}>
      <View style={styles.presetBar}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 100 10">
          <Defs>
            <LinearGradient id={`preset-${id}`} x1="0" y1="0" x2="1" y2="0">
              {colors.map((c, i) => (
                <Stop key={c + i} offset={i / Math.max(1, colors.length - 1)} stopColor={c} />
              ))}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="10" fill={`url(#preset-${id})`} />
        </Svg>
      </View>
      <Text style={[styles.presetText, active && styles.presetTextActive]}>{title}</Text>
    </Pressable>
  );
}

function IconTile({
  keyName,
  title,
  text,
  active,
  onPress,
}: {
  keyName: IconKey;
  title: string;
  text: string;
  active: boolean;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`${title}: ${text}`}
      style={[styles.tile, active && styles.tileActive, hovered && !active && styles.tileHover]}>
      <View style={styles.tileHead}>
        {keyName === 'none' ? (
          <Text style={styles.tileEmoji}>–</Text>
        ) : (
          <View style={styles.tileIcon}>
            <IconGlyph kind={keyName} size={28} />
          </View>
        )}
        {active && <Check size={16} color={Colors.accent} strokeWidth={2.6} />}
      </View>
      <Text style={styles.tileTitle}>{title}</Text>
      <Text style={styles.tileText} numberOfLines={2}>
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  label: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: Spacing.xs },
  hint: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  status: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  flex: { flex: 1 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: Spacing.sm },
  sectionTitle: { color: Colors.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.2 },

  lunaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.lg },
  lunaStage: {
    width: 150,
    height: 160,
    borderRadius: 18,
    backgroundColor: '#05070A',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 26,
  },
  lunaControls: { flex: 1, minWidth: 220, gap: Spacing.sm },
  hats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  hat: {
    width: 108,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  hatActive: { borderColor: Colors.accent },
  hatArt: { width: 44, height: 36, alignItems: 'center', justifyContent: 'center' },
  hatTitle: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  hatTitleActive: { color: Colors.text },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },

  preview: {
    height: 150,
    borderRadius: 18,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewIcon: { position: 'absolute', opacity: 0.6 },
  previewCard: {
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    backgroundColor: 'rgba(20,20,22,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    gap: 2,
  },
  previewTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  previewText: { color: Colors.textMuted, fontSize: 12.5 },

  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: { padding: 3, borderRadius: 999, borderWidth: 2, borderColor: 'transparent' },
  swatchRingActive: { borderColor: Colors.text },
  swatchRingHover: { borderColor: Colors.border },
  swatch: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  hexRow: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md },
  hexPreview: { width: 46, height: 46, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginBottom: 2 },

  slots: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  slot: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotActive: { borderColor: Colors.text },
  slotFill: { position: 'absolute', top: 4, left: 4, right: 4, bottom: 4, borderRadius: 11 },
  slotNumber: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 8,
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  slotRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlot: { borderStyle: 'dashed' },

  preset: {
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    minWidth: 104,
  },
  presetActive: { borderColor: Colors.accent },
  presetHover: { backgroundColor: Colors.surfaceRaised },
  presetBar: { height: 10, borderRadius: 5, overflow: 'hidden' },
  presetText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  presetTextActive: { color: Colors.text },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tile: {
    flexGrow: 1,
    flexBasis: 150,
    gap: 4,
    padding: Spacing.md,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  tileActive: { borderColor: Colors.accent },
  tileHover: { backgroundColor: Colors.surfaceRaised },
  tileHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tileEmoji: { fontSize: 28, lineHeight: 34, color: Colors.textMuted },
  tileIcon: { height: 34, minWidth: 34, alignItems: 'flex-start', justifyContent: 'center' },
  tileTitle: { color: Colors.text, fontSize: 14.5, fontWeight: '700' },
  tileText: { color: Colors.textMuted, fontSize: 12.5, lineHeight: 17 },
});
