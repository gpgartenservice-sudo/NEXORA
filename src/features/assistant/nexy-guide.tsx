import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type HostInstance } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { toLocalInput } from '@/components/ui/date-utils';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { highlightRect, type Rect } from '@/features/tutorial/tutorial-logic';
import { measure, type Node } from '@/features/tutorial/tutorial-overlay';
import { useOptionalTutorial } from '@/features/tutorial/tutorial-provider';
import { useHover } from '@/hooks/use-hover';

import { placeNexy, typingDelay, typingFrames, type GuideSpot, type GuideStep, type NexySpot } from './guide-logic';
import { NexyAvatar, type NexyMood } from './nexy-avatar';
import { useNexy, type ExecuteOutcome, type LivePlayer } from './nexy-provider';
import { speak, type Speech } from './voice';

/**
 * Nexy macht es vor: Sobald sie weiß, was zu tun ist, löst sich ihr Kopf aus dem Chat,
 * gleitet nach unten rechts und erledigt dann alles sichtbar in der App –
 * sie geht zum Kunden, öffnet den Auftrag, tippt die Werte Buchstabe für
 * Buchstabe in die echten Felder und drückt auf Speichern. Erst dann wird
 * gespeichert. Am Ende „Erledigt!“ und zurück in den Chat.
 * Esc oder „Überspringen“: Nexy speichert den Rest ohne Vorführung.
 */

const SIZE = 64;
const BUBBLE = { width: 300, height: 72 };
const MOVE = 700;

/** stay: auf der Seite bleiben statt zurück in den Chat (z. B. „öffne Finanzen“) */
type Director = { play: LivePlayer; finish: (line: string, stay?: boolean) => Promise<void> };
/** Schlusssatz – und ob Nexy auf der gerade gezeigten Seite bleibt */
type Ending = string | { line: string; stay?: boolean };
type GuideState = {
  /** Nexy zeigt live, was `work` tut; `work` gibt Nexys Schlusssatz zurück */
  live: (work: (play: LivePlayer) => Promise<Ending>) => Promise<void>;
  running: boolean;
};
const Ctx = createContext<GuideState | null>(null);

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const web = Platform.OS === 'web' && typeof document !== 'undefined';

export function GuideProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<number | null>(null);
  const count = useRef(0);
  const director = useRef<Director | null>(null);
  const waiting = useRef<((d: Director | null) => void) | null>(null);

  const ready = useCallback((d: Director) => {
    director.current = d;
    waiting.current?.(d);
    waiting.current = null;
  }, []);

  // Überspringen: der Rest wird ohne Vorführung gespeichert
  const stop = useCallback(() => {
    director.current = null;
    waiting.current?.(null);
    waiting.current = null;
    setSession(null);
  }, []);

  const live = useCallback(async (work: (play: LivePlayer) => Promise<Ending>) => {
    const started = new Promise<Director | null>((resolve) => (waiting.current = resolve));
    count.current += 1;
    setSession(count.current);
    await Promise.race([started, sleep(4000)]);
    const play: LivePlayer = async (steps) => {
      await director.current?.play(steps);
    };
    let ending: Ending = 'Erledigt!';
    try {
      ending = await work(play);
    } finally {
      const { line, stay } = typeof ending === 'string' ? { line: ending, stay: false } : ending;
      await director.current?.finish(line, stay);
      director.current = null;
      waiting.current = null;
      setSession(null);
    }
  }, []);

  const value = useMemo(() => ({ live, running: session !== null }), [live, session]);
  return (
    <Ctx.Provider value={value}>
      <View style={styles.root}>
        {children}
        {session !== null && <GuideOverlay key={session} onReady={ready} onStop={stop} />}
      </View>
    </Ctx.Provider>
  );
}

/** null außerhalb des App-Rahmens (dann gibt es keine Vorführung) */
export function useGuide(): GuideState | null {
  return useContext(Ctx);
}

/**
 * Vorschläge einer Nachricht ausführen – Nexy macht es dabei in der App vor.
 * shown = Nexy hat es vorgeführt (und dabei schon „Erledigt!“ gesagt).
 */
export function useRunProposals() {
  const guide = useGuide();
  const { execute } = useNexy();
  return useCallback(
    async (messageId: string): Promise<ExecuteOutcome & { shown: boolean }> => {
      if (!guide) return { ...(await execute(messageId)), shown: false };
      let outcome: ExecuteOutcome = { ok: false, results: [], error: 'Nexy wurde unterbrochen.' };
      await guide.live(async (play) => {
        outcome = await execute(messageId, play);
        if (!outcome.ok) return 'Da hat etwas nicht geklappt – im Chat steht, woran es liegt.';
        // Seite geöffnet: dort bleiben
        return outcome.stay ? { line: 'Bitte schön!', stay: true } : 'Erledigt!';
      });
      return { ...outcome, shown: true };
    },
    [guide, execute],
  );
}

type Scene = {
  /** wechselt bei jeder neuen Stelle (Rahmen blendet neu ein) */
  ring: number;
  rect: Rect | null;
  /** Nexy drückt gerade auf diese Stelle */
  pressed: boolean;
  text: string | null;
  /** wechselt bei jedem neuen Satz */
  line: number;
  bubble: NexySpot['bubble'] | null;
  mood: NexyMood;
};
const START: Scene = { ring: 0, rect: null, pressed: false, text: null, line: 0, bubble: null, mood: 'idle' };

/** Gefundene Stelle: Lage im Fenster, neu messen, in den Blick scrollen, ggf. Eingabefeld */
type Hit = {
  rect: Rect;
  remeasure: () => Promise<Rect | null>;
  scroll: (smooth: boolean) => void;
  input?: HTMLInputElement | HTMLTextAreaElement;
  /** gefunden über die Beschriftung (für echte Klicks) */
  el?: HTMLElement;
};

const rectOf = (el: Element): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
};

/** Feld bzw. Knopf über die Beschriftung finden (sichtbar, die zuletzt geöffnete Seite zuerst) */
function findByLabel(label: string, field: boolean): HTMLElement | null {
  if (!web) return null;
  const prefix = label.endsWith('…');
  const text = prefix ? label.slice(0, -1) : label;
  const all = Array.from(
    document.querySelectorAll<HTMLElement>(field ? 'input[aria-label], textarea[aria-label]' : '[aria-label]'),
  );
  const hits = all.filter((el) => {
    if (!field && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return false;
    const l = el.getAttribute('aria-label') ?? '';
    if (prefix ? !l.startsWith(text) : l !== text) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
  });
  return hits[hits.length - 1] ?? null;
}

/** Wert setzen wie beim Tippen (React bekommt ein normales Eingabe-Ereignis) */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function GuideOverlay({ onReady, onStop }: { onReady: (d: Director) => void; onStop: () => void }) {
  const tutorial = useOptionalTutorial();
  const view = useWindowDimensions();
  const reduce = useReducedMotion();
  const root = useRef<HostInstance>(null);
  const [scene, setScene] = useState<Scene>(START);

  const x = useSharedValue(view.width - SIZE - 32);
  const y = useSharedValue(view.height - SIZE - 32);
  const scale = useSharedValue(1);
  const hop = useSharedValue(0);
  const opacity = useSharedValue(0);
  const pulse = useSharedValue(0);

  // aktuelle Werte für den laufenden Ablauf (ohne ihn neu zu starten)
  const live = useRef({ view, reduce, targets: tutorial?.targets, onReady });
  useEffect(() => {
    live.current = { view, reduce, targets: tutorial?.targets, onReady };
  }, [view, reduce, tutorial?.targets, onReady]);

  // Keine Einführung dazwischen, solange Nexy vorführt (kommt beim nächsten Besuch)
  const holdAuto = tutorial?.holdAuto;
  useEffect(() => {
    holdAuto?.(true);
    return () => holdAuto?.(false);
  }, [holdAuto]);

  // Stelle, an der Nexy gerade steht (für Scrollen/Fenstergröße)
  const settled = useRef<(() => Promise<Rect | null>) | null>(null);

  const origin = useCallback(async () => {
    const own = await measure(root as RefObject<HostInstance | null>);
    return own ? { x: own.x, y: own.y } : { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    let stopped = false;
    let speech: Speech | null = null;
    let talking: Promise<unknown> = Promise.resolve();
    let pos = { x: x.get(), y: y.get() };
    let ring = 0;
    let line = 0;
    const dur = (ms: number) => (live.current.reduce ? 0 : ms);
    const smooth = () => !live.current.reduce;

    const moveTo = async (nx: number, ny: number, s = 1) => {
      const dist = Math.hypot(nx - pos.x, ny - pos.y);
      pos = { x: nx, y: ny };
      const d = dur(Math.round(Math.max(260, Math.min(MOVE, 220 + dist * 0.7))));
      const ease = Easing.inOut(Easing.cubic);
      x.set(withTiming(nx, { duration: d, easing: ease }));
      y.set(withTiming(ny, { duration: d, easing: ease }));
      scale.set(withTiming(s, { duration: d, easing: ease }));
      if (d && dist > 40) {
        // kleiner Hüpfer unterwegs
        const h = -Math.min(22, 8 + dist / 30);
        hop.set(
          withSequence(
            withTiming(h, { duration: d / 2, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: d / 2, easing: Easing.in(Easing.quad) }),
          ),
        );
      }
      await sleep(d + 30);
    };

    const relative = async (r: Rect) => {
      const o = await origin();
      return { ...r, x: r.x - o.x, y: r.y - o.y };
    };

    const fromTarget = async (target: string): Promise<Hit | null> => {
      const refs = [...(live.current.targets?.get(target) ?? [])].reverse(); // neueste Seite zuerst
      for (const ref of refs) {
        const r = await measure(ref);
        if (!r || r.width <= 0 || r.height <= 0) continue;
        return {
          rect: r,
          remeasure: () => measure(ref),
          scroll: (s) =>
            (ref.current as Node | null)?.scrollIntoView?.({ block: 'center', behavior: s ? 'smooth' : 'auto' }),
        };
      }
      return null;
    };

    const fromLabel = (label: string, field: boolean): Hit | null => {
      const el = findByLabel(label, field);
      if (!el) return null;
      return {
        rect: rectOf(el),
        remeasure: async () => (el.isConnected ? rectOf(el) : null),
        scroll: (s) => el.scrollIntoView({ block: 'center', behavior: s ? 'smooth' : 'auto' }),
        input: el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : undefined,
        el,
      };
    };

    /** Stelle suchen (wartet, bis die Seite da ist), bei Bedarf in den Blick scrollen */
    const locate = async (spot: GuideSpot, { timeout = 3500, scroll = true } = {}): Promise<Hit | null> => {
      const deadline = Date.now() + timeout;
      do {
        const hit =
          'target' in spot
            ? await fromTarget(spot.target)
            : fromLabel('field' in spot ? spot.field : spot.button, 'field' in spot);
        if (hit) {
          const h = live.current.view.height;
          if (scroll && (hit.rect.y < 90 || hit.rect.y + Math.min(hit.rect.height, 300) > h - 110)) {
            hit.scroll(smooth());
            await sleep(smooth() ? 460 : 60);
          }
          const r = (await hit.remeasure()) ?? hit.rect;
          return { ...hit, rect: await relative(r) };
        }
        await sleep(120);
      } while (!stopped && Date.now() < deadline);
      return null;
    };

    /** Nexy geht zur Stelle (oder in die Ecke), die Stelle leuchtet */
    const point = async (hit: Hit | null) => {
      settled.current = null;
      const spot = placeNexy(hit?.rect ?? null, SIZE, live.current.view, BUBBLE);
      await moveTo(spot.x, spot.y);
      if (stopped) return;
      ring += 1;
      const r = ring;
      setScene((s) => ({ ...s, ring: r, rect: hit?.rect ?? null, pressed: false, bubble: spot.bubble }));
      if (hit) {
        settled.current = async () => {
          const m = await hit.remeasure();
          return m ? relative(m) : null;
        };
      }
    };

    /** Satz zeigen und sagen – läuft weiter, während Nexy tippt; der nächste Satz wartet */
    const sayLine = async (text: string, mood: NexyMood = 'talking') => {
      await talking;
      if (stopped) return;
      line += 1;
      const l = line;
      setScene((s) => ({ ...s, text, line: l, mood }));
      const sp = speak(text);
      speech = sp;
      const read = Math.min(5000, 1200 + text.length * 45);
      talking = Promise.race([Promise.all([sp.done, sleep(read)]), sleep(14000)]).then(() => {
        if (line === l) setScene((s) => ({ ...s, mood: 'idle' }));
      });
    };

    const typeInto = async (field: string, text: string) => {
      const hit = await locate({ field }, { timeout: 1600 });
      const el = hit?.input;
      if (!hit || !el || stopped) return;
      await point(hit);
      el.focus({ preventScroll: true });
      if (!text) {
        setValue(el, '');
      } else {
        const length = [...text].length;
        const frames = live.current.reduce ? [text] : typingFrames(text);
        const per = live.current.reduce ? 0 : (typingDelay(length) * length) / frames.length;
        for (const f of frames) {
          if (stopped) return;
          setValue(el, f);
          if (per) await sleep(per);
        }
      }
      await sleep(dur(240));
      el.blur();
    };

    const setDate = async (field: string, value: string | null, withTime: boolean) => {
      const hit = await locate({ field }, { timeout: 1600 });
      const el = hit?.input;
      if (!hit || !el || stopped) return;
      await point(hit);
      el.focus({ preventScroll: true });
      await sleep(dur(260));
      setValue(el, toLocalInput(value, withTime));
      await sleep(dur(520));
      el.blur();
    };

    const press = async (button: string) => {
      const hit = await locate({ button }, { timeout: 2200 });
      if (stopped) return;
      await point(hit);
      if (!hit) return;
      // Nexy tippt drauf, der Rahmen blitzt
      setScene((s) => ({ ...s, pressed: true }));
      scale.set(withSequence(withTiming(0.8, { duration: dur(110) }), withTiming(1, { duration: dur(200) })));
      await sleep(dur(560) || 120);
    };

    /** Schalter/Auswahl wirklich anklicken (on: nur, wenn der Schalter anders steht) */
    const pick = async (button: string, on?: boolean) => {
      const hit = await locate({ button }, { timeout: 2200 });
      if (stopped) return;
      await point(hit);
      if (!hit?.el) return;
      setScene((s) => ({ ...s, pressed: true }));
      scale.set(withSequence(withTiming(0.8, { duration: dur(110) }), withTiming(1, { duration: dur(200) })));
      const checked = hit.el.getAttribute('aria-checked') === 'true';
      if (on === undefined || checked !== on) hit.el.click();
      await sleep(dur(560) || 120);
    };

    const run = async (step: GuideStep) => {
      if (stopped) return;
      if (step.do === 'go') {
        settled.current = null;
        setScene((s) => ({ ...s, rect: null }));
        if (step.mode === 'push') router.push(step.href as never);
        else if (step.mode === 'replace') router.replace(step.href as never);
        else router.navigate(step.href as never);
        await sleep(dur(420) || 160); // Seite aufbauen lassen
      } else if (step.do === 'show') {
        const hit = step.at ? await locate(step.at) : null;
        if (stopped) return;
        await point(hit);
        if (step.say) await sayLine(step.say);
        else await sleep(dur(700) || 200);
      } else if (step.do === 'type') {
        await typeInto(step.field, step.text);
      } else if (step.do === 'date') {
        await setDate(step.field, step.value, step.withTime);
      } else if (step.do === 'press') {
        await press(step.button);
      } else if (step.do === 'pick') {
        await pick(step.button, step.on);
      }
    };

    const center = (r: Rect) => ({ x: r.x + r.width / 2 - SIZE / 2, y: r.y + r.height / 2 - SIZE / 2, s: r.width / SIZE });

    const director: Director = {
      play: async (steps) => {
        for (const step of steps) {
          if (stopped) return;
          await run(step);
        }
      },
      finish: async (text, stay) => {
        if (stopped) return;
        await talking;
        settled.current = null;
        setScene((s) => ({ ...s, rect: null }));
        const end = placeNexy(null, SIZE, live.current.view, BUBBLE);
        await moveTo(end.x, end.y);
        if (stopped) return;
        setScene((s) => ({ ...s, bubble: end.bubble }));
        await sayLine(text, 'happy');
        await talking;
        if (stopped) return;
        setScene((s) => ({ ...s, text: null }));
        if (stay) {
          // auf der geöffneten Seite bleiben – Nexy blendet sich aus
          opacity.set(withTiming(0, { duration: dur(220) }));
          await sleep(dur(240));
          return;
        }
        router.navigate('/assistent' as never);
        await sleep(dur(380) || 150);
        const home = await locate({ target: 'guide.nexy' }, { scroll: false, timeout: 1500 });
        if (home) {
          const c = center(home.rect);
          await moveTo(c.x, c.y, c.s);
        }
        opacity.set(withTiming(0, { duration: dur(220) }));
        await sleep(dur(240));
      },
    };

    void (async () => {
      // Nexys Kopf löst sich aus dem Chat und gleitet nach unten rechts
      const home = await locate({ target: 'guide.nexy' }, { scroll: false, timeout: 0 });
      const corner = placeNexy(null, SIZE, live.current.view, BUBBLE);
      if (home) {
        const c = center(home.rect);
        x.set(c.x);
        y.set(c.y);
        scale.set(c.s);
        pos = { x: c.x, y: c.y };
      } else {
        x.set(corner.x);
        y.set(corner.y + 40);
        scale.set(0.6);
        pos = { x: corner.x, y: corner.y + 40 };
      }
      opacity.set(withTiming(1, { duration: dur(200) }));
      await moveTo(corner.x, corner.y);
      if (!stopped) live.current.onReady(director);
    })();

    return () => {
      stopped = true;
      speech?.cancel();
    };
  }, [x, y, scale, hop, opacity, origin]);

  // Leuchten der Stelle pulsiert sanft
  useEffect(() => {
    if (reduce) return;
    pulse.set(withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [reduce, pulse]);

  // Seite scrollt / Fenster ändert sich: Rahmen und Nexy mitführen
  useEffect(() => {
    if (!web || typeof window === 'undefined') return;
    let frame = 0;
    const again = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const current = settled.current;
        if (!current) return;
        void (async () => {
          const rect = await current();
          if (!rect || settled.current !== current) return;
          const spot = placeNexy(rect, SIZE, { width: window.innerWidth, height: window.innerHeight }, BUBBLE);
          x.set(spot.x);
          y.set(spot.y);
          setScene((s) => (s.rect ? { ...s, rect, bubble: spot.bubble } : s));
        })();
      });
    };
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
    };
  }, [x, y]);

  // Überspringen: zurück in den Chat, Nexy speichert den Rest ohne Vorführung
  const skip = useCallback(() => {
    router.navigate('/assistent' as never);
    onStop();
  }, [onStop]);

  useEffect(() => {
    if (!web || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [skip]);

  const nexyStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() + hop.get() }, { scale: scale.get() }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.45 + 0.55 * pulse.get() }));

  const hole = scene.rect ? highlightRect(scene.rect, view, 6) : null;
  const bubble = scene.text ? scene.bubble : null;

  return (
    <View ref={root} style={StyleSheet.absoluteFill} testID="nexy-guide">
      {/* Klicks abfangen, solange Nexy vorführt */}
      <View style={StyleSheet.absoluteFill} />

      {hole && (
        <Animated.View
          key={scene.ring}
          entering={FadeIn.duration(reduce ? 0 : 220)}
          pointerEvents="none"
          testID="nexy-guide-highlight"
          style={[
            styles.ring,
            scene.pressed && styles.ringPressed,
            { left: hole.x, top: hole.y, width: hole.width, height: hole.height },
          ]}>
          <Animated.View style={[styles.glow, glowStyle]} />
        </Animated.View>
      )}

      {bubble && (
        <Animated.View
          key={`b${scene.line}`}
          entering={FadeIn.duration(reduce ? 0 : 200)}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.bubble, { left: bubble.left, top: bubble.top, width: bubble.width }]}>
          <View style={[styles.bubbleInner, bubble.align === 'end' && styles.bubbleEnd]}>
            <Text style={styles.bubbleText}>{scene.text}</Text>
          </View>
        </Animated.View>
      )}

      <Animated.View pointerEvents="none" style={[styles.nexy, nexyStyle]}>
        <NexyAvatar size={SIZE} mood={scene.mood} />
      </Animated.View>

      <View style={styles.skipRow} pointerEvents="box-none">
        <SkipButton onPress={skip} />
      </View>
    </View>
  );
}

function SkipButton({ onPress }: { onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Nexys Vorführung überspringen"
      {...hoverProps}
      style={[styles.skip, hovered && styles.skipHover]}>
      <Text style={[styles.skipText, hovered && styles.skipTextHover]}>Überspringen</Text>
      {Platform.OS === 'web' && <Text style={styles.skipKey}>esc</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  ring: {
    position: 'absolute',
    borderRadius: Radius.md,
    borderWidth: 2,
    borderColor: Colors.accent,
    // Rest der Seite etwas abdunkeln, die Stelle bleibt hell
    boxShadow: '0 0 0 4000px rgba(0,0,0,0.38)',
  },
  ringPressed: { backgroundColor: 'rgba(47,227,154,0.16)' },
  glow: {
    position: 'absolute',
    left: -2,
    top: -2,
    right: -2,
    bottom: -2,
    borderRadius: Radius.md,
    boxShadow: '0 0 0 4px rgba(47,227,154,0.22), 0 0 30px rgba(47,227,154,0.55)',
  },
  nexy: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE },
  bubble: { position: 'absolute', minHeight: 44, justifyContent: 'center' },
  bubbleInner: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.45)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
  },
  bubbleEnd: { alignSelf: 'flex-end' },
  bubbleText: { color: Colors.text, fontSize: 14.5, lineHeight: 20, fontWeight: '500' },
  skipRow: { position: 'absolute', top: Spacing.lg, left: 0, right: 0, alignItems: 'center' },
  skip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  skipHover: { borderColor: Colors.borderFocus, backgroundColor: Colors.surfaceRaised },
  skipText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  skipTextHover: { color: Colors.text },
  skipKey: { color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
});
