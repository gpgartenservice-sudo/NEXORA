/**
 * Lagerbestand – reine Logik: Arten, Mengen, Status, Kennzahlen, Filter und Sortierung.
 * Zwei Arten: Geräte & Werkzeug (wird benutzt) und Produkte & Material (wird verkauft
 * oder verbraucht, mit Menge, Einheit und Mindestbestand).
 */

export type InventoryKind = 'geraet' | 'produkt';
export type InventoryStatus = 'in_betrieb' | 'reparatur' | 'defekt' | 'bestellt' | 'verkauft';

export type InventoryItem = {
  id: string;
  name: string;
  kind: InventoryKind;
  category: string | null;
  brand: string | null;
  /** Geräte: Preis pro Stück · Produkte: Einkaufspreis pro Einheit */
  price: number | null;
  /** Verkaufspreis pro Einheit (nur Produkte, optional) */
  sale_price: number | null;
  quantity: number;
  unit: string;
  /** Mindestbestand: darunter (oder gleich) „Wird knapp“ */
  min_quantity: number | null;
  status: InventoryStatus;
  location: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  product_url: string | null;
  shop: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventorySort = 'newest' | 'price' | 'name' | 'stock';
export type KindFilter = 'all' | InventoryKind;

export const KINDS: { key: InventoryKind; label: string; short: string }[] = [
  { key: 'geraet', label: 'Gerät & Werkzeug', short: 'Geräte' },
  { key: 'produkt', label: 'Produkt & Material', short: 'Produkte' },
];

export const kindLabel = (k: InventoryKind) => KINDS.find((x) => x.key === k)?.label ?? k;

/** Einheiten zur Auswahl (eigene sind auch erlaubt) */
export const UNITS = ['Stück', 'Packung', 'Karton', 'kg', 'g', 'l', 'ml', 'm', 'm²', 'Rolle', 'Sack', 'Paar'];

type StatusInfo = { key: InventoryStatus; label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted' };

export const INVENTORY_STATUS: StatusInfo[] = [
  { key: 'in_betrieb', label: 'In Betrieb', tone: 'ok' },
  { key: 'reparatur', label: 'In Reparatur', tone: 'warn' },
  { key: 'defekt', label: 'Defekt', tone: 'bad' },
  { key: 'bestellt', label: 'Bestellt', tone: 'info' },
  { key: 'verkauft', label: 'Verkauft / Ausgemustert', tone: 'muted' },
];

/** Produkte kennen keinen Zustand wie „In Reparatur“ – nur Lager, bestellt, ausgelistet */
export const PRODUCT_STATUS: StatusInfo[] = [
  { key: 'in_betrieb', label: 'Im Lager', tone: 'ok' },
  { key: 'bestellt', label: 'Bestellt', tone: 'info' },
  { key: 'verkauft', label: 'Ausgelistet', tone: 'muted' },
];

export const statusOptions = (kind: InventoryKind) => (kind === 'produkt' ? PRODUCT_STATUS : INVENTORY_STATUS);

export const statusLabel = (s: InventoryStatus, kind: InventoryKind = 'geraet') =>
  statusOptions(kind).find((x) => x.key === s)?.label ?? INVENTORY_STATUS.find((x) => x.key === s)?.label ?? s;
export const statusTone = (s: InventoryStatus) => INVENTORY_STATUS.find((x) => x.key === s)?.tone ?? 'ok';

export const SORT_OPTIONS: { value: InventorySort; label: string }[] = [
  { value: 'newest', label: 'Neueste' },
  { value: 'stock', label: 'Knapp' },
  { value: 'price', label: 'Wert' },
  { value: 'name', label: 'A–Z' },
];

/** Vorschläge, wenn noch keine eigenen Kategorien da sind */
export const DEFAULT_CATEGORIES: Record<InventoryKind, string[]> = {
  geraet: ['Werkzeug', 'Maschinen', 'Fahrzeug', 'Elektronik', 'Büro', 'Kleidung'],
  produkt: ['Verkaufsware', 'Material', 'Verbrauchsmaterial', 'Ersatzteile', 'Verpackung', 'Reinigung & Pflege'],
};

/** Zählt zum Bestand: nicht verkauft/ausgelistet und nicht erst bestellt */
export const inStock = (it: Pick<InventoryItem, 'status'>) => it.status !== 'verkauft' && it.status !== 'bestellt';

/** Wert einer Position: Preis × Menge (ohne Preis = 0) */
export const itemValue = (it: Pick<InventoryItem, 'price' | 'quantity'>) => (it.price ?? 0) * Math.max(0, it.quantity);

export type StockLevel = 'ok' | 'low' | 'empty';

/**
 * Wie voll ist das Lager? Nur für Produkte im Lager: 0 = leer, bis zum Mindestbestand = knapp.
 * Geräte und Bestelltes/Ausgelistetes sind immer „ok“.
 */
export function stockLevel(it: Pick<InventoryItem, 'kind' | 'quantity' | 'min_quantity' | 'status'>): StockLevel {
  if (it.kind !== 'produkt' || it.status !== 'in_betrieb') return 'ok';
  if (it.quantity <= 0) return 'empty';
  if (it.min_quantity !== null && it.quantity <= it.min_quantity) return 'low';
  return 'ok';
}

export const needsRestock = (it: Parameters<typeof stockLevel>[0]) => stockLevel(it) !== 'ok';

/** Menge hübsch: 12 · 2,5 · 0,125 (höchstens 3 Nachkommastellen) */
export const formatAmount = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 3 });

const PLURAL: Record<string, string> = { Packung: 'Packungen', Karton: 'Kartons', Rolle: 'Rollen', Sack: 'Säcke' };

/** Einheit passend zur Menge: 1 Packung, 4 Packungen (kg, l, Stück … bleiben gleich) */
export const unitFor = (quantity: number, unit: string) => {
  const u = unit || 'Stück';
  return quantity === 1 ? u : (PLURAL[u] ?? u);
};

/** „12 Stück“, „2,5 kg“, „4 Packungen“ */
export const formatQuantity = (it: Pick<InventoryItem, 'quantity' | 'unit'>) =>
  `${formatAmount(it.quantity)} ${unitFor(it.quantity, it.unit)}`;

/** Eingabe wie „2,5“ oder „12“ → Zahl; leer → null; Unsinn → 'invalid' */
export function parseAmount(text: string): number | null | 'invalid' {
  const t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  if (!/^\d{1,9}([.,]\d{1,3})?$/.test(t)) return 'invalid';
  return Number(t.replace(',', '.'));
}

/** Schrittweite für +/−: ganze Einheiten, bei krummen Mengen in kg/l/m auch 0,5 */
export function stepFor(it: Pick<InventoryItem, 'quantity' | 'unit'>): number {
  const fractional = !Number.isInteger(it.quantity);
  return fractional && ['kg', 'l', 'm', 'm²'].includes(it.unit) ? 0.5 : 1;
}

export type InventoryStats = {
  /** Wert aller Positionen im Bestand */
  value: number;
  /** Geräte im Bestand (Stückzahl) */
  devices: number;
  /** Produkt-Positionen im Lager */
  products: number;
  /** Produkte, die knapp oder leer sind */
  low: number;
  /** defekt oder in Reparatur */
  broken: number;
  /** Positionen ohne Preis (Wert unvollständig) */
  withoutPrice: number;
  /** möglicher Umsatz: Verkaufspreis × Menge aller Produkte im Lager */
  saleValue: number;
};

export function inventoryStats(items: InventoryItem[]): InventoryStats {
  const s: InventoryStats = { value: 0, devices: 0, products: 0, low: 0, broken: 0, withoutPrice: 0, saleValue: 0 };
  for (const it of items) {
    if (it.kind !== 'produkt' && (it.status === 'defekt' || it.status === 'reparatur')) s.broken += Math.max(1, it.quantity);
    if (needsRestock(it)) s.low++;
    if (!inStock(it)) continue;
    s.value += itemValue(it);
    if (it.kind === 'produkt') {
      s.products++;
      s.saleValue += (it.sale_price ?? 0) * Math.max(0, it.quantity);
    } else s.devices += Math.max(0, it.quantity);
    if (it.price === null) s.withoutPrice++;
  }
  s.value = Math.round(s.value * 100) / 100;
  s.saleValue = Math.round(s.saleValue * 100) / 100;
  return s;
}

/** Kategorien mit Anzahl, alphabetisch */
export function categoryCounts(items: InventoryItem[]): { name: string; count: number }[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const c = it.category?.trim();
    if (c) map.set(c, (map.get(c) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }));
}

const LEVEL_ORDER: Record<StockLevel, number> = { empty: 0, low: 1, ok: 2 };

export function filterInventory(
  items: InventoryItem[],
  {
    category,
    query,
    sort,
    kind = 'all',
    lowOnly = false,
  }: { category: string | null; query: string; sort: InventorySort; kind?: KindFilter; lowOnly?: boolean },
): InventoryItem[] {
  const q = query.trim().toLowerCase();
  const list = items.filter((it) => {
    if (kind !== 'all' && it.kind !== kind) return false;
    if (lowOnly && !needsRestock(it)) return false;
    if (category && it.category?.trim() !== category) return false;
    if (!q) return true;
    return [it.name, it.brand, it.category, it.location, it.serial_number, it.shop, it.notes].some((v) =>
      v?.toLowerCase().includes(q),
    );
  });
  const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
  list.sort((a, b) => {
    // Verkauftes / Ausgelistetes immer nach hinten
    const sold = Number(a.status === 'verkauft') - Number(b.status === 'verkauft');
    if (sold) return sold;
    if (sort === 'stock') return LEVEL_ORDER[stockLevel(a)] - LEVEL_ORDER[stockLevel(b)] || byName(a, b);
    if (sort === 'price') return itemValue(b) - itemValue(a) || byName(a, b);
    if (sort === 'name') return byName(a, b);
    return b.created_at.localeCompare(a.created_at);
  });
  return list;
}
