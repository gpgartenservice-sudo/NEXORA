import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

import { shadeHex, type LunaHat } from './luna-look';

/**
 * Hüte für Luna (Profil → Design → Luna). Gezeichnet in einem 100 × 80 großen Feld,
 * die Krempe liegt bei y ≈ 72 – dort sitzt der Hut auf Lunas Kopf.
 */

/** Größe (Anteil von Lunas Breite) und Höhe der Krempe auf dem Kopf (Anteil von oben) */
const FIT: Record<Exclude<LunaHat, 'none' | 'bow' | 'flower'>, { w: number; brim: number }> = {
  party: { w: 0.78, brim: 0.15 },
  crown: { w: 0.8, brim: 0.18 },
  santa: { w: 0.95, brim: 0.22 },
  tophat: { w: 0.85, brim: 0.16 },
  witch: { w: 0.95, brim: 0.18 },
  cap: { w: 1.0, brim: 0.27 },
  beanie: { w: 1.0, brim: 0.27 },
  helmet: { w: 1.04, brim: 0.26 },
  grad: { w: 0.92, brim: 0.2 },
};

/** Wo der Hut sitzt (in Bezug auf Lunas Größe S); origin = Drehpunkt beim Wippen */
export function hatFrame(hat: LunaHat, S: number) {
  // Schleife und Blume: seitlich oben links (rechts sind schon Sprechblase und "z")
  if (hat === 'none' || hat === 'bow' || hat === 'flower') {
    const width = S * 0.42;
    return { width, height: width * 0.8, left: -S * 0.04, top: -S * 0.04, rotate: -16, origin: 'center' as const };
  }
  const fit = FIT[hat];
  // kleine Figur (Chat, Kopfzeile): Hut etwas kleiner, damit er nicht weit über die Zeile ragt
  const width = S * fit.w * (S < 60 ? 0.86 : 1);
  const height = width * 0.8;
  return {
    width,
    height,
    left: (S - width) / 2 + S * 0.03,
    // Krempe liegt im Bild bei 72 von 80
    top: S * fit.brim - height * 0.9,
    rotate: 7,
    origin: 'bottom' as const,
  };
}

export function LunaHatArt({ hat, width, accent }: { hat: LunaHat; width: number; accent: string }) {
  if (hat === 'none') return null;
  return (
    <Svg width={width} height={width * 0.8} viewBox="0 0 100 80">
      {hat === 'party' && (
        <>
          <Path d="M50 4 L74 72 L26 72 Z" fill="#FF7AB6" />
          <Path d="M40.8 30 L59.2 30 L62 38 L38 38 Z" fill="#FBBF24" />
          <Path d="M33.1 52 L66.9 52 L69.8 60 L30.2 60 Z" fill="#4FB3FF" />
          <Ellipse cx={50} cy={72} rx={24} ry={3.5} fill="#E0559A" />
          <Circle cx={50} cy={6} r={6.5} fill="#FBBF24" />
        </>
      )}
      {hat === 'crown' && (
        <>
          <Path d="M20 72 L20 34 L35 50 L50 22 L65 50 L80 34 L80 72 Z" fill="#FBBF24" stroke="#D99A0B" strokeWidth={2} strokeLinejoin="round" />
          <Rect x={20} y={60} width={60} height={12} fill="#E8A915" />
          <Circle cx={50} cy={66} r={4} fill="#FF5A5F" />
          <Circle cx={34} cy={66} r={3} fill="#4FB3FF" />
          <Circle cx={66} cy={66} r={3} fill="#4FB3FF" />
          <Circle cx={20} cy={33} r={3.5} fill="#FBBF24" />
          <Circle cx={50} cy={21} r={3.5} fill="#FBBF24" />
          <Circle cx={80} cy={33} r={3.5} fill="#FBBF24" />
        </>
      )}
      {hat === 'santa' && (
        <>
          <Path d="M24 64 C26 30 50 10 74 14 C86 16 90 28 88 40 C82 30 72 26 66 30 C74 40 76 52 76 64 Z" fill="#E53935" />
          <Rect x={16} y={60} width={68} height={14} rx={7} fill="#FFFFFF" />
          <Circle cx={88} cy={44} r={8} fill="#FFFFFF" />
        </>
      )}
      {hat === 'tophat' && (
        <>
          <Ellipse cx={50} cy={70} rx={38} ry={7} fill="#141418" />
          <Path d="M30 68 L32 14 Q50 8 68 14 L70 68 Z" fill="#1E1E24" />
          <Ellipse cx={50} cy={14} rx={18} ry={4.5} fill="#2A2A32" />
          <Rect x={30.6} y={52} width={38.8} height={9} fill={accent} />
        </>
      )}
      {hat === 'witch' && (
        <>
          <Ellipse cx={50} cy={70} rx={44} ry={8} fill="#2A1B3D" />
          <Path d="M28 68 C36 50 44 30 48 14 C50 6 58 2 66 6 C60 8 57 14 58 22 C60 38 66 54 72 68 Z" fill="#3B2559" />
          <Path d="M31 59 L69.5 59 L71 66 L29.5 66 Z" fill="#A78BFA" />
          <Rect x={45} y={57} width={10} height={11} rx={1.5} fill="none" stroke="#FBBF24" strokeWidth={2.2} />
        </>
      )}
      {hat === 'cap' && (
        <>
          <Path d="M70 62 C84 58 96 60 99 67 C92 71 80 71 66 68 Z" fill={shadeHex(accent, 0.62)} />
          <Path d="M22 66 C22 38 36 26 52 26 C68 26 80 38 80 66 Z" fill={accent} />
          <Path d="M52 27 L52 66 M37 32 Q34 48 34 66 M67 32 Q70 48 70 66" stroke="rgba(0,0,0,0.22)" strokeWidth={1.5} fill="none" />
          <Rect x={22} y={61} width={58} height={5} fill="rgba(0,0,0,0.2)" />
          <Circle cx={52} cy={26} r={3.5} fill={shadeHex(accent, 0.8)} />
        </>
      )}
      {hat === 'beanie' && (
        <>
          <Path d="M20 64 C20 34 34 20 50 20 C66 20 80 34 80 64 Z" fill="#FF5A5F" />
          <Path d="M22 44 L78 44" stroke="#FFFFFF" strokeWidth={4} opacity={0.85} />
          <Rect x={16} y={56} width={68} height={16} rx={6} fill="#D9434A" />
          <Path d="M26 58 L26 70 M36 58 L36 70 M46 58 L46 70 M56 58 L56 70 M66 58 L66 70 M76 58 L76 70" stroke="rgba(0,0,0,0.18)" strokeWidth={2} />
          <Circle cx={50} cy={16} r={9} fill="#FFFFFF" />
        </>
      )}
      {hat === 'helmet' && (
        <>
          <Path d="M20 64 C20 34 34 22 50 22 C66 22 80 34 80 64 Z" fill="#FBBF24" />
          <Rect x={45} y={21} width={10} height={43} rx={4} fill="#F59E0B" />
          <Rect x={8} y={62} width={84} height={8} rx={4} fill="#F59E0B" />
          <Ellipse cx={36} cy={36} rx={6} ry={4} fill="#FFFFFF" opacity={0.35} />
        </>
      )}
      {hat === 'grad' && (
        <>
          <Path d="M30 40 L30 62 Q50 70 70 62 L70 40 Z" fill="#141418" />
          <Path d="M6 34 L50 18 L94 34 L50 50 Z" fill="#1E1E24" stroke="#2A2A32" strokeWidth={1} />
          <Path d="M50 34 L80 40 L82 58" stroke="#FBBF24" strokeWidth={2} fill="none" />
          <Circle cx={50} cy={34} r={2.5} fill="#FBBF24" />
          <Rect x={79} y={56} width={6} height={10} rx={2} fill="#FBBF24" />
        </>
      )}
      {hat === 'bow' && (
        <>
          <Path d="M50 40 L14 16 Q6 40 14 64 Z" fill="#FF7AB6" />
          <Path d="M50 40 L86 16 Q94 40 86 64 Z" fill="#FF7AB6" />
          <Circle cx={50} cy={40} r={10} fill="#E0559A" />
        </>
      )}
      {hat === 'flower' && (
        <>
          {[0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
            return <Circle key={i} cx={50 + Math.cos(a) * 19} cy={40 + Math.sin(a) * 19} r={15} fill="#FFFFFF" />;
          })}
          <Circle cx={50} cy={40} r={11} fill="#FBBF24" />
        </>
      )}
    </Svg>
  );
}
