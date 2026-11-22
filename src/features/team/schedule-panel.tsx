import { ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { Colors, Spacing } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';
import { supabase } from '@/lib/supabase';

import { PersonDot } from './chat-list';
import { Chip } from './chip';
import {
  absentOn,
  addDays,
  copyWeek,
  dayIso,
  dayLabel,
  holidayName,
  hoursLabel,
  isoWeek,
  KIND_LABEL,
  rangeLabel,
  SHIFT_PRESETS,
  shiftLabel,
  shiftMinutes,
  timeLabel,
  weekDays,
  weekStart,
  type Shift,
  type TeamAbsence,
} from './staff-logic';
import { staffErrorText, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';
import { TimeField } from './time-field';

const COLS = 'id, member_id, day, starts_at, ends_at, note';

type Editing = { day: string; shift?: Shift };

/**
 * Team → Arbeitsplan: Woche für Woche, wer wann arbeitet und wer abwesend ist.
 * Eintragen darf, wer „Personal“ hat (Inhaber, Mitgründer, Teamleitung); alle anderen sehen den Plan.
 */
export function SchedulePanel() {
  const { team } = useTeam();
  const access = useAccess();
  const hub = useTeamHub();
  const ws = team?.owner_id ?? '';
  const me = hub.me;
  const hr = access.hr;
  const today = dayIso(new Date());

  const [monday, setMonday] = useState(() => weekStart(today));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<TeamAbsence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [who, setWho] = useState<'alle' | 'ich'>('alle');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [copying, setCopying] = useState(false);
  const sunday = addDays(monday, 6);

  const load = useCallback(async () => {
    if (!ws) return;
    const [s, a] = await Promise.all([
      supabase.from('work_shifts').select(COLS).eq('company_id', ws).gte('day', monday).lte('day', sunday).order('day').order('starts_at'),
      supabase.rpc('team_absences', { p_from: monday, p_to: sunday }),
    ]);
    setLoading(false);
    if (s.error) return setError(staffErrorText(s.error, 'Der Arbeitsplan konnte nicht geladen werden.'));
    setError(null);
    setShifts((s.data ?? []) as Shift[]);
    setAbsences(Array.isArray(a.data) ? (a.data as TeamAbsence[]) : []);
  }, [ws, monday, sunday]);

  useEffect(() => {
    // erst nach dem Zeichnen laden (kein setState direkt im Effekt)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, hub.absenceVersion]);

  const members = useMemo(() => team?.members ?? [], [team?.members]);
  const fullName = (id: string) => members.find((m) => m.id === id)?.name ?? '?';
  const visibleMembers = who === 'ich' ? members.filter((m) => m.id === me) : members;
  const visibleIds = new Set(visibleMembers.map((m) => m.id));
  const mine = shifts.filter((s) => s.member_id === me);
  const myMinutes = mine.reduce((n, s) => n + shiftMinutes(s), 0);
  const allMinutes = shifts.reduce((n, s) => n + shiftMinutes(s), 0);

  const move = (weeks: number, to?: string) => {
    playSound('tick');
    setEditing(null);
    setInfo(null);
    setLoading(true);
    setMonday((m) => to ?? addDays(m, weeks * 7));
  };

  const copyLastWeek = async () => {
    setCopying(true);
    setInfo(null);
    const from = addDays(monday, -7);
    const { data, error: err } = await supabase.from('work_shifts').select(COLS).eq('company_id', ws).gte('day', from).lt('day', monday);
    if (err) {
      setCopying(false);
      return setError(staffErrorText(err, 'Die Vorwoche konnte nicht geladen werden.'));
    }
    const rows = copyWeek((data ?? []) as Shift[], shifts, monday).filter((s) => members.some((m) => m.id === s.member_id));
    if (!rows.length) {
      setCopying(false);
      return setInfo('Aus der Vorwoche gibt es nichts Neues zu übernehmen.');
    }
    const { error: insertError } = await supabase.from('work_shifts').insert(rows.map((r) => ({ ...r, company_id: ws })));
    setCopying(false);
    if (insertError) return setError(staffErrorText(insertError, 'Die Schichten konnten nicht übernommen werden.'));
    playSound('check');
    setInfo(`${rows.length} ${rows.length === 1 ? 'Schicht' : 'Schichten'} aus der Vorwoche übernommen.`);
    void load();
  };

  const current = monday === weekStart(today);

  return (
    <View style={styles.wrap}>
      <View style={styles.weekRow}>
        <ArrowButton label="Vorige Woche" onPress={() => move(-1)} icon="left" />
        <View style={styles.weekTexts}>
          <Text style={styles.week}>KW {isoWeek(monday)}</Text>
          <Text style={styles.weekRange}>{rangeLabel(monday, sunday)}</Text>
        </View>
        <ArrowButton label="Nächste Woche" onPress={() => move(1)} icon="right" />
      </View>
      {!current && (
        <Pressable onPress={() => move(0, weekStart(today))} accessibilityRole="button" style={styles.todayLink}>
          <Text style={styles.todayText}>Zur aktuellen Woche</Text>
        </Pressable>
      )}

      <View style={styles.toolbar}>
        <View style={styles.flex}>
          <Segmented
            value={who}
            onChange={setWho}
            options={[
              { value: 'alle', label: 'Ganzes Team' },
              { value: 'ich', label: 'Nur ich' },
            ]}
          />
        </View>
        {hr && (
          <Button label="Vorwoche übernehmen" variant="secondary" onPress={() => void copyLastWeek()} loading={copying} />
        )}
      </View>

      <Text style={styles.summary}>
        {mine.length
          ? `Du: ${mine.length} ${mine.length === 1 ? 'Schicht' : 'Schichten'} · ${hoursLabel(myMinutes)}`
          : 'Du hast diese Woche keine Schicht.'}
        {hr && shifts.length > 0 ? `  ·  Team: ${shifts.length} Schichten · ${hoursLabel(allMinutes)}` : ''}
      </Text>

      {!!error && <Notice tone="error">{error}</Notice>}
      {!!info && <Notice tone="success">{info}</Notice>}

      <Card>
        {weekDays(monday).map((day, i) => {
          const dayShifts = shifts.filter((s) => s.day === day && visibleIds.has(s.member_id));
          const dayAbsences = absences.filter((a) => a.starts_on <= day && a.ends_on >= day && visibleIds.has(a.member_id));
          const holiday = holidayName(day);
          const isToday = day === today;
          return (
            <View key={day} style={[styles.day, i > 0 && styles.dayBorder]}>
              <View style={styles.dayHead}>
                <Text style={[styles.dayLabel, isToday && styles.dayToday]}>
                  {dayLabel(day, true)}
                  {isToday ? ' · heute' : ''}
                </Text>
                {!!holiday && <Text style={styles.holiday}>{holiday}</Text>}
                <View style={styles.flex} />
                {hr && editing?.day !== day && (
                  <Pressable
                    onPress={() => setEditing({ day })}
                    accessibilityRole="button"
                    accessibilityLabel={`Schicht am ${dayLabel(day, true)} eintragen`}
                    hitSlop={6}
                    style={styles.add}>
                    <Plus size={16} color={Colors.text} strokeWidth={2.2} />
                  </Pressable>
                )}
              </View>
              {!loading && dayShifts.length === 0 && dayAbsences.length === 0 && editing?.day !== day && (
                <Text style={styles.none}>{holiday ? 'Feiertag' : '–'}</Text>
              )}
              {dayShifts.map((s) =>
                editing?.shift?.id === s.id ? null : (
                  <ShiftRow
                    key={s.id}
                    shift={s}
                    name={hub.nameOf(s.member_id)}
                    fullName={fullName(s.member_id)}
                    mine={s.member_id === me}
                    absent={!!absentOn(absences, s.member_id, day)}
                    onPress={hr ? () => setEditing({ day, shift: s }) : undefined}
                  />
                ),
              )}
              {dayAbsences.map((a) => (
                <View key={`${a.id}-${day}`} style={styles.entry}>
                  <PersonDot name={fullName(a.member_id)} size={26} />
                  <Text style={[styles.entryName, a.member_id === me && styles.mine]} numberOfLines={1}>
                    {hub.nameOf(a.member_id)}
                  </Text>
                  <View style={styles.absencePill}>
                    <Text style={styles.absenceText}>{KIND_LABEL[a.kind]}</Text>
                  </View>
                </View>
              ))}
              {editing?.day === day && (
                <ShiftForm
                  key={editing.shift?.id ?? 'neu'}
                  day={day}
                  shift={editing.shift}
                  ws={ws}
                  absences={absences}
                  onClose={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    void load();
                  }}
                />
              )}
            </View>
          );
        })}
      </Card>
      {!hr && <Text style={styles.hint}>Den Arbeitsplan trägt die Leitung ein. Fragen dazu am besten im Chat.</Text>}
    </View>
  );
}

function ArrowButton({ label, onPress, icon }: { label: string; onPress: () => void; icon: 'left' | 'right' }) {
  const { hovered, hoverProps } = useHover();
  const Icon = icon === 'left' ? ChevronLeft : ChevronRight;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} {...hoverProps} style={[styles.arrow, hovered && styles.arrowHover]}>
      <Icon size={20} color={Colors.text} />
    </Pressable>
  );
}

function ShiftRow({
  shift,
  name,
  fullName,
  mine,
  absent,
  onPress,
}: {
  shift: Shift;
  name: string;
  fullName: string;
  mine: boolean;
  absent: boolean;
  onPress?: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${name}, ${shiftLabel(shift)}`}
      {...hoverProps}
      style={[styles.entry, !!onPress && hovered && styles.entryHover]}>
      <PersonDot name={fullName} size={26} />
      <View style={styles.entryTexts}>
        <View style={styles.entryLine}>
          <Text style={[styles.entryName, mine && styles.mine]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.entryTime}>{shiftLabel(shift)}</Text>
          <Text style={styles.entryHours}>{hoursLabel(shiftMinutes(shift))}</Text>
        </View>
        {!!shift.note && <Text style={styles.entryNote}>{shift.note}</Text>}
        {absent && (
          <View style={styles.warn}>
            <TriangleAlert size={12} color={Colors.danger} />
            <Text style={styles.warnText}>ist an diesem Tag abwesend</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function ShiftForm({
  day,
  shift,
  ws,
  absences,
  onClose,
  onSaved,
}: {
  day: string;
  shift?: Shift;
  ws: string;
  absences: TeamAbsence[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { team } = useTeam();
  const members = team?.members ?? [];
  const [member, setMember] = useState<string | null>(shift?.member_id ?? null);
  const [start, setStart] = useState(shift ? timeLabel(shift.starts_at) : '08:00');
  const [end, setEnd] = useState(shift ? timeLabel(shift.ends_at) : '16:30');
  const [note, setNote] = useState(shift?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const absent = member ? absentOn(absences, member, day) : null;

  const save = async () => {
    if (!member) return setError('Bitte wähle, wer arbeitet.');
    if (start === end) return setError('Beginn und Ende sind gleich.');
    setBusy(true);
    setError(null);
    const row = { member_id: member, day, starts_at: start, ends_at: end, note: note.trim() || null };
    const { error: err } = shift
      ? await supabase.from('work_shifts').update(row).eq('id', shift.id)
      : await supabase.from('work_shifts').insert({ ...row, company_id: ws });
    setBusy(false);
    if (err) return setError(staffErrorText(err, 'Die Schicht konnte nicht gespeichert werden.'));
    playSound('check');
    onSaved();
  };

  const remove = async () => {
    if (!shift) return;
    setBusy(true);
    const { error: err } = await supabase.from('work_shifts').delete().eq('id', shift.id);
    setBusy(false);
    if (err) return setError(staffErrorText(err, 'Die Schicht konnte nicht gelöscht werden.'));
    onSaved();
  };

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>{shift ? 'Schicht ändern' : 'Neue Schicht'} · {dayLabel(day, true)}</Text>
      <Text style={styles.formLabel}>Wer?</Text>
      <View style={styles.chips}>
        {members.map((m) => (
          <Chip key={m.id} label={m.name} active={member === m.id} onPress={() => setMember(m.id)} />
        ))}
      </View>
      {!!absent && (
        <Notice tone="info">
          {members.find((m) => m.id === member)?.name} ist an diesem Tag abwesend ({KIND_LABEL[absent.kind]}).
        </Notice>
      )}
      <Text style={styles.formLabel}>Vorlage</Text>
      <View style={styles.chips}>
        {SHIFT_PRESETS.map((p) => (
          <Chip
            key={p.label}
            label={`${p.label} ${p.starts_at}–${p.ends_at}`}
            active={start === p.starts_at && end === p.ends_at}
            onPress={() => {
              setStart(p.starts_at);
              setEnd(p.ends_at);
            }}
          />
        ))}
      </View>
      <View style={styles.times}>
        <View style={styles.flex}>
          <TimeField label="Von" value={start} onChange={setStart} />
        </View>
        <View style={styles.flex}>
          <TimeField label="Bis" value={end} onChange={setEnd} />
        </View>
      </View>
      <Text style={styles.hoursHint}>
        {start !== end ? `${hoursLabel(shiftMinutes({ starts_at: start, ends_at: end }))}${shiftLabel({ starts_at: start, ends_at: end }).endsWith('(+1)') ? ' · endet am nächsten Tag' : ''}` : ''}
      </Text>
      <TextField label="Notiz (optional)" value={note} onChangeText={setNote} placeholder="z. B. Baustelle Müller, Schlüssel abholen" maxLength={300} />
      {!!error && <Notice tone="error">{error}</Notice>}
      <View style={styles.formButtons}>
        <Button label="Speichern" onPress={() => void save()} loading={busy} style={styles.flex} />
        <Button label="Abbrechen" variant="secondary" onPress={onClose} style={styles.flex} />
      </View>
      {!!shift && (
        <Pressable onPress={() => void remove()} accessibilityRole="button" style={styles.removeLink} disabled={busy}>
          <Text style={styles.removeText}>Schicht löschen</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  flex: { flex: 1 },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  weekTexts: { flex: 1, alignItems: 'center', gap: 2 },
  week: { color: Colors.text, fontSize: 18, fontWeight: '700' },
  weekRange: { color: Colors.textMuted, fontSize: 13.5 },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowHover: { borderColor: Colors.borderFocus },
  todayLink: { alignSelf: 'center' },
  todayText: { color: Colors.accent, fontSize: 13.5, fontWeight: '600' },
  toolbar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.md, flexWrap: 'wrap' },
  summary: { color: Colors.textMuted, fontSize: 13.5 },
  day: { paddingVertical: Spacing.md, gap: Spacing.sm },
  dayBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayLabel: { color: Colors.text, fontSize: 14.5, fontWeight: '700' },
  dayToday: { color: Colors.accent },
  holiday: { color: '#C4B5FD', fontSize: 12, fontWeight: '600' },
  add: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  none: { color: Colors.textFaint, fontSize: 13.5 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 10 },
  entryHover: { backgroundColor: 'rgba(255,255,255,0.05)' },
  entryTexts: { flex: 1, gap: 2 },
  entryLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  entryName: { color: Colors.text, fontSize: 14.5, fontWeight: '600', flexShrink: 1 },
  mine: { color: Colors.accent },
  entryTime: { color: Colors.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  entryHours: { color: Colors.textFaint, fontSize: 12.5 },
  entryNote: { color: Colors.textMuted, fontSize: 13 },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  warnText: { color: Colors.danger, fontSize: 12.5 },
  absencePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(167,139,250,0.14)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  absenceText: { color: '#C4B5FD', fontSize: 12.5, fontWeight: '600' },
  form: { gap: Spacing.sm, padding: Spacing.md, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderFocus, backgroundColor: 'rgba(255,255,255,0.03)' },
  formTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  formLabel: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  times: { flexDirection: 'row', gap: Spacing.md },
  hoursHint: { color: Colors.textFaint, fontSize: 12.5, minHeight: 16 },
  formButtons: { flexDirection: 'row', gap: Spacing.md },
  removeLink: { alignSelf: 'center', paddingVertical: 4 },
  removeText: { color: Colors.danger, fontSize: 13.5, fontWeight: '600' },
  hint: { color: Colors.textFaint, fontSize: 12.5 },
});

