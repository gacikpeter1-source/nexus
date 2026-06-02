# Nexus — Architecture Overview

## High-Level Architecture

Nexus is a **single-page application (SPA)** that runs entirely in the browser and uses Firebase as its backend-as-a-service.

```
Browser (React SPA)
       │
       ├── Firebase Auth        → User sessions & email verification
       ├── Firestore            → NoSQL database (real-time listeners)
       ├── Firebase Storage     → File/image uploads
       ├── Firebase Cloud Messaging (FCM) → Push notifications
       └── Firebase Functions   → Serverless backend (optional)
```

No custom API server exists. All data access goes through the Firebase SDKs called from `src/services/firebase/`.

---

## Frontend Stack

| Technology | Version | Role |
|---|---|---|
| React | 18.2 | UI framework |
| TypeScript | 5.2 | Type safety |
| Vite | 7.3 | Build tool & dev server |
| React Router | v6 | Client-side routing |
| TailwindCSS | 3.4 | Utility CSS |
| TanStack React Query | 5.17 | Server state & caching |
| React Hook Form | 7.49 | Form handling |
| i18next + react-i18next | 25.7 / 16.5 | Internationalisation |
| date-fns | 3.0 | Date utilities |
| Firebase SDK | 10.7 | Backend services |

---

## Application Layers

### 1. Entry Point & Providers (`src/main.tsx`)
Wraps the entire app in providers (order matters):
```
QueryClientProvider       ← React Query cache
  BrowserRouter           ← Routing
    LanguageProvider      ← i18n
      AuthProvider        ← Auth state
        NotificationProvider  ← Push notifications
          App
```

Also registers the FCM service worker (`public/firebase-messaging-sw.js`).

### 2. Routing (`src/App.tsx`)
All routes are declared here. Three categories:
- **Public** — `/login`, `/register`, `/forgot-password`, `/join-team`
- **Auth-only** — `/verify-email`
- **Protected** — everything else, wrapped in `<ProtectedRoute>` which may also require a specific permission

### 3. Layout (`src/components/layout/`)
- `AppLayout.tsx` — sticky header + sidebar + page content area
- `Sidebar.tsx` — navigation, role-aware menu, mobile drawer
- `Container.tsx` — max-width responsive wrapper (1200 px desktop)

### 4. Pages (`src/pages/`)
Route-level components. Each page is responsible for data fetching via React Query hooks and rendering its own UI. Pages import service functions from `src/services/firebase/`.

### 5. Components (`src/components/`)
Reusable UI. Grouped by domain: `chat/`, `club/`, `team/`, `calendar/`, `media/`, `notifications/`, `common/`, `layout/`.

### 6. Services (`src/services/firebase/`)
One file per domain. **All Firestore/Storage/FCM calls live here.** Components never call Firebase directly. This is the data access layer.

```
adminUsers.ts       attendance.ts       chats.ts
clubs.ts            emailVerification.ts  events.ts
leagueSchedule.ts   media.ts            messages.ts
messaging.ts        notifications.ts    orders.ts
parentChild.ts      requests.ts         seasons.ts
storage.ts          teams.ts            users.ts
vouchers.ts
```

### 7. Contexts (`src/contexts/`)
- `AuthContext.tsx` — current user, login/logout/register, email verification
- `LanguageContext.tsx` — active language, language switcher
- `NotificationContext.tsx` — FCM token, notification preferences

### 8. Hooks (`src/hooks/`)
- `usePermissions.ts` — exposes `can()`, `hasRole()`, `isClubOwner()`, etc.
- `useNotifications.ts` — notification management helpers

### 9. Types (`src/types/`)
- `index.ts` — all Firestore document interfaces (User, Club, Team, Event, Chat, …)
- `attendance.ts` — attendance-specific types
- `media.ts` — media-specific types

### 10. Permission System (`src/constants/permissions.ts` + `src/utils/permissions.ts`)
Roles and their allowed permissions are declared statically. Runtime checks are done via helpers. See [PERMISSIONS.md](PERMISSIONS.md) for full details.

---

## Data Flow Pattern

```
User action (click/submit)
  → React Hook Form validation
    → Service function in src/services/firebase/
      → Firestore write / Firebase Storage upload
        → React Query invalidation / real-time listener update
          → Component re-renders with new data
```

Real-time data (chats, notifications) use Firestore `onSnapshot` listeners wrapped in `useEffect`.

---

## Build & Output

```bash
npm run dev      # Dev server at http://localhost:5173 (HMR)
npm run build    # Outputs dist/ (~1 MB, ~274 KB gzipped)
npm run preview  # Serve dist/ locally
npm run lint     # ESLint check
```

TypeScript is compiled by Vite (not `tsc`), but strict mode is enabled in `tsconfig.json`.

---

## Deployment

### Vercel (primary)
`vercel.json` configures SPA fallback (all routes → `index.html`).

### Firebase Hosting (secondary)
`firebase.json` + `.firebaserc` (project `nexus-7f8f7`).

Both targets serve the pre-built `dist/` folder.
