# 🔔 Firebase Push Notifications - Setup Guide

## ✅ **Implementation Status**

### **Completed Components**

1. **✅ Service Worker** (`public/firebase-messaging-sw.js`)
   - Handles background notifications
   - Manages notification clicks
   - Navigates to correct pages based on notification data

2. **✅ Notification Hook** (`src/hooks/useNotifications.ts`)
   - Requests browser permissions
   - Registers FCM tokens
   - Manages user notification settings
   - Listens for foreground messages

3. **✅ Settings UI Component** (`src/components/notifications/NotificationSettings.tsx`)
   - Mobile-first responsive design
   - Master notification toggle
   - Individual notification type controls
   - Permission status display
   - iOS Safari warnings

4. **✅ Notification Service** (`src/services/firebase/notifications.ts`)
   - Helper functions for sending notifications
   - Team notifications
   - Club announcements
   - Event reminders
   - Join request notifications

5. **✅ User Interface Integration**
   - Added to Profile page
   - Translations (English & Slovak)
   - Dark theme styling

---

## 🚀 **Setup Instructions**

### **Step 1: Firebase Console Configuration**

#### **1.1 Enable Cloud Messaging**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Project Settings** → **Cloud Messaging** tab
4. Click **Generate new key pair** under "Web Push certificates"
5. Copy the generated VAPID key

#### **1.2 Update Environment Variables**
Add to your `.env.local` file:

```env
# Existing Firebase config
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

# ADD THIS - VAPID Key from Step 1.1
VITE_FIREBASE_VAPID_KEY=YOUR_VAPID_KEY_HERE
```

#### **1.3 Update Service Worker Config**
Edit `public/firebase-messaging-sw.js` and replace placeholder values:

```javascript
firebase.initializeApp({
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
});
```

---

### **Step 2: Firestore Security Rules**

Add these rules to `firestore.rules`:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Notifications collection
    match /notifications/{notificationId} {
      // Users can read their own notifications
      allow read: if request.auth != null && 
                     request.auth.uid == resource.data.recipientId;
      
      // Only create notifications (not update/delete directly)
      // This should be done via Cloud Functions for security
      allow create: if request.auth != null;
    }
    
    // ... other existing rules ...
  }
}
```

---

### **Step 3: Test Notification Permissions**

#### **3.1 Local Testing**
1. Start development server: `npm run dev`
2. Open browser console
3. Navigate to Profile page
4. Click "Enable Notifications" toggle
5. Accept browser permission prompt
6. Check console for: `✅ FCM Token registered`

#### **3.2 Check Firestore**
Verify token is saved in `users/{userId}`:
```json
{
  "fcmToken": "long-token-string",
  "lastTokenUpdate": "2026-01-21T...",
  "notificationPreferences": {
    "eventReminders": true,
    "teamUpdates": true,
    "chatMessages": true,
    // ... other preferences
  }
}
```

---

### **Step 4: Integrate Notifications into Features**

#### **Example 1: Event Creation**
```typescript
import { sendEventReminderNotification } from '../services/firebase/notifications';

// In your event creation function
const handleCreateEvent = async (eventData) => {
  // Create event...
  const eventId = await createEvent(eventData);
  
  // Notify team members
  await sendEventReminderNotification(
    eventId,
    eventData.teamId,
    eventData.clubId,
    user.id,
    eventData.title,
    eventData.date,
    eventData.startTime
  );
};
```

#### **Example 2: Join Request**
```typescript
import { sendJoinRequestNotification } from '../services/firebase/notifications';

// In join request submission
const handleSubmitJoinRequest = async () => {
  // Create join request...
  
  // Notify trainers
  await sendJoinRequestNotification(
    clubId,
    user.id,
    user.displayName,
    teamName
  );
};
```

#### **Example 3: Role Change**
```typescript
import { sendRoleChangeNotification } from '../services/firebase/notifications';

// When updating user role
const handleRoleChange = async (userId, newRole) => {
  // Update role in Firestore...
  
  // Notify user
  await sendRoleChangeNotification(
    userId,
    currentUserId,
    newRole,
    teamName,
    clubId,
    teamId
  );
};
```

---

## 🔧 **Cloud Functions (Required for Production)**

### **Why Cloud Functions?**
The current implementation creates notification **documents** but doesn't send actual push notifications. To send push notifications, you need Firebase Cloud Functions.

### **Setup Cloud Functions**

#### **1. Install Firebase Admin SDK**
```bash
cd functions
npm install firebase-admin
```

#### **2. Create Notification Function**
`functions/src/notifications.ts`:

```typescript
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();

export const sendPushNotification = functions.firestore
  .document('notifications/{notificationId}')
  .onCreate(async (snapshot, context) => {
    const notification = snapshot.data();
    
    // Get recipient's FCM token
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(notification.recipientId)
      .get();
    
    if (!userDoc.exists) return;
    
    const user = userDoc.data();
    const fcmToken = user?.fcmToken;
    
    if (!fcmToken) {
      console.log('No FCM token for user:', notification.recipientId);
      return;
    }
    
    // Send push notification
    const message = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data || {},
      token: fcmToken,
    };
    
    try {
      await admin.messaging().send(message);
      console.log('✅ Push notification sent to:', notification.recipientId);
      
      // Mark as sent
      await snapshot.ref.update({ sentAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (error) {
      console.error('❌ Error sending push notification:', error);
    }
  });
```

#### **3. Deploy Cloud Function**
```bash
firebase deploy --only functions
```

---

## 📱 **Browser Compatibility**

### **Desktop**
| Browser | Support | Notes |
|---------|---------|-------|
| Chrome | ✅ Full | Best support |
| Firefox | ✅ Full | Good support |
| Safari | ✅ Full | macOS 13+ required |
| Edge | ✅ Full | Chromium-based |

### **Mobile**
| Browser | Support | Notes |
|---------|---------|-------|
| Chrome (Android) | ✅ Full | Best experience |
| Firefox (Android) | ✅ Full | Good support |
| Safari (iOS) | ⚠️ Limited | Requires PWA (Add to Home Screen) |
| Samsung Internet | ✅ Full | Good support |

### **iOS Safari Limitations**
- Notifications only work if app is added to home screen (PWA mode)
- Requires iOS 16.4+ and Safari 16.4+
- Users must manually "Add to Home Screen"
- The app displays a warning message for iOS users

---

## 🧪 **Testing Checklist**

### **Permission Flow**
- [ ] Permission prompt appears when enabling notifications
- [ ] Token is saved to Firestore after permission granted
- [ ] Error message shown if permission denied
- [ ] Settings persist after page reload

### **Notification Types**
- [ ] Event reminders work
- [ ] Team updates work
- [ ] Join requests notify trainers
- [ ] Role changes notify users
- [ ] Club announcements work

### **Foreground Notifications**
- [ ] Notification appears when app is open
- [ ] Clicking notification navigates to correct page
- [ ] Notification respects user preferences

### **Background Notifications**
- [ ] Notification appears when app is closed
- [ ] Clicking notification opens app
- [ ] App navigates to correct page after opening

### **Settings UI**
- [ ] Master toggle works
- [ ] Individual toggles work
- [ ] Settings save to Firestore
- [ ] Mobile responsive (< 768px)
- [ ] iOS warning shows on iOS devices

---

## 🐛 **Troubleshooting**

### **"VAPID key not configured" Error**
**Problem:** VAPID key not set in environment variables  
**Solution:** Add `VITE_FIREBASE_VAPID_KEY` to `.env.local`

### **"Notifications not supported" Error**
**Problem:** Browser doesn't support notifications  
**Solution:** Use Chrome, Firefox, or Safari on desktop. On iOS, add to home screen first.

### **Notifications Not Received**
**Possible Causes:**
1. **No Cloud Function**: Push notifications need Cloud Functions to send
2. **Permission Denied**: User blocked notifications in browser
3. **No FCM Token**: Token not registered or expired
4. **Preference Disabled**: User disabled that notification type

**Debug Steps:**
1. Check browser console for errors
2. Verify FCM token in Firestore `users/{userId}`
3. Check Cloud Function logs: `firebase functions:log`
4. Test with simple notification first

### **Service Worker Not Loading**
**Problem:** Service worker not registered  
**Solution:** 
1. Check `public/firebase-messaging-sw.js` exists
2. Verify config matches your Firebase project
3. Check browser dev tools → Application → Service Workers

### **iOS Safari Issues**
**Problem:** Notifications don't work on iPhone  
**Solution:** 
1. Ensure iOS 16.4+
2. Add app to home screen (PWA mode)
3. Test from home screen icon, not Safari browser

---

## 📊 **Usage Examples**

### **1. Welcome Notification (After Registration)**
```typescript
import { sendNotification } from '../services/firebase/notifications';

await sendNotification({
  recipientId: newUserId,
  senderId: 'system',
  type: 'general',
  title: 'Welcome to Nexus!',
  body: 'Get started by joining a club or creating your own team.',
  data: {
    actionUrl: '/clubs',
  },
});
```

### **2. Event Update Notification**
```typescript
import { sendTeamNotification } from '../services/firebase/notifications';

await sendTeamNotification(
  teamId,
  clubId,
  currentUserId,
  'Event Updated',
  `"${eventTitle}" has been rescheduled to ${newDate}`,
  'event_reminder',
  `/calendar/events/${eventId}`
);
```

### **3. Mass Club Announcement**
```typescript
import { sendClubAnnouncementNotification } from '../services/firebase/notifications';

await sendClubAnnouncementNotification(
  clubId,
  currentUserId,
  'Important Announcement',
  'Training schedule has changed for this week. Check the calendar for details.',
  '/calendar'
);
```

---

## 🔐 **Security Best Practices**

1. **Never expose VAPID key publicly** - Keep in `.env.local` only
2. **Validate permissions server-side** - Use Cloud Functions for sending
3. **Rate limit notifications** - Prevent spam
4. **Respect user preferences** - Always check before sending
5. **Use HTTPS only** - Service workers require HTTPS (or localhost)

---

## 📚 **Additional Resources**

- [Firebase Cloud Messaging Documentation](https://firebase.google.com/docs/cloud-messaging)
- [Web Push Notification Best Practices](https://web.dev/push-notifications-overview/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Notification API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)

---

## ✨ **Next Steps**

### **Phase 1: Basic Setup** (Complete ✅)
- [x] Service worker
- [x] Permission management
- [x] Settings UI
- [x] Helper functions

### **Phase 2: Cloud Functions** (Required for Production)
- [ ] Deploy Cloud Function for sending notifications
- [ ] Handle token refresh
- [ ] Implement notification retry logic

### **Phase 3: Feature Integration**
- [ ] Event creation notifications
- [ ] Join request notifications
- [ ] Role change notifications
- [ ] Chat message notifications
- [ ] Waitlist promotion notifications

### **Phase 4: Advanced Features** (Optional)
- [ ] Notification history in app
- [ ] Rich notifications with images
- [ ] Action buttons in notifications
- [ ] Scheduled reminders (1 hour before events)
- [ ] Badge count for unread notifications
- [ ] Custom notification sounds
- [ ] Admin panel for mass notifications

---

## 🎉 **You're Ready!**

The notification system is now set up and ready to use. Follow the steps above to:

1. Configure Firebase Console
2. Update environment variables
3. Deploy Cloud Functions
4. Test notification flow
5. Integrate into your features

For questions or issues, refer to the troubleshooting section or Firebase documentation.

---

**Last Updated:** January 21, 2026  
**Version:** 1.0  
**Status:** Production Ready (with Cloud Functions)

