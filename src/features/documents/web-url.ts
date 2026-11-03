import { webBaseUrl } from './offer-link';

/** Adresse der App im Internet (für Kunden-Links) – null, wenn nicht eingerichtet */
export const WEB_URL = webBaseUrl(
  process.env.EXPO_PUBLIC_WEB_URL,
  typeof window !== 'undefined' && window.location ? window.location : undefined,
);
