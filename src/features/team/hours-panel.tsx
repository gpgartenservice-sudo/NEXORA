import { ChevronLeft, ChevronRight, Clock, Download, Lock } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DateField } from '@/components/ui/date-field';
import { Notice } from '@/components/ui/notice';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';
import { saveFile, savesViaShareSheet } from '@/lib/files';
import { supabase } from '@/lib/supabase';

import { PersonDot } from './chat-list';
import { Chip } from './chip';
import {
  addDays,
  breakLabel,
  dayIso,
  dayLabel,
  HOURS_COLUMNS,
  HOURS_EDIT_DAYS,
  hoursByMember,
  hoursCsv,
  hoursDayOk,
  hoursEditable,
  hoursLabel,
  hoursSuggestion,
  monthBounds,
  monthName,
  monthOf,
  parseBreak,
  parseTime,
  personColor,
  shiftLabel,
  shiftMonth,
  timeLabel,
  workMinutes,
  type WorkHours,
} from './staff-logic';
import { staffErrorText, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam, type TeamMember } from './team-provider';
import { TimeField } from './time-field';

type Draft = {
  id: string | null;
  member: string;
  day: string;
  starts: string;
  ends: string;
  pause: string;
  note: string;
};

const PAUSES = [0, 15, 30, 45, 60];
/** „1 Tag“, „2 Tage“ – nach „an“: „an 2 Tagen“ */
const daysText = (n: number, dative = false) => `${n} ${n === 1 ? 'Tag' : dative ? 'Tagen' : 'Tage'}`;

/**
 * Team → Stunden.
 * Alle: Arbeitszeit eintragen (Tag, von – bis, Pause, Notiz) und den Monat sehen.
 * Wer „Personal“ hat: Stunden aller sehen und korrigieren, Summe je Person, CSV fürs Lohnbüro.
 */
export function HoursPanel() {
  const { team } = useTeam();
  const access = useAccess();
  const hub = useTeamHub();
  const ws = team?.owner_id ?? '';
  const me = hub.me;
  const hr = access.hr;
  const today = dayIso(new Date());

  const [month, setMonth] = useState(() => monthOf(today));
  const [rows, setRows] = useState<WorkHours[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [person, setPerson] = useState(me);
  const [editing, setEditing] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);

  const load = useCallback(async () => {
    if (!ws) return;
    const { from, to } = monthBounds(month);
    const res = await supabase
      .from('work_hours')
      .select(HOURS_COLUMNS)
      .eq('company_id', ws)
      .gte('day', from)
      .lte('day', to)
      .order('day', { ascending: false })
      .order('starts_at', { ascending: false });
    setLoaded(true);
    if (res.error) return setError(staffErrorText(res.error, 'Die Stunden konnten nicht geladen werden.'));
    setError(null);
    setRows((res.data ?? []) as WorkHours[]);
  }, [ws, month]);

  useEffect(() => {
    // erst nach dem Zeichnen laden (kein setState direkt im Effekt)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const members = useMemo(() => team?.members ?? [], [team?.members]);
  const nameOf = (id: string) => (id === me ? 'Du' : (members.find((m) => m.id === id)?.name ?? 'Ehemaliges Mitglied'));
  const shown = hr ? person : me;
  const list = rows.filter((r) => r.member_id === shown);
  const total = list.reduce((s, r) => s + r.minutes, 0);
  const days = new Set(list.map((r) => r.day)).size;
  const totals = hoursByMember(rows);
  // Leitung tippt jemanden an: das Formular trägt gleich für diese Person ein
  const suggestion = hoursSuggestion(rows, shown);

  const saved = (text: string) => {
    setInfo(text);
    setEditing(null);
    setFormKey((k) => k + 1);
    void load();
  };

  const exportCsv = async () => {
    setInfo(null);
    try {
      await saveFile(hoursCsv(rows, (id) => members.find((m) => m.id === id)?.name ?? 'Ehemaliges Mitglied'), `Stunden_${month}.csv`, 'text/csv;charset=utf-8');
      if (!savesViaShareSheet) setInfo(`Stunden_${month}.csv gespeichert.`);
    } catch {
      setError('Die Datei konnte nicht gespeichert werden.');
    }
  };

  return (
    <View style={styles.wrap}>
      {!!error && <Notice tone="error">{error}</Notice>}
      {!!info && <Notice tone="success">{info}</Notice>}

      <Card>
        <HoursForm
          key={`neu-${formKey}-${loaded ? 1 : 0}-${shown}`}
          initial={{
            id: null,
            member: shown,
            day: today,
            starts: suggestion.starts_at,
            ends: suggestion.ends_at,
            pause: String(suggestion.break_minutes),
            note: '',
          }}
          hr={hr}
          me={me}
          members={members}
          today={today}
          rows={rows}
          onSaved={saved}
        />
      </Card>

      {/* Monat wählen */}
      <View style={styles.monthBar}>
        <MonthButton dir="prev" onPress={() => setMonth((m) => shiftMonth(m, -1))} />
        <View style={styles.monthMid}>
          <Text style={styles.monthName}>{monthName(month)}</Text>
          {loaded && (
            <Text style={styles.monthSum}>
              {shown === me ? 'Du' : nameOf(shown)}: {hoursLabel(total)}
              {days ? ` an ${daysText(days, true)}` : ''}
            </Text>
          )}
        </View>
        <MonthButton dir="next" disabled={month >= monthOf(today)} onPress={() => setMonth((m) => shiftMonth(m, 1))} />
      </View>

      {/* Leitung: alle auf einen Blick */}
      {hr && (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>TEAM · {monthName(month).toUpperCase()}</Text>
            {rows.length > 0 && (
              <Pressable onPress={() => void exportCsv()} accessibilityRole="button" style={styles.csv}>
                <Download size={14} color={Colors.textMuted} />
                <Text style={styles.csvText}>Als CSV (Excel)</Text>
              </Pressable>
            )}
          </View>
          <Card>
            {members.map((m, i) => {
              const t = totals.find((x) => x.member_id === m.id);
              return (
                <PersonRow
                  key={m.id}
                  member={m}
                  me={me}
                  first={i === 0}
                  active={m.id === person}
                  minutes={t?.minutes ?? 0}
                  days={t?.days ?? 0}
                  onPress={() => {
                    setPerson(m.id);
                    setEditing(null);
                  }}
                />
              );
            })}
          </Card>
        </>
      )}

      <Text style={styles.section}>{shown === me ? 'DEINE STUNDEN' : `STUNDEN VON ${nameOf(shown).toUpperCase()}`}</Text>
      <Card>
        {loaded && list.length === 0 && (
          <Text style={styles.none}>
            {shown === me ? 'In diesem Monat noch nichts eingetragen.' : 'In diesem Monat nichts eingetragen.'}
          </Text>
        )}
        {list.map((r, i) =>
          editing === r.id ? (
            <View key={r.id} style={[styles.editWrap, i > 0 && styles.rowBorder]}>
              <HoursForm
                initial={{
                  id: r.id,
                  member: r.member_id,
                  day: r.day,
                  starts: timeLabel(r.starts_at),
                  ends: timeLabel(r.ends_at),
                  pause: String(r.break_minutes),
                  note: r.note ?? '',
                }}
                hr={hr}
                me={me}
                members={members}
                today={today}
                rows={rows}
                onSaved={saved}
                onCancel={() => setEditing(null)}
              />
            </View>
          ) : (
            <EntryRow
              key={r.id}
              entry={r}
              first={i === 0}
              locked={!hr && !hoursEditable(r.day, today)}
              by={r.created_by && r.created_by !== r.member_id ? nameOf(r.created_by) : null}
              onPress={() => {
                setInfo(null);
                setEditing(r.id);
              }}
            />
          ),
        )}
      </Card>
      {!hr && (
        <Text style={styles.privacy}>
          Deine Stunden sehen nur du und die Leitung. Ändern kannst du Einträge der letzten {HOURS_EDIT_DAYS} Tage.
        </Text>
      )}
    </View>
  );
}

function HoursForm({
  initial,
  hr,
  me,
  members,
  today,
  rows,
  onSaved,
  onCancel,
}: {
  initial: Draft;
  hr: boolean;
  me: string;
  members: TeamMember[];
  today: string;
  rows: WorkHours[];
  onSaved: (text: string) => void;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setFailure(null);
  };
  const editing = !!initial.id;
  const starts = parseTime(d.starts);
  const ends = parseTime(d.ends);
  const pause = parseBreak(d.pause);
  const work = starts && ends && pause != null ? workMinutes(starts, ends, pause) : null;
  const dayOk = hr || hoursDayOk(d.day, today);
  // schon eingetragen an dem Tag (gleiche Person)
  const same = rows.filter((r) => r.member_id === d.member && r.day === d.day && r.id !== d.id);
  const problem = !dayOk
    ? `Eintragen geht für die letzten ${HOURS_EDIT_DAYS} Tage bis morgen.`
    : !starts || !ends
      ? 'Bitte Beginn und Ende als HH:MM eingeben.'
      : pause == null
        ? 'Pause bitte in Minuten, z. B. 30.'
        : work != null && work <= 0
          ? 'Die Pause ist länger als die Arbeitszeit.'
          : null;

  const save = async () => {
    if (problem || !starts || !ends || pause == null) return setFailure(problem ?? 'Bitte alles ausfüllen.');
    setBusy(true);
    setFailure(null);
    const payload = {
      member_id: d.member,
      day: d.day,
      starts_at: starts,
      ends_at: ends,
      break_minutes: pause,
      note: d.note.trim() || null,
    };
    const { error } = d.id
      ? await supabase.from('work_hours').update(payload).eq('id', d.id)
      : await supabase.from('work_hours').insert(payload);
    setBusy(false);
    if (error) return setFailure(staffErrorText(error, 'Die Stunden konnten nicht gespeichert werden.'));
    playSound('check');
    const who = d.member === me ? '' : ` für ${members.find((m) => m.id === d.member)?.name ?? 'die Person'}`;
    onSaved(`${hoursLabel(work ?? 0)} am ${dayLabel(d.day)}${who} ${editing ? 'geändert' : 'eingetragen'}.`);
  };

  const remove = async () => {
    if (!d.id) return;
    setBusy(true);
    const { error } = await supabase.from('work_hours').delete().eq('id', d.id);
    setBusy(false);
    if (error) return setFailure(staffErrorText(error, 'Der Eintrag ließ sich nicht löschen.'));
    onSaved(`Eintrag vom ${dayLabel(d.day)} gelöscht.`);
  };

  const others = members.filter((m) => m.id !== me);
  return (
    <View style={styles.form}>
      {!editing && (
        <View style={styles.formHead}>
          <View style={styles.formIcon}>
            <Clock size={18} color={Colors.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.formTitle}>Stunden eintragen</Text>
            <Text style={styles.hint}>
              {hr ? 'Für dich oder jemanden im Team.' : 'Wann hast du gearbeitet? Die Leitung sieht es sofort.'}
            </Text>
          </View>
        </View>
      )}

      {hr && others.length > 0 && !editing && (
        <>
          <Text style={styles.formLabel}>Für wen?</Text>
          <View style={styles.chips}>
            <Chip label="Mich" active={d.member === me} onPress={() => set({ member: me })} />
            {others.map((m) => (
              <Chip key={m.id} label={m.name} active={d.member === m.id} onPress={() => set({ member: m.id })} />
            ))}
          </View>
        </>
      )}

      <Text style={styles.formLabel}>Tag</Text>
      <View style={styles.chips}>
        <Chip label="Heute" active={d.day === today} onPress={() => set({ day: today })} />
        <Chip label="Gestern" active={d.day === addDays(today, -1)} onPress={() => set({ day: addDays(today, -1) })} />
      </View>
      <DateField label="Datum" value={d.day} onChange={(v) => v && set({ day: v })} />

      <View style={styles.times}>
        <View style={styles.flex}>
          <TimeField label="Von" value={d.starts} onChange={(v) => set({ starts: v })} />
        </View>
        <View style={styles.flex}>
          <TimeField label="Bis" value={d.ends} onChange={(v) => set({ ends: v })} />
        </View>
      </View>

      <Text style={styles.formLabel}>Pause</Text>
      <View style={styles.chips}>
        {PAUSES.map((p) => (
          <Chip key={p} label={p ? `${p} Min.` : 'keine'} active={pause === p} onPress={() => set({ pause: String(p) })} />
        ))}
      </View>
      {pause != null && !PAUSES.includes(pause) && <Text style={styles.hint}>{breakLabel(pause)}</Text>}
      <TextField
        label="Pause in Minuten"
        value={d.pause}
        onChangeText={(v) => set({ pause: v })}
        keyboardType="number-pad"
        maxLength={5}
      />
      <TextField
        label="Notiz (optional)"
        value={d.note}
        onChangeText={(v) => set({ note: v })}
        placeholder="z. B. Baustelle Müller"
        maxLength={300}
      />

      <View style={styles.result}>
        <Text style={styles.resultBig}>{work != null && work > 0 ? hoursLabel(work) : '–'}</Text>
        <Text style={styles.resultText}>
          {starts && ends ? `${shiftLabel({ starts_at: starts, ends_at: ends })} · ${breakLabel(pause ?? 0)}` : 'Arbeitszeit'}
        </Text>
      </View>
      {same.length > 0 && (
        <Text style={styles.warn}>
          Am {dayLabel(d.day)} steht schon: {same.map((r) => shiftLabel(r)).join(', ')}
        </Text>
      )}
      {!!failure && <Notice tone="error">{failure}</Notice>}
      {!failure && problem && <Text style={styles.warn}>{problem}</Text>}

      <View style={styles.buttons}>
        <View style={styles.flex}>
          <Button label={editing ? 'Änderung speichern' : 'Eintragen'} onPress={() => void save()} loading={busy} />
        </View>
        {onCancel && (
          <View style={styles.flex}>
            <Button label="Abbrechen" variant="secondary" onPress={onCancel} />
          </View>
        )}
      </View>
      {editing && (
        <Pressable onPress={() => void remove()} disabled={busy} accessibilityRole="button" style={styles.deleteLink}>
          <Text style={styles.linkDanger}>Eintrag löschen</Text>
        </Pressable>
      )}
    </View>
  );
}

function EntryRow({
  entry: r,
  first,
  locked,
  by,
  onPress,
}: {
  entry: WorkHours;
  first: boolean;
  locked: boolean;
  by: string | null;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      disabled={locked}
      accessibilityRole="button"
      accessibilityLabel={`${dayLabel(r.day, true)}, ${hoursLabel(r.minutes)}${locked ? '' : ', ändern'}`}
      {...hoverProps}
      style={[styles.row, !first && styles.rowBorder, hovered && !locked && styles.rowHover]}>
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>{dayLabel(r.day, true)}</Text>
        <Text style={styles.rowSub}>
          {shiftLabel(r)} · {breakLabel(r.break_minutes)}
          {by ? ` · eingetragen von ${by}` : ''}
        </Text>
        {!!r.note && <Text style={styles.rowNote}>„{r.note}“</Text>}
      </View>
      {locked && <Lock size={14} color={Colors.textFaint} accessibilityLabel="zu alt zum Ändern" />}
      <Text style={styles.rowHours}>{hoursLabel(r.minutes)}</Text>
    </Pressable>
  );
}

function PersonRow({
  member,
  me,
  first,
  active,
  minutes,
  days,
  onPress,
}: {
  member: TeamMember;
  me: string;
  first: boolean;
  active: boolean;
  minutes: number;
  days: number;
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      {...hoverProps}
      style={[styles.row, styles.rowTight, !first && styles.rowBorder, (hovered || active) && styles.rowHover]}>
      <PersonDot name={member.name} size={32} color={personColor(member.id)} />
      <View style={styles.rowTexts}>
        <Text style={styles.rowTitle}>
          {member.name}
          {member.id === me ? ' (du)' : ''}
        </Text>
        <Text style={styles.rowSub}>{days ? daysText(days) : 'noch nichts eingetragen'}</Text>
      </View>
      <Text style={[styles.rowHours, !minutes && styles.rowHoursNone]}>{hoursLabel(minutes)}</Text>
    </Pressable>
  );
}

function MonthButton({ dir, onPress, disabled }: { dir: 'prev' | 'next'; onPress: () => void; disabled?: boolean }) {
  const { hovered, hoverProps } = useHover();
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      onPress={() => {
        playSound('tick');
        onPress();
      }}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={dir === 'prev' ? 'Monat davor' : 'Nächster Monat'}
      {...hoverProps}
      style={[styles.monthButton, hovered && !disabled && styles.monthButtonHover, disabled && styles.monthButtonOff]}>
      <Icon size={18} color={Colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.md },
  flex: { flex: 1 },
  section: { color: Colors.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 1.2, marginTop: Spacing.xs, marginLeft: Spacing.xs },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md, flexWrap: 'wrap' },
  none: { color: Colors.textMuted, fontSize: 14 },
  hint: { color: Colors.textMuted, fontSize: 13.5, lineHeight: 19 },
  warn: { color: '#FBBF24', fontSize: 13, lineHeight: 18 },
  privacy: { color: Colors.textFaint, fontSize: 12.5, textAlign: 'center' },

  form: { gap: Spacing.sm },
  formHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, marginBottom: Spacing.xs },
  formIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: accentAlpha(0.16),
  },
  formTitle: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  formLabel: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  times: { flexDirection: 'row', gap: Spacing.md },
  result: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.sm,
    flexWrap: 'wrap',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: accentAlpha(0.3),
    backgroundColor: Colors.accentSoft,
  },
  resultBig: { color: Colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  resultText: { color: Colors.textMuted, fontSize: 13.5 },
  buttons: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.xs },
  deleteLink: { alignSelf: 'center', paddingVertical: 6 },
  linkDanger: { color: Colors.danger, fontSize: 13.5, fontWeight: '600' },
  editWrap: { paddingVertical: Spacing.md },

  monthBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.xs },
  monthMid: { flex: 1, alignItems: 'center', gap: 2 },
  monthName: { color: Colors.text, fontSize: 17, fontWeight: '700' },
  monthSum: { color: Colors.textMuted, fontSize: 13.5 },
  monthButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceRaised,
  },
  monthButtonHover: { borderColor: Colors.borderFocus },
  monthButtonOff: { opacity: 0.35 },
  csv: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  csvText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderRadius: 10 },
  rowTight: { paddingVertical: Spacing.sm },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  rowHover: { backgroundColor: accentAlpha(0.05) },
  rowTexts: { flex: 1, gap: 3 },
  rowTitle: { color: Colors.text, fontSize: 15, fontWeight: '600' },
  rowSub: { color: Colors.textMuted, fontSize: 13.5 },
  rowNote: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  rowHours: { color: Colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  rowHoursNone: { color: Colors.textFaint, fontWeight: '600' },
});
