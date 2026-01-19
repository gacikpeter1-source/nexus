# 🔥 Firebase Quick Commands

**Your Firebase Project**: [Add your project name here]  
**Vercel Project**: [Add your Vercel URL here]

---

## 📝 Step 1: Create `.env.local` File

Create a file named `.env.local` in the project root with:

```env
VITE_FIREBASE_API_KEY=your-api-key-here
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id
```

Get these values from:
1. [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. ⚙️ Project Settings → Your apps → Web app

---

## 🚀 Step 2: Test Locally

```bash
# Start development server
npm run dev

# The app will warn you if Firebase is not configured
# Open http://localhost:5173
```

---

## 🔒 Step 3: Deploy Firestore Rules

The `firestore.rules` file contains all security rules.

```bash
# Install Firebase CLI (if needed)
npm install -g firebase-tools

# Login
firebase login

# Initialize (first time only)
firebase init firestore
# - Select: Use existing project
# - Choose your Firebase project
# - Accept default firestore.rules
# - Accept default firestore.indexes.json

# Deploy rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes
```

---

## ☁️ Step 4: Add to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/)
2. Select your Nexus project
3. Settings → Environment Variables
4. Add each variable:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
5. Redeploy

---

## ✅ Step 5: Enable Firebase Services

### Authentication
```
Firebase Console → Authentication → Get started
→ Sign-in method → Enable "Email/Password"
```

### Firestore Database
```
Firebase Console → Firestore Database → Create database
→ Start in test mode → Select location → Enable
```

### Storage
```
Firebase Console → Storage → Get started
→ Start in test mode → Done
```

---

## 🧪 Step 6: Test

### Test Locally
1. Run `npm run dev`
2. Go to `/register`
3. Create account
4. Check Firebase Console → Authentication → Users

### Test Production
1. Push to GitHub: `git push`
2. Vercel auto-deploys
3. Visit your Vercel URL
4. Test registration

---

## 📚 Useful Commands

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# View Firebase projects
firebase projects:list

# Check current project
firebase use

# Switch project
firebase use your-project-id

# Open Firebase Console
firebase open

# View Firestore data
firebase firestore:data
```

---

## 🐛 Troubleshooting

### "Firebase config not found"
→ Check `.env.local` exists with correct values

### "Permission denied"
→ Deploy Firestore rules: `firebase deploy --only firestore:rules`

### "Index required"
→ Click link in console error, or run: `firebase deploy --only firestore:indexes`

### "CORS errors"
→ Add Vercel domain to Firebase Console → Authentication → Settings → Authorized domains

---

## ✅ Checklist

- [ ] Created `.env.local` with Firebase config
- [ ] Enabled Authentication (Email/Password)
- [ ] Created Firestore Database
- [ ] Enabled Storage
- [ ] Deployed Firestore rules
- [ ] Deployed Firestore indexes
- [ ] Added env vars to Vercel
- [ ] Tested registration locally
- [ ] Pushed to GitHub
- [ ] Tested on Vercel

---

**Ready to configure!** 🚀

See `FIREBASE_SETUP.md` for detailed instructions.


