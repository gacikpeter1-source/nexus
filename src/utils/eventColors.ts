/**
 * Shared calendar event color mapping — keeps month view and week view
 * consistent. `category` (semantically correct, but only ever set on
 * nomination-derived pseudo-events) takes priority over `type` (the field
 * CreateEvent.tsx's dropdown actually writes: training|match|tournament|
 * meeting|<custom text>).
 */

const COLOR_BY_KEY: Record<string, string> = {
  training: 'bg-chart-purple',
  practice: 'bg-chart-purple',
  match: 'bg-chart-green',
  game: 'bg-chart-green',
  tournament: 'bg-chart-yellow',
  meeting: 'bg-chart-blue',
  testing: 'bg-chart-cyan',
  custom: 'bg-chart-cyan',
};

const FALLBACK_COLOR = 'bg-chart-cyan';

export function getEventColorClass(event: { category?: string; type?: string }): string {
  const key = event.category || event.type;
  if (!key) return FALLBACK_COLOR;
  return COLOR_BY_KEY[key] || FALLBACK_COLOR;
}
