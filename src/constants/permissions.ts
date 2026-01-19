/**
 * Permission Constants & Role Hierarchy
 * Based on: docs/01-user-management.md
 */

// User Roles
export const ROLES = {
  ADMIN: 'admin',
  CLUB_OWNER: 'clubOwner',
  TRAINER: 'trainer',
  ASSISTANT: 'assistant',
  USER: 'user',
  PARENT: 'parent',
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];

// Role Hierarchy (higher number = more permissions)
export const ROLE_HIERARCHY: Record<Role, number> = {
  admin: 5,
  clubOwner: 4,
  trainer: 3,
  assistant: 2,
  user: 1,
  parent: 1,
};

// Permissions
export const PERMISSIONS = {
  // Club Permissions
  CREATE_CLUB: 'create_club',
  MANAGE_CLUB: 'manage_club',
  DELETE_CLUB: 'delete_club',
  VIEW_CLUB: 'view_club',
  TRANSFER_CLUB_OWNERSHIP: 'transfer_club_ownership',
  MANAGE_CLUB_SETTINGS: 'manage_club_settings',
  
  // Team Permissions
  CREATE_TEAM: 'create_team',
  MANAGE_TEAM: 'manage_team',
  DELETE_TEAM: 'delete_team',
  VIEW_TEAM: 'view_team',
  ADD_TEAM_MEMBER: 'add_team_member',
  REMOVE_TEAM_MEMBER: 'remove_team_member',
  
  // Event Permissions
  CREATE_CLUB_EVENT: 'create_club_event',
  CREATE_TEAM_EVENT: 'create_team_event',
  CREATE_PERSONAL_EVENT: 'create_personal_event',
  MODIFY_EVENT: 'modify_event',
  DELETE_EVENT: 'delete_event',
  VIEW_EVENT: 'view_event',
  MANAGE_EVENT_ATTENDANCE: 'manage_event_attendance',
  
  // Chat Permissions
  CREATE_ONE_TO_ONE_CHAT: 'create_one_to_one_chat',
  CREATE_TEAM_CHAT: 'create_team_chat',
  CREATE_CLUB_CHAT: 'create_club_chat',
  VIEW_CHAT: 'view_chat',
  SEND_MESSAGE: 'send_message',
  
  // Role Management Permissions
  ASSIGN_CLUB_OWNER: 'assign_club_owner',
  ASSIGN_TRAINER: 'assign_trainer',
  ASSIGN_ASSISTANT: 'assign_assistant',
  PROMOTE_USER: 'promote_user',
  DEMOTE_USER: 'demote_user',
  CHANGE_USER_ROLE: 'change_user_role',
  
  // Admin Permissions
  ACCESS_ADMIN_DASHBOARD: 'access_admin_dashboard',
  CREATE_VOUCHER: 'create_voucher',
  MANAGE_SUBSCRIPTIONS: 'manage_subscriptions',
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  MANAGE_APP_SETTINGS: 'manage_app_settings',
  
  // Account Permissions
  DELETE_OWN_ACCOUNT: 'delete_own_account',
  DELETE_USER_ACCOUNT: 'delete_user_account',
  MANAGE_USER_PROFILE: 'manage_user_profile',
  
  // Parent Permissions
  CREATE_CHILD_ACCOUNT: 'create_child_account',
  MANAGE_CHILD_ACCOUNT: 'manage_child_account',
  RESPOND_FOR_CHILD: 'respond_for_child',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// Role-based permission mapping
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: Object.values(PERMISSIONS), // Admin has all permissions
  
  clubOwner: [
    PERMISSIONS.CREATE_CLUB,
    PERMISSIONS.MANAGE_CLUB,
    PERMISSIONS.DELETE_CLUB,
    PERMISSIONS.VIEW_CLUB,
    PERMISSIONS.TRANSFER_CLUB_OWNERSHIP,
    PERMISSIONS.MANAGE_CLUB_SETTINGS,
    PERMISSIONS.CREATE_TEAM,
    PERMISSIONS.MANAGE_TEAM,
    PERMISSIONS.DELETE_TEAM,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.ADD_TEAM_MEMBER,
    PERMISSIONS.REMOVE_TEAM_MEMBER,
    PERMISSIONS.CREATE_CLUB_EVENT,
    PERMISSIONS.CREATE_TEAM_EVENT,
    PERMISSIONS.CREATE_PERSONAL_EVENT,
    PERMISSIONS.MODIFY_EVENT,
    PERMISSIONS.DELETE_EVENT,
    PERMISSIONS.VIEW_EVENT,
    PERMISSIONS.MANAGE_EVENT_ATTENDANCE,
    PERMISSIONS.CREATE_TEAM_CHAT,
    PERMISSIONS.CREATE_CLUB_CHAT,
    PERMISSIONS.CREATE_ONE_TO_ONE_CHAT,
    PERMISSIONS.VIEW_CHAT,
    PERMISSIONS.SEND_MESSAGE,
    PERMISSIONS.ASSIGN_TRAINER,
    PERMISSIONS.ASSIGN_ASSISTANT,
    PERMISSIONS.PROMOTE_USER,
    PERMISSIONS.DEMOTE_USER,
    PERMISSIONS.DELETE_OWN_ACCOUNT,
    PERMISSIONS.MANAGE_USER_PROFILE,
  ],
  
  trainer: [
    PERMISSIONS.VIEW_CLUB,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.ADD_TEAM_MEMBER,
    PERMISSIONS.REMOVE_TEAM_MEMBER,
    PERMISSIONS.CREATE_TEAM_EVENT,
    PERMISSIONS.CREATE_PERSONAL_EVENT,
    PERMISSIONS.MODIFY_EVENT,
    PERMISSIONS.DELETE_EVENT,
    PERMISSIONS.VIEW_EVENT,
    PERMISSIONS.MANAGE_EVENT_ATTENDANCE,
    PERMISSIONS.CREATE_TEAM_CHAT,
    PERMISSIONS.CREATE_ONE_TO_ONE_CHAT,
    PERMISSIONS.VIEW_CHAT,
    PERMISSIONS.SEND_MESSAGE,
    PERMISSIONS.ASSIGN_ASSISTANT,
    PERMISSIONS.DELETE_OWN_ACCOUNT,
    PERMISSIONS.MANAGE_USER_PROFILE,
  ],
  
  assistant: [
    PERMISSIONS.VIEW_CLUB,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.VIEW_EVENT,
    PERMISSIONS.MANAGE_EVENT_ATTENDANCE,
    PERMISSIONS.CREATE_ONE_TO_ONE_CHAT,
    PERMISSIONS.VIEW_CHAT,
    PERMISSIONS.SEND_MESSAGE,
    PERMISSIONS.DELETE_OWN_ACCOUNT,
    PERMISSIONS.MANAGE_USER_PROFILE,
  ],
  
  user: [
    PERMISSIONS.VIEW_CLUB,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.CREATE_PERSONAL_EVENT,
    PERMISSIONS.VIEW_EVENT,
    PERMISSIONS.CREATE_ONE_TO_ONE_CHAT,
    PERMISSIONS.VIEW_CHAT,
    PERMISSIONS.SEND_MESSAGE,
    PERMISSIONS.DELETE_OWN_ACCOUNT,
    PERMISSIONS.MANAGE_USER_PROFILE,
  ],
  
  parent: [
    PERMISSIONS.VIEW_CLUB,
    PERMISSIONS.VIEW_TEAM,
    PERMISSIONS.CREATE_PERSONAL_EVENT,
    PERMISSIONS.VIEW_EVENT,
    PERMISSIONS.CREATE_ONE_TO_ONE_CHAT,
    PERMISSIONS.VIEW_CHAT,
    PERMISSIONS.SEND_MESSAGE,
    PERMISSIONS.CREATE_CHILD_ACCOUNT,
    PERMISSIONS.MANAGE_CHILD_ACCOUNT,
    PERMISSIONS.RESPOND_FOR_CHILD,
    PERMISSIONS.DELETE_OWN_ACCOUNT,
    PERMISSIONS.MANAGE_USER_PROFILE,
  ],
};


