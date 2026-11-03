/**
 * Nexy (Assistent): Die Server-Funktion (supabase/functions/assistant)
 * liefert eine Antwort und Vorschläge. Hier werden die Vorschläge geprüft,
 * bereinigt und vorhandenen Kunden, Aufträgen und Dokumenten zugeordnet –
 * ausgeführt wird erst, wenn der Nutzer bestätigt.
 *
 * Ohne App-Imports (tests/unit/assistant-logic.test.mjs).
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
export const INCOME_PERIODS = ['3', '6', '12', 'last_year'] as const;

// --- So kommt es von der Server-Funktion (kann unvollständig/fehlerhaft sein) ---
type Obj = Record<string, unknown>;
export type RawAction = {
  type?: unknown;
  customer?: Obj | null;
  order?: Obj | null;
  expense?: Obj | null;
  post?: Obj | null;
  document?: Obj | null;
  income_proof?: Obj | null;
  existing_pdf?: Obj | null;
  mark_paid?: Obj | null;
  appointment?: Obj | null;
  order_date?: Obj | null;
  appointment_change?: Obj | null;
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
/** Vorhandener Termin (aus Aufträgen oder eigener) – so, wie Nexy ihn kennt */
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

/** Zu welchem Kunden gehört etwas? Vorhanden, neu aus diesem Gespräch, oder noch offen. */
export type CustomerLink = { existingId: string | null; newRef: string | null; name: string | null };
/** Zu welchem Auftrag gehört ein Angebot/eine Rechnung? */
export type OrderLink = { existingId: string | null; newRef: string | null; title: string | null };

export type Proposal =
  | { id: string; kind: 'customer'; include: boolean; data: CustomerDraft; duplicateOf: string | null }
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
  | { id: string; kind: 'mark_paid'; include: boolean; data: { documentId: string; number: string } }
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
  | { id: string; kind: 'appointment_change'; include: boolean; data: AppointmentChange; event: KnownEvent };

export type ExistingCustomer = { id: string; name: string; company?: string | null };
export type ExistingOrder = {
  id: string;
  title: string;
  customer_id: string;
  meeting_at?: string | null;
  execution_at?: string | null;
  cancelled?: boolean | null;
};
export type ExistingDocument = { id: string; number: string; kind: 'offer' | 'invoice'; paid_at: string | null };
export type Known = {
  customers: ExistingCustomer[];
  orders: ExistingOrder[];
  documents: ExistingDocument[];
  /** Termine, die Nexy mitgeschickt bekam, und ihre Kurzzeichen (T1 -> Termin) */
  events?: KnownEvent[];
  refs?: Record<string, string>;
  /** eigene Termine (für das eingetragene Ende) */
  appointments?: { id: string; ends_at: string | null }[];
};

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

const pad2 = (n: number) => String(n).padStart(2, '0');
const hasTime = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(v.trim());
const sameInstant = (a: string, b: string) => new Date(a).getTime() === new Date(b).getTime();

/** "Fr., 06.11., 14:00" bzw. "Fr., 06.11. ganztägig" */
export function whenLabel(iso: string, allDay = false): string {
  const d = new Date(iso);
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
    if (a.type === 'document' && a.document) {
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
            const s = new Date(ev.start);
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
            if (!end && change.starts_at && fixedEnd)
              end = new Date(
                new Date(fixedEnd).getTime() + new Date(change.starts_at).getTime() - new Date(ev.start).getTime(),
              ).toISOString();
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
    } else if (a.type === 'income_proof' && a.income_proof) {
      if (out.some((p) => p.kind === 'income_proof')) continue;
      out.push({
        id: id(),
        kind: 'income_proof',
        include: true,
        data: { period: oneOf(a.income_proof.period, INCOME_PERIODS, '3') },
      });
    } else if ((a.type === 'existing_pdf' && a.existing_pdf) || (a.type === 'mark_paid' && a.mark_paid)) {
      const ref = (a.type === 'existing_pdf' ? a.existing_pdf : a.mark_paid)!;
      const number = str(ref.number, 40);
      const doc = number ? known.documents.find((d) => normNumber(d.number) === normNumber(number)) : undefined;
      if (!doc) continue;
      if (a.type === 'mark_paid' && (doc.kind !== 'invoice' || doc.paid_at)) continue;
      if (
        out.some(
          (p) =>
            (p.kind === 'existing_pdf' || p.kind === 'mark_paid') && p.kind === a.type && p.data.documentId === doc.id,
        )
      )
        continue;
      out.push({ id: id(), kind: a.type, include: true, data: { documentId: doc.id, number: doc.number } } as Proposal);
    }
  }
  return out;
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
      return `${p.data.number} als bezahlt markieren`;
    case 'appointment':
      return `Termin „${p.data.title}“ (${whenLabel(p.data.starts_at, p.data.all_day)})`;
    case 'order_date':
      return `${p.data.field === 'meeting' ? 'Erstgespräch' : 'Ausführung'}${p.order.title ? ` „${p.order.title}“` : ''} am ${whenLabel(p.data.at)}`;
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

/** Reihenfolge beim Ausführen: erst Kunden, dann Aufträge, dann Dokumente … */
export const EXECUTION_ORDER: Proposal['kind'][] = [
  'customer',
  'order',
  'appointment',
  'order_date',
  'appointment_change',
  'document',
  'expense',
  'post',
  'mark_paid',
  'existing_pdf',
  'income_proof',
];
