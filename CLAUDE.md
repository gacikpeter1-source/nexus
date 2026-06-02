# Nexus — Claude Code Context

## What This Is
Nexus is a Club & Team Management web application. Users are club owners, trainers, assistants, members, and parents managing sports clubs and teams.

**Stack:** React 18 + TypeScript + Vite + TailwindCSS + Firebase (Auth, Firestore, Storage, FCM)  
**Deployment:** Vercel (primary), Firebase Hosting (secondary)  
**Firebase project:** `nexus-7f8f7`  
**Default language:** Slovak (`sk`), secondary English (`en`)  
**Theme:** Dark (default)

## Key Directories
```
src/
  App.tsx               # All routes
  main.tsx              # Providers setup
  components/           # Reusable UI components
    layout/             # AppLayout, Sidebar, Container
    chat/               # Real-time messaging components
    club/               # Club management modals/forms
    common/             # Logo, RoleBadge, LanguageSwitcher
  pages/                # Route-level page components
    auth/               # Login, Register, VerifyEmail, ForgotPassword
    clubs/              # ClubsList, ClubView, ClubSettings, ClubTeamsPage, CreateClub
    calendar/           # CalendarView, CreateEvent, EventDetail
    teams/              # TeamView
    chat/               # ChatsPage
    orders/             # OrdersPage, CreateOrder, OrderDetail, RespondToOrder
    training/           # TrainingBoard
  services/firebase/    # 19 Firebase service modules (one per domain)
  contexts/             # AuthContext, LanguageContext, NotificationContext
  hooks/                # usePermissions, useNotifications
  types/                # TypeScript interfaces (index.ts is main)
  constants/            # permissions.ts (roles + permission matrix)
  utils/                # permissions.ts (helper functions)
  config/               # firebase.ts, brand.ts, i18n.ts
  translations/         # en.json, sk.json (400+ keys each)
```

## Role Hierarchy
```
admin (5) > clubOwner (4) > trainer (3) > assistant (2) > user/parent (1)
```

## Permission System
Defined in `src/constants/permissions.ts`. 30+ granular permissions. Each role gets an explicit list — `admin` gets all. Check via `usePermissions` hook or `utils/permissions.ts` helpers.

## Firebase Services Pattern
Every domain has a dedicated service file in `src/services/firebase/`. All Firestore queries go through these — never call Firestore directly from components.

## i18n
Use `useTranslation()` from `react-i18next`. All user-facing strings must have keys in both `en.json` and `sk.json`.

## Forms
Use `react-hook-form`. Do not build uncontrolled forms.

## State Management
- Server state: TanStack React Query (`useQuery`, `useMutation`)
- Auth state: `useAuth()` from `AuthContext`
- Local UI state: `useState`/`useReducer`

## Brand Colors (TailwindCSS)
- `app-primary` — `#0A0E27` (page background)
- `app-secondary` — `#141B3D` (section background)
- `app-card` — `#1C2447` (card/component background)
- `app-blue` — `#0066FF` (primary CTA)
- `app-cyan` — `#00D4FF` (accent)

## Route Protection
Wrap pages in `<ProtectedRoute requiredPermission={PERMISSIONS.X}>`. Without `requiredPermission`, it only requires auth.

## Known State (as of recovery)
- `node_modules/` may not exist — run `npm install` first
- `dist/` folder exists with a previous production build
- `.env.local` contains valid Firebase credentials
