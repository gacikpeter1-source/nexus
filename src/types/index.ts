/**
 * TypeScript Type Definitions
 * Based on: docs/02-database-schema.md
 */

import { Timestamp } from 'firebase/firestore';

// ==================== User Types ====================

export type UserRole = 'admin' | 'clubOwner' | 'trainer' | 'assistant' | 'user' | 'parent';

export type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled' | 'pending';

export type SubscriptionPlan = 'trial' | 'user' | 'club' | 'full';

export interface User {
  // Identity
  id: string;
  email: string;
  displayName: string;
  photoURL?: string;
  phoneNumber?: string;
  
  // Role & Permissions
  role: UserRole;
  isSuperAdmin?: boolean;
  isSuperTrainer?: boolean;
  
  // Club & Team Memberships
  clubIds: string[];
  ownedClubIds: string[];
  teamIds?: string[];
  
  // Parent-Child Relationships
  parentIds?: string[];
  childIds?: string[];
  managedByParentId?: string;
  
  // Profile Information
  dateOfBirth?: string;
  address?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  
  // Custom Fields
  customFields?: {
    [fieldKey: string]: any;
  };
  
  // Subscription Status
  subscriptionStatus?: SubscriptionStatus;
  subscriptionPlan?: SubscriptionPlan;
  subscriptionExpiryDate?: string;
  customerID?: string;
  
  // Notifications
  fcmToken?: string;
  fcmTokens?: string[]; // Support multiple devices
  lastTokenUpdate?: string;
  notificationPreferences?: {
    eventReminders: boolean;
    chatMessages: boolean;
    teamUpdates: boolean;
    clubAnnouncements: boolean;
    joinRequests: boolean;
    waitlistPromotions: boolean;
    systemNotifications: boolean;
  };
  
  // Locale & Settings
  language?: string;
  theme?: 'light' | 'dark';
  timezone?: string;
  
  // Metadata
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
  lastLoginAt?: Timestamp | string;
  emailVerified: boolean;
}

// ==================== Club & Team Types ====================

export type TeamMemberRole = 'trainer' | 'assistant' | 'user';

export interface TeamMemberData {
  role: TeamMemberRole;
  joinedAt: Timestamp | string;
  addedBy?: string; // userId who added them
  
  // Team-specific profile (overrides global profile)
  teamProfile?: {
    position?: string;
    customFields?: {
      [fieldKey: string]: any;
    };
  };
}

export interface CustomFieldDefinition {
  type: 'text' | 'number' | 'date' | 'select';
  label: string;
  options?: string[]; // for select type
  required: boolean;
  visible: boolean; // visible to all members or trainers only
}

export interface Team {
  id: string;
  name: string;
  category?: string;
  description?: string;
  createdBy?: string; // User who created the team
  
  // Membership - NEW ENHANCED FORMAT (with roles per member)
  membersData?: {
    [userId: string]: TeamMemberData;
  };
  
  // Legacy format (keep for backward compatibility)
  members: string[];
  trainers: string[];
  assistants: string[];
  
  // Custom Fields Config (per team)
  customFieldDefinitions?: {
    [fieldKey: string]: CustomFieldDefinition;
  };
  
  // Configuration
  logoURL?: string;
  homeVenue?: string;
  practiceSchedule?: string;
  
  // Metadata
  createdAt?: string;
  updatedAt?: string;
}

export interface Club {
  id: string;
  name: string;
  clubType: string;
  clubCode: string;
  clubNumber?: string;
  logoURL?: string;
  
  // Owner & Membership
  createdBy: string;
  superTrainer: string;
  ownerId?: string;
  
  // Members
  members: string[];
  trainers: string[];
  assistants: string[];
  
  // Teams (embedded)
  teams: Team[];
  
  // Subscription
  subscriptionActive: boolean;
  subscriptionType: 'voucher' | 'stripe' | 'trial';
  subscriptionDate?: string;
  subscriptionExpiryDate?: string;
  voucherCode?: string;
  customerID?: string;
  
  // Configuration
  description?: string;
  contactEmail?: string;
  contactPhone?: string;
  address?: string;
  website?: string;
  
  // League Scraper Config
  leagueScraperConfigs?: {
    [teamId: string]: {
      url: string;
      teamIdentifier?: string;
      enabled: boolean;
      lastScrapedAt?: string;
    };
  };
  
  // Custom Fields Config
  memberCardFields?: {
    [fieldKey: string]: {
      label: string;
      type: 'text' | 'number' | 'date' | 'select';
      options?: string[];
      required: boolean;
      visible: boolean;
    };
  };
  
  // Metadata
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

// ==================== Event Types ====================

export type EventType = 'club' | 'team' | 'personal';

export type EventCategory = 'game' | 'tournament' | 'practice' | 'meeting' | 'testing' | 'custom';

export type EventResponse = 'confirmed' | 'declined' | 'maybe';

export type HomeOrAway = 'home' | 'away' | 'neutral';

export interface EventResponseData {
  response: EventResponse;
  timestamp: Timestamp | string;
  respondedBy?: string;
  message?: string; // Optional message for decline/maybe responses
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number;
  endDate?: string;
  daysOfWeek?: number[];
}

export interface EventResult {
  homeScore?: number;
  guestScore?: number;
  status: 'upcoming' | 'in_progress' | 'finished' | 'cancelled' | 'postponed';
  notes?: string;
}

export interface EventReminder {
  id: string;
  minutesBefore: number; // Total minutes before event
  sent?: boolean;
  sentAt?: Timestamp | string;
}

export interface LockPeriod {
  enabled: boolean;
  minutesBefore: number;
  notifyOnLock?: boolean;
}

// Simplified Calendar Event (for calendar views)
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  duration?: number; // Duration in minutes
  endTime?: string;
  type?: 'personal' | 'team' | 'club'; // For backwards compatibility
  visibilityLevel?: 'personal' | 'team' | 'club'; // New field
  clubId?: string;
  teamId?: string;
  createdBy: string;
  location?: string;
  rsvpRequired?: boolean;
  rsvpDeadline?: string;
  participantLimit?: number | null; // Renamed from maxParticipants
  confirmedCount?: number;
  responses?: {
    [userId: string]: EventResponseData;
  };
  waitlist?: string[];
  isRecurring?: boolean;
  recurrenceRule?: string;
  lockPeriod?: LockPeriod;
  reminders?: EventReminder[];
  attachmentUrl?: string;
  attachmentName?: string;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface Event {
  id: string;
  title: string;
  type?: EventType; // For backwards compatibility
  visibilityLevel?: 'personal' | 'team' | 'club'; // New field
  category?: EventCategory;
  
  // Associations
  clubId?: string;
  teamId?: string;
  seasonId?: string;
  createdBy: string;
  
  // Date & Time
  date: string;
  time?: string;
  startTime?: string;
  duration?: number; // Duration in minutes
  endTime?: string;
  allDay?: boolean;
  
  // Location
  location?: string;
  homeOrAway?: HomeOrAway;
  address?: string;
  
  // Description
  description?: string;
  notes?: string;
  
  // Attendance Limits
  maxAttendees?: number; // Legacy field
  participantLimit?: number | null; // New field
  confirmedCount: number;
  
  // Responses
  responses: {
    [userId: string]: EventResponseData;
  };
  
  // Waitlist
  waitlist?: string[];
  
  // Opponent
  homeTeam?: string;
  guestTeam?: string;
  opponent?: string;
  
  // Lock Period
  lockPeriodHours?: number; // Legacy field
  lockPeriod?: LockPeriod; // New field
  isLocked?: boolean;
  
  // Recurrence
  isRecurring?: boolean;
  recurrenceRule?: RecurrenceRule;
  parentEventId?: string;
  
  // Notifications
  reminderSent?: boolean;
  reminderSentAt?: Timestamp | string;
  notifyParticipants?: boolean;
  reminders?: EventReminder[];
  
  // Attachments
  attachmentUrl?: string;
  attachmentName?: string;
  
  // Result
  result?: EventResult;
  
  // Metadata
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

// ==================== Chat Types ====================

export type ChatType = 'team' | 'club' | 'oneToOne' | 'group';

export interface Chat {
  id: string;
  name: string;
  type: ChatType;
  
  // Associations
  clubId?: string;
  teamId?: string;
  
  // Participants
  participants: string[];
  createdBy: string;
  
  // Unread Tracking
  unreadCounts?: {
    [userId: string]: number;
  };
  
  lastMessage?: {
    text: string;
    senderId: string;
    timestamp: Timestamp | string;
  };
  
  // Settings
  isArchived?: boolean;
  isPinned?: boolean;
  
  // Metadata
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface Message {
  id: string;
  text: string;
  senderId: string;
  senderName?: string;
  senderPhotoURL?: string;
  
  // Attachments
  attachments?: {
    type: 'image' | 'file' | 'link';
    url: string;
    name?: string;
    size?: number;
  }[];
  
  // Reactions
  reactions?: {
    [emoji: string]: string[];
  };
  
  // Reply/Thread
  replyTo?: string;
  
  // Moderation
  isDeleted?: boolean;
  isEdited?: boolean;
  editedAt?: Timestamp | string;
  
  // Metadata
  timestamp: Timestamp | string;
}

// ==================== Subscription Types ====================

export interface Subscription {
  id: string;
  type: 'club' | 'user';
  clubId?: string;
  userId?: string;
  
  // Plan Details
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  
  // Billing
  billingCycle: 'monthly' | 'yearly' | 'custom' | 'lifetime';
  amount?: number;
  currency?: string;
  
  // Dates
  startDate: string;
  expiryDate: string;
  renewalDate?: string;
  cancelledAt?: string;
  
  // Payment
  paymentMethod: 'voucher' | 'stripe' | 'manual';
  customerID?: string;
  subscriptionID?: string;
  voucherCode?: string;
  
  // Permissions
  features?: string[];
  maxTeams?: number;
  maxMembers?: number;
  
  // Metadata
  createdBy: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface Voucher {
  id: string;
  code: string;
  plan: SubscriptionPlan;
  duration?: number;
  isPermanent: boolean;
  
  // Usage Limits
  maxUses: number;
  usedCount: number;
  usedBy: {
    userId: string;
    clubId?: string;
    redeemedAt: string;
    note?: string;
  }[];
  
  // Validity
  status: 'active' | 'expired' | 'disabled';
  expirationDate: string;
  description: string;
  
  // Metadata
  createdBy: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

// ==================== Other Types ====================

export interface JoinRequest {
  id: string;
  type: 'club' | 'team';
  userId: string;
  clubId: string;
  teamId?: string;
  status: 'pending' | 'approved' | 'rejected';
  message?: string;
  responseMessage?: string;
  reviewedBy?: string;
  reviewedAt?: Timestamp | string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface ParentChildRelationship {
  id: string;
  parentId: string;
  childId: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  message?: string;
  approvedBy?: string;
  approvedAt?: Timestamp | string;
  rejectedBy?: string;
  rejectionReason?: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface Season {
  id: string;
  name: string;
  clubId: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  description?: string;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

export interface Attendance {
  id: string;
  eventId?: string;
  clubId: string;
  teamId: string;
  sessionDate: string;
  sessionType: 'practice' | 'game' | 'meeting' | 'other';
  records: {
    [userId: string]: {
      status: 'present' | 'absent' | 'excused' | 'late';
      arrivedAt?: string;
      leftAt?: string;
      duration?: number;
      notes?: string;
    };
  };
  takenBy: string;
  totalMembers: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  attendanceRate: number;
  createdAt: Timestamp | string;
  updatedAt: Timestamp | string;
}

// ==================== League Schedule Types ====================

export interface LeagueGame {
  id: string;
  clubId: string;
  teamId: string;
  seasonId?: string;
  
  // Game details
  homeTeam: string;
  guestTeam: string;
  date: string;          // YYYY-MM-DD format
  time: string;          // HH:MM format
  round?: string;
  location?: string;
  
  // Results
  result?: string;       // "3:2" format
  homeScore?: number;
  guestScore?: number;
  status: 'upcoming' | 'played' | 'cancelled';
  
  // Scraper tracking
  source: 'scraped' | 'manual';
  scrapedId?: string;    // External ID from scraper
  lastSyncedAt?: string;
  
  // Calendar integration
  eventId?: string;      // Linked calendar event ID
  
  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

