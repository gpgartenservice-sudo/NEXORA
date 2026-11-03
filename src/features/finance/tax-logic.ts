/**
 * Steuer-Überblick – reine Logik (ohne App/Netz, mit Unit-Tests):
 * Rücklage ("Steuer-Topf"), Kleinunternehmer-Grenze, Umsatzsteuer,
 * Jahresübersicht und CSV-Export für die Steuerberatung.
 *
 * Alles sind grobe Schätzungen zur Orientierung – keine Steuerberatung.
 */
import {
  categoryLabel,
  expenseByMonth,
  monthRange,
  summarize,
  type ExpenseFacts,
  type MonthKey,
  type OrderMoney,
} from './finance-logic';

/** § 19 UStG (seit 2025): Vorjahr höchstens 25.000 €, laufendes Jahr höchstens 100.000 € */
export const SMALL_BUSINESS_LIMIT = 25_000;
export const SMALL_BUSINESS_HARD_LIMIT = 100_000;
/** Ab diesem Anteil der Grenze warnen */
const NEAR = 0.8;

/** Vorschlag für die Rücklage (Einkommensteuer, Soli, ggf. Kirchensteuer) in % vom Gewinn */
export const DEFAULT_RESERVE_PERCENT = 25;
export const RESERVE_CHOICES = [15, 20, 25, 30, 35] as const;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Monate eines Jahres bis heute (laufendes Jahr) bzw. alle zwölf */
export function yearMonths(year: number, today: Date): MonthKey[] {
  const last = year === today.getFullYear() ? today.getMonth() + 1 : 12;
  if (year > today.getFullYear()) return [];
  return monthRange(`${year}-01`, `${year}-${String(last).padStart(2, '0')}`);
}

/** Einnahmen, Ausgaben, Gewinn eines Jahres (wie in Finanzen) */
export function yearTotals(orders: OrderMoney[], expenses: ExpenseFacts[], year: number, today: Date) {
  const rows = summarize(orders, expenses, yearMonths(year, today), today);
  const income = round2(rows.reduce((s, r) => s + r.income, 0));
  const spent = round2(rows.reduce((s, r) => s + r.expenses, 0));
  return { income, expenses: spent, profit: round2(income - spent) };
}

export type LimitStatus = 'ok' | 'near' | 'over_next_year' | 'over_now' | 'prev_over';

/**
 * Kleinunternehmer-Grenze: Wo steht der Umsatz dieses Jahr, was bedeutet das?
 * (Umsatz = Einnahmen ohne Umsatzsteuer; bei Kleinunternehmern = Einnahmen)
 */
export function smallBusinessCheck(revenueThisYear: number, revenuePrevYear: number, year: number) {
  const ratio = Math.min(1, revenueThisYear / SMALL_BUSINESS_LIMIT);
  let status: LimitStatus = 'ok';
  if (revenueThisYear > SMALL_BUSINESS_HARD_LIMIT) status = 'over_now';
  else if (revenuePrevYear > SMALL_BUSINESS_LIMIT) status = 'prev_over';
  else if (revenueThisYear > SMALL_BUSINESS_LIMIT) status = 'over_next_year';
  else if (revenueThisYear >= SMALL_BUSINESS_LIMIT * NEAR) status = 'near';
  const left = Math.max(0, round2(SMALL_BUSINESS_LIMIT - revenueThisYear));
  const messages: Record<LimitStatus, string> = {
    ok: `Noch ${formatEuro(left)} bis zur Grenze von ${formatEuro(SMALL_BUSINESS_LIMIT)} – alles im grünen Bereich.`,
    near: `Du näherst dich der Grenze: noch ${formatEuro(left)}. Liegt dein Umsatz ${year} über ${formatEuro(SMALL_BUSINESS_LIMIT)}, bist du ab ${year + 1} kein Kleinunternehmer mehr und musst Umsatzsteuer berechnen.`,
    over_next_year: `Dein Umsatz ${year} liegt über ${formatEuro(SMALL_BUSINESS_LIMIT)}: Ab dem 1. Januar ${year + 1} musst du Umsatzsteuer auf deine Rechnungen schreiben. Sprich am besten jetzt mit deiner Steuerberatung.`,
    over_now: `Dein Umsatz ${year} liegt über ${formatEuro(SMALL_BUSINESS_HARD_LIMIT)}: Die Kleinunternehmerregelung endet sofort – ab der Rechnung, mit der du die Grenze überschritten hast, gilt Umsatzsteuer. Bitte sofort mit deiner Steuerberatung sprechen.`,
    prev_over: `Dein Umsatz ${year - 1} lag über ${formatEuro(SMALL_BUSINESS_LIMIT)} – damit gilt die Kleinunternehmerregelung ${year} eigentlich nicht mehr. Bitte mit deiner Steuerberatung klären.`,
  };
  return { ratio, status, left, message: messages[status] };
}

type DocLike = {
  kind: 'offer' | 'invoice';
  number: string;
  issued_on: string;
  total: number;
  paid_at: string | null;
  data: {
    buyer: { name: string; company?: string | null };
    totals: { net: number; vat_rate: number; vat_amount: number; gross: number };
    small_business: boolean;
  };
};
type ExpenseVat = ExpenseFacts & { vat_amount?: number | null };
type ExpenseLike = ExpenseVat & {
  id?: string;
  title: string;
  category: string;
  notes?: string | null;
  receipt_path?: string | null;
};

/** Beträge einer Rechnung (robust, falls ältere Daten unvollständig sind) */
export function invoiceFigures(d: DocLike) {
  const t = d.data?.totals;
  const gross = Number(t?.gross ?? d.total ?? 0);
  const vat = Number(t?.vat_amount ?? 0);
  return {
    customer: d.data?.buyer?.company || d.data?.buyer?.name || '',
    net: Number(t?.net ?? gross - vat),
    vatRate: Number(t?.vat_rate ?? 0),
    vat,
    gross,
    smallBusiness: !!d.data?.small_business,
  };
}

/** Rechnungen eines Jahres (nach Rechnungsdatum) */
export function invoicesOfYear(docs: DocLike[], year: number): DocLike[] {
  return docs
    .filter((d) => d.kind === 'invoice' && d.issued_on.startsWith(String(year)))
    .sort((a, b) => a.issued_on.localeCompare(b.issued_on) || a.number.localeCompare(b.number));
}

/** Einzelne Zahlungen einer Ausgabe im Jahr (wiederkehrende je Monat/Jahr) */
export function expenseOccurrences(
  e: ExpenseVat,
  year: number,
  today: Date,
): { day: string; amount: number; vat: number }[] {
  const byMonth = expenseByMonth(e, today);
  const day = e.spent_on.slice(8, 10);
  const vatShare = e.vat_amount && Number(e.amount) > 0 ? Number(e.vat_amount) / Number(e.amount) : 0;
  return [...byMonth.entries()]
    .filter(([k]) => k.startsWith(`${year}-`))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, amount]) => {
      const last = new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate();
      return {
        day: `${k}-${String(Math.min(Number(day), last)).padStart(2, '0')}`,
        amount,
        vat: round2(amount * vatShare),
      };
    });
}

/** Umsatzsteuer: auf Rechnungen ausgewiesen, als Vorsteuer bezahlt, Zahllast */
export function vatSummary(docs: DocLike[], expenses: ExpenseVat[], year: number, today: Date) {
  const collected = round2(invoicesOfYear(docs, year).reduce((s, d) => s + invoiceFigures(d).vat, 0));
  const input = round2(
    expenses.reduce((s, e) => s + expenseOccurrences(e, year, today).reduce((x, o) => x + o.vat, 0), 0),
  );
  return { collected, input, payable: round2(collected - input) };
}

/** Steuer-Topf: grobe Rücklage für Einkommensteuer (+ Umsatzsteuer bei Regelbesteuerung) */
export function taxReserve(input: { profit: number; percent: number; smallBusiness: boolean; vatPayable: number }) {
  const percent = Math.max(0, Math.min(60, input.percent));
  const incomeTax = round2(Math.max(0, input.profit) * (percent / 100));
  const vat = input.smallBusiness ? 0 : round2(Math.max(0, input.vatPayable));
  return { incomeTax, vat, total: round2(incomeTax + vat), percent };
}

// ---------------------------------------------------------------------------
// Export (CSV für Excel: Semikolon, Komma als Dezimalzeichen, UTF-8 mit BOM)
// ---------------------------------------------------------------------------

const money = (n: number) => n.toFixed(2).replace('.', ',');
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
function cell(v: string): string {
  const s = v.replace(/\r?\n/g, ' ');
  return /[";]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = (rows: string[][]) => '﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

export function invoicesCsv(docs: DocLike[], year: number): string {
  const rows = [['Rechnungsnummer', 'Rechnungsdatum', 'Kunde', 'Netto', 'USt-Satz', 'USt', 'Brutto', 'Bezahlt am']];
  for (const d of invoicesOfYear(docs, year)) {
    const f = invoiceFigures(d);
    rows.push([
      d.number,
      day(d.issued_on),
      f.customer,
      money(f.net),
      f.smallBusiness ? '0 % (Kleinunternehmer)' : `${f.vatRate} %`,
      money(f.vat),
      money(f.gross),
      day(d.paid_at),
    ]);
  }
  return csv(rows);
}

export function expensesCsv(
  expenses: ExpenseLike[],
  year: number,
  today: Date,
  receiptName?: (e: ExpenseLike) => string | null,
): string {
  const rows = [['Datum', 'Wofür', 'Kategorie', 'Betrag (brutto)', 'darin USt', 'Wiederkehrend', 'Beleg', 'Notiz']];
  const all: { day: string; e: ExpenseLike; amount: number; vat: number }[] = [];
  for (const e of expenses) for (const o of expenseOccurrences(e, year, today)) all.push({ ...o, e });
  all.sort((a, b) => a.day.localeCompare(b.day) || a.e.title.localeCompare(b.e.title));
  for (const { day: d, e, amount, vat } of all) {
    rows.push([
      day(d),
      e.title,
      categoryLabel(e.category),
      money(amount),
      vat ? money(vat) : '',
      e.repeat === 'monthly' ? 'monatlich' : e.repeat === 'yearly' ? 'jährlich' : '',
      e.receipt_path ? (receiptName?.(e) ?? 'ja') : '',
      e.notes ?? '',
    ]);
  }
  return csv(rows);
}

/** Ausgaben eines Jahres je Kategorie (für die Jahresübersicht) */
export function expensesByCategory(expenses: ExpenseLike[], year: number, today: Date) {
  const sums = new Map<string, number>();
  for (const e of expenses) {
    const total = expenseOccurrences(e, year, today).reduce((s, o) => s + o.amount, 0);
    if (total > 0) sums.set(e.category, round2((sums.get(e.category) ?? 0) + total));
  }
  return [...sums.entries()]
    .map(([category, amount]) => ({ category, label: categoryLabel(category), amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Dateiname eines Belegs im ZIP: Datum_Titel.endung */
export function receiptFileName(
  e: { spent_on: string; title: string; receipt_path?: string | null },
  index: number,
): string {
  const ext = e.receipt_path?.split('.').pop() ?? 'pdf';
  const title = e.title
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `${e.spent_on}_${String(index + 1).padStart(3, '0')}_${title || 'Beleg'}.${ext}`;
}

function formatEuro(n: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
