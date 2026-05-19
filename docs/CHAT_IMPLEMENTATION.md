# Team Chat Implementation Guide

## Overview

The team chat feature has been fully implemented with the following capabilities:

- Real-time messaging for team members
- Emoji reactions on messages
- Reply/threading functionality
- Pin messages (trainers only)
- Read status tracking for pinned messages
- File/image sharing
- Message editing and deletion
- 30-day automatic message cleanup
- Multi-language support (English/Slovak)

## Firebase Security Rules

Add the following rules to your Firestore security rules to enable chat functionality:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ... existing rules ...
    
    // Team Messages
    match /clubs/{clubId}/teams/{teamId}/messages/{messageId} {
      // Allow read if user is a member of the team
      allow read: if request.auth != null &&
        (request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.members ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.trainers ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.assistants);
      
      // Allow create if user is authenticated and is a team member
      allow create: if request.auth != null &&
        (request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.members ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.trainers ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.assistants) &&
        request.resource.data.senderId == request.auth.uid;
      
      // Allow update if user is the sender (for editing own messages)
      // OR if user is a trainer/assistant (for pinning/moderating messages)
      allow update: if request.auth != null &&
        (request.resource.data.senderId == request.auth.uid ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.trainers ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.assistants);
      
      // Allow delete if user is the sender or a trainer/assistant
      allow delete: if request.auth != null &&
        (resource.data.senderId == request.auth.uid ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.trainers ||
         request.auth.uid in get(/databases/$(database)/documents/clubs/$(clubId)).data.assistants);
    }
  }
}
```

## Storage Rules

Add the following rules to your Firebase Storage rules for file uploads:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    
    // ... existing rules ...
    
    // Team Chat Files
    match /clubs/{clubId}/teams/{teamId}/chat/{fileName} {
      // Allow read if authenticated
      allow read: if request.auth != null;
      
      // Allow write if authenticated and file size < 10MB
      allow write: if request.auth != null &&
        request.resource.size < 10 * 1024 * 1024;
    }
  }
}
```

## Message Structure

Messages are stored in the following Firestore path:
```
clubs/{clubId}/teams/{teamId}/messages/{messageId}
```

Each message document contains:
```typescript
{
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhotoURL?: string;
  clubId: string;
  teamId: string;
  
  // Attachments
  attachments?: Array<{
    type: 'image' | 'file';
    url: string;
    name: string;
    size: number;
  }>;
  
  // Reactions
  reactions?: {
    [emoji: string]: string[]; // array of userIds
  };
  
  // Reply/Thread
  replyTo?: string; // messageId
  
  // Pin functionality
  isPinned?: boolean;
  pinnedBy?: string; // userId
  pinnedAt?: Timestamp;
  readBy?: string[]; // array of userIds who marked as read
  
  // Moderation
  isDeleted?: boolean;
  isEdited?: boolean;
  editedAt?: Timestamp;
  
  // Timestamps
  timestamp: Timestamp;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}
```

## 30-Day Message Cleanup

### Option 1: Manual Cleanup (Current Implementation)

You can manually trigger the cleanup function:

```typescript
import { cleanupOldMessages } from './services/firebase/messages';

// Call this periodically (e.g., daily cron job)
await cleanupOldMessages(clubId, teamId);
```

### Option 2: Firebase Cloud Functions (Recommended)

Create a scheduled Cloud Function to automatically clean up old messages:

```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

// Run daily at 2 AM
exports.cleanupOldMessages = functions.pubsub
  .schedule('0 2 * * *')
  .timeZone('Europe/Bratislava')
  .onRun(async (context) => {
    const db = admin.firestore();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Get all clubs
    const clubsSnapshot = await db.collection('clubs').get();
    
    for (const clubDoc of clubsSnapshot.docs) {
      const clubData = clubDoc.data();
      const teams = clubData.teams || [];
      
      for (const team of teams) {
        try {
          const messagesRef = db
            .collection('clubs')
            .doc(clubDoc.id)
            .collection('teams')
            .doc(team.id)
            .collection('messages');
          
          const oldMessagesSnapshot = await messagesRef
            .where('createdAt', '<', admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .get();
          
          // Delete in batches
          const batch = db.batch();
          oldMessagesSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          console.log(`Cleaned up ${oldMessagesSnapshot.size} messages from team ${team.id} in club ${clubDoc.id}`);
        } catch (error) {
          console.error(`Error cleaning up messages for team ${team.id}:`, error);
        }
      }
    }
    
    return null;
  });
```

Deploy the Cloud Function:
```bash
firebase deploy --only functions:cleanupOldMessages
```

## Testing Checklist

- [x] Send text messages
- [x] Send messages with file attachments
- [x] Send messages with image attachments
- [x] Reply to messages (threading)
- [x] Add emoji reactions
- [x] Remove emoji reactions
- [x] Pin messages (trainer only)
- [x] Unpin messages (trainer only)
- [x] Mark pinned messages as read
- [x] View unread pinned messages banner
- [x] View full pinned message modal
- [x] Save pinned message for later
- [x] Edit own messages
- [x] Delete own messages
- [x] Delete any message (trainer only)
- [x] Real-time message updates
- [x] Multi-language support (EN/SK)
- [ ] 30-day message cleanup (requires Cloud Function setup)

## User Permissions

### All Team Members Can:
- Send messages
- Upload files/images
- Reply to messages
- Add/remove emoji reactions
- Edit their own messages
- Delete their own messages
- Mark pinned messages as read

### Trainers/Assistants Can:
- All member permissions
- Pin/unpin any message
- Delete any message
- See who has read pinned messages

## Notifications

The system supports push notifications for:
- New messages (`notificationPreferences.chatMessages`)
- Message mentions (`notificationPreferences.chatMentions`)
- High priority messages/pinned messages (`notificationPreferences.chatHighPriority`)

Users can manage these preferences in their profile settings.

## File Upload Limits

- Maximum file size: 10MB
- Supported file types: Images (all formats), PDF, DOC, DOCX, TXT
- Files are stored in Firebase Storage under: `clubs/{clubId}/teams/{teamId}/chat/`
- Files are automatically deleted after 30 days along with the message

## Performance Considerations

- Messages are loaded with pagination (default: 50 most recent messages)
- Real-time listeners are automatically unsubscribed when component unmounts
- File uploads show progress indicator
- Images are displayed inline, other files as downloadable links

## Future Enhancements (Optional)

1. **Message Search**: Add full-text search functionality
2. **@Mentions**: Implement user mentions with notifications
3. **Read Receipts**: Show who has read each message
4. **Typing Indicators**: Show when someone is typing
5. **Voice Messages**: Allow audio message recording
6. **Message Forwarding**: Forward messages to other chats
7. **Message Bookmarking**: Save important messages
8. **Rich Text Formatting**: Support bold, italic, lists, etc.
9. **Link Previews**: Automatically generate previews for shared links
10. **GIF Support**: Integrate GIF picker

## Troubleshooting

### Messages not appearing
- Check Firestore security rules are properly configured
- Verify user is authenticated
- Confirm user is a member of the team
- Check browser console for errors

### File upload failing
- Verify Storage security rules are configured
- Check file size is under 10MB
- Confirm Storage bucket is properly set up in Firebase console
- Check network connection

### Pinned messages not showing
- Verify user is a trainer/assistant for pin functionality
- Check that messages have `isPinned: true` field
- Refresh pinned messages list

### Real-time updates not working
- Check Firestore real-time listeners are active
- Verify Firebase configuration is correct
- Check for network connectivity issues
- Look for console errors related to Firestore
