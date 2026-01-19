# 🔥 Firebase Environment Setup - REQUIRED!

Your app needs Firebase credentials to work. Follow these steps:

---

## 🎯 Step 1: Get Your Firebase Config

### **Option A: You Already Have a Firebase Project (nexus-7f8f7)**

You mentioned you already have a Firebase project! Let's get the config:

1. Go to: https://console.firebase.google.com
2. Select your project: **nexus-7f8f7**
3. Click the ⚙️ **Settings** (gear icon) → **Project settings**
4. Scroll down to **"Your apps"** section
5. If you have a web app, you'll see it there
6. If NOT, click **"Add app"** → **Web** (</>) icon
7. Register app name: **"Nexus Web App"**
8. Click **"Register app"**
9. You'll see the **Firebase SDK configuration**

It looks like this:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyC...",
  authDomain: "nexus-7f8f7.firebaseapp.com",
  projectId: "nexus-7f8f7",
  storageBucket: "nexus-7f8f7.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123",
  measurementId: "G-ABC123"
};
```

---

## 🎯 Step 2: Create `.env.local` File

### **In Your Project Root:**
```
C:\Users\kicka\Documents\MyApps\Nexus\nexus\
```

### **Create a NEW file named:** `.env.local`

**IMPORTANT**: 
- The file name starts with a DOT (`.`)
- It has NO file extension (not `.txt`, just `.env.local`)

### **In Windows:**

**Method 1: Using Notepad**
1. Open Notepad
2. Copy the template below
3. Replace with your actual values
4. Save As → File name: `.env.local` (with quotes!)
5. Save as type: **All Files**
6. Save location: `C:\Users\kicka\Documents\MyApps\Nexus\nexus\`

**Method 2: Using VS Code / Cursor**
1. Right-click in file explorer
2. New File
3. Name it: `.env.local`
4. Paste the template
5. Replace with your values

---

## 📋 Template to Copy

Copy this into your `.env.local` file:

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIzaSyC...YOUR_ACTUAL_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=nexus-7f8f7.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=nexus-7f8f7
VITE_FIREBASE_STORAGE_BUCKET=nexus-7f8f7.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_FIREBASE_MEASUREMENT_ID=G-ABC123
```

---

## 🔄 Step 3: Replace Placeholder Values

Take the Firebase config values and replace in `.env.local`:

| Firebase Config | .env.local Variable |
|----------------|---------------------|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |
| `measurementId` | `VITE_FIREBASE_MEASUREMENT_ID` |

---

## 🎯 Step 4: Restart Dev Server

**IMPORTANT**: After creating `.env.local`, you MUST restart:

1. In terminal, press `Ctrl + C` to stop the dev server
2. Run again:
   ```bash
   npm run dev
   ```

---

## ✅ Verify It Works

After restarting, you should:
- ✅ NOT see the warning: "⚠️ Firebase is using placeholder config"
- ✅ Be able to register a new user
- ✅ Be able to login

---

## 🔒 Security Notes

### **NEVER commit `.env.local` to Git!**

It's already in `.gitignore`, so Git will ignore it automatically.

### **Why?**
- Your API keys are sensitive
- Anyone with these keys can access your Firebase project
- `.env.local` is for local development only

### **For Deployment (Vercel):**
You'll add these as **Environment Variables** in Vercel dashboard later.

---

## 🐛 Common Issues

### **Issue 1: Still seeing "placeholder config" warning**
**Solution**: 
- Make sure file is named `.env.local` (with the dot!)
- Restart dev server (`Ctrl+C`, then `npm run dev`)
- Check file is in project root (next to `package.json`)

### **Issue 2: "api-key-not-valid" error**
**Solution**:
- Double-check you copied the ENTIRE API key
- No extra spaces before/after the values
- No quotes around the values
- Restart dev server

### **Issue 3: File not found**
**Solution**:
- Windows hides file extensions by default
- Make sure it's `.env.local` not `.env.local.txt`
- In File Explorer: View → Show file extensions

---

## 📝 Example of Correct .env.local File

```env
VITE_FIREBASE_API_KEY=AIzaSyC-xxxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_FIREBASE_AUTH_DOMAIN=nexus-7f8f7.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=nexus-7f8f7
VITE_FIREBASE_STORAGE_BUCKET=nexus-7f8f7.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789012
VITE_FIREBASE_APP_ID=1:123456789012:web:abc123def456
VITE_FIREBASE_MEASUREMENT_ID=G-ABC1234XYZ
```

**Note**: 
- No spaces around `=`
- No quotes
- No semicolons
- One variable per line

---

## 🎯 Quick Checklist

- [ ] Went to Firebase Console
- [ ] Got my project config (nexus-7f8f7)
- [ ] Created `.env.local` file in project root
- [ ] Copied all 7 variables
- [ ] Replaced ALL placeholder values
- [ ] Saved the file
- [ ] Stopped dev server (`Ctrl+C`)
- [ ] Restarted dev server (`npm run dev`)
- [ ] Warning is gone!
- [ ] Can register users!

---

## 🚀 After Setup

Once you have Firebase configured:
1. You can register new users ✅
2. You can login ✅
3. Firestore database works ✅
4. File uploads work ✅
5. Authentication works ✅

---

**Need help? Let me know what step you're on!** 🔥


