/**
 * Attendance Tracking Types
 * TypeScript interfaces for attendance system
 */

import { Timestamp } from 'firebase/firestore';

/**
 * Attendance status options
 */
export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late';

/**
 * Session type options
 */
export type SessionType = 'practice' | 'game' | 'meeting' | 'other';

/**
 * Individual attendance record for a member
 */
export interface AttendanceRecord {
  status: AttendanceStatus;
  arrivedAt?: string;               // ISO timestamp
  leftAt?: string;                  // ISO timestamp
  duration?: number;                // Minutes
  notes?: string;
}

/**
 * Attendance document for a session
 */
export interface Attendance {
  id?: string;
  
  // Session Info
  eventId?: string;                 // Related event ID (optional)
  clubId: string;
  teamId: string;
  sessionDate: string;              // ISO date (YYYY-MM-DD)
  sessionType: SessionType;
  
  // Attendance Records
  records: {
    [userId: string]: AttendanceRecord;
  };
  
  // Taken By
  takenBy: string;                  // User ID (trainer/assistant)
  
  // Stats (Denormalized)
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount?: number;
  attendanceRate: number;           // Percentage
  
  // Metadata
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

/**
 * Attendance statistics for a team or member
 */
export interface AttendanceStats {
  // Totals
  totalSessions: number;
  totalPresent: number;
  totalAbsent: number;
  totalLate: number;
  totalExcused: number;
  
  // Rates
  attendanceRate: number;           // Percentage
  lateRate: number;                 // Percentage
  excusedRate: number;              // Percentage
  
  // Streaks
  currentStreak: number;            // Consecutive sessions present
  longestStreak: number;            // Longest streak ever
  
  // By Type
  byType?: {
    [key in SessionType]?: {
      total: number;
      present: number;
      rate: number;
    };
  };
  
  // Trend (last 5 sessions)
  recentTrend?: AttendanceStatus[];
}

/**
 * Filter options for attendance queries
 */
export interface AttendanceFilters {
  startDate?: string;               // ISO date
  endDate?: string;                 // ISO date
  sessionType?: SessionType;
  status?: AttendanceStatus;
  memberId?: string;                // Filter by specific member
}

/**
 * Attendance summary for reports
 */
export interface AttendanceSummary {
  teamId: string;
  teamName: string;
  period: {
    start: string;
    end: string;
  };
  stats: AttendanceStats;
  memberStats: {
    userId: string;
    userName: string;
    stats: AttendanceStats;
  }[];
}


