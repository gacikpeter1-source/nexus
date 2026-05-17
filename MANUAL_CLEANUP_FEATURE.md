# Manual Unverified Users Cleanup Feature

## Overview

This feature allows administrators to manually view and delete user accounts that haven't verified their email addresses. It's designed to work on Firebase's free tier without requiring Cloud Functions.

## Implementation Date

May 13, 2026

## Features

### 1. View Unverified Users
- Shows all users who haven't verified their email
- Displays user information:
  - Display name
  - Email address
  - Account age (days since creation)
  - User role
- Sorts by account age (oldest first)

### 2. Color-Coded Account Age
- **Red (3+ days):** Old unverified accounts that should be removed
- **Yellow (1-2 days):** Moderately old accounts
- **Cyan (today):** Recently created accounts

### 3. Delete Single Account
- Click "Delete" button next to any user
- Confirmation dialog prevents accidental deletion
- Success/error feedback

### 4. Bulk Delete
- Select multiple users using checkboxes
- "Select All" option for quick selection
- "Delete Selected" button appears when users are selected
- Confirmation shows number of accounts to be deleted

### 5. Real-time Count
- Shows total number of unverified users
- Updates after deletions

## Files Created

### 1. Admin Users Service
**File:** `src/services/firebase/adminUsers.ts`

Functions:
- `getUnverifiedUsers()` - Fetches all unverified users with account age
- `deleteUnverifiedUser(userId)` - Deletes single user from Firestore
- `deleteMultipleUnverifiedUsers(userIds)` - Bulk delete functionality
- `getUnverifiedUsersCount()` - Get count of unverified users
- `getUnverifiedUsersOlderThan(days)` - Filter by age

## Files Modified

### 1. AdminPanel Component
**File:** `src/pages/AdminPanel.tsx`

Added:
- Unverified users section (above vouchers)
- State management for users and selections
- Delete handlers (single and bulk)
- UI for displaying and managing unverified accounts

### 2. Translations
**Files:** `src/translations/en.json` and `src/translations/sk.json`

Added `admin.unverifiedUsers` section with:
- title, subtitle
- Empty state messages
- Action button labels
- Confirmation messages
- Success/error messages
- Account age labels

## How to Use

### Access the Feature

1. Login as an **admin user** (role: 'admin')
2. Navigate to **Admin Panel** (`/admin`)
3. Scroll to **"Unverified Accounts"** section (top of page)

### View Unverified Users

The section displays:
- Total count in "Select All" checkbox
- Each user card shows:
  - Name and email
  - Account age with color coding
  - User role
  - Delete button

### Delete Single User

1. Find the user in the list
2. Click the **"Delete"** button
3. Confirm the action in the dialog
4. User is removed from Firestore

### Delete Multiple Users

1. Check the boxes next to users you want to delete
2. Or click **"Select All"** to select everyone
3. Click **"Delete Selected (X)"** button
4. Confirm the bulk deletion
5. Selected users are removed

## Important Notes

### Firebase Auth vs Firestore

**What Gets Deleted:**
- ✅ User document in Firestore (`users/{userId}`)
- ❌ Firebase Auth account (remains)

**Why?**
- Deleting Firebase Auth accounts requires **Admin SDK**
- Admin SDK only works in **Cloud Functions** (server-side)
- This feature works on **free tier** (no Cloud Functions needed)

**Result:**
- User's Firestore data is deleted
- User cannot access the app (no Firestore document)
- Firebase Auth account exists but is useless
- User would need to register again (creates new Firestore document)

### Cleanup Recommendations

**Best Practices:**
1. **Review regularly** - Check weekly or monthly
2. **3-day rule** - Delete accounts 3+ days old (red badge)
3. **Be careful with new accounts** - Users might verify within 24-48 hours
4. **Bulk delete wisely** - Don't delete accounts less than 1 day old

**Suggested Schedule:**
- **Weekly:** Review and delete accounts 7+ days old
- **Monthly:** Clean up accounts 3+ days old
- **Before important events:** Clean up to free up database space

## Security

### Access Control
- Only users with `role: 'admin'` can access
- Non-admin users see "Access Denied" message
- Protected route prevents unauthorized access

### Confirmation Dialogs
- Single delete: Requires confirmation
- Bulk delete: Shows count and requires confirmation
- Prevents accidental deletions

## UI/UX Features

### Responsive Design
- Mobile-first layout
- Cards stack vertically on mobile
- Buttons adjust for small screens

### Visual Feedback
- Loading spinners during operations
- Success/error alerts after actions
- Color-coded account age
- Selected state highlighting
- Disabled states during deletion

### Empty State
- Shows success message when no unverified users
- Checkmark icon
- Encouraging message

## Future Enhancements

### Potential Improvements

1. **Email Reminders**
   - Send reminder to verify email after 48 hours
   - Requires Cloud Functions

2. **Auto-Delete**
   - Scheduled function to delete old accounts
   - Requires Firebase Blaze Plan + Cloud Functions

3. **Export List**
   - Download CSV of unverified users
   - For record-keeping

4. **Filter Options**
   - Filter by age (e.g., only 7+ days)
   - Search by email/name

5. **Analytics**
   - Chart showing verification rate
   - Trend over time

6. **Email Notification**
   - Notify admin when accounts reach certain age
   - Weekly summary email

## Troubleshooting

### User doesn't appear in list
- **Check:** Is user's `emailVerified` field set to `false` in Firestore?
- **Check:** Did you reload the page after they registered?
- **Solution:** Click browser refresh or re-navigate to Admin Panel

### Delete fails
- **Check:** Do you have write permissions in Firestore?
- **Check:** Are Firestore security rules correct?
- **Solution:** Check browser console for error details

### Bulk delete partially works
- **Issue:** Some users deleted, some failed
- **Reason:** Firestore rule restrictions or network issues
- **Solution:** Try deleting failed users individually

## Testing Checklist

- [ ] Create test account (don't verify email)
- [ ] Login as admin
- [ ] Navigate to Admin Panel
- [ ] See unverified user in list
- [ ] Check account age displays correctly
- [ ] Delete single user
- [ ] Verify user removed from list
- [ ] Create multiple test accounts
- [ ] Select multiple users
- [ ] Bulk delete selected users
- [ ] Verify all selected users removed
- [ ] Check "Select All" functionality
- [ ] Verify confirmation dialogs work
- [ ] Check success/error messages display

## Firebase Console Verification

After deleting a user, verify in Firebase Console:

1. Go to **Firestore Database**
2. Open `users` collection
3. Verify user document is deleted
4. Go to **Authentication**
5. Note: Auth account still exists (expected behavior)

## Performance

### Optimization
- Firestore query uses index on `emailVerified` field
- Query is efficient even with thousands of users
- Bulk delete processes sequentially (reliable)

### Limits
- Free tier: 50,000 reads/day
- Each page load: 1 read per unverified user
- Each delete: 1 write operation

## Support

For issues:
1. Check browser console for errors
2. Verify admin role in Firestore
3. Check Firestore security rules
4. Test with different browsers

---

**Feature Type:** Admin Tool (Free Tier Compatible)  
**Requires:** Admin role, Firestore write permissions  
**Does NOT require:** Cloud Functions, Paid Firebase plan
