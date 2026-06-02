# Nexus — Role & Permission System

## Role Hierarchy

Roles are ordered by privilege level. Higher number = more permissions.

| Role | Level | Description |
|---|---|---|
| `admin` | 5 | Platform super-admin. Full access to everything. |
| `clubOwner` | 4 | Owns one or more clubs. Manages teams, members, events. |
| `trainer` | 3 | Leads a team. Creates team events, manages attendance, manages members. |
| `assistant` | 2 | Helps a trainer. Can take attendance, limited chat. |
| `user` | 1 | Regular club/team member. View-only for most things. |
| `parent` | 1 | Parent of a child account. Same level as `user` + child management. |

Defined in `src/constants/permissions.ts` → `ROLE_HIERARCHY`.

---

## Permission Catalogue

All permissions are string constants in `PERMISSIONS` from `src/constants/permissions.ts`.

### Club
| Permission | Description |
|---|---|
| `create_club` | Create a new club |
| `manage_club` | Edit club details |
| `delete_club` | Delete a club |
| `view_club` | View club details |
| `transfer_club_ownership` | Transfer club to another user |
| `manage_club_settings` | Edit club configuration |

### Team
| Permission | Description |
|---|---|
| `create_team` | Create a team within a club |
| `manage_team` | Edit team details |
| `delete_team` | Delete a team |
| `view_team` | View team details |
| `add_team_member` | Add members to a team |
| `remove_team_member` | Remove members from a team |

### Events & Calendar
| Permission | Description |
|---|---|
| `create_club_event` | Create an event visible to the whole club |
| `create_team_event` | Create a team-level event |
| `create_personal_event` | Create a personal calendar event |
| `modify_event` | Edit an existing event |
| `delete_event` | Delete an event |
| `view_event` | View event details |
| `manage_event_attendance` | Take / edit attendance for an event |

### Chat & Messaging
| Permission | Description |
|---|---|
| `create_one_to_one_chat` | Start a direct message conversation |
| `create_team_chat` | Create a team chat channel |
| `create_club_chat` | Create a club-wide chat channel |
| `view_chat` | View chat messages |
| `send_message` | Send a message in a chat |

### Role Management
| Permission | Description |
|---|---|
| `assign_club_owner` | Promote a user to clubOwner |
| `assign_trainer` | Assign trainer role in a team |
| `assign_assistant` | Assign assistant role in a team |
| `promote_user` | Increase a user's role level |
| `demote_user` | Decrease a user's role level |
| `change_user_role` | Generic role change (requires explicit grant) |

### Administration
| Permission | Description |
|---|---|
| `access_admin_dashboard` | Access the `/admin` panel |
| `create_voucher` | Generate subscription vouchers |
| `manage_subscriptions` | Edit subscription details |
| `view_audit_logs` | View system audit logs |
| `manage_app_settings` | Change global app configuration |

### Account Management
| Permission | Description |
|---|---|
| `delete_own_account` | Delete one's own account |
| `delete_user_account` | Delete another user's account (admin) |
| `manage_user_profile` | Edit own profile |

### Parent Features
| Permission | Description |
|---|---|
| `create_child_account` | Create a child sub-account |
| `manage_child_account` | Edit a child's profile |
| `respond_for_child` | RSVP to events on behalf of a child |

---

## Role → Permission Mapping

| Permission | admin | clubOwner | trainer | assistant | user | parent |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `create_club` | ✓ | ✓ | | | | |
| `manage_club` | ✓ | ✓ | | | | |
| `delete_club` | ✓ | ✓ | | | | |
| `view_club` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `transfer_club_ownership` | ✓ | ✓ | | | | |
| `manage_club_settings` | ✓ | ✓ | | | | |
| `create_team` | ✓ | ✓ | | | | |
| `manage_team` | ✓ | ✓ | | | | |
| `delete_team` | ✓ | ✓ | | | | |
| `view_team` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `add_team_member` | ✓ | ✓ | ✓ | | | |
| `remove_team_member` | ✓ | ✓ | ✓ | | | |
| `create_club_event` | ✓ | ✓ | | | | |
| `create_team_event` | ✓ | ✓ | ✓ | | | |
| `create_personal_event` | ✓ | ✓ | ✓ | | ✓ | ✓ |
| `modify_event` | ✓ | ✓ | ✓ | | | |
| `delete_event` | ✓ | ✓ | ✓ | | | |
| `view_event` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `manage_event_attendance` | ✓ | ✓ | ✓ | ✓ | | |
| `create_one_to_one_chat` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `create_team_chat` | ✓ | ✓ | ✓ | | | |
| `create_club_chat` | ✓ | ✓ | | | | |
| `view_chat` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `send_message` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `assign_club_owner` | ✓ | | | | | |
| `assign_trainer` | ✓ | ✓ | | | | |
| `assign_assistant` | ✓ | ✓ | ✓ | | | |
| `promote_user` | ✓ | ✓ | | | | |
| `demote_user` | ✓ | ✓ | | | | |
| `change_user_role` | ✓ | | | | | |
| `access_admin_dashboard` | ✓ | | | | | |
| `create_voucher` | ✓ | | | | | |
| `manage_subscriptions` | ✓ | | | | | |
| `view_audit_logs` | ✓ | | | | | |
| `manage_app_settings` | ✓ | | | | | |
| `delete_own_account` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `delete_user_account` | ✓ | | | | | |
| `manage_user_profile` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `create_child_account` | ✓ | | | | | ✓ |
| `manage_child_account` | ✓ | | | | | ✓ |
| `respond_for_child` | ✓ | | | | | ✓ |

---

## Using Permissions in Code

### In components — `usePermissions` hook
```tsx
import { usePermissions } from '@/hooks/usePermissions'
import { PERMISSIONS } from '@/constants/permissions'

const { can, hasRole, isClubOwner } = usePermissions()

if (can(PERMISSIONS.CREATE_TEAM)) { /* show button */ }
if (hasRole('trainer')) { /* trainer-only UI */ }
```

### In routes — `ProtectedRoute`
```tsx
<ProtectedRoute requiredPermission={PERMISSIONS.CREATE_CLUB}>
  <CreateClub />
</ProtectedRoute>
```

### Utility helpers (`src/utils/permissions.ts`)
- `hasPermission(user, permission)` — boolean check
- `hasRoleLevel(user, minLevel)` — hierarchy check
- `isClubOwner(user, clubId)` — ownership check
- `isTrainer(user, teamId)` — trainer check
- `canModifyResource(user, resource)` — edit permission
- `isClubMember(user, clubId)` — membership check
- `canManageUser(actor, target)` — user management check
- `getRoleDisplayName(role, t)` — translated role name
- `getRoleColor(role)` — Tailwind colour class for role badge
