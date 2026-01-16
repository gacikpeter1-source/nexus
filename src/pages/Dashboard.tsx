import Container from '../components/layout/Container';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';

export default function Dashboard() {
  const { user } = useAuth();
  const { t } = useLanguage();

  return (
    <Container>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {t('dashboard.welcome', { name: user?.displayName || 'User' })}
          </h1>
          <p className="mt-2 text-gray-600">
            {t('dashboard.subtitle')}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title={t('dashboard.stats.yourClubs')}
            value={user?.clubIds?.length || 0}
            icon="🏢"
            color="bg-blue-500"
          />
          <StatCard
            title={t('dashboard.stats.upcomingEvents')}
            value="0"
            icon="📅"
            color="bg-green-500"
          />
          <StatCard
            title={t('dashboard.stats.teamMembers')}
            value="0"
            icon="👥"
            color="bg-purple-500"
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {t('dashboard.quickActions.title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <ActionButton
              label={t('dashboard.quickActions.createEvent')}
              icon="📅"
              onClick={() => alert(t('dashboard.comingSoon', { feature: t('dashboard.quickActions.createEvent') }))}
            />
            <ActionButton
              label={t('dashboard.quickActions.manageTeams')}
              icon="👥"
              onClick={() => alert(t('dashboard.comingSoon', { feature: t('dashboard.quickActions.manageTeams') }))}
            />
            <ActionButton
              label={t('dashboard.quickActions.viewCalendar')}
              icon="🗓️"
              onClick={() => alert(t('dashboard.comingSoon', { feature: t('dashboard.quickActions.viewCalendar') }))}
            />
            <ActionButton
              label={t('dashboard.quickActions.settings')}
              icon="⚙️"
              onClick={() => alert(t('dashboard.comingSoon', { feature: t('dashboard.quickActions.settings') }))}
            />
          </div>
        </div>

        {/* Recent Activity (Placeholder) */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            {t('dashboard.recentActivity.title')}
          </h2>
          <div className="text-center py-8 text-gray-500">
            <p>{t('dashboard.recentActivity.noActivity')}</p>
            <p className="text-sm mt-2">{t('dashboard.recentActivity.noActivityHint')}</p>
          </div>
        </div>
      </div>
    </Container>
  );
}

// Helper Components

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

function StatCard({ title, value, icon, color }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${color} text-white rounded-lg p-3 text-2xl`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface ActionButtonProps {
  label: string;
  icon: string;
  onClick: () => void;
}

function ActionButton({ label, icon, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-center space-x-2 px-4 py-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </button>
  );
}
