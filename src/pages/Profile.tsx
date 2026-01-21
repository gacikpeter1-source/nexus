/**
 * User Profile Page
 * View and edit user profile information
 */

import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import RoleBadge from '../components/common/RoleBadge';
import NotificationSettings from '../components/notifications/NotificationSettings';
import { uploadFile } from '../services/firebase/storage';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../config/firebase';

export default function Profile() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoURL, setPhotoURL] = useState(user?.photoURL || '');
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user) return null;

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert(t('profile.photo.invalidType'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(t('profile.photo.tooLarge'));
      return;
    }

    try {
      setUploading(true);

      // TODO: Delete old photo if exists
      // Note: user.photoURL is a download URL, not a storage path
      // We would need to store the storage path separately to delete it
      // For now, old photos will remain in storage

      // Upload new photo
      const uploadResult = await uploadFile(file, {
        category: 'profile',
        userId: user.id,
        visibility: 'public',
      });

      // Update user profile in Firestore
      await updateDoc(doc(db, 'users', user.id), {
        photoURL: uploadResult.downloadUrl,
      });

      setPhotoURL(uploadResult.downloadUrl);
      alert(t('profile.photo.uploadSuccess'));
    } catch (error) {
      console.error('Error uploading photo:', error);
      alert(t('profile.photo.uploadError'));
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveProfile() {
    if (!user) return;

    try {
      await updateDoc(doc(db, 'users', user.id), {
        displayName,
        phoneNumber,
      });
      alert(t('profile.saveSuccess'));
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving profile:', error);
      alert(t('profile.saveError'));
    }
  }

  return (
    <Container className="max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-app-card border border-white/10 rounded-2xl shadow-card p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              {/* Avatar / Photo */}
              <div className="relative group">
                {photoURL || user.photoURL ? (
                  <img
                    src={photoURL || user.photoURL}
                    alt={user.displayName || 'Profile'}
                    className="w-20 h-20 rounded-full object-cover border-2 border-app-blue"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center text-3xl font-bold text-white">
                    {user.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                )}
                
                {/* Upload Photo Button (Overlay on hover) */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  {uploading ? (
                    <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
                
                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
              
              {/* User Info */}
              <div>
                <h1 className="text-2xl font-bold text-text-primary">
                  {user.displayName || t('profile.noName')}
                </h1>
                <p className="text-text-secondary">{user.email}</p>
                <div className="mt-2">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>

            {/* Edit Button */}
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="bg-gradient-primary text-white font-semibold px-6 py-3 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5"
            >
              {isEditing ? t('common.cancel') : t('common.edit')}
            </button>
          </div>
        </div>

        {/* Profile Information */}
        <div className="bg-app-card border border-white/10 rounded-2xl shadow-card p-6">
          <h2 className="text-xl font-bold text-text-primary mb-4">
            {t('profile.information.title')}
          </h2>

          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.displayName')}
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:ring-2 focus:ring-app-blue"
                />
              ) : (
                <p className="text-text-primary">{user.displayName || '-'}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.email')}
              </label>
              <p className="text-text-primary">{user.email}</p>
              {!user.emailVerified && (
                <p className="text-sm text-chart-pink mt-1">
                  {t('profile.information.emailNotVerified')}
                </p>
              )}
            </div>

            {/* Phone Number */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.phoneNumber')}
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+421 900 123 456"
                  className="w-full px-4 py-2 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:ring-2 focus:ring-app-blue"
                />
              ) : (
                <p className="text-text-primary">{user.phoneNumber || '-'}</p>
              )}
            </div>

            {/* Role */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.role')}
              </label>
              <RoleBadge role={user.role} />
            </div>

            {/* Clubs */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.clubs')}
              </label>
              <p className="text-text-primary">
                {user.clubIds?.length || 0} {t('profile.information.clubsCount')}
              </p>
            </div>

            {/* Member Since */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                {t('profile.information.memberSince')}
              </label>
              <p className="text-text-primary">
                {user.createdAt ? new Date(user.createdAt as string).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>

          {/* Save Button */}
          {isEditing && (
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setIsEditing(false)}
                className="bg-white/10 border border-white/20 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/15 transition-all duration-300"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveProfile}
                className="bg-gradient-primary text-white font-semibold px-6 py-3 rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5"
              >
                {t('common.save')}
              </button>
            </div>
          )}
        </div>

        {/* Notification Settings */}
        <NotificationSettings />

        {/* Danger Zone */}
        <div className="bg-app-card border border-chart-pink/30 rounded-2xl shadow-card p-6">
          <h2 className="text-xl font-bold text-chart-pink mb-4">
            {t('profile.dangerZone.title')}
          </h2>
          <p className="text-sm text-text-secondary mb-4">
            {t('profile.dangerZone.description')}
          </p>
          <button
            onClick={() => {
              if (confirm(t('profile.dangerZone.confirmDelete'))) {
                alert(t('profile.dangerZone.deleteInfo'));
              }
            }}
            className="bg-chart-pink/20 border border-chart-pink text-chart-pink font-semibold px-6 py-3 rounded-xl hover:bg-chart-pink/30 transition-all duration-300"
          >
            {t('profile.dangerZone.deleteAccount')}
          </button>
        </div>
      </div>
    </Container>
  );
}


