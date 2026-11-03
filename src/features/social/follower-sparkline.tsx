import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Colors } from '@/constants/theme';

const HEIGHT = 44;
const PAD = 6;
// Verlauf im zurückhaltenden Ton, nur der aktuelle Stand in Grün
const LINE = '#6E6E74';

const dateLabel = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Follower-Verlauf als kleine Linie. Mit der Maus: Hilfslinie + Wert des Tages.
 */
export function FollowerSparkline({ points }: { points: { day: string; followers: number }[] }) {
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) {
    return <Text style={styles.empty}>Den Verlauf siehst du hier, sobald die Zahlen von mehreren Tagen da sind.</Text>;
  }
  const values = points.map((p) => p.followers);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // nach Datum verteilt: Tage ohne Wert bleiben als Lücke sichtbar
  const t = points.map((p) => Date.parse(`${p.day}T12:00:00Z`));
  const range = t[t.length - 1] - t[0] || 1;
  const x = (i: number) => PAD + ((t[i] - t[0]) / range) * Math.max(1, width - 2 * PAD);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (HEIGHT - 2 * PAD);
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(p.followers).toFixed(1)}`).join(' ');
  const last = points.length - 1;
  const first = points[0];
  const current = points[last];
  const shown = hover !== null ? points[hover] : null;

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);
  // nächster Tag zur Mausposition
  const pick = (offsetX: number) => {
    if (!width) return;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(i) - offsetX) < Math.abs(x(best) - offsetX)) best = i;
    setHover(best);
  };

  return (
    <View
      style={styles.wrap}
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel={`Follower vom ${dateLabel(first.day)} bis ${dateLabel(current.day)}: von ${first.followers.toLocaleString('de-DE')} auf ${current.followers.toLocaleString('de-DE')}`}
      // Maus/Stift (Mac, Browser)
      {...({
        onPointerMove: (e: { nativeEvent: { offsetX?: number; locationX?: number } }) =>
          pick(e.nativeEvent.offsetX ?? e.nativeEvent.locationX ?? 0),
        onPointerLeave: () => setHover(null),
      } as object)}>
      {width > 0 && (
        <Svg width={width} height={HEIGHT}>
          {hover !== null && (
            <Line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} stroke={Colors.borderFocus} strokeWidth={1} />
          )}
          <Path d={d} stroke={LINE} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          {/* aktueller Stand */}
          <Circle
            cx={x(last)}
            cy={y(current.followers)}
            r={5}
            fill={Colors.accent}
            stroke={Colors.surface}
            strokeWidth={2}
          />
          {hover !== null && hover !== last && (
            <Circle
              cx={x(hover)}
              cy={y(points[hover].followers)}
              r={4}
              fill={Colors.text}
              stroke={Colors.surface}
              strokeWidth={2}
            />
          )}
        </Svg>
      )}
      <View style={styles.axis} pointerEvents="none">
        <Text style={styles.axisText}>{dateLabel(first.day)}</Text>
        <Text style={styles.axisText}>
          {shown ? `${dateLabel(shown.day)}: ${shown.followers.toLocaleString('de-DE')} Follower` : 'heute'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 4 },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  axisText: { color: Colors.textFaint, fontSize: 11.5 },
  empty: { color: Colors.textFaint, fontSize: 12.5, lineHeight: 18 },
});
