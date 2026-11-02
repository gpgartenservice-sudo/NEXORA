import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';

import { Colors, Radius, Spacing } from '@/constants/theme';
import { formatEuro } from '@/features/crm/order-logic';

import { monthLabel, type MonthKey, type MonthSummary } from './finance-logic';

/**
 * Verlauf: Einnahmen und Ausgaben pro Monat als Säulenpaare.
 * Farben geprüft (Dataviz-Validator, dunkle Fläche): Grün/Violett sind
 * auch bei Farbsehschwäche deutlich unterscheidbar.
 */
export const SERIES = {
  income: { label: 'Einnahmen', color: '#19A571' },
  expenses: { label: 'Ausgaben', color: '#9085E9' },
} as const;

const PLOT_H = 190;
const AXIS_W = 52;
const X_LABEL_H = 24;
const BAR_MAX = 24;
const GAP = 2;

/** Saubere Achsenschritte: 1, 2, 2,5, 5 × 10ⁿ */
function niceStep(raw: number): number {
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
}

function tickLabel(v: number): string {
  if (v >= 10_000) return `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Tsd.`;
  return v.toLocaleString('de-DE', { maximumFractionDigits: 0 });
}

/** Säule mit 4px gerundetem Ende oben, eckig an der Grundlinie */
function barPath(x: number, w: number, top: number, base: number): string {
  const h = base - top;
  const r = Math.min(4, w / 2, h);
  return `M${x},${base} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + w - r},${top} Q${x + w},${top} ${x + w},${top + r} L${x + w},${base} Z`;
}

type Props = {
  rows: MonthSummary[];
  /** Hervorgehobener Monat (gewählter Zeitraum) */
  selected?: MonthKey | null;
  onSelect?: (month: MonthKey) => void;
};

export function FinanceChart({ rows, selected, onSelect }: Props) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);

  const max = Math.max(0, ...rows.map((r) => Math.max(r.income, r.expenses)));
  const step = niceStep(max > 0 ? max / 4 : 25);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  const plotW = Math.max(0, width - AXIS_W);
  const band = rows.length ? plotW / rows.length : 0;
  // schmale Spalten (Handy): weniger Luft, damit die Säulen nicht zu dünn werden
  const barW = Math.max(3, Math.min(BAR_MAX, (band - (band < 36 ? 4 : 10)) / 2 - GAP / 2));
  const y = (v: number) => PLOT_H - (v / top) * PLOT_H;
  const everyOther = band < 30;

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const tip = active !== null ? rows[active] : null;
  const tipLeft = active !== null ? Math.min(Math.max(AXIS_W + band * active + band / 2 - 90, 0), Math.max(0, width - 180)) : 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View style={styles.legend} accessibilityRole="list">
          {Object.values(SERIES).map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{s.label}</Text>
            </View>
          ))}
        </View>
        <Pressable onPress={() => setTable((t) => !t)} accessibilityRole="button">
          <Text style={styles.toggle}>{table ? 'Als Diagramm' : 'Als Tabelle'}</Text>
        </Pressable>
      </View>

      {table ? (
        <View style={styles.table} accessibilityRole="summary">
          <View style={[styles.tr, styles.thRow]}>
            <Text style={[styles.th, styles.tdMonth]}>Monat</Text>
            <Text style={styles.th}>Einnahmen</Text>
            <Text style={styles.th}>Ausgaben</Text>
            <Text style={styles.th}>Gewinn</Text>
          </View>
          {rows.map((r) => (
            <View key={r.month} style={[styles.tr, r.month === selected && styles.trSelected]}>
              <Text style={[styles.td, styles.tdMonth]}>{monthLabel(r.month)}</Text>
              <Text style={styles.td}>{formatEuro(r.income)}</Text>
              <Text style={styles.td}>{formatEuro(r.expenses)}</Text>
              <Text style={[styles.td, r.profit < 0 && styles.negative]}>{formatEuro(r.profit)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View onLayout={onLayout} style={{ height: PLOT_H + X_LABEL_H + 8 }}>
          {width > 0 && (
            <>
              <Svg width={width} height={PLOT_H + 8} style={styles.svg}>
                {/* ausgewählter Monat: dezente Fläche */}
                {rows.map((r, i) =>
                  r.month === selected || i === active ? (
                    <Rect
                      key={`hl-${r.month}`}
                      x={AXIS_W + band * i + 2}
                      y={0}
                      width={band - 4}
                      height={PLOT_H + 8}
                      rx={8}
                      fill={i === active ? '#1C1C20' : Colors.surfaceRaised}
                    />
                  ) : null,
                )}
                {ticks.map((t) => (
                  <Line key={t} x1={AXIS_W} x2={width} y1={y(t) + 4} y2={y(t) + 4} stroke={Colors.border} strokeWidth={1} />
                ))}
                {rows.map((r, i) => {
                  const cx = AXIS_W + band * i + band / 2;
                  const base = PLOT_H + 4;
                  const xi = cx - GAP / 2 - barW;
                  const xe = cx + GAP / 2;
                  return (
                    <G key={r.month}>
                      {r.income > 0 && <Path d={barPath(xi, barW, y(r.income) + 4, base)} fill={SERIES.income.color} />}
                      {r.expenses > 0 && <Path d={barPath(xe, barW, y(r.expenses) + 4, base)} fill={SERIES.expenses.color} />}
                    </G>
                  );
                })}
              </Svg>

              {/* Achsenbeschriftung (Text = Text-Farben, nie Serienfarbe) */}
              {ticks.map((t) => (
                <Text key={`t-${t}`} style={[styles.tick, { top: y(t) - 4 }]}>
                  {tickLabel(t)}
                </Text>
              ))}
              {rows.map((r, i) =>
                everyOther && i % 2 === 1 && r.month !== selected ? null : (
                  <Text
                    key={`x-${r.month}`}
                    style={[
                      styles.xLabel,
                      { left: AXIS_W + band * i, width: band, top: PLOT_H + 12 },
                      r.month === selected && styles.xSelected,
                    ]}>
                    {monthLabel(r.month, true)}
                  </Text>
                ),
              )}

              {/* Trefferflächen: ganze Monatsspalte (Maus, Tastatur, Tippen) */}
              {rows.map((r, i) => (
                <Pressable
                  key={`hit-${r.month}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${monthLabel(r.month)}: Einnahmen ${formatEuro(r.income)}, Ausgaben ${formatEuro(r.expenses)}, Gewinn ${formatEuro(r.profit)}`}
                  onHoverIn={() => setActive(i)}
                  onHoverOut={() => setActive((a) => (a === i ? null : a))}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive((a) => (a === i ? null : a))}
                  onPress={() => onSelect?.(r.month)}
                  style={[styles.hit, { left: AXIS_W + band * i, width: band }]}
                />
              ))}

              {tip && (
                <View pointerEvents="none" style={[styles.tooltip, { left: tipLeft }]}>
                  <Text style={styles.tipTitle}>{monthLabel(tip.month)}</Text>
                  <TipRow color={SERIES.income.color} label="Einnahmen" value={tip.income} />
                  <TipRow color={SERIES.expenses.color} label="Ausgaben" value={tip.expenses} />
                  <View style={styles.tipDivider} />
                  <TipRow label={tip.profit < 0 ? 'Verlust' : 'Gewinn'} value={tip.profit} strong />
                </View>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function TipRow({ color, label, value, strong }: { color?: string; label: string; value: number; strong?: boolean }) {
  return (
    <View style={styles.tipRow}>
      {color ? <View style={[styles.tipSwatch, { backgroundColor: color }]} /> : <View style={styles.tipSwatchEmpty} />}
      <Text style={[styles.tipLabel, strong && styles.tipStrong]}>{label}</Text>
      <Text style={[styles.tipValue, strong && styles.tipStrong]}>{formatEuro(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md },
  legend: { flexDirection: 'row', gap: Spacing.lg, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { color: Colors.textMuted, fontSize: 13 },
  toggle: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  svg: { position: 'absolute', left: 0, top: 0 },
  tick: {
    position: 'absolute',
    left: 0,
    width: AXIS_W - 8,
    textAlign: 'right',
    color: Colors.textFaint,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  xLabel: { position: 'absolute', textAlign: 'center', color: Colors.textFaint, fontSize: 11 },
  xSelected: { color: Colors.text, fontWeight: '600' },
  hit: { position: 'absolute', top: 0, height: PLOT_H + X_LABEL_H + 8 },
  tooltip: {
    position: 'absolute',
    top: 4,
    width: 180,
    gap: 4,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
    boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
  },
  tipTitle: { color: Colors.text, fontSize: 13, fontWeight: '700', marginBottom: 2 },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tipSwatch: { width: 8, height: 8, borderRadius: 2 },
  tipSwatchEmpty: { width: 8 },
  tipLabel: { color: Colors.textMuted, fontSize: 12.5, flex: 1 },
  tipValue: { color: Colors.text, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  tipStrong: { color: Colors.text, fontWeight: '700' },
  tipDivider: { height: 1, backgroundColor: Colors.border, marginVertical: 2 },
  table: { borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' },
  tr: { flexDirection: 'row', paddingHorizontal: Spacing.md, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.border },
  thRow: { borderTopWidth: 0, backgroundColor: Colors.surfaceRaised },
  trSelected: { backgroundColor: Colors.surfaceRaised },
  th: { flex: 1, color: Colors.textFaint, fontSize: 12, fontWeight: '600', textAlign: 'right' },
  td: { flex: 1, color: Colors.text, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'] },
  tdMonth: { flex: 1.4, textAlign: 'left' },
  negative: { color: Colors.danger },
});
