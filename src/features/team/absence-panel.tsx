import { CalendarPlus, Check, Thermometer, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';
import { supabase } from '@/lib/supabase';

import { PersonDot } from './chat-list';
import { Chip } from './chip';
import {
  dayIso,
  KIND_LABEL,
  rangeLabel,
  STATUS_LABEL,
  vacationDays,
  workingDays,
  type Absence,
  type AbsenceKind,
  type AbsenceStatus,
} from './staff-logic';
import { staffErrorText, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam, type TeamMember } from './team-provider';

const COLS = 'id, member_id, kind, starts_on, ends_on, note, status, decided_by, decided_at, decision_note, created_at';

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const daysText = (n: number) => `${fmt(n)} ${n === 1 ? 'Arbeitstag' : 'Arbeitstage'}`;

/**
 * Team → Urlaub: Urlaub oder frei beantragen, krank melden, eigenes Urlaubskonto.
 * Wer „Personal“ hat, genehmigt Anträge mit einem Tipp und sieht die Urlaubskonten aller.
 */
export function AbsencePanel() {
  const { team } = useTeam();
  const access = useAccess();
  const hub = useTeamHub();
  const ws = team?.owner_id ?? '';
  const me = hub.me;
  const hr = access.hr;
  const year = new Date().getFullYear();

  const [list, setList] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AbsenceKind | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    const { data, error: err } = await supabase
      .from('absences')
      .select(COLS)
      .eq('company_id', ws)
      .gte('ends_on', `${year - 1}-12-01`)
      .order('starts_on', { ascending: false });
    setLoading(false);
    if (err) return setError(staffErrorText(err, 'Die Anträge konnten nicht geladen werden.'));
    setError(null);
    setList((data ?? []) as Absence[]);
  }, [ws, year]);

  useEffect(() => {
    // erst nach dem Zeichnen laden (kein setState direkt im Effekt)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, hub.absenceVersion]);

  const members = useMemo(() => team?.members ?? [], [team?.members]);
  const meMember = members.find((m) => m.id === me);
  const mine = list.filter((a) => a.member_id === me);
  const open = hr ? list.filter((a) => a.status === 'offen' && a.member_id !== me).reverse() : [];
  const today = dayIso(new Date());
  const sickToday = hr ? list.filter((a) => a.kind === 'krank' && a.starts_on <= today && a.ends_on >= today) : [];

  const reloadAll = () => {
    void load();
    void hub.refreshAbsences();
  };

  return (
    <View style={styles.wrap}>
      {!!error && <Notice tone="error">{error}</Notice>}
      {!!done && <Notice tone="success">{done}</Notice>}

      {/* Eigenes Urlaubskonto + Knöpfe */}
      <Card>
        {meMember?.vacation_days != null && <Balance member={meMember} list={list} year={year} />}
        {form ? (
          <AbsenceForm
            kind={form}
            ws={ws}
            hr={hr}
            members={members}
            me={me}
            onClose={() => setForm(null)}
            onSaved={(text) => {
              setForm(null);
              setDone(text);
              reloadAll();
            }}
          />
        ) : (
          <View style={styles.actions}>
            <ActionButton icon="urlaub" label="Urlaub beantragen" onPress={() => { setDone(null); setForm('urlaub'); }} />
            <ActionButton icon="frei" label="Frei beantragen" onPress={() => { setDone(null); setForm('frei'); }} />
            <ActionButton icon="krank" label="Krank melden" onPress={() => { setDone(null); setForm('krank'); }} />
          </View>
        )}
      </Card>

      {/* Leitung: offene Anträge */}
      {hr && (
        <>
          <Text style={styles.section}>OFFENE ANTRÄGE{open.length ? ` · ${open.length}` : ''}</Text>
          <Card>
            {!loading && open.length === 0 && <Text style={styles.none}>Keine offenen Anträge. 👍</Text>}
            {open.map((a, i) => (
              <RequestRow key={a.id} absence={a} first={i === 0} list={list} year={year} onDone={reloadAll} onError={setError} />
            ))}
          </Card>
          {sickToday.length > 0 && (
            <Notice tone="info">
              Heute krank: {sickToday.map((a) => hub.nameOf(a.member_id)).join(', ')}
            </Notice>
          )}
        </>
      )}

      {/* Eigene Anträge */}
      <Text style={styles.section}>DEINE ANTRÄGE</Text>
      <Card>
        {!loading && mine.length === 0 && <Text style={styles.none}>Noch nichts beantragt.</Text>}
        {mine.slice(0, 30).map((a, i) => (
          <OwnRow key={a.id} absence={a} first={i === 0} onRemoved={reloadAll} onError={setError} />
        ))}
      </Card>

      {/* Leitung: Urlaubskonten aller */}
      {hr && members.some((m) => m.vacation_days != null && m.id !== me) && (
        <>
          <Text style={styles.section}>URLAUBSKONTEN {year}</Text>
          <Card>
            {members
              .filter((m) => m.vacation_days != null && m.id !== me)
              .map((m, i) => (
                <AccountRow key={m.id} member={m} list={list} year={year} first={i === 0} />
              ))}
          </Card>
        </>
      )}
    </View>
  );
}

function Balance({ member, list, year }: { member: TeamMember; list: Absence[]; year: number }) {
  const total = member.vacation_days ?? 0;
  const { approved, pending } = vacationDays(list, member.id, year);
  const left = total - approved;
  const share = total > 0 ? Math.min(1, approved / total) : 0;
  const pendingShare = total > 0 ? Math.min(1 - share, pending / total) : 0;
  return (
    <View style={styles.balance}>
      <View style={styles.balanceHead}>
        <Text style={styles.balanceBig}>{fmt(left)}</Text>
        <Text style={styles.balanceText}>
          von {fmt(total)} Urlaubstagen {year} übrig{pending ? ` · ${fmt(pending)} beantragt` : ''}
        </Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barUsed, { flex: share }]} />
        <View style={[styles.barPending, { flex: pendingShare }]} />
        <View style={{ flex: Math.max(0, 1 - share - pendingShare) }} />
      </View>
    </View>
  );
}

function ActionButton({ icon, label, onPress }: { icon: AbsenceKind; label: string; onPress: () => void }) {
  const Icon = icon === 'krank' ? Thermometer : CalendarPlus;
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" {...hoverProps} style={[styles.action, hovered && styles.actionHover]}>
      <Icon size={18} color={icon === 'krank' ? Colors.danger : Colors.accent} strokeWidth={2} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function AbsenceForm({
  kind: initialKind,
  ws,
  hr,
  members,
  me,
  onClose,
  onSaved,
}: {
  kind: AbsenceKind;
  ws: string;
  hr: boolean;
  members: TeamMember[];
  me: string;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const today = dayIso(new Date());
  const [kind, setKind] = useState<AbsenceKind>(initialKind);
  const [from, setFrom] = useState<string | null>(today);
  const [to, setTo] = useState<string | null>(today);
  const [note, setNote] = useState('');
  const [member, setMember] = useState(me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const days = from && to ? workingDays(from, to) : 0;
  const forOther = member !== me;

  const save = async () => {
    if (!from || !to) return setError('Bitte Von und Bis eintragen.');
    if (to < from) return setError('„Bis“ liegt vor „Von“.');
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('absences')
      .insert({ company_id: ws, member_id: member, kind, starts_on: from, ends_on: to, note: note.trim() || null })
      .select('status')
      .single();
    setBusy(false);
    if (err) return setError(staffErrorText(err, 'Das hat nicht geklappt.'));
    playSound('check');
    const status = (data as { status?: AbsenceStatus } | null)?.status;
    const name = members.find((m) => m.id === member)?.name ?? '';
    onSaved(
      kind === 'krank'
        ? forOther
          ? `Krankmeldung für ${name} eingetragen.`
          : 'Gute Besserung! Die Leitung weiß Bescheid.'
        : status === 'genehmigt'
          ? forOther
            ? `${KIND_LABEL[kind]} für ${name} eingetragen und genehmigt.`
            : `${KIND_LABEL[kind]} eingetragen.`
          : 'Antrag gestellt – du bekommst Bescheid, sobald die Leitung entschieden hat.',
    );
  };

  return (
    <View style={styles.form}>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'urlaub', label: 'Urlaub' },
          { value: 'frei', label: 'Frei' },
          { value: 'krank', label: 'Krank' },
        ]}
      />
      {hr && members.length > 1 && (
        <>
          <Text style={styles.formLabel}>Für wen?</Text>
          <View style={styles.chips}>
            {members.map((m) => (
              <Chip key={m.id} label={m.id === me ? 'Mich' : m.name} active={member === m.id} onPress={() => setMember(m.id)} />
            ))}
          </View>
        </>
      )}
      <View style={styles.dates}>
        <View style={styles.flex}>
          <DateField label="Von" value={from} onChange={(v) => { setFrom(v); if (v && (!to || to < v)) setTo(v); }} />
        </View>
        <View style={styles.flex}>
          <DateField label="Bis" value={to} onChange={setTo} />
        </View>
      </View>
      {!!from && !!to && to >= from && (
        <Text style={styles.days}>
          {daysText(days)}
          {kind === 'urlaub' ? ' Urlaub' : ''} (Mo–Fr ohne Feiertage in NRW)
        </Text>
      )}
      <TextField
        label="Notiz (optional)"
        value={note}
        onChangeText={setNote}
        placeholder={kind === 'krank' ? 'z. B. Attest folgt' : 'z. B. Familienfeier'}
        maxLength={500}
      />
      {kind === 'krank' && <Text style={styles.privacy}>Kollegen sehen nur „abwesend“ – dass du krank bist, sieht nur die Leitung.</Text>}
      {!!error && <Notice tone="error">{error}</Notice>}
      <View style={styles.formButtons}>
        <Button
          label={kind === 'krank' ? 'Krank melden' : hr ? 'Eintragen' : 'Beantragen'}
          onPress={() => void save()}
          loading={busy}
          style={styles.flex}
        />
        <Button label="Abbrechen" variant="secondary" onPress={onClose} style={styles.flex} />
      </View>
    </View>
  );
}

function StatusPill({ status }: { status: AbsenceStatus }) {
  const tone = status === 'genehmigt' ? styles.pillOk : status === 'abgelehnt' ? styles.pillNo : status === 'offen' ? styles.pillOpen : styles.pillInfo;
  return (
    <View style={[styles.pill, tone]}>
      <Text style={styles.pillText}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

function OwnRow({ absence: a, first, onRemoved, onError }: { absence: Absence; first: boolean; onRemoved: () => void; onError: (e: string) => void }) {
  const [busy, setBusy] = useState(false);
  const canWithdraw = a.status === 'offen' || (a.status === 'gemeldet' && a.ends_on >= dayIso(new Date()));
  const withdraw = async () => {
    setBusy(true);
    const { error } = await supabase.from('absences').delete().eq('id', a.id);
    setBusy(false);
    if (error) return onError(staffErrorText(error, 'Das ließ sich nicht zurückziehen.'));
    onRemoved();
  };
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <View style={styles.rowTexts}>
        <View style={styles.rowLine}>
          <Text style={styles.rowTitle}>{KIND_LABEL[a.kind]}</Text>
          <StatusPill status={a.status} />
        </View>
        <Text style={styles.rowSub}>
          {rangeLabel(a.starts_on, a.ends_on)} · {daysText(workingDays(a.starts_on, a.ends_on))}
        </Text>
        {!!a.note && <Text style={styles.rowNote}>„{a.note}“</Text>}
        {!!a.decision_note && <Text style={styles.rowNote}>Antwort: „{a.decision_note}“</Text>}
      </View>
      {canWithdraw && (
        <Pressable onPress={() => void withdraw()} disabled={busy} accessibilityRole="button" style={styles.linkButton}>
          <Text style={styles.linkDanger}>{a.status === 'offen' ? 'Zurückziehen' : 'Löschen'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function RequestRow({
  absence: a,
  first,
  list,
  year,
  onDone,
  onError,
}: {
  absence: Absence;
  first: boolean;
  list: Absence[];
  year: number;
  onDone: () => void;
  onError: (e: string) => void;
}) {
  const hub = useTeamHub();
  const { team } = useTeam();
  const member = team?.members.find((m) => m.id === a.member_id);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const days = workingDays(a.starts_on, a.ends_on);
  const balance = member?.vacation_days != null ? vacationDays(list, a.member_id, year) : null;
  // Wer ist im selben Zeitraum schon weg?
  const overlap = list.filter(
    (o) => o.id !== a.id && o.member_id !== a.member_id && (o.status === 'genehmigt' || o.status === 'gemeldet') && o.starts_on <= a.ends_on && o.ends_on >= a.starts_on,
  );

  const decide = async (approve: boolean) => {
    setBusy(approve ? 'yes' : 'no');
    const { error } = await supabase.rpc('absence_decide', { p_id: a.id, p_approve: approve, p_note: approve ? null : reason.trim() || null });
    setBusy(null);
    if (error) return onError(staffErrorText(error, 'Das hat nicht geklappt.'));
    playSound(approve ? 'success' : 'tick');
    onDone();
  };

  return (
    <View style={[styles.request, !first && styles.rowBorder]}>
      <View style={styles.requestHead}>
        <PersonDot name={member?.name ?? '?'} size={34} />
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle}>
            {member?.name ?? hub.nameOf(a.member_id)} · {KIND_LABEL[a.kind]}
          </Text>
          <Text style={styles.rowSub}>
            {rangeLabel(a.starts_on, a.ends_on)} · {daysText(days)}
          </Text>
        </View>
      </View>
      {!!a.note && <Text style={styles.rowNote}>„{a.note}“</Text>}
      {a.kind === 'urlaub' && balance && member?.vacation_days != null && (
        <Text style={styles.rowSub}>
          Danach noch {fmt(member.vacation_days - balance.approved - days)} von {fmt(member.vacation_days)} Tagen übrig
        </Text>
      )}
      {overlap.length > 0 && (
        <Text style={styles.overlap}>Gleichzeitig weg: {[...new Set(overlap.map((o) => hub.nameOf(o.member_id)))].join(', ')}</Text>
      )}
      {asking ? (
        <View style={styles.form}>
          <TextField label="Grund (optional)" value={reason} onChangeText={setReason} placeholder="z. B. Da ist schon jemand im Urlaub" maxLength={300} />
          <View style={styles.formButtons}>
            <Button label="Ablehnen" onPress={() => void decide(false)} loading={busy === 'no'} style={styles.flex} />
            <Button label="Zurück" variant="secondary" onPress={() => setAsking(false)} style={styles.flex} />
          </View>
        </View>
      ) : (
        <View style={styles.decide}>
          <Pressable onPress={() => void decide(true)} disabled={!!busy} accessibilityRole="button" style={[styles.decideButton, styles.approve]}>
            <Check size={16} color={Colors.onAccent} strokeWidth={2.6} />
            <Text style={styles.approveText}>{busy === 'yes' ? 'Moment …' : 'Genehmigen'}</Text>
          </Pressable>
          <Pressable onPress={() => setAsking(true)} disabled={!!busy} accessibilityRole="button" style={[styles.decideButton, styles.reject]}>
            <X size={16} color={Colors.text} strokeWidth={2.4} />
            <Text style={styles.rejectText}>Ablehnen</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function AccountRow({ member, list, year, first }: { member: TeamMember; list: Absence[]; year: number; first: boolean }) {
  const total = member.vacation_days ?? 0;
  const { approved, pending } = vacationDays(list, member.id, year);
  const sick = list
    .filter((a) => a.member_id === member.id && a.kind === 'krank')
    .reduce((n, a) => n + workingDays(a.starts_on, a.ends_on, year), 0);
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <PersonDot name={member.name} size={30} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>{member.name}</Text>
        <Text style={styles.rowSub}>
          {fmt(approved)} genommen/geplant{pending ? ` · ${fmt(pending)} beantragt` : ''}
          {sick ? ` · ${fmt(sick)} krank` : ''}
        </Text>
      </View>
      <Text style={styles.left}>
        {fmt(total - approved)}
        <Text style={styles.leftOf}> / {fmt(total)}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  flex: { flex: 1 },
  section: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: Spacing.xs, marginLeft: Spacing.xs },
  none: { color: Colors.textMuted, fontSize: 14 },
  balance: { gap: Spacing.sm, marginBottom: Spacing.sm },
  balanceHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, flexWrap: 'wrap' },
  balanceBig: { color: Colors.text, fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  balanceText: { color: Colors.textMuted, fontSize: 14 },
  bar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border },
  barUsed: { backgroundColor: Colors.accent },
  barPending: { backgroundColor: accentAlpha(0.35) },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  action: {
    flexGrow: 1,
    flexBasis: 160,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  actionHover: { borderColor: Colors.borderFocus },
  actionText: { color: Colors.text, fontSize: 14.5, fontWeight: '600' },
  form: { gap: Spacing.sm },
  formLabel: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dates: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  days: { color: Colors.textMuted, fontSize: 13 },
  privacy: { color: Colors.textFaint, fontSize: 12.5 },
  formButtons: { flexDirection: 'row', gap: Spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowTexts: { flex: 1, gap: 3 },
  rowLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  rowTitle: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: Colors.textMuted, fontSize: 13.5 },
  rowNote: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  overlap: { color: '#FBBF24', fontSize: 13 },
  linkButton: { paddingVertical: 6, paddingHorizontal: 4 },
  linkDanger: { color: Colors.danger, fontSize: 13.5, fontWeight: '600' },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 1 },
  pillText: { color: Colors.text, fontSize: 12, fontWeight: '600' },
  pillOk: { backgroundColor: Colors.accentSoft, borderColor: accentAlpha(0.45) },
  pillNo: { backgroundColor: 'rgba(255,107,107,0.12)', borderColor: 'rgba(255,107,107,0.45)' },
  pillOpen: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.45)' },
  pillInfo: { backgroundColor: 'rgba(167,139,250,0.14)', borderColor: 'rgba(167,139,250,0.4)' },
  request: { gap: Spacing.sm, paddingVertical: Spacing.md },
  requestHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  decide: { flexDirection: 'row', gap: Spacing.sm },
  decideButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12 },
  approve: { backgroundColor: Colors.accent },
  approveText: { color: Colors.onAccent, fontSize: 14.5, fontWeight: '700' },
  reject: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceRaised },
  rejectText: { color: Colors.text, fontSize: 14.5, fontWeight: '600' },
  left: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  leftOf: { color: Colors.textFaint, fontSize: 13, fontWeight: '500' },
});
