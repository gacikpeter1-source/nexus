# 🔥 Firebase Configuration Guide

**Status**: Ready to Configure  
**Firebase Project**: Existing  
**Deployment**: Vercel + GitHub

---

## 📋 Step-by-Step Configuration

### Step 1: Get Firebase Configuration

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your existing project
3. Click the **gear icon** (⚙️) → **Project settings**
4. Scroll down to **"Your apps"** section
5. If you haven't added a web app yet:
   - Click **"Add app"** → **Web** (</> icon)
   - Register app name: `Nexus`
   - **Don't** check "Firebase Hosting" (using Vercel)
   - Click **"Register app"**
6. Copy the `firebaseConfig` object

It will look like this:
```javascript
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

### Step 2: Update Firebase Config File

**File**: `src/config/firebase.ts`

Replace the placeholder config with your actual Firebase config.

---

### Step 3: Environment Variables (Recommended)

For security, use environment variables in production.

**Create `.env.local`**:
```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

**Update `firebase.ts`** to use env variables:
```typescript
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "placeholder",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "placeholder",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "placeholder",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "placeholder",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "placeholder",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "placeholder",
};
```

**Add to Vercel**:
1. Go to Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Add each variable (without `VITE_` prefix if needed)

---

### Step 4: Enable Firebase Services

#### 4.1 Authentication
1. Firebase Console → **Authentication**
2. Click **"Get started"**
3. **Sign-in method** tab
4. Enable **Email/Password**
5. (Optional) Enable **Google** sign-in

#### 4.2 Firestore Database
1. Firebase Console → **Firestore Database**
2. Click **"Create database"**
3. Choose **"Start in test mode"** (we'll add security rules later)
4. Select location (closest to your users)
5. Click **"Enable"**

#### 4.3 Storage
1. Firebase Console → **Storage**
2. Click **"Get started"**
3. Start in **test mode**
4. Use default location
5. Click **"Done"**

#### 4.4 Cloud Messaging (Optional - for push notifications)
1. Firebase Console → **Cloud Messaging**
2. Click **"Get started"**
3. (Configuration needed later for push notifications)

---

### Step 5: Deploy Firestore Security Rules

**File**: Create `firestore.rules` in project root

Copy the rules from `FIRESTORE_RULES.md` into this file.

**Deploy Rules**:
```bash
# Install Firebase CLI (if not installed)
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project
firebase init firestore
# Select: Use an existing project
# Choose your project
# Accept default firestore.rules
# Accept default firestore.indexes.json

# Deploy rules
firebase deploy --only firestore:rules
```

---

### Step 6: Create Firestore Indexes

Some queries require indexes. Create `firestore.indexes.json`:

```json
{
  "indexes": [
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "clubId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "teamId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "createdBy", "order": "ASCENDING" },
        { "fieldPath": "type", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "clubId", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" },
        { "fieldPath": "date", "order": "ASCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

**Deploy Indexes**:
```bash
firebase deploy --only firestore:indexes
```

---

### Step 7: Test Firebase Connection

**Run Development Server**:
```bash
npm run dev
```

**Test Authentication**:
1. Go to http://localhost:5173/register
2. Create a test account
3. Check Firebase Console → Authentication → Users
4. You should see the new user!

**Test Firestore**:
1. Login with your test account
2. The app should create a user document in Firestore
3. Check Firebase Console → Firestore Database → users collection
4. You should see your user data!

---

### Step 8: Vercel Environment Variables

Add the same environment variables to Vercel:

1. Vercel Dashboard → Your Project
2. Settings → Environment Variables
3. Add each variable:

```
VITE_FIREBASE_API_KEY = your-api-key
VITE_FIREBASE_AUTH_DOMAIN = your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID = your-project-id
VITE_FIREBASE_STORAGE_BUCKET = your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID = your-sender-id
VITE_FIREBASE_APP_ID = your-app-id
```

4. Redeploy your app

---

### Step 9: GitHub Integration

**.gitignore** already includes:
```
.env.local
.env*.local
```

**Push to GitHub**:
```bash
git add .
git commit -m "Configure Firebase"
git push origin main
```

Vercel will auto-deploy!

---

## 🔒 Security Checklist

- [ ] Firestore rules deployed
- [ ] Authentication enabled
- [ ] Storage rules configured
- [ ] Environment variables in Vercel
- [ ] API keys not in public code
- [ ] `.env.local` in `.gitignore`
- [ ] Test mode disabled in production

---

## 🧪 Testing Checklist

### Authentication
- [ ] User registration works
- [ ] User login works
- [ ] User profile displays
- [ ] Email verification (optional)

### Firestore
- [ ] User document created on signup
- [ ] Can create clubs
- [ ] Can view clubs list
- [ ] Can create events
- [ ] Can RSVP to events

### Permissions
- [ ] Club owners can manage clubs
- [ ] Trainers can create events
- [ ] Users can view but not edit

---

## 🚨 Common Issues

### Issue: "Firebase config not found"
**Solution**: Check that environment variables are loaded correctly

### Issue: "Permission denied" in Firestore
**Solution**: Deploy security rules with `firebase deploy --only firestore:rules`

### Issue: "CORS errors"
**Solution**: Add your domain to Firebase authorized domains:
1. Firebase Console → Authentication → Settings
2. Authorized domains → Add your Vercel domain

### Issue: "Indexes required"
**Solution**: Firebase will show a link in console errors - click to create index

---

## 📚 Next Steps After Configuration

1. **Test All Features**: Registration, login, clubs, events
2. **Add Test Data**: Create sample clubs and events
3. **Invite Users**: Share your Vercel URL
4. **Monitor Usage**: Firebase Console → Analytics
5. **Set Up Billing**: Firebase Console → Spark Plan (if needed)

---

## 🎯 Production Readiness

Before going live:

1. **Switch Firestore to Production Mode**
   - Deploy security rules
   - Test all permissions
   - Remove test data

2. **Configure Email Templates**
   - Firebase Console → Authentication → Templates
   - Customize verification emails
   - Set your domain

3. **Set Up Custom Domain**
   - Vercel → Domains
   - Add your custom domain
   - Add to Firebase authorized domains

4. **Enable Monitoring**
   - Vercel Analytics
   - Firebase Performance Monitoring
   - Sentry (error tracking)

5. **Backup Strategy**
   - Firestore automatic backups (paid)
   - Export important data regularly

---

## 📞 Quick Commands

```bash
# Start development
npm run dev

# Build for production
npm run build

# Test production build locally
npm run preview

# Deploy Firestore rules
firebase deploy --only firestore:rules

# Deploy indexes
firebase deploy --only firestore:indexes

# View Firestore data
firebase firestore:data

# Firebase login
firebase login

# Check Firebase project
firebase projects:list
```

---

**Status**: Ready to configure! 🚀

Follow the steps above and let me know if you need help with any step!


