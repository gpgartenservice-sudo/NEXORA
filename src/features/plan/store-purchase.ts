/**
 * Abo über App Store / Google Play – nur in den Handy-Apps (store-purchase.native.ts, Metro
 * nimmt automatisch die passende Datei). Im Browser und in der Mac-App wird mit Stripe bezahlt
 * (billing-api.ts); hier gibt es deshalb nur leere Platzhalter.
 */
import type { PaidTier } from './plan-logic';
import type { StoreInterval, StorePlatform, StoreResult } from './store-logic';

/** 'ios' / 'android' in den Handy-Apps, sonst null (Browser, Mac-App) */
export const STORE_PLATFORM: StorePlatform | null = null;

/** Preise aus dem Store (Produkt-ID -> „23,99 €“) */
export async function loadStorePrices(): Promise<Record<string, string>> {
  return {};
}

/** Abo im Store kaufen; das Ergebnis kommt erst nach der Prüfung durch den Server */
export async function buyInStore(tier: PaidTier, interval: StoreInterval, userId: string): Promise<StoreResult> {
  void tier;
  void interval;
  void userId;
  return { error: 'Im Browser und in der Mac-App bezahlst du über die Bezahlseite.' };
}

/** „Käufe wiederherstellen“ */
export async function restoreStorePurchases(): Promise<StoreResult> {
  return {};
}

/** Abo-Verwaltung des Stores öffnen (kündigen, Stufe oder Zeitraum wechseln) */
export async function openStoreSubscriptions(sku?: string | null): Promise<void> {
  void sku;
}

/** Käufe im Hintergrund annehmen (z. B. nach einem Abbruch der App) – nur in den Handy-Apps */
export function useStoreSync(userId: string, onChange: () => void): void {
  void userId;
  void onChange;
}

/** Meldungen zu Käufen, die ohne Tippen auf „Kaufen“ ankamen (z. B. „anderes Abo läuft“) */
export function onStoreNotice(fn: (result: StoreResult) => void): () => void {
  void fn;
  return () => undefined;
}
