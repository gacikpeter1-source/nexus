/**
 * User Profile Page
 * View and edit user profile information
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import RoleBadge from '../components/common/RoleBadge';

export default function Profile() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);

  if (!user) return null;

  return (
    <Container className="max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {/* Avatar */}
              <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center text-3xl font-bold text-white">
                {user.displayName?.charAt(0).toUpperCase() || 'U'}
              </div>
              
              {/* User Info */}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {user.displayName || t('profile.noName')}
                </h1>
                <p className="text-gray-600">{user.email}</p>
                <div className="mt-2">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>

            {/* Edit Button */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors"
            >
              {isEditing ? t('common.cancel') : t('common.edit')}
            </button>
          </div>
        </div>

        {/* Profile Information */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {t('profile.information.title')}
          </h2>

          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('profile.information.displayName')}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  defaultValue={user.displayName}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                />
              ) : (
                <p className="text-gray-900">{user.displayName || '-'}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('profile.information.email')}
              </label>
              <p className="text-gray-900">{user.email}</p>
              {!user.emailVerified && (
                <p className="text-sm text-orange-600 mt-1">
                  {t('profile.information.emailNotVerified')}
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('profile.information.phoneNumber')}
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  defaultValue={user.phoneNumber}
                  placeholder="+421 900 123 456"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
                />
              ) : (
                <p className="text-gray-900">{user.phoneNumber || '-'}</p>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('profile.information.role')}
              </label>
              <RoleBadge role={user.role} />
            </div>

            {/* Clubs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('profile.information.clubs')}
              </label>
              <p className="text-gray-900">
                {user.clubIds?.length || 0} {t('profile.information.clubsCount')}
              </p>
            </div>

            {/* Member Since */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('profile.information.memberSince')}
              </label>
              <p className="text-gray-900">
                {user.createdAt ? new Date(user.createdAt as string).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>

          {/* Save Button */}
          {isEditing && (
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  // TODO: Implement save functionality
                  alert(t('profile.saveSuccess'));
                  setIsEditing(false);
                }}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors"
              >
                {t('common.save')}
              </button>
            </div>
          )}
        </div>

        {/* Danger Zone */}
        <div className="bg-white shadow-sm rounded-lg border border-red-200 p-6">
          <h2 className="text-lg font-semibold text-red-600 mb-4">
            {t('profile.dangerZone.title')}
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            {t('profile.dangerZone.description')}
          </p>
          <button
            onClick={() => {
              if (confirm(t('profile.dangerZone.confirmDelete'))) {
                alert(t('profile.dangerZone.deleteInfo'));
              }
            }}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
          >
            {t('profile.dangerZone.deleteAccount')}
          </button>
        </div>
      </div>
    </Container>
  );
}

