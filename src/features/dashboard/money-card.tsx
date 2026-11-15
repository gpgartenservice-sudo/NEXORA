import { router, useFocusEffect } from 'expo-router';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCountUp } from '@/components/motion/count-up';
import { burstMoney } from '@/components/motion/money-burst';
import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';
import { useCrm } from '@/features/crm/crm-provider';
import { formatEuro } from '@/features/crm/order-logic';
import { useFinance } from '@/features/finance/finance-provider';
import { monthLabel, monthKey } from '@/features/finance/finance-logic';

import { allTimeIncome, celebrationDone, monthNumbers, useCelebration, type MoneyNumbers } from './money';

const ZERO: MoneyNumbers = { income: 0, expenses: 0, profit: 0 };

/**
 * Startseite: Gewinn groß, Einnahmen kleiner, Ausgaben noch kleiner (laufender Monat).
 * Erscheint ab den ersten Einnahmen oder Ausgaben. Beim Öffnen der Startseite zählen die
 * Zahlen von 0 hoch; bei neuen Einnahmen (und beim App-Start) fliegen dazu Geldscheine.
 */
export function MoneyCard() {
  const { orders } = useCrm();
  const { expenses } = useFinance();
  const numbers = monthNumbers(orders, expenses);
  const hasAny = allTimeIncome(orders) > 0 || expenses.length > 0 || orders.some((o) => Number(o.expenses ?? 0) > 0);

  const celebration = useCelebration();
  const [focused, setFocused] = useState(false);
  // Jedes Mal, wenn die Startseite erscheint, zählen die Zahlen von 0 hoch
  const [replay, setReplay] = useState({ n: 1, from: ZERO });
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setReplay((r) => ({ n: r.n + 1, from: ZERO }));
      return () => setFocused(false);
    }, []),
  );

  useEffect(() => {
    if (!focused || !celebration) return;
    // kurz warten, bis die Seite eingeblendet ist
    const t = setTimeout(() => {
      setReplay((r) => ({ n: r.n + 1, from: celebration.from }));
      burstMoney(celebration.reason === 'start' ? 18 : 28);
      celebrationDone(celebration.id);
    }, 450);
    return () => clearTimeout(t);
  }, [focused, celebration]);

  const profit = useCountUp(numbers.profit, { from: replay.from.profit, replay: replay.n, duration: 1600 });
  const income = useCountUp(numbers.income, { from: replay.from.income, replay: replay.n, duration: 1400 });
  const spent = useCountUp(numbers.expenses, { from: replay.from.expenses, replay: replay.n, duration: 1200 });

  if (!hasAny) return null;

  return (
    <Card onPress={() => router.navigate('/finanzen')} accessibilityLabel="Finanzen öffnen">
      <View style={styles.head}>
        <Text style={styles.eyebrow}>DEIN GELD · {monthLabel(monthKey(new Date())).toUpperCase()}</Text>
        <ArrowRight size={16} color={Colors.textMuted} />
      </View>
      <View style={styles.row}>
        <View style={styles.main}>
          <Text style={styles.label}>Gewinn</Text>
          <Text
            style={[styles.profit, numbers.profit < 0 && styles.negative]}
            numberOfLines={1}
            adjustsFontSizeToFit
            testID="money-profit">
            {formatEuro(profit)}
          </Text>
        </View>
        <View style={styles.side}>
          <View style={styles.item}>
            <TrendingUp size={16} color={Colors.accent} />
            <View>
              <Text style={styles.label}>Einnahmen</Text>
              <Text style={styles.income} testID="money-income">
                {formatEuro(income)}
              </Text>
            </View>
          </View>
          <View style={styles.item}>
            <TrendingDown size={14} color={Colors.textMuted} />
            <View>
              <Text style={styles.labelSmall}>Ausgaben</Text>
              <Text style={styles.spent} testID="money-expenses">
                {formatEuro(spent)}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <Text style={styles.linkText}>Alle Zahlen in Finanzen</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: Spacing.xl },
  main: { gap: 2, flexGrow: 1, minWidth: 200 },
  side: { flexDirection: 'row', gap: Spacing.xl, alignItems: 'flex-end', flexWrap: 'wrap' },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  labelSmall: { color: Colors.textFaint, fontSize: 12, fontWeight: '600' },
  profit: {
    color: Colors.accent,
    fontSize: 46,
    fontWeight: '800',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  negative: { color: Colors.danger },
  income: { color: Colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'] },
  spent: { color: Colors.textMuted, fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  linkText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },
});
