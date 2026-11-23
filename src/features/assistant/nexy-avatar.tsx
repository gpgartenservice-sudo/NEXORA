import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, Pressable, StyleSheet, Text, View, type ViewInstance } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';
import { Accelerometer } from 'expo-sensors';

import { Colors } from '@/constants/theme';
import { useDesign } from '@/features/design/design-context';

import { hatFrame, LunaHatArt } from './luna-hat';
import { DEFAULT_LUNA, hatHidesAntenna, lunaPalette, type LunaHat, type LunaLook } from './luna-look';
import {
  gestureLine,
  GESTURE_MS,
  idleDelay,
  nextTap,
  NO_TAPS,
  pickIdleGesture,
  type LunaGesture,
} from './luna-moves';
import { LunaBodyWearArt, LunaGlassesArt } from './luna-wear';
import { speakReaction } from './voice';

/** sad = etwas ist schiefgegangen, celebrate = großer Erfolg (Jubel mit Konfetti) */
export type NexyMood = 'idle' | 'thinking' | 'happy' | 'listening' | 'talking' | 'sad' | 'celebrate';

type Props = {
  size?: number;
  mood?: NexyMood;
  /** false = ruhig (z. B. ältere Nachrichten im Verlauf) */
  animate?: boolean;
  /** Reagiert auf Maus (Hover = freut sich, Klick = Stupser, Doppelklick = Pirouette, halten = kichert) */
  interactive?: boolean;
  /** Kleine Sprechblase beim Anstupsen (für die große Figur) */
  talk?: boolean;
  /** Lautstärke am Mikrofon 0..1 (beim Zuhören) */
  level?: SharedValue<number>;
  /** Farbe/Aussehen fest vorgeben (Vorschau in Profil → Design); sonst Akzentfarbe und Look aus dem Profil */
  color?: string;
  /** ganzer Look (Hut, Brille, Hals, Kleidung) */
  look?: LunaLook;
  /** nur den Hut ändern (der Rest kommt aus `look` bzw. dem Profil) */
  hat?: LunaHat;
  /**
   * Begrüßen beim Erscheinen: true = ploppt auf und winkt; Zahl = winkt nach so vielen ms
   * (wenn der Auftritt selbst von außen kommt, z. B. Luna fliegt ins Bild)
   */
  greet?: boolean | number;
};

const EYE = '#F2FFF9';
const PUPIL = '#0A1C15';
const CHEEK = '#FF8FB8';
const TEAR = '#8FD3FF';
const STAR = '#FFD34D';
const CONFETTI = ['#FFD34D', '#FF6B9A', '#5AA9FF', '#B57BFF', '#FFFFFF', '#FF8A3D'];
const CONFETTI_PIECES = 18;
const ease = Easing.inOut(Easing.sin);
const SPRING = { damping: 14, stiffness: 120, mass: 0.8 };
const BOUNCE = { damping: 7, stiffness: 220 };
// Handy kippen: weich gleiten statt zucken
const GLIDE = { damping: 12, stiffness: 70, mass: 1 };
// Rutschen bis an den Rand: etwas schneller, schwingt beim Aufprall kurz über (= wird kurz plattgedrückt)
const WALL = { damping: 11, stiffness: 95, mass: 1 };
/** Abstand zum Bildschirmrand, an dem Luna anstößt */
const EDGE_GAP = 4;
/** Ohne Mausbewegung wird Luna nach dieser Zeit müde (gähnt, schläft ein) */
const SLEEP_MS = 25000;
/** Gesten, Hände, Konfetti, Tränen und Sternchen erst ab dieser Größe (bei Mini-Luna sieht man es nicht) */
const EXPRESSIVE = 44;

/**
 * Position an der Wand: slide -1…1 = bis zum linken/rechten Rand, darüber hinaus wird Luna gegen
 * die Kante gedrückt – schmaler und etwas höher, die Seite an der Kante bleibt dabei an der Kante.
 */
function wall(slide: number, roomL: number, roomR: number, size: number) {
  'worklet';
  const side = slide < 0 ? -1 : 1;
  const inside = Math.min(1, Math.abs(slide));
  const press = Math.min(1, Math.max(0, Math.abs(slide) - 1) * 2.4);
  const sx = 1 - press * 0.18;
  const sy = 1 + press * 0.1;
  const x = side * (inside * (side < 0 ? roomL : roomR) + (size * (1 - sx)) / 2);
  return { x, sx, sy, roll: side * inside * (1 - press) };
}
const REACTIONS = ['Hihi!', 'Das kitzelt!', 'Hey du!', 'Na, was steht an?', 'Ich bin bereit!', 'Huch!'];
// 'worklet': läuft auf iPhone/Android auch im UI-Thread (in useAnimatedStyle) –
// ohne die Markierung stürzen Lunas Animationen dort ab (im Browser egal)
const clamp = (v: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, v));
};

/**
 * Luna – die Figur der Assistentin: leuchtende Kugel mit großen Augen,
 * Bäckchen, Mund und Antenne.
 *
 * - Schaut der Maus hinterher, beugt sich bei Nähe zu ihr und macht große Augen
 * - Hover: freut sich (^^), Klick: wird zusammengedrückt, Funken + Sprechblase
 * - Doppelklick: Pirouette · ganz oft hintereinander: schwindelig (Spiralaugen, taumelt,
 *   Sternchen) · gedrückt halten: kichert
 * - Schwebt (mit Schatten), atmet, blinzelt, die Antenne wippt nach
 * - Macht von sich aus ab und zu kleine Gesten: zwinkern, winken, Kopf schief legen,
 *   Pirouette, staunen (ab mittlerer Größe, nur in Ruhe)
 * - Begrüßt beim Erscheinen (ploppt auf und winkt, `greet`)
 * - Nachdenken: Punkte kreisen, Mund "o"; erledigt: strahlt
 * - Traurig (`sad`, z. B. bei Fehlern): Augenbrauen hoch, Mundwinkel runter, sinkt etwas ab,
 *   Antenne hängt, ab und zu eine Träne
 * - Jubel (`celebrate`, z. B. Rechnung bezahlt, Ziel erreicht): Freudensprünge, beide Hände
 *   hoch, Konfetti
 * - Zuhören: große Augen, Schallringe und Antenne folgen der Stimme
 * - Sprechen: der Mund bewegt sich
 * - Handy (große Figur): Kippt oder schiebt man das Handy seitlich, rutscht Luna bis an den
 *   Bildschirmrand und wird dagegen gedrückt (plattgedrückt, federt zurück)
 * - Ohne Mausbewegung wird Luna irgendwann müde: gähnt, schläft ein (Zzz steigen auf) –
 *   bewegt man die Maus, wacht sie auf und streckt sich
 * - Bei "Bewegung reduzieren" bleibt Luna ruhig (Gesichtsausdrücke gibt es trotzdem)
 * - Farbe (= Akzentfarbe der App), Hut, Brille, Hals (Fliege, Krawatte, Schal …), Kleidung
 *   und fertige Sets wählt man in Profil → Design (für alle Abos) – Luna trägt sie überall
 */
export function NexyAvatar({
  size: S = 40,
  mood = 'idle',
  animate = true,
  interactive = false,
  talk = false,
  level,
  color,
  look,
  hat: hatProp,
  greet,
}: Props) {
  const reduce = useReducedMotion();
  const moving = animate && !reduce;
  const expressive = moving && S >= EXPRESSIVE;
  const tracking = moving && Platform.OS === 'web';
  // große Figur auf dem Handy: folgt dem Kippen (Bewegungssensor)
  const tilting = moving && talk && Platform.OS !== 'web';
  const ref = useRef<ViewInstance>(null);

  // Bewegung
  const lookX = useSharedValue(0);
  const lookY = useSharedValue(0);
  const near = useSharedValue(0);
  const float = useSharedValue(0);
  const breathe = useSharedValue(0);
  const blink = useSharedValue(1);
  const glow = useSharedValue(0.55);
  const spin = useSharedValue(0);
  const squashX = useSharedValue(1);
  const squashY = useSharedValue(1);
  const jump = useSharedValue(0);
  const burst = useSharedValue(1);
  const sway = useSharedValue(0);
  const mouthOpen = useSharedValue(0);
  const attentive = useSharedValue(0);
  const slide = useSharedValue(0); // -1 linker Rand … 1 rechter Rand; darüber hinaus = an den Rand gedrückt
  // Platz bis zum Bildschirmrand (links/rechts), wird beim Kippen gemessen
  const roomL = useSharedValue(S * 0.95);
  const roomR = useSharedValue(S * 0.95);
  const noLevel = useSharedValue(0);
  const voice = level ?? noLevel;
  // Gesten und Gefühle
  const tiltHead = useSharedValue(0); // Grad: Kopf schief legen
  const shake = useSharedValue(0); // Grad: kichern (schnell), schwindelig (taumeln)
  const twirl = useSharedValue(0); // 0…1 = eine ganze Drehung (Pirouette)
  const surprise = useSharedValue(0); // staunen: große Augen
  const squint = useSharedValue(1); // Augen zukneifen (gähnen)
  const yawn = useSharedValue(0); // Mund beim Gähnen
  const droop = useSharedValue(0); // traurig: sinkt ab, Antenne hängt
  const dizzy = useSharedValue(0); // Grad: Spiralaugen und Sternchen drehen sich
  const pop = useSharedValue(greet === true && moving ? 0.3 : 1); // Aufploppen beim Begrüßen
  const handL = useSharedValue(0);
  const handR = useSharedValue(0);
  const waveL = useSharedValue(0);
  const waveR = useSharedValue(0);
  const reach = useSharedValue(0); // Hände ganz nach oben (strecken, jubeln)

  // Zustände, die das Aussehen umschalten
  const [hovered, setHovered] = useState(false);
  const [booped, setBooped] = useState(false);
  const [drowsy, setDrowsy] = useState(false);
  const [speech, setSpeech] = useState<string | null>(null);
  const [gesture, setGesture] = useState<LunaGesture | null>(null);
  const lastMove = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const gestureTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const speechTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const playing = useRef<LunaGesture | null>(null);
  const lastGesture = useRef<LunaGesture | null>(null);
  const taps = useRef(NO_TAPS);
  const drowsyRef = useRef(false);
  // Müde-Zähler neu starten (auch wenn Luna per Klick geweckt wird, ohne dass sich die Maus bewegt)
  const restartSleep = useRef<(() => void) | null>(null);
  const moodRef = useRef(mood);
  useEffect(() => {
    moodRef.current = mood;
  }, [mood]);

  const g = gesture;
  const sad = mood === 'sad';
  const celebrating = mood === 'celebrate' || g === 'cheer';
  const happy = mood === 'happy' || celebrating || booped || g === 'giggle' || (hovered && !sad);
  const thinking = mood === 'thinking';
  const listening = mood === 'listening';
  const talking = mood === 'talking';
  // nur im Ruhezustand schläfrig (beim Zuhören/Sprechen bewegt niemand die Maus)
  const sleepy = drowsy && mood === 'idle';

  const sleep = useCallback((on: boolean) => {
    drowsyRef.current = on;
    setDrowsy(on);
  }, []);
  /** Angestupst: aufwachen und von vorn bis zum Müdewerden zählen */
  const wake = useCallback(() => {
    if (drowsyRef.current) sleep(false);
    restartSleep.current?.();
  }, [sleep]);

  /** Kurze Sprechblase (große Figur), auf Wunsch auch laut */
  const say = useCallback(
    (line: string | null, aloud: boolean) => {
      if (!line || !talk) return;
      clearTimeout(speechTimer.current);
      setSpeech(line);
      if (aloud) speakReaction(line);
      speechTimer.current = setTimeout(() => setSpeech(null), 1800);
    },
    [talk],
  );

  /** Eine Geste abspielen (Aussehen über `gesture`, Bewegung über die Werte oben) */
  const play = useCallback(
    (name: LunaGesture, aloud = false) => {
      clearTimeout(gestureTimer.current);
      playing.current = name;
      lastGesture.current = name;
      setGesture(name);
      gestureTimer.current = setTimeout(() => {
        playing.current = null;
        setGesture(null);
      }, GESTURE_MS[name]);
      if (aloud || name === 'greet') say(gestureLine(name), aloud);
      if (reduce) return;

      // was die letzte Geste noch bewegt, sanft zurück
      const quick = { duration: 160 };
      tiltHead.set(withSpring(0, SPRING));
      shake.set(withTiming(0, quick));
      surprise.set(withTiming(0, quick));
      yawn.set(withTiming(0, quick));
      squint.set(withTiming(1, quick));
      twirl.set(0);
      for (const v of [handL, handR, reach, waveL, waveR]) v.set(withTiming(0, quick));

      const hop = (height: number, ms: number) =>
        withSequence(withTiming(-S * height, { duration: ms, easing: Easing.out(Easing.quad) }), withSpring(0, BOUNCE));
      const sparkle = (delay: number) =>
        burst.set(
          withDelay(
            delay,
            withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) })),
          ),
        );
      const waving = () =>
        withSequence(
          withTiming(26, { duration: 180 }),
          withTiming(-12, { duration: 170 }),
          withTiming(26, { duration: 170 }),
          withTiming(-12, { duration: 170 }),
          withTiming(20, { duration: 170 }),
          withTiming(0, { duration: 200 }),
        );
      // erst rund werden (ein Stupser davor federt sonst „eingefroren“ weiter), dann zur Landung plattdrücken
      const squish = (delay: number, x: number, y: number) => {
        const land = { damping: 6, stiffness: 260 };
        const round = Math.min(120, delay);
        squashX.set(
          withSequence(
            withTiming(1, { duration: round }),
            withDelay(delay - round, withTiming(x, { duration: 80 })),
            withSpring(1, land),
          ),
        );
        squashY.set(
          withSequence(
            withTiming(1, { duration: round }),
            withDelay(delay - round, withTiming(y, { duration: 80 })),
            withSpring(1, land),
          ),
        );
      };

      switch (name) {
        case 'wink':
          tiltHead.set(withSequence(withTiming(7, { duration: 160 }), withDelay(420, withSpring(0, SPRING))));
          break;
        case 'tilt': {
          const dir = Math.random() < 0.5 ? -1 : 1;
          tiltHead.set(withSequence(withSpring(dir * 14, SPRING), withDelay(950, withSpring(0, SPRING))));
          break;
        }
        case 'wow':
          surprise.set(
            withSequence(withSpring(1, { damping: 9, stiffness: 260 }), withDelay(800, withTiming(0, { duration: 300 }))),
          );
          jump.set(hop(0.08, 120));
          break;
        case 'twirl':
          twirl.set(
            withSequence(
              withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
              withTiming(0, { duration: 0 }),
            ),
          );
          jump.set(hop(0.16, 320));
          squish(860, 1.12, 0.88);
          sparkle(820);
          break;
        case 'giggle':
          shake.set(
            withSequence(
              withRepeat(withSequence(withTiming(5, { duration: 70 }), withTiming(-5, { duration: 70 })), 7),
              withTiming(0, { duration: 90 }),
            ),
          );
          jump.set(withRepeat(withSequence(withTiming(-S * 0.035, { duration: 100 }), withTiming(0, { duration: 100 })), 6));
          break;
        case 'dizzy':
          dizzy.set(0);
          dizzy.set(withTiming(1440, { duration: GESTURE_MS.dizzy, easing: Easing.out(Easing.quad) }));
          shake.set(
            withSequence(
              withTiming(14, { duration: 200 }),
              withTiming(-12, { duration: 260 }),
              withTiming(10, { duration: 260 }),
              withTiming(-8, { duration: 280 }),
              withTiming(6, { duration: 300 }),
              withTiming(-4, { duration: 320 }),
              withTiming(2, { duration: 340 }),
              withTiming(0, { duration: 360 }),
            ),
          );
          break;
        case 'greet':
        case 'wave': {
          const delay = name === 'greet' ? 350 : 0;
          if (name === 'greet') {
            pop.set(withSequence(withTiming(0.3, { duration: 0 }), withSpring(1, { damping: 9, stiffness: 150 })));
            jump.set(hop(0.14, 240));
          }
          handR.set(withDelay(delay, withSequence(withSpring(1, SPRING), withDelay(1100, withTiming(0, { duration: 260 })))));
          waveR.set(withDelay(delay + 120, waving()));
          break;
        }
        case 'yawn':
          yawn.set(
            withSequence(withTiming(1, { duration: 700, easing: ease }), withDelay(500, withTiming(0, { duration: 450, easing: ease }))),
          );
          squint.set(withSequence(withTiming(0.3, { duration: 500 }), withDelay(900, withTiming(1, { duration: 400 }))));
          squashY.set(withSequence(withTiming(1.07, { duration: 700, easing: ease }), withDelay(500, withSpring(1, SPRING))));
          squashX.set(withSequence(withTiming(0.95, { duration: 700, easing: ease }), withDelay(500, withSpring(1, SPRING))));
          tiltHead.set(withSequence(withTiming(-6, { duration: 700, easing: ease }), withDelay(500, withSpring(0, SPRING))));
          break;
        case 'stretch': {
          const back = { damping: 6, stiffness: 200 };
          squashY.set(withSequence(withTiming(1.15, { duration: 520, easing: ease }), withDelay(380, withSpring(1, back))));
          squashX.set(withSequence(withTiming(0.88, { duration: 520, easing: ease }), withDelay(380, withSpring(1, back))));
          for (const h of [handL, handR])
            h.set(withSequence(withSpring(1, SPRING), withDelay(700, withTiming(0, { duration: 260 }))));
          reach.set(withSequence(withTiming(1, { duration: 520, easing: ease }), withDelay(380, withTiming(0, { duration: 300 }))));
          for (const w of [waveL, waveR])
            w.set(withSequence(withTiming(12, { duration: 520 }), withDelay(380, withTiming(0, { duration: 300 }))));
          jump.set(withSequence(withTiming(0, { duration: 150 }), withDelay(750, hop(0.07, 140))));
          break;
        }
        case 'cheer': {
          jump.set(
            withSequence(
              withTiming(-S * 0.2, { duration: 220, easing: Easing.out(Easing.quad) }),
              withTiming(0, { duration: 200, easing: Easing.in(Easing.quad) }),
              withTiming(-S * 0.16, { duration: 200, easing: Easing.out(Easing.quad) }),
              withSpring(0, BOUNCE),
            ),
          );
          squish(420, 1.12, 0.88);
          sparkle(0);
          for (const h of [handL, handR])
            h.set(withSequence(withSpring(1, SPRING), withDelay(1700, withTiming(0, { duration: 300 }))));
          reach.set(withSequence(withTiming(0.85, { duration: 250 }), withDelay(1700, withTiming(0, { duration: 300 }))));
          // abwechselnd winken
          waveL.set(
            withSequence(
              withRepeat(withSequence(withTiming(22, { duration: 160 }), withTiming(-6, { duration: 160 })), 6),
              withTiming(0, { duration: 150 }),
            ),
          );
          waveR.set(
            withSequence(
              withRepeat(withSequence(withTiming(-6, { duration: 160 }), withTiming(22, { duration: 160 })), 6),
              withTiming(0, { duration: 150 }),
            ),
          );
          break;
        }
      }
    },
    [
      S,
      reduce,
      say,
      tiltHead,
      shake,
      surprise,
      yawn,
      squint,
      twirl,
      handL,
      handR,
      reach,
      waveL,
      waveR,
      burst,
      squashX,
      squashY,
      jump,
      dizzy,
      pop,
    ],
  );
  // für Zeitgeber und Effekte: immer die aktuelle Fassung (ohne sie bei jeder Änderung neu zu starten)
  const playRef = useRef(play);
  useEffect(() => {
    playRef.current = play;
  }, [play]);

  // Grundbewegung: schweben, atmen, blinzeln, leuchten, Antenne
  useEffect(() => {
    for (const v of [float, breathe, blink, glow, spin, sway]) cancelAnimation(v);
    if (!moving) {
      float.set(0);
      breathe.set(0);
      blink.set(1);
      sway.set(0);
      spin.set(0);
      glow.set(thinking ? 0.85 : sad ? 0.4 : 0.6);
      return;
    }
    const slow = sleepy ? 1.8 : sad ? 1.35 : 1;
    const d = S * 0.04;
    float.set(
      withRepeat(
        withSequence(
          withTiming(-d, { duration: 1700 * slow, easing: ease }),
          withTiming(d, { duration: 1700 * slow, easing: ease }),
        ),
        -1,
        true,
      ),
    );
    breathe.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1700 * slow, easing: ease }),
          withTiming(0, { duration: 1700 * slow, easing: ease }),
        ),
        -1,
        true,
      ),
    );
    sway.set(
      withRepeat(
        withSequence(withTiming(5, { duration: 1300, easing: ease }), withTiming(-5, { duration: 1300, easing: ease })),
        -1,
        true,
      ),
    );
    blink.set(
      sleepy
        ? 1
        : withRepeat(
            withSequence(
              withDelay(2400, withTiming(0.08, { duration: 70 })),
              withTiming(1, { duration: 120 }),
              withDelay(3100, withTiming(0.08, { duration: 70 })),
              withTiming(1, { duration: 100 }),
              withTiming(0.08, { duration: 70 }),
              withTiming(1, { duration: 120 }),
            ),
            -1,
          ),
    );
    if (thinking) {
      glow.set(
        withRepeat(withSequence(withTiming(1, { duration: 600 }), withTiming(0.6, { duration: 600 })), -1, true),
      );
      spin.set(0);
      spin.set(withRepeat(withTiming(360, { duration: 1400, easing: Easing.linear }), -1));
    } else {
      glow.set(
        withRepeat(
          withSequence(
            withTiming(sleepy ? 0.45 : 0.9, { duration: 2200, easing: ease }),
            withTiming(sleepy ? 0.3 : 0.5, { duration: 2200, easing: ease }),
          ),
          -1,
          true,
        ),
      );
    }
  }, [moving, thinking, sleepy, sad, S, float, breathe, blink, glow, spin, sway]);

  // Freude bei "happy" (z. B. nach dem Ausführen)
  useEffect(() => {
    if (!moving || mood !== 'happy') return;
    jump.set(
      withSequence(
        withTiming(-S * 0.14, { duration: 180, easing: Easing.out(Easing.quad) }),
        withSpring(0, BOUNCE),
      ),
    );
    burst.set(0);
    burst.set(withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [mood, moving, S, jump, burst]);

  // Jubel bei "celebrate": Freudensprünge, Hände hoch, Konfetti
  useEffect(() => {
    if (!moving || mood !== 'celebrate') return;
    const t = setTimeout(() => playRef.current('cheer'), 0);
    return () => clearTimeout(t);
  }, [mood, moving]);

  // Traurig: sinkt etwas ab, Antenne hängt
  useEffect(() => {
    droop.set(moving ? withTiming(sad ? 1 : 0, { duration: sad ? 650 : 350, easing: ease }) : sad ? 1 : 0);
  }, [sad, moving, droop]);

  // Zuhören: aufmerksam (große Augen)
  useEffect(() => {
    attentive.set(moving ? withSpring(listening ? 1 : 0, SPRING) : listening ? 1 : 0);
  }, [listening, moving, attentive]);

  // Sprechen: Mund geht auf und zu
  useEffect(() => {
    cancelAnimation(mouthOpen);
    if (!talking) {
      mouthOpen.set(moving ? withTiming(0, { duration: 160 }) : 0);
      return;
    }
    if (!moving) {
      mouthOpen.set(0.5);
      return;
    }
    mouthOpen.set(
      withRepeat(
        withSequence(
          withTiming(0.95, { duration: 110 }),
          withTiming(0.3, { duration: 90 }),
          withTiming(0.75, { duration: 120 }),
          withTiming(0.15, { duration: 140 }),
          withTiming(1, { duration: 100 }),
          withTiming(0.45, { duration: 110 }),
          withTiming(0.8, { duration: 90 }),
          withTiming(0.1, { duration: 180 }),
        ),
        -1,
      ),
    );
  }, [talking, moving, mouthOpen]);

  // Begrüßen beim Erscheinen (einmal)
  const greetOnce = useRef(greet);
  useEffect(() => {
    const how = greetOnce.current;
    if (!how || reduce || !animate) return;
    const t = setTimeout(() => playRef.current(how === true ? 'greet' : 'wave'), how === true ? 0 : how);
    return () => clearTimeout(t);
    // nur beim ersten Erscheinen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kleine Gesten von sich aus, wenn nichts los ist
  const idle = expressive && mood === 'idle' && !sleepy && !hovered;
  useEffect(() => {
    if (!idle) return;
    let first = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const next = () => {
      t = setTimeout(() => {
        if (!playing.current) playRef.current(pickIdleGesture(lastGesture.current));
        first = false;
        next();
      }, idleDelay(first));
    };
    next();
    return () => clearTimeout(t);
  }, [idle]);

  // Blick: der Maus folgen (Mac/Web), sonst ab und zu umherschauen
  useEffect(() => {
    if (!moving) {
      lookX.set(0);
      lookY.set(0);
      near.set(0);
      return;
    }
    if (thinking) {
      // nachdenklich nach oben schauen und hin und her
      lookY.set(withTiming(-0.6, { duration: 300 }));
      lookX.set(
        withRepeat(
          withSequence(
            withTiming(-0.7, { duration: 500, easing: ease }),
            withTiming(0.7, { duration: 1000, easing: ease }),
            withTiming(0, { duration: 500, easing: ease }),
          ),
          -1,
        ),
      );
      return () => {
        cancelAnimation(lookX);
        lookY.set(withSpring(0, SPRING));
      };
    }
    let frame = 0;
    let wanderTimer: ReturnType<typeof setTimeout> | undefined;
    let sleepTimer: ReturnType<typeof setTimeout> | undefined;

    const wander = () => {
      wanderTimer = setTimeout(
        () => {
          if (Date.now() - lastMove.current > 2500) {
            lookX.set(withSpring((Math.random() * 2 - 1) * 0.7, SPRING));
            lookY.set(withSpring((Math.random() * 2 - 1) * 0.4, SPRING));
          }
          wander();
        },
        2200 + Math.random() * 2600,
      );
    };
    wander();
    if (!tracking) return () => clearTimeout(wanderTimer);

    // müde: erst gähnen, dann einschlafen (in Ruhe und groß genug – sonst gleich)
    const scheduleSleep = () => {
      clearTimeout(sleepTimer);
      sleepTimer = setTimeout(() => {
        if (expressive && moodRef.current === 'idle' && !playing.current) {
          playRef.current('yawn');
          sleepTimer = setTimeout(() => sleep(true), GESTURE_MS.yawn - 300);
        } else {
          sleep(true);
        }
      }, SLEEP_MS);
    };
    const onMove = (e: PointerEvent) => {
      lastMove.current = Date.now();
      if (drowsyRef.current) {
        // aufwachen: strecken (Mini-Luna hüpft nur kurz)
        sleep(false);
        if (expressive) playRef.current('stretch');
        else
          jump.set(
            withSequence(withTiming(-S * 0.12, { duration: 140 }), withSpring(0, { damping: 8, stiffness: 240 })),
          );
      }
      scheduleSleep();
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const node = ref.current as unknown as { getBoundingClientRect?: () => DOMRect } | null;
        const rect = node?.getBoundingClientRect?.();
        if (!rect) return;
        const dx = e.clientX - (rect.left + rect.width / 2);
        const dy = e.clientY - (rect.top + rect.height / 2);
        const reachPx = Math.max(S * 2.2, 160);
        lookX.set(withSpring(clamp(dx / reachPx, -1, 1), SPRING));
        lookY.set(withSpring(clamp(dy / reachPx, -1, 1), SPRING));
        near.set(withSpring(clamp(1 - Math.hypot(dx, dy) / Math.max(S * 2.4, 180), 0, 1), SPRING));
      });
    };
    const onLeave = () => {
      lookX.set(withSpring(0, SPRING));
      lookY.set(withSpring(0, SPRING));
      near.set(withSpring(0, SPRING));
    };
    window.addEventListener('pointermove', onMove);
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    scheduleSleep();
    restartSleep.current = scheduleSleep;
    return () => {
      restartSleep.current = null;
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(wanderTimer);
      clearTimeout(sleepTimer);
    };
  }, [moving, tracking, thinking, expressive, S, lookX, lookY, near, jump, sleep]);

  // Handy kippen oder seitlich schieben: Luna rutscht bis an den Rand (Trägheit: beim Ruck nach
  // rechts rutscht sie nach links) und wird dort gegen die Kante gedrückt
  useEffect(() => {
    if (!tilting) {
      slide.set(withSpring(0, GLIDE));
      return;
    }
    let sub: { remove: () => void } | undefined;
    let alive = true;
    let smooth = 0;
    let last = 0;
    const measure = () =>
      ref.current?.measureInWindow((x, _y, w) => {
        if (!w) return;
        const screen = Dimensions.get('window').width;
        roomL.set(Math.max(0, x - EDGE_GAP));
        roomR.set(Math.max(0, screen - x - w - EDGE_GAP));
      });
    measure();
    Accelerometer.isAvailableAsync()
      .then((ok) => {
        if (!ok || !alive) return;
        Accelerometer.setUpdateInterval(50);
        sub = Accelerometer.addListener(({ x }) => {
          // iOS: rechte Kante nach unten = x positiv; Android meldet umgekehrt
          const raw = Platform.OS === 'ios' ? x : -x;
          // nur wenig glätten, damit auch ein kurzer Ruck zur Seite durchkommt
          smooth = smooth * 0.55 + raw * 0.45;
          // leichtes Schräghalten ignorieren, ab ~20° am Rand, stärker = fester dagegen gedrückt
          const dead = 0.05;
          const t = Math.abs(smooth) < dead ? 0 : clamp((smooth - Math.sign(smooth) * dead) / 0.28, -1.35, 1.35);
          if (Math.abs(t - last) < 0.02) return;
          if (last === 0 && t !== 0) measure();
          last = t;
          slide.set(withSpring(t, WALL));
          if (t !== 0) {
            // beim Gleiten schaut sie in Fahrtrichtung, statt umherzuschauen
            lastMove.current = Date.now();
            lookX.set(withSpring(clamp(t, -1, 1) * 0.8, SPRING));
            lookY.set(withSpring(Math.min(1, Math.abs(t)) * 0.15, SPRING));
          }
        });
      })
      .catch(() => {});
    return () => {
      alive = false;
      sub?.remove();
      slide.set(withSpring(0, GLIDE));
    };
  }, [tilting, slide, lookX, lookY, roomL, roomR]);

  useEffect(() => {
    const list = timers.current;
    const gestureT = gestureTimer;
    const speechT = speechTimer;
    return () => {
      list.forEach(clearTimeout);
      clearTimeout(gestureT.current);
      clearTimeout(speechT.current);
    };
  }, []);

  /** Stupser: zusammendrücken, hüpfen, Funken, kurz strahlen (+ Sprechblase) – doppelt = Pirouette, ganz oft = schwindelig */
  const boop = useCallback(() => {
    wake();
    const tap = nextTap(taps.current, Date.now());
    taps.current = tap.state;
    if (!reduce && playing.current !== 'dizzy') {
      if (tap.kind === 'dizzy') {
        play('dizzy', true);
        return;
      }
      if (tap.kind === 'twirl') {
        play('twirl', true);
        return;
      }
    }
    setBooped(true);
    say(REACTIONS[Math.floor(Math.random() * REACTIONS.length)], true);
    timers.current.push(setTimeout(() => setBooped(false), 1300));
    if (reduce) return;
    squashX.set(withSequence(withTiming(1.2, { duration: 90 }), withSpring(1, { damping: 5, stiffness: 260 })));
    squashY.set(withSequence(withTiming(0.8, { duration: 90 }), withSpring(1, { damping: 5, stiffness: 260 })));
    // schwindelig: nur kurz zusammendrücken, nicht hüpfen
    if (playing.current === 'dizzy') return;
    jump.set(
      withSequence(
        withDelay(90, withTiming(-S * 0.18, { duration: 200, easing: Easing.out(Easing.quad) })),
        withSpring(0, BOUNCE),
      ),
    );
    burst.set(0);
    burst.set(withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) }));
  }, [reduce, S, squashX, squashY, jump, burst, play, say, wake]);

  /** Gedrückt halten: kichert */
  const giggle = useCallback(() => {
    wake();
    play('giggle', true);
  }, [play, wake]);

  // --- Aussehen (Farbe, Hut, Accessoires) ---
  const design = useDesign();
  const pal = lunaPalette(color ?? design.accent);
  const detail = S >= 26; // Bäckchen, Antenne, Mund, Hut und Accessoires erst ab dieser Größe
  const chosen = look ?? design.luna;
  const wear = detail ? { ...chosen, hat: hatProp ?? chosen.hat } : DEFAULT_LUNA;
  const hat = wear.hat;
  const frame = hatFrame(hat, S);
  const hatTilt = frame.rotate;

  // --- Stile ---
  const bodyStyle = useAnimatedStyle(() => {
    const w = wall(slide.get(), roomL.get(), roomR.get(), S);
    const tilt =
      lookX.get() * (3 + near.get() * 6) +
      (mouthOpen.get() - 0.5) * (mouthOpen.get() > 0 ? 2 : 0) +
      w.roll * 12 + // rollt beim Gleiten ein Stück mit (an der Kante nicht mehr)
      tiltHead.get() +
      shake.get();
    const swell = 1 + voice.get() * 0.04 * attentive.get();
    return {
      transform: [
        { translateX: lookX.get() * S * 0.03 * (0.4 + near.get()) + w.x + shake.get() * S * 0.004 },
        { translateY: float.get() + jump.get() - mouthOpen.get() * S * 0.012 + droop.get() * S * 0.04 },
        { rotate: `${tilt}deg` },
        { scale: pop.get() },
        { scaleX: squashX.get() * (1 - breathe.get() * 0.012) * swell * w.sx },
        { scaleY: squashY.get() * (1 + breathe.get() * 0.022) * swell * w.sy * (1 - droop.get() * 0.03) },
      ],
    };
  });
  const shadowStyle = useAnimatedStyle(() => {
    const lift = (float.get() + jump.get() + droop.get() * S * 0.04) / (S * 0.2); // negativ = höher
    const w = wall(slide.get(), roomL.get(), roomR.get(), S);
    return {
      opacity: clamp(0.55 + lift * 0.9, 0.15, 0.75) * pop.get(),
      transform: [{ translateX: w.x }, { scaleX: clamp(1 + lift * 0.5, 0.55, 1.15) * w.sx * pop.get() }],
    };
  });
  const glowStyle = useAnimatedStyle(() => ({
    opacity: clamp(
      glow.get() + near.get() * 0.25 + voice.get() * 0.5 * attentive.get() + mouthOpen.get() * 0.2 - droop.get() * 0.2,
      0,
      1,
    ),
  }));
  // Gesicht: folgt dem Blick; bei der Pirouette wandert es um die Kugel herum (hinten unsichtbar)
  const faceStyle = useAnimatedStyle(() => {
    const a = twirl.get() * Math.PI * 2;
    const c = Math.cos(a);
    return {
      opacity: clamp(c * 3 + 0.4, 0, 1),
      transform: [
        { translateX: lookX.get() * S * 0.07 + Math.sin(a) * S * 0.36 },
        { translateY: lookY.get() * S * 0.05 + droop.get() * S * 0.025 },
        { scaleX: 0.35 + 0.65 * Math.abs(c) },
      ],
    };
  });
  const eyeStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scaleY:
          blink.get() *
          squint.get() *
          (sleepy ? 0.42 : 1 + near.get() * 0.08 + attentive.get() * 0.12 + surprise.get() * 0.24) *
          (1 - droop.get() * 0.12),
      },
      { scaleX: 1 + near.get() * 0.06 + attentive.get() * 0.06 + surprise.get() * 0.12 },
    ],
  }));
  const pupilStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: lookX.get() * S * 0.036 },
      { translateY: lookY.get() * S * 0.042 + droop.get() * S * 0.03 },
      { scale: (1 + near.get() * 0.12 + attentive.get() * 0.14) * (1 - surprise.get() * 0.25) },
    ],
  }));
  const antennaStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${sway.get() * (1 - droop.get() * 0.6) - lookX.get() * 14 + jump.get() * 0.6 + droop.get() * 32 - shake.get() * 1.5}deg`,
      },
    ],
  }));
  const orbitStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  // Hut wippt etwas mit und neigt sich zur Blickrichtung (bei der Pirouette dreht er sich mit)
  const hatStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${hatTilt + sway.get() * 0.35 - lookX.get() * 4 + jump.get() * 0.3}deg` },
      { scaleX: 0.7 + 0.3 * Math.abs(Math.cos(twirl.get() * Math.PI * 2)) },
    ],
  }));
  const tipStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale:
          1 +
          voice.get() * 0.8 * attentive.get() +
          attentive.get() * 0.12 +
          mouthOpen.get() * 0.15 +
          surprise.get() * 0.45 -
          droop.get() * 0.25,
      },
    ],
  }));

  // --- Maße ---
  const eyeW = S * 0.19;
  const eyeH = S * 0.23;
  const pupil = S * 0.105;
  const stroke = S >= 60 ? 1.6 : 1.2;
  const id = `nexy-${Math.round(S)}-${pal.accent.slice(1)}`;
  const mouthW = S * 0.15;
  const eyeGlow = `0 0 ${S * 0.09}px rgba(242,255,249,0.45)`;
  const lineW = S * 0.045;

  // --- Gesichtsausdruck ---
  const eyeKind = (i: number): 'open' | 'arc' | 'spiral' | 'squeeze' => {
    if (g === 'dizzy') return 'spiral';
    if (g === 'stretch') return 'squeeze';
    if (thinking || g === 'yawn') return 'open';
    if (g === 'wink' && i === 1) return 'arc';
    return happy ? 'arc' : 'open';
  };
  const mouthKind: MouthKind = sleepy
    ? 'line'
    : g === 'dizzy'
      ? 'wavy'
      : thinking || g === 'wow' || g === 'stretch'
        ? 'o'
        : happy || g === 'wave' || g === 'greet' || g === 'twirl' || g === 'wink'
          ? 'grin'
          : sad
            ? 'frown'
            : 'smile';
  const brows = g === 'wow' ? 'up' : sad && !happy && g !== 'dizzy' ? 'sad' : null;
  const rosy = happy || g === 'wink';

  const content = (
    <View ref={ref} style={{ width: S, height: S }} accessibilityRole="image" accessibilityLabel="Luna">
      {/* Schatten am Boden (nur große Figur) */}
      {S >= 80 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.shadow,
            {
              width: S * 0.62,
              height: S * 0.1,
              left: S * 0.19,
              top: S * 1.08,
              borderRadius: S,
              backgroundColor: pal.glow(0.22),
              boxShadow: `0 0 18px ${pal.glow(0.35)}`,
            },
            shadowStyle,
          ]}
        />
      )}
      {/* Zuhören: Schallringe, die der Stimme folgen */}
      {listening &&
        S >= 50 &&
        [0, 1].map((i) => (
          <SoundRing key={i} index={i} size={S} level={voice} breathe={breathe} color={pal.accent} />
        ))}
      <Animated.View style={[StyleSheet.absoluteFill, bodyStyle]}>
        {/* Antenne (unter den meisten Hüten nicht zu sehen) */}
        {detail && !hatHidesAntenna(hat) && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.antenna,
              { left: S / 2 - S * 0.02, top: -S * 0.15, width: S * 0.04, height: S * 0.2 },
              antennaStyle,
            ]}>
            <View style={[styles.stem, { width: S * 0.04, borderRadius: S * 0.02, backgroundColor: pal.accent }]} />
            <Animated.View
              style={[
                styles.tip,
                {
                  width: S * 0.11,
                  height: S * 0.11,
                  borderRadius: S * 0.055,
                  left: -S * 0.035,
                  top: -S * 0.06,
                  backgroundColor: pal.accent,
                  boxShadow: `0 0 ${S * 0.12}px ${pal.glow(0.9)}`,
                },
                tipStyle,
              ]}
            />
          </Animated.View>
        )}
        {/* Leuchten */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              borderRadius: S / 2,
              backgroundColor: pal.glow(0.08),
              boxShadow: `0 0 ${S * 0.45}px ${S * 0.08}px ${pal.glow(0.45)}`,
            },
            glowStyle,
          ]}
        />
        {/* Hände (nur beim Winken, Strecken, Jubeln zu sehen) */}
        {expressive &&
          (['left', 'right'] as const).map((side) => (
            <LunaHand
              key={side}
              side={side}
              size={S}
              show={side === 'left' ? handL : handR}
              wave={side === 'left' ? waveL : waveR}
              reach={reach}
              fill={pal.body[0]}
              line={pal.accent}
            />
          ))}
        {/* Körper */}
        <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id={`${id}-body`} cx="40%" cy="32%" r="75%">
              <Stop offset="0" stopColor={pal.body[0]} />
              <Stop offset="0.55" stopColor={pal.body[1]} />
              <Stop offset="1" stopColor={pal.body[2]} />
            </RadialGradient>
          </Defs>
          <Circle
            cx={S / 2}
            cy={S / 2}
            r={S / 2 - stroke}
            fill={`url(#${id}-body)`}
            stroke={pal.accent}
            strokeWidth={stroke}
            strokeOpacity={0.9}
          />
          <Ellipse cx={S * 0.3} cy={S * 0.2} rx={S * 0.1} ry={S * 0.045} fill="#FFFFFF" opacity={0.08} />
        </Svg>
        {/* Kleidung und Hals (Anzug, Fliege, Schal …) – bleiben am Körper, das Gesicht schaut darüber */}
        {(wear.outfit !== 'none' || wear.neck !== 'none') && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="luna-wear">
            <LunaBodyWearArt
              outfit={wear.outfit}
              neck={wear.neck}
              size={S}
              accent={pal.accent}
              inset={(150 * stroke) / S}
            />
          </View>
        )}
        {/* Gesicht */}
        <Animated.View style={[StyleSheet.absoluteFill, faceStyle]} pointerEvents="none">
          {/* Augenbrauen: traurig (innen hoch) oder staunend (weit oben) */}
          {detail && brows && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill} testID={`nexy-brows-${brows}`}>
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.brow,
                    {
                      width: S * 0.14,
                      height: Math.max(1.5, S * 0.03),
                      borderRadius: S,
                      top: brows === 'up' ? S * 0.15 : S * 0.215,
                      left: (i === 0 ? S * 0.35 : S * 0.65) - S * 0.07,
                      transform: [{ rotate: `${brows === 'up' ? (i === 0 ? -8 : 8) : i === 0 ? -18 : 18}deg` }],
                    },
                  ]}
                />
              ))}
            </View>
          )}
          <View style={[styles.eyes, { top: S * 0.3, gap: S * 0.11 }]}>
            {[0, 1].map((i) => {
              const kind = eyeKind(i);
              if (kind === 'arc')
                return (
                  <View
                    key={i}
                    testID={g === 'wink' && i === 1 && !happy ? 'nexy-wink' : i === 0 ? 'nexy-happy-eyes' : undefined}
                    style={{
                      width: eyeW * 1.05,
                      height: eyeH * 0.55,
                      marginTop: eyeH * 0.22,
                      borderTopLeftRadius: eyeW,
                      borderTopRightRadius: eyeW,
                      borderTopWidth: lineW,
                      borderLeftWidth: lineW,
                      borderRightWidth: lineW,
                      borderColor: EYE,
                    }}
                  />
                );
              if (kind === 'squeeze')
                return <SqueezeEye key={i} w={eyeW} h={eyeH} left={i === 0} line={lineW} test={i === 0} />;
              if (kind === 'spiral')
                return <SpiralEye key={i} w={eyeW} h={eyeH} spin={dizzy} glow={eyeGlow} s={S} test={i === 0} />;
              return (
                <Animated.View
                  key={i}
                  style={[styles.eye, { width: eyeW, height: eyeH, borderRadius: eyeW / 2, boxShadow: eyeGlow }, eyeStyle]}>
                  <Animated.View
                    testID={i === 0 ? 'nexy-pupil' : undefined}
                    style={[styles.pupil, { width: pupil, height: pupil * 1.15, borderRadius: pupil / 2 }, pupilStyle]}>
                    <View
                      style={[
                        styles.shine,
                        {
                          width: pupil * 0.38,
                          height: pupil * 0.38,
                          borderRadius: pupil,
                          top: pupil * 0.16,
                          left: pupil * 0.16,
                        },
                      ]}
                    />
                  </Animated.View>
                </Animated.View>
              );
            })}
          </View>
          {/* Träne (traurig) */}
          {sad && !happy && expressive && <Tear size={S} />}
          {detail && (
            <>
              {/* Bäckchen */}
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.cheek,
                    {
                      width: S * 0.14,
                      height: S * 0.075,
                      borderRadius: S * 0.05,
                      top: S * 0.55,
                      opacity: rosy ? 0.75 : sleepy ? 0.2 : sad ? 0.22 : 0.38,
                      boxShadow: `0 0 ${S * 0.05}px ${CHEEK}`,
                    },
                    i === 0 ? { left: S * 0.14 } : { right: S * 0.14 },
                  ]}
                />
              ))}
              {/* Mund */}
              <View
                style={[styles.mouth, { top: S * 0.6, left: S / 2 - mouthW / 2, width: mouthW, height: mouthW * 0.7 }]}>
                {talking ? (
                  <TalkMouth open={mouthOpen} w={mouthW} s={S} />
                ) : g === 'yawn' ? (
                  <TalkMouth open={yawn} w={mouthW} s={S} test="nexy-mouth-yawn" />
                ) : (
                  <Mouth kind={mouthKind} w={mouthW} s={S} />
                )}
              </View>
            </>
          )}
          {/* Brille – wandert mit dem Blick mit */}
          {wear.glasses !== 'none' && (
            <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="luna-glasses">
              <LunaGlassesArt glasses={wear.glasses} size={S} accent={pal.accent} />
            </View>
          )}
        </Animated.View>
        {/* Hut */}
        {hat !== 'none' && (
          <Animated.View
            pointerEvents="none"
            testID="luna-hat"
            style={[
              styles.hat,
              {
                width: frame.width,
                height: frame.height,
                left: frame.left,
                top: frame.top,
                transformOrigin: frame.origin,
              },
              hatStyle,
            ]}>
            <LunaHatArt hat={hat} width={frame.width} accent={pal.accent} />
          </Animated.View>
        )}
        {/* Schläfrig: Zzz steigen auf (Mini-Luna: ein kleines z) */}
        {sleepy &&
          (expressive ? (
            [0, 1, 2].map((i) => <SleepZ key={i} index={i} size={S} />)
          ) : S >= 26 ? (
            <Animated.Text
              entering={FadeIn.duration(600)}
              style={[styles.z, { right: -S * 0.05, top: -S * 0.08, fontSize: S * 0.16 }]}>
              z
            </Animated.Text>
          ) : null)}
      </Animated.View>
      {/* Nachdenken: kreisende Punkte */}
      {thinking && moving && (
        <Animated.View pointerEvents="none" style={[styles.orbit, { margin: -S * 0.18 }, orbitStyle]}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: pal.accent,
                  width: S * (0.11 - i * 0.025),
                  height: S * (0.11 - i * 0.025),
                  opacity: 1 - i * 0.3,
                  transform: [{ rotate: `${-i * 26}deg` }, { translateY: -S * 0.7 }],
                },
              ]}
            />
          ))}
        </Animated.View>
      )}
      {/* Schwindelig: Sternchen kreisen über dem Kopf */}
      {g === 'dizzy' && expressive && [0, 1, 2].map((i) => <DizzyStar key={i} index={i} size={S} spin={dizzy} />)}
      {/* Funken beim Freuen/Anstupsen */}
      {moving &&
        [0, 1, 2, 3, 4, 5].map((i) => <Sparkle key={i} index={i} size={S} burst={burst} color={pal.accent} />)}
      {/* Jubel: Konfetti */}
      {g === 'cheer' && expressive && <Confetti size={S} accent={pal.accent} />}
      {/* Sprechblase */}
      {speech && (
        <Animated.View
          entering={FadeIn.duration(180)}
          style={[styles.bubble, { left: S * 0.82, top: -S * 0.12, borderColor: pal.glow(0.4) }]}
          pointerEvents="none">
          <Text style={styles.bubbleText} numberOfLines={1}>
            {speech}
          </Text>
        </Animated.View>
      )}
    </View>
  );

  if (!interactive) return content;
  return (
    <Pressable
      onPress={boop}
      onLongPress={giggle}
      delayLongPress={450}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      accessibilityRole="button"
      accessibilityLabel="Luna anstupsen"
      style={styles.press}>
      {content}
    </Pressable>
  );
}

type MouthKind = 'smile' | 'grin' | 'o' | 'line' | 'frown' | 'wavy';

function Mouth({ kind, w, s }: { kind: MouthKind; w: number; s: number }) {
  const h = w * 0.7;
  const sw = Math.max(1.2, s * 0.028);
  return (
    <View testID={`nexy-mouth-${kind}`}>
      <Svg width={w} height={h}>
        {kind === 'smile' && (
          <Path
            d={`M ${w * 0.18} ${h * 0.25} Q ${w / 2} ${h * 0.75} ${w * 0.82} ${h * 0.25}`}
            stroke={EYE}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {kind === 'grin' && (
          <>
            <Path d={`M ${w * 0.1} ${h * 0.18} Q ${w / 2} ${h * 1.15} ${w * 0.9} ${h * 0.18} Z`} fill={EYE} />
            <Ellipse cx={w / 2} cy={h * 0.55} rx={w * 0.17} ry={h * 0.13} fill={CHEEK} opacity={0.9} />
          </>
        )}
        {kind === 'o' && (
          <Ellipse cx={w / 2} cy={h * 0.45} rx={w * 0.16} ry={h * 0.2} stroke={EYE} strokeWidth={sw} fill="none" />
        )}
        {kind === 'line' && (
          <Path
            d={`M ${w * 0.3} ${h * 0.4} L ${w * 0.7} ${h * 0.4}`}
            stroke={EYE}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        )}
        {kind === 'frown' && (
          <Path
            d={`M ${w * 0.22} ${h * 0.66} Q ${w / 2} ${h * 0.18} ${w * 0.78} ${h * 0.66}`}
            stroke={EYE}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {kind === 'wavy' && (
          <Path
            d={`M ${w * 0.1} ${h * 0.45} Q ${w * 0.25} ${h * 0.18} ${w * 0.4} ${h * 0.45} Q ${w * 0.55} ${h * 0.72} ${w * 0.7} ${h * 0.45} Q ${w * 0.82} ${h * 0.24} ${w * 0.92} ${h * 0.42}`}
            stroke={EYE}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Svg>
    </View>
  );
}

/** Offener Mund beim Sprechen (und Gähnen) – geht im Takt auf und zu */
function TalkMouth({ open, w, s, test = 'nexy-mouth-talk' }: { open: SharedValue<number>; w: number; s: number; test?: string }) {
  const sw = Math.max(1, s * 0.022);
  // offener Mund ist größer als das Lächeln, damit man ihn auch bei kleiner Figur sieht
  const mw = w * 1.1;
  const mh = w * 0.92;
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleY: 0.16 + open.get() * 0.84 }, { scaleX: 1 - open.get() * 0.14 }],
  }));
  return (
    <View testID={test} style={{ width: w, height: w * 0.7, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[styles.talkMouth, { width: mw, height: mh, borderRadius: mw / 2, borderWidth: sw }, style]}>
        <View
          style={[
            styles.tongue,
            { width: mw * 0.62, height: mh * 0.42, borderTopLeftRadius: mw, borderTopRightRadius: mw },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/** Zugekniffenes Auge beim Strecken: > < */
function SqueezeEye({ w, h, left, line, test }: { w: number; h: number; left: boolean; line: number; test: boolean }) {
  const a = left ? 0.28 : 0.72;
  const b = left ? 0.72 : 0.28;
  return (
    <View testID={test ? 'nexy-squeeze-eyes' : undefined} style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        <Path
          d={`M ${w * a} ${h * 0.26} L ${w * b} ${h * 0.5} L ${w * a} ${h * 0.74}`}
          stroke={EYE}
          strokeWidth={line}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </View>
  );
}

/** Spiralauge beim Schwindeligsein – die Spirale dreht sich */
function SpiralEye({
  w,
  h,
  spin,
  glow,
  s,
  test,
}: {
  w: number;
  h: number;
  spin: SharedValue<number>;
  glow: string;
  s: number;
  test: boolean;
}) {
  const d = useMemo(() => spiralPath(w / 2, w * 0.4), [w]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.get()}deg` }] }));
  return (
    <View
      testID={test ? 'nexy-spiral-eyes' : undefined}
      style={[styles.eye, { width: w, height: h, borderRadius: w / 2, boxShadow: glow }]}>
      <Animated.View style={[{ width: w, height: w }, style]}>
        <Svg width={w} height={w}>
          <Path d={d} stroke={PUPIL} strokeWidth={Math.max(1.1, s * 0.022)} strokeLinecap="round" fill="none" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/** Spirale um (c, c) bis zum Radius r */
function spiralPath(c: number, r: number) {
  const turns = 2.25;
  const steps = 48;
  const end = turns * Math.PI * 2;
  const parts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * end;
    const rad = (r * a) / end;
    parts.push(`${i === 0 ? 'M' : 'L'} ${(c + Math.cos(a) * rad).toFixed(2)} ${(c + Math.sin(a) * rad).toFixed(2)}`);
  }
  return parts.join(' ');
}

/** Kleine schwebende Hand (wie ein Fäustling) – winkt, streckt sich, jubelt */
function LunaHand({
  side,
  size: S,
  show,
  wave,
  reach,
  fill,
  line,
}: {
  side: 'left' | 'right';
  size: number;
  show: SharedValue<number>;
  wave: SharedValue<number>;
  reach: SharedValue<number>;
  fill: string;
  line: string;
}) {
  const dir = side === 'right' ? 1 : -1;
  const h = S * 0.24;
  const style = useAnimatedStyle(() => {
    const s = show.get();
    return {
      opacity: clamp(s * 1.6, 0, 1),
      transform: [
        { translateX: dir * (reach.get() * S * 0.04 - (1 - s) * S * 0.12) },
        { translateY: (1 - s) * S * 0.16 - reach.get() * S * 0.42 },
        { rotate: `${dir * (wave.get() + reach.get() * 14)}deg` },
        { scale: 0.4 + 0.6 * s },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      testID={`nexy-hand-${side}`}
      style={[
        styles.hand,
        { width: h, height: h, top: S * 0.27 },
        side === 'right' ? { left: S * 0.87 } : { right: S * 0.87 },
        style,
      ]}>
      <View style={side === 'left' ? styles.mirror : undefined}>
        <Svg width={h} height={h} viewBox="0 0 100 100">
          {/* Daumen */}
          <Path d="M34.4 54 A12 16 -30 1 0 13.6 66 A12 16 -30 1 0 34.4 54 Z" fill={fill} stroke={line} strokeWidth={6} />
          {/* Hand */}
          <Ellipse cx={55} cy={50} rx={30} ry={36} fill={fill} stroke={line} strokeWidth={6} />
          <Path d="M47 20 Q48 28 48 36 M63 20 Q62 28 62 36" stroke={line} strokeWidth={4} strokeLinecap="round" opacity={0.55} fill="none" />
        </Svg>
      </View>
    </Animated.View>
  );
}

/** Ein „z“, das beim Schlafen aufsteigt und verblasst (drei nacheinander) */
function SleepZ({ index, size: S }: { index: number; size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(index * 900, withRepeat(withTiming(1, { duration: 2700, easing: Easing.out(Easing.quad) }), -1)));
    return () => cancelAnimation(t);
  }, [index, t]);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v < 0.2 ? v / 0.2 : clamp((1 - v) / 0.5, 0, 1),
      transform: [
        { translateX: Math.sin(v * Math.PI * 2) * S * 0.04 + v * S * 0.14 },
        { translateY: -v * S * 0.42 },
        { scale: 0.6 + v * 0.8 },
      ],
    };
  });
  return (
    <Animated.Text
      testID={index === 0 ? 'nexy-sleep-z' : undefined}
      style={[styles.z, { right: -S * 0.02, top: -S * 0.02, fontSize: S * 0.14 }, style]}>
      z
    </Animated.Text>
  );
}

/** Träne, die ab und zu aus dem linken Auge kullert */
function Tear({ size: S }: { size: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(
      withDelay(
        500,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1400, easing: Easing.in(Easing.quad) }),
            withDelay(1600, withTiming(0, { duration: 0 })),
          ),
          -1,
        ),
      ),
    );
    return () => cancelAnimation(t);
  }, [t]);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    return {
      opacity: v <= 0 ? 0 : v < 0.15 ? v / 0.15 : clamp((1 - v) / 0.3, 0, 1),
      transform: [{ translateY: v * S * 0.2 }, { rotate: '45deg' }, { scale: 0.6 + v * 0.5 }],
    };
  });
  const d = S * 0.065;
  return (
    <Animated.View
      pointerEvents="none"
      testID="nexy-tear"
      style={[
        styles.tear,
        { width: d, height: d, borderRadius: d / 2, borderTopLeftRadius: 0, left: S * 0.27, top: S * 0.5 },
        style,
      ]}
    />
  );
}

/** Sternchen, das beim Schwindeligsein um den Kopf kreist */
function DizzyStar({ index, size: S, spin }: { index: number; size: number; spin: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const a = (spin.get() * Math.PI) / 180 + (index * Math.PI * 2) / 3;
    const front = Math.sin(a);
    return {
      opacity: 0.55 + front * 0.45,
      transform: [
        { translateX: Math.cos(a) * S * 0.36 },
        { translateY: front * S * 0.07 },
        { scale: 0.75 + front * 0.25 },
      ],
    };
  });
  const d = S * 0.16;
  return (
    <Animated.Text
      pointerEvents="none"
      testID={index === 0 ? 'nexy-dizzy-stars' : undefined}
      style={[styles.star, { width: d, fontSize: d, lineHeight: d * 1.15, left: S / 2 - d / 2, top: -S * 0.16 }, style]}>
      ✦
    </Animated.Text>
  );
}

/** Konfetti beim Jubeln: fliegt nach oben auf und segelt flatternd herunter */
function Confetti({ size: S, accent }: { size: number; accent: string }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(1, { duration: 2200, easing: Easing.linear }));
    return () => cancelAnimation(t);
  }, [t]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="nexy-confetti">
      {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
        <ConfettiBit key={i} index={i} size={S} t={t} color={i % 4 === 0 ? accent : CONFETTI[i % CONFETTI.length]} />
      ))}
    </View>
  );
}

function ConfettiBit({ index: i, size: S, t, color }: { index: number; size: number; t: SharedValue<number>; color: string }) {
  // feste „Zufallswerte“ je Stück, damit es bei jedem Rendern gleich aussieht
  const r1 = ((i * 37) % 17) / 17;
  const r2 = ((i * 53) % 13) / 13;
  const spread = (i / (CONFETTI_PIECES - 1) - 0.5) * 2.3 + (r1 - 0.5) * 0.35; // Winkel zur Senkrechten
  const range = S * (0.85 + r2 * 0.6);
  const dx = Math.sin(spread) * range;
  const up = Math.cos(spread) * range * 0.9 + S * 0.25;
  const fall = S * (0.7 + r1 * 0.5);
  const spinDir = i % 2 ? 1 : -1;
  const flutter = 4 + r2 * 3;
  const w = S * (0.045 + r1 * 0.02);
  const h = S * (0.07 + r2 * 0.035);
  const style = useAnimatedStyle(() => {
    const v = t.get();
    // schnell hoch (abbremsen), dann langsam und hin und her schaukelnd herunter
    const rise = Math.min(1, v / 0.28);
    const out = 1 - (1 - rise) * (1 - rise);
    const down = Math.max(0, (v - 0.28) / 0.72);
    return {
      opacity: v >= 1 ? 0 : v > 0.72 ? (1 - v) / 0.28 : 1,
      transform: [
        { translateX: dx * out + dx * 0.25 * down + Math.sin(down * Math.PI * 3 + i) * S * 0.07 * down },
        { translateY: -up * out + fall * down * down + up * 0.15 * down },
        { rotate: `${spinDir * v * 620 + i * 40}deg` },
        { scaleY: Math.cos(v * Math.PI * flutter + i) },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.confetti,
        {
          width: w,
          height: h,
          left: S / 2 - w / 2,
          top: S * 0.38 - h / 2,
          backgroundColor: color,
          borderRadius: i % 5 === 0 ? w : 1.5,
        },
        style,
      ]}
    />
  );
}

/** Ring um Luna beim Zuhören – wird mit der Stimme größer und heller */
function SoundRing({
  index,
  size: S,
  level,
  breathe,
  color,
}: {
  index: number;
  size: number;
  level: SharedValue<number>;
  breathe: SharedValue<number>;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const l = level.get();
    return {
      opacity: clamp(0.16 + l * 0.85 - index * 0.07, 0, 0.85),
      // höchstens ~1,4-fach, damit die Ringe nichts in der Nähe überdecken
      transform: [{ scale: 1.06 + index * 0.12 + breathe.get() * 0.02 + l * (0.14 + index * 0.08) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      testID={index === 0 ? 'nexy-sound-ring' : undefined}
      style={[
        styles.ring,
        { width: S, height: S, borderRadius: S / 2, borderWidth: Math.max(1.5, S * 0.018), borderColor: color },
        style,
      ]}
    />
  );
}

/** Ein Funke, der beim Freuen/Anstupsen nach außen fliegt */
function Sparkle({
  index,
  size: S,
  burst,
  color,
}: {
  index: number;
  size: number;
  burst: SharedValue<number>;
  color: string;
}) {
  const angle = (index / 6) * Math.PI * 2 - Math.PI / 2 + (index % 2 ? 0.25 : -0.1);
  const dist = S * (index % 2 ? 0.78 : 0.68);
  const style = useAnimatedStyle(() => {
    const b = burst.get();
    return {
      opacity: b >= 1 ? 0 : 1 - b,
      transform: [
        { translateX: Math.cos(angle) * dist * b },
        { translateY: Math.sin(angle) * dist * b },
        { rotate: '45deg' },
        { scale: 0.4 + (1 - b) * 0.8 },
      ],
    };
  });
  const d = S * (index % 2 ? 0.06 : 0.08);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sparkle,
        {
          width: d,
          height: d,
          left: S / 2 - d / 2,
          top: S / 2 - d / 2,
          backgroundColor: index % 3 === 0 ? CHEEK : color,
        },
        style,
      ]}
    />
  );
}

/** Mini-Luna als Symbol (z. B. in der Seitenleiste) – passt zu den übrigen Symbolen. */
export function NexyGlyph({
  size = 18,
  color = Colors.text,
  strokeWidth = 1.8,
}: {
  size?: number;
  color?: string;
  strokeWidth?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 2.6 L12 4.4" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Circle cx={12} cy={2.2} r={1.3} fill={color} />
      <Circle cx={12} cy={13} r={8.6} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <Ellipse cx={9.2} cy={12} rx={1.5} ry={1.9} fill={color} />
      <Ellipse cx={14.8} cy={12} rx={1.5} ry={1.9} fill={color} />
      <Path
        d="M10.4 15.6 Q12 16.9 13.6 15.6"
        stroke={color}
        strokeWidth={strokeWidth * 0.8}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  press: { alignSelf: 'center' },
  shadow: { position: 'absolute' },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  antenna: { position: 'absolute', transformOrigin: 'bottom' },
  stem: { flex: 1, opacity: 0.85 },
  tip: { position: 'absolute' },
  hat: { position: 'absolute' },
  hand: { position: 'absolute', transformOrigin: 'bottom' },
  mirror: { transform: [{ scaleX: -1 }] },
  eyes: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  eye: { backgroundColor: EYE, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  pupil: { backgroundColor: PUPIL },
  shine: { position: 'absolute', backgroundColor: '#FFFFFF' },
  brow: { position: 'absolute', backgroundColor: EYE, opacity: 0.85 },
  cheek: { position: 'absolute', backgroundColor: CHEEK },
  mouth: { position: 'absolute', alignItems: 'center' },
  tear: { position: 'absolute', backgroundColor: TEAR, opacity: 0.9 },
  z: { position: 'absolute', color: Colors.textMuted, fontWeight: '700' },
  star: { position: 'absolute', color: STAR, textAlign: 'center' },
  orbit: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', borderRadius: 999 },
  sparkle: { position: 'absolute', borderRadius: 2 },
  confetti: { position: 'absolute' },
  talkMouth: {
    backgroundColor: '#06140F',
    borderColor: EYE,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tongue: { backgroundColor: CHEEK, opacity: 0.9 },
  ring: { position: 'absolute', top: 0, left: 0 },
  bubble: {
    position: 'absolute',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
  },
  bubbleText: { color: Colors.text, fontSize: 13.5, fontWeight: '600' },
});
