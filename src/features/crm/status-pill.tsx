import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/constants/theme';

import { STATUS_LABEL, statusGroup, type OrderStatus } from './order-logic';

const GROUP_STYLE = {
  new: { bg: 'rgba(255,255,255,0.08)', fg: Colors.text, border: 'rgba(255,255,255,0.18)' },
  progress: { bg: 'rgba(245,185,74,0.10)', fg: '#F5B94A', border: 'rgba(245,185,74,0.35)' },
  done: { bg: Colors.accentSoft, fg: Colors.accent, border: 'rgba(47,227,154,0.4)' },
  cancelled: { bg: 'rgba(255,107,107,0.08)', fg: Colors.danger, border: 'rgba(255,107,107,0.35)' },
} as const;

/** Farbige Kennzeichnung des Auftrags-Status. */
export function StatusPill({ status }: { status: OrderStatus }) {
  const s = GROUP_STYLE[statusGroup(status)];
  return (
    <View style={[styles.pill, { backgroundColor: s.bg, borderColor: s.border }]}>
      <View style={[styles.dot, { backgroundColor: s.fg }]} />
      <Text style={[styles.text, { color: s.fg }]} numberOfLines={1}>
        {STATUS_LABEL[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 12, fontWeight: '600' },
});
