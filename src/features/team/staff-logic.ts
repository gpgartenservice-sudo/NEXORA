/**
 * Arbeitsplan, Abwesenheiten und Team-Chats – reine Logik (ohne App/Netz, mit Unit-Tests).
 * Daten: Tabellen work_shifts, absences, team_messages (Skript 20261128090000_teams.sql).
 */

export type Shift = {
  id: string;
  member_id: string;
  /** JJJJ-MM-TT */
  day: string;
  /** HH:MM[:SS] */
  starts_at: string;
  ends_at: string;
  note: string | null;
  /** Einsatzort, z. B. „Baustelle Müller“ (Skript 20261129090000_einsaetze.sql) */
  site?: string | null;
  address?: string | null;
  /** Schichten mit derselben ID sind ein Einsatz (mehrere Leute gleichzeitig) */
  assignment_id?: string | null;
  /** Teamleiter dieses Einsatzes */
  is_lead?: boolean;
  /** Auftrag zum Einsatz – dessen Teamleiter darf ihn abhaken (Skript 20261202090000_teamleiter_einsatz.sql) */
  order_id?: string | null;
};

/** Spalten für work_shifts */
export const SHIFT_COLUMNS = 'id, member_id, day, starts_at, ends_at, note, site, address, assignment_id, is_lead, order_id';

export type AbsenceKind = 'urlaub' | 'krank' | 'frei';
export type AbsenceStatus = 'offen' | 'genehmigt' | 'abgelehnt' | 'gemeldet';
export type Absence = {
  id: string;
  member_id: string;
  kind: AbsenceKind;
  starts_on: string;
  ends_on: string;
  note: string | null;
  status: AbsenceStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  /** Krankmeldung: beim Arzt gewesen – Krankschreibung (eAU) kommt (Skript 20261130090000_krank_chat.sql) */
  doctor?: boolean;
  /** Krankmeldung: von der Leitung gesehen */
  seen_by?: string | null;
  seen_at?: string | null;
};
/** Spalten für absences */
export const ABSENCE_COLUMNS =
  'id, member_id, kind, starts_on, ends_on, note, status, decided_by, decided_at, decision_note, created_at, doctor, seen_by, seen_at';

/** Für den Arbeitsplan: bei Kollegen ohne Grund („abwesend“) */
export type TeamAbsence = {
  id: string;
  member_id: string;
  starts_on: string;
  ends_on: string;
  kind: AbsenceKind | 'abwesend';
  status: AbsenceStatus;
};

export const KIND_LABEL: Record<AbsenceKind | 'abwesend', string> = {
  urlaub: 'Urlaub',
  krank: 'Krank',
  frei: 'Frei',
  abwesend: 'Abwesend',
};

export const STATUS_LABEL: Record<AbsenceStatus, string> = {
  offen: 'Wartet auf Antwort',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
  gemeldet: 'Gemeldet',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Date (lokal) -> JJJJ-MM-TT */
export const dayIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** JJJJ-MM-TT -> Date um 12 Uhr (keine Probleme mit Sommerzeit) */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function addDays(iso: string, n: number): string {
  const d = parseDay(iso);
  d.setDate(d.getDate() + n);
  return dayIso(d);
}

/** Montag der Woche */
export function weekStart(iso: string): string {
  const d = parseDay(iso);
  const dow = (d.getDay() + 6) % 7; // Mo = 0
  return addDays(iso, -dow);
}

export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Kalenderwoche nach ISO 8601 */
export function isoWeek(iso: string): number {
  const d = parseDay(iso);
  const thursday = new Date(d);
  thursday.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4, 12);
  firstThursday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7) + 3);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

const WEEKDAY = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAY_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

/** „Mo 24.11.“ */
export function dayLabel(iso: string, long = false): string {
  const d = parseDay(iso);
  return `${(long ? WEEKDAY_LONG : WEEKDAY)[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** „24.11.2026“ */
export const dateLabel = (iso: string) => {
  const d = parseDay(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
};

/** „21.12. – 23.12.2026“ bzw. „03.12.2026“ */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return dateLabel(from);
  const a = parseDay(from);
  const b = parseDay(to);
  const head = a.getFullYear() === b.getFullYear() ? `${pad(a.getDate())}.${pad(a.getMonth() + 1)}.` : dateLabel(from);
  return `${head} – ${dateLabel(to)}`;
}

// ---------------------------------------------------------------------------
// Uhrzeiten und Schichten
// ---------------------------------------------------------------------------

/** "8", "8:5", "0800", "08:00:00" -> "08:00"; sonst null */
export function parseTime(text: string): string | null {
  const t = text.trim().replace('.', ':');
  let h: number;
  let m: number;
  const colon = /^(\d{1,2}):(\d{1,2})(?::\d{2})?$/.exec(t);
  const digits = /^(\d{1,2})(\d{2})?$/.exec(t);
  if (colon) [h, m] = [Number(colon[1]), Number(colon[2])];
  else if (digits) [h, m] = [Number(digits[1]), Number(digits[2] ?? 0)];
  else return null;
  if (h > 23 || m > 59) return null;
  return `${pad(h)}:${pad(m)}`;
}

export const timeLabel = (t: string) => t.slice(0, 5);

const minutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Dauer in Minuten – endet die Schicht vor dem Beginn, geht sie über Mitternacht */
export function shiftMinutes(s: Pick<Shift, 'starts_at' | 'ends_at'>): number {
  const d = minutes(s.ends_at) - minutes(s.starts_at);
  return d > 0 ? d : d + 24 * 60;
}

export const overnight = (s: Pick<Shift, 'starts_at' | 'ends_at'>) => minutes(s.ends_at) <= minutes(s.starts_at);

/** „08:00 – 16:30“ bzw. „22:00 – 06:00 (+1)“ */
export const shiftLabel = (s: Pick<Shift, 'starts_at' | 'ends_at'>) =>
  `${timeLabel(s.starts_at)} – ${timeLabel(s.ends_at)}${overnight(s) ? ' (+1)' : ''}`;

/** „8 Std.“ / „7,5 Std.“ / „7,75 Std.“ (genau wie in der Lohn-Liste, nicht auf 7,8 gerundet) */
export function hoursLabel(totalMinutes: number): string {
  const h = Math.round((totalMinutes / 60) * 100) / 100;
  return `${String(h).replace('.', ',')} Std.`;
}

// ---------------------------------------------------------------------------
// Stunden (Tabelle work_hours, Skript 20261201090000_aufgaben_stunden.sql)
// ---------------------------------------------------------------------------

export type WorkHours = {
  id: string;
  member_id: string;
  /** JJJJ-MM-TT */
  day: string;
  /** HH:MM[:SS] */
  starts_at: string;
  ends_at: string;
  break_minutes: number;
  /** Arbeitszeit ohne Pause (rechnet die Datenbank) */
  minutes: number;
  note: string | null;
  created_by?: string | null;
};

export const HOURS_COLUMNS = 'id, member_id, day, starts_at, ends_at, break_minutes, minutes, note, created_by';

/** Ohne Recht „Personal“: nur die letzten 62 Tage (wie die Datenbank) */
export const HOURS_EDIT_DAYS = 62;

/** Arbeitszeit ohne Pause in Minuten (≤ 0 = so nicht möglich) */
export function workMinutes(starts_at: string, ends_at: string, breakMinutes: number): number {
  if (minutes(starts_at) === minutes(ends_at)) return 0;
  return shiftMinutes({ starts_at, ends_at }) - Math.max(0, breakMinutes);
}

/** Pause: „30“, „0:45“, „1,5 h“, „1 Std“ → Minuten (0–600), sonst null */
export function parseBreak(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '');
  if (!t) return 0;
  let m: number;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(t);
  const hours = /^(\d+(?:[.,]\d+)?)(?:h|std\.?|stunden?)$/.exec(t);
  const mins = /^(\d{1,3})(?:m|min\.?|minuten)?$/.exec(t);
  if (clock) m = Number(clock[1]) * 60 + Number(clock[2]);
  else if (hours) m = Math.round(Number(hours[1].replace(',', '.')) * 60);
  else if (mins) m = Number(mins[1]);
  else return null;
  return m >= 0 && m <= 600 ? m : null;
}

/** „30 Min. Pause“ / „1 Std. Pause“ / „1,5 Std. Pause“ / „ohne Pause“ */
export function breakLabel(m: number): string {
  if (!m) return 'ohne Pause';
  return m % 60 === 0 || m > 90 ? `${hoursLabel(m)} Pause` : `${m} Min. Pause`;
}

/** Darf man den Eintrag ohne Recht „Personal“ noch ändern? */
export const hoursEditable = (day: string, today: string) => day >= addDays(today, -HOURS_EDIT_DAYS);

/** Tag ohne Recht „Personal“ erlaubt? (letzte 62 Tage bis morgen) */
export const hoursDayOk = (day: string, today: string) => hoursEditable(day, today) && day <= addDays(today, 1);

/** „2026-11“ des Tages */
export const monthOf = (iso: string) => iso.slice(0, 7);

/** Erster und letzter Tag eines Monats */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0, 12).getDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}

/** Monat davor/danach */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** „November 2026“ */
export function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export type HoursTotal = { member_id: string; minutes: number; days: number; entries: number };

/** Summe je Person (meiste Stunden zuerst) */
export function hoursByMember(rows: Pick<WorkHours, 'member_id' | 'day' | 'minutes'>[]): HoursTotal[] {
  const map = new Map<string, { minutes: number; days: Set<string>; entries: number }>();
  for (const r of rows) {
    const t = map.get(r.member_id) ?? { minutes: 0, days: new Set<string>(), entries: 0 };
    t.minutes += r.minutes;
    t.days.add(r.day);
    t.entries += 1;
    map.set(r.member_id, t);
  }
  return [...map.entries()]
    .map(([member_id, t]) => ({ member_id, minutes: t.minutes, days: t.days.size, entries: t.entries }))
    .sort((a, b) => b.minutes - a.minutes || a.member_id.localeCompare(b.member_id));
}

/** Vorschlag fürs nächste Eintragen: Zeiten vom letzten Eintrag, sonst 8–16:30 mit 30 Min. Pause */
export function hoursSuggestion(rows: Pick<WorkHours, 'member_id' | 'day' | 'starts_at' | 'ends_at' | 'break_minutes'>[], memberId: string) {
  const last = rows
    .filter((r) => r.member_id === memberId)
    .sort((a, b) => b.day.localeCompare(a.day))[0];
  return last
    ? { starts_at: timeLabel(last.starts_at), ends_at: timeLabel(last.ends_at), break_minutes: last.break_minutes }
    : { starts_at: '08:00', ends_at: '16:30', break_minutes: 30 };
}

/** Stunden als CSV für Excel/Lohnbüro (Semikolon, Komma, UTF-8 mit BOM – wie der Steuer-Export) */
export function hoursCsv(rows: WorkHours[], nameOf: (id: string) => string): string {
  const cell = (v: string) => {
    const t = v.replace(/\r?\n/g, ' ');
    return /[";]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ['Name', 'Datum', 'Beginn', 'Ende', 'Pause (Min.)', 'Stunden', 'Notiz'];
  const lines = [...rows]
    .sort(
      (a, b) =>
        nameOf(a.member_id).localeCompare(nameOf(b.member_id)) ||
        a.day.localeCompare(b.day) ||
        a.starts_at.localeCompare(b.starts_at),
    )
    .map((r) => [
      nameOf(r.member_id),
      dateLabel(r.day),
      timeLabel(r.starts_at),
      timeLabel(r.ends_at),
      String(r.break_minutes),
      (Math.round((r.minutes / 60) * 100) / 100).toFixed(2).replace('.', ','),
      r.note ?? '',
    ]);
  return '\uFEFF' + [head, ...lines].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

/** Vorlagen für schnelles Eintragen */
export const SHIFT_PRESETS: { label: string; starts_at: string; ends_at: string }[] = [
  { label: 'Früh', starts_at: '06:00', ends_at: '14:00' },
  { label: 'Tag', starts_at: '08:00', ends_at: '16:30' },
  { label: 'Spät', starts_at: '14:00', ends_at: '22:00' },
];

/**
 * Schichten der Vorwoche in die neue Woche übernehmen (ohne doppelte). Einsätze bleiben
 * zusammen: Jeder übernommene Einsatz bekommt eine neue ID (`newId`).
 */
export function copyWeek(
  previous: Shift[],
  existing: Shift[],
  targetMonday: string,
  newId: () => string,
): Omit<Shift, 'id'>[] {
  const key = (s: Pick<Shift, 'member_id' | 'day' | 'starts_at' | 'ends_at'>) =>
    `${s.member_id}|${s.day}|${timeLabel(s.starts_at)}|${timeLabel(s.ends_at)}`;
  const have = new Set(existing.map(key));
  const to = weekStart(targetMonday);
  const from = addDays(to, -7);
  const ids = new Map<string, string>();
  const groupId = (old: string) => {
    let id = ids.get(old);
    if (!id) {
      id = newId();
      ids.set(old, id);
    }
    return id;
  };
  return previous
    .filter((s) => s.day >= from && s.day < to)
    .map((s) => ({
      member_id: s.member_id,
      day: addDays(s.day, 7),
      starts_at: s.starts_at,
      ends_at: s.ends_at,
      note: s.note,
      site: s.site ?? null,
      address: s.address ?? null,
      assignment_id: s.assignment_id ? groupId(s.assignment_id) : null,
      is_lead: !!s.is_lead,
      ...(s.order_id ? { order_id: s.order_id } : {}),
    }))
    .filter((s) => !have.has(key(s)));
}

// ---------------------------------------------------------------------------
// Einsätze: mehrere Leute gleichzeitig am selben Ort, einer davon Teamleiter
// ---------------------------------------------------------------------------

export type Job = {
  /** assignment_id bzw. bei einzelnen Schichten deren ID */
  key: string;
  assignment_id: string | null;
  day: string;
  starts_at: string;
  ends_at: string;
  site: string | null;
  address: string | null;
  note: string | null;
  /** Teamleiter (member_id) */
  lead: string | null;
  /** alle im Einsatz, Teamleiter zuerst */
  members: string[];
  /** Auftrag zum Einsatz */
  order_id: string | null;
  shifts: Shift[];
};

/** Schichten zu Einsätzen zusammenfassen – je Tag nach Beginn, dann Ort sortiert */
export function groupJobs(shifts: Shift[]): Job[] {
  const jobs = new Map<string, Job>();
  for (const s of shifts) {
    const key = s.assignment_id ? `a:${s.assignment_id}` : `s:${s.id}`;
    let job = jobs.get(key);
    if (!job) {
      job = {
        key,
        assignment_id: s.assignment_id ?? null,
        day: s.day,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        site: s.site ?? null,
        address: s.address ?? null,
        note: s.note,
        lead: null,
        members: [],
        order_id: s.order_id ?? null,
        shifts: [],
      };
      jobs.set(key, job);
    }
    job.shifts.push(s);
    if (!job.members.includes(s.member_id)) job.members.push(s.member_id);
    if (s.is_lead && !job.lead) job.lead = s.member_id;
  }
  for (const job of jobs.values()) {
    if (job.lead) job.members = [job.lead, ...job.members.filter((m) => m !== job.lead)];
  }
  return [...jobs.values()].sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      timeLabel(a.starts_at).localeCompare(timeLabel(b.starts_at)) ||
      (a.site ?? '').localeCompare(b.site ?? '', 'de'),
  );
}

/** Zuletzt benutzte Orte (für schnelles Auswählen), neueste zuerst, ohne doppelte */
export function recentSites(shifts: Pick<Shift, 'site' | 'address' | 'day'>[], max = 8): { site: string; address: string | null }[] {
  const seen = new Map<string, { site: string; address: string | null; day: string }>();
  for (const s of shifts) {
    const site = s.site?.trim();
    if (!site) continue;
    const k = site.toLowerCase();
    const before = seen.get(k);
    if (!before || s.day > before.day) seen.set(k, { site, address: s.address ?? before?.address ?? null, day: s.day });
  }
  return [...seen.values()]
    .sort((a, b) => b.day.localeCompare(a.day) || a.site.localeCompare(b.site, 'de'))
    .slice(0, max)
    .map(({ site, address }) => ({ site, address }));
}

/** Schichten, die für einen Einsatz gespeichert werden (je Person eine Zeile) */
export function jobRows(job: {
  assignment_id: string;
  days: string[];
  starts_at: string;
  ends_at: string;
  site: string | null;
  address: string | null;
  note: string | null;
  lead: string | null;
  members: string[];
  order_id?: string | null;
}): Omit<Shift, 'id'>[] {
  return job.days.flatMap((day) =>
    job.members.map((member_id) => ({
      member_id,
      day,
      starts_at: job.starts_at,
      ends_at: job.ends_at,
      note: job.note,
      site: job.site,
      address: job.address,
      assignment_id: job.assignment_id,
      is_lead: member_id === job.lead,
      // nur mitschicken, wenn gesetzt (ältere Datenbank kennt die Spalte noch nicht)
      ...(job.order_id ? { order_id: job.order_id } : {}),
    })),
  );
}

// ---------------------------------------------------------------------------
// Fertiger Wochenplan (work_plans): so festgehalten, wie er beim Fertigstellen war
// ---------------------------------------------------------------------------

export type PlanJob = {
  starts_at: string;
  ends_at: string;
  site: string | null;
  address: string | null;
  note: string | null;
  lead: string | null;
  members: string[];
  /** nur bei Einsätzen mit Auftrag (so bleiben ältere Pläne unverändert) */
  order_id?: string;
  order_title?: string;
};
export type PlanDay = { day: string; holiday: string | null; jobs: PlanJob[]; away: string[] };
export type PlanSnapshot = {
  v: 1;
  /** Montag */
  week: string;
  /** member_id → Name (wie beim Fertigstellen) */
  people: Record<string, string>;
  days: PlanDay[];
};

/**
 * Plan einer Woche festhalten. Abwesende stehen nur als „abwesend“ drin (ohne Grund) –
 * den Plan sehen alle im Team.
 */
export function planSnapshot(
  monday: string,
  shifts: Shift[],
  absences: Pick<TeamAbsence, 'member_id' | 'starts_on' | 'ends_on'>[],
  names: Map<string, string> | Record<string, string>,
  /** Titel eines Auftrags (für Einsätze mit Auftrag) */
  orderTitle: (id: string) => string | null = () => null,
): PlanSnapshot {
  const nameOf = (id: string) => (names instanceof Map ? names.get(id) : names[id]) ?? 'Ehemaliges Mitglied';
  const jobs = groupJobs(shifts.filter((s) => s.day >= monday && s.day <= addDays(monday, 6)));
  const people: Record<string, string> = {};
  const days = weekDays(monday).map((day) => {
    const dayJobs = jobs
      .filter((j) => j.day === day)
      .map<PlanJob>((j) => ({
        starts_at: timeLabel(j.starts_at),
        ends_at: timeLabel(j.ends_at),
        site: j.site,
        address: j.address,
        note: j.note,
        lead: j.lead,
        members: j.members,
        ...(j.order_id ? { order_id: j.order_id, order_title: orderTitle(j.order_id) ?? 'Auftrag' } : {}),
      }));
    const away = [...new Set(absences.filter((a) => a.starts_on <= day && a.ends_on >= day).map((a) => a.member_id))];
    for (const id of [...dayJobs.flatMap((j) => j.members), ...away]) people[id] = nameOf(id);
    return { day, holiday: holidayName(day), jobs: dayJobs, away };
  });
  return { v: 1, week: monday, people, days };
}

/** Hat sich der Plan seit dem Fertigstellen geändert? */
export const samePlan = (a: PlanSnapshot | null, b: PlanSnapshot | null) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);

/** Gespeicherten Plan prüfen (aus der Datenbank) – unbrauchbar: null */
export function parsePlanSnapshot(raw: unknown): PlanSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.week !== 'string' || !Array.isArray(r.days)) return null;
  const people: Record<string, string> = {};
  if (r.people && typeof r.people === 'object')
    for (const [k, v] of Object.entries(r.people as Record<string, unknown>)) if (typeof v === 'string') people[k] = v;
  const days: PlanDay[] = [];
  for (const d of r.days as Record<string, unknown>[]) {
    if (!d || typeof d.day !== 'string') continue;
    const jobs: PlanJob[] = [];
    for (const j of Array.isArray(d.jobs) ? (d.jobs as Record<string, unknown>[]) : []) {
      if (!j || typeof j.starts_at !== 'string' || typeof j.ends_at !== 'string') continue;
      jobs.push({
        starts_at: j.starts_at,
        ends_at: j.ends_at,
        site: str(j.site),
        address: str(j.address),
        note: str(j.note),
        lead: str(j.lead),
        members: Array.isArray(j.members) ? j.members.filter((m): m is string => typeof m === 'string') : [],
        ...(str(j.order_id) ? { order_id: str(j.order_id)!, order_title: str(j.order_title) ?? 'Auftrag' } : {}),
      });
    }
    days.push({
      day: d.day,
      holiday: str(d.holiday),
      jobs,
      away: Array.isArray(d.away) ? d.away.filter((m): m is string => typeof m === 'string') : [],
    });
  }
  return { v: 1, week: r.week, people, days };
}

/** Eigene Einsätze aus einem fertigen Plan (Start: „Dein Tag im Team“) */
export function myPlanJobs(plan: PlanSnapshot, me: string): (PlanJob & { day: string })[] {
  return plan.days.flatMap((d) => d.jobs.filter((j) => j.members.includes(me)).map((j) => ({ ...j, day: d.day })));
}

/** „Max (Teamleiter), Lisa, Tom“ */
/** Zeitpunkt des Fertigstellens: „23.11.2026, 18:05 Uhr“ */
export function stampLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())} Uhr`;
}

export function crewLabel(job: Pick<PlanJob, 'lead' | 'members'>, nameOf: (id: string) => string): string {
  return job.members.map((m) => (m === job.lead ? `${nameOf(m)} (Teamleiter)` : nameOf(m))).join(', ');
}

// ---------------------------------------------------------------------------
// Feiertage (NRW) und Urlaubstage
// ---------------------------------------------------------------------------

/** Ostersonntag (Gauß/Anonymer gregorianischer Algorithmus) */
export function easter(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Gesetzliche Feiertage in Nordrhein-Westfalen */
export function holidaysNrw(year: number): Map<string, string> {
  const e = easter(year);
  return new Map([
    [`${year}-01-01`, 'Neujahr'],
    [addDays(e, -2), 'Karfreitag'],
    [addDays(e, 1), 'Ostermontag'],
    [`${year}-05-01`, 'Tag der Arbeit'],
    [addDays(e, 39), 'Christi Himmelfahrt'],
    [addDays(e, 50), 'Pfingstmontag'],
    [addDays(e, 60), 'Fronleichnam'],
    [`${year}-10-03`, 'Tag der Deutschen Einheit'],
    [`${year}-11-01`, 'Allerheiligen'],
    [`${year}-12-25`, '1. Weihnachtstag'],
    [`${year}-12-26`, '2. Weihnachtstag'],
  ]);
}

const holidayCache = new Map<number, Map<string, string>>();
export function holidayName(iso: string): string | null {
  const y = Number(iso.slice(0, 4));
  if (!holidayCache.has(y)) holidayCache.set(y, holidaysNrw(y));
  return holidayCache.get(y)!.get(iso.slice(0, 10)) ?? null;
}

/** Arbeitstage (Mo–Fr ohne Feiertage) von–bis einschließlich, optional nur innerhalb eines Jahres */
export function workingDays(from: string, to: string, year?: number): number {
  if (to < from) return 0;
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (year && Number(d.slice(0, 4)) !== year) continue;
    const dow = parseDay(d).getDay();
    if (dow === 0 || dow === 6 || holidayName(d)) continue;
    n++;
  }
  return n;
}

/** Genommene bzw. beantragte Urlaubstage einer Person in einem Jahr */
export function vacationDays(absences: Absence[], memberId: string, year: number) {
  const mine = absences.filter((a) => a.member_id === memberId && a.kind === 'urlaub');
  const sum = (status: AbsenceStatus) =>
    mine.filter((a) => a.status === status).reduce((n, a) => n + workingDays(a.starts_on, a.ends_on, year), 0);
  return { approved: sum('genehmigt'), pending: sum('offen') };
}

export type VacationAccount = {
  /** Urlaubstage im Jahr (Anspruch) */
  total: number;
  /** genehmigt und schon vorbei bzw. heute */
  taken: number;
  /** genehmigt, kommt noch */
  planned: number;
  /** beantragt, noch ohne Antwort */
  pending: number;
  /** übrig = Anspruch − genommen − geplant */
  left: number;
  /** Krankheitstage (Arbeitstage) im Jahr */
  sick: number;
  /** nächster genehmigter Urlaub bzw. freie Tage */
  next: Absence | null;
};

/** Urlaubskonto einer Person für ein Jahr (Arbeitstage, ohne Wochenenden und Feiertage) */
export function vacationAccount(absences: Absence[], memberId: string, total: number, year: number, today: string): VacationAccount {
  const mine = absences.filter((a) => a.member_id === memberId);
  const days = (a: Absence, from = a.starts_on, to = a.ends_on) => (to < from ? 0 : workingDays(from, to, year));
  let taken = 0;
  let planned = 0;
  let pending = 0;
  let sick = 0;
  for (const a of mine) {
    if (a.kind === 'krank') sick += days(a);
    if (a.kind !== 'urlaub') continue;
    if (a.status === 'offen') pending += days(a);
    if (a.status !== 'genehmigt') continue;
    // Urlaub, der gerade läuft: bis heute genommen, der Rest geplant
    taken += days(a, a.starts_on, a.ends_on < today ? a.ends_on : today);
    planned += days(a, a.starts_on > today ? a.starts_on : addDays(today, 1), a.ends_on);
  }
  const next =
    mine
      .filter((a) => (a.kind === 'urlaub' || a.kind === 'frei') && a.status === 'genehmigt' && a.ends_on >= today)
      .sort((a, b) => (a.starts_on < b.starts_on ? -1 : 1))[0] ?? null;
  return { total, taken, planned, pending, left: total - taken - planned, sick, next };
}

/** Eigene Krankmeldung, die heute gilt (sonst null) */
export const sickToday = (absences: Absence[], memberId: string, today: string) =>
  absences.find((a) => a.member_id === memberId && a.kind === 'krank' && a.starts_on <= today && a.ends_on >= today) ?? null;

/** Krankmeldungen, die die Leitung noch nicht gesehen hat (ohne die eigenen, nicht älter als 2 Wochen) */
export function unseenSickNotes(absences: Absence[], me: string, today: string): Absence[] {
  const since = addDays(today, -14);
  return absences
    .filter((a) => a.kind === 'krank' && a.member_id !== me && !a.seen_at && a.ends_on >= since)
    .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

/** Wer ist in den nächsten Tagen weg (genehmigt oder krank gemeldet), nach Beginn sortiert */
export function awaySoon(absences: Absence[], today: string, days = 14): Absence[] {
  const until = addDays(today, days);
  return absences
    .filter((a) => (a.status === 'genehmigt' || a.status === 'gemeldet') && a.ends_on >= today && a.starts_on <= until)
    .sort((a, b) => (a.starts_on < b.starts_on ? -1 : a.starts_on > b.starts_on ? 1 : 0));
}

/** Kalendertage einer Abwesenheit (für den Hinweis zur Krankschreibung ab Tag 4) */
export const calendarDays = (from: string, to: string) =>
  to < from ? 0 : Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000) + 1;

/** Ist die Person an diesem Tag abwesend? */
export const absentOn = (list: TeamAbsence[], memberId: string, day: string) =>
  list.find((a) => a.member_id === memberId && a.starts_on <= day && a.ends_on >= day) ?? null;

// ---------------------------------------------------------------------------
// Team-Chats
// ---------------------------------------------------------------------------

export type ChatKey = 'alle' | 'leitung' | `direkt:${string}`;
export type ChatMessage = {
  id: string;
  company_id: string;
  channel: 'alle' | 'leitung' | 'direkt';
  recipient_id: string | null;
  sender_id: string;
  body: string;
  created_at: string;
  /** Antwort auf diese Nachricht (Skript 20261130090000_krank_chat.sql) */
  reply_to?: string | null;
};
export type ChatSummary = { chat: ChatKey; body: string; sender_id: string; at: string; unread: number };

export const directKey = (otherId: string): ChatKey => `direkt:${otherId}`;
export const directPartner = (key: string) => (key.startsWith('direkt:') ? key.slice(7) : null);

export function isChatKey(v: unknown): v is ChatKey {
  return v === 'alle' || v === 'leitung' || (typeof v === 'string' && /^direkt:[0-9a-f-]{36}$/.test(v));
}

/** Live-Kanal eines Chats für „schreibt gerade …“ – für beide Personen eines Direkt-Chats gleich */
export function chatTopic(company: string, key: ChatKey, me: string): string {
  const other = directPartner(key);
  return other ? `team:${company}:direkt-${[me, other].sort().join('-')}` : `team:${company}:${key}`;
}

/** Live-Kanal der Firma für „online“ */
export const onlineTopic = (company: string) => `team:${company}`;

export type ChatReader = { user_id: string; read_at: string };

const msOf = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Wer hat die Nachricht schon gelesen (gelesen bis ≥ gesendet) */
export function readersOf(m: Pick<ChatMessage, 'created_at'>, readers: ChatReader[]): string[] {
  const sent = msOf(m.created_at);
  return readers.filter((r) => msOf(r.read_at) >= sent).map((r) => r.user_id);
}

/** Häkchen unter eigenen Nachrichten: gesendet, von manchen gelesen, von allen gelesen */
export function readState(m: Pick<ChatMessage, 'created_at'>, readers: ChatReader[], others: string[]): 'sent' | 'some' | 'all' {
  if (!others.length) return 'sent';
  const read = new Set(readersOf(m, readers));
  const n = others.filter((id) => read.has(id)).length;
  return n === 0 ? 'sent' : n === others.length ? 'all' : 'some';
}

/** „Gelesen von Anna und Tom“, „Gelesen von allen“ */
export function readLine(names: string[], all: boolean): string {
  if (!names.length) return '';
  if (all && names.length > 2) return 'Gelesen von allen';
  if (names.length === 1) return `Gelesen von ${names[0]}`;
  if (names.length <= 3) return `Gelesen von ${names.slice(0, -1).join(', ')} und ${names.at(-1)}`;
  return `Gelesen von ${names.slice(0, 2).join(', ')} und ${names.length - 2} weiteren`;
}

/** „Anna schreibt …“, „Anna und Tom schreiben …“, „3 Leute schreiben …“ */
export function typingLine(names: string[]): string {
  if (!names.length) return '';
  if (names.length === 1) return `${names[0]} schreibt …`;
  if (names.length === 2) return `${names[0]} und ${names[1]} schreiben …`;
  return `${names.length} Leute schreiben …`;
}

/** Feste Farbe je Person (Namen im Gruppenchat) */
export const PERSON_COLORS = ['#4FB3FF', '#FF9F45', '#A78BFA', '#FF7AB6', '#2DD4BF', '#FBBF24', '#FF5A5F', '#9AE66E'];
export function personColor(id: string): string {
  // FNV-1a mit Durchmischung: auch ähnliche IDs bekommen verschiedene Farben
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return PERSON_COLORS[h % PERSON_COLORS.length];
}

/** Kurzer Auszug für das Zitat einer Antwort (eine Zeile) */
export const quoteText = (body: string, max = 90) => {
  const one = body.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/** Gehört die Nachricht in diesen Chat (aus Sicht von `me`)? */
export function inChat(m: ChatMessage, key: ChatKey, me: string): boolean {
  const other = directPartner(key);
  if (!other) return m.channel === key;
  return m.channel === 'direkt' && ((m.sender_id === me && m.recipient_id === other) || (m.sender_id === other && m.recipient_id === me));
}

/** Chat-Schlüssel einer Nachricht aus Sicht von `me` */
export function chatOf(m: ChatMessage, me: string): ChatKey {
  if (m.channel !== 'direkt') return m.channel;
  return directKey(m.sender_id === me ? (m.recipient_id ?? '') : m.sender_id);
}

/** Neue Nachrichten anhängen: nach Zeit sortiert, ohne doppelte */
export function mergeMessages(list: ChatMessage[], more: ChatMessage[]): ChatMessage[] {
  const byId = new Map(list.map((m) => [m.id, m]));
  for (const m of more) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
}

/** „14:03“ heute, „gestern“, sonst „21.11.“ */
export function chatTime(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = dayIso(now);
  const day = dayIso(d);
  if (day === today) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (day === addDays(today, -1)) return 'gestern';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** Trennlinie über dem ersten Beitrag eines Tages: „Heute“, „Gestern“, „Mo 24.11.“ */
export function dayDivider(iso: string, now: Date): string {
  const day = dayIso(new Date(iso));
  const today = dayIso(now);
  if (day === today) return 'Heute';
  if (day === addDays(today, -1)) return 'Gestern';
  return dayLabel(day, true);
}

/** Nachrichten derselben Person kurz hintereinander bilden einen Block (wie bei WhatsApp) */
export const GROUP_GAP_MINUTES = 5;

export type MessageLayout = {
  /** erste Nachricht eines neuen Tages (Trennlinie darüber) */
  newDay: boolean;
  /** erste bzw. letzte Nachricht eines Blocks */
  first: boolean;
  last: boolean;
};

export function layoutMessages(list: Pick<ChatMessage, 'sender_id' | 'created_at'>[], gapMinutes = GROUP_GAP_MINUTES): MessageLayout[] {
  const gap = gapMinutes * 60_000;
  const day = (m: Pick<ChatMessage, 'created_at'>) => dayIso(new Date(m.created_at));
  const joined = (a: Pick<ChatMessage, 'sender_id' | 'created_at'>, b: Pick<ChatMessage, 'sender_id' | 'created_at'>) =>
    a.sender_id === b.sender_id &&
    day(a) === day(b) &&
    Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) <= gap;
  return list.map((m, i) => {
    const prev = list[i - 1];
    const next = list[i + 1];
    return {
      newDay: !prev || day(prev) !== day(m),
      first: !prev || !joined(prev, m),
      last: !next || !joined(m, next),
    };
  });
}

export type TextPart = { text: string; url?: string };

// Links, Mail-Adressen und Telefonnummern in Nachrichten antippbar machen
const LINK_RE =
  /(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+\.[^\s<>"]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|((?:\+|\b0)\d[\d /-]{6,}\d)/g;

/** Text in normale Stücke und Links zerlegen („www.x.de“ → https://www.x.de, Mail → mailto:, Nummer → tel:) */
export function linkParts(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    let raw = m[0];
    // Satzzeichen am Ende gehören nicht zum Link („siehe www.x.de.“)
    const trail = /[.,;:!?)\]]+$/.exec(raw)?.[0] ?? '';
    if (trail && (m[1] || m[2])) raw = raw.slice(0, -trail.length);
    if (start > at) parts.push({ text: text.slice(at, start) });
    const url = m[1]
      ? raw.startsWith('www.')
        ? `https://${raw}`
        : raw
      : m[2]
        ? `mailto:${raw}`
        : `tel:${raw.replace(/[ /-]/g, '')}`;
    parts.push({ text: raw, url });
    at = start + raw.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts.length ? parts : [{ text }];
}
