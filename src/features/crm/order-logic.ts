/**
 * Geschäftslogik für Aufträge – übernommen aus dem GP-Gartenservice-System
 * und für alle Branchen verallgemeinert:
 *
 * - Der Status wird NICHT von Hand gewählt, sondern aus den eingetragenen
 *   Daten berechnet (der späteste erreichte Schritt gewinnt).
 * - Umsatz: Einzelaufträge zählen, sobald sie abgeschlossen sind.
 *   Monatliche Aufträge zählen Monat für Monat (bereits verstrichene,
 *   volle Monate), abgeschlossen die komplette Laufzeit.
 *
 * Bewusst ohne Imports, damit die Funktionen auch einzeln getestet werden
 * können (tests/unit/order-logic.test.mjs).
 */

export type OrderStatus =
  | 'new'
  | 'meeting_planned'
  | 'meeting_done'
  | 'pricing'
  | 'quote_sent'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type StatusGroup = 'new' | 'progress' | 'done' | 'cancelled';

export type Billing = 'once' | 'monthly';

/** Felder eines Auftrags, die für Status und Umsatz zählen. */
export type OrderFacts = {
  price?: number | null;
  discount_percent?: number | null;
  billing?: Billing | null;
  contract_start?: string | null;
  contract_end?: string | null;
  meeting_at?: string | null;
  meeting_done?: boolean | null;
  offer_sent?: boolean | null;
  offer_accepted?: boolean | null;
  execution_at?: string | null;
  completed?: boolean | null;
  cancelled?: boolean | null;
};

/** Alle Stationen in der normalen Reihenfolge (ohne "storniert"). */
export const PIPELINE: { key: OrderStatus; label: string }[] = [
  { key: 'new', label: 'Neue Anfrage' },
  { key: 'meeting_planned', label: 'Termin geplant' },
  { key: 'meeting_done', label: 'Termin erledigt' },
  { key: 'pricing', label: 'Preis steht' },
  { key: 'quote_sent', label: 'Angebot verschickt' },
  { key: 'accepted', label: 'Angebot angenommen' },
  { key: 'in_progress', label: 'In Ausführung' },
  { key: 'completed', label: 'Abgeschlossen' },
];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  ...(Object.fromEntries(PIPELINE.map((s) => [s.key, s.label])) as Record<OrderStatus, string>),
  cancelled: 'Storniert',
};

/** Status aus den Daten – rückwärts geprüft, der späteste Schritt gewinnt. */
export function computeStatus(o: OrderFacts): OrderStatus {
  if (o.cancelled) return 'cancelled';
  if (o.completed) return 'completed';
  if (o.execution_at) return 'in_progress';
  if (o.offer_accepted) return 'accepted';
  if (o.offer_sent) return 'quote_sent';
  if (o.price !== null && o.price !== undefined && !Number.isNaN(o.price)) return 'pricing';
  if (o.meeting_done) return 'meeting_done';
  if (o.meeting_at) return 'meeting_planned';
  return 'new';
}

export function statusGroup(status: OrderStatus): StatusGroup {
  if (status === 'new') return 'new';
  if (status === 'completed') return 'done';
  if (status === 'cancelled') return 'cancelled';
  return 'progress';
}

/** Preis nach Rabatt (bei monatlicher Abrechnung: Monatspreis). */
export function finalPrice(o: OrderFacts): number {
  const price = typeof o.price === 'number' && !Number.isNaN(o.price) ? o.price : 0;
  if (price <= 0) return 0;
  const discount = Math.max(0, Math.min(100, Number(o.discount_percent ?? 0) || 0));
  return round2(price - (price * discount) / 100);
}

export function isMonthly(o: OrderFacts): boolean {
  return o.billing === 'monthly';
}

function parseDay(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Laufzeit in Monaten (angebrochener letzter Monat zählt voll). null = unbefristet. */
export function totalMonths(o: OrderFacts): number | null {
  const start = parseDay(o.contract_start);
  const end = parseDay(o.contract_end);
  if (!start || !end) return null;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() >= start.getDate()) months++;
  return Math.max(1, months);
}

/** Bereits vollständig verstrichene Vertragsmonate (bis heute bzw. Vertragsende). */
export function elapsedMonths(o: OrderFacts, today: Date = new Date()): number {
  const start = parseDay(o.contract_start);
  if (!start) return 0;
  let ref = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = parseDay(o.contract_end);
  if (end && end < ref) ref = end;
  if (ref <= start) return 0;
  let months = (ref.getFullYear() - start.getFullYear()) * 12 + (ref.getMonth() - start.getMonth());
  if (ref.getDate() < start.getDate()) months--;
  months = Math.max(0, months);
  const total = totalMonths(o);
  return total === null ? months : Math.min(months, total);
}

/** Bereits verdienter Umsatz. */
export function recognizedRevenue(o: OrderFacts, today: Date = new Date()): number {
  if (o.cancelled) return 0;
  const price = finalPrice(o);
  if (price <= 0) return 0;
  if (!isMonthly(o)) return o.completed ? price : 0;
  const total = totalMonths(o);
  if (o.completed && total !== null) return round2(price * total);
  return round2(price * elapsedMonths(o, today));
}

/** Noch anstehender Umsatz eines laufenden Auftrags. */
export function outstandingRevenue(o: OrderFacts, today: Date = new Date()): number {
  if (o.completed || o.cancelled) return 0;
  const price = finalPrice(o);
  if (price <= 0) return 0;
  if (!isMonthly(o)) return price;
  const total = totalMonths(o);
  if (total === null) return 0; // unbefristet: kein festes Ende, nichts hochzurechnen
  return round2(price * Math.max(0, total - elapsedMonths(o, today)));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "1.234,56 €" */
export function formatEuro(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

/** Liest deutsche Beträge wie "1.234,56", "1234.5" oder "99" – leer = null. */
export function parseEuro(input: string): number | null | 'invalid' {
  const s = input.trim().replace(/\s|€/g, '');
  if (s === '') return null;
  let normalized = s;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return 'invalid';
  const n = Number(normalized);
  return Number.isFinite(n) ? round2(n) : 'invalid';
}
