import { getRandomBytes } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { sendInviteMail } from '@/features/documents/mail-api';
import { offerToken } from '@/features/documents/offer-link';
import { supabase } from '@/lib/supabase';

import { inviteExpiry, type CustomerInvite } from './invite-logic';
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

/** Absender der E-Mail mit dem Datenschutz-Link (aus den Firmendaten) */
export type InviteSender = { fromName: string; replyTo: string | null };

type CrmState = {
  customers: Customer[];
  orders: Order[];
  loading: boolean;
  /** 'setup' = Tabellen fehlen (Datenbank-Skript noch nicht ausgeführt) */
  error: 'setup' | 'failed' | null;
  reload: () => Promise<void>;
  /** Neu laden ohne Ladeanzeige (z. B. wenn die Kundenliste wieder sichtbar wird) */
  refresh: () => Promise<void>;
  /** Offene Datenschutz-Links (Kunde hat seine Daten noch nicht eingetragen) */
  invites: CustomerInvite[];
  /** false = Datenbank-Skript für die Links fehlt noch */
  invitesReady: boolean;
  inviteCustomer: (email: string, sender: InviteSender) => Promise<Result<CustomerInvite>>;
  resendInvite: (id: string, sender: InviteSender) => Promise<Result<CustomerInvite>>;
  deleteInvite: (id: string) => Promise<Result>;
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

const INVITE_COLUMNS = 'id, email, created_at, sent_at, expires_at';

async function fetchAll() {
  const [c, o, i] = await Promise.all([
    supabase.from('customers').select('*').order('updated_at', { ascending: false }),
    supabase.from('orders').select('*').order('updated_at', { ascending: false }),
    supabase
      .from('customer_invites')
      .select(INVITE_COLUMNS)
      .is('completed_at', null)
      .order('created_at', { ascending: false }),
  ]);
  // Fehlt nur das Skript für die Datenschutz-Links, läuft der Rest trotzdem
  if (i.error && !MISSING_TABLE.includes(i.error.code)) console.warn('[CRM] Einladungen', i.error);
  return {
    customers: (c.data ?? []) as Customer[],
    orders: (o.data ?? []).map(toOrder),
    invites: (i.data ?? []) as CustomerInvite[],
    invitesReady: !i.error,
    error: c.error ?? o.error,
  };
}

function inviteMessage(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING_TABLE.includes(error.code))
    return 'Für den Datenschutz-Link fehlt noch das Datenbank-Skript 20261119090000_customer_invites.sql (siehe supabase/README.md).';
  if (error.code === '23505') return 'Für diese E-Mail-Adresse läuft schon ein Link – du kannst ihn in der Kundenliste erneut senden.';
  if (error.code === '23514') return 'Bitte prüfe die E-Mail-Adresse.';
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

/**
 * Lädt Kunden und Aufträge des angemeldeten Nutzers und speichert Änderungen.
 * Neue Kunden gibt es nur über den Datenschutz-Link (inviteCustomer): Der Kunde
 * trägt seine Daten selbst ein, erst dann legt die Datenbank ihn an.
 */
export function CrmProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CrmState['error']>(null);
  const [invites, setInvites] = useState<CustomerInvite[]>([]);
  const [invitesReady, setInvitesReady] = useState(true);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchAll>>) => {
    if (result.error) {
      console.warn('[CRM]', result.error);
      setError(MISSING_TABLE.includes(result.error.code) ? 'setup' : 'failed');
    } else {
      setError(null);
      setCustomers(result.customers);
      setOrders(result.orders);
      setInvites(result.invites);
      setInvitesReady(result.invitesReady);
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

  const refresh = useCallback(async () => {
    apply(await fetchAll());
  }, [apply]);

  // Link verschicken und Versandzeit vermerken
  const send = useCallback(async (invite: CustomerInvite, sender: InviteSender): Promise<Result<CustomerInvite>> => {
    const mail = await sendInviteMail({ inviteId: invite.id, fromName: sender.fromName, replyTo: sender.replyTo });
    if (mail.error) return { error: mail.error };
    const { data } = await supabase
      .from('customer_invites')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', invite.id)
      .select(INVITE_COLUMNS)
      .single();
    const sent = (data as CustomerInvite | null) ?? { ...invite, sent_at: new Date().toISOString() };
    setInvites((list) => [sent, ...list.filter((x) => x.id !== invite.id)]);
    return { data: sent };
  }, []);

  const inviteCustomer = useCallback(
    async (email: string, sender: InviteSender): Promise<Result<CustomerInvite>> => {
      const token = offerToken((n) => getRandomBytes(n));
      const { data, error: err } = await supabase
        .from('customer_invites')
        .insert({ email: email.trim(), token })
        .select(INVITE_COLUMNS)
        .single();
      if (err || !data) return { error: inviteMessage(err ?? {}, 'Der Link konnte nicht angelegt werden.') };
      const invite = data as CustomerInvite;
      const result = await send(invite, sender);
      // Nicht verschickt -> nichts aufheben (sonst hinge eine E-Mail-Adresse ohne Link herum)
      if (result.error) await supabase.from('customer_invites').delete().eq('id', invite.id);
      return result;
    },
    [send],
  );

  const resendInvite = useCallback(
    async (id: string, sender: InviteSender): Promise<Result<CustomerInvite>> => {
      // wieder 30 Tage gültig (das Datum steht in der E-Mail)
      const { data, error: err } = await supabase
        .from('customer_invites')
        .update({ expires_at: inviteExpiry(new Date()) })
        .eq('id', id)
        .select(INVITE_COLUMNS)
        .single();
      if (err || !data) return { error: inviteMessage(err ?? {}, 'Der Link konnte nicht erneut verschickt werden.') };
      return send(data as CustomerInvite, sender);
    },
    [send],
  );

  const deleteInvite = useCallback(async (id: string): Promise<Result> => {
    const { error: err } = await supabase.from('customer_invites').delete().eq('id', id);
    if (err) return { error: inviteMessage(err, 'Der Link konnte nicht gelöscht werden.') };
    setInvites((list) => list.filter((x) => x.id !== id));
    return {};
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
      refresh,
      invites,
      invitesReady,
      inviteCustomer,
      resendInvite,
      deleteInvite,
      updateCustomer,
      deleteCustomer,
      createOrder,
      updateOrder,
      deleteOrder,
      customerById: (id) => customers.find((c) => c.id === id),
      ordersFor: (customerId) => orders.filter((o) => o.customer_id === customerId),
    }),
    [
      customers,
      orders,
      loading,
      error,
      reload,
      refresh,
      invites,
      invitesReady,
      inviteCustomer,
      resendInvite,
      deleteInvite,
      updateCustomer,
      deleteCustomer,
      createOrder,
      updateOrder,
      deleteOrder,
    ],
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm(): CrmState {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error('useCrm muss innerhalb von CrmProvider verwendet werden');
  return ctx;
}
