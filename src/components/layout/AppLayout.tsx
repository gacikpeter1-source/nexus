import { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { BRAND } from '../../config/brand';
import { PERMISSIONS } from '../../constants/permissions';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Main Application Layout
 * - Top navigation bar
 * - Responsive container for content
 * - Mobile-first design
 */
export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading, logout } = useAuth();
  const { t } = useLanguage();
  const { can } = usePermissions();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation Bar */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">N</span>
              </div>
              <span className="text-xl font-bold text-gray-900">{BRAND.name}</span>
            </Link>

            {/* Navigation Links */}
            <div className="hidden md:flex items-center space-x-6">
              <Link
                to="/"
                className="text-gray-700 hover:text-primary transition-colors"
              >
                {t('nav.dashboard')}
              </Link>
              <Link
                to="/clubs"
                className="text-gray-700 hover:text-primary transition-colors"
              >
                {t('nav.clubs')}
              </Link>
              <Link
                to="/calendar"
                className="text-gray-700 hover:text-primary transition-colors"
              >
                {t('nav.calendar')}
              </Link>
              <Link
                to="/chat"
                className="text-gray-700 hover:text-primary transition-colors"
              >
                {t('nav.chat')}
              </Link>
              <Link
                to="/teams"
                className="text-gray-700 hover:text-primary transition-colors"
              >
                {t('nav.teams')}
              </Link>
              
              {/* User Management - Only for club owners and admins */}
              {can(PERMISSIONS.CHANGE_USER_ROLE) && (
                <Link
                  to="/users"
                  className="text-gray-700 hover:text-primary transition-colors"
                >
                  {t('nav.users')}
                </Link>
              )}
            </div>

            {/* User Menu */}
            {user && (
              <div className="flex items-center space-x-4">
                {/* Language Switcher */}
                <LanguageSwitcher />
                
                {/* User Profile Link */}
                <Link
                  to="/profile"
                  className="text-sm text-gray-700 hover:text-primary hidden sm:flex items-center space-x-2"
                >
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-sm font-medium">
                    {user.displayName?.charAt(0).toUpperCase() || 'U'}
                  </div>
                  <span>{user.displayName || user.email}</span>
                </Link>
                
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary-600 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                >
                  {t('nav.logout')}
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-6 md:py-8 lg:py-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            {t('footer.copyright', { year: new Date().getFullYear(), name: t('brand.fullName'), tagline: t('brand.tagline') })}
          </p>
        </div>
      </footer>
    </div>
  );
}

