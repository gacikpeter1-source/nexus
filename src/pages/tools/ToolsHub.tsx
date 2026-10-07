/**
 * Tools (Nástroje) Hub
 * Club-level landing page for staff tools — Training Board, Tournament
 * Templates, and (in future) more models as the club's toolset grows.
 */

import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];

export default function ToolsHub() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  if (!isStaff) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/" className="text-app-cyan hover:text-app-cyan/80">{t('nav.dashboard')}</Link>
        </div>
      </Container>
    );
  }

  const tools = [
    {
      to: '/training-board',
      icon: '📋',
      title: t('nav.trainingBoard'),
      desc: t('tools.trainingBoardDesc'),
    },
    {
      to: '/tools/tournaments',
      icon: '🏆',
      title: t('tools.tournaments'),
      desc: t('tools.tournamentsDesc'),
    },
    {
      to: '/tools/training-timer',
      icon: '⏱',
      title: t('tools.trainingTimer'),
      desc: t('tools.trainingTimerDesc'),
    },
    {
      to: '/tools/lineup',
      icon: '👥',
      title: t('tools.lineup'),
      desc: t('tools.lineupDesc'),
    },
    {
      to: '/tools/inventory',
      icon: '📦',
      title: t('tools.inventory'),
      desc: t('tools.inventoryDesc'),
    },
    {
      to: '/tools/rink-schedule',
      icon: '🏟️',
      title: t('tools.rinkSchedule'),
      desc: t('tools.rinkScheduleDesc'),
    },
    {
      to: '/tools/cognitive-training',
      icon: '🧠',
      title: t('tools.cognitiveTraining'),
      desc: t('tools.cognitiveTrainingDesc'),
    },
  ];

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t('tools.title')}</h1>
          <p className="text-xs text-text-secondary mt-0.5">{t('tools.subtitle')}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {tools.map(tool => (
            <Link
              key={tool.to}
              to={tool.to}
              title={tool.desc}
              className="flex items-center gap-2.5 bg-app-card rounded-xl shadow-card border border-white/10 p-3 hover:border-app-blue transition-colors duration-200"
            >
              <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center text-lg">{tool.icon}</span>
              <span className="text-xs font-bold text-text-primary leading-tight">{tool.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </Container>
  );
}
