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
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { User } from '../types';

export interface Athlete {
  userId: string;
  userName: string;
  photoURL?: string;
}

interface Result {
  athletes: Athlete[];
  myAthleteIds: string[];
  loading: boolean;
}

export function useTeamAthletes(members: User[], teamId: string, currentUserId: string): Result {
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [myAthleteIds, setMyAthleteIds] = useState<string[]>([]);
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
        const childIdSet: Record<string, true> = {};
        const parentMembersList: User[] = [];
        const directAthletes: Athlete[] = [];
        const currentUserChildIds: string[] = [];

        for (const member of members) {
          const isActivePar = (member.role === 'parent' || member.isParent === true)
            && member.childIds && member.childIds.length > 0;

          if (isActivePar) {
            parentMembersList.push(member);
            for (const childId of member.childIds!) childIdSet[childId] = true;
            if (member.id === currentUserId) currentUserChildIds.push(...member.childIds!);
          } else {
            directAthletes.push({ userId: member.id, userName: member.displayName, photoURL: member.photoURL });
          }
        }

        const allChildIds = Object.keys(childIdSet);
        const childUsers = allChildIds.length > 0
          ? await Promise.all(allChildIds.map(async id => {
              const snap = await getDoc(doc(db, 'users', id));
              return snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null;
            }))
          : [];

        const childrenHere = (childUsers.filter(Boolean) as User[])
          .filter(c => Array.isArray(c.teamIds) && c.teamIds.includes(teamId));
        const childAthletes: Athlete[] = childrenHere
          .map(c => ({ userId: c.id, userName: c.displayName, photoURL: c.photoURL }));

        const childIdsHere = new Set(childrenHere.map(c => c.id));
        const parentsWithNoChildHere: Athlete[] = parentMembersList
          .filter(p => !p.childIds!.some(cid => childIdsHere.has(cid)))
          .map(p => ({ userId: p.id, userName: p.displayName, photoURL: p.photoURL }));

        if (cancelled) return;
        setAthletes([...directAthletes, ...childAthletes, ...parentsWithNoChildHere]);

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

  return { athletes, myAthleteIds, loading };
}
