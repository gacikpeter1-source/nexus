/**
 * Notification Settings Component
 * Mobile-first UI for managing push notification preferences
 */

import { useNotifications } from '../../hooks/useNotifications';
import { useLanguage } from '../../contexts/LanguageContext';

export default function NotificationSettings() {
  const { t } = useLanguage();
  const {
    permission,
    error,
    loading,
    settings,
    enableNotifications,
    disableNotifications,
    updateSettings,
  } = useNotifications();

  // Handle master toggle
  const handleMasterToggle = async () => {
    if (permission === 'default' || permission === 'denied') {
      // Request permission
      await enableNotifications();
    } else if (settings.enabled) {
      // Disable notifications
      await disableNotifications();
    } else {
      // Re-enable notifications
      await enableNotifications();
    }
  };

  // Handle individual toggle
  const handleToggle = async (key: keyof typeof settings) => {
    if (key === 'enabled') return; // Use master toggle for this
    await updateSettings({ [key]: !settings[key] });
  };

  const isEnabled = permission === 'granted' && settings.enabled;
  const isBlocked = permission === 'denied';

  return (
    <div className="bg-app-card rounded-lg sm:rounded-xl border border-white/10 p-3 sm:p-4">
      <h2 className="text-base sm:text-lg font-bold text-text-primary mb-3 sm:mb-4">
        🔔 {t('settings.notifications.title')}
      </h2>

      {/* Permission Blocked Warning */}
      {isBlocked && (
        <div className="bg-chart-pink/10 border border-chart-pink/30 rounded-lg p-3 mb-3">
          <p className="text-chart-pink text-xs sm:text-sm font-medium mb-1">
            {t('settings.notifications.blocked')}
          </p>
          <p className="text-chart-pink/80 text-[10px] sm:text-xs">
            {t('settings.notifications.blockedHint')}
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && !isBlocked && (
        <div className="bg-chart-pink/10 border border-chart-pink/30 rounded-lg p-3 mb-3">
          <p className="text-chart-pink text-xs sm:text-sm">{error}</p>
        </div>
      )}

      {/* Master Toggle */}
      <div className="flex items-center justify-between py-3 border-b border-white/10">
        <div className="flex-1 min-w-0 pr-3">
          <h3 className="text-text-primary font-semibold text-sm sm:text-base">
            {t('settings.notifications.enable')}
          </h3>
          <p className="text-text-muted text-[10px] sm:text-xs mt-0.5">
            {t('settings.notifications.enableHint')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleMasterToggle}
            disabled={loading || isBlocked}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-app-secondary peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-app-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
        </label>
      </div>

      {/* Individual Settings */}
      {isEnabled && (
        <div className="space-y-2 sm:space-y-3 mt-3">
          {/* Event Reminders */}
          <ToggleItem
            label={t('settings.notifications.eventReminders')}
            description={t('settings.notifications.eventRemindersHint')}
            checked={settings.eventReminders}
            onChange={() => handleToggle('eventReminders')}
            disabled={loading}
            icon="📅"
          />

          {/* Team Updates */}
          <ToggleItem
            label={t('settings.notifications.teamUpdates')}
            description={t('settings.notifications.teamUpdatesHint')}
            checked={settings.teamUpdates}
            onChange={() => handleToggle('teamUpdates')}
            disabled={loading}
            icon="👥"
          />

          {/* Chat Messages */}
          <ToggleItem
            label={t('settings.notifications.chatMessages')}
            description={t('settings.notifications.chatMessagesHint')}
            checked={settings.chatMessages}
            onChange={() => handleToggle('chatMessages')}
            disabled={loading}
            icon="💬"
          />

          {/* Club Announcements */}
          <ToggleItem
            label={t('settings.notifications.clubAnnouncements')}
            description={t('settings.notifications.clubAnnouncementsHint')}
            checked={settings.clubAnnouncements}
            onChange={() => handleToggle('clubAnnouncements')}
            disabled={loading}
            icon="📢"
          />

          {/* Join Requests */}
          <ToggleItem
            label={t('settings.notifications.joinRequests')}
            description={t('settings.notifications.joinRequestsHint')}
            checked={settings.joinRequests}
            onChange={() => handleToggle('joinRequests')}
            disabled={loading}
            icon="🙋"
          />

          {/* Waitlist Promotions */}
          <ToggleItem
            label={t('settings.notifications.waitlistPromotions')}
            description={t('settings.notifications.waitlistPromotionsHint')}
            checked={settings.waitlistPromotions}
            onChange={() => handleToggle('waitlistPromotions')}
            disabled={loading}
            icon="⏫"
          />

          {/* System Notifications */}
          <ToggleItem
            label={t('settings.notifications.systemNotifications')}
            description={t('settings.notifications.systemNotificationsHint')}
            checked={settings.systemNotifications}
            onChange={() => handleToggle('systemNotifications')}
            disabled={loading}
            icon="⚙️"
          />
        </div>
      )}

      {/* Permission Info */}
      {!isBlocked && permission === 'default' && (
        <div className="mt-3 bg-app-secondary rounded-lg p-3 border border-white/10">
          <p className="text-text-secondary text-[10px] sm:text-xs">
            💡 {t('settings.notifications.permissionHint')}
          </p>
        </div>
      )}

      {/* iOS Safari Warning */}
      {typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) && (
        <div className="mt-3 bg-chart-purple/10 border border-chart-purple/30 rounded-lg p-3">
          <p className="text-chart-purple text-[10px] sm:text-xs font-medium mb-1">
            📱 {t('settings.notifications.iosWarning')}
          </p>
          <p className="text-chart-purple/80 text-[9px] sm:text-[10px]">
            {t('settings.notifications.iosWarningHint')}
          </p>
        </div>
      )}
    </div>
  );
}

// Toggle Item Component
interface ToggleItemProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  icon?: string;
}

function ToggleItem({ label, description, checked, onChange, disabled, icon }: ToggleItemProps) {
  return (
    <div className="flex items-center justify-between py-2.5 sm:py-3">
      <div className="flex-1 min-w-0 pr-3">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-sm sm:text-base flex-shrink-0">{icon}</span>}
          <h4 className="text-text-primary font-medium text-xs sm:text-sm">{label}</h4>
        </div>
        <p className="text-text-muted text-[9px] sm:text-[10px] mt-0.5">{description}</p>
      </div>
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-app-secondary peer-focus:outline-none peer-focus:ring-1 peer-focus:ring-app-cyan rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-app-cyan peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
      </label>
    </div>
  );
}
