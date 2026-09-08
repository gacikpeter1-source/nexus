/**
 * Expands recurring calendar events into individual dated occurrences
 * within a date range — shared by AttendTab (listing sessions to mark) and
 * StatsTab (deriving provisional attendance from RSVPs). Kept as one
 * function so both read exactly the same set of occurrences for a team.
 */

import type { Event } from '../types';
import { localDateStr } from './dateUtils';

export function expandEvents(base: Event[], from: Date, to: Date): Event[] {
  const out: Event[] = [];
  for (const ev of base) {
    const exceptions = ev.exceptions || [];
    const bd = new Date(ev.date + 'T00:00:00');
    if (bd >= from && bd <= to && !exceptions.includes(ev.date)) out.push(ev);
    if (!ev.isRecurring || !ev.recurrenceRule) continue;

    const rule = ev.recurrenceRule;
    const maxDate = rule.endDate
      ? new Date(Math.min(new Date(rule.endDate + 'T00:00:00').getTime(), to.getTime()))
      : to;
    const maxCount = rule.count ?? Infinity;
    let count = 1;
    const cur = new Date(ev.date + 'T00:00:00');

    if (rule.frequency === 'weekly' && rule.daysOfWeek?.length) {
      cur.setDate(cur.getDate() + 1);
      while (cur <= maxDate && count < maxCount) {
        if (rule.daysOfWeek.includes(cur.getDay())) {
          const ds = localDateStr(cur);
          if (cur >= from && !exceptions.includes(ds)) out.push({ ...ev, date: ds });
          count++;
        }
        cur.setDate(cur.getDate() + 1);
      }
    } else {
      const advance = () => {
        if (rule.frequency === 'daily') cur.setDate(cur.getDate() + rule.interval);
        else if (rule.frequency === 'weekly') cur.setDate(cur.getDate() + 7 * rule.interval);
        else cur.setMonth(cur.getMonth() + rule.interval);
      };
      advance();
      while (cur <= maxDate && count < maxCount) {
        const ds = localDateStr(cur);
        if (cur >= from && !exceptions.includes(ds)) out.push({ ...ev, date: ds });
        count++;
        advance();
      }
    }
  }
  return out;
}
