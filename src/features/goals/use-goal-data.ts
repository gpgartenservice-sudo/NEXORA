import { useMemo } from 'react';

import { useCrm } from '@/features/crm/crm-provider';
import { useSocial } from '@/features/social/social-provider';

import { goalProgress, type Goal, type GoalData } from './goals-logic';

/** Zahlen, aus denen der Fortschritt der Ziele kommt */
export function useGoalData(): GoalData {
  const { orders, customers } = useCrm();
  const { posts } = useSocial();
  return useMemo(() => ({ orders, customers, posts }), [orders, customers, posts]);
}

/** Aktive Ziele mit Fortschritt (heute) */
export function useGoalProgress(goals: Goal[], today: string) {
  const data = useGoalData();
  return useMemo(() => {
    const now = new Date(`${today}T12:00:00`);
    return goals.filter((g) => !g.archived).map((goal) => ({ goal, progress: goalProgress(goal, data, now) }));
  }, [goals, data, today]);
}
