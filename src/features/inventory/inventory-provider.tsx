import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';
import { roleErrorText } from '@/features/team/roles';

import type { InventoryItem } from './inventory-logic';

export type InventoryInput = Omit<InventoryItem, 'id' | 'created_at' | 'updated_at'>;

type Result<T = undefined> = { data?: T; error?: string };

type State = {
  items: InventoryItem[];
  loading: boolean;
  /** 'setup' = Datenbank-Skript fehlt noch */
  error: 'setup' | 'failed' | null;
  createItem: (input: InventoryInput) => Promise<Result<InventoryItem>>;
  updateItem: (id: string, input: Partial<InventoryInput>) => Promise<Result<InventoryItem>>;
  deleteItem: (id: string) => Promise<Result>;
  /** Menge um delta ändern (+/−) – sofort sichtbar, gespeichert wird im Hintergrund */
  adjustQuantity: (id: string, delta: number) => Promise<Result>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];
/** Spalten aus dem Lagerbestand-Skript fehlen noch */
const OLD_COLUMNS = ['PGRST204', '42703'];

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

// Ohne das Lagerbestand-Skript fehlen kind/unit/… – dann wie bisher: Geräte in Stück
const toItem = (row: Record<string, unknown>): InventoryItem => ({
  ...(row as unknown as InventoryItem),
  kind: row.kind === 'produkt' ? 'produkt' : 'geraet',
  unit: typeof row.unit === 'string' && row.unit ? row.unit : 'Stück',
  price: num(row.price),
  sale_price: num(row.sale_price),
  min_quantity: num(row.min_quantity),
  quantity: Number(row.quantity ?? 1),
});

function message(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING.includes(error.code)) {
    return 'Der Lagerbestand kann noch nicht gespeichert werden: Das Datenbank-Skript fehlt (20261120090000_feinschliff.sql, siehe supabase/README.md).';
  }
  if (error.code && OLD_COLUMNS.includes(error.code)) {
    return 'Für Produkte, Einheiten und Mindestbestand fehlt noch das Datenbank-Skript 20261123090000_lagerbestand.sql (siehe supabase/README.md).';
  }
  if (error.code === '23514') return 'Eine Angabe ist ungültig oder zu lang. Bitte prüfe deine Eingaben.';
  return roleErrorText(error.message) ?? `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

/** Lagerbestand des Business (im Team: der des Inhabers – regelt die Datenbank). */
export function InventoryProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<State['error']>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('inventory_items')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          console.warn('[Lagerbestand]', err);
          setError(MISSING.includes(err.code) ? 'setup' : 'failed');
        } else {
          setError(null);
          setItems((data ?? []).map(toItem));
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const createItem = useCallback(async (input: InventoryInput): Promise<Result<InventoryItem>> => {
    const { data, error: err } = await supabase.from('inventory_items').insert(input).select('*').single();
    if (err) return { error: message(err, 'Das Teil konnte nicht gespeichert werden.') };
    const row = toItem(data as Record<string, unknown>);
    setItems((list) => [row, ...list]);
    return { data: row };
  }, []);

  const updateItem = useCallback(async (id: string, input: Partial<InventoryInput>): Promise<Result<InventoryItem>> => {
    const { data, error: err } = await supabase.from('inventory_items').update(input).eq('id', id).select('*').single();
    if (err) return { error: message(err, 'Die Änderung konnte nicht gespeichert werden.') };
    const row = toItem(data as Record<string, unknown>);
    setItems((list) => list.map((e) => (e.id === id ? row : e)));
    return { data: row };
  }, []);

  const deleteItem = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('inventory_items').delete().eq('id', id);
    if (err) return { error: message(err, 'Das Teil konnte nicht gelöscht werden.') };
    setItems((list) => list.filter((e) => e.id !== id));
    return {};
  }, []);

  // Mehrere schnelle Klicks: jeder ändert sofort die Anzeige; die Antwort des Servers
  // übernehmen wir erst, wenn für diese Zeile nichts mehr unterwegs ist.
  const pending = useRef(new Map<string, number>());
  const adjustQuantity = useCallback(async (id: string, delta: number): Promise<Result> => {
    const round = (n: number) => Math.round(n * 1000) / 1000;
    let before: number | null = null;
    setItems((list) =>
      list.map((e) => {
        if (e.id !== id) return e;
        before = e.quantity;
        return { ...e, quantity: Math.max(0, round(e.quantity + delta)) };
      }),
    );
    pending.current.set(id, (pending.current.get(id) ?? 0) + 1);
    let { data, error: err } = await supabase.rpc('inventory_adjust', { p_id: id, p_delta: delta });
    // Skript noch nicht ausgeführt: wie bisher die neue Menge direkt speichern
    if (err && (err.code === 'PGRST202' || err.code === '42883') && before !== null) {
      ({ data, error: err } = await supabase
        .from('inventory_items')
        .update({ quantity: Math.max(0, round((before as number) + delta)) })
        .eq('id', id)
        .select('*'));
    }
    const left = (pending.current.get(id) ?? 1) - 1;
    if (left > 0) pending.current.set(id, left);
    else pending.current.delete(id);
    if (err) {
      setItems((list) => list.map((e) => (e.id === id ? { ...e, quantity: Math.max(0, round(e.quantity - delta)) } : e)));
      return { error: message(err, 'Die Menge konnte nicht gespeichert werden.') };
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && left === 0) setItems((list) => list.map((e) => (e.id === id ? toItem(row as Record<string, unknown>) : e)));
    return {};
  }, []);

  const value = useMemo<State>(
    () => ({ items, loading, error, createItem, updateItem, deleteItem, adjustQuantity }),
    [items, loading, error, createItem, updateItem, deleteItem, adjustQuantity],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInventory(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useInventory muss innerhalb von InventoryProvider verwendet werden');
  return ctx;
}
