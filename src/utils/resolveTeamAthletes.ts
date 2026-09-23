/**
 * Shared athlete-resolution algorithm used by AttendTab, useTeamAthletes,
 * and getNominationCandidates (nominations.ts): team members who are active
 * parents (role 'parent' or isParent === true, with childIds) are replaced
 * by their child athlete account(s) assigned to this team; everyone else —
 * including parents whose children aren't assigned here — appears directly.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { User } from '../types';

export interface ResolvedTeamAthletes {
  directAthletes: User[];
  childrenForThisTeam: User[];
  parentsWithNoChildHere: User[];
  parentMembers: User[];
  athleteParentMap: Record<string, string[]>; // childId -> parentIds[] (parents on this team)
}

export async function resolveTeamAthletes(members: User[], teamId: string): Promise<ResolvedTeamAthletes> {
  const childIdSet: Record<string, true> = {};
  const parentMembers: User[] = [];
  const directAthletes: User[] = [];

  for (const member of members) {
    const isActiveParent = (member.role === 'parent' || member.isParent === true)
      && member.childIds && member.childIds.length > 0;

    if (isActiveParent) {
      parentMembers.push(member);
      for (const childId of member.childIds!) childIdSet[childId] = true;
    } else {
      directAthletes.push(member);
    }
  }

  const allChildIds = Object.keys(childIdSet);
  const childUsers = allChildIds.length > 0
    ? await Promise.all(allChildIds.map(async id => {
        const snap = await getDoc(doc(db, 'users', id));
        return snap.exists() ? ({ id: snap.id, ...snap.data() } as User) : null;
      }))
    : [];

  const childrenForThisTeam = (childUsers.filter(Boolean) as User[])
    .filter(c => Array.isArray(c.teamIds) && c.teamIds.includes(teamId));

  // Built from each child's OWN parentIds — authoritative, unlike
  // reverse-mapping from which team members happen to have this child in
  // their childIds. A trainer who is also a parent of an athlete on their
  // own team may never have been added as a regular team member, but their
  // RSVP for their own child must still count.
  const athleteParentMap: Record<string, string[]> = {};
  for (const child of childrenForThisTeam) {
    if (child.parentIds && child.parentIds.length > 0) athleteParentMap[child.id] = child.parentIds;
  }

  // Parents whose children are not assigned to this team fall back to appearing directly
  const childIdsHere = new Set(childrenForThisTeam.map(c => c.id));
  const parentsWithNoChildHere = parentMembers.filter(p => !p.childIds!.some(cid => childIdsHere.has(cid)));

  return { directAthletes, childrenForThisTeam, parentsWithNoChildHere, parentMembers, athleteParentMap };
}
