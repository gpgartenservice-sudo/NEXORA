import { Check, Landmark, ShieldCheck } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { useHover } from '@/hooks/use-hover';

/** Knopf "Bank verbinden" – die Funktion kommt noch (Kontoanbindung über einen lizenzierten Anbieter). */
export function BankConnectButton({ open, onPress }: { open: boolean; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Bank verbinden (kommt bald)"
      aria-expanded={open}
      {...hoverProps}
      style={[styles.button, (hovered || open) && styles.buttonHover]}>
      <Landmark size={17} color={Colors.text} strokeWidth={1.9} />
      <Text style={styles.buttonText}>Bank verbinden</Text>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>bald</Text>
      </View>
    </Pressable>
  );
}

const PLANNED = [
  'Bezahlte Rechnungen erkennt NEXORA automatisch am Zahlungseingang',
  'Abbuchungen werden als Ausgaben vorgeschlagen – mit passender Kategorie',
  'Dein echter Kontostand direkt hier in den Finanzen',
];

/** Erklärung, was die Kontoanbindung bringen wird und warum sie sicher ist. */
export function BankComingSoon({ onClose }: { onClose: () => void }) {
  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Landmark size={22} color={Colors.accent} strokeWidth={1.8} />
        </View>
        <View style={styles.headTexts}>
          <Text style={styles.kicker}>KOMMT BALD</Text>
          <Text style={styles.title}>Bankkonto verbinden</Text>
        </View>
      </View>
      <Text style={styles.text}>Verbinde dein Geschäftskonto – dann musst du vieles nicht mehr selbst eintragen:</Text>
      {PLANNED.map((p) => (
        <View key={p} style={styles.row}>
          <View style={styles.check}>
            <Check size={12} color={Colors.onAccent} strokeWidth={3} />
          </View>
          <Text style={styles.rowText}>{p}</Text>
        </View>
      ))}
      <View style={styles.safe}>
        <ShieldCheck size={18} color={Colors.textMuted} strokeWidth={1.8} />
        <Text style={styles.safeText}>
          Sicher: Du meldest dich direkt bei deiner Bank an, NEXORA sieht nie dein Passwort und kann nur lesen – keine
          Überweisungen.
        </Text>
      </View>
      <Button label="Alles klar" variant="secondary" onPress={onClose} />
    </Card>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.lg,
  },
  buttonHover: { borderColor: Colors.borderFocus },
  buttonText: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  badge: { borderRadius: 999, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 7, paddingVertical: 1 },
  badgeText: { color: Colors.textMuted, fontSize: 11, fontWeight: '600' },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTexts: { gap: 2 },
  kicker: { color: Colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  text: { color: Colors.textMuted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: Colors.accent, alignItems: 'center', justifyContent: 'center' },
  rowText: { color: Colors.text, fontSize: 14.5, flex: 1, lineHeight: 20 },
  safe: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceRaised,
    padding: Spacing.md,
  },
  safeText: { color: Colors.textMuted, fontSize: 13, lineHeight: 18, flex: 1 },
});
