import { randomUUID } from 'expo-crypto';
import { Briefcase, CheckCircle2, ChevronLeft, ChevronRight, Crown, FileText, MapPin, Plus, Send, TriangleAlert } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TextField } from '@/components/auth/text-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { Segmented } from '@/components/ui/segmented';
import { TextLink } from '@/components/ui/text-link';
import { Colors, Spacing, accentAlpha } from '@/constants/theme';
import { useCrm, type Order } from '@/features/crm/crm-provider';
import { orderLeadDone } from '@/features/crm/order-lead';
import { useDocuments } from '@/features/documents/documents-provider';
import { PDF_SAVED, pdfSupported } from '@/features/documents/save-pdf';
import { playSound } from '@/features/sound/ui-sound';
import { useHover } from '@/hooks/use-hover';
import { saveFile } from '@/lib/files';
import { supabase } from '@/lib/supabase';

import { PersonDot } from './chat-list';
import { Chip } from './chip';
import { stampLabel } from './plan-pdf';
import {
  absentOn,
  addDays,
  copyWeek,
  crewLabel,
  dayIso,
  dayLabel,
  groupJobs,
  holidayName,
  hoursLabel,
  isoWeek,
  jobRows,
  KIND_LABEL,
  parsePlanSnapshot,
  planSnapshot,
  rangeLabel,
  recentSites,
  samePlan,
  SHIFT_COLUMNS,
  SHIFT_PRESETS,
  shiftLabel,
  shiftMinutes,
  timeLabel,
  weekDays,
  weekStart,
  type Job,
  type PlanJob,
  type PlanSnapshot,
  type Shift,
  type TeamAbsence,
} from './staff-logic';
import { staffErrorText, useTeamHub } from './team-hub-provider';
import { useAccess, useTeam } from './team-provider';
import { TimeField } from './time-field';

type Published = { plan: PlanSnapshot; version: number; publishedAt: string };
type Editing = { day: string; job?: Job };

/**
 * Team → Arbeitsplan, Woche für Woche.
 * Wer Personal verwaltet (Inhaber, Mitgründer, ggf. Mitarbeiter mit Recht „Personal“), plant Einsätze – Ort, Zeit,
 * mehrere Leute, einer davon Teamleiter – und stellt die Woche fertig. Daraus wird ein PDF.
 * Alle anderen sehen nur den fertigen Plan, nicht den Entwurf.
 */
export function SchedulePanel() {
  const access = useAccess();
  const today = dayIso(new Date());
  const [monday, setMonday] = useState(() => weekStart(today));
  const sunday = addDays(monday, 6);
  const current = monday === weekStart(today);

  const move = (to: string) => {
    playSound('tick');
    setMonday(to);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.weekRow}>
        <ArrowButton label="Vorige Woche" onPress={() => move(addDays(monday, -7))} icon="left" />
        <View style={styles.weekTexts}>
          <Text style={styles.week}>KW {isoWeek(monday)}</Text>
          <Text style={styles.weekRange}>{rangeLabel(monday, sunday)}</Text>
        </View>
        <ArrowButton label="Nächste Woche" onPress={() => move(addDays(monday, 7))} icon="right" />
      </View>
      {!current && (
        <Pressable onPress={() => move(weekStart(today))} accessibilityRole="button" style={styles.todayLink}>
          <Text style={styles.todayText}>Zur aktuellen Woche</Text>
        </Pressable>
      )}
      {access.hr ? <PlanEditor key={monday} monday={monday} /> : <PlanReader key={monday} monday={monday} />}
    </View>
  );
}

/** Fertiger Plan der Woche (work_plans) */
function usePublished(monday: string) {
  const { team } = useTeam();
  const hub = useTeamHub();
  const ws = team?.owner_id ?? '';
  const [published, setPublished] = useState<Published | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!ws) return;
    const { data, error: err } = await supabase
      .from('work_plans')
      .select('version, snapshot, published_at')
      .eq('company_id', ws)
      .eq('week_start', monday)
      .maybeSingle();
    setLoaded(true);
    if (err) return setError(staffErrorText(err, 'Der fertige Plan konnte nicht geladen werden.'));
    setError(null);
    const plan = data ? parsePlanSnapshot(data.snapshot) : null;
    setPublished(plan && data ? { plan, version: Number(data.version) || 1, publishedAt: String(data.published_at) } : null);
  }, [ws, monday]);

  useEffect(() => {
    const t = setTimeout(() => void reload(), 0);
    return () => clearTimeout(t);
  }, [reload, hub.planVersion]);

  return { published, loaded, error, reload };
}

// ---------------------------------------------------------------------------
// Mitarbeiter: nur der fertige Plan
// ---------------------------------------------------------------------------

function PlanReader({ monday }: { monday: string }) {
  const hub = useTeamHub();
  const { published, loaded, error } = usePublished(monday);
  const [who, setWho] = useState<'alle' | 'ich'>('alle');

  if (!loaded) return null;
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!published)
    return (
      <Card>
        <View style={styles.waiting}>
          <View style={styles.waitingIcon}>
            <FileText size={22} color={Colors.text} strokeWidth={1.8} />
          </View>
          <Text style={styles.waitingTitle}>Der Plan für KW {isoWeek(monday)} ist noch nicht fertig</Text>
          <Text style={styles.waitingText}>
            Sobald die Leitung ihn fertigstellt, siehst du ihn hier – und bekommst eine Mitteilung.
          </Text>
        </View>
      </Card>
    );

  const mine = published.plan.days.flatMap((d) => d.jobs.filter((j) => j.members.includes(hub.me)));
  const minutes = mine.reduce((n, j) => n + shiftMinutes(j), 0);
  return (
    <>
      <View style={styles.statusRow}>
        <CheckCircle2 size={16} color={Colors.accent} />
        <Text style={styles.statusText}>
          Fertig · Stand {stampLabel(published.publishedAt)}
          {published.version > 1 ? ` · Version ${published.version}` : ''}
        </Text>
      </View>
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
        <PdfButton published={published} />
      </View>
      <Text style={styles.summary}>
        {mine.length ? `Du: ${mine.length} ${mine.length === 1 ? 'Einsatz' : 'Einsätze'} · ${hoursLabel(minutes)}` : 'Du hast diese Woche keinen Einsatz.'}
      </Text>
      <PlanSheet plan={published.plan} me={hub.me} onlyMine={who === 'ich'} />
      <Text style={styles.hint}>Fragen zum Plan am besten im Chat.</Text>
    </>
  );
}

/** Der fertige Plan wie auf Papier (so sieht auch das PDF aus) */
function PlanSheet({ plan, me, onlyMine }: { plan: PlanSnapshot; me: string; onlyMine: boolean }) {
  const nameOf = (id: string) => (id === me ? 'Du' : (plan.people[id] ?? 'Ehemaliges Mitglied'));
  return (
    <View style={styles.paper}>
      <View style={styles.paperBar} />
      {plan.days.map((d) => {
        const jobs = onlyMine ? d.jobs.filter((j) => j.members.includes(me)) : d.jobs;
        const away = onlyMine ? d.away.filter((m) => m === me) : d.away;
        if (onlyMine && !jobs.length && !away.length) return null;
        return (
          <View key={d.day} style={styles.paperDay}>
            <View style={styles.paperDayHead}>
              <Text style={styles.paperDayLabel}>{dayLabel(d.day, true)}</Text>
              {!!d.holiday && <Text style={styles.paperHoliday}>Feiertag: {d.holiday}</Text>}
            </View>
            {!jobs.length && <Text style={styles.paperNone}>{d.holiday ? 'Feiertag – keine Einsätze' : 'Keine Einsätze'}</Text>}
            {jobs.map((j, i) => (
              <PaperJob key={i} job={j} me={me} nameOf={nameOf} />
            ))}
            {away.length > 0 && <Text style={styles.paperAway}>Abwesend: {away.map(nameOf).join(', ')}</Text>}
          </View>
        );
      })}
    </View>
  );
}

function PaperJob({ job, me, nameOf }: { job: PlanJob; me: string; nameOf: (id: string) => string }) {
  const mine = job.members.includes(me);
  const title = job.site ?? (job.members.length === 1 ? nameOf(job.members[0]) : 'Einsatz');
  const showCrew = !!job.site || job.members.length > 1;
  return (
    <View style={[styles.paperJob, mine && styles.paperJobMine]}>
      <Text style={styles.paperTime}>{shiftLabel(job)}</Text>
      <View style={styles.flex}>
        <Text style={styles.paperSite}>{title}</Text>
        {!!job.address && <Text style={styles.paperMuted}>{job.address}</Text>}
        {!!job.order_title && job.order_title !== job.site && <Text style={styles.paperMuted}>Auftrag: {job.order_title}</Text>}
        {showCrew && <Text style={styles.paperCrew}>{crewLabel(job, nameOf)}</Text>}
        {!!job.note && <Text style={styles.paperNote}>{job.note}</Text>}
        {!!job.order_id && job.lead === me && <LeadOrderButton orderId={job.order_id} />}
      </View>
    </View>
  );
}

/** Teamleiter: Auftrag des Einsatzes abhaken oder wieder öffnen */
function LeadOrderButton({ orderId }: { orderId: string }) {
  const { orders, reload } = useCrm();
  const order = orders.find((o) => o.id === orderId);
  // ohne Recht „Aufträge ansehen“ kennt die App den Stand nur aus der eigenen Antwort
  const [doneHere, setDoneHere] = useState<boolean | null>(null);
  const done = order ? order.completed : !!doneHere;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (order?.cancelled) return null;
  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    const r = await orderLeadDone(orderId, !done);
    setBusy(false);
    if (r.error) return setMessage({ tone: 'error', text: r.error });
    playSound('check');
    setDoneHere(!!r.completed);
    setMessage({ tone: 'success', text: r.completed ? 'Auftrag abgeschlossen – die Leitung sieht es sofort.' : 'Auftrag ist wieder offen.' });
    void reload();
  };
  return (
    <View style={styles.leadBox}>
      <View style={styles.leadRow}>
        <Crown size={13} color="#B7791F" strokeWidth={2.2} />
        <Text style={styles.leadHint}>{done ? 'Auftrag erledigt' : 'Du bist Teamleiter – fertig?'}</Text>
      </View>
      <Button
        label={done ? 'Wieder öffnen' : 'Auftrag erledigt ✓'}
        variant={done ? 'secondary' : 'primary'}
        onPress={() => void toggle()}
        loading={busy}
      />
      {!!message && <Text style={message.tone === 'error' ? styles.leadError : styles.leadDone}>{message.text}</Text>}
    </View>
  );
}

function PdfButton({ published, label = 'PDF' }: { published: Published; label?: string }) {
  const { seller, logo } = useDocuments();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  if (!pdfSupported) return null;
  const open = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { renderWorkPlanPdf, workPlanFileName } = await import('./plan-pdf');
      const bytes = await renderWorkPlanPdf({ ...published, seller, logo });
      await saveFile(bytes, workPlanFileName(published.plan), 'application/pdf');
      setMessage({ tone: 'success', text: PDF_SAVED });
    } catch (e) {
      console.warn('[Arbeitsplan-PDF]', e);
      setMessage({ tone: 'error', text: `Das PDF konnte nicht erstellt werden.\n\nTechnische Details: ${String(e)}` });
    }
    setBusy(false);
  };
  return (
    <View style={styles.pdfWrap}>
      <Button label={label} variant="secondary" onPress={() => void open()} loading={busy} />
      {!!message && <Notice tone={message.tone}>{message.text}</Notice>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Leitung: Einsätze planen und die Woche fertigstellen
// ---------------------------------------------------------------------------

function PlanEditor({ monday }: { monday: string }) {
  const { team } = useTeam();
  const hub = useTeamHub();
  const ws = team?.owner_id ?? '';
  const me = hub.me;
  const today = dayIso(new Date());
  const sunday = addDays(monday, 6);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<TeamAbsence[]>([]);
  const [sites, setSites] = useState<{ site: string; address: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [who, setWho] = useState<'alle' | 'ich'>('alle');
  const [editing, setEditing] = useState<Editing | null>(null);
  const [copying, setCopying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const { published, reload: reloadPublished, error: publishedError } = usePublished(monday);

  const load = useCallback(async () => {
    if (!ws) return;
    const [s, a, recent] = await Promise.all([
      supabase.from('work_shifts').select(SHIFT_COLUMNS).eq('company_id', ws).gte('day', monday).lte('day', sunday).order('day').order('starts_at'),
      supabase.rpc('team_absences', { p_from: monday, p_to: sunday }),
      // Orte der letzten Wochen zum schnellen Auswählen
      supabase
        .from('work_shifts')
        .select('site, address, day')
        .eq('company_id', ws)
        .not('site', 'is', null)
        .gte('day', addDays(monday, -56))
        .lte('day', addDays(sunday, 28))
        .order('day', { ascending: false })
        .limit(300),
    ]);
    setLoading(false);
    if (s.error) return setError(staffErrorText(s.error, 'Der Arbeitsplan konnte nicht geladen werden.'));
    setError(null);
    setShifts((s.data ?? []) as Shift[]);
    setAbsences(Array.isArray(a.data) ? (a.data as TeamAbsence[]) : []);
    setSites(recent.error ? [] : recentSites((recent.data ?? []) as Pick<Shift, 'site' | 'address' | 'day'>[]));
  }, [ws, monday, sunday]);

  useEffect(() => {
    // erst nach dem Zeichnen laden (kein setState direkt im Effekt)
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load, hub.absenceVersion]);

  const members = useMemo(() => team?.members ?? [], [team?.members]);
  const names = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);
  const fullName = (id: string) => names.get(id) ?? '?';
  const { orders } = useCrm();
  const orderTitle = useCallback((id: string) => orders.find((o) => o.id === id)?.title ?? null, [orders]);
  const jobs = useMemo(() => groupJobs(shifts), [shifts]);
  const visibleJobs = who === 'ich' ? jobs.filter((j) => j.members.includes(me)) : jobs;
  const mine = shifts.filter((s) => s.member_id === me);
  const myMinutes = mine.reduce((n, s) => n + shiftMinutes(s), 0);
  const allMinutes = shifts.reduce((n, s) => n + shiftMinutes(s), 0);

  // So würde der Plan jetzt aussehen – Abwesenheiten nur, wenn sie feststehen
  const confirmedAway = useMemo(() => absences.filter((a) => a.status === 'genehmigt' || a.status === 'gemeldet'), [absences]);
  const draft = useMemo(
    () => planSnapshot(monday, shifts, confirmedAway, names, orderTitle),
    [monday, shifts, confirmedAway, names, orderTitle],
  );
  const upToDate = !!published && samePlan(published.plan, draft);

  const copyLastWeek = async () => {
    setCopying(true);
    setInfo(null);
    const from = addDays(monday, -7);
    const { data, error: err } = await supabase.from('work_shifts').select(SHIFT_COLUMNS).eq('company_id', ws).gte('day', from).lt('day', monday);
    if (err) {
      setCopying(false);
      return setError(staffErrorText(err, 'Die Vorwoche konnte nicht geladen werden.'));
    }
    const rows = copyWeek((data ?? []) as Shift[], shifts, monday, randomUUID).filter((s) => names.has(s.member_id));
    if (!rows.length) {
      setCopying(false);
      return setInfo('Aus der Vorwoche gibt es nichts Neues zu übernehmen.');
    }
    const { error: insertError } = await supabase.from('work_shifts').insert(rows.map((r) => ({ ...r, company_id: ws })));
    setCopying(false);
    if (insertError) return setError(staffErrorText(insertError, 'Die Einsätze konnten nicht übernommen werden.'));
    playSound('check');
    const count = groupJobs(rows.map((r, i) => ({ ...r, id: String(i) }))).length;
    setInfo(`${count} ${count === 1 ? 'Einsatz' : 'Einsätze'} aus der Vorwoche übernommen.`);
    void load();
  };

  const publish = async () => {
    setPublishing(true);
    setInfo(null);
    setError(null);
    const { error: err } = await supabase.rpc('work_plan_publish', { p_week: monday, p_snapshot: draft });
    setPublishing(false);
    if (err) return setError(staffErrorText(err, 'Der Plan konnte nicht fertiggestellt werden.'));
    playSound('check');
    setInfo(
      published
        ? 'Änderungen veröffentlicht – alle sehen jetzt den neuen Stand und bekommen eine Mitteilung.'
        : 'Plan fertig – alle im Team sehen ihn jetzt und bekommen eine Mitteilung.',
    );
    await reloadPublished();
    void hub.refreshPlans();
  };

  const withdraw = async () => {
    setInfo(null);
    const { error: err } = await supabase.from('work_plans').delete().eq('company_id', ws).eq('week_start', monday);
    if (err) return setError(staffErrorText(err, 'Der Plan konnte nicht zurückgezogen werden.'));
    setInfo('Der Plan ist wieder ein Entwurf – Mitarbeiter sehen diese Woche erst, wenn du sie fertigstellst.');
    await reloadPublished();
  };

  const hasJobs = jobs.length > 0;

  return (
    <>
      <PublishBar
        published={published}
        upToDate={upToDate}
        hasJobs={hasJobs}
        busy={publishing}
        onPublish={() => void publish()}
        onWithdraw={() => void withdraw()}
      />
      {!!publishedError && <Notice tone="error">{publishedError}</Notice>}

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
        <Button label="Vorwoche übernehmen" variant="secondary" onPress={() => void copyLastWeek()} loading={copying} />
      </View>

      <Text style={styles.summary}>
        {`${jobs.length} ${jobs.length === 1 ? 'Einsatz' : 'Einsätze'} · Team ${hoursLabel(allMinutes)}`}
        {mine.length ? `  ·  Du: ${hoursLabel(myMinutes)}` : ''}
      </Text>

      {!!error && <Notice tone="error">{error}</Notice>}
      {!!info && <Notice tone="success">{info}</Notice>}

      <Card>
        {weekDays(monday).map((day, i) => {
          const dayJobs = visibleJobs.filter((j) => j.day === day);
          const dayAbsences = absences.filter(
            (a) => a.starts_on <= day && a.ends_on >= day && a.status !== 'abgelehnt' && (who === 'alle' || a.member_id === me),
          );
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
                {editing?.day !== day && <AddButton day={day} onPress={() => setEditing({ day })} />}
              </View>
              {!loading && dayJobs.length === 0 && dayAbsences.length === 0 && editing?.day !== day && (
                <Text style={styles.none}>{holiday ? 'Feiertag' : '–'}</Text>
              )}
              {dayJobs.map((j) =>
                editing?.job?.key === j.key ? null : (
                  <JobCard key={j.key} job={j} me={me} nameOf={hub.nameOf} fullName={fullName} absences={absences} onPress={() => setEditing({ day, job: j })} />
                ),
              )}
              {dayAbsences.map((a) => (
                <View key={`${a.id}-${day}`} style={styles.entry}>
                  <PersonDot name={fullName(a.member_id)} size={26} />
                  <Text style={[styles.entryName, a.member_id === me && styles.mine]} numberOfLines={1}>
                    {hub.nameOf(a.member_id)}
                  </Text>
                  <View style={styles.absencePill}>
                    <Text style={styles.absenceText}>
                      {KIND_LABEL[a.kind]}
                      {a.status === 'offen' ? ' (beantragt)' : ''}
                    </Text>
                  </View>
                </View>
              ))}
              {editing?.day === day && (
                <JobForm
                  key={editing.job?.key ?? 'neu'}
                  monday={monday}
                  day={day}
                  job={editing.job}
                  ws={ws}
                  absences={absences}
                  sites={sites}
                  onClose={() => setEditing(null)}
                  onSaved={(text) => {
                    setEditing(null);
                    setInfo(text);
                    void load();
                  }}
                />
              )}
            </View>
          );
        })}
      </Card>
      <Text style={styles.hint}>
        Mitarbeiter sehen nur den fertigen Plan. Änderungen danach sehen sie erst, wenn du sie veröffentlichst.
      </Text>
    </>
  );
}

function PublishBar({
  published,
  upToDate,
  hasJobs,
  busy,
  onPublish,
  onWithdraw,
}: {
  published: Published | null;
  upToDate: boolean;
  hasJobs: boolean;
  busy: boolean;
  onPublish: () => void;
  onWithdraw: () => void;
}) {
  const state = !published ? 'entwurf' : upToDate ? 'fertig' : 'geaendert';
  const title =
    state === 'entwurf'
      ? 'Entwurf'
      : state === 'fertig'
        ? 'Fertig – alle sehen diesen Plan'
        : 'Seit dem Fertigstellen geändert';
  const text =
    state === 'entwurf'
      ? 'Mitarbeiter sehen diese Woche erst, wenn du sie fertigstellst. Dann wird daraus ein PDF und alle bekommen eine Mitteilung.'
      : state === 'fertig'
        ? `Stand ${stampLabel(published!.publishedAt)}${published!.version > 1 ? ` · Version ${published!.version}` : ''}`
        : `Mitarbeiter sehen noch den Stand vom ${stampLabel(published!.publishedAt)}. Veröffentliche die Änderungen, damit alle den neuen Plan haben.`;
  return (
    <View style={[styles.publish, state === 'fertig' && styles.publishDone, state === 'geaendert' && styles.publishChanged]}>
      <View style={styles.publishTexts}>
        <View style={styles.publishTitleRow}>
          {state === 'fertig' ? (
            <CheckCircle2 size={16} color={Colors.accent} />
          ) : state === 'geaendert' ? (
            <TriangleAlert size={15} color="#FBBF24" />
          ) : (
            <FileText size={15} color={Colors.textMuted} />
          )}
          <Text style={styles.publishTitle}>{title}</Text>
        </View>
        <Text style={styles.publishText}>{text}</Text>
      </View>
      <View style={styles.publishActions}>
        {state !== 'fertig' && (
          <PublishButton
            label={state === 'entwurf' ? 'Fertigstellen & an alle' : 'Änderungen veröffentlichen'}
            onPress={onPublish}
            busy={busy}
            disabled={!hasJobs && state === 'entwurf'}
          />
        )}
        {!!published && <PdfButton published={published} label={state === 'fertig' ? 'PDF ansehen' : 'PDF (alter Stand)'} />}
        {!!published && <TextLink label="Zurück zum Entwurf" onPress={onWithdraw} />}
      </View>
    </View>
  );
}

function PublishButton({ label, onPress, busy, disabled }: { label: string; onPress: () => void; busy: boolean; disabled: boolean }) {
  const { hovered, hoverProps } = useHover();
  const off = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      {...hoverProps}
      style={[styles.publishButton, hovered && !off && styles.publishButtonHover, off && styles.publishButtonOff]}>
      <Send size={15} color={Colors.onAccent} strokeWidth={2.4} />
      <Text style={styles.publishButtonText}>{busy ? 'Wird fertiggestellt …' : label}</Text>
    </Pressable>
  );
}

function AddButton({ day, onPress }: { day: string; onPress: () => void }) {
  const { hovered, hoverProps } = useHover();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Einsatz am ${dayLabel(day, true)} eintragen`}
      hitSlop={6}
      {...hoverProps}
      style={[styles.add, hovered && styles.addHover]}>
      <Plus size={15} color={Colors.text} strokeWidth={2.2} />
      <Text style={styles.addText}>Einsatz</Text>
    </Pressable>
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

/** Ein Einsatz im Plan: Ort, Zeit, Leute (Teamleiter vorne), Notiz */
function JobCard({
  job,
  me,
  nameOf,
  fullName,
  absences,
  onPress,
}: {
  job: Job;
  me: string;
  nameOf: (id: string) => string;
  fullName: (id: string) => string;
  absences: TeamAbsence[];
  onPress: () => void;
}) {
  const { hovered, hoverProps } = useHover();
  const { orders } = useCrm();
  const order = job.order_id ? orders.find((o) => o.id === job.order_id) : null;
  const absent = job.members.filter((m) => absentOn(absences, m, job.day));
  const minutes = shiftMinutes(job);
  const title = job.site ?? (job.members.length === 1 ? nameOf(job.members[0]) : 'Einsatz');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${shiftLabel(job)}, ${job.members.length} ${job.members.length === 1 ? 'Person' : 'Personen'}`}
      {...hoverProps}
      style={[styles.job, hovered && styles.jobHover]}>
      <View style={styles.jobHead}>
        {job.site ? <MapPin size={14} color={Colors.textMuted} /> : null}
        <Text style={styles.jobTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.jobTime}>{shiftLabel(job)}</Text>
        <Text style={styles.jobHours}>{hoursLabel(minutes)}</Text>
      </View>
      {!!job.address && <Text style={styles.jobMuted}>{job.address}</Text>}
      {!!job.order_id && (
        <View style={styles.orderLine}>
          <Briefcase size={13} color={Colors.textMuted} />
          <Text style={styles.jobMuted} numberOfLines={1}>
            Auftrag: {order?.title ?? 'gelöscht'}
            {order?.completed ? ' · erledigt ✓' : ''}
          </Text>
        </View>
      )}
      {(!!job.site || job.members.length > 1) && (
        <View style={styles.crew}>
          {job.members.map((m) => (
            <View key={m} style={[styles.person, m === job.lead && styles.personLead]}>
              <PersonDot name={fullName(m)} size={22} />
              <Text style={[styles.personName, m === me && styles.mine]} numberOfLines={1}>
                {nameOf(m)}
              </Text>
              {m === job.lead && (
                <View style={styles.leadTag}>
                  <Crown size={11} color="#FBBF24" strokeWidth={2.2} />
                  <Text style={styles.leadText}>Teamleiter</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
      {!!job.note && <Text style={styles.jobNote}>{job.note}</Text>}
      {absent.length > 0 && (
        <View style={styles.warn}>
          <TriangleAlert size={12} color={Colors.danger} />
          <Text style={styles.warnText}>
            {absent.map(nameOf).join(', ')} {absent.length === 1 ? 'ist' : 'sind'} an diesem Tag abwesend
          </Text>
        </View>
      )}
    </Pressable>
  );
}

/** Einsatz anlegen oder ändern: Ort, Leute, Teamleiter, Zeit – neu auch für mehrere Tage */
function JobForm({
  monday,
  day,
  job,
  ws,
  absences,
  sites,
  onClose,
  onSaved,
}: {
  monday: string;
  day: string;
  job?: Job;
  ws: string;
  absences: TeamAbsence[];
  sites: { site: string; address: string | null }[];
  onClose: () => void;
  onSaved: (info: string) => void;
}) {
  const { team } = useTeam();
  const members = team?.members ?? [];
  const [site, setSite] = useState(job?.site ?? '');
  const [address, setAddress] = useState(job?.address ?? '');
  const [people, setPeople] = useState<string[]>(job?.members ?? []);
  const [lead, setLead] = useState<string | null>(job?.lead ?? null);
  const [orderId, setOrderId] = useState<string | null>(job?.order_id ?? null);
  const [orderQuery, setOrderQuery] = useState('');
  const { orders, customerById } = useCrm();
  const orderChoices = useMemo(
    () => pickableOrders(orders, orderId, orderQuery, job?.day ?? day, (id) => customerById(id)?.name ?? null),
    [orders, orderId, orderQuery, job?.day, day, customerById],
  );
  const openOrders = orders.filter((o) => !o.completed && !o.cancelled).length;
  const pickOrder = (o: Order) => {
    if (orderId === o.id) return setOrderId(null);
    setOrderId(o.id);
    const customer = customerById(o.customer_id);
    // Ort und Adresse vom Kunden übernehmen, wenn noch leer
    if (!site.trim()) setSite(customer?.name ?? o.title);
    if (!address.trim() && customer?.address) setAddress(customer.address);
  };
  const [days, setDays] = useState<string[]>([day]);
  const [start, setStart] = useState(job ? timeLabel(job.starts_at) : '07:00');
  const [end, setEnd] = useState(job ? timeLabel(job.ends_at) : '16:00');
  const [note, setNote] = useState(job?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? '?';
  const toggle = (id: string) => {
    const next = people.includes(id) ? people.filter((x) => x !== id) : [...people, id];
    setPeople(next);
    if (lead && !next.includes(lead)) setLead(null);
  };
  const toggleDay = (d: string) => setDays((list) => (list.includes(d) ? (list.length > 1 ? list.filter((x) => x !== d) : list) : [...list, d].sort()));
  const absentPeople = people.flatMap((p) =>
    days.map((d) => ({ p, d, a: absentOn(absences, p, d) })).filter((x) => x.a && x.a.status !== 'abgelehnt'),
  );

  const save = async () => {
    if (!people.length) return setError('Bitte wähle, wer bei diesem Einsatz dabei ist.');
    if (start === end) return setError('Beginn und Ende sind gleich.');
    setBusy(true);
    setError(null);
    const rows = jobRows({
      assignment_id: randomUUID(),
      days: job ? [job.day] : days,
      starts_at: start,
      ends_at: end,
      site: site.trim() || null,
      address: address.trim() || null,
      note: note.trim() || null,
      lead: people.length > 1 || site.trim() || orderId ? lead : null,
      members: people,
      order_id: orderId,
    });
    // erst die neuen Zeilen speichern, dann die alten löschen – klappt etwas nicht, bleibt der alte Stand
    const { error: err } = await supabase.from('work_shifts').insert(rows.map((r) => ({ ...r, company_id: ws })));
    if (err) {
      setBusy(false);
      return setError(staffErrorText(err, 'Der Einsatz konnte nicht gespeichert werden.'));
    }
    if (job) {
      const { error: delError } = await supabase.from('work_shifts').delete().in('id', job.shifts.map((s) => s.id));
      if (delError) {
        setBusy(false);
        return setError(staffErrorText(delError, 'Der alte Stand des Einsatzes konnte nicht entfernt werden.'));
      }
    }
    setBusy(false);
    playSound('check');
    onSaved(
      job
        ? 'Einsatz geändert.'
        : days.length > 1
          ? `Einsatz an ${days.length} Tagen eingetragen.`
          : `Einsatz eingetragen – ${people.length} ${people.length === 1 ? 'Person' : 'Personen'}.`,
    );
  };

  const remove = async () => {
    if (!job) return;
    setBusy(true);
    const { error: err } = await supabase.from('work_shifts').delete().in('id', job.shifts.map((s) => s.id));
    setBusy(false);
    if (err) return setError(staffErrorText(err, 'Der Einsatz konnte nicht gelöscht werden.'));
    onSaved('Einsatz gelöscht.');
  };

  const hours = start !== end ? hoursLabel(shiftMinutes({ starts_at: start, ends_at: end })) : '';
  const night = start !== end && shiftLabel({ starts_at: start, ends_at: end }).endsWith('(+1)');

  return (
    <View style={styles.form}>
      <Text style={styles.formTitle}>
        {job ? 'Einsatz ändern' : 'Neuer Einsatz'} · {dayLabel(job?.day ?? day, true)}
      </Text>

      <TextField label="Ort / Baustelle (optional)" value={site} onChangeText={setSite} placeholder="z. B. Baustelle Müller" maxLength={160} />
      {sites.length > 0 && (
        <View style={styles.chips}>
          {sites
            .filter((s) => s.site.toLowerCase() !== site.trim().toLowerCase())
            .slice(0, 6)
            .map((s) => (
              <Chip
                key={s.site}
                label={s.site}
                onPress={() => {
                  setSite(s.site);
                  if (s.address) setAddress(s.address);
                }}
              />
            ))}
        </View>
      )}
      <TextField label="Adresse (optional)" value={address} onChangeText={setAddress} placeholder="Straße, Ort" maxLength={200} />

      {(orders.length > 0 || !!orderId) && (
        <>
          <Text style={styles.formLabel}>Auftrag (optional) · der Teamleiter kann ihn abhaken</Text>
          {openOrders > 8 && (
            <TextField label="Auftrag suchen" value={orderQuery} onChangeText={setOrderQuery} placeholder="Leistung oder Kunde" />
          )}
          <View style={styles.chips}>
            {orderChoices.map((o) => {
              const customer = customerById(o.customer_id)?.name;
              return (
                <Chip
                  key={o.id}
                  label={`${orderId === o.id ? '✓ ' : ''}${o.title}${customer ? ` · ${customer}` : ''}`}
                  active={orderId === o.id}
                  onPress={() => pickOrder(o)}
                />
              );
            })}
          </View>
        </>
      )}

      <Text style={styles.formLabel}>Wer ist dabei? · {people.length ? `${people.length} ausgewählt` : 'mehrere möglich'}</Text>
      <View style={styles.chips}>
        {members.map((m) => (
          <Chip key={m.id} label={m.name} active={people.includes(m.id)} onPress={() => toggle(m.id)} />
        ))}
      </View>

      {people.length > 0 && (people.length > 1 || !!site.trim() || !!orderId) && (
        <>
          <Text style={styles.formLabel}>Teamleiter vor Ort{orderId ? ' · darf den Auftrag abhaken' : ''}</Text>
          <View style={styles.chips}>
            {people.map((id) => (
              <Chip key={id} label={`${lead === id ? '★ ' : ''}${nameOf(id)}`} active={lead === id} onPress={() => setLead(lead === id ? null : id)} />
            ))}
          </View>
        </>
      )}

      {absentPeople.length > 0 && (
        <Notice tone="info">
          {absentPeople
            .map((x) => `${nameOf(x.p)} ist am ${dayLabel(x.d)} abwesend (${KIND_LABEL[x.a!.kind]}${x.a!.status === 'offen' ? ', beantragt' : ''})`)
            .join('\n')}
        </Notice>
      )}

      <Text style={styles.formLabel}>Zeit</Text>
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
      <Text style={styles.hoursHint}>{hours ? `${hours} je Person${night ? ' · endet am nächsten Tag' : ''}` : ''}</Text>

      {!job && (
        <>
          <Text style={styles.formLabel}>An welchen Tagen? · gleicher Einsatz an mehreren Tagen</Text>
          <View style={styles.chips}>
            {weekDays(monday).map((d) => (
              <Chip key={d} label={dayLabel(d)} active={days.includes(d)} onPress={() => toggleDay(d)} />
            ))}
          </View>
        </>
      )}

      <TextField label="Notiz (optional)" value={note} onChangeText={setNote} placeholder="z. B. Material mitnehmen, Schlüssel bei Frau Müller" maxLength={300} />
      {!!error && <Notice tone="error">{error}</Notice>}
      <View style={styles.formButtons}>
        <Button label="Speichern" onPress={() => void save()} loading={busy} style={styles.flex} />
        <Button label="Abbrechen" variant="secondary" onPress={onClose} style={styles.flex} />
      </View>
      {!!job && (
        <Pressable onPress={() => void remove()} accessibilityRole="button" style={styles.removeLink} disabled={busy}>
          <Text style={styles.removeText}>Einsatz löschen</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Aufträge zum Auswählen: offene (und der gewählte), passende zum Tag zuerst, höchstens 8 */
function pickableOrders(
  orders: Order[],
  selected: string | null,
  query: string,
  day: string,
  customerName: (id: string) => string | null,
): Order[] {
  const q = query.trim().toLowerCase();
  const list = orders.filter(
    (o) =>
      o.id === selected ||
      (!o.completed &&
        !o.cancelled &&
        (!q || o.title.toLowerCase().includes(q) || (customerName(o.customer_id) ?? '').toLowerCase().includes(q))),
  );
  const rank = (o: Order) => (o.id === selected ? 0 : o.execution_at?.slice(0, 10) === day ? 1 : 2);
  return list.sort((a, b) => rank(a) - rank(b) || b.updated_at.localeCompare(a.updated_at)).slice(0, 8);
}

const PAPER_INK = '#141417';
const PAPER_MUTED = '#6B6B72';

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
  hint: { color: Colors.textFaint, fontSize: 12.5 },

  // Fertigstellen
  publish: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  publishDone: { borderColor: accentAlpha(0.4), backgroundColor: accentAlpha(0.06) },
  publishChanged: { borderColor: 'rgba(251,191,36,0.45)', backgroundColor: 'rgba(251,191,36,0.06)' },
  publishTexts: { flex: 1, minWidth: 220, gap: 3 },
  publishTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  publishTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  publishText: { color: Colors.textMuted, fontSize: 13, lineHeight: 18 },
  publishActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.md },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.accent,
  },
  publishButtonHover: { opacity: 0.9 },
  publishButtonOff: { opacity: 0.4 },
  publishButtonText: { color: Colors.onAccent, fontSize: 14.5, fontWeight: '700' },
  pdfWrap: { gap: Spacing.sm },

  // Tage
  day: { paddingVertical: Spacing.md, gap: Spacing.sm },
  dayBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.border },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  dayLabel: { color: Colors.text, fontSize: 14.5, fontWeight: '700' },
  dayToday: { color: Colors.accent },
  holiday: { color: '#C4B5FD', fontSize: 12, fontWeight: '600' },
  add: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addHover: { borderColor: Colors.borderFocus, backgroundColor: 'rgba(255,255,255,0.04)' },
  addText: { color: Colors.text, fontSize: 12.5, fontWeight: '600' },
  none: { color: Colors.textFaint, fontSize: 13.5 },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: 4, paddingHorizontal: 6, marginHorizontal: -6, borderRadius: 10 },
  entryName: { color: Colors.text, fontSize: 14.5, fontWeight: '600', flexShrink: 1 },
  mine: { color: Colors.accent },
  absencePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: 'rgba(167,139,250,0.14)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  absenceText: { color: '#C4B5FD', fontSize: 12.5, fontWeight: '600' },

  // Einsatz
  job: { gap: 6, padding: Spacing.md, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, backgroundColor: 'rgba(255,255,255,0.025)' },
  jobHover: { borderColor: Colors.borderFocus, backgroundColor: 'rgba(255,255,255,0.045)' },
  jobHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  jobTitle: { color: Colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
  jobTime: { color: Colors.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  jobHours: { color: Colors.textFaint, fontSize: 12.5 },
  jobMuted: { color: Colors.textMuted, fontSize: 13 },
  jobNote: { color: Colors.textMuted, fontSize: 13, fontStyle: 'italic' },
  crew: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 3,
    paddingLeft: 3,
    paddingRight: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  personLead: { backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)' },
  personName: { color: Colors.text, fontSize: 13, fontWeight: '600', maxWidth: 160 },
  leadTag: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  leadText: { color: '#FBBF24', fontSize: 11.5, fontWeight: '700' },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  warnText: { color: Colors.danger, fontSize: 12.5 },

  // Formular
  form: { gap: Spacing.sm, padding: Spacing.md, borderRadius: 14, borderWidth: 1, borderColor: Colors.borderFocus, backgroundColor: 'rgba(255,255,255,0.03)' },
  formTitle: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  formLabel: { color: Colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  times: { flexDirection: 'row', gap: Spacing.md },
  hoursHint: { color: Colors.textFaint, fontSize: 12.5, minHeight: 16 },
  formButtons: { flexDirection: 'row', gap: Spacing.md },
  removeLink: { alignSelf: 'center', paddingVertical: 4 },
  removeText: { color: Colors.danger, fontSize: 13.5, fontWeight: '600' },

  // Mitarbeiter: noch nicht fertig
  waiting: { alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.lg },
  waitingIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: Colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  waitingTitle: { color: Colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  waitingText: { color: Colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 420 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusText: { color: Colors.textMuted, fontSize: 13.5, fontWeight: '600' },

  // Fertiger Plan wie auf Papier
  paper: { backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden', paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.md },
  paperBar: { height: 5, backgroundColor: Colors.accent, marginHorizontal: -Spacing.lg, marginBottom: Spacing.xs },
  paperDay: { gap: 6 },
  paperDayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.sm, backgroundColor: '#ECECEF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  paperDayLabel: { color: PAPER_INK, fontSize: 14, fontWeight: '800' },
  paperHoliday: { color: PAPER_MUTED, fontSize: 12, fontWeight: '700' },
  paperNone: { color: PAPER_MUTED, fontSize: 13, fontStyle: 'italic', marginLeft: 10 },
  paperJob: { flexDirection: 'row', gap: Spacing.md, paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D9D9DE' },
  paperJobMine: { backgroundColor: accentAlpha(0.14), borderRadius: 8, borderBottomWidth: 0 },
  paperTime: { color: PAPER_INK, fontSize: 13.5, fontWeight: '700', width: 112, fontVariant: ['tabular-nums'] },
  paperSite: { color: PAPER_INK, fontSize: 14, fontWeight: '700' },
  paperMuted: { color: PAPER_MUTED, fontSize: 12.5 },
  paperCrew: { color: PAPER_INK, fontSize: 13 },
  paperNote: { color: PAPER_MUTED, fontSize: 12.5, fontStyle: 'italic' },
  paperAway: { color: PAPER_MUTED, fontSize: 12.5, marginLeft: 10 },
  leadBox: { gap: 6, marginTop: 6, alignSelf: 'stretch' },
  leadRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  leadHint: { color: PAPER_INK, fontSize: 13, fontWeight: '600' },
  leadDone: { color: PAPER_MUTED, fontSize: 12.5 },
  leadError: { color: '#B42318', fontSize: 12.5, fontWeight: '600' },
  orderLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
