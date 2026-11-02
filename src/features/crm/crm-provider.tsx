import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/lib/supabase';

import type { Billing } from './order-logic';

export type Customer = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Order = {
  id: string;
  customer_id: string;
  title: string;
  description: string | null;
  price: number | null;
  discount_percent: number;
  billing: Billing;
  contract_start: string | null;
  contract_end: string | null;
  meeting_at: string | null;
  meeting_done: boolean;
  offer_sent: boolean;
  offer_accepted: boolean;
  execution_at: string | null;
  completed: boolean;
  /** Tag des Abschlusses (setzt die Datenbank automatisch) */
  completed_on?: string | null;
  cancelled: boolean;
  expenses: number | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CustomerInput = Pick<Customer, 'name' | 'company' | 'phone' | 'email' | 'address' | 'notes'>;
export type OrderInput = Partial<Omit<Order, 'id' | 'created_at' | 'updated_at'>> & { customer_id: string; title: string };

type Result<T = undefined> = { data?: T; error?: string };

type CrmState = {
  customers: Customer[];
  orders: Order[];
  loading: boolean;
  /** 'setup' = Tabellen fehlen (Datenbank-Skript noch nicht ausgeführt) */
  error: 'setup' | 'failed' | null;
  reload: () => Promise<void>;
  createCustomer: (input: CustomerInput) => Promise<Result<Customer>>;
  updateCustomer: (id: string, input: Partial<CustomerInput>) => Promise<Result<Customer>>;
  deleteCustomer: (id: string) => Promise<Result>;
  createOrder: (input: OrderInput) => Promise<Result<Order>>;
  updateOrder: (id: string, input: Partial<OrderInput>) => Promise<Result<Order>>;
  deleteOrder: (id: string) => Promise<Result>;
  customerById: (id: string) => Customer | undefined;
  ordersFor: (customerId: string) => Order[];
};

const CrmContext = createContext<CrmState | null>(null);
const MISSING_TABLE = ['PGRST205', '42P01', 'PGRST106'];

/** Supabase liefert numeric-Spalten als Text – hier in Zahlen umwandeln. */
function toOrder(row: Record<string, unknown>): Order {
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    ...(row as unknown as Order),
    price: num(row.price),
    discount_percent: num(row.discount_percent) ?? 0,
    expenses: num(row.expenses),
  };
}

function message(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING_TABLE.includes(error.code)) {
    return 'Die Datenbank für Kunden und Aufträge ist noch nicht eingerichtet (siehe supabase/README.md).';
  }
  // Kunde hat noch Aufträge (Fremdschlüssel)
  if (error.code === '23503') return 'Dieser Kunde hat noch Aufträge. Lösche zuerst die Aufträge.';
  if (error.code === '23514') return 'Eine Angabe ist ungültig. Bitte prüfe deine Eingaben.';
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

async function fetchAll() {
  const [c, o] = await Promise.all([
    supabase.from('customers').select('*').order('updated_at', { ascending: false }),
    supabase.from('orders').select('*').order('updated_at', { ascending: false }),
  ]);
  return {
    customers: (c.data ?? []) as Customer[],
    orders: (o.data ?? []).map(toOrder),
    error: c.error ?? o.error,
  };
}

/** Lädt Kunden und Aufträge des angemeldeten Nutzers und speichert Änderungen. */
export function CrmProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CrmState['error']>(null);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (result.error) {
      console.warn('[CRM]', result.error);
      setError(MISSING_TABLE.includes(result.error.code) ? 'setup' : 'failed');
    } else {
      setError(null);
      setCustomers(result.customers);
      setOrders(result.orders);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetchAll().then((result) => {
      if (active) apply(result);
    });
    return () => {
      active = false;
    };
  }, [userId, apply]);

  const reload = useCallback(async () => {
    setLoading(true);
    apply(await fetchAll());
  }, [apply]);

  const createCustomer = useCallback(async (input: CustomerInput): Promise<Result<Customer>> => {
    const { data, error: err } = await supabase.from('customers').insert(input).select('*').single();
    if (err) return { error: message(err, 'Der Kunde konnte nicht gespeichert werden.') };
    const customer = data as Customer;
    setCustomers((list) => [customer, ...list]);
    return { data: customer };
  }, []);

  const updateCustomer = useCallback(async (id: string, input: Partial<CustomerInput>): Promise<Result<Customer>> => {
    const { data, error: err } = await supabase.from('customers').update(input).eq('id', id).select('*').single();
    if (err) return { error: message(err, 'Die Änderungen konnten nicht gespeichert werden.') };
    const customer = data as Customer;
    setCustomers((list) => [customer, ...list.filter((c) => c.id !== id)]);
    return { data: customer };
  }, []);

  const deleteCustomer = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('customers').delete().eq('id', id);
    if (err) return { error: message(err, 'Der Kunde konnte nicht gelöscht werden.') };
    setCustomers((list) => list.filter((c) => c.id !== id));
    return {};
  }, []);

  const createOrder = useCallback(async (input: OrderInput): Promise<Result<Order>> => {
    const { data, error: err } = await supabase.from('orders').insert(input).select('*').single();
    if (err) return { error: message(err, 'Der Auftrag konnte nicht gespeichert werden.') };
    const order = toOrder(data as Record<string, unknown>);
    setOrders((list) => [order, ...list]);
    // Kunde nach oben sortieren (zuletzt aktiv)
    setCustomers((list) => {
      const c = list.find((x) => x.id === order.customer_id);
      return c ? [c, ...list.filter((x) => x.id !== c.id)] : list;
    });
    return { data: order };
  }, []);

  const updateOrder = useCallback(async (id: string, input: Partial<OrderInput>): Promise<Result<Order>> => {
    const { data, error: err } = await supabase.from('orders').update(input).eq('id', id).select('*').single();
    if (err) return { error: message(err, 'Die Änderungen konnten nicht gespeichert werden.') };
    const order = toOrder(data as Record<string, unknown>);
    setOrders((list) => [order, ...list.filter((o) => o.id !== id)]);
    return { data: order };
  }, []);

  const deleteOrder = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('orders').delete().eq('id', id);
    if (err) return { error: message(err, 'Der Auftrag konnte nicht gelöscht werden.') };
    setOrders((list) => list.filter((o) => o.id !== id));
    return {};
  }, []);

  const value = useMemo<CrmState>(
    () => ({
      customers,
      orders,
      loading,
      error,
      reload,
      createCustomer,
      updateCustomer,
      deleteCustomer,
      createOrder,
      updateOrder,
      deleteOrder,
      customerById: (id) => customers.find((c) => c.id === id),
      ordersFor: (customerId) => orders.filter((o) => o.customer_id === customerId),
    }),
    [customers, orders, loading, error, reload, createCustomer, updateCustomer, deleteCustomer, createOrder, updateOrder, deleteOrder],
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm(): CrmState {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error('useCrm muss innerhalb von CrmProvider verwendet werden');
  return ctx;
}
