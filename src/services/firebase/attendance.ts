/**
 * Firebase Attendance Service
 * CRUD operations for attendance tracking
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  limit as firestoreLimit,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type {
  Attendance,
  AttendanceRecord,
  AttendanceFilters,
  SessionType,
} from '../../types/attendance';

const COLLECTION_NAME = 'attendance';

/**
 * Create a new attendance record
 */
export async function createAttendance(
  clubId: string,
  teamId: string,
  sessionDate: string,
  sessionType: SessionType,
  records: { [userId: string]: AttendanceRecord },
  takenBy: string,
  eventId?: string
): Promise<string> {
  // Calculate stats
  const userIds = Object.keys(records);
  const totalMembers = userIds.length;
  const presentCount = userIds.filter(id => records[id].status === 'present').length;
  const absentCount = userIds.filter(id => records[id].status === 'absent').length;
  const lateCount = userIds.filter(id => records[id].status === 'late').length;
  const excusedCount = userIds.filter(id => records[id].status === 'excused').length;
  const attendanceRate = totalMembers > 0 ? (presentCount / totalMembers) * 100 : 0;

  const attendanceData: Omit<Attendance, 'id'> = {
    eventId,
    clubId,
    teamId,
    sessionDate,
    sessionType,
    records,
    takenBy,
    totalMembers,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    attendanceRate,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  const docRef = await addDoc(collection(db, COLLECTION_NAME), attendanceData);
  return docRef.id;
}

/**
 * Get attendance record by ID
 */
export async function getAttendance(attendanceId: string): Promise<Attendance | null> {
  const docRef = doc(db, COLLECTION_NAME, attendanceId);
  const docSnap = await getDoc(docRef);

  if (!docSnap.exists()) {
    return null;
  }

  return {
    id: docSnap.id,
    ...docSnap.data(),
  } as Attendance;
}

/**
 * Get attendance records for a team
 */
export async function getTeamAttendance(
  teamId: string,
  filters?: AttendanceFilters,
  limitCount?: number
): Promise<Attendance[]> {
  let q = query(
    collection(db, COLLECTION_NAME),
    where('teamId', '==', teamId),
    orderBy('sessionDate', 'desc')
  );

  // Apply filters
  if (filters?.startDate) {
    q = query(q, where('sessionDate', '>=', filters.startDate));
  }
  if (filters?.endDate) {
    q = query(q, where('sessionDate', '<=', filters.endDate));
  }
  if (filters?.sessionType) {
    q = query(q, where('sessionType', '==', filters.sessionType));
  }

  if (limitCount) {
    q = query(q, firestoreLimit(limitCount));
  }

  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  } as Attendance));
}

/**
 * Update an attendance record
 */
export async function updateAttendance(
  attendanceId: string,
  records: { [userId: string]: AttendanceRecord }
): Promise<void> {
  // Recalculate stats
  const userIds = Object.keys(records);
  const totalMembers = userIds.length;
  const presentCount = userIds.filter(id => records[id].status === 'present').length;
  const absentCount = userIds.filter(id => records[id].status === 'absent').length;
  const lateCount = userIds.filter(id => records[id].status === 'late').length;
  const excusedCount = userIds.filter(id => records[id].status === 'excused').length;
  const attendanceRate = totalMembers > 0 ? (presentCount / totalMembers) * 100 : 0;

  const docRef = doc(db, COLLECTION_NAME, attendanceId);
  await updateDoc(docRef, {
    records,
    totalMembers,
    presentCount,
    absentCount,
    lateCount,
    excusedCount,
    attendanceRate,
    updatedAt: Timestamp.now(),
  });
}

/**
 * Delete an attendance record
 */
export async function deleteAttendance(attendanceId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, attendanceId);
  await deleteDoc(docRef);
}


