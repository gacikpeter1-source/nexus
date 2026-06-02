# Nexus — Design System

## Theme

The application defaults to a **dark theme**. All colour values below refer to the dark theme. Light theme support is scaffolded but dark is the primary.

---

## Colour Palette

### Background Layers (dark theme)
These map to custom Tailwind colour names defined in `tailwind.config.js`.

| Token | Hex | Usage |
|---|---|---|
| `app-primary` | `#0A0E27` | Page background |
| `app-secondary` | `#141B3D` | Section/panel background |
| `app-card` | `#1C2447` | Card, modal, component background |

### Brand Accent Colours
| Token | Hex | Usage |
|---|---|---|
| `app-blue` | `#0066FF` | Primary CTA buttons, links |
| `app-cyan` | `#00D4FF` | Secondary accent, highlights |

### Semantic Colours (standard Tailwind)
| Name | Tailwind class | Hex | Usage |
|---|---|---|---|
| Royal Blue | — | `#4169E1` | Brand primary (logo, header) |
| Orange | — | `#FF8C00` | Brand accent (highlights) |
| Success | `green-500` | `#10b981` | Confirmations, present status |
| Warning | `amber-400` | `#f59e0b` | Warnings, late status |
| Error | `red-500` | `#ef4444` | Errors, absent status |
| Info | `blue-500` | `#3b82f6` | Info messages |

---

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
             Oxygen, Ubuntu, sans-serif;
font-family-mono: 'Fira Code', monospace;
```

### Scale
Standard Tailwind typography scale (`text-xs` → `text-4xl`). No custom sizes.

### Line Length
Maximum **75 characters** per line for body text (readability rule from `src/config/brand.ts`).

---

## Spacing & Layout

### Responsive Breakpoints
Defined in `tailwind.config.js`:

| Name | Min-width | Device |
|---|---|---|
| `xs` | 375 px | Small phone |
| `sm` | 640 px | Large phone |
| `md` | 768 px | Tablet |
| `lg` | 1024 px | Desktop |
| `xl` | 1280 px | Large desktop |
| `2xl` | 1536 px | Ultrawide |
| `3xl` | 2560 px | 4K |

### Page Padding
| Breakpoint | Padding |
|---|---|
| Mobile | 16 px |
| Tablet | 24 px |
| Desktop | 32 px |

### Container (`src/components/layout/Container.tsx`)
- Max-width: **1200 px** on desktop
- On ultrawide (> 2560 px): **60 vw**
- Centred with auto horizontal margins

### Touch Targets
Minimum **44 × 44 px** for all interactive elements.

---

## Shadows
Custom shadow utilities from `tailwind.config.js`:

| Class | Usage |
|---|---|
| `shadow-card` | Floating card depth |
| `shadow-button` | Button depth on hover |

---

## Animations
| Class | Description |
|---|---|
| `animate-fade-in` | Smooth opacity entrance (custom keyframe) |

---

## Component Patterns

### Cards
Background `app-card`, rounded corners (`rounded-xl`), subtle border (`border border-white/10`).

### Buttons
- Primary: `bg-app-blue text-white rounded-lg px-4 py-2 hover:bg-blue-700`
- Secondary: `bg-app-secondary text-white border border-white/20`
- Danger: `bg-red-600 text-white`

### Role Badges (`src/components/common/RoleBadge.tsx`)
Coloured pill showing a user's role. Colours come from `getRoleColor()` in `src/utils/permissions.ts`.

| Role | Colour |
|---|---|
| admin | Red |
| clubOwner | Purple |
| trainer | Blue |
| assistant | Cyan |
| user | Grey |
| parent | Green |

### Forms
- Labels: `text-sm text-gray-400 mb-1`
- Inputs: `bg-app-secondary border border-white/20 rounded-lg px-3 py-2 text-white`
- Error text: `text-red-400 text-xs mt-1`

---

## Icons
No dedicated icon library is declared. The project uses standard Unicode/emoji for simple cases and inline SVG for custom icons where needed.

---

## Layout Structure

```
┌─────────────────────────────────────┐
│  Header (sticky)                    │  h-16
│  Logo | Nav title | Lang | Logout   │
├──────────┬──────────────────────────┤
│          │                          │
│ Sidebar  │  Page Content            │
│ (fixed)  │  <Container>             │
│  240 px  │    <Outlet />            │
│          │                          │
├──────────┴──────────────────────────┤
│  Footer                             │
└─────────────────────────────────────┘
```

On mobile: sidebar is hidden behind a hamburger button and slides in as a drawer with a backdrop overlay.

---

## Internationalisation Notes

All user-facing text must go through `useTranslation()`. Never hard-code strings in English directly in components — always use a translation key. Both `en.json` and `sk.json` must have the key.

Default language is **Slovak (`sk`)**. Language choice is persisted in `localStorage`.
