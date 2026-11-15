import { router } from 'expo-router';
import { Check, CloudLightning, Moon, Palette, Sparkles, Square, Banknote as BanknoteIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Card } from '@/components/ui/card';
import { GradientFill } from '@/components/ui/gradient';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ProBadge } from '@/components/ui/pro-badge';
import { Colors, Spacing } from '@/constants/theme';
import { usePlan, useProGate } from '@/features/plan/plan-provider';
import { useHover } from '@/hooks/use-hover';
import { useProfile } from '@/providers/profile-provider';

import { BACKGROUNDS, isBackgroundKey, type BackgroundKey } from './backgrounds';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));

const ICONS: Record<BackgroundKey, typeof Square> = {
  none: Square,
  aurora: Sparkles,
  business: Palette,
  money: BanknoteIcon,
  lightning: CloudLightning,
  stars: Moon,
};

/** Profil → Design (Pro/Business): Hintergrund der ganzen App wählen – wirkt sofort. */
export function DesignScreen() {
  const { profile, save } = useProfile();
  const { pro } = usePlan();
  const gate = useProGate();
  const current: BackgroundKey = isBackgroundKey(profile?.design?.background) ? profile.design.background : 'none';
  const [busy, setBusy] = useState<BackgroundKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (key: BackgroundKey) => {
    if (key !== 'none' && !gate('design')) return;
    setBusy(key);
    setError(null);
    const r = await save({ design: { ...(profile?.design ?? {}), background: key } });
    setBusy(null);
    if (r.error) setError(r.error);
  };

  return (
    <Screen maxWidth={760}>
      <PageHeader
        title="Design"
        subtitle="Gib Lunaxora deinen Look: ein bewegter Hintergrund hinter allen Seiten. Die Wahl gilt sofort – schau einfach hinter diese Seite."
        back={{ label: 'Profil', onPress: back }}
        meta={<ProBadge />}
      />
      {!pro && <Notice>Design-Einstellungen gibt es mit Lunaxora Pro und Business.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <View style={styles.grid}>
        {BACKGROUNDS.map((b, i) => (
          <Reveal key={b.key} delay={120 + i * 60} style={styles.cell}>
            <Option
              keyName={b.key}
              title={b.title}
              text={b.text}
              selected={current === b.key && (pro || b.key === 'none')}
              loading={busy === b.key}
              locked={!pro && b.key !== 'none'}
              onPress={() => void choose(b.key)}
            />
          </Reveal>
        ))}
      </View>
      <Card>
        <Text style={styles.hint}>
          Tipp: Bei „Bewegung reduzieren“ in den Bedienungshilfen deines Geräts bleibt der Hintergrund ruhig.
        </Text>
      </Card>
    </Screen>
  );
}

function Option({
  keyName,
  title,
  text,
  selected,
  loading,
  locked,
  onPress,
}: {
  keyName: BackgroundKey;
  title: string;
  text: string;
  selected: boolean;
  loading: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  const Icon = ICONS[keyName];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      {...hoverProps}
      style={[styles.option, selected && styles.optionSelected, hovered && styles.optionHover]}>
      <View style={styles.preview}>
        {keyName === 'business' && <GradientFill opacity={0.55} />}
        {keyName === 'aurora' && <GradientFill colors={['#0EA5A4', '#2FE39A', '#3B82F6']} opacity={0.4} />}
        <Icon size={26} color={keyName === 'none' ? Colors.textMuted : Colors.text} strokeWidth={1.6} />
      </View>
      <View style={styles.optionHead}>
        <Text style={styles.title}>{title}</Text>
        {selected ? <Check size={18} color={Colors.accent} strokeWidth={2.6} /> : locked ? <ProBadge /> : null}
      </View>
      <Text style={styles.text}>{loading ? 'Wird gespeichert …' : text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  cell: { flexGrow: 1, flexBasis: 200 },
  option: {
    gap: Spacing.sm,
    padding: Spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionSelected: { borderColor: Colors.accent },
  optionHover: { backgroundColor: Colors.surfaceRaised },
  preview: {
    height: 84,
    borderRadius: 12,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  optionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm },
  title: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  text: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  hint: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 20 },
});
