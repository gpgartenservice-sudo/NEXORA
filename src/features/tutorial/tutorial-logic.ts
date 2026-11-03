/**
 * Einführungen – reine Logik (ohne App, mit Unit-Tests): welche Schritte
 * gezeigt werden, wohin die Karte kommt, wie es im Rundgang weitergeht.
 */
import { TOUR, TUTORIALS, type TutorialId, type TutorialStep } from './tutorial-content';

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Schritte, die gerade gezeigt werden (optionale nur, wenn es die Stelle gibt) */
export function visibleSteps(steps: TutorialStep[], hasTarget: (id: string) => boolean): TutorialStep[] {
  return steps.filter((s) => !s.optional || (s.target ? hasTarget(s.target) : true));
}

/** Nächster Bereich im Rundgang (oder null am Ende) */
export function nextInTour(id: TutorialId): TutorialId | null {
  const i = TOUR.indexOf(id);
  return i >= 0 && i < TOUR.length - 1 ? TOUR[i + 1] : null;
}

export function isTutorialId(v: unknown): v is TutorialId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(TUTORIALS, v);
}

/** Gesehene Einführungen: nur bekannte, ohne Doppelte, in fester Reihenfolge */
export function cleanDone(list: unknown): TutorialId[] {
  if (!Array.isArray(list)) return [];
  const set = new Set(list.filter(isTutorialId));
  return (Object.keys(TUTORIALS) as TutorialId[]).filter((id) => set.has(id));
}

export function withDone(list: TutorialId[], id: TutorialId): TutorialId[] {
  return list.includes(id) ? list : cleanDone([...list, id]);
}

/** Beim ersten Besuch automatisch zeigen? */
export function shouldAutoStart(
  id: TutorialId,
  state: { ready: boolean; off: boolean; done: TutorialId[]; active: boolean },
) {
  return state.ready && !state.off && !state.active && !state.done.includes(id);
}

/** Ist die Stelle (zumindest teilweise) auf dem Bildschirm? */
export function onScreen(rect: Rect | null, view: Size): rect is Rect {
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  return rect.y + rect.height > 0 && rect.y < view.height && rect.x + rect.width > 0 && rect.x < view.width;
}

/**
 * Position der Erklär-Karte: unter der hervorgehobenen Stelle, sonst darüber,
 * sonst unten am Rand. Ohne Stelle: mittig. Schmale Bildschirme: volle Breite.
 */
export function placeCard(
  rect: Rect | null,
  card: Size,
  view: Size,
  { margin = 16, gap = 14, maxWidth = 380 } = {},
): { left: number; top: number; width: number } {
  const width = Math.max(0, Math.min(maxWidth, view.width - 2 * margin));
  const clampTop = (t: number) => Math.max(margin, Math.min(t, view.height - card.height - margin));
  if (!rect) {
    return {
      left: Math.round((view.width - width) / 2),
      top: Math.round(clampTop((view.height - card.height) / 2)),
      width,
    };
  }
  const left = Math.round(Math.max(margin, Math.min(rect.x, view.width - width - margin)));
  const below = rect.y + rect.height + gap;
  if (below + card.height <= view.height - margin) return { left, top: Math.round(below), width };
  const above = rect.y - gap - card.height;
  if (above >= margin) return { left, top: Math.round(above), width };
  return { left, top: Math.round(clampTop(view.height - card.height - margin)), width };
}

/** Rahmen um die Stelle (etwas Luft, innerhalb des Bildschirms) */
export function highlightRect(rect: Rect, view: Size, pad = 6): Rect {
  const x = Math.max(2, rect.x - pad);
  const y = Math.max(2, rect.y - pad);
  const right = Math.min(view.width - 2, rect.x + rect.width + pad);
  const bottom = Math.min(view.height - 2, rect.y + rect.height + pad);
  return { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) };
}
