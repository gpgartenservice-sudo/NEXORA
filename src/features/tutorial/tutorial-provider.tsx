import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, StyleSheet, View, type HostInstance } from 'react-native';

import { useProfile } from '@/providers/profile-provider';

import { TUTORIALS, type TutorialId } from './tutorial-content';
import { cleanDone, nextInTour, shouldAutoStart, visibleSteps, withDone } from './tutorial-logic';
import { TutorialOverlay } from './tutorial-overlay';

export type ActiveTutorial = {
  id: TutorialId;
  index: number;
  /** Teil des Rundgangs durch alle Bereiche */
  tour: boolean;
  /** automatisch beim ersten Besuch gestartet */
  auto: boolean;
};

type Prefs = { done: TutorialId[]; off: boolean };

type State = {
  /** Profil geladen – erst dann wird automatisch gestartet */
  ready: boolean;
  off: boolean;
  done: TutorialId[];
  active: ActiveTutorial | null;
  start: (id: TutorialId, options?: { tour?: boolean; auto?: boolean }) => void;
  /** Beim ersten Besuch eines Bereichs (nur wenn noch nicht gesehen und nicht abgeschaltet) */
  autoStart: (id: TutorialId) => void;
  step: (delta: 1 | -1) => void;
  /** Letzter Schritt: als gesehen merken; im Rundgang weiter zum nächsten Bereich */
  finish: (continueTour?: boolean) => void;
  /** Überspringen bzw. Rundgang beenden */
  close: () => void;
  /** Nicht mehr automatisch zeigen */
  stopAuto: () => void;
  setOff: (off: boolean) => void;
  /** Alle Einführungen wieder als „neu“ markieren */
  reset: () => void;
  register: (target: string, ref: RefObject<HostInstance | null>) => () => void;
  /** registrierte Stellen (für die Hervorhebung) */
  targets: Map<string, Set<RefObject<HostInstance | null>>>;
};

const Ctx = createContext<State | null>(null);
const LOCAL_KEY = 'nexora.tutorials';

/** Ersatzspeicher, solange die Spalten in der Datenbank fehlen (nur im Browser/auf dem Mac) */
function loadLocal(): Prefs {
  if (Platform.OS !== 'web') return { done: [], off: false };
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(LOCAL_KEY) ?? 'null') as Partial<Prefs> | null;
    return { done: cleanDone(raw?.done), off: raw?.off === true };
  } catch {
    return { done: [], off: false };
  }
}
function saveLocal(p: Prefs) {
  if (Platform.OS !== 'web') return;
  try {
    globalThis.localStorage?.setItem(LOCAL_KEY, JSON.stringify(p));
  } catch {
    // privater Modus o. ä. – dann eben nur für diese Sitzung
  }
}

/** Einführungen: Zustand, Speichern (Profil, sonst lokal) und die Hervorhebung über der App. */
export function TutorialProvider({ children }: { children: ReactNode }) {
  const { profile, loading, save } = useProfile();
  const [override, setOverride] = useState<Prefs | null>(null);
  const [dbFailed, setDbFailed] = useState(false);
  const [local] = useState(loadLocal);
  const [active, setActive] = useState<ActiveTutorial | null>(null);
  const [version, setVersion] = useState(0);
  const [targets] = useState(() => new Map<string, Set<RefObject<HostInstance | null>>>());

  // Spalten vorhanden? (fehlt das Skript, liefert die Datenbank sie nicht mit)
  const dbMode = !!profile && 'tutorials_done' in profile && !dbFailed;
  const prefs: Prefs =
    override ?? (dbMode ? { done: cleanDone(profile?.tutorials_done), off: profile?.tutorials_off === true } : local);
  const ready = !loading;

  // immer der aktuelle Stand (für Zeitgeber und Knöpfe)
  const latest = useRef({ prefs, active, ready });
  useEffect(() => {
    latest.current = { prefs, active, ready };
  });

  const persist = useCallback(
    async (next: Prefs) => {
      setOverride(next);
      saveLocal(next);
      if (!dbMode) return;
      const { error } = await save({ tutorials_done: next.done, tutorials_off: next.off });
      if (error) setDbFailed(true);
    },
    [dbMode, save],
  );

  const markDone = useCallback(
    (id: TutorialId, extra?: Partial<Prefs>) => {
      const p = latest.current.prefs;
      const next = { done: withDone(p.done, id), off: p.off, ...extra };
      if (next.off === p.off && next.done.length === p.done.length) return;
      void persist(next);
    },
    [persist],
  );

  const start = useCallback((id: TutorialId, options?: { tour?: boolean; auto?: boolean }) => {
    setActive({ id, index: 0, tour: !!options?.tour, auto: !!options?.auto });
  }, []);

  const autoStart = useCallback(
    (id: TutorialId) => {
      const { prefs: p, active: a, ready: r } = latest.current;
      if (!shouldAutoStart(id, { ready: r, off: p.off, done: p.done, active: !!a })) return;
      // ganz neu: die Startseite führt als Rundgang durch alle Bereiche
      start(id, { auto: true, tour: id === 'home' && p.done.length === 0 });
    },
    [start],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      setActive((a) => {
        if (!a) return a;
        const count = visibleSteps(TUTORIALS[a.id].steps, (t) => targets.has(t)).length;
        return { ...a, index: Math.max(0, Math.min(count - 1, a.index + delta)) };
      });
    },
    [targets],
  );

  const finish = useCallback(
    (continueTour = true) => {
      const a = latest.current.active;
      if (!a) return;
      markDone(a.id);
      const next = a.tour && continueTour ? nextInTour(a.id) : null;
      const href = next ? TUTORIALS[next].href : null;
      if (next && href) {
        setActive({ id: next, index: 0, tour: true, auto: false });
        router.navigate(href);
      } else {
        setActive(null);
      }
    },
    [markDone],
  );

  const close = useCallback(() => {
    const a = latest.current.active;
    if (a) markDone(a.id);
    setActive(null);
  }, [markDone]);

  const stopAuto = useCallback(() => {
    const a = latest.current.active;
    if (a) markDone(a.id, { off: true });
    else void persist({ ...latest.current.prefs, off: true });
    setActive(null);
  }, [markDone, persist]);

  const setOff = useCallback((off: boolean) => void persist({ ...latest.current.prefs, off }), [persist]);
  const reset = useCallback(() => void persist({ done: [], off: false }), [persist]);

  const register = useCallback(
    (target: string, ref: RefObject<HostInstance | null>) => {
      const set = targets.get(target) ?? new Set();
      set.add(ref);
      targets.set(target, set);
      setVersion((v) => v + 1);
      return () => {
        set.delete(ref);
        if (!set.size) targets.delete(target);
        setVersion((v) => v + 1);
      };
    },
    [targets],
  );

  const value = useMemo<State>(
    () => ({
      ready,
      off: prefs.off,
      done: prefs.done,
      active,
      start,
      autoStart,
      step,
      finish,
      close,
      stopAuto,
      setOff,
      reset,
      register,
      targets,
    }),
    [
      ready,
      prefs.off,
      prefs.done,
      active,
      start,
      autoStart,
      step,
      finish,
      close,
      stopAuto,
      setOff,
      reset,
      register,
      targets,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      <View style={styles.root}>
        {children}
        {active && <TutorialOverlay active={active} version={version} />}
      </View>
    </Ctx.Provider>
  );
}

export function useTutorial(): State {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTutorial muss innerhalb von TutorialProvider verwendet werden');
  return ctx;
}

/** Ohne Provider (z. B. Seiten außerhalb des App-Rahmens) einfach nichts tun */
export function useOptionalTutorial(): State | null {
  return useContext(Ctx);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
