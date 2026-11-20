import { router } from 'expo-router';
import { ArrowLeftRight, Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { glassHover } from '@/components/ui/glass';
import { ProBadge } from '@/components/ui/pro-badge';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { EXTRA_COMPANY_PRICE, formatPrice } from '@/features/plan/plan-logic';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';

import type { Company } from './company-logic';
import { useCompanies } from './company-provider';

/** Profil: zwischen den Firmen des Kontos wechseln und eine weitere Firma hinzufügen. */
export function CompaniesCard() {
  const { companies, currentId, missing, switchTo } = useCompanies();
  if (missing || !companies) return null;
  const several = companies.list.length > 1;

  const open = (c: Company) => {
    if (c.id === currentId) return;
    playSound('tick');
    switchTo(c.id);
    router.replace('/home');
  };

  return (
    <Card>
      <View style={styles.head}>
        <Text style={styles.title}>Firmen</Text>
        <ProBadge />
      </View>
      {several ? (
        companies.list.map((c) => <CompanyRow key={c.id} company={c} current={c.id === currentId} onPress={() => open(c)} />)
      ) : (
        <Text style={styles.body}>
          Führe eine weitere Firma im selben Konto – mit eigenen Kunden, Rechnungen und eigenem Team. Je Firma{' '}
          {formatPrice(EXTRA_COMPANY_PRICE.month)} im Monat.
        </Text>
      )}
      <View style={styles.add}>
        <TextLink label="Weitere Firma hinzufügen" emphasis onPress={() => router.push('/profil/firma-hinzufuegen')} />
      </View>
    </Card>
  );
}

function CompanyRow({ company, current, onPress }: { company: Company; current: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      disabled={current}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      accessibilityLabel={current ? `${company.name}, gerade offen` : `Zu ${company.name} wechseln`}
      testID="switch-company"
      style={({ pressed }) => [styles.row, hovered && !current && [styles.rowHover, glassHover], pressed && styles.pressed]}>
      <View style={[styles.avatar, current && styles.avatarCurrent]}>
        <Text style={styles.avatarText}>{(company.name.trim()[0] ?? '?').toUpperCase()}</Text>
      </View>
      <View style={styles.texts}>
        <Text style={styles.name} numberOfLines={1}>
          {company.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {current ? 'Gerade offen' : company.role === 'member' ? 'Im Team' : 'Deine Firma'}
        </Text>
      </View>
      {current ? (
        <Check size={18} color={Colors.accent} strokeWidth={2.4} />
      ) : (
        <ArrowLeftRight size={17} color={Colors.textMuted} strokeWidth={1.9} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    marginHorizontal: -Spacing.sm,
    borderRadius: 12,
  },
  rowHover: { backgroundColor: 'rgba(255,255,255,0.05)' },
  pressed: { opacity: 0.7 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarCurrent: { backgroundColor: Colors.accentSoft },
  avatarText: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  texts: { flex: 1 },
  name: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  sub: { color: Colors.textFaint, fontSize: 12.5 },
  add: { alignItems: 'flex-start' },
});
