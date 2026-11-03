import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import type { ExpenseCategory, ExpenseRepeat } from './finance-logic';

export type Expense = {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  spent_on: string;
  repeat: ExpenseRepeat;
  ends_on: string | null;
  notes: string | null;
  /** Beleg im privaten Speicher (Foto/PDF) */
  receipt_path?: string | null;
  receipt_mime?: string | null;
  /** enthaltene Umsatzsteuer (Vorsteuer), nur bei Regelbesteuerung */
  vat_amount?: number | null;
  created_at: string;
  updated_at: string;
};

export type ExpenseInput = Pick<
  Expense,
  'title' | 'category' | 'amount' | 'spent_on' | 'repeat' | 'ends_on' | 'notes'
> &
  Partial<Pick<Expense, 'receipt_path' | 'receipt_mime' | 'vat_amount'>>;

type Result<T = undefined> = { data?: T; error?: string };

type State = {
  expenses: Expense[];
  loading: boolean;
  /** 'setup' = Datenbank-Skript für Finanzen fehlt */
  error: 'setup' | 'failed' | null;
  createExpense: (input: ExpenseInput) => Promise<Result<Expense>>;
  updateExpense: (id: string, input: Partial<ExpenseInput>) => Promise<Result<Expense>>;
  deleteExpense: (id: string) => Promise<Result>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];

const toExpense = (row: Record<string, unknown>): Expense => ({
  ...(row as unknown as Expense),
  amount: Number(row.amount),
  vat_amount: row.vat_amount === null || row.vat_amount === undefined ? null : Number(row.vat_amount),
});

function message(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING.includes(error.code)) {
    return 'Ausgaben können noch nicht gespeichert werden: Das Datenbank-Skript für Finanzen fehlt (siehe supabase/README.md).';
  }
  if ((error.code === 'PGRST204' || error.code === '42703') && /receipt/.test(error.message ?? '')) {
    return 'Belege können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (20261112090000_receipts.sql, siehe supabase/README.md).';
  }
  if ((error.code === 'PGRST204' || error.code === '42703') && /vat_amount/.test(error.message ?? '')) {
    return 'Die enthaltene Umsatzsteuer kann noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (20261114090000_tax.sql, siehe supabase/README.md).';
  }
  if (error.code === '23514') return 'Eine Angabe ist ungültig. Bitte prüfe deine Eingaben.';
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

const byDate = (a: Expense, b: Expense) => b.spent_on.localeCompare(a.spent_on) || b.created_at.localeCompare(a.created_at);

/** Allgemeine Ausgaben des angemeldeten Nutzers (Einnahmen kommen aus den Aufträgen). */
export function FinanceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<State['error']>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('expenses')
      .select('*')
      .order('spent_on', { ascending: false })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) {
          console.warn('[Finanzen]', err);
          setError(MISSING.includes(err.code) ? 'setup' : 'failed');
        } else {
          setError(null);
          setExpenses((data ?? []).map(toExpense).sort(byDate));
        }
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const createExpense = useCallback(async (input: ExpenseInput): Promise<Result<Expense>> => {
    const { data, error: err } = await supabase.from('expenses').insert(input).select('*').single();
    if (err) return { error: message(err, 'Die Ausgabe konnte nicht gespeichert werden.') };
    const row = toExpense(data as Record<string, unknown>);
    setExpenses((list) => [row, ...list].sort(byDate));
    return { data: row };
  }, []);

  const updateExpense = useCallback(async (id: string, input: Partial<ExpenseInput>): Promise<Result<Expense>> => {
    const { data, error: err } = await supabase.from('expenses').update(input).eq('id', id).select('*').single();
    if (err) return { error: message(err, 'Die Änderung konnte nicht gespeichert werden.') };
    const row = toExpense(data as Record<string, unknown>);
    setExpenses((list) => list.map((e) => (e.id === id ? row : e)).sort(byDate));
    return { data: row };
  }, []);

  const deleteExpense = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('expenses').delete().eq('id', id);
    if (err) return { error: message(err, 'Die Ausgabe konnte nicht gelöscht werden.') };
    setExpenses((list) => list.filter((e) => e.id !== id));
    return {};
  }, []);

  const value = useMemo<State>(
    () => ({ expenses, loading, error, createExpense, updateExpense, deleteExpense }),
    [expenses, loading, error, createExpense, updateExpense, deleteExpense],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFinance(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFinance muss innerhalb von FinanceProvider verwendet werden');
  return ctx;
}
