# Orders Feature Implementation

## Overview

The Orders feature allows Club Owners, Trainers, and Assistants to create custom order forms (e.g., for jerseys, equipment, photos) with dynamic fields. Users can respond to these orders, and creators can track responses and export data to CSV.

## Features

### 1. Order Creation
- **Who can create**: Club Owners, Trainers, Assistants
- **Target audience**: Whole club OR specific team
- **Dynamic form builder**: Add custom fields with different types
- **Deadline management**: Set response deadlines
- **Field types supported**:
  - Text input
  - Number input
  - Dropdown/Select with custom options
  - Long text (textarea)
  - Date picker
  - File upload (max 10MB)
- **Field configuration**:
  - Mark fields as required/optional
  - Add placeholder text
  - Add help text
  - Reorder fields (up/down arrows)
  - Remove fields

### 2. Order Management
- **View all orders**: List filtered by club and role
- **Order statuses**: Active, Closed, Cancelled
- **Response tracking**: See how many users responded
- **Close orders**: Manually close when done collecting responses
- **Delete orders**: Remove order and all responses

### 3. User Response
- **View available orders**: Users see orders for their club/team
- **Submit responses**: Fill out custom form
- **Edit responses**: Users can edit until deadline
- **File uploads**: Attach files to responses (photos, documents, etc.)
- **Deadline enforcement**: Cannot respond after deadline

### 4. Response Tracking (Creators Only)
- **View all responses**: Table view of all submissions
- **Track non-responders**: See who hasn't responded yet (team orders)
- **Export to CSV**: Download all responses as spreadsheet
  - Headers: User Name, User Email, Submitted At, + all custom fields
  - Properly formatted and escaped for Excel
- **Real-time updates**: See responses as they come in

## File Structure

### Pages
```
src/pages/orders/
├── OrdersPage.tsx          # List all orders
├── CreateOrder.tsx         # Create new order with form builder
├── OrderDetail.tsx         # View order, responses, export CSV
└── RespondToOrder.tsx      # User form to submit response
```

### Services
```
src/services/firebase/
└── orders.ts               # All order CRUD operations + CSV export
```

### Types
```
src/types/index.ts
├── Order                   # Order document structure
├── OrderResponse           # User response structure
├── OrderField              # Dynamic field configuration
├── OrderFieldType          # Field type enum
├── OrderStatus             # Order status enum
└── OrderCreatorRole        # Creator role enum
```

### Routes
```
/orders                     # List page
/orders/create              # Create order
/orders/:orderId            # Order detail
/orders/:orderId/respond    # Response form
```

## Data Structure

### Firestore Collections

#### `/clubs/{clubId}/orders/{orderId}`
```typescript
{
  id: string,
  clubId: string,
  teamId?: string,              // Only for team-specific orders
  createdBy: string,            // User ID
  creatorName: string,
  creatorRole: 'clubOwner' | 'trainer' | 'assistant',
  
  title: string,
  description?: string,
  deadline: Timestamp,
  status: 'active' | 'closed' | 'cancelled',
  
  fields: OrderField[],         // Dynamic form fields
  targetAudience: 'club' | 'team',
  
  responseCount: number,
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

#### `/clubs/{clubId}/orders/{orderId}/responses/{responseId}`
```typescript
{
  id: string,
  orderId: string,
  userId: string,
  userName: string,
  userEmail: string,
  
  responses: {                  // Dynamic responses
    [fieldId: string]: any
  },
  
  fileUploads?: {              // File URLs
    [fieldId: string]: string
  },
  
  submittedAt: Timestamp,
  updatedAt: Timestamp
}
```

### Storage Structure

```
/clubs/{clubId}/orders/{orderId}/files/{userId}_{timestamp}_{filename}
```

## Security Rules

### Firestore Rules

```javascript
match /clubs/{clubId}/orders/{orderId} {
  // Read: All club members
  allow read: if isClubMember(clubId);
  
  // Create: Club owners, trainers, assistants
  allow create: if canCreateOrder();
  
  // Update/Delete: Only order creator
  allow update, delete: if isOrderCreator();
  
  match /responses/{responseId} {
    // Read: Order creator sees all, users see their own
    allow read: if isOrderCreator() || isOwnResponse();
    
    // Create/Update: Users can respond before deadline
    allow create, update: if isBeforeDeadline() && isOwnResponse();
    
    // Delete: Only order creator
    allow delete: if isOrderCreator();
  }
}
```

### Storage Rules

```javascript
match /clubs/{clubId}/orders/{orderId}/files/{fileName} {
  // Read: All authenticated users
  allow read: if isAuthenticated();
  
  // Write: Club members (10MB limit)
  allow write: if isAuthenticated() &&
    request.resource.size < 10 * 1024 * 1024;
}
```

## Translations

Full Slovak and English support for:
- All UI labels and buttons
- Field type names
- Status labels
- Error messages
- Help text
- Empty states

Translation keys prefix: `orders.*`

## User Flow Examples

### Example 1: Jersey Order

**Club Owner creates order:**
1. Navigate to Orders
2. Click "Create Order"
3. Select "Whole Club"
4. Title: "Team Jersey Order 2026"
5. Add fields:
   - Size (Dropdown): S, M, L, XL, XXL
   - Number (Number): "Jersey number"
   - Name on Jersey (Text): "Your name"
   - Additional Notes (Textarea): Optional
6. Set deadline: 2 weeks
7. Publish

**Users respond:**
1. See order in Orders list
2. Click order → "Respond"
3. Fill out form
4. Submit
5. Can edit until deadline

**Club Owner tracks:**
1. View order detail
2. See all responses in table
3. Export to CSV
4. See who hasn't responded
5. Close order when done

### Example 2: Photo Order

**Trainer creates for team:**
1. Create Order
2. Select "Specific Team" → U15 Boys
3. Title: "Team Photo Order"
4. Add fields:
   - Photo Size (Dropdown): 8x10, 11x14, 16x20
   - Quantity (Number): "How many copies?"
   - Frame (Select): None, Basic, Premium
   - Payment Proof (File): "Upload payment receipt"
5. Set deadline
6. Publish

**Users respond:**
1. Fill out preferences
2. Upload payment proof
3. Submit

**Trainer manages:**
1. Track responses
2. Download files
3. Export CSV for printing company
4. Mark non-responders

## CSV Export Format

```csv
"User Name","User Email","Submitted At","Size","Number","Name on Jersey","Additional Notes"
"John Doe","john@example.com","2026-05-20 14:30:00","L","10","JOHN","None"
"Jane Smith","jane@example.com","2026-05-20 15:45:00","M","7","JANE","Rush order please"
```

- UTF-8 encoding
- Comma-separated
- Double-quoted values
- Escaped quotes in content
- ISO datetime format

## Permissions Matrix

| Role | Create Order | View All Orders | View Responses | Edit Order | Delete Order | Respond |
|------|-------------|----------------|----------------|-----------|--------------|---------|
| Club Owner | ✅ Club-wide | ✅ All club | ✅ Created only | ✅ Own | ✅ Own | ✅ |
| Trainer | ✅ Team-only | ✅ All club | ✅ Created only | ✅ Own | ✅ Own | ✅ |
| Assistant | ✅ Team-only | ✅ All club | ✅ Created only | ✅ Own | ✅ Own | ✅ |
| User | ❌ | ✅ Available | ✅ Own only | ❌ | ❌ | ✅ |

## Known Limitations

1. **No order templates**: Users must create from scratch each time
2. **No payment integration**: File upload only, no payment processing
3. **No order history for users**: Users don't see past orders they responded to
4. **No notifications**: No automatic notifications when orders are created/updated
5. **Club ID detection**: Currently uses first club ID from user's clubs
6. **No order duplication**: Cannot copy existing order as template
7. **No partial responses**: Must complete all required fields at once

## Future Enhancements

Potential improvements for future releases:

1. **Order Templates**
   - Predefined templates (jersey, equipment, photo)
   - Save custom templates
   - Template library

2. **Notifications**
   - New order created
   - Deadline approaching
   - Response received
   - Order closed

3. **Enhanced Tracking**
   - Order history for users
   - Response analytics
   - Charts and graphs

4. **Payment Integration**
   - Price per item
   - Total cost calculation
   - Payment tracking
   - Integration with payment providers

5. **Bulk Operations**
   - Duplicate order
   - Bulk close/delete
   - Export multiple orders

6. **Advanced Fields**
   - Conditional fields (show if X is selected)
   - Calculated fields
   - Multi-file uploads
   - Image preview

7. **User Experience**
   - Order search/filter
   - Sort options
   - Draft orders
   - Order previews

## Testing Checklist

### Order Creation
- [ ] Club owner can create club-wide order
- [ ] Trainer can create team order
- [ ] Assistant can create team order
- [ ] Regular user cannot create order
- [ ] All field types work
- [ ] Required fields validation
- [ ] Deadline in the past is rejected

### Order Management
- [ ] Orders list shows correct orders
- [ ] Club owner sees all club orders
- [ ] Trainer sees relevant orders
- [ ] Status indicators work
- [ ] Expired orders marked
- [ ] Close order works
- [ ] Delete order works

### User Response
- [ ] Users can see available orders
- [ ] Users can submit responses
- [ ] Users can edit responses before deadline
- [ ] Cannot submit after deadline
- [ ] Required field validation
- [ ] File upload works (< 10MB)
- [ ] File upload rejected (> 10MB)

### Response Tracking
- [ ] Creators see all responses
- [ ] Response table displays correctly
- [ ] Non-responders list accurate
- [ ] Real-time updates work
- [ ] CSV export works
- [ ] CSV format correct

### Translations
- [ ] All UI in English works
- [ ] All UI in Slovak works
- [ ] Field type translations
- [ ] Status translations
- [ ] Error messages translated

### Security
- [ ] Firestore rules prevent unauthorized access
- [ ] Storage rules prevent unauthorized uploads
- [ ] Users cannot see others' responses
- [ ] Users cannot edit others' responses
- [ ] Cannot respond after deadline

## Deployment Notes

### Firestore Rules
1. Copy rules from `firestore.rules`
2. Paste into Firebase Console → Firestore → Rules
3. Publish rules

### Storage Rules
1. Copy rules from `storage.rules`
2. Paste into Firebase Console → Storage → Rules
3. Publish rules

### Testing in Dev
- **Dev server**: `npm run dev`
- **Build test**: `npm run build`
- **Do NOT deploy to production** until fully tested

### Production Deployment
After thorough testing in dev:
1. Verify all functionality
2. Test with multiple users
3. Test CSV export with real data
4. Verify file uploads
5. Check translations
6. Deploy: `npm run build` + Vercel deployment

## Support

For issues or questions:
1. Check browser console for errors
2. Verify Firebase rules are deployed
3. Check Firestore/Storage permissions
4. Verify user roles and club memberships
5. Test file size limits

## Related Documentation

- [Firebase Security Rules](https://firebase.google.com/docs/rules)
- [Team Chat Implementation](CHAT_IMPLEMENTATION.md)
- [New Chat Implementation](NEW_CHAT_IMPLEMENTATION.md)
