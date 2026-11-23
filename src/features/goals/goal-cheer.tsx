import { useEffect, useRef, useState } from 'react';

import { useGuide } from '@/features/assistant/nexy-guide';
import { useCrm } from '@/features/crm/crm-provider';
import { LunaGreetingView } from '@/features/dashboard/luna-greeting';
import { useCelebration, useMoneyShowRunning } from '@/features/dashboard/money';
import { todayIso } from '@/features/documents/document-logic';
import { useSocial } from '@/features/social/social-provider';
import { useTutorial } from '@/features/tutorial/tutorial-provider';

import { goalCheerLine, newlyReached } from './goals-logic';
import { useGoals } from './goals-provider';
import { useGoalProgress } from './use-goal-data';

type Cheer = { id: number; text: string };
let cheerId = 0;

/**
 * Ziel erreicht: Luna fliegt ins Bild, jubelt mit Konfetti und gratuliert (mit Stimme).
 * Gefeiert wird nur, was erreicht wird, während die App offen ist – nicht, was beim Öffnen
 * schon geschafft war. Läuft gerade etwas anderes (Einführung, Vorführung, Geldregen),
 * wartet der Jubel, bis es vorbei ist.
 */
export function GoalCheer() {
  const { goals, loading } = useGoals();
  const { loading: crmLoading } = useCrm();
  const { loading: socialLoading } = useSocial();
  const list = useGoalProgress(goals, todayIso());
  const tutorial = useTutorial();
  const guide = useGuide();
  const celebration = useCelebration();
  const moneyShow = useMoneyShowRunning();
  const seen = useRef<Map<string, boolean> | null>(null);
  const [queue, setQueue] = useState<Cheer[]>([]);
  // erst vergleichen, wenn alle Zahlen da sind (sonst sähe ein Umsatzziel beim Laden „neu erreicht“ aus)
  const ready = !loading && !crmLoading && !socialLoading;

  useEffect(() => {
    if (!ready) return;
    const { reached, seen: next } = newlyReached(seen.current, list);
    seen.current = next;
    if (!reached.length) return;
    const cheers = reached.map((goal) => ({ id: ++cheerId, text: goalCheerLine(goal) }));
    // nicht abbrechen: die Ziele sind schon als gesehen gemerkt, der Jubel darf nicht verloren gehen
    setTimeout(() => setQueue((q) => [...q, ...cheers]), 0);
  }, [ready, list]);

  const busy = !!tutorial.active || !!guide?.running || !!celebration || moneyShow;
  const current = queue[0];
  if (!current || busy) return null;
  return (
    <LunaGreetingView
      key={current.id}
      text={current.text}
      cheer
      onDone={() => setQueue((q) => q.filter((c) => c.id !== current.id))}
    />
  );
}
