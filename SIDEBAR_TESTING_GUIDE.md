# 🧪 Sidebar Testing Guide

## Quick Start Testing

### 1. Start Development Server
```bash
npm run dev
```

### 2. Test Mobile View (< 768px)

#### In Browser DevTools:
1. Press `F12` to open DevTools
2. Click the device toolbar icon (or `Ctrl+Shift+M`)
3. Select "iPhone 12 Pro" or set width to `375px`

#### What to Test:
- [ ] Hamburger button visible in top-left corner
- [ ] Sidebar NOT visible by default
- [ ] Click hamburger → sidebar slides in from left
- [ ] Dark backdrop appears and blurs content
- [ ] Click backdrop → sidebar slides out
- [ ] Click X button → sidebar slides out
- [ ] Click any menu item → sidebar closes AND navigates
- [ ] Active menu item has blue left border
- [ ] Notification badge shows unread count
- [ ] User avatar visible in sidebar footer
- [ ] Role badge displays under username

### 3. Test Desktop View (≥ 768px)

#### In Browser DevTools:
1. Set width to `1920px` (or use responsive mode)

#### What to Test:
- [ ] Sidebar always visible on left side
- [ ] Hamburger button NOT visible
- [ ] Content area starts after sidebar (no overlap)
- [ ] Sidebar is fixed (doesn't scroll with page)
- [ ] Hover over menu items → background changes
- [ ] Active item has blue left border
- [ ] Notification badge shows unread count
- [ ] Click user avatar → navigates to profile
- [ ] Scrolling page doesn't scroll sidebar

### 4. Test Role-Based Filtering

#### As Regular User:
```
Expected Menu Items:
✓ Dashboard
✓ Calendar
✓ Clubs
✓ Chat
✓ Notifications
✓ Profile

NOT visible:
✗ User Management
✗ Children
```

#### As Parent:
```
Expected Menu Items:
✓ Dashboard
✓ Calendar
✓ Clubs
✓ Chat
✓ Notifications
✓ Profile
✓ Children (if has childIds)

NOT visible:
✗ User Management
```

#### As Admin/Owner:
```
Expected Menu Items:
✓ Dashboard
✓ Calendar
✓ Clubs
✓ Chat
✓ Notifications
✓ Profile
✓ User Management

NOT visible (for regular admin):
✗ Children
```

### How to Test Different Roles:
1. Login as different users
2. OR temporarily change role in Firestore
3. OR use browser console:
```javascript
// In DevTools Console
localStorage.setItem('debug_role', 'admin');
// Then refresh page
```

---

## 🎯 Responsive Breakpoints to Test

| Device | Width | Expected Behavior |
|--------|-------|-------------------|
| iPhone SE | 375px | Sidebar hidden, hamburger visible |
| iPhone 12 | 390px | Sidebar hidden, hamburger visible |
| iPhone 12 Pro Max | 428px | Sidebar hidden, hamburger visible |
| iPad Mini | 768px | Sidebar visible, hamburger hidden |
| iPad Pro | 1024px | Sidebar visible, hamburger hidden |
| Laptop | 1440px | Sidebar visible, hamburger hidden |
| Desktop 4K | 2560px | Sidebar visible, hamburger hidden |

---

## 🔍 Visual Checks

### Sidebar Appearance:
- [ ] Background: Dark blue (#141B3D)
- [ ] Border: Subtle white (10% opacity)
- [ ] Icons: Visible and correctly sized
- [ ] Text: White and readable
- [ ] Spacing: Items not too cramped

### Active State:
- [ ] Blue left border (4px)
- [ ] Light blue background
- [ ] Text color white
- [ ] Icon color white
- [ ] Border smooth (no jagged edges)

### Hover State:
- [ ] Background lightens slightly
- [ ] Text color changes to white
- [ ] Transition is smooth (200ms)
- [ ] Cursor changes to pointer

### Notification Badge:
- [ ] Pink/red color (#FF3B81)
- [ ] White text
- [ ] Rounded (fully circular)
- [ ] Numbers centered
- [ ] Shows "99+" if count > 99

### User Footer:
- [ ] Avatar shows user photo OR initial
- [ ] Avatar has blue border
- [ ] Username truncates if too long
- [ ] Role badge shows correct role
- [ ] Clicking footer navigates to profile

---

## 🎬 Animation Checks

### Sidebar Slide-In (Mobile):
- [ ] Animation takes ~300ms
- [ ] Smooth (no stuttering)
- [ ] Eases in/out (not linear)
- [ ] Slides from left edge
- [ ] Doesn't bounce or overshoot

### Backdrop Fade-In:
- [ ] Fades in quickly (~200ms)
- [ ] Final opacity: 50%
- [ ] Blur effect visible
- [ ] No flash/flicker

### Hover Transitions:
- [ ] Background changes smoothly (200ms)
- [ ] Text color changes smoothly
- [ ] No jarring transitions
- [ ] Feels responsive

---

## ⚠️ Common Issues to Look For

### Layout Issues:
- [ ] Content overlapping sidebar on desktop
- [ ] Horizontal scrollbar appearing
- [ ] Sidebar cut off at bottom
- [ ] Footer not at bottom of sidebar
- [ ] Hamburger button covered by content

### Animation Issues:
- [ ] Sidebar slides in choppy
- [ ] Backdrop flashes
- [ ] Active state jumps
- [ ] Hover feels laggy

### Functionality Issues:
- [ ] Menu items don't navigate
- [ ] Active state wrong
- [ ] Badge doesn't update
- [ ] Sidebar doesn't close on mobile
- [ ] Can't click backdrop to close

### Accessibility Issues:
- [ ] Can't keyboard navigate
- [ ] Focus not visible
- [ ] Screen reader issues
- [ ] Contrast too low

---

## 🛠️ Debugging Tips

### Check Sidebar State:
```javascript
// In React DevTools
// Find Sidebar component
// Check "isMobileOpen" state
```

### Check Active Route:
```javascript
// In browser console
console.log(window.location.pathname);
```

### Check User Role:
```javascript
// In React DevTools
// Find AuthContext
// Check "user.role" value
```

### Force Mobile View:
```javascript
// In DevTools Console
document.body.style.width = '375px';
```

### Check Computed Styles:
1. Right-click sidebar
2. "Inspect Element"
3. Check "Computed" tab
4. Verify colors, widths, transforms

---

## 📸 Screenshot Comparison

### Mobile (Closed):
```
┌─────────────────────────┐
│ [☰]                     │
│                         │
│   Main Content          │
│                         │
│                         │
└─────────────────────────┘
```

### Mobile (Open):
```
┌──────────┬──────────────┐
│ Nexus [X]│ [BACKDROP]   │
│          │              │
│ Dashboard│              │
│ Calendar │              │
│ Clubs    │              │
│ Chat     │              │
│ Notif (3)│              │
│ Profile  │              │
│          │              │
│ [Avatar] │              │
│ John Doe │              │
│ Admin    │              │
└──────────┴──────────────┘
```

### Desktop:
```
┌──────────┬────────────────────────────────┐
│ Nexus    │ [Language] [Logout]            │
│          ├────────────────────────────────┤
│ Dashboard│                                │
│ Calendar │   Main Content Area            │
│ Clubs    │                                │
│ Chat     │   (Responsive Container)       │
│ Notif (3)│                                │
│ Profile  │                                │
│          │                                │
│ [Avatar] │                                │
│ John Doe │                                │
│ Admin    │                                │
└──────────┴────────────────────────────────┘
```

---

## ✅ Final Checklist

### Before Marking as Complete:
- [ ] Tested on Chrome
- [ ] Tested on Firefox
- [ ] Tested on Safari
- [ ] Tested on Edge
- [ ] Mobile view works (375px - 767px)
- [ ] Tablet view works (768px - 1023px)
- [ ] Desktop view works (1024px+)
- [ ] All menu items clickable
- [ ] Active state correct
- [ ] Role filtering works
- [ ] Animations smooth
- [ ] No console errors
- [ ] Build passes
- [ ] No accessibility warnings

### Performance:
- [ ] No layout shifts
- [ ] Animations smooth (60fps)
- [ ] No memory leaks
- [ ] Bundle size acceptable

### Accessibility:
- [ ] Keyboard navigable
- [ ] Screen reader friendly
- [ ] Focus visible
- [ ] ARIA labels present
- [ ] Color contrast sufficient

---

## 🎯 Quick Test Commands

```bash
# Build for production
npm run build

# Check bundle size
npm run build -- --mode=report

# Run dev server
npm run dev

# Check TypeScript errors
npm run type-check

# Run linter
npm run lint
```

---

## 📝 Test Report Template

```markdown
## Sidebar Test Report

Date: [DATE]
Tester: [NAME]
Browser: [Chrome/Firefox/Safari/Edge]
Version: [VERSION]

### Mobile View (375px - 767px):
- [ ] Hamburger visible
- [ ] Sidebar slides in/out
- [ ] Backdrop works
- [ ] Navigation works
- [ ] Active state correct

### Desktop View (1024px+):
- [ ] Sidebar always visible
- [ ] Fixed position
- [ ] Hover effects work
- [ ] Navigation works
- [ ] Active state correct

### Role-Based Filtering:
- [ ] User role: PASS/FAIL
- [ ] Parent role: PASS/FAIL
- [ ] Admin role: PASS/FAIL

### Issues Found:
1. [Issue description]
2. [Issue description]

### Overall Status: ✅ PASS / ❌ FAIL
```

---

## 🚀 Ready to Test!

Your sidebar is production-ready! Follow this guide to ensure everything works perfectly across all devices and user roles.

**Happy Testing! 🎉**


