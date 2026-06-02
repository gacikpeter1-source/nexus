# Nexus — Development Guide

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 20.10+ |
| npm | 10+ |
| Git | any |

---

## First-Time Setup (Fresh Machine)

```bash
# 1. Install dependencies
npm install

# 2. Verify environment variables exist
# File: .env.local (already present in the project root)
# If missing, see Environment Variables section below

# 3. Start the dev server
npm run dev
# → http://localhost:5173
```

> **Note:** The project was recovered from a broken HDD. `node_modules/` is likely missing — always run `npm install` first.

---

## Available Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start Vite dev server with HMR at `localhost:5173` |
| `npm run build` | TypeScript check + production build → `dist/` |
| `npm run preview` | Serve the `dist/` folder locally |
| `npm run lint` | ESLint check (TypeScript + React rules) |

---

## Environment Variables

File: `.env.local` (already in the project, **do not commit to git**)

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=nexus-7f8f7.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=nexus-7f8f7
VITE_FIREBASE_STORAGE_BUCKET=nexus-7f8f7.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_FIREBASE_VAPID_KEY=...        # Required for push notifications
```

All variables are prefixed `VITE_` so Vite exposes them to the browser bundle.

---

## Project Structure (Quick Reference)

```
nexus/
├── public/                 Static assets + FCM service worker
├── src/
│   ├── App.tsx             All route definitions
│   ├── main.tsx            App entry point + providers
│   ├── index.css           Tailwind directives + global styles
│   ├── components/         Reusable UI components
│   ├── pages/              Route-level page components
│   ├── services/firebase/  All Firebase data access (19 modules)
│   ├── contexts/           AuthContext, LanguageContext, NotificationContext
│   ├── hooks/              usePermissions, useNotifications
│   ├── types/              TypeScript interfaces
│   ├── constants/          permissions.ts (role/permission matrix)
│   ├── utils/              permissions.ts (helper functions)
│   ├── config/             firebase.ts, brand.ts, i18n.ts
│   └── translations/       en.json, sk.json
├── .env.local              Firebase credentials (not in git)
├── firebase.json           Firebase CLI config
├── firestore.rules         Firestore security rules
├── firestore.indexes.json  Composite indexes
├── storage.rules           Storage security rules
├── tailwind.config.js      Tailwind theme extensions
├── vite.config.ts          Vite config
└── tsconfig.json           TypeScript config
```

---

## Path Aliases

`@/*` maps to `./src/*` (configured in `tsconfig.json` and `vite.config.ts`).

```ts
import { usePermissions } from '@/hooks/usePermissions'
import { PERMISSIONS } from '@/constants/permissions'
```

---

## Adding a New Feature — Checklist

1. **Types** — add interfaces to `src/types/index.ts`
2. **Service** — add a file (or extend existing) in `src/services/firebase/`
3. **Page** — create page component in the appropriate `src/pages/` subfolder
4. **Route** — add `<Route>` in `src/App.tsx`
5. **Navigation** — add menu item in `src/components/layout/Sidebar.tsx` if needed
6. **Permissions** — add permission constants to `src/constants/permissions.ts` and update `ROLE_PERMISSIONS`
7. **Translations** — add keys to both `src/translations/en.json` and `src/translations/sk.json`

---

## Adding a New Page

```tsx
// src/pages/feature/MyPage.tsx
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { getSomeData } from '@/services/firebase/someService'

export default function MyPage() {
  const { t } = useTranslation()
  const { data, isLoading } = useQuery({
    queryKey: ['someData'],
    queryFn: getSomeData,
  })

  return (
    <div>
      <h1>{t('feature.title')}</h1>
      {/* ... */}
    </div>
  )
}
```

Then in `App.tsx`:
```tsx
import MyPage from './pages/feature/MyPage'
// ...
<Route path="/my-feature" element={<MyPage />} />
```

---

## Forms

Use `react-hook-form` consistently:

```tsx
import { useForm } from 'react-hook-form'

const { register, handleSubmit, formState: { errors } } = useForm<FormData>()

const onSubmit = async (data: FormData) => {
  await myServiceFunction(data)
}
```

---

## Firebase Local Emulator (Optional)

Firebase emulator is configured in `src/config/firebase.ts`. To use it:

```bash
# Install Firebase CLI globally if not present
npm install -g firebase-tools

# Start emulators
firebase emulators:start

# The app auto-connects to emulators when running in dev mode
# (check firebase.ts for emulator connection logic)
```

---

## Deploying

### Vercel
```bash
# One-time: install Vercel CLI
npm install -g vercel

vercel --prod
```

### Firebase Hosting
```bash
npm run build
firebase deploy --only hosting
```

### Manual (any static host)
```bash
npm run build
# Upload contents of dist/ to your host
```

---

## TypeScript Notes

- Strict mode is enabled (`tsconfig.json`)
- All Firestore documents should match interfaces in `src/types/index.ts`
- `Timestamp | string` union is used on date fields to handle both Firestore Timestamps and serialised ISO strings
- Build with `npm run build` runs TypeScript check — zero errors expected

---

## Known Issues (Post-Recovery)

- `node_modules/` is absent — run `npm install` before anything
- Some packages listed in `package.json` may have updated since the original development; run `npm install` and check for peer dependency warnings
- Test the push notification flow after reinstalling — FCM service worker registration is environment-sensitive
