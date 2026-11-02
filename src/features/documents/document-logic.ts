/**
 * Beträge und Pflichtangaben für Angebote und Rechnungen.
 *
 * Bewusst ohne Imports, damit die Funktionen einzeln getestet werden können
 * (tests/unit/document-logic.test.mjs).
 *
 * Hinweise nach bestem Wissen (Stand 2026) – ersetzt keine Steuerberatung.
 */

export type DocumentKind = 'offer' | 'invoice';

/** Firmendaten des Absenders (Tabelle business_settings). */
export type Seller = {
  company_name: string | null;
  owner_name: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  tax_number: string | null;
  vat_id: string | null;
  small_business: boolean;
  vat_rate: number;
  bank_name: string | null;
  iban: string | null;
  bic: string | null;
  payment_days: number;
  offer_validity_days: number;
};

export type Buyer = {
  name: string;
  company: string | null;
  address: string | null;
  email: string | null;
};

export type LineItem = {
  description: string;
  details: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
};

export type Totals = {
  subtotal: number;
  discount_percent: number;
  discount_amount: number;
  net: number;
  vat_rate: number;
  vat_amount: number;
  gross: number;
};

/** Alles, was auf dem Dokument steht – wird beim Erstellen "eingefroren". */
export type DocumentData = {
  kind: DocumentKind;
  seller: Seller;
  buyer: Buyer;
  items: LineItem[];
  totals: Totals;
  small_business: boolean;
  /** Rechnung: Datum oder Zeitraum der Leistung (Pflichtangabe) */
  service_date: string | null;
  service_period: { from: string; to: string } | null;
  /** Monatliche Abrechnung */
  monthly: boolean;
};

export const EMPTY_SELLER: Seller = {
  company_name: null,
  owner_name: null,
  street: null,
  zip: null,
  city: null,
  phone: null,
  email: null,
  website: null,
  tax_number: null,
  vat_id: null,
  small_business: true,
  vat_rate: 19,
  bank_name: null,
  iban: null,
  bic: null,
  payment_days: 14,
  offer_validity_days: 30,
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Summen: Positionen -> Rabatt -> Netto -> Umsatzsteuer -> Gesamt.
 * Kleinunternehmer: keine Umsatzsteuer, der Preis ist der Endbetrag.
 * Sonst gelten die Preise als Netto-Preise.
 */
export function computeTotals(items: LineItem[], discountPercent: number, smallBusiness: boolean, vatRate: number): Totals {
  const subtotal = round2(items.reduce((sum, i) => sum + round2(i.quantity * i.unit_price), 0));
  const discount = Math.max(0, Math.min(100, discountPercent || 0));
  const discountAmount = round2((subtotal * discount) / 100);
  const net = round2(subtotal - discountAmount);
  const rate = smallBusiness ? 0 : Math.max(0, vatRate);
  const vat = round2((net * rate) / 100);
  return {
    subtotal,
    discount_percent: discount,
    discount_amount: discountAmount,
    net,
    vat_rate: rate,
    vat_amount: vat,
    gross: round2(net + vat),
  };
}

/** Name, unter dem der Absender auftritt (Firma oder Inhaber). */
export function sellerName(s: Seller): string {
  return (s.company_name || s.owner_name || '').trim();
}

/**
 * Fehlende Angaben, ohne die das Dokument nicht erstellt werden sollte.
 * Rechnungen brauchen u. a. vollständige Anschrift und Steuernummer
 * oder USt-IdNr. (§ 14 UStG).
 */
export function missingSellerFields(s: Seller, kind: DocumentKind): string[] {
  const missing: string[] = [];
  if (!sellerName(s)) missing.push('Firmenname oder Inhaber');
  if (!s.street?.trim()) missing.push('Straße und Hausnummer');
  if (!s.zip?.trim() || !s.city?.trim()) missing.push('PLZ und Ort');
  if (kind === 'invoice') {
    if (!s.tax_number?.trim() && !s.vat_id?.trim()) missing.push('Steuernummer oder USt-IdNr.');
    if (!s.iban?.trim()) missing.push('IBAN für die Überweisung');
  }
  return missing;
}

/** Fehlende Angaben zum Kunden (Rechnung: Name und Anschrift sind Pflicht). */
export function missingBuyerFields(b: Buyer, kind: DocumentKind): string[] {
  const missing: string[] = [];
  if (!b.name?.trim()) missing.push('Name des Kunden');
  if (kind === 'invoice' && !b.address?.trim()) missing.push('Anschrift des Kunden');
  return missing;
}

/** Datum "JJJJ-MM-TT" + Tage -> "JJJJ-MM-TT" */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** Heute als "JJJJ-MM-TT" (lokale Zeit) */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** "JJJJ-MM-TT" -> "TT.MM.JJJJ" */
export function formatDay(isoDate: string | null | undefined): string {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function formatMoney(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}
