import { useEffect, useRef, useState, type RefObject } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type HostInstance } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { NexyAvatar } from '@/features/assistant/nexy-avatar';
import { useHover } from '@/hooks/use-hover';

import { TUTORIALS } from './tutorial-content';
import { highlightRect, nextInTour, onScreen, placeCard, visibleSteps, type Rect } from './tutorial-logic';
import { useTutorial, type ActiveTutorial } from './tutorial-provider';

type Node = HostInstance & {
  getBoundingClientRect?: () => { left: number; top: number; width: number; height: number };
  scrollIntoView?: (o: { block: string; behavior: string }) => void;
};

/** Position einer Stelle im Fenster (Web: sofort, sonst über measureInWindow) */
function measure(ref: RefObject<HostInstance | null>): Promise<Rect | null> {
  const node = ref.current as Node | null;
  if (!node) return Promise.resolve(null);
  if (typeof node.getBoundingClientRect === 'function') {
    const r = node.getBoundingClientRect();
    return Promise.resolve({ x: r.left, y: r.top, width: r.width, height: r.height });
  }
  return new Promise((resolve) => {
    try {
      node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    } catch {
      resolve(null);
    }
  });
}

const reducedMotion = () =>
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Abdunkeln, Stelle hervorheben, Erklär-Karte mit Nexy. */
export function TutorialOverlay({ active, version }: { active: ActiveTutorial; version: number }) {
  const { targets, step, finish, close, stopAuto } = useTutorial();
  const view = useWindowDimensions();
  const tutorial = TUTORIALS[active.id];
  const steps = visibleSteps(tutorial.steps, (t) => targets.has(t));
  const index = Math.min(active.index, steps.length - 1);
  const current = steps[index];
  const key = `${active.id}:${index}`;
  const last = index === steps.length - 1;
  const next = active.tour ? nextInTour(active.id) : null;

  // gemessene Stelle (gehört immer zu einem Schritt – so bleibt nichts Altes stehen)
  const [measured, setMeasured] = useState<{ key: string; rect: Rect | null }>({ key: '', rect: null });
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [card, setCard] = useState<{ key: string; height: number } | null>(null);
  const root = useRef<HostInstance>(null);

  useEffect(() => {
    const target = current?.target;
    let cancelled = false;
    const run = async (scroll: boolean) => {
      const refs = target ? [...(targets.get(target) ?? [])] : [];
      let found: { ref: RefObject<HostInstance | null>; rect: Rect } | null = null;
      for (const ref of refs) {
        const rect = await measure(ref);
        if (rect && rect.width > 0 && rect.height > 0) {
          found = { ref, rect };
          break;
        }
      }
      const own = root.current ? await measure(root as RefObject<HostInstance | null>) : null;
      if (cancelled) return;
      if (own) setOrigin((o) => (o.x === own.x && o.y === own.y ? o : { x: own.x, y: own.y }));
      if (found && scroll) {
        const node = found.ref.current as Node | null;
        node?.scrollIntoView?.({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
      }
      setMeasured((m) =>
        m.key === key &&
        m.rect?.x === found?.rect.x &&
        m.rect?.y === found?.rect.y &&
        m.rect?.width === found?.rect.width &&
        m.rect?.height === found?.rect.height
          ? m
          : { key, rect: found?.rect ?? null },
      );
    };
    void run(true);
    // nach dem Scrollen/Einblenden noch einmal genau messen
    const timers = [120, 450, 900].map((ms) => setTimeout(() => void run(false), ms));
    const again = () => void run(false);
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    if (web) {
      window.addEventListener('resize', again);
      window.addEventListener('scroll', again, true);
    }
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      if (web) {
        window.removeEventListener('resize', again);
        window.removeEventListener('scroll', again, true);
      }
    };
  }, [key, current?.target, targets, version]);

  // Tastatur (Mac/Browser): Esc schließt, Pfeile blättern
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') {
        if (last) finish(!!next);
        else step(1);
      } else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, finish, step, last, next]);

  if (!current) return null;
  const size = { width: view.width, height: view.height };
  const raw = measured.key === key ? measured.rect : null;
  const rect = raw ? { ...raw, x: raw.x - origin.x, y: raw.y - origin.y } : null;
  const hole = onScreen(rect, size) ? highlightRect(rect, size) : null;
  const cardHeight = card?.key === key ? card.height : 230;
  const pos = placeCard(hole, { width: 380, height: cardHeight }, size);
  const total = steps.length;

  return (
    <View ref={root} style={StyleSheet.absoluteFill} testID="tutorial-overlay">
      {hole ? (
        <>
          <View style={[styles.dim, { left: 0, top: 0, right: 0, height: hole.y }]} />
          <View style={[styles.dim, { left: 0, top: hole.y + hole.height, right: 0, bottom: 0 }]} />
          <View style={[styles.dim, { left: 0, top: hole.y, width: hole.x, height: hole.height }]} />
          <View style={[styles.dim, { left: hole.x + hole.width, top: hole.y, right: 0, height: hole.height }]} />
          {/* Stelle selbst nicht anklickbar, solange die Einführung läuft */}
          <View style={[styles.block, { left: hole.x, top: hole.y, width: hole.width, height: hole.height }]} />
          <Animated.View
            layout={LinearTransition.duration(260)}
            pointerEvents="none"
            style={[styles.ring, { left: hole.x, top: hole.y, width: hole.width, height: hole.height }]}
            testID="tutorial-highlight"
          />
        </>
      ) : (
        <View style={[styles.dim, StyleSheet.absoluteFill]} />
      )}

      <Animated.View
        key={key}
        entering={(hole ? FadeInDown : FadeIn).duration(260)}
        onLayout={(e) => {
          const h = Math.round(e.nativeEvent.layout.height);
          setCard((c) => (c?.key === key && c.height === h ? c : { key, height: h }));
        }}
        role="dialog"
        aria-modal
        aria-label={`Einführung: ${tutorial.label}`}
        testID="tutorial-card"
        style={[styles.card, { left: pos.left, top: pos.top, width: pos.width }]}>
        <View style={styles.head}>
          <NexyAvatar size={34} mood={last ? 'happy' : 'idle'} />
          <View style={styles.headTexts}>
            <Text style={styles.eyebrow}>
              {active.tour ? 'RUNDGANG' : 'EINFÜHRUNG'} · {tutorial.label.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.count} accessibilityLabel={`Schritt ${index + 1} von ${total}`}>
            {index + 1} / {total}
          </Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {current.title}
        </Text>
        <Text style={styles.text}>{current.text}</Text>
        <View style={styles.dots}>
          {steps.map((s, i) => (
            <View key={`${s.title}-${i}`} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.actions}>
          <SmallLink
            label={active.tour ? 'Rundgang beenden' : 'Überspringen'}
            onPress={() => (last ? finish(false) : close())}
          />
          <View style={styles.buttons}>
            {index > 0 && <CardButton label="Zurück" onPress={() => step(-1)} />}
            <CardButton
              primary
              label={last ? (next ? `Weiter: ${TUTORIALS[next].label}` : 'Fertig') : 'Weiter'}
              onPress={() => (last ? finish(true) : step(1))}
            />
          </View>
        </View>
        {active.auto && index === 0 && (
          <SmallLink label="Einführungen nicht mehr automatisch zeigen" onPress={stopAuto} muted />
        )}
      </Animated.View>
    </View>
  );
}

function CardButton({ label, onPress, primary }: { label: string; onPress: () => void; primary?: boolean }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...hoverProps}
      style={[
        styles.cardButton,
        primary && styles.cardButtonPrimary,
        hovered && (primary ? styles.primaryHover : styles.secondaryHover),
      ]}>
      <Text style={[styles.cardButtonText, primary && styles.cardButtonTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

function SmallLink({ label, onPress, muted }: { label: string; onPress: () => void; muted?: boolean }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" {...hoverProps} style={styles.link}>
      <Text style={[styles.linkText, muted && styles.linkMuted, hovered && styles.linkHover]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.62)' },
  block: { position: 'absolute' },
  ring: {
    position: 'absolute',
    borderRadius: Radius.lg,
    borderWidth: 2,
    borderColor: Colors.accent,
    boxShadow: '0 0 0 4px rgba(47,227,154,0.18), 0 0 28px rgba(47,227,154,0.35)',
  },
  card: {
    position: 'absolute',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.35)',
    padding: Spacing.lg,
    gap: Spacing.sm,
    boxShadow: '0 18px 50px rgba(0,0,0,0.55)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headTexts: { flex: 1 },
  eyebrow: { color: Colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },
  count: { color: Colors.textFaint, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  title: { color: Colors.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  text: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  dots: { flexDirection: 'row', gap: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { width: 16, backgroundColor: Colors.accent },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  buttons: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap', flexShrink: 1, justifyContent: 'flex-end' },
  cardButton: {
    height: 38,
    paddingHorizontal: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardButtonPrimary: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  primaryHover: { opacity: 0.88 },
  secondaryHover: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
  cardButtonText: { color: Colors.text, fontSize: 14, fontWeight: '600' },
  cardButtonTextPrimary: { color: Colors.onAccent },
  link: { paddingVertical: 6 },
  linkText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  linkMuted: { color: Colors.textFaint, fontSize: 12, fontWeight: '500' },
  linkHover: { color: Colors.text },
});
