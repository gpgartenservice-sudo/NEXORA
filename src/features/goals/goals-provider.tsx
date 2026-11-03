import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import type { Goal, Todo } from './goals-logic';

export type TodoInput = Pick<Todo, 'title'> &
  Partial<Pick<Todo, 'notes' | 'due_on' | 'important' | 'done' | 'customer_id' | 'order_id'>>;
export type GoalInput = Pick<Goal, 'kind' | 'period' | 'target'> &
  Partial<Pick<Goal, 'title' | 'progress' | 'due_on' | 'archived'>>;

type Result<T = undefined> = { data?: T; error?: string };

type State = {
  todos: Todo[];
  goals: Goal[];
  loading: boolean;
  /** 'setup' = Datenbank-Skript für To-dos & Ziele fehlt */
  error: 'setup' | 'failed' | null;
  createTodo: (input: TodoInput) => Promise<Result<Todo>>;
  updateTodo: (id: string, input: Partial<TodoInput>) => Promise<Result<Todo>>;
  deleteTodo: (id: string) => Promise<Result>;
  createGoal: (input: GoalInput) => Promise<Result<Goal>>;
  updateGoal: (id: string, input: Partial<GoalInput>) => Promise<Result<Goal>>;
  deleteGoal: (id: string) => Promise<Result>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106'];

function message(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING.includes(error.code)) {
    return 'To-dos und Ziele können noch nicht gespeichert werden: Das Datenbank-Skript dafür fehlt (20261111090000_todos_goals.sql, siehe supabase/README.md).';
  }
  if (error.code === '23514') return 'Eine Angabe ist ungültig – bitte prüfe Titel und Zahlen.';
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

const toGoal = (row: Record<string, unknown>): Goal => ({
  ...(row as unknown as Goal),
  target: Number(row.target),
  progress: Number(row.progress ?? 0),
});

type Loaded = { todos: Todo[]; goals: Goal[] } | { missing: true } | { failed: true };

async function fetchAll(): Promise<Loaded> {
  const [t, g] = await Promise.all([
    supabase.from('todos').select('*').order('created_at'),
    supabase.from('goals').select('*').order('created_at'),
  ]);
  const err = t.error ?? g.error;
  if (err) {
    if (MISSING.includes(err.code)) return { missing: true };
    console.warn('[To-dos & Ziele]', err);
    return { failed: true };
  }
  return {
    todos: (t.data ?? []) as Todo[],
    goals: ((g.data ?? []) as Record<string, unknown>[]).map(toGoal),
  };
}

/** To-dos und Ziele des angemeldeten Nutzers. */
export function GoalsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<State['error']>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchAll().then((r) => {
      if (!active) return;
      setLoading(false);
      if ('missing' in r) return setError('setup');
      if ('failed' in r) return setError('failed');
      setError(null);
      setTodos(r.todos);
      setGoals(r.goals);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const createTodo = useCallback(async (input: TodoInput): Promise<Result<Todo>> => {
    const { data, error: err } = await supabase.from('todos').insert(input).select('*').single();
    if (err) return { error: message(err, 'Das To-do konnte nicht gespeichert werden.') };
    const row = data as Todo;
    setTodos((list) => [...list, row]);
    return { data: row };
  }, []);

  const updateTodo = useCallback(async (id: string, input: Partial<TodoInput>): Promise<Result<Todo>> => {
    const { data, error: err } = await supabase.from('todos').update(input).eq('id', id).select('*').single();
    if (err) return { error: message(err, 'Die Änderung konnte nicht gespeichert werden.') };
    const row = data as Todo;
    setTodos((list) => list.map((t) => (t.id === id ? row : t)));
    return { data: row };
  }, []);

  const deleteTodo = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('todos').delete().eq('id', id);
    if (err) return { error: message(err, 'Das To-do konnte nicht gelöscht werden.') };
    setTodos((list) => list.filter((t) => t.id !== id));
    return {};
  }, []);

  const createGoal = useCallback(async (input: GoalInput): Promise<Result<Goal>> => {
    const { data, error: err } = await supabase.from('goals').insert(input).select('*').single();
    if (err) return { error: message(err, 'Das Ziel konnte nicht gespeichert werden.') };
    const row = toGoal(data as Record<string, unknown>);
    setGoals((list) => [...list, row]);
    return { data: row };
  }, []);

  const updateGoal = useCallback(async (id: string, input: Partial<GoalInput>): Promise<Result<Goal>> => {
    const { data, error: err } = await supabase.from('goals').update(input).eq('id', id).select('*').single();
    if (err) return { error: message(err, 'Die Änderung konnte nicht gespeichert werden.') };
    const row = toGoal(data as Record<string, unknown>);
    setGoals((list) => list.map((g) => (g.id === id ? row : g)));
    return { data: row };
  }, []);

  const deleteGoal = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('goals').delete().eq('id', id);
    if (err) return { error: message(err, 'Das Ziel konnte nicht gelöscht werden.') };
    setGoals((list) => list.filter((g) => g.id !== id));
    return {};
  }, []);

  const value = useMemo<State>(
    () => ({ todos, goals, loading, error, createTodo, updateTodo, deleteTodo, createGoal, updateGoal, deleteGoal }),
    [todos, goals, loading, error, createTodo, updateTodo, deleteTodo, createGoal, updateGoal, deleteGoal],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGoals(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useGoals muss innerhalb von GoalsProvider verwendet werden');
  return ctx;
}
