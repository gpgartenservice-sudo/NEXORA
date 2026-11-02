import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Colors, Spacing } from '@/constants/theme';

import type { Order } from './crm-provider';
import { computeStatus, finalPrice, formatEuro, isMonthly } from './order-logic';
import { StatusPill } from './status-pill';

/** Ein Auftrag als Zeile in einer Liste. */
export function OrderRow({ order, customerName }: { order: Order; customerName?: string }) {
  const price = finalPrice(order);
  return (
    <Card onPress={() => router.push(`/auftraege/${order.id}`)} accessibilityLabel={order.title}>
      <View style={styles.row}>
        <View style={styles.texts}>
          <Text style={styles.title} numberOfLines={1}>
            {order.title}
          </Text>
          <View style={styles.meta}>
            <StatusPill status={computeStatus(order)} />
            {!!customerName && (
              <Text style={styles.sub} numberOfLines={1}>
                {customerName}
              </Text>
            )}
          </View>
        </View>
        <Text style={styles.price}>
          {order.price === null ? '–' : formatEuro(price)}
          {order.price !== null && isMonthly(order) ? <Text style={styles.sub}> / Monat</Text> : null}
        </Text>
        <ChevronRight size={18} color={Colors.textFaint} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  texts: { flex: 1, gap: 6 },
  title: { color: Colors.text, fontSize: 16, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  sub: { color: Colors.textMuted, fontSize: 13 },
  price: { color: Colors.text, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
