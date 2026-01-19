/**
 * usePermissions Hook
 * Provides permission checking utilities for components
 * Based on: docs/01-user-management.md
 */

import { useAuth } from '../contexts/AuthContext';
import type { Permission } from '../constants/permissions';
import {
  hasPermission,
  hasRoleLevel,
  isClubOwner,
  isTrainer,
  canModifyResource,
  isClubMember,
  isParent,
  canManageUser,
} from '../utils/permissions';

export function usePermissions() {
  const { user } = useAuth();

  return {
    // Check if user has a specific permission
    can: (permission: Permission): boolean => {
      return hasPermission(user, permission);
    },

    // Check if user has a role level
    hasRole: (role: string): boolean => {
      return hasRoleLevel(user, role as any);
    },

    // Check if user is club owner
    isClubOwner: (clubId?: string): boolean => {
      return isClubOwner(user, clubId);
    },

    // Check if user is trainer
    isTrainer: (clubId?: string): boolean => {
      return isTrainer(user, clubId);
    },

    // Check if user can modify a resource
    canModify: (
      resourceType: 'event' | 'team' | 'club' | 'user',
      resourceOwnerId: string,
      clubId?: string
    ): boolean => {
      return canModifyResource(user, resourceType, resourceOwnerId, clubId);
    },

    // Check if user is member of a club
    isMember: (clubId: string): boolean => {
      return isClubMember(user, clubId);
    },

    // Check if user is parent
    isParent: (): boolean => {
      return isParent(user);
    },

    // Check if user can manage another user
    canManage: (targetUser: any): boolean => {
      if (!user) return false;
      return canManageUser(user, targetUser);
    },

    // Get current user
    user,
  };
}


