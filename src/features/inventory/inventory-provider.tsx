import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

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
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];

const toItem = (row: Record<string, unknown>): InventoryItem => ({
  ...(row as unknown as InventoryItem),
  price: row.price === null || row.price === undefined ? null : Number(row.price),
  quantity: Number(row.quantity ?? 1),
});

function message(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING.includes(error.code)) {
    return 'Das Inventar kann noch nicht gespeichert werden: Das Datenbank-Skript fehlt (20261120090000_feinschliff.sql, siehe supabase/README.md).';
  }
  if (error.code === '23514') return 'Eine Angabe ist ungültig oder zu lang. Bitte prüfe deine Eingaben.';
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

/** Inventar des Business (im Team: das des Inhabers – regelt die Datenbank). */
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
          console.warn('[Inventar]', err);
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

  const value = useMemo<State>(
    () => ({ items, loading, error, createItem, updateItem, deleteItem }),
    [items, loading, error, createItem, updateItem, deleteItem],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useInventory(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useInventory muss innerhalb von InventoryProvider verwendet werden');
  return ctx;
}
