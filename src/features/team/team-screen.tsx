import { router } from 'expo-router';
import { Crown, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Share, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ProBadge } from '@/components/ui/pro-badge';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing } from '@/constants/theme';
import { BUSINESS_SEATS } from '@/features/plan/plan-logic';
import { usePlan } from '@/features/plan/plan-provider';
import { copyText } from '@/features/social/copy-text';
import { useAuth } from '@/providers/auth-provider';

import { teamInvite, teamJoin, teamLeave, teamRemove, teamRevoke, useTeam } from './team-provider';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));

function inviteText(code: string, business: string | null) {
  return `Ich lade dich zu ${business ? `„${business}“` : 'unserem Business'} in Lunaxora ein. Öffne Lunaxora → Profil → Team → „Einem Team beitreten“ und gib diesen Code ein: ${code}`;
}

/** Profil → Team: Business-Team mit bis zu 5 Personen (z. B. eine GbR). */
export function TeamScreen() {
  const { user } = useAuth();
  const { team, missing, refresh } = useTeam();
  const plan = usePlan();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const role = team?.role ?? 'solo';
  const canInvite = plan.missing || plan.info?.plan === 'business' || plan.info?.plan === 'trial';
  const used = (team?.members.length || 1) + (team?.invites.length ?? 0);

  const run = async (key: string, fn: () => Promise<{ error?: string }>, success?: string) => {
    setBusy(key);
    setMessage(null);
    const r = await fn();
    setBusy(null);
    if (r.error) setMessage({ tone: 'error', text: r.error });
    else {
      if (success) setMessage({ tone: 'success', text: success });
      await refresh();
      await plan.refresh();
    }
  };

  const share = async (c: string) => {
    const text = inviteText(c, team?.owner_name ?? null);
    if (Platform.OS !== 'web') {
      await Share.share({ message: text });
      return;
    }
    setMessage(
      (await copyText(text))
        ? { tone: 'success', text: 'Einladung kopiert – schick sie per WhatsApp oder E-Mail.' }
        : { tone: 'error', text: `Kopieren ging nicht. Der Code lautet ${c}.` },
    );
  };

  return (
    <Screen maxWidth={680}>
      <PageHeader
        title="Dein Team"
        subtitle={`Mit Lunaxora Business arbeitet ihr mit bis zu ${BUSINESS_SEATS} Personen im selben Business – gleiche Kunden, Aufträge, Termine, Finanzen und Inventar. Jeder meldet sich mit seinem eigenen Konto an.`}
        back={{ label: 'Profil', onPress: back }}
        meta={<ProBadge kind="business" />}
      />
      {missing && (
        <Notice tone="error">Das Team ist in der Datenbank noch nicht eingerichtet (Skript 20261120090000_feinschliff.sql).</Notice>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {role === 'member' && (
        <Reveal delay={120}>
          <Card>
            <View style={styles.head}>
              <Users size={20} color={Colors.accent} />
              <Text style={styles.cardTitle}>Du bist im Team von {team?.owner_name ?? 'deinem Business'}</Text>
            </View>
            <Text style={styles.body}>
              Du arbeitest mit den Daten dieses Business. Das Abo läuft über den Inhaber.
            </Text>
          </Card>
        </Reveal>
      )}

      {(role !== 'solo' || (team?.members.length ?? 0) > 0) && (
        <Reveal delay={160}>
          <Card>
            <View style={styles.head}>
              <Text style={styles.cardTitle}>Mitglieder</Text>
              <Text style={styles.count}>
                {used} von {BUSINESS_SEATS}
              </Text>
            </View>
            {team?.members.map((m) => (
              <View key={m.id} style={styles.member}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{(m.name || '?').charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.flex}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{m.name}</Text>
                    {m.owner && <Crown size={14} color={Colors.accent} accessibilityLabel="Inhaber" />}
                    {m.id === user?.id && <Text style={styles.you}>Du</Text>}
                  </View>
                  {!!m.email && <Text style={styles.email}>{m.email}</Text>}
                </View>
                {role === 'owner' && !m.owner && (
                  <TextLink
                    label={busy === m.id ? 'Entferne …' : 'Entfernen'}
                    onPress={() => void run(m.id, () => teamRemove(m.id), `${m.name} ist nicht mehr im Team.`)}
                  />
                )}
              </View>
            ))}
            {role === 'member' && (
              <View style={styles.leave}>
                {confirmLeave ? (
                  <>
                    <Text style={styles.body}>
                      Team verlassen? Du siehst danach wieder nur deine eigenen Daten.
                    </Text>
                    <View style={styles.buttons}>
                      <Button
                        label="Ja, verlassen"
                        loading={busy === 'leave'}
                        onPress={() => void run('leave', teamLeave, 'Du hast das Team verlassen.')}
                      />
                      <Button label="Abbrechen" variant="secondary" onPress={() => setConfirmLeave(false)} />
                    </View>
                  </>
                ) : (
                  <TextLink label="Team verlassen" onPress={() => setConfirmLeave(true)} />
                )}
              </View>
            )}
          </Card>
        </Reveal>
      )}

      {role !== 'member' && (
        <Reveal delay={200}>
          <Card>
            <View style={styles.head}>
              <UserPlus size={20} color={Colors.accent} />
              <Text style={styles.cardTitle}>Person einladen</Text>
            </View>
            {!canInvite ? (
              <>
                <Text style={styles.body}>
                  Ein Team mit bis zu {BUSINESS_SEATS} Personen gibt es mit Lunaxora Business – ideal für eine GbR oder
                  wenn ihr zu mehreren arbeitet.
                </Text>
                <Button label="Business ansehen" onPress={() => router.push('/profil/abo')} />
              </>
            ) : (
              <>
                <Text style={styles.body}>
                  Schick der Person den Code – sie gibt ihn unter Profil → Team ein.
                </Text>
                <TextField
                  label="E-Mail (nur als Notiz, optional)"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholder="z. B. partner@beispiel.de"
                />
                <Button
                  label="Einladungscode erstellen"
                  loading={busy === 'invite'}
                  disabled={used >= BUSINESS_SEATS}
                  onPress={() =>
                    void run('invite', async () => {
                      const r = await teamInvite(email);
                      if (r.code) {
                        setEmail('');
                        void share(r.code);
                      }
                      return r;
                    })
                  }
                />
                {used >= BUSINESS_SEATS && <Text style={styles.hint}>Euer Team ist voll.</Text>}
              </>
            )}
            {!!team?.invites.length && (
              <View style={styles.invites}>
                <Text style={styles.label}>Offene Einladungen</Text>
                {team.invites.map((inv) => (
                  <View key={inv.code} style={styles.invite}>
                    <View style={styles.flex}>
                      <Text style={styles.code} selectable>
                        {inv.code}
                      </Text>
                      {!!inv.email && <Text style={styles.email}>{inv.email}</Text>}
                    </View>
                    <TextLink label={Platform.OS === 'web' ? 'Kopieren' : 'Teilen'} onPress={() => void share(inv.code)} />
                    <TextLink label="Zurückziehen" onPress={() => void run(inv.code, () => teamRevoke(inv.code))} />
                  </View>
                ))}
              </View>
            )}
          </Card>
        </Reveal>
      )}

      {role === 'solo' && (
        <Reveal delay={240}>
          <Card>
            <Text style={styles.cardTitle}>Einem Team beitreten</Text>
            <Text style={styles.body}>
              Code bekommen? Hier eingeben. Deine Daten bleiben gespeichert, im Team siehst du die des Business.
            </Text>
            <TextField
              label="Einladungscode"
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="z. B. 7K2P9QXA"
              maxLength={12}
            />
            <Button
              label="Beitreten"
              variant="secondary"
              loading={busy === 'join'}
              disabled={code.trim().length < 6}
              onPress={() =>
                void run('join', async () => {
                  const r = await teamJoin(code);
                  if (!r.error) setCode('');
                  return r;
                }, 'Willkommen im Team!')
              }
            />
          </Card>
        </Reveal>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
  count: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  hint: { color: Colors.textFaint, fontSize: 13 },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 6 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceRaised,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.text, fontWeight: '700', fontSize: 15 },
  flex: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  you: { color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
  email: { color: Colors.textMuted, fontSize: 12.5 },
  leave: { gap: Spacing.sm, marginTop: Spacing.sm },
  buttons: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  invites: { gap: Spacing.sm, marginTop: Spacing.sm },
  label: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  code: { color: Colors.text, fontSize: 16, fontWeight: '700', letterSpacing: 2, fontVariant: ['tabular-nums'] },
});
