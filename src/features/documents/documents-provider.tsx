import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { Customer, Order } from '@/features/crm/crm-provider';
import { supabase } from '@/lib/supabase';

import {
  addDays,
  computeTotals,
  EMPTY_SELLER,
  todayIso,
  type DocumentData,
  type DocumentKind,
  type LineItem,
  type Seller,
} from './document-logic';
import type { LogoImage } from './logo-logic';

export type StoredDocument = {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  kind: DocumentKind;
  number: string;
  issued_on: string;
  due_on: string | null;
  total: number;
  data: DocumentData;
  paid_at: string | null;
  created_at: string;
};

export type ServiceInfo = { date: string | null; period: { from: string; to: string } | null };

export type StoredLogo = LogoImage & { id: string };

type State = {
  seller: Seller;
  /** true, sobald schon einmal Firmendaten gespeichert wurden */
  hasSettings: boolean;
  documents: StoredDocument[];
  loading: boolean;
  error: 'setup' | 'failed' | null;
  saveSeller: (values: Partial<Seller>) => Promise<{ error?: string }>;
  issue: (kind: DocumentKind, order: Order, customer: Customer, service?: ServiceInfo) => Promise<{ data?: StoredDocument; error?: string }>;
  setPaid: (id: string, paid: boolean) => Promise<{ error?: string }>;
  documentsFor: (orderId: string) => StoredDocument[];
  /** Aktuelles Firmenlogo */
  logo: StoredLogo | null;
  uploadLogo: (image: LogoImage) => Promise<{ error?: string }>;
  removeLogo: () => Promise<{ error?: string }>;
  /** Logo, das beim Erstellen eines Dokuments galt (für dessen PDF) */
  logoFor: (doc: { data: DocumentData }) => Promise<LogoImage | null>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST205', '42P01', 'PGRST106', 'PGRST202'];

const SELLER_KEYS = Object.keys(EMPTY_SELLER) as (keyof Seller)[];

function toSeller(row: Record<string, unknown> | null): Seller {
  if (!row) return { ...EMPTY_SELLER };
  const s = { ...EMPTY_SELLER } as Record<string, unknown>;
  for (const k of SELLER_KEYS) if (row[k] !== undefined && row[k] !== null) s[k] = row[k];
  s.vat_rate = Number(s.vat_rate);
  return s as Seller;
}

function toDocument(row: Record<string, unknown>): StoredDocument {
  return { ...(row as unknown as StoredDocument), total: Number(row.total) };
}

const LOGO_MISSING = [...MISSING, 'PGRST204', '42703'];

function logoErrorText(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && LOGO_MISSING.includes(error.code)) {
    return 'Das Logo kann noch nicht gespeichert werden: Das Datenbank-Skript fürs Firmenlogo fehlt (20261105090000_business_logo.sql, siehe supabase/README.md).';
  }
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

async function fetchLogo(id: string): Promise<LogoImage | null> {
  const { data, error } = await supabase.from('business_logos').select('mime, data, width, height').eq('id', id).maybeSingle();
  if (error) console.warn('[Logo]', error);
  return (data as LogoImage | null) ?? null;
}

function errorText(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code && MISSING.includes(error.code)) {
    return 'Angebote und Rechnungen sind noch nicht eingerichtet: Das Datenbank-Skript dafür fehlt (siehe supabase/README.md).';
  }
  return `${fallback}\n\nTechnische Details: ${error.message ?? 'unbekannt'}`;
}

/** Die Positionen eines Dokuments – aus dem Auftrag übernommen. */
export function itemsFromOrder(order: Order): LineItem[] {
  return [
    {
      description: order.title,
      details: order.description,
      quantity: 1,
      unit: order.billing === 'monthly' ? 'Monat' : 'pauschal',
      unit_price: order.price ?? 0,
    },
  ];
}

export function buildDocumentData(kind: DocumentKind, seller: Seller, order: Order, customer: Customer, service?: ServiceInfo): DocumentData {
  const items = itemsFromOrder(order);
  return {
    kind,
    seller,
    buyer: { name: customer.name, company: customer.company, address: customer.address, email: customer.email },
    items,
    totals: computeTotals(items, order.discount_percent, seller.small_business, seller.vat_rate),
    small_business: seller.small_business,
    service_date: kind === 'invoice' ? (service?.date ?? null) : null,
    service_period: kind === 'invoice' ? (service?.period ?? null) : null,
    monthly: order.billing === 'monthly',
  };
}

async function fetchAll() {
  const [s, d] = await Promise.all([
    supabase.from('business_settings').select('*').maybeSingle(),
    supabase.from('documents').select('*').order('created_at', { ascending: false }),
  ]);
  return { settings: s.data as Record<string, unknown> | null, documents: (d.data ?? []).map(toDocument), error: s.error ?? d.error };
}

/** Firmendaten, Angebote und Rechnungen des angemeldeten Nutzers. */
export function DocumentsProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [seller, setSeller] = useState<Seller>({ ...EMPTY_SELLER });
  const [hasSettings, setHasSettings] = useState(false);
  const [documents, setDocuments] = useState<StoredDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<State['error']>(null);
  const [logo, setLogo] = useState<StoredLogo | null>(null);
  /** Geladene Logos nach id (auch ältere Versionen für ältere Dokumente) */
  const logoCache = useRef(new Map<string, LogoImage | null>());

  useEffect(() => {
    let active = true;
    fetchAll().then(async (r) => {
      if (!active) return;
      if (r.error) {
        console.warn('[Dokumente]', r.error);
        setError(MISSING.includes(r.error.code) ? 'setup' : 'failed');
      } else {
        const s = toSeller(r.settings);
        const current = s.logo_id ? await fetchLogo(s.logo_id) : null;
        if (!active) return;
        if (s.logo_id) logoCache.current.set(s.logo_id, current);
        setLogo(s.logo_id && current ? { ...current, id: s.logo_id } : null);
        setSeller(s);
        setHasSettings(!!r.settings);
        setDocuments(r.documents);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const saveSeller = useCallback(
    async (values: Partial<Seller>) => {
      const { data, error: err } = await supabase
        .from('business_settings')
        .upsert({ user_id: userId, ...values }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (err) return { error: errorText(err, 'Die Firmendaten konnten nicht gespeichert werden.') };
      setSeller(toSeller(data as Record<string, unknown>));
      setHasSettings(true);
      setError(null);
      return {};
    },
    [userId],
  );

  const issue = useCallback<State['issue']>(
    async (kind, order, customer, service) => {
      const data = buildDocumentData(kind, seller, order, customer, service);
      const today = todayIso();
      const due = kind === 'invoice' ? addDays(today, seller.payment_days) : addDays(today, seller.offer_validity_days);
      const { data: row, error: err } = await supabase.rpc('issue_document', {
        p_order_id: order.id,
        p_kind: kind,
        p_data: data,
        p_total: data.totals.gross,
        p_due_on: due,
      });
      if (err) return { error: errorText(err, `${kind === 'invoice' ? 'Die Rechnung' : 'Das Angebot'} konnte nicht erstellt werden.`) };
      const doc = toDocument(row as Record<string, unknown>);
      setDocuments((list) => [doc, ...list]);
      return { data: doc };
    },
    [seller],
  );

  const setPaid = useCallback(async (id: string, paid: boolean) => {
    const { data, error: err } = await supabase
      .from('documents')
      .update({ paid_at: paid ? new Date().toISOString() : null })
      .eq('id', id)
      .select('*')
      .single();
    if (err) return { error: errorText(err, 'Das hat nicht geklappt.') };
    const doc = toDocument(data as Record<string, unknown>);
    setDocuments((list) => list.map((d) => (d.id === id ? doc : d)));
    return {};
  }, []);

  const logoFor = useCallback(async (doc: { data: DocumentData }) => {
    const id = doc.data.seller?.logo_id;
    if (!id) return null;
    const cache = logoCache.current;
    if (cache.has(id)) return cache.get(id) ?? null;
    const found = await fetchLogo(id);
    cache.set(id, found);
    return found;
  }, []);

  /** Alte Logo-Version löschen – aber nur, wenn kein Dokument sie noch braucht. */
  const cleanupLogo = useCallback(
    async (id: string | null) => {
      if (!id || documents.some((d) => d.data.seller?.logo_id === id)) return;
      const { error: err } = await supabase.from('business_logos').delete().eq('id', id);
      if (!err) logoCache.current.delete(id);
    },
    [documents],
  );

  const setLogoId = useCallback(
    async (logoId: string | null) =>
      supabase.from('business_settings').upsert({ user_id: userId, logo_id: logoId }, { onConflict: 'user_id' }).select('*').single(),
    [userId],
  );

  const uploadLogo = useCallback(
    async (image: LogoImage) => {
      const previous = seller.logo_id;
      const { data: row, error: err } = await supabase
        .from('business_logos')
        .insert({ mime: image.mime, data: image.data, width: image.width, height: image.height })
        .select('id')
        .single();
      if (err || !row) return { error: logoErrorText(err ?? {}, 'Das Logo konnte nicht gespeichert werden.') };
      const id = (row as { id: string }).id;
      const { data: settings, error: err2 } = await setLogoId(id);
      if (err2) {
        await supabase.from('business_logos').delete().eq('id', id);
        return { error: logoErrorText(err2, 'Das Logo konnte nicht gespeichert werden.') };
      }
      logoCache.current.set(id, image);
      setSeller(toSeller(settings as Record<string, unknown>));
      setHasSettings(true);
      setLogo({ ...image, id });
      await cleanupLogo(previous);
      return {};
    },
    [seller.logo_id, setLogoId, cleanupLogo],
  );

  const removeLogo = useCallback(async () => {
    const previous = seller.logo_id;
    const { data: settings, error: err } = await setLogoId(null);
    if (err) return { error: logoErrorText(err, 'Das Logo konnte nicht entfernt werden.') };
    setSeller(toSeller(settings as Record<string, unknown>));
    setLogo(null);
    await cleanupLogo(previous);
    return {};
  }, [seller.logo_id, setLogoId, cleanupLogo]);

  const value = useMemo<State>(
    () => ({
      seller,
      hasSettings,
      documents,
      loading,
      error,
      saveSeller,
      issue,
      setPaid,
      documentsFor: (orderId) => documents.filter((d) => d.order_id === orderId),
      logo,
      uploadLogo,
      removeLogo,
      logoFor,
    }),
    [seller, hasSettings, documents, loading, error, saveSeller, issue, setPaid, logo, uploadLogo, removeLogo, logoFor],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDocuments(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useDocuments muss innerhalb von DocumentsProvider verwendet werden');
  return ctx;
}

/** Status einer Rechnung: offen, überfällig oder bezahlt. */
export function invoiceState(doc: StoredDocument, today = todayIso()): 'paid' | 'overdue' | 'open' {
  if (doc.paid_at) return 'paid';
  if (doc.due_on && doc.due_on < today) return 'overdue';
  return 'open';
}
