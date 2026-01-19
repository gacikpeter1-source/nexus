# ⚡ Nexus - Quick Start Guide

**5-Minute Setup** | **Ready for Firebase Config**

---

## ✅ Already Done (Phase 1)

- ✅ Full React + TypeScript application configured
- ✅ All dependencies installed (383 packages)
- ✅ Authentication pages (Login, Register)
- ✅ Responsive layout system
- ✅ TypeScript types for all database collections
- ✅ Design system with Royal Blue + Orange colors
- ✅ **Build test: SUCCESS** ✓

---

## 🔥 3 Steps to Get Started

### 1. Create Firebase Project (5 min)

Visit: https://console.firebase.google.com/

```
✓ Click "Add Project"
✓ Name it: "nexus" (or your preference)
✓ Enable Google Analytics (optional)
✓ Create project
```

### 2. Enable Firebase Services (3 min)

**Authentication:**
- Go to Authentication → Get Started
- Enable "Email/Password" sign-in method

**Firestore:**
- Go to Firestore Database → Create Database
- Start in "Test Mode"
- Choose your region
- Click Enable

**Get Config:**
- Project Settings (gear icon) → General
- Scroll to "Your apps" → Click Web icon (`</>`)
- Copy the `firebaseConfig` object

### 3. Update Config (2 min)

**File**: `src/config/firebase.ts`

Replace this:
```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  // ...
};
```

With your actual config:
```typescript
const firebaseConfig = {
  apiKey: "AIzaSyC...",  // Your actual values
  authDomain: "nexus-abc123.firebaseapp.com",
  projectId: "nexus-abc123",
  storageBucket: "nexus-abc123.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## 🚀 Run the App

```bash
# Start development server
npm run dev
```

**Opens at**: http://localhost:5173

---

## 🎯 Test It Out

1. **Register**: Visit `/register`
   - Enter name, email, password
   - Check email for verification link

2. **Login**: Visit `/login`
   - Enter credentials
   - Access dashboard

3. **Explore**: Visit `/`
   - See dashboard
   - Test navigation
   - Check responsive design (resize browser)

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `src/config/firebase.ts` | ⚠️ **UPDATE THIS** with your config |
| `src/pages/auth/Login.tsx` | Login page |
| `src/pages/auth/Register.tsx` | Registration page |
| `src/contexts/AuthContext.tsx` | Auth state management |
| `README.md` | Full documentation |
| `.cursorrules` | AI assistant guidelines |

---

## 🎨 Design System Colors

```css
Primary:   #4169E1  (Royal Blue)  → bg-primary
Accent:    #FF8C00  (Orange)      → bg-accent
Success:   #10b981  (Green)       → bg-success
Warning:   #f59e0b  (Amber)       → bg-warning
Error:     #ef4444  (Red)         → bg-error
```

---

## 📱 Responsive Breakpoints

```
Mobile:    < 768px  (full width, 16-24px padding)
Tablet:    768px    (centered, max 720px)
Desktop:   1024px   (centered, max 960px)
Large:     1440px   (centered, max 1200px)
Ultrawide: 2560px   (60% viewport width)
```

---

## 🗺️ What's Next (Phase 2)

Once Firebase is configured:

- [ ] Implement permission system
- [ ] Create user profile pages
- [ ] Build club creation flow
- [ ] Add team management
- [ ] Implement calendar views

See `README.md` for full roadmap.

---

## 📚 Documentation

**Project Docs**: `README.md`, `SETUP_COMPLETE.md`, `BUILD_SUMMARY.md`  
**Feature Docs**: `../nexus-app/docs/` (comprehensive documentation)  
**AI Guidelines**: `.cursorrules`

---

## 💡 Commands

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Lint code
```

---

## ❓ Common Issues

### "Firebase config not found"
→ Update `src/config/firebase.ts` with your actual config

### "Email not verified"
→ Check your email inbox for verification link

### "Module not found"
→ Run `npm install` to reinstall dependencies

---

## 🎉 You're Ready!

**Total Setup Time**: ~10 minutes  
**Files Ready**: 25+ files created  
**TypeScript Types**: All database collections  
**Build Status**: ✅ Verified successful  

**Now go build something amazing!** 🚀

---

**Questions?** See `README.md` or `BUILD_SUMMARY.md` for detailed documentation.


