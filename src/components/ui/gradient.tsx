import { useState, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

/** Farbverlauf für Lunaxora Business: Blau → Lila → Grün */
export const BUSINESS_GRADIENT = ['#3B82F6', '#8B5CF6', '#2FE39A'] as const;

let uid = 0;
const nextId = () => `g${++uid}`;

function stops(colors: readonly string[]) {
  return colors.map((c, i) => <Stop key={c + i} offset={colors.length === 1 ? 0 : i / (colors.length - 1)} stopColor={c} />);
}

/** Fläche mit Farbverlauf (z. B. hinter einem Knopf oder als Rahmen) */
export function GradientFill({
  colors = BUSINESS_GRADIENT,
  opacity = 1,
}: {
  colors?: readonly string[];
  opacity?: number;
}) {
  const [id] = useState(nextId);
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none" preserveAspectRatio="none" viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {stops(colors)}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100" height="100" fill={`url(#${id})`} opacity={opacity} />
    </Svg>
  );
}

/** Rahmen mit Farbverlauf um beliebigen Inhalt (Business-Karte) */
export function GradientFrame({
  children,
  radius = 16,
  width = 1.5,
  style,
  colors = BUSINESS_GRADIENT,
}: {
  children: ReactNode;
  radius?: number;
  width?: number;
  style?: StyleProp<ViewStyle>;
  colors?: readonly string[];
}) {
  return (
    <View style={[{ borderRadius: radius, padding: width, overflow: 'hidden' }, style]}>
      <GradientFill colors={colors} />
      <View style={{ borderRadius: radius - width, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/**
 * Schrift mit Farbverlauf. Im Browser/Mac per CSS, auf dem Handy als SVG-Text
 * (gleich groß wie normaler Text, damit das Layout stimmt).
 */
export function GradientText({
  children,
  style,
  colors = BUSINESS_GRADIENT,
}: {
  children: string;
  style?: StyleProp<TextStyle>;
  colors?: readonly string[];
}) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const [id] = useState(nextId);
  if (Platform.OS === 'web') {
    const web = {
      backgroundImage: `linear-gradient(100deg, ${colors.join(', ')})`,
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
    } as unknown as TextStyle;
    return <Text style={[style, web]}>{children}</Text>;
  }
  const flat = StyleSheet.flatten(style) ?? {};
  const fontSize = flat.fontSize ?? 15;
  return (
    <View>
      <Text style={[style, { opacity: 0 }]} onLayout={(e) => setBox(e.nativeEvent.layout)}>
        {children}
      </Text>
      {box && (
        <Svg style={StyleSheet.absoluteFill} width={box.width} height={box.height} pointerEvents="none">
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
              {stops(colors)}
            </LinearGradient>
          </Defs>
          <SvgText
            x={0}
            y={box.height / 2 + fontSize * 0.36}
            fontSize={fontSize}
            fontWeight={(flat.fontWeight as string) ?? 'normal'}
            letterSpacing={flat.letterSpacing}
            fill={`url(#${id})`}>
            {children}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}
