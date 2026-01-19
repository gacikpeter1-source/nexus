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
  AttendanceStats,
  AttendanceFilters,
  AttendanceStatus,
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
 * Get attendance records for a club
 */
export async function getClubAttendance(
  clubId: string,
  filters?: AttendanceFilters,
  limitCount?: number
): Promise<Attendance[]> {
  let q = query(
    collection(db, COLLECTION_NAME),
    where('clubId', '==', clubId),
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

/**
 * Get attendance statistics for a team
 */
export async function getTeamAttendanceStats(
  teamId: string,
  startDate?: string,
  endDate?: string
): Promise<AttendanceStats> {
  const filters: AttendanceFilters = { startDate, endDate };
  const attendanceRecords = await getTeamAttendance(teamId, filters);

  let totalSessions = attendanceRecords.length;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;
  let totalExcused = 0;

  const byType: { [key in SessionType]?: { total: number; present: number; rate: number } } = {};

  attendanceRecords.forEach(record => {
    totalPresent += record.presentCount;
    totalAbsent += record.absentCount;
    totalLate += record.lateCount;
    totalExcused += record.excusedCount || 0;

    // By type stats
    if (!byType[record.sessionType]) {
      byType[record.sessionType] = { total: 0, present: 0, rate: 0 };
    }
    byType[record.sessionType]!.total += record.totalMembers;
    byType[record.sessionType]!.present += record.presentCount;
  });

  // Calculate rates for each type
  Object.keys(byType).forEach(type => {
    const typeKey = type as SessionType;
    if (byType[typeKey]!.total > 0) {
      byType[typeKey]!.rate = (byType[typeKey]!.present / byType[typeKey]!.total) * 100;
    }
  });

  const totalAttendance = totalPresent + totalAbsent + totalLate + totalExcused;
  const attendanceRate = totalAttendance > 0 ? (totalPresent / totalAttendance) * 100 : 0;
  const lateRate = totalAttendance > 0 ? (totalLate / totalAttendance) * 100 : 0;
  const excusedRate = totalAttendance > 0 ? (totalExcused / totalAttendance) * 100 : 0;

  return {
    totalSessions,
    totalPresent,
    totalAbsent,
    totalLate,
    totalExcused,
    attendanceRate,
    lateRate,
    excusedRate,
    currentStreak: 0, // TODO: Calculate streaks
    longestStreak: 0,
    byType,
  };
}

/**
 * Get attendance statistics for a specific member
 */
export async function getMemberAttendanceStats(
  teamId: string,
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<AttendanceStats> {
  const filters: AttendanceFilters = { startDate, endDate };
  const attendanceRecords = await getTeamAttendance(teamId, filters);

  let totalSessions = 0;
  let totalPresent = 0;
  let totalAbsent = 0;
  let totalLate = 0;
  let totalExcused = 0;

  const byType: { [key in SessionType]?: { total: number; present: number; rate: number } } = {};
  const recentTrend: AttendanceStatus[] = [];

  attendanceRecords.forEach(record => {
    if (record.records[userId]) {
      totalSessions++;
      const status = record.records[userId].status;

      if (status === 'present') totalPresent++;
      else if (status === 'absent') totalAbsent++;
      else if (status === 'late') totalLate++;
      else if (status === 'excused') totalExcused++;

      // Recent trend (last 5 sessions)
      if (recentTrend.length < 5) {
        recentTrend.push(status);
      }

      // By type stats
      if (!byType[record.sessionType]) {
        byType[record.sessionType] = { total: 0, present: 0, rate: 0 };
      }
      byType[record.sessionType]!.total++;
      if (status === 'present') {
        byType[record.sessionType]!.present++;
      }
    }
  });

  // Calculate rates for each type
  Object.keys(byType).forEach(type => {
    const typeKey = type as SessionType;
    if (byType[typeKey]!.total > 0) {
      byType[typeKey]!.rate = (byType[typeKey]!.present / byType[typeKey]!.total) * 100;
    }
  });

  const attendanceRate = totalSessions > 0 ? (totalPresent / totalSessions) * 100 : 0;
  const lateRate = totalSessions > 0 ? (totalLate / totalSessions) * 100 : 0;
  const excusedRate = totalSessions > 0 ? (totalExcused / totalSessions) * 100 : 0;

  // Calculate streaks
  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  attendanceRecords.forEach((record, index) => {
    if (record.records[userId]?.status === 'present') {
      tempStreak++;
      if (index === 0) currentStreak = tempStreak;
      if (tempStreak > longestStreak) longestStreak = tempStreak;
    } else {
      tempStreak = 0;
    }
  });

  return {
    totalSessions,
    totalPresent,
    totalAbsent,
    totalLate,
    totalExcused,
    attendanceRate,
    lateRate,
    excusedRate,
    currentStreak,
    longestStreak,
    byType,
    recentTrend,
  };
}

/**
 * Get attendance history for a member across all teams
 * Note: This requires querying by team IDs the user belongs to
 * For now, returns empty array - implement when needed
 */
export async function getMemberAttendanceHistory(
  _userId: string,
  _limitCount: number = 20
): Promise<Attendance[]> {
  // TODO: Implement by querying attendance for each team the user belongs to
  // Alternative: Use cloud function to aggregate this data
  return [];
}

