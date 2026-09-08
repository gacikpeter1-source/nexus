/**
 * Provisional attendance derived from RSVP — used wherever no explicit
 * attendance record exists yet for an event, so a session doesn't count as
 * "unrecorded" just because a trainer hasn't opened Attend and tapped
 * anything. A confirmed RSVP counts as present, a decline counts as
 * absent; no response (or "maybe") stays unmarked rather than penalizing
 * someone who simply hasn't replied yet. Staff can always override by
 * marking real attendance in AttendTab afterward — that always wins.
 */

import type { Event } from '../types';
import type { AttendanceStatus } from '../types/attendance';
import { getEffectiveResponses } from '../services/firebase/events';

// confirmed > maybe > declined — used when multiple parents RSVPed for the same child
export function mergeRsvp(rsvps: (string | undefined)[]): string | undefined {
  if (rsvps.includes('confirmed')) return 'confirmed';
  if (rsvps.includes('maybe')) return 'maybe';
  if (rsvps.includes('declined')) return 'declined';
  return undefined;
}

/**
 * The RSVP a person effectively has for one occurrence of an event — their
 * own response if they're a direct athlete (no parent on record), or
 * merged from their parent(s)' response if they're a child account
 * (respecting a parent's forAthletes filter when they RSVP'd for specific
 * children only). Reads per-occurrence overrides on a recurring event via
 * getEffectiveResponses, not just the series-wide response.
 */
export function getAthleteRsvp(
  athleteId: string,
  event: Event,
  athleteParentMap: Record<string, string[]>
): string | undefined {
  const responses = getEffectiveResponses(event, event.date);
  const parentIds = athleteParentMap[athleteId] || [];
  if (parentIds.length === 0) {
    return responses[athleteId]?.response;
  }
  const rsvps = parentIds.map(pid => {
    const r = responses[pid];
    if (!r) return undefined;
    if (r.forAthletes && r.forAthletes.length > 0 && !r.forAthletes.includes(athleteId)) {
      return undefined;
    }
    return r.response;
  });
  return mergeRsvp(rsvps);
}

/** Maps an RSVP to a provisional attendance status — undefined means "leave unmarked". */
export function deriveAttendanceStatus(rsvp: string | undefined): AttendanceStatus | undefined {
  if (rsvp === 'confirmed') return 'present';
  if (rsvp === 'declined') return 'absent';
  return undefined;
}
