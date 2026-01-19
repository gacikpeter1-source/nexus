/**
 * Permission Utility Functions
 * Based on: docs/01-user-management.md
 */

import type { User } from '../types';
import { ROLES, ROLE_HIERARCHY, ROLE_PERMISSIONS, type Role, type Permission } from '../constants/permissions';

/**
 * Check if user has a specific permission
 */
export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  
  // Super admin has all permissions
  if (user.isSuperAdmin) return true;
  
  // Admin role has all permissions
  if (user.role === ROLES.ADMIN) return true;
  
  // Check if user's role has this permission
  const rolePermissions = ROLE_PERMISSIONS[user.role as Role] || [];
  return rolePermissions.includes(permission);
}

/**
 * Check if user has a role at or above the specified level
 */
export function hasRoleLevel(user: User | null, requiredRole: Role): boolean {
  if (!user) return false;
  
  // Super admin bypasses all role checks
  if (user.isSuperAdmin) return true;
  
  const userLevel = ROLE_HIERARCHY[user.role as Role] || 0;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  
  return userLevel >= requiredLevel;
}

/**
 * Check if user is a club owner
 */
export function isClubOwner(user: User | null, clubId?: string): boolean {
  if (!user) return false;
  
  if (user.isSuperAdmin || user.role === ROLES.ADMIN) return true;
  
  if (user.role !== ROLES.CLUB_OWNER) return false;
  
  // If clubId provided, check if user owns this specific club
  if (clubId) {
    return user.ownedClubIds?.includes(clubId) || false;
  }
  
  // Otherwise, check if user owns any clubs
  return (user.ownedClubIds?.length || 0) > 0;
}

/**
 * Check if user is a trainer for a specific club
 */
export function isTrainer(user: User | null, clubId?: string): boolean {
  if (!user) return false;
  
  if (user.isSuperAdmin || user.role === ROLES.ADMIN) return true;
  
  if (!hasRoleLevel(user, ROLES.TRAINER)) return false;
  
  // If clubId provided, check if user is trainer in this club
  if (clubId) {
    return user.clubIds?.includes(clubId) || false;
  }
  
  return true;
}

/**
 * Check if user can modify a specific resource
 */
export function canModifyResource(
  user: User | null,
  resourceType: 'event' | 'team' | 'club' | 'user',
  resourceOwnerId: string,
  clubId?: string
): boolean {
  if (!user) return false;
  
  // Super admin can modify anything
  if (user.isSuperAdmin || user.role === ROLES.ADMIN) return true;
  
  // User can modify their own resources
  if (user.id === resourceOwnerId) return true;
  
  // Club owner can modify resources in their clubs
  if (clubId && isClubOwner(user, clubId)) return true;
  
  // Trainers can modify team and event resources in their clubs
  if (resourceType === 'event' || resourceType === 'team') {
    if (clubId && isTrainer(user, clubId)) return true;
  }
  
  return false;
}

/**
 * Check if user is member of a club
 */
export function isClubMember(user: User | null, clubId: string): boolean {
  if (!user) return false;
  
  if (user.isSuperAdmin || user.role === ROLES.ADMIN) return true;
  
  return user.clubIds?.includes(clubId) || false;
}

/**
 * Check if user is parent
 */
export function isParent(user: User | null): boolean {
  if (!user) return false;
  return user.role === ROLES.PARENT || (user.childIds?.length || 0) > 0;
}

/**
 * Check if user can manage another user (promote/demote)
 */
export function canManageUser(currentUser: User | null, targetUser: User): boolean {
  if (!currentUser) return false;
  
  // Can't manage yourself
  if (currentUser.id === targetUser.id) return false;
  
  // Super admin can manage anyone
  if (currentUser.isSuperAdmin) return true;
  
  // Admin can manage non-admins
  if (currentUser.role === ROLES.ADMIN && targetUser.role !== ROLES.ADMIN) {
    return true;
  }
  
  // Club owner can manage users in their clubs
  if (currentUser.role === ROLES.CLUB_OWNER) {
    // Check if target user is in any of the current user's clubs
    const currentUserClubs = currentUser.ownedClubIds || [];
    const targetUserClubs = targetUser.clubIds || [];
    
    return currentUserClubs.some(clubId => targetUserClubs.includes(clubId));
  }
  
  return false;
}

/**
 * Get role display name for UI
 */
export function getRoleDisplayName(role: Role, t: (key: string) => string): string {
  const roleMap: Record<Role, string> = {
    admin: t('roles.admin'),
    clubOwner: t('roles.clubOwner'),
    trainer: t('roles.trainer'),
    assistant: t('roles.assistant'),
    user: t('roles.user'),
    parent: t('roles.parent'),
  };
  
  return roleMap[role] || role;
}

/**
 * Get role color for badges
 */
export function getRoleColor(role: Role): string {
  const colorMap: Record<Role, string> = {
    admin: 'bg-red-500',
    clubOwner: 'bg-orange-500',
    trainer: 'bg-blue-500',
    assistant: 'bg-green-500',
    user: 'bg-gray-500',
    parent: 'bg-purple-500',
  };
  
  return colorMap[role] || 'bg-gray-500';
}


