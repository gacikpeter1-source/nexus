# 🎨 Replace Favicon Files - Step by Step Guide

Your new Nexus logo is **BEAUTIFUL**! 🌟

The cosmic "X" with galaxy effects is perfect for your brand!

---

## 📋 Step-by-Step Instructions

### **Step 1: Stop Dev Server**
In your terminal, press `Ctrl + C` to stop the running dev server.

### **Step 2: Replace Favicon Files**

Copy these files from:
```
C:\Users\kicka\Desktop\Peto\WebApp\Nexus\picturs for Favicon\extracted\
```

To:
```
C:\Users\kicka\Documents\MyApps\Nexus\nexus\public\
```

**Files to copy** (overwrite existing):
- ✅ `favicon.ico`
- ✅ `favicon.svg`
- ✅ `favicon-96x96.png`
- ✅ `apple-touch-icon.png`
- ✅ `web-app-manifest-192x192.png`
- ✅ `web-app-manifest-512x512.png`

### **Step 3: Copy Main Logo**

Copy:
```
C:\Users\kicka\Desktop\Peto\WebApp\Nexus\picturs for Favicon\ChatGPT Image 15. 1. 2026, 22_26_41.png
```

To:
```
C:\Users\kicka\Documents\MyApps\Nexus\nexus\public\nexus-icon.png
```

### **Step 4: Update Logo Component**

The logo component needs to use `.png` instead of `.svg`:

Open: `src\components\common\Logo.tsx`

Change line 20 from:
```tsx
src="/nexus-icon.svg"
```

To:
```tsx
src="/nexus-icon.png"
```

### **Step 5: Update Login/Register Pages**

**Login Page** (`src\pages\auth\Login.tsx`):

Find (around line 53):
```tsx
src="/nexus-icon.svg"
```

Change to:
```tsx
src="/nexus-icon.png"
```

**Register Page** (`src\pages\auth\Register.tsx`):

Find (around line 81):
```tsx
src="/nexus-icon.svg"
```

Change to:
```tsx
src="/nexus-icon.png"
```

### **Step 6: Update index.html**

Open: `index.html`

Change the cache buster version from `v=2` to `v=3`:

```html
<!-- Before -->
<link rel="icon" type="image/x-icon" href="/favicon.ico?v=2" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png?v=2" />

<!-- After -->
<link rel="icon" type="image/x-icon" href="/favicon.ico?v=3" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=3" />
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png?v=3" />
```

### **Step 7: Restart Dev Server**

```bash
npm run dev
```

### **Step 8: Clear Browser Cache**

**Hard refresh:**
```
Ctrl + Shift + R
```

**Or open in incognito:**
```
Ctrl + Shift + N
```

---

## ✅ What You'll See

After completing these steps, you'll see your **beautiful cosmic "X" logo**:
- 🌟 Galaxy-themed "X" with stars
- 🎨 Vibrant blue, purple, pink, orange colors
- ✨ Sparkle effects
- 💫 Professional and eye-catching

This logo will appear:
- ✅ Browser tab (favicon)
- ✅ Login screen
- ✅ Register screen
- ✅ Bookmarks
- ✅ iOS home screen
- ✅ Android home screen

---

## 🎯 Quick Copy Commands (Windows Explorer)

1. Open File Explorer
2. Navigate to: `C:\Users\kicka\Desktop\Peto\WebApp\Nexus\picturs for Favicon\extracted\`
3. Select all files (`Ctrl + A`)
4. Copy (`Ctrl + C`)
5. Navigate to: `C:\Users\kicka\Documents\MyApps\Nexus\nexus\public\`
6. Paste (`Ctrl + V`)
7. Click "Replace" when prompted

Then:
8. Go back to: `C:\Users\kicka\Desktop\Peto\WebApp\Nexus\picturs for Favicon\`
9. Copy: `ChatGPT Image 15. 1. 2026, 22_26_41.png`
10. Paste to: `C:\Users\kicka\Documents\MyApps\Nexus\nexus\public\`
11. Rename to: `nexus-icon.png`

---

## 🚀 After You're Done

Let me know when you've completed these steps, and I'll:
1. Update the code files for you
2. Verify everything is working
3. Help you test the new logo

---

**Your new logo is AMAZING! Let's get it installed! 🌟**


