import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { companyHeader, setCompanyHeader } from '@/lib/company-header';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/providers/profile-provider';

import { canAddCompany, chooseCompany, type Companies, type Company, companyErrorText, parseCompanies } from './company-logic';

/**
 * Mehrere Firmen in einem Konto (Skript 20261127090000_mehrere_firmen.sql): welche Firma gerade
 * offen ist, Wechseln und Anlegen. Steht über allen Daten der App – wechselt die Firma, wird
 * alles darunter neu geladen (TabsLayout: key = Firma).
 */

type State = {
  companies: Companies | null;
  /** ID der offenen Firma (= unter ihr gespeicherte Daten) */
  currentId: string;
  current: Company | null;
  /** Skript fehlt noch in der Datenbank */
  missing: boolean;
  /** noch eine gebuchte Firma frei */
  canAdd: boolean;
  switchTo: (id: string) => void;
  /** neu laden; mit ID danach diese Firma öffnen (z. B. nach dem Beitreten) */
  reload: (open?: string) => Promise<void>;
  create: (name: string) => Promise<{ id?: string; error?: string; limit?: boolean }>;
};

const Ctx = createContext<State | null>(null);
const MISSING = ['PGRST202', 'PGRST205', '42883', '42P01'];
const storeKey = (userId: string) => `nexora.company.${userId}`;

async function readStored(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(storeKey(userId));
  } catch {
    return null;
  }
}

async function writeStored(userId: string, id: string | null) {
  try {
    if (id) await AsyncStorage.setItem(storeKey(userId), id);
    else await AsyncStorage.removeItem(storeKey(userId));
  } catch {
    // nur Komfort – beim nächsten Start gilt dann die Standard-Firma
  }
}

type Loaded = { companies: Companies | null; missing: boolean; failed: boolean };

async function fetchCompanies(): Promise<Loaded> {
  const { data, error } = await supabase.rpc('my_companies');
  if (!error) return { companies: parseCompanies(data), missing: false, failed: false };
  if (MISSING.includes(String(error.code)) || /my_companies/.test(error.message ?? '')) return { companies: null, missing: true, failed: false };
  console.warn('[Firmen]', error);
  return { companies: null, missing: false, failed: true };
}

export function CompanyProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [companies, setCompanies] = useState<Companies | null>(null);
  const [missing, setMissing] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);

  // Die Kopfzeile ist zugleich die gemerkte Auswahl (nur eine andere als die Standard-Firma)
  const select = useCallback(
    (list: Companies | null, wanted: string | null) => {
      const { id, header } = chooseCompany(list, wanted, userId);
      const before = companyHeader();
      setCompanyHeader(header);
      if (header !== before) void writeStored(userId, header);
      setCurrentId(id);
    },
    [userId],
  );

  const apply = useCallback(
    (r: Loaded, wanted: string | null) => {
      if (r.failed) return false;
      setMissing(r.missing);
      // unverändert → altes Objekt behalten (sonst zeichnet sich die App bei jedem Nachsehen neu)
      setCompanies((prev) => (JSON.stringify(prev) === JSON.stringify(r.companies) ? prev : r.companies));
      select(r.companies, r.missing ? null : wanted);
      return true;
    },
    [select],
  );

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void Promise.all([readStored(userId), fetchCompanies()]).then(([stored, r]) => {
      if (!active) return;
      setCompanyHeader(stored);
      // Netzfehler: die gemerkte Firma (oder die Standard-Firma) – beim nächsten Mal wird geprüft
      if (!apply(r, stored)) select(null, r.missing ? null : stored);
    });
    return () => {
      active = false;
      setCompanyHeader(null);
    };
  }, [userId, apply, select]);

  const reload = useCallback(
    async (open?: string) => {
      apply(await fetchCompanies(), open ?? companyHeader());
    },
    [apply],
  );

  // Aus einem Team entfernt o. Ä. passiert auf anderen Geräten – beim Zurückkommen nachsehen
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void reload());
    const web = Platform.OS === 'web' && typeof window !== 'undefined';
    const onFocus = () => void reload();
    if (web) window.addEventListener('focus', onFocus);
    return () => {
      sub.remove();
      if (web) window.removeEventListener('focus', onFocus);
    };
  }, [userId, reload]);

  const switchTo = useCallback((id: string) => select(companies, id), [companies, select]);

  const create = useCallback(
    async (name: string) => {
      const { data, error } = await supabase.rpc('company_create', { p_name: name.trim() });
      if (error) return { error: companyErrorText(error.message ?? ''), limit: /company_limit/.test(error.message ?? '') };
      const id = String(data);
      await reload(id);
      return { id };
    },
    [reload],
  );

  const value = useMemo<State | null>(() => {
    if (!currentId) return null;
    return {
      companies,
      currentId,
      current: companies?.list.find((c) => c.id === currentId) ?? null,
      missing,
      canAdd: canAddCompany(companies),
      switchTo,
      reload,
      create,
    };
  }, [companies, currentId, missing, switchTo, reload, create]);

  // Erst wenn klar ist, welche Firma offen ist, Daten laden lassen
  if (!value) return <View style={styles.blank} />;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompanies(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCompanies muss innerhalb von CompanyProvider verwendet werden');
  return ctx;
}

/** Name der offenen Firma (eigene erste Firma: aus dem Profil, wie bisher) */
export function useCompanyName(): string | null {
  const { current } = useCompanies();
  const { profile } = useProfile();
  if (current && !(current.primary && current.role === 'owner')) return current.name;
  return profile?.business_name ?? null;
}

const styles = StyleSheet.create({
  blank: { flex: 1, backgroundColor: Colors.background },
});
