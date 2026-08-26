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
  ];

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t('tools.title')}</h1>
          <p className="text-xs text-text-secondary mt-0.5">{t('tools.subtitle')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tools.map(tool => (
            <Link
              key={tool.to}
              to={tool.to}
              className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 hover:border-app-blue hover:-translate-y-0.5 transition-all duration-300"
            >
              <div className="text-2xl mb-2">{tool.icon}</div>
              <h2 className="text-sm font-bold text-text-primary">{tool.title}</h2>
              <p className="text-xs text-text-secondary mt-1">{tool.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </Container>
  );
}
