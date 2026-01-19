/**
 * Notifications Page
 * Display notification settings and recent notifications
 */

import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import NotificationSettings from '../components/notifications/NotificationSettings';

export default function Notifications() {
  const { t } = useLanguage();

  return (
    <Container>
      <div className="py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">
            {t('notifications.title')}
          </h1>
        </div>

        {/* Notification Settings */}
        <NotificationSettings />

        {/* Info Section */}
        <div className="mt-8 bg-app-card border border-app-cyan/30 rounded-2xl p-6 shadow-card">
          <h3 className="text-lg font-semibold text-app-cyan mb-4">
            {t('notifications.howItWorks')}
          </h3>
          <ul className="space-y-3 text-sm text-text-secondary">
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('notifications.howItWorksDesc1')}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('notifications.howItWorksDesc2')}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('notifications.howItWorksDesc3')}</span>
            </li>
            <li className="flex items-start">
              <span className="mr-3 text-app-cyan">•</span>
              <span>{t('notifications.howItWorksDesc4')}</span>
            </li>
          </ul>
        </div>
      </div>
    </Container>
  );
}

