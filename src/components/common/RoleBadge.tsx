/**
 * RoleBadge Component
 * Displays user role with color-coded badge
 */

import { useLanguage } from '../../contexts/LanguageContext';
import { getRoleColor, getRoleDisplayName } from '../../utils/permissions';
import type { UserRole } from '../../types';

interface RoleBadgeProps {
  role: UserRole;
  size?: 'sm' | 'md' | 'lg';
}

export default function RoleBadge({ role, size = 'md' }: RoleBadgeProps) {
  const { t } = useLanguage();
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };
  
  const colorClass = getRoleColor(role as any);
  const displayName = getRoleDisplayName(role as any, t);
  
  return (
    <span
      className={`
        inline-flex items-center font-medium text-white rounded-full
        ${colorClass}
        ${sizeClasses[size]}
      `}
    >
      {displayName}
    </span>
  );
}


