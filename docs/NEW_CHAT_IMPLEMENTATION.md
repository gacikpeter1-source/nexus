# New Chat (Private Messaging) Implementation

## Overview

This document describes the implementation of the "New Chat" functionality for private 1-on-1 and group conversations in the Nexus application.

## Features

### 1. User Search
- Real-time search for users by display name
- Debounced search with 300ms delay
- Results limited to 10 users
- Excludes current user from results

### 2. Participant Selection
- Multi-select functionality for creating group chats
- Visual selection indicators
- Selected users displayed in a dedicated section
- Easy removal of selected participants

### 3. Chat Creation
- **One-on-One Chats**: Automatically creates or retrieves existing chat between two users
- **Group Chats**: Creates a new group conversation with selected participants
- Automatic navigation to newly created chat
- Error handling with user feedback

## Components

### NewChatModal.tsx
**Location**: `src/components/chat/NewChatModal.tsx`

Main modal component for creating new chats.

**Features**:
- User search with debouncing
- Participant selection UI
- Create chat button
- Loading states
- Error handling

**Props**:
```typescript
interface NewChatModalProps {
  onClose: () => void;
}
```

### Updated ChatList.tsx
**Location**: `src/components/chat/ChatList.tsx`

**Changes**:
- Added "New Chat" button in header
- Integrated NewChatModal
- Updated styling to match dark theme
- Added empty state with call-to-action button

## User Flow

1. User clicks "New Chat" button (+ icon) in header
2. Modal opens with search interface
3. User types to search for other users
4. User selects one or more participants
5. User clicks "Start Chat"
6. System creates or retrieves chat
7. User is navigated to the chat conversation

## Firebase Integration

### Firestore Queries
The implementation uses the following query to search users:

```typescript
const q = query(
  usersRef,
  where('displayName', '>=', searchTerm),
  where('displayName', '<=', searchTerm + '\uf8ff'),
  limit(10)
);
```

### Chat Creation
- **One-on-One**: Uses `getOrCreateOneToOneChat()` from `chats.ts` service
- **Group**: Uses `createChat()` with type 'group'

## Translations

### English Keys (`en.json`)
```json
{
  "chat": {
    "newChat": "New Chat",
    "searchUsers": "Search for users...",
    "selected": "Selected",
    "noUsersFound": "No users found",
    "searchUsersHint": "Start typing to search for users",
    "startChat": "Start Chat",
    "startNewChat": "Start New Chat"
  }
}
```

### Slovak Keys (`sk.json`)
```json
{
  "chat": {
    "newChat": "Nová konverzácia",
    "searchUsers": "Vyhľadať používateľov...",
    "selected": "Vybraté",
    "noUsersFound": "Neboli nájdení žiadni používatelia",
    "searchUsersHint": "Začnite písať pre vyhľadávanie používateľov",
    "startChat": "Začať konverzáciu",
    "startNewChat": "Začať novú konverzáciu"
  }
}
```

## Styling

The implementation follows the application's dark theme design system:

### Color Palette
- Background: `bg-app-card`, `bg-app-secondary`
- Text: `text-text-primary`, `text-text-secondary`, `text-text-muted`
- Borders: `border-white/10`
- Accent: `bg-gradient-primary`, `bg-app-cyan`
- Hover: `hover:bg-white/5`, `hover:shadow-button-hover`

### Responsive Design
- Modal max width: 2xl (672px)
- Modal max height: 90vh
- Scrollable user list
- Mobile-friendly touch targets

## Security Considerations

### User Search
- Only displays users from the same database (authenticated users)
- Excludes current user from results
- Limited to 10 results per query

### Chat Creation
- Requires authentication (enforced by Firebase rules)
- User must be logged in to create chats
- All participants added to chat.participants array

## Future Enhancements

Potential improvements for future releases:

1. **Advanced Search**
   - Search by email
   - Fuzzy search
   - Recent contacts
   - Suggested contacts

2. **Group Chat Features**
   - Custom group names
   - Group avatars
   - Admin/member roles

3. **User Discovery**
   - Browse team members
   - Browse club members
   - Contact suggestions

4. **Batch Operations**
   - Create multiple chats at once
   - Add multiple participants to existing chat

## Testing Checklist

- [ ] User search returns accurate results
- [ ] Search debouncing works (no excessive queries)
- [ ] One-on-one chat creation works
- [ ] Group chat creation works
- [ ] Navigation to new chat works
- [ ] Empty state displays correctly
- [ ] Loading states display correctly
- [ ] Error handling works
- [ ] Modal can be closed
- [ ] Translations work (English and Slovak)
- [ ] Responsive design works on mobile
- [ ] Dark theme styling is consistent

## Known Limitations

1. **Search Limitations**
   - Case-sensitive search (Firestore limitation)
   - Prefix matching only (cannot search middle or end of names)
   - Maximum 10 results per query

2. **Performance**
   - User list is not paginated
   - All selected users loaded into memory

## Related Documentation

- [Team Chat Implementation](CHAT_IMPLEMENTATION.md) - Team-specific chat feature
- [Firebase Security Rules](../firestore.rules) - Firestore security configuration
- [Chats Service](../src/services/firebase/chats.ts) - Chat operations service

## Support

For issues or questions:
1. Check Firebase console for permission errors
2. Verify user search query in Firestore
3. Check browser console for JavaScript errors
4. Verify chat creation in Firestore `/chats` collection
