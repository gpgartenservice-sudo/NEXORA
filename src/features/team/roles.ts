/**
 * Rollen und Rechte im Team (Business und Teams) – reine Logik mit Unit-Tests.
 * Die verbindlichen Regeln prüft die Datenbank (Skript 20261128090000_teams.sql:
 * nexora_role_default, nexora_may, Trigger nexora_guard_write); die App blendet nur aus.
 */

/**
 * inhaber = wem die Firma gehört; Inhaber + Mitgründer = Arbeitgeber; alle anderen sind Mitarbeiter.
 * Teamleiter ist keine feste Rolle mehr, sondern wird im Arbeitsplan pro Einsatz bestimmt
 * (Skript 20261202090000_teamleiter_einsatz.sql) – er darf den Auftrag des Einsatzes abhaken.
 */
export type MemberRole = 'inhaber' | 'mitgruender' | 'mitarbeiter';
/** Rollen, deren Rechte der Admin einstellt */
export type EditableRole = 'mitarbeiter';
export type Area =
  | 'kunden'
  | 'auftraege'
  | 'termine'
  | 'aufgaben'
  | 'dokumente'
  | 'finanzen'
  | 'lager'
  | 'social'
  | 'firma'
  | 'luna'
  | 'fahrplan'
  | 'personal';
export type Level = 'off' | 'read' | 'write';
export type Access = Record<Area, Level>;

export const AREAS: { key: Area; label: string; hint: string; toggle?: boolean }[] = [
  { key: 'kunden', label: 'Kunden', hint: 'Kontakte, Adressen, Notizen' },
  { key: 'auftraege', label: 'Aufträge', hint: 'Aufträge und ihr Stand' },
  { key: 'termine', label: 'Termine', hint: 'Kalender und Wetter' },
  { key: 'aufgaben', label: 'To-dos & Ziele', hint: 'Mitarbeiter: nur eigene To-dos sehen und abhaken' },
  { key: 'dokumente', label: 'Angebote & Rechnungen', hint: 'PDFs, Mahnungen, Versand' },
  { key: 'finanzen', label: 'Finanzen & Steuern', hint: 'Einnahmen, Ausgaben, Belege' },
  { key: 'lager', label: 'Lagerbestand', hint: 'Geräte und Material' },
  { key: 'social', label: 'Social Media', hint: 'Beiträge und Zahlen' },
  { key: 'firma', label: 'Firma', hint: 'Firmendaten und Logo' },
  { key: 'luna', label: 'Luna', hint: 'Die Assistentin benutzen', toggle: true },
  { key: 'fahrplan', label: 'Fahrplan', hint: 'Gründer-Checklisten', toggle: true },
  { key: 'personal', label: 'Personal', hint: 'Arbeitsplan, Urlaub genehmigen, Stunden aller', toggle: true },
];

export const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.key, a.label])) as Record<Area, string>;

export const ROLE_LABEL: Record<MemberRole, string> = {
  inhaber: 'Inhaber',
  mitgruender: 'Mitgründer',
  mitarbeiter: 'Mitarbeiter',
};

export const ROLE_HINT: Record<MemberRole, string> = {
  inhaber: 'Gehört die Firma, sieht alles, verwaltet Team und Abo.',
  mitgruender: 'Arbeitgeber: sieht alles, verwaltet das Team, im Leitungs-Chat.',
  mitarbeiter: 'Bekommt To-dos von der Leitung, trägt Stunden ein, beantragt Urlaub. Als Teamleiter eines Einsatzes hakt er dessen Auftrag ab – Rechte stellst du ein.',
};

const all = (level: Level): Access =>
  Object.fromEntries(AREAS.map((a) => [a.key, level])) as Access;

/** Vorlagen – gleiche Werte wie nexora_role_default() (zuletzt in 20261201090000_aufgaben_stunden.sql) */
export const DEFAULT_ACCESS: Record<EditableRole, Access> = {
  // Kunden, Firma und Finanzen standardmäßig aus; To-dos bekommen Mitarbeiter von der Leitung
  mitarbeiter: {
    kunden: 'off',
    auftraege: 'read',
    termine: 'read',
    aufgaben: 'read',
    dokumente: 'off',
    finanzen: 'off',
    lager: 'write',
    social: 'off',
    firma: 'off',
    luna: 'off',
    fahrplan: 'off',
    personal: 'off',
  },
};

export const FULL_ACCESS: Access = all('write');

const LEVELS: Level[] = ['off', 'read', 'write'];
const isLevel = (v: unknown): v is Level => typeof v === 'string' && (LEVELS as string[]).includes(v);

/** Antwort der Datenbank lesen; fehlende/unbekannte Werte = Vorlage */
export function parseAccess(raw: unknown, fallback: Access): Access {
  const out = { ...fallback };
  if (!raw || typeof raw !== 'object') return out;
  for (const a of AREAS) {
    const v = (raw as Record<string, unknown>)[a.key];
    if (isLevel(v)) out[a.key] = a.toggle && v === 'read' ? 'write' : v;
  }
  return out;
}

export function isRole(v: unknown): v is MemberRole {
  return v === 'inhaber' || v === 'mitgruender' || v === 'mitarbeiter';
}

/** Rolle aus der Datenbank; die frühere feste „Teamleitung“ ist heute Mitarbeiter */
export function parseRole(v: unknown): MemberRole | null {
  if (v === 'teamleitung') return 'mitarbeiter';
  return isRole(v) ? v : null;
}

/** Inhaber und Mitgründer: sehen alles, verwalten das Team, schreiben im Leitungs-Chat */
export const isEmployer = (role: MemberRole | null | undefined) => role === 'inhaber' || role === 'mitgruender';

/** Urlaub und freie Tage (mit Urlaubskonto) gibt es nur für Mitarbeiter – nicht für Inhaber und Mitgründer */
export const takesVacation = (role: MemberRole | null | undefined) => role === 'mitarbeiter';

/** null = keine Einschränkung (allein, Inhaber, Mitgründer) */
export function can(access: Access | null | undefined, area: Area, level: 'read' | 'write' = 'read'): boolean {
  if (!access) return true;
  const v = access[area] ?? 'off';
  return level === 'write' ? v === 'write' : v !== 'off';
}

/** Welcher Bereich gehört zu einem Menüpunkt (Name der Route)? */
const NAV_AREA: Record<string, Area> = {
  kunden: 'kunden',
  auftraege: 'auftraege',
  termine: 'termine',
  aufgaben: 'aufgaben',
  firma: 'firma',
  finanzen: 'finanzen',
  inventar: 'lager',
  social: 'social',
  assistent: 'luna',
  fahrplan: 'fahrplan',
};
export const navArea = (name: string): Area | null => NAV_AREA[name] ?? null;

/** Kurzer Satz, was eine Rolle darf („Sieht: Kunden, Termine · Bearbeitet: To-dos“) */
export function accessSummary(access: Access): string {
  const write = AREAS.filter((a) => access[a.key] === 'write').map((a) => a.label);
  const read = AREAS.filter((a) => access[a.key] === 'read').map((a) => a.label);
  const parts = [];
  if (write.length) parts.push(`Bearbeitet: ${write.join(', ')}`);
  if (read.length) parts.push(`Sieht: ${read.join(', ')}`);
  return parts.join(' · ') || 'Nur Arbeitsplan, Urlaub und Chat';
}

/**
 * Fehler der Datenbank „role_forbidden:kunden“ (Trigger nexora_guard_write) → verständlicher Text,
 * sonst null.
 */
const TEAM_RULES: Record<string, string> = {
  todo_employee_only: 'To-dos bekommst du von der Leitung – du kannst sie abhaken, aber nicht selbst anlegen oder ändern.',
  todo_not_yours: 'Dieses To-do ist nicht für dich.',
  assignee_not_member: 'Diese Person ist nicht (mehr) im Team.',
  hours_invalid: 'Die Pause ist länger als die Arbeitszeit – bitte Beginn, Ende und Pause prüfen.',
  hours_day_invalid: 'Stunden kannst du für heute und die letzten 62 Tage eintragen.',
  hours_locked: 'Stunden, die älter als 62 Tage sind, kann nur noch die Leitung ändern.',
  // ältere App-Version bietet noch „Teamleitung“ an
  _role_check: 'Die Rolle „Teamleitung“ gibt es nicht mehr. Wer Teamleiter ist, legst du im Arbeitsplan pro Einsatz fest.',
  order_not_lead: 'Diesen Auftrag kann nur der Teamleiter des Einsatzes oder die Leitung abhaken.',
  order_not_found: 'Diesen Auftrag gibt es nicht mehr.',
  order_cancelled: 'Dieser Auftrag ist storniert.',
};

export function roleErrorText(message: string | null | undefined): string | null {
  const rule = Object.keys(TEAM_RULES).find((k) => (message ?? '').includes(k));
  if (rule) return TEAM_RULES[rule];
  const m = /role_forbidden(?::([a-z]+))?/.exec(message ?? '');
  if (!m) return null;
  const area = m[1] as Area | undefined;
  const what = area && area in AREA_LABEL ? `„${AREA_LABEL[area]}“ zu bearbeiten` : 'das zu ändern';
  return `In deiner Rolle im Team hast du nicht das Recht, ${what}. Das kann die Leitung unter Profil → Team freischalten.`;
}
