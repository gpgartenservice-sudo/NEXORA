import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { Linking, Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import type { PaidTier } from './plan-logic';

/**
 * Server-Funktion "billing" (Stripe): Bezahlseite bzw. Kundenportal öffnen.
 * Die Seite öffnet sich im Browser (Mac-App: im Standard-Browser). Nach der Zahlung
 * meldet Stripe das Abo an Supabase; die App lädt es neu, sobald du zurückkommst.
 */
export type BillingInterval = 'month' | 'year';
type Reply = { error?: string };

const SETUP = 'Bezahlen ist auf dem Server noch nicht fertig eingerichtet (Anleitung: supabase/README.md, Abschnitt 14).';

/**
 * Im Browser den neuen Tab sofort beim Klick öffnen – nach dem Warten auf den Server
 * würden Safari & Co. ihn als Pop-up blockieren. Mac-App: öffnet im Standard-Browser.
 */
function prepareTab(): Window | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  if ((window as unknown as { nexoraDesktop?: unknown }).nexoraDesktop) return null;
  const tab = window.open('about:blank', '_blank');
  if (tab) tab.opener = null;
  return tab;
}

async function open(body: Record<string, unknown>): Promise<Reply> {
  const tab = prepareTab();
  const reply = await request(body);
  if (reply.error || !reply.url) {
    tab?.close();
    return { error: reply.error ?? 'Das hat gerade nicht geklappt. Versuch es noch einmal.' };
  }
  if (tab) tab.location.href = reply.url;
  else await Linking.openURL(reply.url);
  return {};
}

async function request(body: Record<string, unknown>): Promise<Reply & { url?: string }> {
  const { data, error } = await supabase.functions.invoke('billing', { body });
  if (!error) {
    const url = (data as { url?: unknown } | null)?.url;
    return typeof url === 'string' && url.startsWith('https://') ? { url } : {};
  }
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let code: string | undefined;
    let detail: string | undefined;
    try {
      const b = await res.json();
      code = b?.error;
      detail = typeof b?.detail === 'string' ? b.detail : typeof b?.lookup_key === 'string' ? b.lookup_key : undefined;
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 404 && code === 'no_customer')
      return {
        error:
          'Dein Abo wurde nicht über Stripe abgeschlossen (z. B. von Hand freigeschaltet). Für Änderungen schreib uns einfach.',
      };
    if (res.status === 409 && code === 'store_plan')
      return {
        error:
          'Dein Abo läuft über den App Store bzw. Google Play. Ändern oder kündigen kannst du es dort – auf dem Handy, mit dem du es abgeschlossen hast. Ein zweites Abo brauchst du nicht.',
      };
    if (res.status === 409 && code === 'admin_plan')
      return { error: 'Dein Konto hat einen Admin-Zugang – dafür wird nichts abgebucht.' };
    if (res.status === 404) return { error: SETUP };
    if (code === 'stripe_not_configured' || code === 'invalid_stripe_key') return { error: SETUP };
    if (code === 'price_missing')
      return { error: `${SETUP}\n\nIn Stripe fehlt der Preis mit dem Lookup-Key „${detail ?? '?'}“.` };
    if (res.status === 401) return { error: 'Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.' };
    return {
      error: `Das hat gerade nicht geklappt. Versuch es noch einmal.\n\nTechnische Details: ${res.status} ${code ?? ''}${detail ? ` – ${detail}` : ''}`.trim(),
    };
  }
  if (error instanceof FunctionsFetchError)
    return {
      error:
        'Der Bezahl-Server antwortet nicht. Prüfe deine Internetverbindung – oder die Server-Funktion „billing“ ist in Supabase noch nicht angelegt (supabase/README.md, Abschnitt 14).',
    };
  return { error: `Das hat gerade nicht geklappt.\n\nTechnische Details: ${String(error.message ?? error)}` };
}

/** Bezahlseite von Stripe öffnen (läuft schon ein Abo: Kundenportal zum Wechseln) */
export const startCheckout = (tier: PaidTier, interval: BillingInterval) => open({ mode: 'checkout', tier, interval });

/** Stripe-Kundenportal: kündigen, Stufe wechseln, Zahlungsart, Rechnungen */
export const openBillingPortal = () => open({ mode: 'portal' });
