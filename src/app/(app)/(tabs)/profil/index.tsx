import { router } from 'expo-router';
import {
  Bell,
  Building2,
  CreditCard,
  GraduationCap,
  Layers,
  Palette,
  Smartphone,
  UserRound,
  Users,
  Volume2,
} from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { ProBadge } from '@/components/ui/pro-badge';
import { SettingsGroup, SettingsRow } from '@/components/ui/settings-list';
import { ToggleSwitch } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { AccountSwitcher } from '@/features/accounts/account-switcher';
import { useCompanies } from '@/features/companies/company-provider';
import { missingSellerFields, sellerName } from '@/features/documents/document-logic';
import { useDocuments } from '@/features/documents/documents-provider';
import { industryLabel, stageLabel } from '@/features/onboarding/options';
import { hasTeamPlan, planLabel, quotaText } from '@/features/plan/plan-logic';
import { usePlan } from '@/features/plan/plan-provider';
import { useSoundSetting } from '@/features/sound/ui-sound';
import { ROLE_LABEL } from '@/features/team/roles';
import { useAccess, useTeam } from '@/features/team/team-provider';
import { TUTORIALS } from '@/features/tutorial/tutorial-content';
import { useTutorial } from '@/features/tutorial/tutorial-provider';
import { signOutHere } from '@/lib/device';
import { useAuth } from '@/providers/auth-provider';
import { useProfile } from '@/providers/profile-provider';

/**
 * Profil: kompakt als Liste – je Thema eine Zeile mit kurzem Stand, Details auf eigenen Seiten
 * (Angaben, Abo, Geräte, Firma, Firmen, Team, Design, Benachrichtigungen, Einführungen).
 */
export default function ProfileScreen() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const [signingOut, setSigningOut] = useState(false);
  const { seller } = useDocuments();
  const missing = missingSellerFields(seller, 'invoice');
  const name = profile?.display_name?.trim() || 'Dein Profil';
  const tutorial = useTutorial();
  const plan = usePlan();
  const [now] = useState(() => new Date());
  const { team } = useTeam();
  const access = useAccess();
  const { companies, currentId, missing: noCompanies } = useCompanies();
  const [sounds, setSounds] = useSoundSetting();
  const seen = tutorial.done.length;
  const total = Object.keys(TUTORIALS).length;

  const signOut = async () => {
    setSigningOut(true);
    // ist hier noch ein weiteres Konto angemeldet, geht es mit dem weiter
    const result = await signOutHere();
    router.replace(result === 'switched' ? '/home' : '/');
  };

  const kind = plan.info?.plan;
  const purple = kind === 'business' || kind === 'teams';
  const planText =
    plan.missing || !plan.info ? 'Gratis, Pro, Business und Teams im Vergleich' : `Lunaxora ${planLabel(plan.info, now)}`;
  const planSub =
    plan.missing || !plan.info ? null : plan.admin ? 'Admin-Zugang – kostenlos' : quotaText(plan.info, 'nexy');

  const answers = [stageLabel(profile?.stage), industryLabel(profile?.industry, profile?.industry_other)].filter(Boolean).join(' · ');
  const list = companies?.list ?? [];
  const current = list.find((c) => c.id === currentId);
  const teamText =
    team?.role === 'member'
      ? `Du bist ${ROLE_LABEL[access.role]} bei ${team.owner_name ?? 'einem Business'}`
      : team && team.members.length > 1
        ? `${team.members.length} von ${team.seats} Plätzen · Rollen und Rechte`
        : hasTeamPlan(kind)
          ? `Bis zu ${team?.seats ?? 5} Personen einladen – oder einem Team beitreten`
          : 'Mitarbeiter einladen – mit Business oder Teams';

  return (
    <Screen maxWidth={640}>
      <Reveal>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.headTexts}>
            <Text style={styles.title} numberOfLines={1}>
              {name}
            </Text>
            {!!user?.email && (
              <Text style={styles.subtitle} numberOfLines={1}>
                {user.email}
              </Text>
            )}
            {plan.info && !plan.missing && (
              <View style={[styles.planPill, purple && styles.planPillBusiness]} testID="profile-plan-pill">
                <Text style={[styles.planPillText, purple && styles.planPillTextBusiness]}>
                  {planLabel(plan.info, now)}
                  {plan.admin ? ' · Admin' : ''}
                  {team?.role === 'member' ? ` · ${ROLE_LABEL[access.role]}` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Reveal>

      <Reveal delay={120}>
        <SettingsGroup title="Konto">
          <SettingsRow icon={UserRound} label="Deine Angaben" value={answers || 'Name, Phase, Branche, Schwerpunkte'} onPress={() => router.push('/profil/angaben')} />
          <SettingsRow
            icon={CreditCard}
            label="Abo"
            value={planSub ? `${planText} · ${planSub}` : planText}
            onPress={() => router.push('/profil/abo')}
            testID="profile-plan"
          />
          <SettingsRow icon={Smartphone} label="Geräte" value="Wo dein Konto angemeldet ist" onPress={() => router.push('/profil/geraete')} />
        </SettingsGroup>
      </Reveal>

      <Reveal delay={180}>
        <SettingsGroup title="Firma & Team">
          {access.can('firma') && (
            <SettingsRow
              icon={Building2}
              label="Firma"
              value={
                missing.length === 0
                  ? `${sellerName(seller)} · ${seller.small_business ? 'Kleinunternehmer' : `${seller.vat_rate} % USt`}`
                  : `Für Rechnungen fehlt: ${missing.join(', ')}`
              }
              warn={missing.length > 0}
              onPress={() => router.navigate('/firma')}
            />
          )}
          {!noCompanies && !!companies && (
            <SettingsRow
              icon={Layers}
              label="Firmen"
              badge={list.length > 1 ? undefined : <ProBadge />}
              value={list.length > 1 ? `${current?.name ?? 'Firma'} offen · ${list.length} Firmen` : 'Weitere Firma im selben Konto führen'}
              onPress={() => router.push('/profil/firmen')}
            />
          )}
          <SettingsRow
            icon={Users}
            label="Team"
            badge={hasTeamPlan(kind) || team?.role === 'member' ? undefined : <ProBadge kind="business" />}
            value={teamText}
            onPress={() => router.push('/profil/team')}
          />
        </SettingsGroup>
      </Reveal>

      <Reveal delay={240}>
        <SettingsGroup title="App">
          <SettingsRow icon={Palette} label="Design" value="Luna mit Hut, Farbverlauf, Geldregen, Blitze" onPress={() => router.push('/profil/design')} />
          <SettingsRow
            icon={Bell}
            label="Benachrichtigungen"
            value="Termine, Rechnungen, Team-Chats, To-dos"
            onPress={() => router.push('/profil/benachrichtigungen')}
          />
          <SettingsRow
            icon={Volume2}
            label="Töne"
            value="Häkchen, Erfolge und wenn Luna fertig ist"
            onPress={() => setSounds(!sounds)}
            trailing={<ToggleSwitch value={sounds} />}
          />
          <SettingsRow
            icon={GraduationCap}
            label="Einführungen"
            value={`Gesehen: ${seen} von ${total}${tutorial.off ? ' · automatisch aus' : ''}`}
            onPress={() => router.push('/profil/einfuehrungen')}
          />
        </SettingsGroup>
      </Reveal>

      <Reveal delay={300}>
        <View style={styles.signOut}>
          <AccountSwitcher />
          <Button label="Abmelden" variant="secondary" onPress={signOut} loading={signingOut} />
        </View>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  signOut: { gap: Spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginTop: Spacing.sm, marginBottom: Spacing.xs },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 0 32px rgba(255,255,255,0.16)',
  },
  avatarText: { color: Colors.background, fontSize: 26, fontWeight: '800' },
  headTexts: { flex: 1, gap: 3, alignItems: 'flex-start', minWidth: 0 },
  title: { color: Colors.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { color: Colors.textMuted, fontSize: 14 },
  planPill: {
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.45)',
    backgroundColor: Colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  planPillBusiness: { borderColor: 'rgba(139,92,246,0.6)', backgroundColor: 'rgba(139,92,246,0.16)' },
  planPillText: { color: Colors.accent, fontSize: 12.5, fontWeight: '700', letterSpacing: 0.2 },
  planPillTextBusiness: { color: '#C4B5FD' },
});
