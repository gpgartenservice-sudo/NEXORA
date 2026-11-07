/**
 * Luna (Assistentin): Die Server-Funktion (supabase/functions/assistant)
 * liefert eine Antwort und Vorschläge. Hier werden die Vorschläge geprüft,
 * bereinigt und vorhandenen Kunden, Aufträgen und Dokumenten zugeordnet.
 * Ausgeführt wird sofort (Luna macht es in der App vor) – nur wenn etwas
 * fehlt, wartet der Vorschlag, bis der Nutzer es ergänzt hat.
 *
 * Ohne App-Imports (tests/unit/assistant-logic.test.mjs).
 */
import { periodsFor, type GoalKind, type GoalPeriod } from '../goals/goals-logic';
import { toDate, toMs } from '../../lib/dates';

export const EXPENSE_CATEGORY_KEYS = [
  'material',
  'tools',
  'software',
  'marketing',
  'vehicle',
  'office',
  'insurance',
  'fees',
  'education',
  'other',
] as const;
export const POST_FORMAT_KEYS = ['video', 'carousel', 'image', 'story', 'text'] as const;
export const PLATFORM_KEYS = [
  'tiktok',
  'instagram',
  'youtube',
  'facebook',
  'linkedin',
  'x',
  'pinterest',
  'threads',
] as const;
export const INCOME_PERIODS = ['3', '6', '12', 'last_year'] as const;

// --- So kommt es von der Server-Funktion (kann unvollständig/fehlerhaft sein) ---
type Obj = Record<string, unknown>;
export type RawAction = {
  type?: unknown;
  customer?: Obj | null;
  customer_delete?: Obj | null;
  order?: Obj | null;
  order_delete?: Obj | null;
  expense?: Obj | null;
  post?: Obj | null;
  document?: Obj | null;
  income_proof?: Obj | null;
  existing_pdf?: Obj | null;
  mark_paid?: Obj | null;
  appointment?: Obj | null;
  order_date?: Obj | null;
  appointment_change?: Obj | null;
  order_price?: Obj | null;
  todo?: Obj | null;
  todo_change?: Obj | null;
  goal?: Obj | null;
  customer_change?: Obj | null;
  order_change?: Obj | null;
  expense_change?: Obj | null;
  post_change?: Obj | null;
  goal_change?: Obj | null;
  company_change?: Obj | null;
  mark_unpaid?: Obj | null;
  open?: Obj | null;
};
export type RawResult = { actions?: unknown; reply?: unknown; quick_replies?: unknown };

// --- Bereinigte Vorschläge ---
export type CustomerDraft = {
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};
export type OrderDraft = {
  title: string;
  description: string | null;
  price: number | null;
  billing: 'once' | 'monthly';
  meeting_at: string | null;
  execution_at: string | null;
};
export type ExpenseDraft = {
  title: string;
  amount: number;
  category: (typeof EXPENSE_CATEGORY_KEYS)[number];
  repeat: 'once' | 'monthly' | 'yearly';
  spent_on: string;
};
export type PostDraft = {
  title: string;
  format: (typeof POST_FORMAT_KEYS)[number];
  platforms: (typeof PLATFORM_KEYS)[number][];
  script: string | null;
  planned_for: string | null;
};
export type IncomePeriod = (typeof INCOME_PERIODS)[number];
/** Eigener Termin (ohne Auftrag) */
export type AppointmentDraft = {
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
};
/** Termin im Auftrag: Erstgespräch oder Ausführung */
export type DateField = 'meeting' | 'execution';
/** Vorhandener Termin (aus Aufträgen oder eigener) – so, wie Luna ihn kennt */
export type KnownEvent = {
  key: string;
  kind: 'meeting' | 'execution' | 'appointment';
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  orderId: string | null;
  appointmentId: string | null;
  done: boolean;
};
/** Neues To-do */
export type TodoDraft = { title: string; due_on: string | null; notes: string | null; important: boolean };
/** Vorhandenes To-do – so, wie Luna es kennt */
export type KnownTodo = { id: string; title: string; due_on: string | null; important: boolean; done: boolean };
/** Änderung an einem To-do (null = bleibt; due_on "" = Datum entfernen) */
export type TodoChange = {
  title: string | null;
  due_on: string | null;
  notes: string | null;
  important: boolean | null;
  done: boolean | null;
  remove: boolean;
};
export type GoalDraft = {
  kind: GoalKind;
  period: GoalPeriod;
  target: number;
  title: string | null;
  due_on: string | null;
};
/** Änderung an einem vorhandenen Termin (null = bleibt) */
export type AppointmentChange = {
  starts_at: string | null;
  ends_at: string | null;
  all_day: boolean | null;
  title: string | null;
  location: string | null;
  notes: string | null;
  done: boolean | null;
  remove: boolean;
};

// --- Änderungen an Vorhandenem: null = bleibt, '' = Feld leeren ---

/** Kundendaten ändern (der Name lässt sich nicht leeren) */
export type CustomerChange = {
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};
/** Auftrag ändern (Preis und Termine haben eigene Vorschläge) */
export type OrderChange = {
  title: string | null;
  description: string | null;
  discount_percent: number | null;
  contract_start: string | null;
  contract_end: string | null;
  meeting_done: boolean | null;
  offer_sent: boolean | null;
  offer_accepted: boolean | null;
  completed: boolean | null;
  cancelled: boolean | null;
  expenses: number | null;
  internal_notes: string | null;
};
export type ExpenseRepeat = 'once' | 'monthly' | 'yearly';
/** Vorhandene Ausgabe – so, wie Luna sie kennt */
export type KnownExpense = {
  id: string;
  title: string;
  amount: number;
  category: string;
  repeat: ExpenseRepeat;
  spent_on: string;
  ends_on: string | null;
  notes: string | null;
};
export type ExpenseChange = {
  title: string | null;
  amount: number | null;
  category: (typeof EXPENSE_CATEGORY_KEYS)[number] | null;
  repeat: ExpenseRepeat | null;
  spent_on: string | null;
  ends_on: string | null;
  notes: string | null;
  remove: boolean;
};
export type PostFormatKey = (typeof POST_FORMAT_KEYS)[number];
export type PlatformKey = (typeof PLATFORM_KEYS)[number];
/** Vorhandener Post – so, wie Luna ihn kennt */
export type KnownPost = {
  id: string;
  title: string;
  format: PostFormatKey;
  platforms: PlatformKey[];
  script: string | null;
  caption: string | null;
  hashtags: string | null;
  planned_for: string | null;
  published_at: string | null;
  url: string | null;
};
export const POST_METRICS = ['views', 'likes', 'comments', 'shares', 'saves'] as const;
export type PostMetric = (typeof POST_METRICS)[number];
export type PostChange = {
  title: string | null;
  format: PostFormatKey | null;
  platforms: PlatformKey[] | null;
  script: string | null;
  caption: string | null;
  hashtags: string | null;
  planned_for: string | null;
  /** alle Schritte erledigt ("ready") bzw. keiner ("idea") */
  steps: 'ready' | 'idea' | null;
  published: boolean | null;
  published_at: string | null;
  url: string | null;
  metrics: Partial<Record<PostMetric, number>>;
  remove: boolean;
};
/** Vorhandenes Ziel – so, wie Luna es kennt */
export type KnownGoal = {
  id: string;
  kind: GoalKind;
  period: GoalPeriod;
  target: number;
  title: string | null;
  progress: number;
  due_on: string | null;
  archived: boolean;
};
export type GoalChange = {
  target: number | null;
  title: string | null;
  period: GoalPeriod | null;
  progress: number | null;
  due_on: string | null;
  archived: boolean | null;
  remove: boolean;
};
/** Textfelder der Firmendaten (Bereich Firma) */
export const COMPANY_TEXT_FIELDS = [
  'company_name',
  'owner_name',
  'street',
  'zip',
  'city',
  'phone',
  'email',
  'website',
  'tax_number',
  'vat_id',
  'bank_name',
  'iban',
  'bic',
  'review_url',
] as const;
export type CompanyTextField = (typeof COMPANY_TEXT_FIELDS)[number];
/** Firmendaten ändern: nur die genannten Felder (Text null = leeren) */
export type CompanyChange = Partial<Record<CompanyTextField, string | null>> & {
  small_business?: boolean;
  vat_rate?: 19 | 7;
  payment_days?: number;
  offer_validity_days?: number;
};
/** Seiten, die Luna öffnen kann */
export const PAGES = {
  start: { href: '/home', label: 'Start' },
  kunden: { href: '/kunden', label: 'Kunden' },
  auftraege: { href: '/auftraege', label: 'Aufträge' },
  termine: { href: '/termine', label: 'Termine' },
  aufgaben: { href: '/aufgaben', label: 'Aufgaben' },
  ziele: { href: '/aufgaben?ansicht=ziele', label: 'Ziele' },
  finanzen: { href: '/finanzen', label: 'Finanzen' },
  steuern: { href: '/finanzen/steuern', label: 'Steuern' },
  beleg: { href: '/finanzen/beleg', label: 'Beleg erfassen' },
  social: { href: '/social', label: 'Social Media' },
  firma: { href: '/firma', label: 'Firma' },
  fahrplan: { href: '/fahrplan', label: 'Fahrplan' },
  profil: { href: '/profil', label: 'Profil' },
  abo: { href: '/profil/abo', label: 'Abo' },
  neuer_kunde: { href: '/kunden/neu', label: 'Neuer Kunde' },
  neuer_auftrag: { href: '/auftraege/neu', label: 'Neuer Auftrag' },
  neuer_termin: { href: '/termine/neu', label: 'Neuer Termin' },
  neue_ausgabe: { href: '/finanzen/ausgabe/neu', label: 'Neue Ausgabe' },
  neuer_post: { href: '/social/neu', label: 'Neue Post-Idee' },
  neues_ziel: { href: '/aufgaben/ziele/neu', label: 'Neues Ziel' },
} as const;
export type PageKey = keyof typeof PAGES;

/** Zu welchem Kunden gehört etwas? Vorhanden, neu aus diesem Gespräch, oder noch offen. */
export type CustomerLink = { existingId: string | null; newRef: string | null; name: string | null };
/** Zu welchem Auftrag gehört ein Angebot/eine Rechnung? */
export type OrderLink = { existingId: string | null; newRef: string | null; title: string | null };

export type Proposal =
  | { id: string; kind: 'customer'; include: boolean; data: CustomerDraft; duplicateOf: string | null }
  /** orderIds = seine Aufträge – die löscht Luna vorher (mit Aufträgen lässt sich ein Kunde nicht löschen) */
  | { id: string; kind: 'customer_delete'; include: boolean; data: { customerId: string; name: string; orderIds: string[] } }
  | { id: string; kind: 'order_delete'; include: boolean; customer: CustomerLink; order: OrderLink }
  | { id: string; kind: 'order'; include: boolean; data: OrderDraft; customer: CustomerLink }
  | { id: string; kind: 'expense'; include: boolean; data: ExpenseDraft }
  | { id: string; kind: 'post'; include: boolean; data: PostDraft }
  | {
      id: string;
      kind: 'document';
      include: boolean;
      data: { docKind: 'offer' | 'invoice'; service_date: string | null };
      customer: CustomerLink;
      order: OrderLink;
    }
  | { id: string; kind: 'income_proof'; include: boolean; data: { period: IncomePeriod } }
  | { id: string; kind: 'existing_pdf'; include: boolean; data: { documentId: string; number: string } }
  /** paid false = wieder auf offen setzen */
  | { id: string; kind: 'mark_paid'; include: boolean; data: { documentId: string; number: string; paid: boolean } }
  | { id: string; kind: 'appointment'; include: boolean; data: AppointmentDraft; customer: CustomerLink }
  | {
      id: string;
      kind: 'order_date';
      include: boolean;
      /** before = bisheriger Termin im Auftrag */
      data: { field: DateField; at: string; before: string | null };
      customer: CustomerLink;
      order: OrderLink;
    }
  | { id: string; kind: 'appointment_change'; include: boolean; data: AppointmentChange; event: KnownEvent }
  | {
      id: string;
      kind: 'order_price';
      include: boolean;
      /** billing null = bleibt; before* = bisher; documents = vorhandene Angebote/Rechnungen zum Auftrag */
      data: {
        price: number;
        billing: 'once' | 'monthly' | null;
        before: number | null;
        beforeBilling: 'once' | 'monthly' | null;
        documents: string[];
      };
      customer: CustomerLink;
      order: OrderLink;
    }
  | { id: string; kind: 'todo'; include: boolean; data: TodoDraft; customer: CustomerLink; order: OrderLink }
  | { id: string; kind: 'todo_change'; include: boolean; data: TodoChange; todo: KnownTodo }
  | { id: string; kind: 'goal'; include: boolean; data: GoalDraft }
  | { id: string; kind: 'customer_change'; include: boolean; data: CustomerChange; customer: { id: string; name: string } }
  | { id: string; kind: 'order_change'; include: boolean; data: OrderChange; customer: CustomerLink; order: OrderLink }
  | { id: string; kind: 'expense_change'; include: boolean; data: ExpenseChange; expense: KnownExpense }
  | { id: string; kind: 'post_change'; include: boolean; data: PostChange; post: KnownPost }
  | { id: string; kind: 'goal_change'; include: boolean; data: GoalChange; goal: KnownGoal }
  | { id: string; kind: 'company_change'; include: boolean; data: CompanyChange }
  /** Seite in der App öffnen (dort bleibt man danach) */
  | { id: string; kind: 'open'; include: boolean; data: { href: string; label: string } };

export type ExistingCustomer = {
  id: string;
  name: string;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
};
export type ExistingOrder = {
  id: string;
  title: string;
  customer_id: string;
  meeting_at?: string | null;
  execution_at?: string | null;
  cancelled?: boolean | null;
  price?: number | null;
  billing?: 'once' | 'monthly' | null;
  description?: string | null;
  discount_percent?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
  meeting_done?: boolean | null;
  offer_sent?: boolean | null;
  offer_accepted?: boolean | null;
  completed?: boolean | null;
  expenses?: number | null;
  internal_notes?: string | null;
};
export type ExistingDocument = {
  id: string;
  number: string;
  kind: 'offer' | 'invoice';
  paid_at: string | null;
  order_id?: string | null;
};
export type Known = {
  customers: ExistingCustomer[];
  orders: ExistingOrder[];
  documents: ExistingDocument[];
  /** Termine, die Luna mitgeschickt bekam, und ihre Kurzzeichen (T1 -> Termin) */
  events?: KnownEvent[];
  refs?: Record<string, string>;
  /** eigene Termine (für das eingetragene Ende) */
  appointments?: { id: string; ends_at: string | null }[];
  /** offene To-dos, die Luna mitgeschickt bekam, und ihre Kurzzeichen (A1 -> To-do) */
  todos?: KnownTodo[];
  todoRefs?: Record<string, string>;
  /** Ausgaben (E1 …), Posts (P1 …) und Ziele (Z1 …), die Luna mitgeschickt bekam */
  expenses?: KnownExpense[];
  expenseRefs?: Record<string, string>;
  posts?: KnownPost[];
  postRefs?: Record<string, string>;
  goals?: KnownGoal[];
  goalRefs?: Record<string, string>;
  /** aktuelle Firmendaten (damit nichts „geändert“ wird, was schon so ist) */
  seller?: Partial<Record<CompanyTextField, string | null>> & {
    small_business?: boolean;
    vat_rate?: number;
    payment_days?: number;
    offer_validity_days?: number;
  };
};

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+\n/g, '\n');
  return t ? t.slice(0, max) : null;
};
/** Zahl – auch als deutscher Text ("1.500,50", "3.000", "2,5 €") */
const num = (v: unknown): number | null => {
  let n = NaN;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    let t = v.trim().replace(/\s|€/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    n = /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
  }
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;
const inList = <T extends string>(v: unknown, list: readonly T[]): T | null =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null;

/** "none" & Co. = Feld leeren */
const CLEAR = /^(none|null|ohne|leer|-)$/i;
const isClear = (v: unknown) => typeof v === 'string' && CLEAR.test(v.trim());
/** before: bisheriger Wert (undefined = unbekannt) */
type Before<T> = T | null | undefined;

/** Neuer Text: null = bleibt, '' = leeren (nur wenn bisher etwas drinsteht) */
function textChange(v: unknown, max: number, before?: Before<string>): string | null {
  if (isClear(v)) return before === null || before === '' ? null : '';
  const s = str(v, max);
  return s === null || s === before ? null : s;
}
/** Neues Datum (JJJJ-MM-TT): null = bleibt, '' = leeren */
function dayChange(v: unknown, before?: Before<string>): string | null {
  if (isClear(v)) return before === null ? null : '';
  const d = validDay(typeof v === 'string' ? v.trim().slice(0, 10) : null);
  return d === null || d === before ? null : d;
}
/** Ja/Nein: null = bleibt (auch wenn es schon so ist) */
function flagChange(v: unknown, before?: Before<boolean>): boolean | null {
  const b = v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
  if (b === null || before === undefined) return b;
  return b === !!before ? null : b;
}
/** Betrag/Zahl in [min, max]: null = bleibt */
function numberChange(v: unknown, min: number, max: number, before?: Before<number>): number | null {
  const n = num(v);
  return n === null || n < min || n > max || n === before ? null : n;
}
const hasChange = (c: Record<string, unknown>) =>
  Object.entries(c).some(([k, v]) =>
    k === 'remove' ? false : v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).length > 0 : v !== null,
  );
/** Kurzzeichen (T1, A2, E3 …) -> Eintrag */
const byRef = <T extends { id: string }>(ref: unknown, refs?: Record<string, string>, list?: T[]): T | undefined => {
  const r = str(ref, 20)?.toUpperCase();
  const id = r ? refs?.[r] : undefined;
  return id ? list?.find((x) => x.id === id) : undefined;
};

/** "2026-11-04" -> gültiges Datum? */
export function validDay(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? v : null;
}

/**
 * Datum mit oder ohne Uhrzeit in lokaler Zeit -> ISO-Zeitstempel.
 * "2026-11-04" -> 9:00 Uhr (Standard), "2026-11-04T14:30" -> 14:30 Uhr.
 */
export function localDateTime(v: unknown, defaultHour = 9): string | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v.trim());
  if (!m || !validDay(m[1])) return null;
  const [y, mo, d] = m[1].split('-').map(Number);
  const h = m[2] !== undefined ? Number(m[2]) : defaultHour;
  const min = m[3] !== undefined ? Number(m[3]) : 0;
  if (h > 23 || min > 59) return null;
  return new Date(y, mo - 1, d, h, min).toISOString();
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const hasTime = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v.trim());
const sameInstant = (a: string, b: string) => toMs(a) === toMs(b);

/** "Fr., 06.11., 14:00" bzw. "Fr., 06.11. ganztägig" */
export function whenLabel(iso: string, allDay = false): string {
  const d = toDate(iso);
  if (!d) return '–';
  return allDay
    ? `${d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })} ganztägig`
    : d.toLocaleString('de-DE', {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
}

const norm = (s: string) =>
  s
    .toLocaleLowerCase('de-DE')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Passenden vorhandenen Kunden finden: gleicher Name/Firma, sonst eindeutiger Teil-Treffer. */
export function matchCustomer(name: string | null, customers: ExistingCustomer[]): ExistingCustomer | null {
  if (!name) return null;
  const n = norm(name);
  if (!n) return null;
  const exact = customers.filter((c) => norm(c.name) === n || (c.company && norm(c.company) === n));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = customers.filter((c) => {
    const cn = norm(c.name);
    return (cn.includes(n) || n.includes(cn)) && Math.min(cn.length, n.length) >= 3;
  });
  return partial.length === 1 ? partial[0] : null;
}

/** Passenden Auftrag finden (beim Kunden, wenn bekannt). Ohne Titel: nur wenn es genau einen gibt. */
export function matchOrder(
  title: string | null,
  customerId: string | null,
  orders: ExistingOrder[],
): ExistingOrder | null {
  const pool = customerId ? orders.filter((o) => o.customer_id === customerId) : orders;
  if (!title) return customerId && pool.length === 1 ? pool[0] : null;
  const n = norm(title);
  const exact = pool.filter((o) => norm(o.title) === n);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const partial = pool.filter((o) => {
    const t = norm(o.title);
    return (t.includes(n) || n.includes(t)) && Math.min(t.length, n.length) >= 3;
  });
  return partial.length === 1 ? partial[0] : null;
}

const normNumber = (s: string) => s.toUpperCase().replace(/\s+/g, '');

function customerDraft(c: Obj): CustomerDraft | null {
  const name = str(c.name, 200);
  if (!name) return null;
  const email = str(c.email, 160);
  return {
    name,
    company: str(c.company, 200),
    phone: str(c.phone, 60),
    email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    address: str(c.address, 300),
    notes: str(c.notes, 2000),
  };
}

/**
 * Antwort der Server-Funktion -> geprüfte Vorschläge.
 * Ungültiges fällt weg; Aufträge/Dokumente werden Kunden und Aufträgen
 * zugeordnet (vorhanden oder neu aus demselben Gespräch).
 */
export function buildProposals(raw: RawResult, known: Known, today: string): Proposal[] {
  const actions = Array.isArray(raw.actions) ? (raw.actions.slice(0, 20) as RawAction[]) : [];
  const out: Proposal[] = [];
  let n = 0;
  const id = () => `v${++n}`;
  const customersOut = () => out.filter((p): p is Extract<Proposal, { kind: 'customer' }> => p.kind === 'customer');
  const ordersOut = () => out.filter((p): p is Extract<Proposal, { kind: 'order' }> => p.kind === 'order');

  /** Kunde per Name: vorhanden, schon vorgeschlagen, oder (optional) neu mit anlegen */
  const linkCustomer = (name: string | null, create: boolean): CustomerLink => {
    const existing = matchCustomer(name, known.customers);
    if (existing) return { existingId: existing.id, newRef: null, name: existing.name };
    if (!name) return { existingId: null, newRef: null, name: null };
    let fresh = customersOut().find((p) => !p.duplicateOf && norm(p.data.name) === norm(name));
    if (!fresh && create) {
      fresh = {
        id: id(),
        kind: 'customer',
        include: true,
        duplicateOf: null,
        data: { name, company: null, phone: null, email: null, address: null, notes: null },
      };
      out.splice(customersOut().length, 0, fresh);
    }
    return fresh ? { existingId: null, newRef: fresh.id, name } : { existingId: null, newRef: null, name };
  };

  /** Bestehender (nicht stornierter) Auftrag zu Kunde + Titel */
  const existingOrder = (title: string | null, customer: CustomerLink) =>
    customer.newRef
      ? null
      : matchOrder(
          title,
          customer.existingId,
          known.orders.filter((o) => !o.cancelled),
        );
  const ownerLink = (o: ExistingOrder): CustomerLink => ({
    existingId: o.customer_id,
    newRef: null,
    name: known.customers.find((c) => c.id === o.customer_id)?.name ?? null,
  });

  const valid = actions.filter((a): a is RawAction => !!a && typeof a === 'object');

  // 1. Kunden
  for (const a of valid) {
    if (a.type !== 'customer' || !a.customer) continue;
    const data = customerDraft(a.customer);
    if (!data || customersOut().some((p) => norm(p.data.name) === norm(data.name))) continue;
    const existing = matchCustomer(data.name, known.customers);
    out.push({ id: id(), kind: 'customer', include: !existing, data, duplicateOf: existing?.id ?? null });
  }

  // 2. Aufträge
  for (const a of valid) {
    if (a.type !== 'order' || !a.order) continue;
    const o = a.order;
    const title = str(o.title, 200);
    if (!title) continue;
    const price = num(o.price);
    const data: OrderDraft = {
      title,
      description: str(o.description, 5000),
      price: price !== null && price >= 0 ? price : null,
      billing: oneOf(o.billing, ['once', 'monthly'] as const, 'once'),
      meeting_at: localDateTime(o.meeting_at),
      execution_at: localDateTime(o.execution_at),
    };
    out.push({ id: id(), kind: 'order', include: true, data, customer: linkCustomer(str(o.customer_name, 200), true) });
  }

  // 3. Alles andere
  for (const a of valid) {
    if (a.type === 'customer_delete' && a.customer_delete) {
      // nur ein vorhandener Kunde, eindeutig über den Namen
      const c = matchCustomer(str(a.customer_delete.customer_name, 200), known.customers);
      if (!c || out.some((p) => p.kind === 'customer_delete' && p.data.customerId === c.id)) continue;
      // Mit Aufträgen lässt sich ein Kunde nicht löschen: erst seine Aufträge, dann ihn
      const theirs = known.orders.filter((o) => o.customer_id === c.id);
      for (const o of theirs) {
        if (out.some((p) => p.kind === 'order_delete' && p.order.existingId === o.id)) continue;
        out.push({
          id: id(),
          kind: 'order_delete',
          include: true,
          customer: { existingId: c.id, newRef: null, name: c.name },
          order: { existingId: o.id, newRef: null, title: o.title },
        });
      }
      out.push({
        id: id(),
        kind: 'customer_delete',
        include: true,
        data: { customerId: c.id, name: c.name, orderIds: theirs.map((o) => o.id) },
      });
    } else if (a.type === 'order_delete' && a.order_delete) {
      const d = a.order_delete;
      const title = str(d.order_title, 200);
      const customer = linkCustomer(str(d.customer_name, 200), false);
      if (customer.newRef) continue; // wird gerade erst angelegt – hat noch keine Aufträge
      // auch abgesagte Aufträge lassen sich löschen
      const existing = matchOrder(title, customer.existingId, known.orders);
      if (!existing && !title) continue;
      if (existing && out.some((p) => p.kind === 'order_delete' && p.order.existingId === existing.id)) continue;
      out.push({
        id: id(),
        kind: 'order_delete',
        include: true,
        customer: existing ? ownerLink(existing) : customer,
        // nicht eindeutig: der Nutzer wählt den Auftrag in der Karte
        order: existing ? { existingId: existing.id, newRef: null, title: existing.title } : { existingId: null, newRef: null, title },
      });
    } else if (a.type === 'document' && a.document) {
      const d = a.document;
      const docKind = d.kind === 'offer' ? 'offer' : d.kind === 'invoice' ? 'invoice' : null;
      if (!docKind) continue;
      const title = str(d.order_title, 200);
      let customer = linkCustomer(str(d.customer_name, 200), false);
      let order: OrderLink = { existingId: null, newRef: null, title };
      const existing = matchOrder(title, customer.existingId, known.orders);
      if (existing && (customer.existingId || !customer.newRef)) {
        order = { existingId: existing.id, newRef: null, title: existing.title };
        if (!customer.existingId) {
          const c = known.customers.find((x) => x.id === existing.customer_id);
          customer = { existingId: existing.customer_id, newRef: null, name: c?.name ?? null };
        }
      } else {
        // neuer Auftrag aus demselben Gespräch?
        const sameCustomer = (p: Extract<Proposal, { kind: 'order' }>) =>
          (customer.existingId && p.customer.existingId === customer.existingId) ||
          (customer.newRef && p.customer.newRef === customer.newRef) ||
          (!customer.existingId && !customer.newRef);
        const fresh =
          ordersOut().find((p) => title && norm(p.data.title) === norm(title) && sameCustomer(p)) ??
          (ordersOut().filter(sameCustomer).length === 1 ? ordersOut().find(sameCustomer) : undefined);
        if (fresh) {
          order = { existingId: null, newRef: fresh.id, title: fresh.data.title };
          customer = fresh.customer;
        }
      }
      out.push({
        id: id(),
        kind: 'document',
        include: true,
        data: { docKind, service_date: validDay(d.service_date) },
        customer,
        order,
      });
    } else if (a.type === 'expense' && a.expense) {
      const e = a.expense;
      const title = str(e.title, 200);
      const amount = num(e.amount);
      if (!title || amount === null || amount <= 0 || amount >= 10_000_000) continue;
      out.push({
        id: id(),
        kind: 'expense',
        include: true,
        data: {
          title,
          amount,
          category: oneOf(e.category, EXPENSE_CATEGORY_KEYS, 'other'),
          repeat: oneOf(e.repeat, ['once', 'monthly', 'yearly'] as const, 'once'),
          spent_on: validDay(e.spent_on) ?? today,
        },
      });
    } else if (a.type === 'post' && a.post) {
      const p = a.post;
      const title = str(p.title, 200);
      if (!title) continue;
      const platforms = Array.isArray(p.platforms)
        ? [
            ...new Set(
              p.platforms.filter((x): x is (typeof PLATFORM_KEYS)[number] =>
                (PLATFORM_KEYS as readonly unknown[]).includes(x),
              ),
            ),
          ]
        : [];
      out.push({
        id: id(),
        kind: 'post',
        include: true,
        data: {
          title,
          format: oneOf(p.format, POST_FORMAT_KEYS, 'video'),
          platforms,
          script: str(p.notes, 10000),
          planned_for: localDateTime(p.planned_for, 18),
        },
      });
    } else if (a.type === 'appointment' && a.appointment) {
      const t = a.appointment;
      const title = str(t.title, 200);
      const rawStart = typeof t.starts_at === 'string' ? t.starts_at.trim() : '';
      const day = validDay(rawStart.slice(0, 10));
      if (!title || !day) continue;
      const allDay = t.all_day === true || !hasTime(rawStart);
      const starts_at = allDay ? localDateTime(day, 0) : localDateTime(rawStart);
      if (!starts_at) continue;
      let ends_at = !allDay && hasTime(t.ends_at) ? localDateTime(t.ends_at) : null;
      if (ends_at && ends_at <= starts_at) ends_at = null;
      if (
        out.some(
          (p) => p.kind === 'appointment' && norm(p.data.title) === norm(title) && p.data.starts_at === starts_at,
        )
      )
        continue;
      out.push({
        id: id(),
        kind: 'appointment',
        include: true,
        data: { title, starts_at, ends_at, all_day: allDay, location: str(t.location, 500), notes: str(t.notes, 5000) },
        customer: linkCustomer(str(t.customer_name, 200), false),
      });
    } else if (a.type === 'order_date' && a.order_date) {
      const d = a.order_date;
      const field: DateField | null = d.kind === 'meeting' ? 'meeting' : d.kind === 'execution' ? 'execution' : null;
      const at = localDateTime(d.at);
      if (!field || !at) continue;
      const title = str(d.order_title, 200);
      const customer = linkCustomer(str(d.customer_name, 200), false);
      const active = known.orders.filter((o) => !o.cancelled);
      const existing = customer.newRef ? null : matchOrder(title, customer.existingId, active);
      if (!existing) {
        // Auftrag wird gerade erst angelegt -> Termin direkt dort eintragen
        const fresh = ordersOut().find(
          (p) =>
            (title ? norm(p.data.title) === norm(title) : ordersOut().length === 1) &&
            (!customer.existingId || p.customer.existingId === customer.existingId) &&
            (!customer.newRef || p.customer.newRef === customer.newRef),
        );
        if (fresh) {
          fresh.data = { ...fresh.data, [field === 'meeting' ? 'meeting_at' : 'execution_at']: at };
          continue;
        }
      }
      const before = existing ? ((field === 'meeting' ? existing.meeting_at : existing.execution_at) ?? null) : null;
      if (before && sameInstant(before, at)) continue;
      if (
        existing &&
        out.some((p) => p.kind === 'order_date' && p.order.existingId === existing.id && p.data.field === field)
      )
        continue;
      const owner = existing ? known.customers.find((c) => c.id === existing.customer_id) : undefined;
      out.push({
        id: id(),
        kind: 'order_date',
        include: true,
        data: { field, at, before },
        customer: existing
          ? { existingId: existing.customer_id, newRef: null, name: owner?.name ?? customer.name }
          : customer,
        order: existing
          ? { existingId: existing.id, newRef: null, title: existing.title }
          : { existingId: null, newRef: null, title },
      });
    } else if (a.type === 'appointment_change' && a.appointment_change) {
      const c = a.appointment_change;
      const ref = str(c.ref, 20)?.toUpperCase();
      const key = ref ? known.refs?.[ref] : undefined;
      const ev = key ? known.events?.find((e) => e.key === key) : undefined;
      if (!ev || out.some((p) => p.kind === 'appointment_change' && p.event.key === ev.key)) continue;
      const own = ev.kind === 'appointment';
      const remove = c.remove === true;
      const change: AppointmentChange = {
        starts_at: null,
        ends_at: null,
        all_day: null,
        title: null,
        location: null,
        notes: null,
        done: null,
        remove,
      };
      if (!remove) {
        const rawStart = typeof c.starts_at === 'string' ? c.starts_at.trim() : '';
        const day = validDay(rawStart.slice(0, 10));
        if (day) {
          if (hasTime(rawStart)) {
            change.starts_at = localDateTime(rawStart);
            if (own && ev.allDay) change.all_day = false;
          } else if (ev.allDay) {
            change.starts_at = localDateTime(day, 0);
          } else {
            // nur ein neuer Tag: gleiche Uhrzeit wie bisher
            const s = toDate(ev.start) ?? new Date(Number.NaN);
            change.starts_at = localDateTime(`${day}T${pad2(s.getHours())}:${pad2(s.getMinutes())}`);
          }
        }
        if (change.starts_at && sameInstant(change.starts_at, ev.start) && change.all_day === null)
          change.starts_at = null;
        if (own) {
          const start = change.starts_at ?? ev.start;
          const allDay = change.all_day ?? ev.allDay;
          if (!allDay) {
            let end = hasTime(c.ends_at) ? localDateTime(c.ends_at) : null;
            if (end && end <= start) end = null;
            const fixedEnd = known.appointments?.find((x) => x.id === ev.appointmentId)?.ends_at ?? null;
            // verschoben ohne (gültiges) neues Ende: Dauer bleibt gleich
            if (!end && change.starts_at && fixedEnd) {
              const ms = toMs(fixedEnd) + toMs(change.starts_at) - toMs(ev.start);
              end = Number.isNaN(ms) ? null : new Date(ms).toISOString();
            }
            if (end && !(fixedEnd && sameInstant(end, fixedEnd))) change.ends_at = end;
          }
          const title = str(c.title, 200);
          if (title && title !== ev.title) change.title = title;
          change.location = str(c.location, 500);
          change.notes = str(c.notes, 5000);
        }
        const done = c.done === 'done' ? true : c.done === 'open' ? false : null;
        if (done !== null && done !== ev.done) change.done = done;
        const changed = Object.entries(change).some(([k, v]) => k !== 'remove' && v !== null);
        if (!changed) continue;
      }
      out.push({ id: id(), kind: 'appointment_change', include: true, data: change, event: ev });
    } else if (a.type === 'order_price' && a.order_price) {
      const d = a.order_price;
      const price = num(d.price);
      if (price === null || price < 0 || price >= 10_000_000) continue;
      const billing = d.billing === 'monthly' ? 'monthly' : d.billing === 'once' ? 'once' : null;
      const title = str(d.order_title, 200);
      const customer = linkCustomer(str(d.customer_name, 200), false);
      const existing = existingOrder(title, customer);
      if (!existing) {
        // Auftrag wird gerade erst angelegt -> Preis direkt dort eintragen
        const fresh = ordersOut().find(
          (p) =>
            (title ? norm(p.data.title) === norm(title) : ordersOut().length === 1) &&
            (!customer.existingId || p.customer.existingId === customer.existingId),
        );
        if (fresh) {
          fresh.data = { ...fresh.data, price, ...(billing ? { billing } : {}) };
          continue;
        }
      }
      const before = existing ? (existing.price ?? null) : null;
      const beforeBilling = existing ? (existing.billing ?? null) : null;
      if (existing && before === price && (!billing || billing === beforeBilling)) continue;
      if (existing && out.some((p) => p.kind === 'order_price' && p.order.existingId === existing.id)) continue;
      out.push({
        id: id(),
        kind: 'order_price',
        include: true,
        data: {
          price,
          billing: billing && billing !== beforeBilling ? billing : null,
          before,
          beforeBilling,
          documents: existing ? known.documents.filter((x) => x.order_id === existing.id).map((x) => x.number) : [],
        },
        customer: existing ? ownerLink(existing) : customer,
        order: existing
          ? { existingId: existing.id, newRef: null, title: existing.title }
          : { existingId: null, newRef: null, title },
      });
    } else if (a.type === 'todo' && a.todo) {
      const t = a.todo;
      const title = str(t.title, 200);
      if (!title) continue;
      const due = validDay(typeof t.due_on === 'string' ? t.due_on.slice(0, 10) : null);
      if (out.some((p) => p.kind === 'todo' && norm(p.data.title) === norm(title) && p.data.due_on === due)) continue;
      const orderTitle = str(t.order_title, 200);
      let customer = linkCustomer(str(t.customer_name, 200), false);
      let order: OrderLink = { existingId: null, newRef: null, title: null };
      if (orderTitle) {
        const existing = existingOrder(orderTitle, customer);
        const fresh = existing ? undefined : ordersOut().find((p) => norm(p.data.title) === norm(orderTitle));
        if (existing) {
          order = { existingId: existing.id, newRef: null, title: existing.title };
          if (!customer.existingId) customer = ownerLink(existing);
        } else if (fresh) {
          order = { existingId: null, newRef: fresh.id, title: fresh.data.title };
          customer = fresh.customer;
        }
      }
      out.push({
        id: id(),
        kind: 'todo',
        include: true,
        data: { title, due_on: due, notes: str(t.notes, 2000), important: t.important === true },
        customer,
        order,
      });
    } else if (a.type === 'todo_change' && a.todo_change) {
      const c = a.todo_change;
      const ref = str(c.ref, 20)?.toUpperCase();
      const todoId = ref ? known.todoRefs?.[ref] : undefined;
      const todo = todoId ? known.todos?.find((t) => t.id === todoId) : undefined;
      if (!todo || out.some((p) => p.kind === 'todo_change' && p.todo.id === todo.id)) continue;
      const remove = c.remove === true;
      const change: TodoChange = { title: null, due_on: null, notes: null, important: null, done: null, remove };
      if (!remove) {
        const title = str(c.title, 200);
        if (title && title !== todo.title) change.title = title;
        const dueRaw = typeof c.due_on === 'string' ? c.due_on.trim() : '';
        if (/^(none|null|ohne)$/i.test(dueRaw)) {
          if (todo.due_on) change.due_on = '';
        } else {
          const due = validDay(dueRaw.slice(0, 10));
          if (due && due !== todo.due_on) change.due_on = due;
        }
        change.notes = str(c.notes, 2000);
        if (typeof c.important === 'boolean' && c.important !== todo.important) change.important = c.important;
        const done = c.done === 'done' ? true : c.done === 'open' ? false : null;
        if (done !== null && done !== todo.done) change.done = done;
        if (!Object.entries(change).some(([k, v]) => k !== 'remove' && v !== null)) continue;
      }
      out.push({ id: id(), kind: 'todo_change', include: true, data: change, todo });
    } else if (a.type === 'goal' && a.goal) {
      const g = a.goal;
      const kind = oneOf(g.kind, ['revenue', 'customers', 'orders', 'posts', 'custom'] as const, 'custom');
      if (g.kind !== kind) continue;
      const allowed = periodsFor(kind);
      const period = (allowed as readonly unknown[]).includes(g.period) ? (g.period as GoalPeriod) : allowed[0];
      const target = num(g.target);
      if (target === null || target <= 0 || target > 100_000_000) continue;
      const title = str(g.title, 120);
      if (kind === 'custom' && !title) continue;
      out.push({
        id: id(),
        kind: 'goal',
        include: true,
        data: {
          kind,
          period,
          target,
          title: kind === 'custom' ? title : null,
          due_on: kind === 'custom' ? validDay(g.due_on) : null,
        },
      });
    } else if (a.type === 'income_proof' && a.income_proof) {
      if (out.some((p) => p.kind === 'income_proof')) continue;
      out.push({
        id: id(),
        kind: 'income_proof',
        include: true,
        data: { period: oneOf(a.income_proof.period, INCOME_PERIODS, '3') },
      });
    } else if (
      (a.type === 'existing_pdf' && a.existing_pdf) ||
      (a.type === 'mark_paid' && a.mark_paid) ||
      (a.type === 'mark_unpaid' && a.mark_unpaid)
    ) {
      const ref = (a.type === 'existing_pdf' ? a.existing_pdf : a.type === 'mark_paid' ? a.mark_paid : a.mark_unpaid)!;
      const number = str(ref.number, 40);
      const doc = number ? known.documents.find((d) => normNumber(d.number) === normNumber(number)) : undefined;
      if (!doc) continue;
      if (a.type === 'existing_pdf') {
        if (out.some((p) => p.kind === 'existing_pdf' && p.data.documentId === doc.id)) continue;
        out.push({ id: id(), kind: 'existing_pdf', include: true, data: { documentId: doc.id, number: doc.number } });
        continue;
      }
      // bezahlt markieren nur offene Rechnungen, auf offen setzen nur bezahlte
      const paid = a.type === 'mark_paid';
      if (doc.kind !== 'invoice' || !!doc.paid_at === paid) continue;
      if (out.some((p) => p.kind === 'mark_paid' && p.data.documentId === doc.id)) continue;
      out.push({ id: id(), kind: 'mark_paid', include: true, data: { documentId: doc.id, number: doc.number, paid } });
    } else if (a.type === 'customer_change' && a.customer_change) {
      const d = a.customer_change;
      const c = matchCustomer(str(d.customer_name, 200), known.customers);
      if (!c || out.some((p) => p.kind === 'customer_change' && p.customer.id === c.id)) continue;
      const name = str(d.name, 200);
      const email = textChange(d.email, 160, c.email);
      const change: CustomerChange = {
        name: name && name !== c.name ? name : null,
        company: textChange(d.company, 200, c.company),
        phone: textChange(d.phone, 60, c.phone),
        // keine kaputte Adresse speichern
        email: email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? null : email,
        address: textChange(d.address, 300, c.address),
        notes: textChange(d.notes, 2000, c.notes),
      };
      if (!hasChange(change)) continue;
      out.push({ id: id(), kind: 'customer_change', include: true, data: change, customer: { id: c.id, name: c.name } });
    } else if (a.type === 'order_change' && a.order_change) {
      const d = a.order_change;
      const title = str(d.order_title, 200);
      const customer = linkCustomer(str(d.customer_name, 200), false);
      if (customer.newRef) continue; // wird gerade erst angelegt
      // auch stornierte Aufträge (z. B. wieder aufnehmen)
      const existing = matchOrder(title, customer.existingId, known.orders);
      if (!existing && !title) continue;
      if (existing && out.some((p) => p.kind === 'order_change' && p.order.existingId === existing.id)) continue;
      const e = existing ?? undefined;
      const newTitle = str(d.title, 200);
      const change: OrderChange = {
        title: newTitle && newTitle !== e?.title ? newTitle : null,
        description: textChange(d.description, 5000, e?.description),
        discount_percent: numberChange(d.discount, 0, 100, e ? (e.discount_percent ?? 0) : undefined),
        contract_start: dayChange(d.contract_start, e?.contract_start),
        contract_end: dayChange(d.contract_end, e?.contract_end),
        meeting_done: flagChange(d.meeting_done, e?.meeting_done),
        offer_sent: flagChange(d.offer_sent, e?.offer_sent),
        offer_accepted: flagChange(d.offer_accepted, e?.offer_accepted),
        completed: flagChange(d.completed, e?.completed),
        cancelled: flagChange(d.cancelled, e?.cancelled),
        expenses: numberChange(d.expenses, 0, 9_999_999, e?.expenses),
        internal_notes: textChange(d.internal_notes, 5000, e?.internal_notes),
      };
      if (!hasChange(change)) continue;
      out.push({
        id: id(),
        kind: 'order_change',
        include: true,
        data: change,
        customer: existing ? ownerLink(existing) : customer,
        // nicht eindeutig: der Nutzer wählt den Auftrag in der Karte
        order: existing
          ? { existingId: existing.id, newRef: null, title: existing.title }
          : { existingId: null, newRef: null, title },
      });
    } else if (a.type === 'expense_change' && a.expense_change) {
      const c = a.expense_change;
      const exp = byRef(c.ref, known.expenseRefs, known.expenses);
      if (!exp || out.some((p) => p.kind === 'expense_change' && p.expense.id === exp.id)) continue;
      const remove = c.remove === true;
      const title = str(c.title, 200);
      const category = inList(c.category, EXPENSE_CATEGORY_KEYS);
      const repeat = inList(c.repeat, ['once', 'monthly', 'yearly'] as const);
      const change: ExpenseChange = {
        title: !remove && title && title !== exp.title ? title : null,
        amount: remove ? null : numberChange(c.amount, 0.01, 9_999_999, exp.amount),
        category: !remove && category !== exp.category ? category : null,
        repeat: !remove && repeat !== exp.repeat ? repeat : null,
        spent_on: remove ? null : dayChange(isClear(c.spent_on) ? null : c.spent_on, exp.spent_on),
        ends_on: remove ? null : dayChange(c.ends_on, exp.ends_on),
        notes: remove ? null : textChange(c.notes, 2000, exp.notes),
        remove,
      };
      if (!remove && !hasChange(change)) continue;
      out.push({ id: id(), kind: 'expense_change', include: true, data: change, expense: exp });
    } else if (a.type === 'post_change' && a.post_change) {
      const c = a.post_change;
      const post = byRef(c.ref, known.postRefs, known.posts);
      if (!post || out.some((p) => p.kind === 'post_change' && p.post.id === post.id)) continue;
      const remove = c.remove === true;
      const change: PostChange = {
        title: null,
        format: null,
        platforms: null,
        script: null,
        caption: null,
        hashtags: null,
        planned_for: null,
        steps: null,
        published: null,
        published_at: null,
        url: null,
        metrics: {},
        remove,
      };
      if (!remove) {
        const title = str(c.title, 200);
        if (title && title !== post.title) change.title = title;
        const format = inList(c.format, POST_FORMAT_KEYS);
        if (format && format !== post.format) change.format = format;
        if (Array.isArray(c.platforms)) {
          const list = PLATFORM_KEYS.filter((k) => (c.platforms as unknown[]).includes(k));
          if (list.join() !== PLATFORM_KEYS.filter((k) => post.platforms.includes(k)).join()) change.platforms = list;
        }
        change.script = textChange(c.notes, 10000, post.script);
        change.caption = textChange(c.caption, 5000, post.caption);
        change.hashtags = textChange(c.hashtags, 2000, post.hashtags);
        if (isClear(c.planned_for)) {
          if (post.planned_for) change.planned_for = '';
        } else {
          const at = localDateTime(c.planned_for, 18);
          if (at && !(post.planned_for && sameInstant(at, post.planned_for))) change.planned_for = at;
        }
        const status = typeof c.status === 'string' ? c.status.trim().toLowerCase() : '';
        if (status === 'ready' || status === 'idea') change.steps = status;
        const publishedAt = localDateTime(c.published_at, 12);
        const published = publishedAt ? true : status === 'published' ? true : flagChange(c.published);
        if (published !== null && published !== !!post.published_at) change.published = published;
        if (publishedAt && !(post.published_at && sameInstant(publishedAt, post.published_at)))
          change.published_at = publishedAt;
        const url = textChange(c.url, 500, post.url);
        change.url = url && !/^https?:\/\/\S+$/i.test(url) ? null : url;
        for (const m of POST_METRICS) {
          const n = num(c[m]);
          if (n !== null && n >= 0 && n < 10_000_000_000) change.metrics[m] = Math.round(n);
        }
        if (!hasChange(change)) continue;
      }
      out.push({ id: id(), kind: 'post_change', include: true, data: change, post });
    } else if (a.type === 'goal_change' && a.goal_change) {
      const c = a.goal_change;
      const goal = byRef(c.ref, known.goalRefs, known.goals);
      if (!goal || out.some((p) => p.kind === 'goal_change' && p.goal.id === goal.id)) continue;
      const remove = c.remove === true;
      const custom = goal.kind === 'custom';
      const title = custom ? str(c.title, 120) : null;
      const period = goal.kind === 'custom' ? null : inList(c.period, periodsFor(goal.kind) as readonly GoalPeriod[]);
      const change: GoalChange = {
        target: remove ? null : numberChange(c.target, 0.01, 100_000_000, goal.target),
        title: !remove && title && title !== goal.title ? title : null,
        period: !remove && period && period !== goal.period ? period : null,
        progress: !remove && custom ? numberChange(c.progress, 0, 100_000_000, goal.progress) : null,
        due_on: !remove && custom ? dayChange(c.due_on, goal.due_on) : null,
        archived: remove ? null : flagChange(c.archived, goal.archived),
        remove,
      };
      if (!remove && !hasChange(change)) continue;
      out.push({ id: id(), kind: 'goal_change', include: true, data: change, goal });
    } else if (a.type === 'company_change' && a.company_change) {
      if (out.some((p) => p.kind === 'company_change')) continue;
      const c = a.company_change;
      const s = known.seller ?? {};
      const change: CompanyChange = {};
      const MAX: Record<CompanyTextField, number> = {
        company_name: 200,
        owner_name: 200,
        street: 200,
        zip: 10,
        city: 100,
        phone: 60,
        email: 160,
        website: 300,
        tax_number: 60,
        vat_id: 40,
        bank_name: 120,
        iban: 42,
        bic: 15,
        review_url: 500,
      };
      for (const key of COMPANY_TEXT_FIELDS) {
        if (!(key in c)) continue;
        const before = s[key];
        if (isClear(c[key])) {
          if (before === undefined || before) change[key] = null;
          continue;
        }
        let v = str(c[key], MAX[key]);
        if (v === null) continue;
        if (key === 'iban') v = v.replace(/\s+/g, '').toUpperCase();
        if (key === 'bic' || key === 'vat_id') v = v.replace(/\s+/g, '').toUpperCase();
        // nur gültige Angaben übernehmen (wie das Formular)
        if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) continue;
        if (key === 'iban' && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) continue;
        if (key === 'review_url' && !/^https:\/\/\S+$/i.test(v)) continue;
        if (v !== before) change[key] = v;
      }
      const small = flagChange(c.small_business, s.small_business);
      if (small !== null) change.small_business = small;
      const vat = num(c.vat_rate);
      if ((vat === 19 || vat === 7) && vat !== s.vat_rate) change.vat_rate = vat;
      const days = num(c.payment_days);
      if (days !== null && Number.isInteger(days) && days >= 0 && days <= 120 && days !== s.payment_days)
        change.payment_days = days;
      const validity = num(c.offer_validity_days);
      if (
        validity !== null &&
        Number.isInteger(validity) &&
        validity >= 1 &&
        validity <= 365 &&
        validity !== s.offer_validity_days
      )
        change.offer_validity_days = validity;
      if (Object.keys(change).length === 0) continue;
      out.push({ id: id(), kind: 'company_change', include: true, data: change });
    } else if (a.type === 'open' && a.open) {
      if (out.some((p) => p.kind === 'open')) continue;
      const target = openTarget(a.open, known);
      if (target) out.push({ id: id(), kind: 'open', include: true, data: target });
    }
  }
  return out;
}

/** Wohin „öffne …“ führt: Eintrag (Kurzzeichen, Nummer, Auftrag, Kunde) oder Bereich */
export function openTarget(o: Obj, known: Known): { href: string; label: string } | null {
  const ref = str(o.ref, 20)?.toUpperCase();
  if (ref) {
    const ev = known.refs?.[ref] ? known.events?.find((e) => e.key === known.refs?.[ref]) : undefined;
    if (ev?.appointmentId) return { href: `/termine/${ev.appointmentId}`, label: `Termin „${ev.title}“` };
    if (ev?.orderId) return { href: `/auftraege/${ev.orderId}`, label: `Auftrag „${ev.title}“` };
    const todo = byRef(ref, known.todoRefs, known.todos);
    if (todo) return { href: `/aufgaben/${todo.id}`, label: `To-do „${todo.title}“` };
    const exp = byRef(ref, known.expenseRefs, known.expenses);
    if (exp) return { href: `/finanzen/ausgabe/${exp.id}`, label: `Ausgabe „${exp.title}“` };
    const post = byRef(ref, known.postRefs, known.posts);
    if (post) return { href: `/social/${post.id}`, label: `Post „${post.title}“` };
    const goal = byRef(ref, known.goalRefs, known.goals);
    if (goal) return { href: `/aufgaben/ziele/${goal.id}`, label: `Ziel „${goal.title ?? goalLabel(goal)}“` };
  }
  const number = str(o.number, 40);
  const doc = number ? known.documents.find((d) => normNumber(d.number) === normNumber(number)) : undefined;
  if (doc) return { href: doc.order_id ? `/auftraege/${doc.order_id}` : '/finanzen', label: doc.number };
  const customer = matchCustomer(str(o.customer_name, 200), known.customers);
  const title = str(o.order_title, 200);
  if (title) {
    const order = matchOrder(title, customer?.id ?? null, known.orders);
    if (order) return { href: `/auftraege/${order.id}`, label: `Auftrag „${order.title}“` };
  }
  if (customer) return { href: `/kunden/${customer.id}`, label: `Kunde ${customer.name}` };
  const page = inList(o.page, Object.keys(PAGES) as PageKey[]);
  return page ? { ...PAGES[page] } : null;
}

/** Kann der Vorschlag ausgeführt werden? (Zuordnung zu Kunde/Auftrag) */
export function proposalProblem(p: Proposal, all: Proposal[]): string | null {
  const included = (ref: string | null) => !!ref && !!all.find((x) => x.id === ref)?.include;
  if (p.kind === 'order') {
    if (p.customer.existingId) return null;
    if (p.customer.newRef) return included(p.customer.newRef) ? null : 'Der neue Kunde dafür ist abgewählt.';
    return 'Wähle den Kunden für diesen Auftrag.';
  }
  if (p.kind === 'order_date') {
    return p.order.existingId ? null : 'Wähle den Auftrag für diesen Termin.';
  }
  if (p.kind === 'order_price') {
    return p.order.existingId ? null : 'Wähle den Auftrag für diesen Preis.';
  }
  if (p.kind === 'order_delete') {
    return p.order.existingId ? null : 'Wähle den Auftrag, der gelöscht werden soll.';
  }
  if (p.kind === 'order_change') {
    return p.order.existingId ? null : 'Wähle den Auftrag, der geändert werden soll.';
  }
  if (p.kind === 'customer_delete') {
    // jeder seiner Aufträge muss vorher mit gelöscht werden
    const going = new Set(all.flatMap((x) => (x.kind === 'order_delete' && x.include ? [x.order.existingId] : [])));
    return p.data.orderIds.every((o) => going.has(o)) ? null : 'Erst müssen alle seine Aufträge gelöscht werden.';
  }
  if (p.kind === 'todo') {
    if (p.customer.newRef && !included(p.customer.newRef)) return 'Der neue Kunde dafür ist abgewählt.';
    if (p.order.newRef && !included(p.order.newRef)) return 'Der neue Auftrag dafür ist abgewählt.';
    return null;
  }
  if (p.kind === 'document') {
    if (p.order.existingId) return null;
    if (p.order.newRef) return included(p.order.newRef) ? null : 'Der neue Auftrag dafür ist abgewählt.';
    return p.data.docKind === 'invoice'
      ? 'Wähle den Auftrag für diese Rechnung.'
      : 'Wähle den Auftrag für dieses Angebot.';
  }
  return null;
}

/** Antworttext der KI (gekürzt, nur Text) */
export function replyText(raw: RawResult): string | null {
  return str(raw.reply, 3000);
}

/** Vorgeschlagene Schnellantworten (max. 3, kurz) */
export function quickReplies(raw: RawResult): string[] {
  if (!Array.isArray(raw.quick_replies)) return [];
  return [...new Set(raw.quick_replies.map((q) => str(q, 80)).filter((q): q is string => !!q))].slice(0, 3);
}

const PERIOD_LABEL: Record<IncomePeriod, string> = {
  '3': 'letzte 3 Monate',
  '6': 'letzte 6 Monate',
  '12': 'letzte 12 Monate',
  last_year: 'letztes Jahr',
};

/** Kurzbezeichnung eines Vorschlags – für Karten und den Gesprächsverlauf */
export function proposalLabel(p: Proposal): string {
  switch (p.kind) {
    case 'customer':
      return `Kunde ${p.data.name}`;
    case 'customer_delete':
      return `Kunde ${p.data.name} löschen`;
    case 'order_delete':
      return `Auftrag${p.order.title ? ` „${p.order.title}“` : ''}${p.customer.name ? ` (${p.customer.name})` : ''} löschen`;
    case 'order':
      return `Auftrag „${p.data.title}“${p.customer.name ? ` für ${p.customer.name}` : ''}`;
    case 'expense':
      return `Ausgabe „${p.data.title}“`;
    case 'post':
      return `Post-Idee „${p.data.title}“`;
    case 'document':
      return `${p.data.docKind === 'invoice' ? 'Rechnung' : 'Angebot'}${p.order.title ? ` zu „${p.order.title}“` : ''}${p.customer.name ? ` (${p.customer.name})` : ''}`;
    case 'income_proof':
      return `Einkommensnachweis (${PERIOD_LABEL[p.data.period]})`;
    case 'existing_pdf':
      return `PDF von ${p.data.number}`;
    case 'mark_paid':
      return p.data.paid ? `${p.data.number} als bezahlt markieren` : `${p.data.number} wieder auf offen setzen`;
    case 'customer_change':
      return p.data.name ? `Kunde ${p.customer.name} umbenennen in ${p.data.name}` : `Kunde ${p.customer.name} ändern`;
    case 'order_change': {
      const t = p.order.title ? ` „${p.order.title}“` : '';
      const c = p.data;
      if (c.cancelled === true) return `Auftrag${t} stornieren`;
      if (c.completed === true) return `Auftrag${t} abschließen`;
      if (c.cancelled === false) return `Auftrag${t} wieder aufnehmen`;
      return `Auftrag${t} ändern`;
    }
    case 'expense_change':
      return `Ausgabe „${p.expense.title}“ ${p.data.remove ? 'löschen' : 'ändern'}`;
    case 'post_change':
      return `Post „${p.post.title}“ ${p.data.remove ? 'löschen' : 'ändern'}`;
    case 'goal_change': {
      const what = `Ziel „${p.goal.title ?? goalLabel(p.goal)}“`;
      if (p.data.remove) return `${what} löschen`;
      if (p.data.archived === true) return `${what} archivieren`;
      return `${what} ändern`;
    }
    case 'company_change':
      return `Firmendaten ändern (${companyFields(p.data).join(', ')})`;
    case 'open':
      return `${p.data.label} öffnen`;
    case 'appointment':
      return `Termin „${p.data.title}“ (${whenLabel(p.data.starts_at, p.data.all_day)})`;
    case 'order_date':
      return `${p.data.field === 'meeting' ? 'Erstgespräch' : 'Ausführung'}${p.order.title ? ` „${p.order.title}“` : ''} am ${whenLabel(p.data.at)}`;
    case 'order_price':
      return `Preis ${formatPrice(p.data.price)}${p.data.billing === 'monthly' || (!p.data.billing && p.data.beforeBilling === 'monthly') ? ' pro Monat' : ''}${p.order.title ? ` für „${p.order.title}“` : ''}`;
    case 'todo':
      return `To-do „${p.data.title}“${p.data.due_on ? ` bis ${p.data.due_on.split('-').reverse().join('.')}` : ''}`;
    case 'todo_change':
      return p.data.remove
        ? `To-do „${p.todo.title}“ löschen`
        : p.data.done === true
          ? `To-do „${p.todo.title}“ abhaken`
          : `To-do „${p.todo.title}“ ändern`;
    case 'goal':
      return `Ziel: ${goalLabel(p.data)}`;
    case 'appointment_change': {
      const what = `${p.event.kind === 'meeting' ? 'Erstgespräch' : p.event.kind === 'execution' ? 'Ausführung' : 'Termin'} „${p.event.title}“`;
      if (p.data.remove) return `${what} ${p.event.kind === 'appointment' ? 'löschen' : 'absagen'}`;
      return p.data.starts_at
        ? `${what} verschieben auf ${whenLabel(p.data.starts_at, p.data.all_day ?? p.event.allDay)}`
        : `${what} ändern`;
    }
  }
}

export const periodLabel = (p: IncomePeriod) => PERIOD_LABEL[p];

/** Bezeichnungen der Firmendaten (wie im Bereich Firma) */
export const COMPANY_FIELD_LABEL: Record<keyof CompanyChange, string> = {
  company_name: 'Firmenname',
  owner_name: 'Inhaber/in',
  street: 'Straße und Hausnummer',
  zip: 'PLZ',
  city: 'Ort',
  phone: 'Telefon',
  email: 'E-Mail',
  website: 'Website',
  tax_number: 'Steuernummer',
  vat_id: 'USt-IdNr.',
  bank_name: 'Bank',
  iban: 'IBAN',
  bic: 'BIC',
  review_url: 'Link für Bewertungen',
  small_business: 'Kleinunternehmerregelung',
  vat_rate: 'Umsatzsteuersatz',
  payment_days: 'Zahlungsziel',
  offer_validity_days: 'Gültigkeit von Angeboten',
};
/** Welche Firmendaten sich ändern (Bezeichnungen) */
export const companyFields = (c: CompanyChange): string[] =>
  (Object.keys(c) as (keyof CompanyChange)[]).map((k) => COMPANY_FIELD_LABEL[k]);

const formatPrice = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

const GOAL_PER: Record<GoalPeriod, string> = { week: ' pro Woche', month: ' pro Monat', year: ' pro Jahr', once: '' };
/** "3.000 € Umsatz pro Monat", "5 neue Kunden pro Woche", eigener Titel */
export function goalLabel(g: GoalDraft): string {
  const n = g.target.toLocaleString('de-DE');
  const per = GOAL_PER[g.period];
  if (g.kind === 'revenue') return `${formatPrice(g.target)} Umsatz${per}`;
  if (g.kind === 'customers') return `${n} ${g.target === 1 ? 'neuer Kunde' : 'neue Kunden'}${per}`;
  if (g.kind === 'orders')
    return `${n} ${g.target === 1 ? 'abgeschlossener Auftrag' : 'abgeschlossene Aufträge'}${per}`;
  if (g.kind === 'posts') return `${n} ${g.target === 1 ? 'Post' : 'Posts'} veröffentlichen${per}`;
  return `${g.title ?? 'Eigenes Ziel'} (${n})`;
}

/**
 * Kann Luna die Vorschläge sofort ausführen? Ja, wenn etwas ausgewählt ist
 * und nirgends etwas fehlt (sonst wartet die Karte auf den Nutzer).
 */
export function runnableNow(
  proposals: Proposal[],
  doneIds: string[],
  blockers: (p: Proposal, all: Proposal[]) => string[],
): boolean {
  const done = new Set(doneIds);
  const chosen = proposals.filter((p) => p.include && !done.has(p.id));
  return chosen.length > 0 && chosen.every((p) => blockers(p, proposals).length === 0);
}

/** Reihenfolge beim Ausführen: erst Kunden, dann Aufträge, dann Dokumente … */
export const EXECUTION_ORDER: Proposal['kind'][] = [
  // Firmendaten zuerst: neue Bankverbindung o. Ä. soll schon auf der Rechnung stehen
  'company_change',
  'customer',
  'customer_change',
  'order',
  'order_price',
  'order_change',
  'appointment',
  'order_date',
  'appointment_change',
  'document',
  'todo',
  'todo_change',
  'goal',
  'goal_change',
  'expense',
  'expense_change',
  'post',
  'post_change',
  'mark_paid',
  'existing_pdf',
  'income_proof',
  // erst wenn alles andere erledigt ist – erst die Aufträge, dann der Kunde
  'order_delete',
  'customer_delete',
  // ganz zuletzt: die Seite öffnen (dort bleibt man)
  'open',
];
