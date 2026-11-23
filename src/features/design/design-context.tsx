import { createContext, useContext, useEffect, type ReactNode } from 'react';

import { setTextTone } from '@/constants/text-tone-store';
import { ACCENT } from '@/constants/theme';

import { DEFAULT_DESIGN, designActive, type DesignSettings } from './design-logic';

/**
 * Das gewählte Design für alle Seiten. Eigene Datei ohne weitere Abhängigkeiten,
 * damit auch Luna (nexy-avatar) es lesen kann, ohne einen Import-Kreis zu bauen.
 */
// ohne Profil (z. B. Anmelden): Luna in der Akzentfarbe, mit der die App gestartet ist
const DesignCtx = createContext<DesignSettings>({ ...DEFAULT_DESIGN, accent: ACCENT });

/** Liefert allen Seiten das gewählte Design (Gratis: klassischer Hintergrund, Luna wie gewählt). */
export function DesignProvider({ design, children }: { design: DesignSettings; children: ReactNode }) {
  const active = designActive(design);
  // graue Schrift passend zum Hintergrund (Mac/Browser sofort, Handy ab dem nächsten Öffnen)
  useEffect(() => setTextTone(active ? 'design' : 'classic'), [active]);
  return <DesignCtx.Provider value={design}>{children}</DesignCtx.Provider>;
}

export const useDesign = () => useContext(DesignCtx);
