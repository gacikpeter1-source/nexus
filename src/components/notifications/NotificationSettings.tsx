/**
 * Notification Settings Component
 * User preferences for push notifications
 */

import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';

interface NotificationPreferences {
  eventReminders: boolean;
  chatMessages: boolean;
  teamUpdates: boolean;
  clubAnnouncements: boolean;
  joinRequests: boolean;
  waitlistPromotions: boolean;
  systemNotifications: boolean;
}

export default function NotificationSettings() {
  const { user } = useAuth();
  const { hasPermission, requestPermission } = useNotifications();
  const { t } = useLanguage();
  
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    user?.notificationPreferences || {
      eventReminders: true,
      chatMessages: true,
      teamUpdates: true,
      clubAnnouncements: true,
      joinRequests: true,
      waitlistPromotions: true,
      systemNotifications: true,
    }
  );
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  /**
   * Handle preference toggle
   */
  const handleToggle = (key: keyof NotificationPreferences) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
    setSaved(false);
  };

  /**
   * Save preferences to Firestore
   */
  const handleSave = async () => {
    try {
      setSaving(true);
      
      const userRef = doc(db, 'users', user.id);
      await updateDoc(userRef, {
        notificationPreferences: preferences,
        updatedAt: new Date().toISOString()
      });
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      alert(t('notifications.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Request browser notification permission
   */
  const handleEnableNotifications = async () => {
    await requestPermission();
  };

  return (
    <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 space-y-6">
      {/* Header */}
      <div className="border-b border-white/10 pb-4">
        <h2 className="text-2xl font-semibold text-text-primary">
          {t('notifications.settings')}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {t('notifications.settingsDescription')}
        </p>
      </div>

      {/* Browser Permission */}
      {!hasPermission && (
        <div className="bg-chart-purple/10 border border-chart-purple/30 rounded-xl p-4">
          <div className="flex items-start">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-chart-purple mb-2">
                {t('notifications.enableTitle')}
              </h3>
              <p className="text-sm text-text-secondary mb-4">
                {t('notifications.enableDescription')}
              </p>
              <button
                onClick={handleEnableNotifications}
                className="px-6 py-2 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 text-sm font-semibold"
              >
                {t('notifications.enableButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission Status */}
      {hasPermission && (
        <div className="bg-chart-cyan/10 border border-chart-cyan/30 rounded-xl p-4">
          <div className="flex items-center">
            <span className="text-sm font-semibold text-chart-cyan">
              {t('notifications.enabled')}
            </span>
          </div>
        </div>
      )}

      {/* Preferences List */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          {t('notifications.preferences')}
        </h3>

        {/* Event Reminders */}
        <label className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300">
          <div className="flex-1">
            <div className="font-semibold text-text-primary">
              {t('notifications.eventReminders')}
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {t('notifications.eventRemindersDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.eventReminders}
            onChange={() => handleToggle('eventReminders')}
            className="ml-4 h-5 w-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
          />
        </label>

        {/* Chat Messages */}
        <label className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300">
          <div className="flex-1">
            <div className="font-semibold text-text-primary">
              {t('notifications.chatMessages')}
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {t('notifications.chatMessagesDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.chatMessages}
            onChange={() => handleToggle('chatMessages')}
            className="ml-4 h-5 w-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
          />
        </label>

        {/* Team Updates */}
        <label className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300">
          <div className="flex-1">
            <div className="font-semibold text-text-primary">
              {t('notifications.teamUpdates')}
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {t('notifications.teamUpdatesDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.teamUpdates}
            onChange={() => handleToggle('teamUpdates')}
            className="ml-4 h-5 w-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
          />
        </label>

        {/* Club Announcements */}
        <label className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300">
          <div className="flex-1">
            <div className="font-semibold text-text-primary">
              {t('notifications.clubAnnouncements')}
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {t('notifications.clubAnnouncementsDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.clubAnnouncements}
            onChange={() => handleToggle('clubAnnouncements')}
            className="ml-4 h-5 w-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
          />
        </label>

        {/* Join Requests (Trainers/Owners only) */}
        {(user.role === 'trainer' || user.role === 'clubOwner' || user.role === 'admin') && (
          <label className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300">
            <div className="flex-1">
              <div className="font-semibold text-text-primary">
                {t('notifications.joinRequests')}
              </div>
              <div className="text-sm text-text-secondary mt-1">
                {t('notifications.joinRequestsDesc')}
              </div>
            </div>
            <input
              type="checkbox"
              checked={preferences.joinRequests}
              onChange={() => handleToggle('joinRequests')}
              className="ml-4 h-5 w-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
            />
          </label>
        )}

        {/* Waitlist Promotions */}
        <label className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300">
          <div className="flex-1">
            <div className="font-semibold text-text-primary">
              {t('notifications.waitlistPromotions')}
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {t('notifications.waitlistPromotionsDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.waitlistPromotions}
            onChange={() => handleToggle('waitlistPromotions')}
            className="ml-4 h-5 w-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
          />
        </label>

        {/* System Notifications */}
        <label className="flex items-center justify-between p-4 bg-app-secondary border border-white/10 rounded-xl hover:bg-white/5 cursor-pointer transition-all duration-300">
          <div className="flex-1">
            <div className="font-semibold text-text-primary">
              {t('notifications.systemNotifications')}
            </div>
            <div className="text-sm text-text-secondary mt-1">
              {t('notifications.systemNotificationsDesc')}
            </div>
          </div>
          <input
            type="checkbox"
            checked={preferences.systemNotifications}
            onChange={() => handleToggle('systemNotifications')}
            className="ml-4 h-5 w-5 text-app-blue focus:ring-app-blue bg-app-primary border-white/20 rounded"
          />
        </label>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/10">
        {saved && (
          <span className="text-sm text-chart-cyan font-semibold">
            {t('common.saved')}
          </span>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-8 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300 font-semibold"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  );
}

