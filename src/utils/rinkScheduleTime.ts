/**
 * Shared time/recurrence helpers for the Rink Schedule tool — used by both
 * the staff-facing weekly overview grid and the public TV board, so "which
 * day(s) does this entry occur on" is computed the same way in both places.
 */

import type { RinkScheduleEntry } from '../types';

type DraftEntry = Omit<RinkScheduleEntry, 'teamId' | 'eventId'>;

export function timeToHours(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

export function pctInRange(h: number, rangeStart: number, rangeEnd: number): number {
  return ((h - rangeStart) / (rangeEnd - rangeStart)) * 100;
}

/**
 * Weekdays (JS getDay(): 0=Sun..6=Sat) an entry occurs on, for a
 * representative week. Does not account for a count-limited recurrence
 * having already run out — good enough for a routine weekly/season
 * schedule, not a guarantee against a rare stale display near the very end
 * of a capped series.
 */
export function weekdaysFor(entry: DraftEntry): number[] {
  if (!entry.isRecurring || !entry.recurrenceRule) {
    return [new Date(entry.date + 'T00:00:00').getDay()];
  }
  const { frequency, daysOfWeek } = entry.recurrenceRule;
  if (frequency === 'weekly' && daysOfWeek && daysOfWeek.length > 0) return daysOfWeek;
  if (frequency === 'daily') return [0, 1, 2, 3, 4, 5, 6];
  return [new Date(entry.date + 'T00:00:00').getDay()]; // monthly — anchor weekday only
}

/** Whether an entry is in effect on a given date (its own date for a one-off, or a recurring day within its active date range). */
export function isActiveOn(entry: DraftEntry, dateStr: string, dayOfWeek: number): boolean {
  if (!entry.isRecurring) return entry.date === dateStr;
  if (entry.date > dateStr) return false;
  if (entry.recurrenceRule?.endDate && entry.recurrenceRule.endDate < dateStr) return false;
  return weekdaysFor(entry).includes(dayOfWeek);
}

const PALETTE = ['#00D4FF', '#A78BFA', '#F5A623', '#4C8DFF', '#2DD4BF', '#FB7185', '#34D399', '#EAB308'];

/** Deterministic color per event name, so the same session always draws the same color. */
export function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}
