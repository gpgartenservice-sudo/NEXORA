/**
 * Assistent: Die Server-Funktion (supabase/functions/assistant) liefert
 * Vorschläge, die Claude aus dem Text herausgelesen hat. Hier werden sie
 * geprüft, bereinigt und Kunden zugeordnet – gespeichert wird erst, wenn
 * der Nutzer bestätigt.
 *
 * Bewusst ohne App-Imports (tests/unit/assistant-logic.test.mjs).
 */

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

// --- So kommt es von der Server-Funktion (kann unvollständig/fehlerhaft sein) ---
export type RawAction = {
  type?: unknown;
  customer?: Record<string, unknown> | null;
  order?: Record<string, unknown> | null;
  expense?: Record<string, unknown> | null;
  post?: Record<string, unknown> | null;
};
export type RawResult = { actions?: unknown; reply?: unknown };

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

/** Zu welchem Kunden gehört ein Auftrag? Vorhanden, neu aus diesem Vorschlag, oder noch offen. */
export type CustomerLink = { existingId: string | null; newRef: string | null; name: string | null };

export type Proposal =
  | { id: string; kind: 'customer'; include: boolean; data: CustomerDraft; duplicateOf: string | null }
  | { id: string; kind: 'order'; include: boolean; data: OrderDraft; customer: CustomerLink }
  | { id: string; kind: 'expense'; include: boolean; data: ExpenseDraft }
  | { id: string; kind: 'post'; include: boolean; data: PostDraft };

export type ExistingCustomer = { id: string; name: string; company?: string | null };

const str = (v: unknown, max = 500): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+\n/g, '\n');
  return t ? t.slice(0, max) : null;
};
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback;

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

function customerDraft(c: Record<string, unknown>): CustomerDraft | null {
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
 * Ungültiges fällt weg, Aufträge werden Kunden zugeordnet (vorhanden oder neu).
 */
export function buildProposals(raw: RawResult, customers: ExistingCustomer[], today: string): Proposal[] {
  const actions = Array.isArray(raw.actions) ? (raw.actions.slice(0, 20) as RawAction[]) : [];
  const out: Proposal[] = [];
  let n = 0;
  const id = () => `v${++n}`;

  // 1. Kunden zuerst (Aufträge verweisen darauf)
  for (const a of actions) {
    if (a?.type !== 'customer' || !a.customer) continue;
    const data = customerDraft(a.customer);
    if (!data) continue;
    if (out.some((p) => p.kind === 'customer' && norm(p.data.name) === norm(data.name))) continue;
    const existing = matchCustomer(data.name, customers);
    out.push({ id: id(), kind: 'customer', include: !existing, data, duplicateOf: existing?.id ?? null });
  }

  for (const a of actions) {
    if (!a || typeof a !== 'object') continue;
    if (a.type === 'order' && a.order) {
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
      const name = str(o.customer_name, 200);
      const existing = matchCustomer(name, customers);
      let link: CustomerLink = { existingId: existing?.id ?? null, newRef: null, name: existing?.name ?? name };
      if (!existing && name) {
        // neuer Kunde aus diesem Text – oder automatisch mit anlegen
        let fresh = out.find((p) => p.kind === 'customer' && !p.duplicateOf && norm(p.data.name) === norm(name));
        if (!fresh) {
          fresh = {
            id: id(),
            kind: 'customer',
            include: true,
            data: { name, company: null, phone: null, email: null, address: null, notes: null },
            duplicateOf: null,
          };
          out.splice(out.filter((p) => p.kind === 'customer').length, 0, fresh);
        }
        link = { existingId: null, newRef: fresh.id, name };
      }
      out.push({ id: id(), kind: 'order', include: true, data, customer: link });
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
    }
  }
  return out;
}

/** Kann der Vorschlag gespeichert werden? (Aufträge brauchen einen Kunden) */
export function proposalProblem(p: Proposal, all: Proposal[]): string | null {
  if (p.kind !== 'order') return null;
  if (p.customer.existingId) return null;
  if (p.customer.newRef) {
    const c = all.find((x) => x.id === p.customer.newRef);
    return c && c.include ? null : 'Der neue Kunde dafür ist abgewählt.';
  }
  return 'Wähle den Kunden für diesen Auftrag.';
}

/** Antworttext der KI (gekürzt, nur Text) */
export function replyText(raw: RawResult): string | null {
  return str(raw.reply, 1000);
}
