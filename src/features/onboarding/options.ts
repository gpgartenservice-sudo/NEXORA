/** Antwortmöglichkeiten im Onboarding. Die Schlüssel müssen zur Datenbank passen (supabase/migrations). */

export type Stage = 'idea' | 'started' | 'stuck' | 'growing';
export type Industry = 'craft_service' | 'ecommerce' | 'creator' | 'agency_freelance' | 'gastro' | 'consulting' | 'other';
export type Goal =
  | 'first_customers'
  | 'more_revenue'
  | 'organization'
  | 'social_growth'
  | 'finances'
  | 'motivation'
  | 'team';

export const MAX_GOALS = 3;

export const STAGES: { key: Stage; emoji: string; title: string; description: string }[] = [
  { key: 'idea', emoji: '💡', title: 'Ich will gründen', description: 'Ich habe eine Idee, weiß aber nicht, wie ich anfange.' },
  { key: 'started', emoji: '🚀', title: 'Ich habe gerade angefangen', description: 'Die ersten Schritte sind gemacht, jetzt soll es richtig losgehen.' },
  { key: 'stuck', emoji: '🧗', title: 'Ich stecke fest', description: 'Es läuft nicht so, wie ich es mir vorgestellt habe.' },
  { key: 'growing', emoji: '📈', title: 'Mein Business läuft', description: 'Ich will wachsen und mich besser organisieren.' },
];

export const INDUSTRIES: { key: Industry; emoji: string; title: string }[] = [
  { key: 'craft_service', emoji: '🛠️', title: 'Handwerk & Dienstleistung' },
  { key: 'ecommerce', emoji: '🛍️', title: 'Online-Shop' },
  { key: 'creator', emoji: '🎥', title: 'Content Creator' },
  { key: 'agency_freelance', emoji: '💻', title: 'Agentur & Freelance' },
  { key: 'gastro', emoji: '🍽️', title: 'Gastronomie' },
  { key: 'consulting', emoji: '🧠', title: 'Beratung & Coaching' },
  { key: 'other', emoji: '✨', title: 'Etwas anderes' },
];

export const GOALS: { key: Goal; emoji: string; title: string }[] = [
  { key: 'first_customers', emoji: '🤝', title: 'Erste Kunden gewinnen' },
  { key: 'more_revenue', emoji: '💶', title: 'Mehr Umsatz' },
  { key: 'organization', emoji: '🗂️', title: 'Überblick & Organisation' },
  { key: 'social_growth', emoji: '📱', title: 'Social Media wachsen' },
  { key: 'finances', emoji: '🧾', title: 'Finanzen & Steuern verstehen' },
  { key: 'motivation', emoji: '🔥', title: 'Motivation & dranbleiben' },
  { key: 'team', emoji: '👥', title: 'Team aufbauen' },
];

export const stageLabel = (key?: string | null) => STAGES.find((s) => s.key === key)?.title;
export const industryLabel = (key?: string | null) => INDUSTRIES.find((s) => s.key === key)?.title;
export const goalLabel = (key: string) => GOALS.find((g) => g.key === key)?.title ?? key;
