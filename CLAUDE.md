# Nexus — Claude Code Context

## What This Is
Club & Team Management SPA — React 18 + TypeScript + Vite + TailwindCSS + Firebase.
**Mobile-first.** All UI must scale from 375px (iPhone SE) up to 2560px (ultrawide).
Firebase project: `nexus-7f8f7` | Deployment: Vercel (primary) | Language: Slovak default (`sk`), English (`en`) | Theme: Dark

## Layout Rules (critical)
- Sidebar: `position: fixed`, always. Width `w-56` (224px) at md, `w-64` (256px) at lg.
- Main content: `md:pl-56 lg:pl-64` — padding-left reserves space for the fixed sidebar. **Do NOT use margin-left or flex/grid tricks** — they create dead zones on tablets.
- Container: `max-w-full` on mobile/tablet, `lg:max-w-[960px]`, `xl:max-w-[1200px]`.
- Responsive breakpoints: `xs:375px sm:640px md:768px lg:1024px xl:1280px`.
- Use `overflow-x-hidden min-w-0` on the main content wrapper to prevent global horizontal scroll.

## Key Directories
```
src/
  App.tsx                   # All routes
  main.tsx                  # Providers: QueryClient → Router → Language → Auth → Notifications
  components/layout/        # AppLayout.tsx, Sidebar.tsx, Container.tsx
  pages/
    auth/                   # Login, Register, VerifyEmail, ForgotPassword (all translated)
    calendar/               # CalendarView, CreateEvent, EventDetail
    clubs/                  # ClubsList, ClubView, ClubSettings, ClubTeamsPage, CreateClub
    teams/                  # TeamView
    chat/                   # ChatsPage
    orders/                 # OrdersPage, CreateOrder, OrderDetail, RespondToOrder
    training/               # TrainingBoard
  services/firebase/        # One file per domain — NEVER call Firestore directly from components
  services/notifications/   # NotificationManager.ts — central notification dispatcher
  contexts/                 # AuthContext, LanguageContext, NotificationContext
  types/index.ts            # All Firestore interfaces
  constants/permissions.ts  # Role + permission matrix
  translations/             # en.json, sk.json (~430 keys each)
functions/src/index.ts      # Firebase Cloud Functions (push delivery, reminders, deadlines)
```

## Role Hierarchy
```
admin (5) > clubOwner (4) > trainer (3) > assistant (2) > user/parent (1)
```
Club owner is stored in `club.ownerId` AND may appear in `club.trainers[]`. Always deduplicate with `new Set()` when building recipient lists.

## Parent / Athlete System
- Parent account has `childIds: string[]` — each entry is a virtual athlete (child) user document.
- Child athlete cannot log in; parent manages RSVPs and the child appears in attendance/stats.
- Child is visible **only** in teams where `child.teamIds.includes(teamId)` — strict, no fallback.
- `CreateChild.tsx` (`/create-child`, `/create-child/:childId`) is the UI for creating/editing athletes and assigning them to teams.
- In AttendTab and StatsTab: resolve athletes from members — members **with** `childIds` are replaced by their children; members **without** `childIds` appear directly. Use `Array.isArray(c.teamIds) && c.teamIds.includes(teamId)` to filter.
- **Bug pattern to avoid:** using `members` directly for stats/attendance — parent IDs are not in attendance records, child IDs are.

## Team Member Data
Teams use two formats — always handle both:
```typescript
team.membersData   // new: { [userId]: TeamMemberData }  → Object.keys(team.membersData)
team.members       // legacy: string[]                   → use array directly, NOT Object.keys()
```
**Bug pattern to avoid:** `Object.keys(team.members)` on an array returns `["0","1","2"]` not user IDs.
**When loading members in TeamView:** `const memberIds = teamData.membersData ? Object.keys(teamData.membersData) : (teamData.members || [])` — affects all tabs (Members, Attend, Stats).

## Push Notifications
- `NotificationManager.ts` creates Firestore docs in `notifications/` collection.
- Cloud Function `sendPushOnNotificationCreated` triggers on new docs → sends FCM.
- FCM messages must be **data-only** (no top-level `notification` field) to avoid double-display.
- `NotificationContext` has a live Firestore listener for unread count — badge is always accurate.
- `activeChatId` in NotificationContext suppresses foreground pushes when user is in that chat.
- Club owner + `club.trainers[]` are always included in team event/chat notification recipients.
- Deploy functions: `cd functions && npm install && cd .. && firebase deploy --only functions`

## Firebase Services Pattern
Every domain has a dedicated file in `src/services/firebase/`. Notification triggers live in `NotificationManager.ts`. Always call `NotificationManager.on*()` after write operations — never skip notifications silently.

## Auth
- Firebase SDK v10 returns `auth/invalid-credential` (not `auth/user-not-found` + `auth/wrong-password`).
- FCM token is refreshed on every login via `NotificationContext` (not just when permission is missing).
- `ProtectedRoute` checks `firebaseUser` for redirect (not `user`) to avoid race condition on slow networks.

## i18n
- `useLanguage()` hook (wraps react-i18next). All user-facing strings in both `en.json` and `sk.json`.
- Default: Slovak. Keys follow dot-notation: `calendar.eventTypes.training`, `auth.forgotPassword.title`.

## State Management
- Server state: TanStack React Query
- Auth: `useAuth()` from `AuthContext`
- Local UI: `useState`/`useReducer`
- Forms: `react-hook-form` — no uncontrolled forms

## Brand Colors
`app-primary #0A0E27` · `app-secondary #141B3D` · `app-card #1C2447` · `app-blue #0066FF` · `app-cyan #00D4FF`

## Orders Module
- Creator (clubOwner/trainer/assistant) defines custom `OrderField[]` — users fill in the form.
- Field types: `text`, `number`, `select`. For `number`, `min`/`max` constrain the allowed range.
- Firestore: `clubs/{clubId}/orders/{orderId}` with a `responses` subcollection per user response.
- `RespondToOrder.tsx` does per-field inline validation via `fieldErrors: Record<string,string>` state — validate on every keystroke, disable submit while any error exists.
- `sendOrderDeadlineReminders` (Cloud Function) queries the `responses` subcollection to filter out members who already responded — only non-responders get the reminder.
- **Bug pattern to avoid:** querying all `club.members` for order reminders without cross-referencing `responses` → everyone gets reminded even if they already submitted.

## Cloud Functions Scheduling
- Use cron syntax (`'0 8 * * *'`) not `'every N hours'` — the latter drifts and is harder to reason about.
- `sendOrderDeadlineReminders` runs at 08:00 UTC daily (09:00/10:00 Slovakia depending on DST).
- `sendEventReminders` runs every 15 minutes (requires Blaze plan).

## Stats Tab
- `StatsTab.tsx` — dashboard hub with a `DASHBOARDS` array. To add a new dashboard: push one entry to the array + add one render block below. Attendance is live; Games and Team Overview are placeholders.
- Attendance query **must** include `where('clubId', '==', clubId)` — without it the Firestore rule `resource.data.clubId in getUserData().clubIds` cannot be satisfied and the query returns a permissions error.
- Excel export uses `xlsx` (dynamic import): `const XLSX = await import('xlsx')`.

## Recurring Events
- Parent event has `exceptions: string[]` (dates overridden by a single-occurrence edit).
- `expandRecurringEvents()` in CalendarView skips exception dates.
- Calendar links to recurring occurrences as `/calendar/events/{id}?date=YYYY-MM-DD`.
- EventDetail reads `?date` param and uses it to display the correct occurrence date.

## Environment
- `.env.local` — valid Firebase credentials (do not commit)
- `node_modules/` — may need `npm install` on fresh machine
- `functions/node_modules/` — `cd functions && npm install` separately
