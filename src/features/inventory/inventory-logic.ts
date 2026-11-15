/**
 * Inventar – reine Logik: Status, Kennzahlen, Filter und Sortierung.
 * Wie im Gartenservice-Adminbereich: Geräte, Werkzeug und Material mit Wert und Zustand.
 */

export type InventoryStatus = 'in_betrieb' | 'reparatur' | 'defekt' | 'bestellt' | 'verkauft';

export type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  price: number | null;
  quantity: number;
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

export type InventorySort = 'newest' | 'price' | 'name';

export const INVENTORY_STATUS: { key: InventoryStatus; label: string; tone: 'ok' | 'warn' | 'bad' | 'info' | 'muted' }[] = [
  { key: 'in_betrieb', label: 'In Betrieb', tone: 'ok' },
  { key: 'reparatur', label: 'In Reparatur', tone: 'warn' },
  { key: 'defekt', label: 'Defekt', tone: 'bad' },
  { key: 'bestellt', label: 'Bestellt', tone: 'info' },
  { key: 'verkauft', label: 'Verkauft / Ausgemustert', tone: 'muted' },
];

export const statusLabel = (s: InventoryStatus) => INVENTORY_STATUS.find((x) => x.key === s)?.label ?? s;
export const statusTone = (s: InventoryStatus) => INVENTORY_STATUS.find((x) => x.key === s)?.tone ?? 'ok';

export const SORT_OPTIONS: { value: InventorySort; label: string }[] = [
  { value: 'newest', label: 'Neueste' },
  { value: 'price', label: 'Teuerste' },
  { value: 'name', label: 'A–Z' },
];

/** Vorschläge, wenn noch keine eigenen Kategorien da sind */
export const DEFAULT_CATEGORIES = ['Werkzeug', 'Maschinen', 'Fahrzeug', 'Elektronik', 'Büro', 'Material', 'Kleidung'];

/** Zählt zum Bestand: nicht verkauft und nicht erst bestellt */
export const inStock = (it: Pick<InventoryItem, 'status'>) => it.status !== 'verkauft' && it.status !== 'bestellt';

/** Wert einer Position: Preis × Anzahl (ohne Preis = 0) */
export const itemValue = (it: Pick<InventoryItem, 'price' | 'quantity'>) => (it.price ?? 0) * Math.max(0, it.quantity);

export type InventoryStats = {
  /** Wert aller Positionen im Bestand */
  value: number;
  /** Stückzahl im Bestand */
  count: number;
  categories: number;
  /** defekt oder in Reparatur */
  broken: number;
  /** Positionen ohne Preis (Wert unvollständig) */
  withoutPrice: number;
};

export function inventoryStats(items: InventoryItem[]): InventoryStats {
  let value = 0;
  let count = 0;
  let broken = 0;
  let withoutPrice = 0;
  const cats = new Set<string>();
  for (const it of items) {
    if (it.category?.trim()) cats.add(it.category.trim());
    if (it.status === 'defekt' || it.status === 'reparatur') broken += Math.max(1, it.quantity);
    if (!inStock(it)) continue;
    value += itemValue(it);
    count += Math.max(0, it.quantity);
    if (it.price === null) withoutPrice++;
  }
  return { value: Math.round(value * 100) / 100, count, categories: cats.size, broken, withoutPrice };
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

export function filterInventory(
  items: InventoryItem[],
  { category, query, sort }: { category: string | null; query: string; sort: InventorySort },
): InventoryItem[] {
  const q = query.trim().toLowerCase();
  const list = items.filter((it) => {
    if (category && it.category?.trim() !== category) return false;
    if (!q) return true;
    return [it.name, it.brand, it.category, it.location, it.serial_number, it.shop, it.notes].some((v) =>
      v?.toLowerCase().includes(q),
    );
  });
  const byName = (a: InventoryItem, b: InventoryItem) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });
  list.sort((a, b) => {
    // Verkauftes immer nach hinten
    const sold = Number(a.status === 'verkauft') - Number(b.status === 'verkauft');
    if (sold) return sold;
    if (sort === 'price') return itemValue(b) - itemValue(a) || byName(a, b);
    if (sort === 'name') return byName(a, b);
    return b.created_at.localeCompare(a.created_at);
  });
  return list;
}
