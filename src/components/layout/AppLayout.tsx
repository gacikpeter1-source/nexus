import { ReactNode, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Sidebar from './Sidebar';
import LanguageSwitcher from '../common/LanguageSwitcher';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * Main Application Layout with Sidebar
 * - Responsive sidebar navigation
 * - Top header bar
 * - Mobile-first design
 */
export default function AppLayout({ children }: AppLayoutProps) {
  const { user, loading, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Chat is a fixed-height "fits exactly one screen" layout (its own internal
  // scroll regions), not a normal scrolling page — the page padding and
  // footer below would otherwise push its message input off-screen on
  // phones (see ChatsPage.tsx, which fills this <main> via flexbox instead
  // of guessing a vh value).
  const isChatRoute = location.pathname.startsWith('/chat');

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
      <div className="min-h-screen flex items-center justify-center bg-app-primary">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-app-primary">
      {/* Sidebar — fixed overlay on mobile, fixed panel on tablet/desktop */}
      <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} />

      {/* Main Content — padding-left reserves space for the fixed sidebar */}
      <div className="md:pl-56 lg:pl-64 flex flex-col min-h-dvh overflow-x-hidden">
        {/* Top Header Bar - Sticky on mobile */}
        <header className="sticky top-0 z-30 bg-app-secondary shadow-card border-b border-white/10 h-16 flex items-center justify-between px-4 md:px-8 gap-4">
          {/* Left side: Hamburger menu (mobile only) */}
          <button
            onClick={() => setIsMobileOpen(true)}
            className="md:hidden p-2 rounded-xl border border-white/10 text-text-primary hover:bg-white/5 transition-all"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Right side: Language switcher and logout */}
          {user && (
            <div className="flex items-center gap-2 sm:gap-4 ml-auto">
              {/* Language Switcher */}
              <LanguageSwitcher />
              
              {/* Logout Button */}
              <button
                onClick={handleLogout}
                className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-gradient-primary rounded-xl shadow-button hover:shadow-button-hover transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                {t('nav.logout')}
              </button>
            </div>
          )}
        </header>

        {/* Main Content */}
        <main className={isChatRoute ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : 'flex-1 py-4 sm:py-6 md:py-8 lg:py-10'}>
          {children}
        </main>

        {/* Footer — hidden on chat so its fixed-height layout isn't pushed past the viewport */}
        {!isChatRoute && (
          <footer className="bg-app-secondary border-t border-white/10 py-6">
            <div className="px-4 md:px-8">
              <p className="text-center text-sm text-text-muted">
                {t('footer.copyright', { year: new Date().getFullYear(), name: t('brand.fullName'), tagline: t('brand.tagline') })}
              </p>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}

