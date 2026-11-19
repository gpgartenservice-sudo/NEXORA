import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import type { IconKey } from './design-logic';

/**
 * Gezeichnete Motive für die Design-Hintergründe (statt Emojis): Geldschein mit
 * Vorder- und Rückseite, Blätter, Konfetti, Rakete mit Flamme, Feuer, Herzen,
 * Diamanten und Funkeln. Nur Zeichnungen – bewegt werden sie in backgrounds.tsx.
 *
 * Verlaufs-IDs sind feste Namen: im Web teilen sich alle SVGs einer Seite die IDs,
 * gleiche Namen haben deshalb immer genau dieselbe Definition.
 */

// ——— Geldschein ———

/** Höhe : Breite wie bei einem echten Schein (156 × 66 mm) */
export const NOTE_RATIO = 66 / 156;

function wave(y: number, amp: number, periods: number, phase: number, x0 = 7, x1 = 149) {
  const steps = 56;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const yy = y + Math.sin((i / steps) * Math.PI * 2 * periods + phase) * amp;
    d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${yy.toFixed(2)}`;
  }
  return d;
}

function rosette(cx: number, cy: number, r1: number, r2: number, n: number) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? r2 : r1;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  }
  return d + 'Z';
}

const GUILLOCHE = [
  wave(12.5, 2.6, 11, 0),
  wave(16, 2.6, 11, Math.PI),
  wave(50, 2.6, 11, 0.7),
  wave(53.5, 2.6, 11, Math.PI + 0.7),
];
const ROSETTE_A = rosette(32, 33, 12.5, 7, 14);
const ROSETTE_B = rosette(32, 33, 8.5, 4.5, 10);

const INK = '#2E5A36';
const INK_SOFT = '#4F7F52';
const LINE = '#6E9F6C';

function NoteFrame({ back }: { back?: boolean }) {
  return (
    <>
      <Defs>
        <LinearGradient id={back ? 'lx-note-paper-b' : 'lx-note-paper'} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={back ? '#D2E6C6' : '#E2EFD8'} />
          <Stop offset="0.5" stopColor={back ? '#9CC690' : '#A9CF9C'} />
          <Stop offset="1" stopColor={back ? '#BEDAAE' : '#CFE5C2'} />
        </LinearGradient>
      </Defs>
      <Rect x="0.5" y="0.5" width="155" height="65" rx="3" fill={`url(#${back ? 'lx-note-paper-b' : 'lx-note-paper'})`} stroke="#5E8F5F" strokeWidth="1" />
      {GUILLOCHE.map((d, i) => (
        <Path key={i} d={d} stroke={LINE} strokeWidth="0.55" fill="none" opacity={0.75} />
      ))}
      <Rect x="4" y="4" width="148" height="58" rx="2" fill="none" stroke={INK} strokeWidth="1.5" />
      <Rect x="6.5" y="6.5" width="143" height="53" rx="1.5" fill="none" stroke={INK_SOFT} strokeWidth="0.6" strokeDasharray="1.6 1" />
      {/* Ecken-Zahlen */}
      {[
        [16, 15],
        [140, 15],
        [16, 57],
        [140, 57],
      ].map(([x, y], i) => (
        <SvgText fontFamily="Georgia" key={i} x={x} y={y} fontSize="7.5" fontWeight="900" fill={INK} textAnchor="middle">
          100
        </SvgText>
      ))}
    </>
  );
}

/** Vorderseite: Rosette, Porträt im Oval, große 100, rote Seriennummer */
export function BanknoteFront({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * NOTE_RATIO} viewBox="0 0 156 66">
      <NoteFrame />
      <Defs>
        <RadialGradient id="lx-note-oval" cx="50%" cy="42%" r="62%">
          <Stop offset="0" stopColor="#EEF6E7" />
          <Stop offset="1" stopColor="#8DBB83" />
        </RadialGradient>
      </Defs>
      <Path d={ROSETTE_A} fill="#B9D9AC" stroke={INK_SOFT} strokeWidth="0.7" />
      <Path d={ROSETTE_B} fill="#8DBB83" stroke={INK} strokeWidth="0.6" />
      <Circle cx="32" cy="33" r="2.6" fill={INK} />
      <Ellipse cx="78" cy="33" rx="18.5" ry="23.5" fill="url(#lx-note-oval)" stroke={INK} strokeWidth="1.5" />
      <Ellipse cx="78" cy="33" rx="15.8" ry="20.8" fill="none" stroke={INK_SOFT} strokeWidth="0.5" />
      {/* Porträt */}
      <Path d="M66 51.5 C67 41.5 72 38 78 38 C84 38 89 41.5 90 51.5 C86 54 70 54 66 51.5 Z" fill={INK_SOFT} />
      <Ellipse cx="78" cy="27.5" rx="6.6" ry="8.2" fill={INK_SOFT} />
      <Path d="M71.6 25 C72.5 18.5 83.5 18.5 84.4 25 C82 21.8 74 21.8 71.6 25 Z" fill={INK} />
      <Path d="M74.6 37.2 L78 41 L81.4 37.2" stroke="#EEF6E7" strokeWidth="0.9" fill="none" />
      <SvgText fontFamily="Georgia" x="122" y="41" fontSize="19" fontWeight="900" fill={INK} textAnchor="middle" letterSpacing="-0.4">
        100
      </SvgText>
      <SvgText fontFamily="Georgia" x="122" y="22.5" fontSize="4.6" fontWeight="700" fill="#A8413F" textAnchor="middle" letterSpacing="0.4">
        LX 02027001
      </SvgText>
      <SvgText fontFamily="Georgia" x="122" y="50" fontSize="4.2" fontWeight="700" fill={INK_SOFT} textAnchor="middle" letterSpacing="1.2">
        HUNDERT
      </SvgText>
      {/* Glanz */}
      <Path d="M44 0 L62 0 L36 66 L18 66 Z" fill="#FFFFFF" opacity={0.13} />
    </Svg>
  );
}

/** Rückseite: Gebäude mit Säulen, zwei große 100 */
export function BanknoteBack({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * NOTE_RATIO} viewBox="0 0 156 66">
      <NoteFrame back />
      <Ellipse cx="78" cy="34" rx="30" ry="20" fill="#B9D9AC" stroke={INK_SOFT} strokeWidth="0.7" />
      <Path d="M55 26 L78 15.5 L101 26 Z" fill={INK_SOFT} />
      <Rect x="54" y="26" width="48" height="3" fill={INK} />
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Rect key={i} x={57.6 + i * 7.6} y="30" width="3.4" height="15" fill={INK_SOFT} />
      ))}
      <Rect x="53" y="45" width="50" height="2.8" fill={INK} />
      <Rect x="50.5" y="47.8" width="55" height="2.4" fill={INK_SOFT} />
      <SvgText fontFamily="Georgia" x="28" y="40" fontSize="15" fontWeight="900" fill={INK} textAnchor="middle">
        100
      </SvgText>
      <SvgText fontFamily="Georgia" x="128" y="40" fontSize="15" fontWeight="900" fill={INK} textAnchor="middle">
        100
      </SvgText>
      <Path d="M100 0 L118 0 L92 66 L74 66 Z" fill="#FFFFFF" opacity={0.1} />
    </Svg>
  );
}

// ——— Blatt ———

export const LEAF_COLORS: [string, string, string][] = [
  ['#B8E06A', '#4E9A2E', '#2F6B1C'],
  ['#FFE27A', '#E0A019', '#8A5A0B'],
  ['#FFB067', '#E2581C', '#8C2F0B'],
  ['#E86A4A', '#B3261E', '#6E140F'],
];

export const LEAF_RATIO = 64 / 40;

export function Leaf({ width, variant = 0 }: { width: number; variant?: number }) {
  const v = ((variant % LEAF_COLORS.length) + LEAF_COLORS.length) % LEAF_COLORS.length;
  const [light, mid, dark] = LEAF_COLORS[v];
  const id = `lx-leaf-${v}`;
  return (
    <Svg width={width} height={width * LEAF_RATIO} viewBox="0 0 40 64">
      <Defs>
        <LinearGradient id={id} x1="0.1" y1="0" x2="0.9" y2="1">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.6" stopColor={mid} />
          <Stop offset="1" stopColor={dark} />
        </LinearGradient>
      </Defs>
      <Path d="M20 1 C33 9 38.5 24 33.5 40 C30.5 49 25 54 21 57.5 C16 54 9 48 6.8 39 C3 23 9 9 20 1 Z" fill={`url(#${id})`} stroke={dark} strokeWidth="0.8" />
      <Path d="M20 4 C21.2 20 21.2 40 21 57.5" stroke={dark} strokeWidth="1.3" fill="none" strokeLinecap="round" />
      <Path
        d="M20.6 16 L29 10.5 M20.9 24 L32.4 17.5 M21 32 L33 26 M21 40 L30.5 36 M21 48 L27 45.5 M20.6 16 L12 11 M20.9 24 L8.6 18.5 M21 32 L8 27.5 M21 40 L10.5 37 M21 48 L14.5 46"
        stroke={dark}
        strokeWidth="0.7"
        opacity={0.65}
        strokeLinecap="round"
      />
      <Path d="M21 57 C21.3 59.5 22.2 61.5 23.8 63" stroke={dark} strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <Path d="M12 14 C14 9 17 5.5 20 3.5 C17.5 8 15.5 12 14.5 18 Z" fill="#FFFFFF" opacity={0.22} />
    </Svg>
  );
}

// ——— Konfetti ———

export const CONFETTI_COLORS = ['#2FE39A', '#FFD34D', '#FF6B9A', '#5AA9FF', '#B57BFF', '#FFFFFF', '#FF8A3D'];

/** Geringelte Papierschlange (die übrigen Konfetti-Stücke sind einfache Flächen) */
export function ConfettiCurl({ height, color }: { height: number; color: string }) {
  return (
    <Svg width={height * 0.32} height={height} viewBox="0 0 13 40">
      <Path d="M6.5 1.5 C12 6 1 11 6.5 15.5 C12 20 1 25 6.5 29.5 C12 34 1 38 6.5 39" stroke={color} strokeWidth="3" strokeLinecap="round" fill="none" />
    </Svg>
  );
}

// ——— Rakete ———

export const ROCKET_RATIO = 74 / 40;

export function Rocket({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * ROCKET_RATIO} viewBox="0 0 40 74">
      <Defs>
        <LinearGradient id="lx-rk-body" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#8D99AB" />
          <Stop offset="0.38" stopColor="#FFFFFF" />
          <Stop offset="0.7" stopColor="#D2DAE5" />
          <Stop offset="1" stopColor="#77839A" />
        </LinearGradient>
        <LinearGradient id="lx-rk-red" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#A81B33" />
          <Stop offset="0.4" stopColor="#FF5C70" />
          <Stop offset="1" stopColor="#B01D36" />
        </LinearGradient>
        <RadialGradient id="lx-rk-glass" cx="40%" cy="35%" r="70%">
          <Stop offset="0" stopColor="#B8ECFF" />
          <Stop offset="0.55" stopColor="#3A9BE0" />
          <Stop offset="1" stopColor="#14477E" />
        </RadialGradient>
      </Defs>
      {/* Flossen hinter dem Rumpf */}
      <Path d="M9.5 44 C3.5 49 1 57 1.6 67 L10.5 60 Z" fill="url(#lx-rk-red)" />
      <Path d="M30.5 44 C36.5 49 39 57 38.4 67 L29.5 60 Z" fill="url(#lx-rk-red)" />
      <Path d="M20 2 C30 12 33 28 32 47 L31 62 L9 62 L8 47 C7 28 10 12 20 2 Z" fill="url(#lx-rk-body)" />
      <Path d="M20 2 C25.6 7.6 29.2 14.5 30.8 22 L9.2 22 C10.8 14.5 14.4 7.6 20 2 Z" fill="url(#lx-rk-red)" />
      <Rect x="8.2" y="50" width="23.6" height="3.4" fill="url(#lx-rk-red)" />
      <Circle cx="20" cy="34" r="7" fill="#2B3A55" />
      <Circle cx="20" cy="34" r="5.2" fill="url(#lx-rk-glass)" />
      <Ellipse cx="18" cy="31.8" rx="2" ry="1.3" fill="#FFFFFF" opacity={0.85} />
      <Path d="M20 52 L20 67" stroke="#9E1A30" strokeWidth="2.6" strokeLinecap="round" />
      <Path d="M13 62 L27 62 L25 68 L15 68 Z" fill="#4A5566" />
    </Svg>
  );
}

/** Flamme, Spitze nach unten (unter der Rakete) */
export function RocketFlame({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * 2} viewBox="0 0 20 40">
      <Defs>
        <LinearGradient id="lx-rk-fire" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFF6C8" />
          <Stop offset="0.3" stopColor="#FFC23D" />
          <Stop offset="0.7" stopColor="#FF5A1F" />
          <Stop offset="1" stopColor="#FF3D00" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d="M2 0 L18 0 C19 12 15 24 10 40 C5 24 1 12 2 0 Z" fill="url(#lx-rk-fire)" />
      <Path d="M6 0 L14 0 C14.5 7 12.5 13 10 20 C7.5 13 5.5 7 6 0 Z" fill="#FFFFFF" opacity={0.85} />
    </Svg>
  );
}

/** Rauchfahne hinter der Rakete */
export function SmokeTrail({ width, height }: { width: number; height: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 10 100" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id="lx-rk-smoke" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Path d="M3.5 0 L6.5 0 L10 100 L0 100 Z" fill="url(#lx-rk-smoke)" />
    </Svg>
  );
}

// ——— Feuer ———

export const FLAME_RATIO = 100 / 60;

export function Flame({ width }: { width: number }) {
  return (
    <Svg width={width} height={width * FLAME_RATIO} viewBox="0 0 60 100">
      <Defs>
        <LinearGradient id="lx-flame-out" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#FFC94A" />
          <Stop offset="0.3" stopColor="#FFB52E" />
          <Stop offset="0.68" stopColor="#FF5A1A" />
          <Stop offset="1" stopColor="#E02A0E" stopOpacity="0.15" />
        </LinearGradient>
        <LinearGradient id="lx-flame-in" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#FFE45E" />
          <Stop offset="0.5" stopColor="#FFC23D" />
          <Stop offset="1" stopColor="#FF9A2E" stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      <Path
        d="M30 1 C34 19 52 31 54.5 57 C56.5 81 44.5 99 30 99 C15.5 99 3.5 85 5.5 62 C6.8 47.5 14 39 18.5 29 C20 39.5 23.5 44.5 27 45 C23.5 31 25.5 15 30 1 Z"
        fill="url(#lx-flame-out)"
      />
      <Path d="M31 42 C36.5 53 44 61 43 75 C42 89 37 97 30 97 C23 97 17.5 89 17 77 C16.5 65 26.5 57 31 42 Z" fill="url(#lx-flame-in)" />
    </Svg>
  );
}

// ——— Herz ———

export const HEART_COLORS: [string, string, string][] = [
  ['#C8FFE4', '#2FE39A', '#0B8F5B'],
  ['#D6FFF4', '#3FE0C0', '#0A8B7A'],
  ['#E8FFC4', '#8EE04E', '#3F8A1C'],
];

export const HEART_RATIO = 44 / 48;

export function Heart({ width, variant = 0 }: { width: number; variant?: number }) {
  const v = ((variant % HEART_COLORS.length) + HEART_COLORS.length) % HEART_COLORS.length;
  const [light, mid, dark] = HEART_COLORS[v];
  const id = `lx-heart-${v}`;
  return (
    <Svg width={width} height={width * HEART_RATIO} viewBox="0 0 48 44">
      <Defs>
        <RadialGradient id={id} cx="36%" cy="30%" r="78%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.45" stopColor={mid} />
          <Stop offset="1" stopColor={dark} />
        </RadialGradient>
      </Defs>
      <Path
        d="M24 42 C24 42 3 29 3 14.5 C3 7.5 8.5 2 15.2 2 C19.2 2 22.4 4 24 7 C25.6 4 28.8 2 32.8 2 C39.5 2 45 7.5 45 14.5 C45 29 24 42 24 42 Z"
        fill={`url(#${id})`}
        stroke={dark}
        strokeWidth="0.8"
      />
      <Ellipse cx="14" cy="11.5" rx="5.2" ry="3.2" fill="#FFFFFF" opacity={0.6} transform="rotate(-32 14 11.5)" />
      <Circle cx="20.5" cy="8.6" r="1.3" fill="#FFFFFF" opacity={0.7} />
    </Svg>
  );
}

// ——— Diamant ———

export const DIAMOND_RATIO = 56 / 64;

const DIAMOND_TONES: Record<'ice' | 'mint', string[]> = {
  // hell → dunkel
  ice: ['#F4FCFF', '#D2F1FF', '#A3DDFF', '#70C4F2', '#409CD6', '#2B79B8', '#1C5A92'],
  mint: ['#F2FFF9', '#C9FBE6', '#8DF0C8', '#4FD9A6', '#22B37F', '#138A62', '#0B6449'],
};

const FACETS: [string, number][] = [
  ['18,4 2,18 14,18', 1],
  ['18,4 14,18 26,18', 3],
  ['18,4 32,4 26,18', 0],
  ['32,4 26,18 38,18', 2],
  ['32,4 46,4 38,18', 0],
  ['46,4 38,18 50,18', 3],
  ['46,4 50,18 62,18', 5],
  ['2,18 14,18 32,54', 3],
  ['14,18 26,18 32,54', 5],
  ['26,18 38,18 32,54', 1],
  ['38,18 50,18 32,54', 4],
  ['50,18 62,18 32,54', 6],
];

export function Diamond({ width, tone = 'ice' }: { width: number; tone?: 'ice' | 'mint' }) {
  const c = DIAMOND_TONES[tone];
  return (
    <Svg width={width} height={width * DIAMOND_RATIO} viewBox="0 0 64 56">
      {FACETS.map(([points, k], i) => (
        <Polygon key={i} points={points} fill={c[k]} stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth="0.6" strokeLinejoin="round" />
      ))}
      <Path d="M20 6 L28 6 L24 15 Z" fill="#FFFFFF" opacity={0.7} />
    </Svg>
  );
}

// ——— Funkeln ———

export const SPARKLE_COLORS = ['#FFFFFF', '#FFE7A3', '#BFFBE0'];

export function Sparkle({ size, color = '#FFFFFF' }: { size: number; color?: string }) {
  const id = `lx-spark-${color.slice(1)}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="0.35" stopColor={color} />
          <Stop offset="1" stopColor={color} stopOpacity="0.6" />
        </RadialGradient>
        <RadialGradient id={`${id}-glow`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx="50" cy="50" r="30" fill={`url(#${id}-glow)`} />
      <G transform="rotate(45 50 50) translate(50 50) scale(0.5) translate(-50 -50)">
        <Path d="M50 0 C53 35 65 47 100 50 C65 53 53 65 50 100 C47 65 35 53 0 50 C35 47 47 35 50 0 Z" fill={color} opacity={0.7} />
      </G>
      <Path d="M50 0 C53 35 65 47 100 50 C65 53 53 65 50 100 C47 65 35 53 0 50 C35 47 47 35 50 0 Z" fill={`url(#${id})`} />
    </Svg>
  );
}

// ——— Blitz und Mond (für die Auswahl-Kacheln) ———

function BoltGlyph({ size }: { size: number }) {
  return (
    <Svg width={size * 0.7} height={size} viewBox="0 0 28 40">
      <Defs>
        <LinearGradient id="lx-bolt-glyph" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#9EC2FF" />
        </LinearGradient>
      </Defs>
      <Path d="M17 1 L4 23 L13 23 L9 39 L24 15 L15 15 L21 1 Z" fill="url(#lx-bolt-glyph)" stroke="#CFE0FF" strokeWidth="1" strokeLinejoin="round" />
    </Svg>
  );
}

function MoonGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path d="M24 4 A16 16 0 1 0 36 26 A13 13 0 1 1 24 4 Z" fill="#EEF5FF" />
      <Path d="M31 6 L32 9 L35 10 L32 11 L31 14 L30 11 L27 10 L30 9 Z" fill="#FFFFFF" />
      <Circle cx="35" cy="18" r="1" fill="#FFFFFF" />
    </Svg>
  );
}

/** Kleines Standbild eines Motivs – für die Auswahl-Kacheln und die Vorschau */
export function IconGlyph({ kind, size }: { kind: IconKey; size: number }) {
  switch (kind) {
    case 'money':
      return <BanknoteFront width={size * 1.7} />;
    case 'lightning':
      return <BoltGlyph size={size} />;
    case 'stars':
      return <MoonGlyph size={size} />;
    case 'sparkles':
      return <Sparkle size={size} color="#FFE7A3" />;
    case 'rockets':
      return (
        <View style={{ transform: [{ rotate: '40deg' }] }}>
          <Rocket width={size * 0.62} />
        </View>
      );
    case 'fire':
      return <Flame width={size * 0.62} />;
    case 'leaves':
      return (
        <View style={{ transform: [{ rotate: '-30deg' }] }}>
          <Leaf width={size * 0.5} variant={2} />
        </View>
      );
    case 'confetti':
      return (
        <View style={{ width: size, height: size }}>
          <View style={[glyphPiece, { left: size * 0.08, top: size * 0.2, backgroundColor: CONFETTI_COLORS[1], transform: [{ rotate: '-25deg' }] }]} />
          <View style={[glyphPiece, { left: size * 0.62, top: size * 0.1, backgroundColor: CONFETTI_COLORS[2], transform: [{ rotate: '30deg' }] }]} />
          <View style={[glyphPiece, { left: size * 0.4, top: size * 0.55, backgroundColor: CONFETTI_COLORS[3], transform: [{ rotate: '70deg' }] }]} />
          <View style={{ position: 'absolute', left: size * 0.32, top: 0 }}>
            <ConfettiCurl height={size * 0.6} color={CONFETTI_COLORS[0]} />
          </View>
        </View>
      );
    case 'diamonds':
      return <Diamond width={size} />;
    case 'hearts':
      return <Heart width={size} />;
    default:
      return null;
  }
}

const glyphPiece = { position: 'absolute' as const, width: 7, height: 12, borderRadius: 1.5 };
