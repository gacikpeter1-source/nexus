/**
 * useTeamAthletes — resolves a team's raw member list into athletes.
 *
 * Mirrors the athlete-resolution rule used across AttendTab/StatsTab/EventDetail:
 *   - Team member with childIds (active parent) → replaced by their child
 *     athlete account(s), filtered to children assigned to this team.
 *   - Team member without childIds, or whose children aren't on this team →
 *     appears directly as an athlete.
 */

import { useState, useEffect } from 'react';
import type { User } from '../types';
import { resolveTeamAthletes } from '../utils/resolveTeamAthletes';

export interface Athlete {
  userId: string;
  userName: string;
  photoURL?: string;
}

interface Result {
  athletes: Athlete[];
  myAthleteIds: string[];
  athleteParentMap: Record<string, string[]>; // childId -> parentIds[] (parents on this team)
  loading: boolean;
}

export function useTeamAthletes(members: User[], teamId: string, currentUserId: string): Result {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [myAthleteIds, setMyAthleteIds] = useState<string[]>([]);
  const [athleteParentMap, setAthleteParentMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (members.length === 0) {
      setAthletes([]);
      setMyAthleteIds([]);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      setLoading(true);
      try {
        const { directAthletes, childrenForThisTeam, parentsWithNoChildHere, parentMembers, athleteParentMap: parentMap } =
          await resolveTeamAthletes(members, teamId);

        if (cancelled) return;

        const toAthlete = (u: User): Athlete => ({ userId: u.id, userName: u.displayName, photoURL: u.photoURL });
        setAthletes([...directAthletes, ...childrenForThisTeam, ...parentsWithNoChildHere].map(toAthlete));
        setAthleteParentMap(parentMap);

        const childIdsHere = new Set(childrenForThisTeam.map(c => c.id));
        const currentUserChildIds = parentMembers.find(p => p.id === currentUserId)?.childIds || [];
        const myChildrenHere = currentUserChildIds.filter(cid => childIdsHere.has(cid));
        setMyAthleteIds(myChildrenHere.length > 0 ? myChildrenHere : [currentUserId]);
      } catch (err) {
        console.error('useTeamAthletes: resolve failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [members, teamId, currentUserId]);

  return { athletes, myAthleteIds, athleteParentMap, loading };
}
