# Nexus — Database Schema (Firestore)

All collections are stored in **Cloud Firestore** (NoSQL, document-based). TypeScript interfaces for every collection live in `src/types/index.ts`.

---

## Collection Overview

| Collection | Description |
|---|---|
| `users` | User profiles and auth metadata |
| `clubs` | Club organisations (teams embedded) |
| `events` | Calendar events |
| `chats` | Chat rooms/channels |
| `chats/{chatId}/messages` | Messages subcollection |
| `attendance` | Attendance sessions |
| `leagueSchedule` | Scraped league games |
| `notifications` | Push notification records |
| `orders` | Order management |
| `requests` | Team join requests |
| `seasons` | Club seasons |
| `vouchers` | Subscription vouchers |
| `parentChildRelationships` | Parent ↔ child account links |
| `media` | File/image metadata |

---

## `users/{userId}`

```ts
{
  id: string
  email: string
  displayName: string
  photoURL?: string
  phoneNumber?: string

  // Role
  role: 'admin' | 'clubOwner' | 'trainer' | 'assistant' | 'user' | 'parent'
  isSuperAdmin?: boolean
  isSuperTrainer?: boolean

  // Memberships
  clubIds: string[]           // clubs the user belongs to
  ownedClubIds: string[]      // clubs the user owns
  teamIds?: string[]

  // Parent-child
  parentIds?: string[]
  childIds?: string[]
  managedByParentId?: string

  // Profile
  dateOfBirth?: string
  address?: string
  emergencyContact?: { name, phone, relationship }
  customFields?: { [key: string]: any }

  // Subscription
  subscriptionStatus?: 'active' | 'trial' | 'expired' | 'cancelled' | 'pending'
  subscriptionPlan?: 'trial' | 'user' | 'club' | 'full'
  subscriptionExpiryDate?: string
  customerID?: string

  // Push notifications
  fcmToken?: string
  fcmTokens?: string[]        // multi-device support
  notificationPreferences?: { ... }   // 12 boolean flags
  emailNotificationPreferences?: { ... }

  // Settings
  language?: string
  theme?: 'light' | 'dark'
  timezone?: string

  emailVerified: boolean
  createdAt: Timestamp
  updatedAt: Timestamp
  lastLoginAt?: Timestamp
}
```

---

## `clubs/{clubId}`

Teams are **embedded** inside the club document (not a subcollection).

```ts
{
  id: string
  name: string
  clubType: string
  clubCode: string            // short identifier
  clubNumber?: string
  logoURL?: string

  // Ownership
  createdBy: string           // userId
  superTrainer: string        // userId
  ownerId?: string

  // Members (flat arrays + embedded teams for roles)
  members: string[]
  trainers: string[]
  assistants: string[]
  teams: Team[]               // ← embedded array

  // Subscription
  subscriptionActive: boolean
  subscriptionType: 'voucher' | 'stripe' | 'trial'
  subscriptionDate?: string
  subscriptionExpiryDate?: string
  voucherCode?: string
  customerID?: string

  // Contact
  description?: string
  contactEmail?: string
  contactPhone?: string
  address?: string
  website?: string

  // League scraper config (per team)
  leagueScraperConfigs?: {
    [teamId: string]: { url, teamIdentifier?, enabled, lastScrapedAt? }
  }

  // Custom member card fields
  memberCardFields?: {
    [fieldKey: string]: { label, type, options?, required, visible }
  }

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Embedded `Team` object

```ts
{
  id: string
  name: string
  category?: string
  description?: string
  createdBy?: string

  // Members (enhanced format with roles per member)
  membersData?: {
    [userId: string]: {
      role: 'trainer' | 'assistant' | 'user'
      joinedAt: Timestamp
      addedBy?: string
      teamProfile?: { position?, customFields? }
    }
  }
  // Legacy flat arrays (kept for backward compatibility)
  members: string[]
  trainers: string[]
  assistants: string[]

  // Custom fields
  customFieldDefinitions?: {
    [fieldKey: string]: { type, label, options?, required, visible }
  }

  logoURL?: string
  backgroundImageURL?: string
  homeVenue?: string
  practiceSchedule?: string

  joinRequests?: Array<{ userId, requestedAt, status }>
  inviteCodes?: Array<{ code, createdBy, createdAt, expiresAt?, usageCount?, maxUses? }>

  createdAt?: string
  updatedAt?: string
}
```

---

## `events/{eventId}`

```ts
{
  id: string
  title: string
  description?: string
  type: 'club' | 'team' | 'personal'
  category: 'game' | 'tournament' | 'practice' | 'meeting' | 'testing' | 'custom'

  // Ownership
  clubId?: string
  teamId?: string
  createdBy: string

  // Timing
  startDate: string           // ISO 8601
  endDate: string
  allDay?: boolean
  timezone?: string

  // Location
  location?: string
  homeOrAway?: 'home' | 'away' | 'neutral'

  // RSVP
  responses?: { [userId: string]: EventResponseData }
  // EventResponseData: { response: 'confirmed'|'declined'|'maybe', timestamp, respondedBy?, message? }

  // Waitlist
  maxParticipants?: number
  waitlist?: string[]

  // Lock period (prevents editing RSVP after deadline)
  lockPeriod?: { lockBefore?: string, lockAfter?: string }

  // Reminders
  reminders?: EventReminder[]

  // Recurrence
  recurrenceRule?: { frequency, interval, endDate?, count?, daysOfWeek? }
  parentEventId?: string      // for recurring instances

  // Results (post-game)
  result?: { homeScore?, awayScore?, notes? }

  // Gallery
  hasGallery?: boolean
  mediaCount?: number

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

## `chats/{chatId}`

```ts
{
  id: string
  type: 'one-to-one' | 'team' | 'club'
  participants: string[]      // userIds
  teamId?: string
  clubId?: string
  name?: string
  lastMessage?: string
  lastMessageAt?: Timestamp
  lastMessageBy?: string
  unreadCount?: { [userId: string]: number }
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### Subcollection `chats/{chatId}/messages/{messageId}`

```ts
{
  id: string
  text: string
  senderId: string
  senderName: string
  senderPhotoURL?: string
  createdAt: Timestamp
  editedAt?: Timestamp
  isPinned?: boolean
  replyTo?: string            // messageId
  readBy?: string[]
}
```

---

## `attendance/{attendanceId}`

```ts
{
  id: string
  eventId?: string
  teamId: string
  clubId: string
  sessionDate: string
  sessionType?: string
  takenBy: string             // userId of trainer
  notes?: string

  records: Array<{
    userId: string
    displayName: string
    status: 'present' | 'absent' | 'late' | 'excused'
    note?: string
  }>

  stats?: {
    total: number
    present: number
    absent: number
    late: number
    excused: number
  }

  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

## `orders/{orderId}`

```ts
{
  id: string
  title: string
  description?: string
  createdBy: string
  clubId?: string
  teamId?: string
  targetUserIds: string[]     // who should respond
  dueDate?: string

  responses?: {
    [userId: string]: {
      answer: string
      respondedAt: Timestamp
      notes?: string
    }
  }

  status: 'open' | 'closed'
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

---

## `vouchers/{voucherId}`

```ts
{
  id: string
  code: string                // unique voucher code
  plan: 'trial' | 'user' | 'club' | 'full'
  durationDays: number
  usedBy?: string             // userId
  usedAt?: Timestamp
  createdBy: string
  expiresAt?: Timestamp
  createdAt: Timestamp
}
```

---

## `requests/{requestId}` (join requests)

```ts
{
  id: string
  userId: string
  clubId: string
  teamId: string
  status: 'pending' | 'approved' | 'rejected'
  requestedAt: Timestamp
  processedBy?: string
  processedAt?: Timestamp
  message?: string
}
```

---

## Firestore Indexes

Composite indexes are defined in `firestore.indexes.json`. Key indexes:
- Events by `clubId` + `startDate`
- Events by `teamId` + `startDate`
- Messages by `chatId` + `createdAt`
- Attendance by `teamId` + `sessionDate`
- Notifications by `userId` + `createdAt`

---

## Security Rules

Defined in `firestore.rules` and `storage.rules`. Key principles:
- Users can only read/write their own `users/{userId}` document
- Club documents are readable by members, writable by owners/trainers (role-dependent)
- Messages are readable only by chat participants
- Admin-only collections (vouchers, admin operations) are locked to `role == 'admin'`
