/**
 * Belege – reine Logik (ohne App/Netz, mit Unit-Tests):
 * Ergebnis vom Belege-Lesen prüfen und in eine Ausgabe übersetzen,
 * Speicherpfad, doppelte Belege erkennen.
 */
import { EXPENSE_CATEGORIES, type ExpenseCategory, type ExpenseRepeat } from './finance-logic';

export const RECEIPT_MIMES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type ReceiptMime = (typeof RECEIPT_MIMES)[number];

/** Höchstgröße einer Beleg-Datei (Speicher erlaubt 10 MB, Server liest bis ~6 MB) */
export const MAX_RECEIPT_BYTES = 6 * 1024 * 1024;

/** So kommt das Ergebnis vom Server (kann unvollständig sein) */
export type ReceiptReading = {
  is_receipt?: unknown;
  merchant?: unknown;
  title?: unknown;
  amount?: unknown;
  date?: unknown;
  category?: unknown;
  repeat?: unknown;
  vat_rate?: unknown;
  vat_amount?: unknown;
  currency?: unknown;
  note?: unknown;
};

export type ReceiptDraft = {
  title: string;
  amount: number | null;
  category: ExpenseCategory;
  repeat: ExpenseRepeat;
  spent_on: string | null;
  /** Vorschlag für die Notiz (Händler, ausgewiesene Umsatzsteuer) */
  notes: string | null;
  /** ausgewiesene Umsatzsteuer (für die Vorsteuer), wenn plausibel */
  vat_amount: number | null;
};

const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const validDay = (v: unknown): string | null => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d ? v : null;
};
const money = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ergebnis vom Belege-Lesen -> Vorschlag für die Ausgabe + Hinweise.
 * `null`, wenn es kein lesbarer Beleg war (dann steht der Grund in `warnings`).
 */
export function receiptToDraft(
  r: ReceiptReading | null | undefined,
  today: string,
): { draft: ReceiptDraft | null; warnings: string[] } {
  const warnings: string[] = [];
  const note = text(r?.note, 300);
  if (!r || r.is_receipt !== true) {
    warnings.push(note ?? 'Das sieht nicht nach einem Beleg aus. Bitte trag die Ausgabe selbst ein.');
    return { draft: null, warnings };
  }
  if (note) warnings.push(note);

  const amountRaw = typeof r.amount === 'number' && Number.isFinite(r.amount) ? Math.round(r.amount * 100) / 100 : null;
  const amount = amountRaw !== null && amountRaw > 0 && amountRaw < 10_000_000 ? amountRaw : null;
  if (amount === null) warnings.push('Den Betrag konnte ich nicht sicher lesen – bitte eintragen.');
  const currency = text(r.currency, 5)?.toUpperCase();
  if (currency && currency !== 'EUR' && amount !== null)
    warnings.push(`Der Beleg ist in ${currency} – bitte den Betrag in Euro eintragen.`);

  let spentOn = validDay(r.date);
  if (!spentOn) warnings.push('Das Datum konnte ich nicht lesen – bitte prüfen.');
  else if (spentOn > today) {
    warnings.push('Das Datum liegt in der Zukunft – bitte prüfen.');
  }
  if (!spentOn) spentOn = null;

  const category = (EXPENSE_CATEGORIES.some((c) => c.key === r.category) ? r.category : 'other') as ExpenseCategory;
  const repeat: ExpenseRepeat = r.repeat === 'monthly' || r.repeat === 'yearly' ? r.repeat : 'once';
  const merchant = text(r.merchant, 120);
  const title = text(r.title, 200) ?? merchant ?? 'Beleg';

  const vatRate = typeof r.vat_rate === 'number' && [0, 7, 19].includes(r.vat_rate) ? r.vat_rate : null;
  const vatAmount = typeof r.vat_amount === 'number' && r.vat_amount > 0 ? Math.round(r.vat_amount * 100) / 100 : null;
  const noteParts = [
    merchant && merchant !== title ? merchant : null,
    vatAmount !== null ? `darin ${money(vatAmount)} € USt${vatRate !== null ? ` (${vatRate} %)` : ''}` : null,
  ].filter(Boolean);

  return {
    draft: {
      title,
      amount,
      category,
      repeat,
      spent_on: spentOn,
      notes: noteParts.length ? noteParts.join(' · ') : null,
      vat_amount: vatAmount !== null && (amount === null || vatAmount < amount) ? vatAmount : null,
    },
    warnings,
  };
}

export const receiptExt = (mime: ReceiptMime) =>
  mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';

/** Speicherpfad im privaten Speicher: <Nutzer-ID>/<Datei-ID>.<Endung> */
export function receiptPath(userId: string, fileId: string, mime: ReceiptMime): string {
  return `${userId}/${fileId}.${receiptExt(mime)}`;
}

type ExpenseLike = { id: string; title: string; amount: number; spent_on: string };

/** Gibt es schon eine Ausgabe mit gleichem Betrag in ±3 Tagen? (Beleg doppelt erfasst?) */
export function possibleDuplicate(
  expenses: ExpenseLike[],
  amount: number | null,
  day: string | null,
  ignoreId?: string,
): ExpenseLike | null {
  if (amount === null || !day) return null;
  const t = new Date(`${day}T12:00:00`).getTime();
  return (
    expenses.find(
      (e) =>
        e.id !== ignoreId &&
        Math.abs(Number(e.amount) - amount) < 0.005 &&
        Math.abs(new Date(`${e.spent_on}T12:00:00`).getTime() - t) <= 3 * 24 * 60 * 60 * 1000,
    ) ?? null
  );
}
