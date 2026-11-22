import { formatEuro, outstandingRevenue, recognizedRevenue, type OrderFacts } from './order-logic';

/**
 * Kundenübersicht: Ansicht (Liste oder Raster) und Sortierung – reine Logik ohne App (mit
 * Unit-Tests). Was man wählt, merkt sich das Gerät (customers-screen.tsx).
 */

export type CustomerView = 'list' | 'grid';

export type CustomerSort = 'recent' | 'name' | 'name-desc' | 'revenue' | 'orders' | 'outstanding' | 'newest';

export const CUSTOMER_SORTS: { key: CustomerSort; label: string }[] = [
  { key: 'recent', label: 'Zuletzt bearbeitet' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'name-desc', label: 'Name Z–A' },
  { key: 'revenue', label: 'Höchster Umsatz' },
  { key: 'orders', label: 'Meiste Aufträge' },
  { key: 'outstanding', label: 'Meiste offene Einnahmen' },
  { key: 'newest', label: 'Neueste Kunden' },
];

/** Sortierungen zur Auswahl – ohne Recht „Finanzen“ nichts nach Umsatz oder offenen Einnahmen */
export const customerSorts = (money: boolean) =>
  money ? CUSTOMER_SORTS : CUSTOMER_SORTS.filter((s) => s.key !== 'revenue' && s.key !== 'outstanding');

/** Gemerkte Sortierung, die man ohne Finanzen nicht hat → „Zuletzt bearbeitet“ */
export const allowedSort = (sort: CustomerSort, money: boolean): CustomerSort =>
  money || (sort !== 'revenue' && sort !== 'outstanding') ? sort : 'recent';

export const DEFAULT_CUSTOMER_LAYOUT: { view: CustomerView; sort: CustomerSort } = { view: 'list', sort: 'recent' };

export type CustomerStats = { count: number; revenue: number; outstanding: number };

type SortableCustomer = { id: string; name: string; created_at: string; updated_at: string };

/** Aufträge, Umsatz (realisiert) und anstehende Einnahmen je Kunde */
export function customerStats(
  orders: (OrderFacts & { customer_id: string })[],
  today: Date = new Date(),
): Map<string, CustomerStats> {
  const per = new Map<string, CustomerStats>();
  for (const o of orders) {
    const s = per.get(o.customer_id) ?? { count: 0, revenue: 0, outstanding: 0 };
    s.count++;
    s.revenue += recognizedRevenue(o, today);
    s.outstanding += outstandingRevenue(o, today);
    per.set(o.customer_id, s);
  }
  return per;
}

// deutsch sortieren: „Ärzte“ bei A, „Kunde 2“ vor „Kunde 10“, groß/klein egal
const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true });
const byName = (a: SortableCustomer, b: SortableCustomer) => collator.compare(a.name.trim(), b.name.trim());
const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Sortiert eine Kopie – bei Gleichstand nach Name, damit die Reihenfolge nicht springt */
export function sortCustomers<C extends SortableCustomer>(
  customers: readonly C[],
  sort: CustomerSort,
  stats: Map<string, CustomerStats>,
): C[] {
  const st = (c: C) => stats.get(c.id) ?? { count: 0, revenue: 0, outstanding: 0 };
  const most = (pick: (s: CustomerStats) => number) => (a: C, b: C) => pick(st(b)) - pick(st(a)) || byName(a, b);
  const list = [...customers];
  switch (sort) {
    case 'name':
      return list.sort(byName);
    case 'name-desc':
      return list.sort((a, b) => byName(b, a));
    case 'revenue':
      return list.sort(most((s) => s.revenue));
    case 'orders':
      return list.sort(most((s) => s.count));
    case 'outstanding':
      return list.sort(most((s) => s.outstanding));
    case 'newest':
      return list.sort((a, b) => time(b.created_at) - time(a.created_at) || byName(a, b));
    default:
      return list.sort((a, b) => time(b.updated_at) - time(a.updated_at) || byName(a, b));
  }
}

/** Die Zahl, die zur Sortierung passt – steht in der Liste/im Raster groß beim Kunden */
export function sortMetric(sort: CustomerSort, s: CustomerStats | undefined, money = true): { value: string; label: string } {
  const stats = s ?? { count: 0, revenue: 0, outstanding: 0 };
  const orders = `${stats.count} ${stats.count === 1 ? 'Auftrag' : 'Aufträge'}`;
  // ohne Recht „Finanzen“: keine Beträge
  if (!money) return { value: orders, label: '' };
  if (sort === 'orders') return { value: orders, label: formatEuro(stats.revenue) };
  if (sort === 'outstanding') return { value: formatEuro(stats.outstanding), label: 'offen' };
  return { value: formatEuro(stats.revenue), label: orders };
}

/** Spalten im Raster: bis zu 4 nebeneinander, auf dem Handy weniger (jede Karte bleibt lesbar) */
export function gridColumns(width: number, gap: number, minCard = 136, max = 4): number {
  if (!(width > 0)) return 2;
  return Math.max(2, Math.min(max, Math.floor((width + gap) / (minCard + gap))));
}

/** Gemerkte Auswahl lesen – Unbekanntes fällt auf den Standard zurück */
export function readCustomerLayout(raw: unknown): { view: CustomerView; sort: CustomerSort } {
  let r: Record<string, unknown> = {};
  try {
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
    if (parsed && typeof parsed === 'object') r = parsed as Record<string, unknown>;
  } catch {
    // kaputt gespeichert → Standard
  }
  return {
    view: r.view === 'grid' || r.view === 'list' ? r.view : DEFAULT_CUSTOMER_LAYOUT.view,
    sort: CUSTOMER_SORTS.some((s) => s.key === r.sort) ? (r.sort as CustomerSort) : DEFAULT_CUSTOMER_LAYOUT.sort,
  };
}
