# Nexus — Feature Catalogue

## 1. Authentication

**Pages:** `src/pages/auth/`  
**Service:** `src/services/firebase/emailVerification.ts`, `src/contexts/AuthContext.tsx`

- Email + password registration and login
- Email verification (required before accessing the app)
- Password reset via email
- Persistent session (Firebase Auth)
- Logout from any device

---

## 2. User Profiles

**Pages:** `src/pages/Profile.tsx`  
**Service:** `src/services/firebase/users.ts`

- Display name, photo, phone, date of birth, address
- Emergency contact information
- Custom fields (defined per club/team)
- Language preference (EN/SK)
- Theme preference (light/dark)
- Notification preferences (push + email, 12 categories each)
- Subscription status display
- Multiple FCM tokens (multi-device push notifications)

---

## 3. Club Management

**Pages:** `src/pages/clubs/`  
**Service:** `src/services/firebase/clubs.ts`  
**Components:** `src/components/club/`

- Create and configure clubs
- Club code, type, logo, contact info, description
- Subscription management (trial / voucher / Stripe)
- Member roster (members, trainers, assistants)
- Custom member card fields (text, number, date, select)
- Season management (`src/services/firebase/seasons.ts`)
- Transfer club ownership
- Club settings page (`ClubSettings.tsx`)

---

## 4. Team Management

**Pages:** `src/pages/clubs/ClubTeamsPage.tsx`, `src/pages/teams/TeamView.tsx`  
**Service:** `src/services/firebase/teams.ts`  
**Components:** `src/components/team/`

- Create teams within a club
- Team logo, background image, home venue, practice schedule
- Role-based member management (trainer / assistant / user per team)
- Enhanced member data format with team-specific profiles and positions
- Custom field definitions per team
- Invite codes (with expiry, usage limits) — `TeamInviteCodes.tsx`
- QR code for team joining — `TeamQRCode.tsx`
- Join request approval workflow

---

## 5. Calendar & Events

**Pages:** `src/pages/calendar/`  
**Service:** `src/services/firebase/events.ts`  
**Components:** `src/components/calendar/CompactWeekView.tsx`

### Event Types
- `club` — visible to all club members
- `team` — visible to a specific team
- `personal` — private to the creator

### Event Categories
- Game, Tournament, Practice, Meeting, Testing, Custom

### Calendar Views
- Monthly grid
- Weekly compact view
- List view

### RSVP System
- Responses: `confirmed`, `declined`, `maybe`
- Optional message on decline/maybe
- Waitlist when `maxParticipants` is set
- Waitlist promotion notifications

### Advanced Event Features
- Lock period — prevent RSVP changes after a deadline
- Reminders — customisable timing, delivered via push notification
- Recurring events — daily / weekly / monthly with end date or count
- Home/Away flag for games
- Post-game results (score recording)
- Event gallery (link to media)
- Edit existing events (`/calendar/events/:eventId/edit`)

---

## 6. Attendance Tracking

**Pages:** `src/pages/TakeAttendance.tsx`, `src/pages/AttendanceHistory.tsx`, `src/pages/AttendanceDetail.tsx`  
**Service:** `src/services/firebase/attendance.ts`

- Take attendance for a training session or event
- Statuses: `present`, `absent`, `late`, `excused`
- Optional per-member notes
- Auto-calculated session stats (totals per status)
- Attendance history list per team
- Detailed view of a past session
- Edit previously recorded attendance

---

## 7. Real-Time Chat

**Pages:** `src/pages/chat/ChatsPage.tsx`  
**Service:** `src/services/firebase/chats.ts`, `src/services/firebase/messages.ts`  
**Components:** `src/components/chat/`

### Chat Types
- **One-to-one** — direct message between any two users
- **Team chat** — channel for a specific team
- **Club chat** — channel for the entire club

### Features
- Real-time message delivery via Firestore `onSnapshot`
- Emoji picker
- Message pinning
- Reply-to (thread reference)
- Read receipts (readBy array)
- Unread count badges
- Chat list with last message preview

---

## 8. Push Notifications

**Service:** `src/services/firebase/messaging.ts`, `src/services/firebase/notifications.ts`  
**Service worker:** `public/firebase-messaging-sw.js`  
**Components:** `src/components/notifications/NotificationSettings.tsx`

### Delivery
- Firebase Cloud Messaging (FCM)
- Web push via service worker (background delivery)
- Multi-device support (multiple FCM tokens per user)

### Notification Categories (configurable per user)
| Category | Push | Email |
|---|:---:|:---:|
| Event created | ✓ | ✓ |
| Event modified | ✓ | ✓ |
| Event deleted | ✓ | ✓ |
| Event reminders | ✓ | ✓ |
| Waitlist promotions | ✓ | ✓ |
| Join requests | ✓ | ✓ |
| Chat messages | ✓ | ✓ |
| Chat mentions | ✓ | ✓ |
| High-priority chat | ✓ | ✓ |
| Team updates | ✓ | ✓ |
| Club announcements | ✓ | ✓ |
| System notifications | ✓ | ✓ |

---

## 9. Parent-Child Accounts

**Pages:** `src/pages/ParentDashboard.tsx`, `src/pages/CreateChild.tsx`, `src/pages/ChildSchedule.tsx`  
**Service:** `src/services/firebase/parentChild.ts`

- Parent (`role: 'parent'`) creates child sub-accounts
- Child accounts can be enrolled in teams
- Parent can view child's schedule
- Parent can RSVP to events on behalf of a child (`respond_for_child`)
- Edit and manage child profile
- `parentChildRelationships` Firestore collection tracks the links

---

## 10. League Schedule Scraper

**Page:** `src/pages/LeagueSchedule.tsx`  
**Service:** `src/services/firebase/leagueSchedule.ts`, `src/services/leagueScraper.ts`  
**Components:** `src/components/league/`

- Configure scraper URL per team (stored in club's `leagueScraperConfigs`)
- Scrapes external league website using `axios` + `cheerio`
- Parsed games stored in `leagueSchedule` collection
- Game preview modal with match details
- Scraper configuration modal (`ScraperConfigModal.tsx`)
- Route: `/clubs/:clubId/teams/:teamId/league`

---

## 11. Media & Gallery

**Pages:** `src/pages/MediaGallery.tsx`, `src/pages/EventGallery.tsx`  
**Service:** `src/services/firebase/media.ts`, `src/services/firebase/storage.ts`  
**Components:** `src/components/media/`

- Upload photos and files to Firebase Storage
- Gallery view per club, per team, or per event
- `FileUpload.tsx` — drag-and-drop upload component
- `MediaGalleryView.tsx` — grid gallery display
- Media metadata stored in `media` collection
- Event galleries linked from event detail pages

---

## 12. Order Management

**Pages:** `src/pages/orders/`  
**Service:** `src/services/firebase/orders.ts`

- Create orders (requests for response from specific users)
- List open/closed orders
- Detailed order view with response status
- Respond to an order (`RespondToOrder.tsx`)
- Status: `open` / `closed`
- Target specific users or all team members

---

## 13. Subscription & Vouchers

**Service:** `src/services/firebase/vouchers.ts`  
**Page:** `src/pages/AdminPanel.tsx`

- Voucher-based subscription activation
- Admin can create vouchers (`create_voucher` permission)
- Voucher codes tied to a plan and duration
- Subscription statuses: `active`, `trial`, `expired`, `cancelled`, `pending`
- Stripe integration scaffolded (not fully implemented)
- Trial period support

---

## 14. Admin Panel

**Page:** `src/pages/AdminPanel.tsx`  
**Service:** `src/services/firebase/adminUsers.ts`

- Accessible only with `access_admin_dashboard` permission (admin role)
- User management (`src/pages/users/UserManagement.tsx`)
- Voucher management
- Subscription oversight
- Audit log access (scaffolded)

---

## 15. Training Board

**Page:** `src/pages/training/TrainingBoard.tsx`

- Visual board for planning training sessions
- Accessible to trainers and assistants

---

## 16. Join Flow

**Pages:** `src/pages/JoinTeamByLink.tsx`, `src/pages/JoinRequestPage.tsx`  
**Service:** `src/services/firebase/requests.ts`

- Join a team via invite link (`/join-team?code=...`)
- QR code scan redirects to join link
- Teams with approval required → join request created
- Trainers/owners approve or reject requests
- `requests` collection tracks all pending requests
