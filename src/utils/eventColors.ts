/**
 * Shared calendar event color mapping — keeps month view, week view, and the
 * list view's type badge consistent. `category` (semantically correct, but
 * only ever set on nomination-derived pseudo-events) takes priority over
 * `type` (the field CreateEvent.tsx's dropdown actually writes: training|
 * match|tournament|meeting|<custom text>).
 *
 * Class names are spelled out in full (not built with template strings) so
 * Tailwind's content scanner can actually find and generate them — a
 * dynamically-built `bg-${color}` string is invisible to it.
 */

const SOLID_BG_BY_KEY: Record<string, string> = {
  training: 'bg-chart-purple',
  practice: 'bg-chart-purple',
  match: 'bg-chart-green',
  game: 'bg-chart-green',
  leagueGame: 'bg-chart-orange',
  tournament: 'bg-chart-yellow',
  meeting: 'bg-chart-blue',
  testing: 'bg-chart-cyan',
  custom: 'bg-chart-cyan',
};

const BADGE_CLASSES_BY_KEY: Record<string, string> = {
  training: 'bg-chart-purple/20 text-chart-purple',
  practice: 'bg-chart-purple/20 text-chart-purple',
  match: 'bg-chart-green/20 text-chart-green',
  game: 'bg-chart-green/20 text-chart-green',
  leagueGame: 'bg-chart-orange/20 text-chart-orange',
  tournament: 'bg-chart-yellow/20 text-chart-yellow',
  meeting: 'bg-chart-blue/20 text-chart-blue',
  testing: 'bg-chart-cyan/20 text-chart-cyan',
  custom: 'bg-chart-cyan/20 text-chart-cyan',
};

const FALLBACK_SOLID_BG = 'bg-chart-cyan';
const FALLBACK_BADGE_CLASSES = 'bg-chart-cyan/20 text-chart-cyan';

/** Solid background — used for the month/week view event pills. */
export function getEventColorClass(event: { category?: string; type?: string }): string {
  const key = event.category || event.type;
  if (!key) return FALLBACK_SOLID_BG;
  return SOLID_BG_BY_KEY[key] || FALLBACK_SOLID_BG;
}

/** Soft background + matching text — used for the list view's event type badge. */
export function getEventBadgeClasses(event: { category?: string; type?: string }): string {
  const key = event.category || event.type;
  if (!key) return FALLBACK_BADGE_CLASSES;
  return BADGE_CLASSES_BY_KEY[key] || FALLBACK_BADGE_CLASSES;
}
