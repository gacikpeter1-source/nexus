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
  notificationPreferences?: {
    eventReminders: boolean;
    chatMessages: boolean;
    teamUpdates: boolean;
    clubAnnouncements: boolean;
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

export interface Team {
  id: string;
  name: string;
  category?: string;
  description?: string;
  
  // Membership
  members: string[];
  trainers: string[];
  assistants: string[];
  
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

// Simplified Calendar Event (for calendar views)
export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type: 'personal' | 'team' | 'club';
  clubId?: string;
  teamId?: string;
  createdBy: string;
  location?: string;
  rsvpRequired?: boolean;
  rsvpDeadline?: string;
  maxParticipants?: number;
  participants?: string[];
  rsvpYes?: string[];
  rsvpNo?: string[];
  rsvpMaybe?: string[];
  isRecurring?: boolean;
  recurrenceRule?: string;
  lockPeriodStart?: string;
  lockPeriodEnd?: string;
  createdAt?: Timestamp | string;
  updatedAt?: Timestamp | string;
}

export interface Event {
  id: string;
  title: string;
  type: EventType;
  category?: EventCategory;
  
  // Associations
  clubId: string;
  teamId?: string;
  seasonId?: string;
  createdBy: string;
  
  // Date & Time
  date: string;
  time?: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  
  // Location
  location?: string;
  homeOrAway?: HomeOrAway;
  address?: string;
  
  // Description
  description?: string;
  notes?: string;
  
  // Attendance Limits
  maxAttendees?: number;
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
  lockPeriodHours?: number;
  isLocked?: boolean;
  
  // Recurrence
  isRecurring?: boolean;
  recurrenceRule?: RecurrenceRule;
  parentEventId?: string;
  
  // Notifications
  reminderSent?: boolean;
  reminderSentAt?: Timestamp | string;
  notifyParticipants?: boolean;
  
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
  approvedBy?: string;
  approvedAt?: Timestamp | string;
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

