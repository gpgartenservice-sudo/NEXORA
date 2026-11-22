import { router } from 'expo-router';
import { CalendarPlus, Check, Eye, HeartPulse, MessageCircle, Stethoscope, Thermometer, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { ToggleRow } from '@/components/ui/toggle-row';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';
import { supabase } from '@/lib/supabase';

import { PersonDot } from './chat-list';
import { Chip } from './chip';
import {
  ABSENCE_COLUMNS,
  addDays,
  awaySoon,
  calendarDays,
  dayIso,
  dayLabel,
  directKey,
  KIND_LABEL,
  rangeLabel,
  sickToday,
  STATUS_LABEL,
  unseenSickNotes,
  vacationAccount,
  workingDays,
  type Absence,
  type AbsenceKind,
  type AbsenceStatus,
  type VacationAccount,
} from './staff-logic';
import { staffErrorText, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam, type TeamMember } from './team-provider';

const fmt = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');
const daysText = (n: number) => `${fmt(n)} ${n === 1 ? 'Arbeitstag' : 'Arbeitstage'}`;
const tagText = (n: number) => `${fmt(n)} ${n === 1 ? 'Tag' : 'Tage'}`;
const SICK = '#FF6B6B';
const SICK_SOFT = 'rgba(255,107,107,0.1)';
const SICK_LINE = 'rgba(255,107,107,0.4)';

/**
 * Team → Krank & Urlaub.
 * Alle: krank melden (verlängern, „wieder gesund“), Urlaub/frei beantragen, eigenes Urlaubskonto
 * (übrig, genommen, geplant, beantragt, Krankheitstage).
 * Wer „Personal“ hat: Anfragen genehmigen, neue Krankmeldungen bestätigen („Gesehen“),
 * wer in den nächsten zwei Wochen fehlt und die Urlaubskonten aller.
 */
export function AbsencePanel() {
  const { team } = useTeam();
  const access = useAccess();
  const hub = useTeamHub();
  const ws = team?.owner_id ?? '';
  const me = hub.me;
  const hr = access.hr;
  const year = new Date().getFullYear();
  const today = dayIso(new Date());

  const [list, setList] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<AbsenceKind | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws) return;
    let res = await supabase
      .from('absences')
      .select(ABSENCE_COLUMNS)
      .eq('company_id', ws)
      .gte('ends_on', `${year - 1}-12-01`)
      .order('starts_on', { ascending: false });
    // Skript für Krankmeldungen noch nicht eingespielt: ohne die neuen Spalten laden
    if (res.error && ['42703', 'PGRST204'].includes(String(res.error.code)))
      res = await supabase.from('absences').select('*').eq('company_id', ws).gte('ends_on', `${year - 1}-12-01`).order('starts_on', { ascending: false });
    setLoading(false);
    if (res.error) return setError(staffErrorText(res.error, 'Die Anträge konnten nicht geladen werden.'));
    setError(null);
    setList((res.data ?? []) as Absence[]);
  }, [ws, year]);

  useEffect(() => {
    // erst nach dem Zeichnen laden (kein setState direkt im Effekt)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, hub.absenceVersion]);

  const members = useMemo(() => team?.members ?? [], [team?.members]);
  const meMember = members.find((m) => m.id === me);
  const mine = list.filter((a) => a.member_id === me);
  const mySick = sickToday(list, me, today);
  const account = meMember?.vacation_days != null ? vacationAccount(list, me, meMember.vacation_days, year, today) : null;
  const open = hr ? list.filter((a) => a.status === 'offen' && a.member_id !== me).reverse() : [];
  const newSick = hr ? unseenSickNotes(list, me, today) : [];
  const away = hr ? awaySoon(list, today) : [];

  const reloadAll = () => {
    void load();
    void hub.refreshAbsences();
  };
  const start = (kind: AbsenceKind) => {
    setDone(null);
    setForm(kind);
  };

  return (
    <View style={styles.wrap}>
      {!!error && <Notice tone="error">{error}</Notice>}
      {!!done && <Notice tone="success">{done}</Notice>}

      {form ? (
        <Card>
          <AbsenceForm
            kind={form}
            ws={ws}
            hr={hr}
            members={members}
            me={me}
            account={account}
            onClose={() => setForm(null)}
            onSaved={(text) => {
              setForm(null);
              setDone(text);
              reloadAll();
            }}
          />
        </Card>
      ) : (
        <>
          {/* Krank: heute krank gemeldet → Stand, sonst großer Knopf */}
          {mySick ? (
            <SickNow absence={mySick} today={today} onChanged={(text) => { setDone(text); reloadAll(); }} onError={setError} />
          ) : (
            <SickButton onPress={() => start('krank')} />
          )}

          {/* Urlaubskonto + beantragen */}
          <Card>
            {account ? (
              <AccountCard account={account} year={year} />
            ) : (
              <Text style={styles.hint}>
                {hr ? 'Urlaub und freie Tage fürs Team eintragen – für dich selbst gibt es kein Urlaubskonto.' : 'Deine Urlaubstage hat die Leitung noch nicht eingetragen.'}
              </Text>
            )}
            <View style={styles.actions}>
              <ActionButton icon="urlaub" label={hr ? 'Urlaub eintragen' : 'Urlaub beantragen'} onPress={() => start('urlaub')} />
              <ActionButton icon="frei" label={hr ? 'Frei eintragen' : 'Frei beantragen'} onPress={() => start('frei')} />
            </View>
          </Card>
        </>
      )}

      {/* Leitung: Anfragen, neue Krankmeldungen, wer fehlt */}
      {hr && (
        <>
          <Text style={styles.section}>ANFRAGEN{open.length ? ` · ${open.length}` : ''}</Text>
          <Card>
            {!loading && open.length === 0 && <Text style={styles.none}>Keine offenen Anfragen. 👍</Text>}
            {open.map((a, i) => (
              <RequestRow key={a.id} absence={a} first={i === 0} list={list} year={year} today={today} onDone={reloadAll} onError={setError} />
            ))}
          </Card>

          {newSick.length > 0 && (
            <>
              <Text style={[styles.section, styles.sectionSick]}>NEUE KRANKMELDUNGEN · {newSick.length}</Text>
              <Card>
                {newSick.map((a, i) => (
                  <SickRow key={a.id} absence={a} first={i === 0} today={today} onDone={reloadAll} onError={setError} />
                ))}
              </Card>
            </>
          )}

          <Text style={styles.section}>WER FEHLT · NÄCHSTE 2 WOCHEN</Text>
          <Card>
            {!loading && away.length === 0 && <Text style={styles.none}>Alle da. 💪</Text>}
            {away.map((a, i) => (
              <AwayRow key={a.id} absence={a} first={i === 0} today={today} />
            ))}
          </Card>
        </>
      )}

      {/* Eigene Anträge und Krankmeldungen */}
      <Text style={styles.section}>DEINE ANTRÄGE & KRANKMELDUNGEN</Text>
      <Card>
        {!loading && mine.length === 0 && <Text style={styles.none}>Noch nichts beantragt oder gemeldet.</Text>}
        {mine.slice(0, 30).map((a, i) => (
          <OwnRow key={a.id} absence={a} first={i === 0} today={today} onRemoved={reloadAll} onError={setError} />
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
                <AccountRow key={m.id} member={m} list={list} year={year} today={today} first={i === 0} />
              ))}
            <Text style={styles.hint}>Urlaubstage je Person änderst du unter Mitglieder & Rechte.</Text>
          </Card>
        </>
      )}
    </View>
  );
}

/** Großer Knopf „Krank melden“ – das Wichtigste zuerst */
function SickButton({ onPress }: { onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      {...hoverProps}
      accessibilityRole="button"
      accessibilityLabel="Krank melden"
      style={[styles.sickButton, hovered && styles.sickButtonHover]}>
      <View style={styles.sickIcon}>
        <Thermometer size={24} color={SICK} strokeWidth={2.2} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.sickTitle}>Krank melden</Text>
        <Text style={styles.sickText}>Kurz Bescheid geben – die Leitung sieht es sofort. Kollegen sehen nur „abwesend“.</Text>
      </View>
    </Pressable>
  );
}

/** Heute krank gemeldet: Stand, verlängern, wieder gesund */
function SickNow({
  absence: a,
  today,
  onChanged,
  onError,
}: {
  absence: Absence;
  today: string;
  onChanged: (text: string) => void;
  onError: (e: string) => void;
}) {
  const [extending, setExtending] = useState(false);
  const [until, setUntil] = useState<string | null>(addDays(a.ends_on, 1));
  const [doctor, setDoctor] = useState(!!a.doctor);
  const [busy, setBusy] = useState<'extend' | 'well' | null>(null);

  const update = async (to: string, kind: 'extend' | 'well') => {
    setBusy(kind);
    const { error } = await supabase.rpc('absence_sick_update', { p_id: a.id, p_until: to, p_doctor: kind === 'extend' ? doctor : null });
    setBusy(null);
    if (error) return onError(staffErrorText(error, 'Das hat nicht geklappt.'));
    playSound('check');
    setExtending(false);
    onChanged(kind === 'extend' ? `Verlängert bis ${dayLabel(to, true)}. Gute Besserung!` : 'Schön, dass du wieder fit bist! 💪');
  };
  // „wieder gesund“: ab heute wieder da (gestern war der letzte Krankheitstag)
  const lastSickDay = a.starts_on < today ? addDays(today, -1) : today;
  const long = calendarDays(a.starts_on, until ?? a.ends_on) > 3;

  return (
    <View style={styles.sickNow}>
      <View style={styles.sickNowHead}>
        <View style={styles.sickIcon}>
          <HeartPulse size={22} color={SICK} strokeWidth={2.2} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.sickTitle}>Du bist krank gemeldet</Text>
          <Text style={styles.sickText}>
            {rangeLabel(a.starts_on, a.ends_on)} · {tagText(calendarDays(a.starts_on, a.ends_on))}
            {a.doctor ? ' · beim Arzt gewesen' : ''}
          </Text>
          <Text style={styles.sickSeen}>
            {a.seen_at ? '✓ Die Leitung hat es gesehen. Gute Besserung!' : 'Die Leitung ist benachrichtigt. Gute Besserung!'}
          </Text>
        </View>
      </View>
      {extending ? (
        <View style={styles.form}>
          <DateField label="Krank bis einschließlich" value={until} onChange={setUntil} />
          <ToggleRow
            label="Ich war beim Arzt"
            hint="Die Krankschreibung (eAU) ruft die Leitung bei deiner Krankenkasse ab."
            value={doctor}
            onChange={setDoctor}
          />
          {long && !doctor && <Text style={styles.warn}>Bei mehr als 3 Kalendertagen brauchst du eine Krankschreibung vom Arzt.</Text>}
          <View style={styles.formButtons}>
            <Button
              label="Verlängern"
              onPress={() => (until && until >= a.starts_on ? void update(until, 'extend') : onError('Bitte ein Datum ab Beginn der Krankmeldung wählen.'))}
              loading={busy === 'extend'}
              style={styles.flex}
            />
            <Button label="Abbrechen" variant="secondary" onPress={() => setExtending(false)} style={styles.flex} />
          </View>
        </View>
      ) : (
        <View style={styles.decide}>
          <Pressable onPress={() => setExtending(true)} accessibilityRole="button" style={[styles.decideButton, styles.reject]}>
            <CalendarPlus size={16} color={Colors.text} strokeWidth={2.2} />
            <Text style={styles.rejectText}>Verlängern</Text>
          </Pressable>
          <Pressable
            onPress={() => void update(lastSickDay, 'well')}
            disabled={!!busy}
            accessibilityRole="button"
            style={[styles.decideButton, styles.approve]}>
            <Check size={16} color={Colors.onAccent} strokeWidth={2.6} />
            <Text style={styles.approveText}>{busy === 'well' ? 'Moment …' : 'Wieder gesund'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function AccountCard({ account: acc, year }: { account: VacationAccount; year: number }) {
  const share = (n: number) => (acc.total > 0 ? Math.max(0, Math.min(1, n / acc.total)) : 0);
  const taken = share(acc.taken);
  const planned = Math.min(1 - taken, share(acc.planned));
  const pending = Math.min(1 - taken - planned, share(acc.pending));
  return (
    <View style={styles.balance}>
      <Text style={styles.label}>DEIN URLAUB {year}</Text>
      <View style={styles.balanceHead}>
        <Text style={[styles.balanceBig, acc.left < 0 && styles.negative]}>{fmt(acc.left)}</Text>
        <Text style={styles.balanceText}>
          von {fmt(acc.total)} {acc.total === 1 ? 'Urlaubstag' : 'Urlaubstagen'} übrig
        </Text>
      </View>
      <View style={styles.bar}>
        <View style={[styles.barUsed, { flex: taken }]} />
        <View style={[styles.barPlanned, { flex: planned }]} />
        <View style={[styles.barPending, { flex: pending }]} />
        <View style={{ flex: Math.max(0, 1 - taken - planned - pending) }} />
      </View>
      <View style={styles.stats}>
        <Stat dot={Colors.accent} label="Genommen" value={tagText(acc.taken)} />
        <Stat dot={accentAlpha(0.6)} label="Geplant" value={tagText(acc.planned)} />
        <Stat dot={accentAlpha(0.28)} label="Beantragt" value={tagText(acc.pending)} />
        <Stat dot={SICK} label="Krank" value={tagText(acc.sick)} />
      </View>
      {acc.next && (
        <Text style={styles.next}>
          Nächstes Mal frei: {rangeLabel(acc.next.starts_on, acc.next.ends_on)} ({KIND_LABEL[acc.next.kind]})
        </Text>
      )}
    </View>
  );
}

function Stat({ dot, label, value }: { dot: string; label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <View style={styles.statHead}>
        <View style={[styles.statDot, { backgroundColor: dot }]} />
        <Text style={styles.statLabel}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
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
  account,
  onClose,
  onSaved,
}: {
  kind: AbsenceKind;
  ws: string;
  hr: boolean;
  members: TeamMember[];
  me: string;
  account: VacationAccount | null;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const today = dayIso(new Date());
  const [kind, setKind] = useState<AbsenceKind>(initialKind);
  const [from, setFrom] = useState<string | null>(today);
  const [to, setTo] = useState<string | null>(today);
  const [note, setNote] = useState('');
  const [doctor, setDoctor] = useState(false);
  const [member, setMember] = useState(me);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = !!from && !!to && to >= from;
  const days = valid ? workingDays(from, to) : 0;
  const forOther = member !== me;
  const sick = kind === 'krank';
  // Resturlaub nach diesem Antrag (nur für einen selbst – für andere steht er bei der Anfrage)
  const leftAfter = kind === 'urlaub' && !forOther && account && valid ? account.left - account.pending - workingDays(from, to, Number(from.slice(0, 4))) : null;

  const save = async () => {
    if (!from || !to) return setError('Bitte Von und Bis eintragen.');
    if (to < from) return setError('„Bis“ liegt vor „Von“.');
    setBusy(true);
    setError(null);
    const row: Record<string, unknown> = { company_id: ws, member_id: member, kind, starts_on: from, ends_on: to, note: note.trim() || null };
    if (sick && doctor) row.doctor = true;
    const { data, error: err } = await supabase.from('absences').insert(row).select('status').single();
    setBusy(false);
    if (err) return setError(staffErrorText(err, 'Das hat nicht geklappt.'));
    playSound('check');
    const status = (data as { status?: AbsenceStatus } | null)?.status;
    const name = members.find((m) => m.id === member)?.name ?? '';
    onSaved(
      sick
        ? forOther
          ? `Krankmeldung für ${name} eingetragen.`
          : 'Gute Besserung! Die Leitung ist benachrichtigt.'
        : status === 'genehmigt'
          ? forOther
            ? `${KIND_LABEL[kind]} für ${name} eingetragen und genehmigt.`
            : `${KIND_LABEL[kind]} eingetragen.`
          : 'Antrag gestellt – du bekommst Bescheid, sobald die Leitung entschieden hat.',
    );
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{sick ? 'Krank melden' : forOther || hr ? `${KIND_LABEL[kind]} eintragen` : `${KIND_LABEL[kind]} beantragen`}</Text>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: 'krank', label: 'Krank' },
          { value: 'urlaub', label: 'Urlaub' },
          { value: 'frei', label: 'Frei' },
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
          <DateField
            label={sick ? 'Krank seit' : 'Von'}
            value={from}
            onChange={(v) => {
              setFrom(v);
              if (v && (!to || to < v)) setTo(v);
            }}
          />
        </View>
        <View style={styles.flex}>
          <DateField label={sick ? 'Voraussichtlich bis' : 'Bis'} value={to} onChange={setTo} />
        </View>
      </View>
      {valid && (
        <Text style={styles.days}>
          {daysText(days)}
          {kind === 'urlaub' ? ' Urlaub' : ''} (Mo–Fr ohne Feiertage in NRW)
          {leftAfter != null ? ` · danach noch ${fmt(leftAfter)} Urlaubstage übrig` : ''}
        </Text>
      )}
      {leftAfter != null && leftAfter < 0 && (
        <Text style={styles.warn}>Das sind mehr Tage, als du noch hast – die Leitung kann trotzdem zustimmen.</Text>
      )}
      {sick && (
        <ToggleRow
          label={forOther ? 'War beim Arzt' : 'Ich war beim Arzt'}
          hint="Die Krankschreibung (eAU) ruft die Leitung bei der Krankenkasse ab."
          value={doctor}
          onChange={setDoctor}
        />
      )}
      {sick && valid && calendarDays(from, to) > 3 && !doctor && (
        <Text style={styles.warn}>Bei mehr als 3 Kalendertagen ist eine Krankschreibung vom Arzt nötig.</Text>
      )}
      <TextField
        label="Notiz (optional)"
        value={note}
        onChangeText={setNote}
        placeholder={sick ? 'z. B. Bin morgen hoffentlich wieder da' : 'z. B. Familienfeier'}
        maxLength={500}
      />
      {sick && <Text style={styles.privacy}>Kollegen sehen nur „abwesend“ – dass du krank bist, sieht nur die Leitung.</Text>}
      {!!error && <Notice tone="error">{error}</Notice>}
      <View style={styles.formButtons}>
        <Button
          label={sick ? 'Krank melden' : hr ? 'Eintragen' : 'Beantragen'}
          onPress={() => void save()}
          loading={busy}
          style={styles.flex}
        />
        <Button label="Abbrechen" variant="secondary" onPress={onClose} style={styles.flex} />
      </View>
    </View>
  );
}

function StatusPill({ status, seen }: { status: AbsenceStatus; seen?: boolean }) {
  const tone = status === 'genehmigt' ? styles.pillOk : status === 'abgelehnt' ? styles.pillNo : status === 'offen' ? styles.pillOpen : styles.pillSick;
  return (
    <View style={[styles.pill, tone]}>
      <Text style={styles.pillText}>{status === 'gemeldet' && seen ? 'Gesehen ✓' : STATUS_LABEL[status]}</Text>
    </View>
  );
}

function OwnRow({
  absence: a,
  first,
  today,
  onRemoved,
  onError,
}: {
  absence: Absence;
  first: boolean;
  today: string;
  onRemoved: () => void;
  onError: (e: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const canWithdraw = a.status === 'offen' || (a.status === 'gemeldet' && a.ends_on >= today);
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
          <StatusPill status={a.status} seen={!!a.seen_at} />
        </View>
        <Text style={styles.rowSub}>
          {rangeLabel(a.starts_on, a.ends_on)} · {a.kind === 'krank' ? tagText(calendarDays(a.starts_on, a.ends_on)) : daysText(workingDays(a.starts_on, a.ends_on))}
          {a.doctor ? ' · beim Arzt' : ''}
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
  today,
  onDone,
  onError,
}: {
  absence: Absence;
  first: boolean;
  list: Absence[];
  year: number;
  today: string;
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
  const acc = member?.vacation_days != null ? vacationAccount(list, a.member_id, member.vacation_days, year, today) : null;
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
      {a.kind === 'urlaub' && acc && (
        <Text style={styles.rowSub}>
          Hat noch {fmt(acc.left)} von {fmt(acc.total)} Tagen · danach {fmt(acc.left - workingDays(a.starts_on, a.ends_on, year))}
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

/** Leitung: neue Krankmeldung – bestätigen oder der Person schreiben */
function SickRow({
  absence: a,
  first,
  today,
  onDone,
  onError,
}: {
  absence: Absence;
  first: boolean;
  today: string;
  onDone: () => void;
  onError: (e: string) => void;
}) {
  const hub = useTeamHub();
  const [busy, setBusy] = useState(false);
  const name = hub.nameOf(a.member_id);
  const cal = calendarDays(a.starts_on, a.ends_on);
  const now = a.starts_on <= today && a.ends_on >= today;
  const seen = async () => {
    setBusy(true);
    const { error } = await supabase.rpc('absence_seen', { p_id: a.id });
    setBusy(false);
    if (error) return onError(staffErrorText(error, 'Das hat nicht geklappt.'));
    playSound('check');
    onDone();
  };
  return (
    <View style={[styles.request, !first && styles.rowBorder]}>
      <View style={styles.requestHead}>
        <PersonDot name={name} size={34} />
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle}>{now ? `${name} ist krank` : `${name} war krank`}</Text>
          <Text style={styles.rowSub}>
            {rangeLabel(a.starts_on, a.ends_on)} · {tagText(cal)} ({daysText(workingDays(a.starts_on, a.ends_on))})
          </Text>
        </View>
      </View>
      {a.doctor ? (
        <View style={styles.rowLine}>
          <View style={[styles.pill, styles.pillOk, styles.pillIcon]}>
            <Stethoscope size={12} color={Colors.text} />
            <Text style={styles.pillText}>Beim Arzt – eAU abrufen</Text>
          </View>
        </View>
      ) : cal > 3 ? (
        <Text style={styles.warn}>Länger als 3 Tage – Krankschreibung nötig.</Text>
      ) : null}
      {!!a.note && <Text style={styles.rowNote}>„{a.note}“</Text>}
      <View style={styles.decide}>
        <Pressable onPress={() => void seen()} disabled={busy} accessibilityRole="button" style={[styles.decideButton, styles.approve]}>
          <Eye size={16} color={Colors.onAccent} strokeWidth={2.4} />
          <Text style={styles.approveText}>{busy ? 'Moment …' : 'Gesehen'}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push({ pathname: '/team/chat/[key]', params: { key: directKey(a.member_id) } })}
          accessibilityRole="button"
          style={[styles.decideButton, styles.reject]}>
          <MessageCircle size={16} color={Colors.text} strokeWidth={2.2} />
          <Text style={styles.rejectText}>Gute Besserung schreiben</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Leitung: wer fehlt in den nächsten zwei Wochen */
function AwayRow({ absence: a, first, today }: { absence: Absence; first: boolean; today: string }) {
  const hub = useTeamHub();
  const now = a.starts_on <= today;
  return (
    <View style={[styles.row, styles.rowTight, !first && styles.rowBorder]}>
      <PersonDot name={hub.nameOf(a.member_id)} size={28} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>{hub.nameOf(a.member_id)}</Text>
        <Text style={styles.rowSub}>
          {KIND_LABEL[a.kind]} · {rangeLabel(a.starts_on, a.ends_on)}
        </Text>
      </View>
      {now && (
        <View style={[styles.pill, a.kind === 'krank' ? styles.pillSick : styles.pillInfo]}>
          <Text style={styles.pillText}>{a.ends_on === today ? 'heute' : `bis ${dayLabel(a.ends_on, true)}`}</Text>
        </View>
      )}
    </View>
  );
}

function AccountRow({ member, list, year, today, first }: { member: TeamMember; list: Absence[]; year: number; today: string; first: boolean }) {
  const acc = vacationAccount(list, member.id, member.vacation_days ?? 0, year, today);
  return (
    <View style={[styles.row, !first && styles.rowBorder]}>
      <PersonDot name={member.name} size={30} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>{member.name}</Text>
        <Text style={styles.rowSub}>
          {fmt(acc.taken)} genommen · {fmt(acc.planned)} geplant
          {acc.pending ? ` · ${fmt(acc.pending)} beantragt` : ''}
          {acc.sick ? ` · ${fmt(acc.sick)} krank` : ''}
        </Text>
      </View>
      <Text style={[styles.left, acc.left < 0 && styles.negative]}>
        {fmt(acc.left)}
        <Text style={styles.leftOf}> / {fmt(acc.total)}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  flex: { flex: 1 },
  section: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: Spacing.xs, marginLeft: Spacing.xs },
  sectionSick: { color: SICK },
  label: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2 },
  none: { color: Colors.textMuted, fontSize: 14 },
  hint: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  warn: { color: '#FBBF24', fontSize: 13, lineHeight: 18 },
  negative: { color: Colors.danger },

  sickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SICK_LINE,
    backgroundColor: SICK_SOFT,
  },
  sickButtonHover: { backgroundColor: 'rgba(255,107,107,0.16)' },
  sickIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,107,107,0.16)',
  },
  sickTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  sickText: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19, marginTop: 2 },
  sickSeen: { color: Colors.text, fontSize: 13.5, marginTop: 6 },
  sickNow: { gap: Spacing.md, padding: Spacing.lg, borderRadius: 18, borderWidth: 1, borderColor: SICK_LINE, backgroundColor: SICK_SOFT },
  sickNowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md },

  balance: { gap: Spacing.sm, marginBottom: Spacing.md },
  balanceHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.sm, flexWrap: 'wrap' },
  balanceBig: { color: Colors.text, fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  balanceText: { color: Colors.textMuted, fontSize: 14.5 },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border },
  barUsed: { backgroundColor: Colors.accent },
  barPlanned: { backgroundColor: accentAlpha(0.6) },
  barPending: { backgroundColor: accentAlpha(0.28) },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.xs },
  stat: {
    flexGrow: 1,
    flexBasis: 110,
    gap: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statLabel: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600' },
  statValue: { color: Colors.text, fontSize: 16, fontWeight: '700' },
  next: { color: Colors.textMuted, fontSize: 13.5, marginTop: 2 },

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
  formTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  formLabel: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dates: { flexDirection: 'row', gap: Spacing.md, flexWrap: 'wrap' },
  days: { color: Colors.textMuted, fontSize: 13 },
  privacy: { color: Colors.textFaint, fontSize: 12.5 },
  formButtons: { flexDirection: 'row', gap: Spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md },
  rowTight: { paddingVertical: Spacing.sm },
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
  pillIcon: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  pillText: { color: Colors.text, fontSize: 12, fontWeight: '600' },
  pillOk: { backgroundColor: Colors.accentSoft, borderColor: accentAlpha(0.45) },
  pillNo: { backgroundColor: 'rgba(255,107,107,0.12)', borderColor: 'rgba(255,107,107,0.45)' },
  pillOpen: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.45)' },
  pillSick: { backgroundColor: SICK_SOFT, borderColor: SICK_LINE },
  pillInfo: { backgroundColor: 'rgba(167,139,250,0.14)', borderColor: 'rgba(167,139,250,0.4)' },

  request: { gap: Spacing.sm, paddingVertical: Spacing.md },
  requestHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  decide: { flexDirection: 'row', gap: Spacing.sm, flexWrap: 'wrap' },
  decideButton: {
    flexGrow: 1,
    flexBasis: 140,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  approve: { backgroundColor: Colors.accent },
  approveText: { color: Colors.onAccent, fontSize: 14.5, fontWeight: '700' },
  reject: { borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceRaised },
  rejectText: { color: Colors.text, fontSize: 14.5, fontWeight: '600' },
  left: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  leftOf: { color: Colors.textFaint, fontSize: 13, fontWeight: '500' },
});
