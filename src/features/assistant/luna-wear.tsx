import { useId, type ReactNode } from 'react';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { lunaPalette, shadeHex, type LunaGlasses, type LunaNeck, type LunaOutfit } from './luna-look';

/**
 * Accessoires für Luna (Profil → Design → Luna): Brillen, Hals (Fliege, Krawatte, Schal …) und
 * Kleidung. Alles ist in Lunas Maßen gezeichnet: 0…100 = ihre Kugel, Mitte (50, 50).
 * Augenmitten bei (35, 41.5) und (65, 41.5), der Mund endet bei ≈ 70, darunter ist Platz.
 */

const WHITE = '#F4F6FA';
const GOLD = '#FBBF24';
const GOLD_DARK = '#D99A0B';
const EYES = [35, 65] as const;
const EYE_Y = 41.5;

/** Eindeutige ID für Verläufe/Ausschnitte (React-IDs enthalten Zeichen, die SVG nicht mag) */
const useSvgId = (prefix: string) => `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/** Punkte auf einer Kurve (quadratisch) – für Ketten */
function along(n: number, p0: [number, number], c: [number, number], p1: [number, number]) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const u = 1 - t;
    return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]] as const;
  });
}

function starPath(cx: number, cy: number, outer: number, inner: number) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 ? inner : outer;
    return `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy + Math.sin(a) * r).toFixed(2)}`;
  });
  return `M${pts.join(' L')} Z`;
}

const HEART = 'M0 11 C-6 7 -15 1 -15 -5 C-15 -10 -11 -13 -7 -13 C-3.5 -13 -1 -11 0 -8 C1 -11 3.5 -13 7 -13 C11 -13 15 -10 15 -5 C15 1 6 7 0 11 Z';
// linkes Glas der Sonnenbrille (das rechte ist gespiegelt)
const SUN_LENS = 'M19.5 32 Q19.5 28.5 23 28.5 L46.5 28.5 Q49.5 28.5 49.2 32 L48.2 44 Q47 55.5 35.5 55.5 Q23.5 55.5 21 45 Z';
const MIRROR = 'translate(100 0) scale(-1 1)';

// ---------------------------------------------------------------- Brillen

function GlassesShapes({ glasses, accent, id }: { glasses: LunaGlasses; accent: string; id: string }) {
  switch (glasses) {
    case 'round':
      return (
        <G fill="none" stroke="#F4D58D" strokeWidth={2.4} strokeLinecap="round">
          {EYES.map((x) => (
            <Circle key={x} cx={x} cy={EYE_Y} r={13} fill="rgba(255,255,255,0.07)" />
          ))}
          <Path d="M48 39.5 Q50 36.5 52 39.5" />
          <Path d="M22 39 L7 35.5 M78 39 L93 35.5" />
          {EYES.map((x) => (
            <Path key={x} d={`M${x - 8} ${EYE_Y - 6} Q${x - 5} ${EYE_Y - 10} ${x} ${EYE_Y - 10.5}`} stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.4} />
          ))}
        </G>
      );
    case 'nerd':
      return (
        <G fill="none" strokeLinejoin="round">
          {/* heller Rand, damit der dunkle Rahmen auf Lunas dunkler Kugel sichtbar bleibt */}
          <G stroke="rgba(255,255,255,0.3)" strokeWidth={6.2}>
            {EYES.map((x) => (
              <Rect key={x} x={x - 13.5} y={29.5} width={27} height={24} rx={6.5} />
            ))}
            <Path d="M48.5 37.5 L51.5 37.5" />
          </G>
          <G stroke="#17171C" strokeWidth={4.4}>
            {EYES.map((x) => (
              <Rect key={x} x={x - 13.5} y={29.5} width={27} height={24} rx={6.5} fill="rgba(255,255,255,0.06)" />
            ))}
            <Path d="M48.5 37.5 L51.5 37.5 M21.5 35 L7 32 M78.5 35 L93 32" />
          </G>
          {EYES.map((x) => (
            <Path key={x} d={`M${x - 9} 33.5 L${x - 3} 33.5`} stroke="#FFFFFF" strokeOpacity={0.4} strokeWidth={1.6} strokeLinecap="round" />
          ))}
        </G>
      );
    case 'sun':
      return (
        <>
          <Defs>
            <LinearGradient id={`${id}-sun`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#3A3F4D" />
              <Stop offset="0.5" stopColor="#14161C" />
              <Stop offset="1" stopColor="#07080A" />
            </LinearGradient>
          </Defs>
          <Path d="M7 32.5 L20 30.5 M93 32.5 L80 30.5" stroke="#1A1B21" strokeWidth={3} strokeLinecap="round" />
          <Path d="M18 30 L82 30" stroke="rgba(255,255,255,0.28)" strokeWidth={5} strokeLinecap="round" />
          <Path d="M18 30 L82 30" stroke="#1A1B21" strokeWidth={3.4} strokeLinecap="round" />
          {[undefined, MIRROR].map((t) => (
            <G key={t ?? 'l'} transform={t}>
              <Path d={SUN_LENS} fill={`url(#${id}-sun)`} stroke={accent} strokeWidth={1.6} />
              {/* Spiegelung */}
              <Path d="M25 33 L31 33 L24.5 45 L22.8 40.5 Z" fill="#FFFFFF" opacity={0.28} />
              <Path d="M34 33 L36.5 33 L29.5 48 L28.2 46 Z" fill="#FFFFFF" opacity={0.16} />
            </G>
          ))}
        </>
      );
    case 'heart':
      return (
        <G>
          <Path d="M47.5 37 Q50 34.5 52.5 37 M21 37 L7 33.5 M79 37 L93 33.5" stroke="#FF4D94" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          {EYES.map((x) => (
            <G key={x} transform={`translate(${x} ${EYE_Y + 1}) scale(0.93)`}>
              <Path d={HEART} fill="rgba(255,122,182,0.38)" stroke="#FF4D94" strokeWidth={2.8} strokeLinejoin="round" />
              <Path d="M-9 -7 Q-8 -10 -5 -10" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={1.6} fill="none" strokeLinecap="round" />
            </G>
          ))}
        </G>
      );
    case 'star':
      return (
        <G>
          <Path d="M48 36 Q50 33.5 52 36 M21 36 L7 32.5 M79 36 L93 32.5" stroke={GOLD} strokeWidth={2.4} fill="none" strokeLinecap="round" />
          {EYES.map((x) => (
            <Path
              key={x}
              d={starPath(x, EYE_Y + 1, 15.5, 8.2)}
              fill="rgba(251,191,36,0.3)"
              stroke={GOLD}
              strokeWidth={2.6}
              strokeLinejoin="round"
            />
          ))}
        </G>
      );
    case 'monocle':
      return (
        <G>
          <Path d="M74.5 51 Q82 64 72 79" stroke={GOLD} strokeWidth={1.4} strokeDasharray="2.2 1.6" fill="none" strokeLinecap="round" />
          <Circle cx={65} cy={EYE_Y} r={13.5} fill="rgba(255,255,255,0.1)" stroke={GOLD} strokeWidth={2.8} />
          <Circle cx={65} cy={EYE_Y} r={11.6} fill="none" stroke={GOLD_DARK} strokeWidth={0.8} />
          <Path d="M57 35 Q60 30.5 65.5 30" stroke="#FFFFFF" strokeOpacity={0.55} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        </G>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Hals

/** Weißer Hemdkragen unter Fliege und Krawatte */
const Collar = () => (
  <G fill={WHITE} stroke="rgba(0,0,0,0.18)" strokeWidth={0.8} strokeLinejoin="round">
    <Path d="M39.5 74.5 L49.5 77.5 L44 85 Z" />
    <Path d="M60.5 74.5 L50.5 77.5 L56 85 Z" />
  </G>
);

const LEI_COLORS = ['#FF7AB6', '#FFFFFF', '#FF9F45', '#A78BFA', '#FF5A5F'];

function NeckShapes({ neck, accent }: { neck: LunaNeck; accent: string }) {
  switch (neck) {
    case 'bowtie':
      return (
        <G>
          <Collar />
          <Path d="M50 81 L34.5 73.5 Q31.5 81 34.5 88.5 Z" fill={accent} />
          <Path d="M50 81 L65.5 73.5 Q68.5 81 65.5 88.5 Z" fill={accent} />
          <Path d="M38 76.5 Q41 81 38 85.5 M62 76.5 Q59 81 62 85.5" stroke={shadeHex(accent, 0.62)} strokeWidth={1.3} fill="none" strokeLinecap="round" />
          <Path d="M36 75.5 L44 79" stroke="#FFFFFF" strokeOpacity={0.35} strokeWidth={1.2} strokeLinecap="round" />
          <Rect x={45.5} y={76.5} width={9} height={9} rx={2.8} fill={shadeHex(accent, 0.75)} />
        </G>
      );
    case 'tie':
      return (
        <G>
          <Collar />
          <Path d="M47.5 83.5 L52.5 83.5 L55.8 94 L50 99.6 L44.2 94 Z" fill={accent} />
          <Path d="M50 85 L50 97.5" stroke="#FFFFFF" strokeOpacity={0.22} strokeWidth={1.2} strokeLinecap="round" />
          <Path d="M46 77 L54 77 L52.6 83.8 L47.4 83.8 Z" fill={shadeHex(accent, 0.75)} />
          {/* Krawattennadel */}
          <Rect x={44.5} y={88.6} width={11} height={1.9} rx={0.9} fill={GOLD} />
        </G>
      );
    case 'scarf':
      return (
        <G>
          <Path d="M3.5 69 Q50 85 96.5 69 L92 83.5 Q50 99 8 83.5 Z" fill="#FF5A5F" />
          <Path d="M10 74.5 Q50 89 90 74.5" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={2.6} fill="none" />
          <Path
            d="M18 76 L17 83 M28 79 L27.3 86.5 M38 81 L37.6 88.5 M62 81 L62.4 88.5 M72 79 L72.7 86.5 M82 76 L83 83"
            stroke="rgba(0,0,0,0.14)"
            strokeWidth={1.6}
          />
          {/* hängendes Ende mit Fransen */}
          <Path d="M65 84 L78 81.5 L84 104 L70.5 106.5 Z" fill="#E5484F" />
          <Path d="M67.6 92 L80.4 89.6 M69.2 98.2 L82 95.8" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={2.6} />
          <Path d="M72 106.4 L71.6 110 M75 105.8 L74.8 109.6 M78 105.2 L78 109 M81 104.6 L81.4 108.4" stroke="#E5484F" strokeWidth={1.6} strokeLinecap="round" />
          <Ellipse cx={69} cy={85} rx={6.5} ry={5.5} fill="#D9434A" />
        </G>
      );
    case 'pearls':
      return (
        <G>
          {along(13, [22, 76], [50, 98], [78, 76]).map(([x, y], i) => (
            <G key={i}>
              <Circle cx={x} cy={y} r={i === 6 ? 3.6 : 2.7} fill="#F6F1E7" stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
              <Circle cx={x - 0.8} cy={y - 0.9} r={0.8} fill="#FFFFFF" />
            </G>
          ))}
        </G>
      );
    case 'medal':
      return (
        <G>
          <Path d="M33.5 70.5 L41 70.5 L50 84.5 L59 70.5 L66.5 70.5 L53.5 89.5 L46.5 89.5 Z" fill={accent} />
          <Path d="M37.2 70.5 L50 89.5 L62.8 70.5" stroke="#FFFFFF" strokeOpacity={0.45} strokeWidth={1.4} fill="none" />
          <Circle cx={50} cy={92} r={7} fill={GOLD} stroke={GOLD_DARK} strokeWidth={1.5} />
          <Path d={starPath(50, 92.3, 4.2, 1.9)} fill="#FFF3C4" />
        </G>
      );
    case 'lei':
      return (
        <G>
          {along(9, [6, 70], [50, 100], [94, 70]).map(([x, y], i) => (
            <G key={i}>
              {[0, 1, 2, 3, 4].map((k) => {
                const a = (k / 5) * Math.PI * 2 + i;
                return <Circle key={k} cx={x + Math.cos(a) * 3.3} cy={y + Math.sin(a) * 3.3} r={3.1} fill={LEI_COLORS[i % LEI_COLORS.length]} />;
              })}
              <Circle cx={x} cy={y} r={1.9} fill={GOLD} />
            </G>
          ))}
        </G>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------- Kleidung

/** Stoff unterhalb des Halses (wird auf die Kugel zugeschnitten) */
const BODY = 'M0 68 Q50 80 100 68 L100 100 L0 100 Z';
/** heller Saum am Ausschnitt – damit dunkle Stoffe auf Lunas dunkler Kugel sichtbar bleiben */
const Hem = ({ color = 'rgba(255,255,255,0.22)' }: { color?: string }) => (
  <Path d="M0 68 Q50 80 100 68" stroke={color} strokeWidth={1.4} fill="none" />
);

function OutfitShapes({ outfit, accent }: { outfit: LunaOutfit; accent: string }) {
  switch (outfit) {
    case 'suit':
      return (
        <G>
          <Path d={BODY} fill="#2A2D39" />
          <Hem />
          <Path d="M39 73.7 L61 73.7 L50 93 Z" fill={WHITE} />
          <G fill="#3B3F4F" stroke="rgba(255,255,255,0.22)" strokeWidth={0.8} strokeLinejoin="round">
            <Path d="M39 73.7 L50 93 L46 95 L30 81 L33.5 73.3 Z" />
            <Path d="M61 73.7 L50 93 L54 95 L70 81 L66.5 73.3 Z" />
          </G>
          <Circle cx={50} cy={97.2} r={1.6} fill="#5A5F70" />
          {/* Einstecktuch */}
          <Path d="M68.5 85.5 L70.5 80.8 L72.5 84 L74.5 80.4 L76.2 85.5 Z" fill={accent} />
          <Path d="M66.5 85.6 L78 85.6" stroke="rgba(255,255,255,0.22)" strokeWidth={1} />
        </G>
      );
    case 'hoodie': {
      const base = shadeHex(accent, 0.6);
      return (
        <G>
          <Path d={BODY} fill={base} />
          <Path d="M1 66 Q50 79 99 66 L99 71.5 Q50 86 1 71.5 Z" fill={shadeHex(accent, 0.78)} />
          <Path d="M30 101 L34 91 L66 91 L70 101 Z" fill={shadeHex(accent, 0.5)} stroke={shadeHex(accent, 0.4)} strokeWidth={1} />
          <Path d="M43.5 79 L42 90 M56.5 79 L58 90" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" />
          <Circle cx={41.9} cy={91} r={1.5} fill={WHITE} />
          <Circle cx={58.1} cy={91} r={1.5} fill={WHITE} />
        </G>
      );
    }
    case 'vest':
      return (
        <G>
          <Path d={BODY} fill="#22252E" />
          <Path d="M0 68 Q20 72.8 38 73.6 L50 90 L62 73.6 Q80 72.8 100 68 L100 100 L0 100 Z" fill="#FF7A1A" />
          <G fill="#D8DCE3">
            <Rect x={0} y={91} width={100} height={4} />
            <Path d="M21.5 70.9 L27 72 L27 91 L21.5 91 Z" />
            <Path d="M78.5 70.9 L73 72 L73 91 L78.5 91 Z" />
          </G>
          <Path d="M0 91.6 L100 91.6" stroke="#FFFFFF" strokeOpacity={0.6} strokeWidth={0.6} />
          <Path d="M50 90 L50 100" stroke="rgba(0,0,0,0.3)" strokeWidth={1.2} />
        </G>
      );
    case 'sweater':
      return (
        <G>
          <Path d={BODY} fill="#C62F3A" />
          <Path d="M1 66.5 Q50 78.5 99 66.5 L99 70.5 Q50 83.5 1 70.5 Z" fill="#A3222D" />
          <Path
            d={`M0 86 ${Array.from({ length: 20 }, (_, i) => `L${(i + 1) * 5} ${i % 2 ? 86 : 83}`).join(' ')}`}
            stroke={WHITE}
            strokeWidth={1.8}
            fill="none"
            strokeLinejoin="round"
          />
          {[18, 38, 58, 78].map((x) => (
            <Path key={x} d={`M${x} 98 L${x + 3.5} 90 L${x + 7} 98 Z`} fill={accent} />
          ))}
          {[11, 31, 51, 71, 91].map((x) => (
            <Circle key={x} cx={x} cy={93.5} r={1.3} fill={WHITE} />
          ))}
        </G>
      );
    case 'robe':
      return (
        <G>
          <Path d={BODY} fill="#262631" />
          <Hem />
          <Path d="M41 74 L59 74 L50 86 Z" fill={WHITE} />
          <Path d="M33 72.8 L41 74 L44.5 101 L35 101 Z" fill={accent} />
          <Path d="M67 72.8 L59 74 L55.5 101 L65 101 Z" fill={accent} />
          <Path d="M24 76 L20 101 M76 76 L80 101 M15 74 L10 101 M85 74 L90 101" stroke="rgba(255,255,255,0.12)" strokeWidth={1.2} />
        </G>
      );
    case 'cape':
      // roter Samt, Goldsaum, Hermelin an der Öffnung (nicht quer unter dem Mund – sähe aus wie Zähne)
      return (
        <G>
          <Path d={BODY} fill="#A1122E" />
          <Ellipse cx={24} cy={88} rx={12} ry={5} fill="#FFFFFF" opacity={0.08} />
          <Ellipse cx={76} cy={88} rx={12} ry={5} fill="#FFFFFF" opacity={0.08} />
          <G fill="#F7F4EE">
            <Path d="M27 72.6 L35.5 74.3 L36.5 101 L26 101 Z" />
            <Path d="M73 72.6 L64.5 74.3 L63.5 101 L74 101 Z" />
          </G>
          {[
            [31, 82],
            [31.5, 92],
            [69, 82],
            [68.5, 92],
          ].map(([x, y]) => (
            <Ellipse key={`${x}-${y}`} cx={x} cy={y} rx={0.9} ry={1.9} fill="#1A1A1A" />
          ))}
          <Hem color={GOLD} />
          <Path d="M35.5 78 Q50 83 64.5 78" stroke={GOLD} strokeWidth={1.4} fill="none" />
          <Circle cx={35.5} cy={78} r={2} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.6} />
          <Circle cx={64.5} cy={78} r={2} fill={GOLD} stroke={GOLD_DARK} strokeWidth={0.6} />
        </G>
      );
    default:
      return null;
  }
}

/** Ausschnitt in der Größe der Kugel (innerhalb von Lunas Rand) */
function ClippedToBall({ id, r, children }: { id: string; r: number; children: ReactNode }) {
  return (
    <>
      <Defs>
        <ClipPath id={`${id}-clip`}>
          <Circle cx={50} cy={50} r={r} />
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${id}-clip)`}>{children}</G>
    </>
  );
}

// ---------------------------------------------------------------- Ebenen für die Figur

type LayerProps = { size: number; accent: string };

/** Brille – liegt im Gesicht und wandert mit dem Blick mit */
export function LunaGlassesArt({ glasses, size, accent }: LayerProps & { glasses: LunaGlasses }) {
  const id = useSvgId('lg');
  if (glasses === 'none') return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={layer}>
      <GlassesShapes glasses={glasses} accent={accent} id={id} />
    </Svg>
  );
}

/** Kleidung + Hals – liegen auf dem Körper; der Schal darf etwas über den Rand ragen */
export function LunaBodyWearArt({
  outfit,
  neck,
  size,
  accent,
  inset = 1.5,
}: LayerProps & { outfit: LunaOutfit; neck: LunaNeck; /** Lunas Rand in Kugel-Einheiten */ inset?: number }) {
  const id = useSvgId('lw');
  if (outfit === 'none' && neck === 'none') return null;
  const pad = size * 0.12;
  return (
    <Svg width={size + pad * 2} height={size + pad * 2} viewBox="-12 -12 124 124" style={[layer, { left: -pad, top: -pad }]}>
      {outfit !== 'none' && (
        <ClippedToBall id={id} r={50 - inset}>
          <OutfitShapes outfit={outfit} accent={accent} />
        </ClippedToBall>
      )}
      <NeckShapes neck={neck} accent={accent} />
    </Svg>
  );
}

const layer = { position: 'absolute' as const, left: 0, top: 0 };

// ---------------------------------------------------------------- Vorschau für die Auswahl

/** Ausschnitt der Vorschau: ganze Luna, nur Gesicht (Brille) oder ab den Augen abwärts (Hals, Kleidung) */
const FOCUS = {
  all: { x: -10, y: -8, w: 120, h: 120 },
  face: { x: 2, y: 14, w: 96, h: 62 },
  body: { x: -6, y: 24, w: 112, h: 88 },
};

/** Kleine, ruhige Luna mit einem Teil – für die Kacheln in Profil → Design */
export function LunaWearPreview({
  size,
  accent,
  glasses = 'none',
  neck = 'none',
  outfit = 'none',
  focus = 'all',
}: {
  /** Breite */
  size: number;
  accent: string;
  glasses?: LunaGlasses;
  neck?: LunaNeck;
  outfit?: LunaOutfit;
  focus?: keyof typeof FOCUS;
}) {
  const id = useSvgId('lp');
  const pal = lunaPalette(accent);
  const f = FOCUS[focus];
  return (
    <Svg width={size} height={(size * f.h) / f.w} viewBox={`${f.x} ${f.y} ${f.w} ${f.h}`}>
      <Defs>
        <RadialGradient id={`${id}-body`} cx="40%" cy="32%" r="75%">
          <Stop offset="0" stopColor={pal.body[0]} />
          <Stop offset="0.55" stopColor={pal.body[1]} />
          <Stop offset="1" stopColor={pal.body[2]} />
        </RadialGradient>
      </Defs>
      <Circle cx={50} cy={50} r={47.5} fill={`url(#${id}-body)`} stroke={pal.accent} strokeWidth={2.5} strokeOpacity={0.9} />
      {outfit !== 'none' && (
        <ClippedToBall id={id} r={46.2}>
          <OutfitShapes outfit={outfit} accent={pal.accent} />
        </ClippedToBall>
      )}
      <NeckShapes neck={neck} accent={pal.accent} />
      {EYES.map((x) => (
        <G key={x}>
          <Rect x={x - 9.5} y={30} width={19} height={23} rx={9.5} fill="#F2FFF9" />
          <Ellipse cx={x} cy={42} rx={5.2} ry={6} fill="#0A1C15" />
          <Circle cx={x - 1.6} cy={39.6} r={1.9} fill="#FFFFFF" />
        </G>
      ))}
      <Path d="M44.5 63.5 Q50 68.5 55.5 63.5" stroke="#F2FFF9" strokeWidth={2.6} strokeLinecap="round" fill="none" />
      <GlassesShapes glasses={glasses} accent={pal.accent} id={id} />
    </Svg>
  );
}
