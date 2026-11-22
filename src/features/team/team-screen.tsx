import { router, useFocusEffect } from 'expo-router';
import { ChevronDown, ChevronUp, Crown, ShieldCheck, UserPlus, Users } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Screen } from '@/components/layout/screen';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ProBadge } from '@/components/ui/pro-badge';
import { Segmented } from '@/components/ui/segmented';
import { TextLink } from '@/components/ui/text-link';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing } from '@/constants/theme';
import { useCompanies } from '@/features/companies/company-provider';
import { BUSINESS_SEATS, hasTeamPlan, TEAMS_SEATS } from '@/features/plan/plan-logic';
import { usePlan } from '@/features/plan/plan-provider';
import { copyText } from '@/features/social/copy-text';
import { playSound } from '@/features/sound/ui-sound';
import { useAuth } from '@/providers/auth-provider';

import {
  accessSummary,
  AREAS,
  isEmployer,
  ROLE_HINT,
  ROLE_LABEL,
  type Access,
  type Area,
  type EditableRole,
  type Level,
  type MemberRole,
} from './roles';
import {
  teamInvite,
  teamJoin,
  teamLeave,
  teamRemove,
  teamRevoke,
  teamSetAccess,
  teamSetMember,
  useAccess,
  useTeam,
  type TeamMember,
} from './team-provider';

const back = () => (router.canGoBack() ? router.back() : router.navigate('/profil'));
type InviteRole = Exclude<MemberRole, 'inhaber'>;

function joinedText(at: string | null) {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : `seit ${d.toLocaleDateString('de-DE')}`;
}

function inviteText(code: string, business: string | null) {
  return `Ich lade dich zu ${business ? `„${business}“` : 'unserem Business'} in Lunaxora ein. Öffne Lunaxora → Profil → Team → „Einem Team beitreten“ und gib diesen Code ein: ${code}`;
}

type Message = { tone: 'success' | 'error'; text: string } | null;

/**
 * Profil → Team: Mitglieder mit Rollen, Rechte je Rolle, Einladen und Beitreten.
 * Business: bis zu 5 Personen, Teams: bis zu 30 (Inhaber, Mitgründer, Teamleitung, Mitarbeiter).
 */
export function TeamScreen() {
  const { user } = useAuth();
  const { team, missing, refresh } = useTeam();
  const access = useAccess();
  const plan = usePlan();
  const companies = useCompanies();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  // Solange die Seite offen ist, alle paar Sekunden nachsehen – so taucht jemand, der gerade
  // auf seinem Gerät beitritt, hier sofort auf.
  useFocusEffect(
    useCallback(() => {
      void refresh();
      const timer = setInterval(() => void refresh(), 5000);
      return () => clearInterval(timer);
    }, [refresh]),
  );

  // Neu beigetreten → kurz Bescheid geben
  const knownIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!team) return;
    const ids = new Set(team.members.map((m) => m.id));
    const before = knownIds.current;
    knownIds.current = ids;
    if (!before || !isEmployer(team.my_role)) return;
    const joined = team.members.filter((m) => !before.has(m.id) && !m.owner);
    if (joined.length) {
      setMessage({ tone: 'success', text: `${joined.map((m) => m.name).join(', ')} ist jetzt in deinem Team. 🎉` });
      playSound('success');
    }
  }, [team]);

  const role = team?.role ?? 'solo';
  const employer = access.employer;
  const planKind = team?.plan ?? plan.info?.plan ?? null;
  const canInvite = plan.missing || hasTeamPlan(planKind);
  const seats = team?.seats ?? BUSINESS_SEATS;
  const used = team?.seats_used ?? 1;
  const full = used >= seats;

  const run = async (key: string, fn: () => Promise<{ error?: string; companyId?: string }>, success?: string) => {
    setBusy(key);
    setMessage(null);
    const r = await fn();
    setBusy(null);
    if (r.error) setMessage({ tone: 'error', text: r.error });
    else {
      if (success) setMessage({ tone: 'success', text: success });
      await refresh();
      await plan.refresh();
      // Beigetreten → diese Firma öffnen; verlassen → Firmenliste neu (zurück zur Standard-Firma)
      if (key === 'join' || key === 'leave') await companies.reload(r.companyId);
    }
    return r;
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

  const subtitle =
    role === 'solo' && !canInvite
      ? 'Arbeite mit Mitgründern und Mitarbeitern in einer Firma – jeder mit eigenem Konto.'
      : `${used} von ${seats} Plätzen${planKind === 'teams' ? ' · Lunaxora Teams' : planKind === 'business' ? ' · Lunaxora Business' : ''}`;

  return (
    <Screen maxWidth={720}>
      <PageHeader
        title="Dein Team"
        subtitle={subtitle}
        back={{ label: 'Profil', onPress: back }}
        meta={<ProBadge kind="business" />}
      />
      {missing && (
        <Notice tone="error">Das Team ist in der Datenbank noch nicht eingerichtet (Skript 20261120090000_feinschliff.sql).</Notice>
      )}
      {message && <Notice tone={message.tone}>{message.text}</Notice>}

      {role === 'member' && !employer && team && (
        <Reveal delay={100}>
          <Card>
            <View style={styles.head}>
              <Users size={20} color={Colors.accent} />
              <Text style={styles.cardTitle}>Du bist im Team von {team.owner_name ?? 'deinem Business'}</Text>
            </View>
            <View style={styles.rolePill}>
              <Text style={styles.rolePillText}>{ROLE_LABEL[team.my_role]}</Text>
            </View>
            <Text style={styles.body}>{team.access ? accessSummary(team.access) : ROLE_HINT[team.my_role]}</Text>
            <Text style={styles.hint}>Dazu kommen immer: Arbeitsplan, Urlaub beantragen, krank melden und der Team-Chat.</Text>
          </Card>
        </Reveal>
      )}

      {(role !== 'solo' || (team?.members.length ?? 0) > 1) && team && (
        <Reveal delay={140}>
          <Card>
            <View style={styles.head}>
              <Text style={styles.cardTitle}>Mitarbeiter</Text>
              <Text style={styles.count}>
                {team.members.length} {team.members.length === 1 ? 'Person' : 'Personen'}
              </Text>
            </View>
            {team.members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                me={user?.id ?? ''}
                myRole={team.my_role}
                onSaved={async (text) => {
                  setMessage({ tone: 'success', text });
                  await refresh();
                }}
                onError={(text) => setMessage({ tone: 'error', text })}
              />
            ))}
            {employer && team.members.length === 1 && (
              <Text style={styles.hint}>Noch niemand beigetreten – lade unten jemanden ein.</Text>
            )}
            {role === 'member' && (
              <View style={styles.leave}>
                {confirmLeave ? (
                  <>
                    <Text style={styles.body}>Team verlassen? Du siehst danach wieder nur deine eigenen Daten.</Text>
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

      {employer && canInvite && team && (
        <Reveal delay={180}>
          <RolesCard
            roles={team.roles}
            onError={(text) => setMessage({ tone: 'error', text })}
            onSaved={() => void refresh()}
          />
        </Reveal>
      )}

      {employer && (
        <Reveal delay={220}>
          <InviteCard
            canInvite={canInvite}
            full={full}
            seats={seats}
            myRole={team?.my_role ?? 'inhaber'}
            busy={busy}
            invites={team?.invites ?? []}
            onInvite={(email, r) =>
              run('invite', async () => {
                const res = await teamInvite(email, r);
                if (res.code) void share(res.code);
                return res;
              })
            }
            onShare={(c) => void share(c)}
            onRevoke={(c) => void run(c, () => teamRevoke(c), 'Einladung zurückgezogen.')}
          />
        </Reveal>
      )}

      {role === 'solo' && (
        <Reveal delay={260}>
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
                void run(
                  'join',
                  async () => {
                    const r = await teamJoin(code);
                    if (!r.error) setCode('');
                    return r;
                  },
                  'Willkommen im Team!',
                )
              }
            />
          </Card>
        </Reveal>
      )}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Eine Person: Rolle, Bezeichnung, Urlaubstage, entfernen
// ---------------------------------------------------------------------------
function MemberRow({
  member: m,
  me,
  myRole,
  onSaved,
  onError,
}: {
  member: TeamMember;
  me: string;
  myRole: MemberRole;
  onSaved: (text: string) => Promise<void>;
  onError: (text: string) => void;
}) {
  const editable = isEmployer(myRole) && !m.owner && m.id !== me && !(myRole !== 'inhaber' && m.role === 'mitgruender');
  const [open, setOpen] = useState(false);
  const [roleDraft, setRoleDraft] = useState<InviteRole>(m.role === 'inhaber' ? 'mitgruender' : m.role);
  const [title, setTitle] = useState(m.title ?? '');
  const [days, setDays] = useState(m.vacation_days != null ? String(m.vacation_days).replace('.', ',') : '24');
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Neue Daten vom Server (und gerade nicht am Bearbeiten): Entwurf nachziehen
  const snapshot = `${m.role}|${m.title ?? ''}|${m.vacation_days ?? ''}`;
  const [seen, setSeen] = useState(snapshot);
  if (!open && snapshot !== seen) {
    setSeen(snapshot);
    setRoleDraft(m.role === 'inhaber' ? 'mitgruender' : m.role);
    setTitle(m.title ?? '');
    setDays(m.vacation_days != null ? String(m.vacation_days).replace('.', ',') : '24');
  }

  const save = async () => {
    const n = Number(days.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 60) {
      onError('Bitte zwischen 0 und 60 Urlaubstagen eintragen.');
      return;
    }
    setBusy('save');
    const r = await teamSetMember(m.id, { role: roleDraft, title: title.trim(), vacationDays: n });
    setBusy(null);
    if (r.error) onError(r.error);
    else {
      setOpen(false);
      playSound('check');
      await onSaved(`${m.name} gespeichert.`);
    }
  };

  const remove = async () => {
    setBusy('remove');
    const r = await teamRemove(m.id);
    setBusy(null);
    if (r.error) onError(r.error);
    else await onSaved(`${m.name} ist nicht mehr im Team.`);
  };

  const roleOptions: { value: InviteRole; label: string }[] = [
    ...(myRole === 'inhaber' ? [{ value: 'mitgruender' as const, label: 'Mitgründer' }] : []),
    { value: 'teamleitung', label: 'Teamleitung' },
    { value: 'mitarbeiter', label: 'Mitarbeiter' },
  ];
  const sub = [ROLE_LABEL[m.role], m.title, m.owner ? null : joinedText(m.joined_at)].filter(Boolean).join(' · ');

  return (
    <View>
      <Pressable
        onPress={editable ? () => setOpen((o) => !o) : undefined}
        disabled={!editable}
        accessibilityRole={editable ? 'button' : undefined}
        accessibilityLabel={editable ? `${m.name} bearbeiten` : undefined}
        style={({ pressed }) => [styles.member, pressed && styles.pressed]}>
        <View style={[styles.avatar, isEmployer(m.role) && styles.avatarOwner]}>
          <Text style={styles.avatarText}>{(m.name || '?').charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {m.name}
            </Text>
            {m.owner && <Crown size={14} color={Colors.accent} accessibilityLabel="Inhaber" />}
            {m.role === 'mitgruender' && <ShieldCheck size={14} color="#C4B5FD" accessibilityLabel="Mitgründer" />}
            {m.id === me && <Text style={styles.you}>Du</Text>}
          </View>
          <Text style={styles.email} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {editable && (open ? <ChevronUp size={18} color={Colors.textFaint} /> : <ChevronDown size={18} color={Colors.textFaint} />)}
      </Pressable>
      {open && (
        <View style={styles.editor}>
          <Segmented label="Rolle" value={roleDraft} options={roleOptions} onChange={setRoleDraft} />
          <Text style={styles.hint}>{ROLE_HINT[roleDraft]}</Text>
          <View style={styles.fields}>
            <View style={styles.flex}>
              <TextField label="Bezeichnung (optional)" value={title} onChangeText={setTitle} placeholder="z. B. Gärtner" maxLength={60} />
            </View>
            <View style={styles.daysField}>
              <TextField label="Urlaub/Jahr" value={days} onChangeText={setDays} keyboardType="decimal-pad" placeholder="24" />
            </View>
          </View>
          <View style={styles.buttons}>
            <Button label="Speichern" loading={busy === 'save'} disabled={!!busy} onPress={() => void save()} />
            <Button label="Schließen" variant="secondary" onPress={() => setOpen(false)} />
          </View>
          {confirmRemove ? (
            <View style={styles.confirm}>
              <Text style={styles.body}>
                {m.name} aus dem Team entfernen? Danach sind nur noch die eigenen Daten sichtbar – eure gemeinsamen Daten bleiben bei euch.
              </Text>
              <View style={styles.buttons}>
                <Button label="Ja, entfernen" loading={busy === 'remove'} onPress={() => void remove()} />
                <Button label="Abbrechen" variant="secondary" onPress={() => setConfirmRemove(false)} />
              </View>
            </View>
          ) : (
            <TextLink label="Aus dem Team entfernen" onPress={() => setConfirmRemove(true)} />
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Rechte je Rolle
// ---------------------------------------------------------------------------
const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'off', label: 'Aus' },
  { value: 'read', label: 'Ansehen' },
  { value: 'write', label: 'Bearbeiten' },
];

function RolesCard({
  roles,
  onSaved,
  onError,
}: {
  roles: Record<EditableRole, Access>;
  onSaved: () => void;
  onError: (text: string) => void;
}) {
  const [role, setRole] = useState<EditableRole>('mitarbeiter');
  const [draft, setDraft] = useState(roles);
  // Neue Daten vom Server übernehmen, solange gerade nichts gespeichert wird
  const saving = useRef(0);
  useEffect(() => {
    if (!saving.current) setDraft(roles);
  }, [roles]);

  const change = async (area: Area, level: Level) => {
    const before = draft[role][area];
    if (before === level) return;
    setDraft((d) => ({ ...d, [role]: { ...d[role], [area]: level } }));
    saving.current++;
    const r = await teamSetAccess(role, { [area]: level });
    saving.current--;
    if (r.error) {
      setDraft((d) => ({ ...d, [role]: { ...d[role], [area]: before } }));
      onError(r.error);
    } else onSaved();
  };

  const current = draft[role];
  return (
    <Card>
      <View style={styles.head}>
        <ShieldCheck size={20} color={Colors.accent} />
        <Text style={styles.cardTitle}>Rollen & Rechte</Text>
      </View>
      <Text style={styles.body}>
        Inhaber und Mitgründer sehen immer alles. Für Teamleitung und Mitarbeiter stellst du hier ein, was sie sehen und
        bearbeiten dürfen.
      </Text>
      <Segmented
        value={role}
        onChange={setRole}
        options={[
          { value: 'teamleitung', label: 'Teamleitung' },
          { value: 'mitarbeiter', label: 'Mitarbeiter' },
        ]}
      />
      <View style={styles.areas}>
        {AREAS.map((a) =>
          a.toggle ? (
            <ToggleRow
              key={a.key}
              label={a.label}
              hint={a.hint}
              value={current[a.key] === 'write'}
              onChange={(v) => void change(a.key, v ? 'write' : 'off')}
            />
          ) : (
            <View key={a.key} style={styles.area}>
              <View style={styles.flex}>
                <Text style={styles.areaLabel}>{a.label}</Text>
                <Text style={styles.areaHint}>{a.hint}</Text>
              </View>
              <LevelPicker label={a.label} value={current[a.key]} onChange={(v) => void change(a.key, v)} />
            </View>
          ),
        )}
      </View>
      <Text style={styles.hint}>Arbeitsplan, Urlaub beantragen, krank melden und der Team-Chat gehen immer.</Text>
    </Card>
  );
}

function LevelPicker({ label, value, onChange }: { label: string; value: Level; onChange: (v: Level) => void }) {
  return (
    <View style={styles.levels} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {LEVEL_OPTIONS.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (!active) playSound('tick');
              onChange(o.value);
            }}
            accessibilityRole="radio"
            accessibilityLabel={`${label}: ${o.label}`}
            accessibilityState={{ checked: active }}
            aria-checked={active}
            style={[styles.level, active && (o.value === 'off' ? styles.levelOff : styles.levelOn)]}>
            <Text style={[styles.levelText, active && styles.levelTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Einladen
// ---------------------------------------------------------------------------
function InviteCard({
  canInvite,
  full,
  seats,
  myRole,
  busy,
  invites,
  onInvite,
  onShare,
  onRevoke,
}: {
  canInvite: boolean;
  full: boolean;
  seats: number;
  myRole: MemberRole;
  busy: string | null;
  invites: { code: string; email: string | null; role: MemberRole }[];
  onInvite: (email: string, role: InviteRole) => Promise<{ error?: string }>;
  onShare: (code: string) => void;
  onRevoke: (code: string) => void;
}) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InviteRole>('mitarbeiter');
  const options: { value: InviteRole; label: string }[] = [
    ...(myRole === 'inhaber' ? [{ value: 'mitgruender' as const, label: 'Mitgründer' }] : []),
    { value: 'teamleitung', label: 'Teamleitung' },
    { value: 'mitarbeiter', label: 'Mitarbeiter' },
  ];
  return (
    <Card>
      <View style={styles.head}>
        <UserPlus size={20} color={Colors.accent} />
        <Text style={styles.cardTitle}>Person einladen</Text>
      </View>
      {!canInvite ? (
        <>
          <Text style={styles.body}>
            Ein Team gibt es mit Lunaxora Business (bis {BUSINESS_SEATS} Personen) und Teams (bis {TEAMS_SEATS}) – mit Rollen,
            Chats, Arbeitsplan und Urlaubsanträgen.
          </Text>
          <Button label="Business und Teams ansehen" onPress={() => router.push('/profil/abo')} />
        </>
      ) : (
        <>
          <Segmented label="Als" value={role} options={options} onChange={setRole} />
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
            disabled={full}
            onPress={() =>
              void onInvite(email, role).then((r) => {
                if (!r.error) setEmail('');
              })
            }
          />
          <Text style={styles.hint}>
            {full
              ? seats < TEAMS_SEATS
                ? `Euer Team ist voll. Mit Lunaxora Teams habt ihr Platz für ${TEAMS_SEATS} Personen.`
                : 'Euer Team ist voll.'
              : 'Die Person gibt den Code unter Profil → Team ein – oder gleich bei der Anmeldung.'}
          </Text>
        </>
      )}
      {!!invites.length && (
        <View style={styles.invites}>
          <Text style={styles.label}>OFFENE EINLADUNGEN</Text>
          {invites.map((inv) => (
            <View key={inv.code} style={styles.invite}>
              <View style={styles.flex}>
                <Text style={styles.code} selectable>
                  {inv.code}
                </Text>
                <Text style={styles.email}>{[ROLE_LABEL[inv.role], inv.email].filter(Boolean).join(' · ')}</Text>
              </View>
              <TextLink label={Platform.OS === 'web' ? 'Kopieren' : 'Teilen'} onPress={() => onShare(inv.code)} />
              <TextLink label={busy === inv.code ? 'Ziehe zurück …' : 'Zurückziehen'} onPress={() => onRevoke(inv.code)} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitle: { color: Colors.text, fontSize: 17, fontWeight: '700', flex: 1 },
  count: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  body: { color: Colors.textMuted, fontSize: 14.5, lineHeight: 21 },
  hint: { color: Colors.textFaint, fontSize: 13, lineHeight: 18 },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 7 },
  pressed: { opacity: 0.7 },
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
  avatarOwner: { borderColor: Colors.accent },
  avatarText: { color: Colors.text, fontWeight: '700', fontSize: 15 },
  flex: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: Colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 },
  you: { color: Colors.textFaint, fontSize: 12, fontWeight: '700' },
  email: { color: Colors.textMuted, fontSize: 12.5 },
  editor: {
    gap: Spacing.md,
    marginLeft: 36 + Spacing.md,
    marginBottom: Spacing.md,
    paddingTop: Spacing.xs,
  },
  fields: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  daysField: { width: 120 },
  confirm: { gap: Spacing.sm },
  leave: { gap: Spacing.sm, marginTop: Spacing.sm },
  buttons: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  rolePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(47,227,154,0.45)',
    backgroundColor: Colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  rolePillText: { color: Colors.accent, fontSize: 12.5, fontWeight: '700' },
  areas: { gap: Spacing.md },
  area: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, flexWrap: 'wrap' },
  areaLabel: { color: Colors.text, fontSize: 15, fontWeight: '500' },
  areaHint: { color: Colors.textFaint, fontSize: 12.5 },
  levels: {
    flexDirection: 'row',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    padding: 3,
    gap: 3,
  },
  level: { paddingHorizontal: 10, height: 30, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  levelOn: { backgroundColor: Colors.accentSoft, borderWidth: 1, borderColor: 'rgba(47,227,154,0.45)' },
  levelOff: { backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.borderFocus },
  levelText: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  levelTextActive: { color: Colors.text },
  invites: { gap: Spacing.sm, marginTop: Spacing.sm },
  label: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  code: { color: Colors.text, fontSize: 16, fontWeight: '700', letterSpacing: 2, fontVariant: ['tabular-nums'] },
});
