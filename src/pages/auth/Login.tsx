import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import Container from '../../components/layout/Container';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerLoading, setProviderLoading] = useState<'google' | 'facebook' | null>(null);

  const { login, loginWithProvider } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const handleProviderLogin = async (providerName: 'google' | 'facebook') => {
    setError('');
    setProviderLoading(providerName);
    try {
      const idToken = await loginWithProvider(providerName);
      if (rememberMe && idToken) {
        try {
          await fetch('/api/session/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ idToken, rememberMe: true }),
          });
        } catch {
          // Cookie creation failed — not critical, Firebase auth already succeeded
        }
      }
      navigate('/');
    } catch (err: any) {
      console.error('Provider login error:', err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // User closed the popup — not a real error, no message needed
      } else if (err.code === 'auth/account-exists-with-different-credential') {
        setError(t('auth.login.errors.accountExistsDifferentCredential'));
      } else {
        setError(t('auth.login.errors.generalError'));
      }
    } finally {
      setProviderLoading(null);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const idToken = await login(email, password);

      // If "Remember Me" is checked, create a server-side session cookie that
      // survives iOS 18 tab-close storage eviction. Non-Remember-Me users are
      // unaffected — they continue with the existing Firebase client auth flow.
      if (rememberMe && idToken) {
        try {
          await fetch('/api/session/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ idToken, rememberMe: true }),
          });
        } catch {
          // Cookie creation failed — not critical, Firebase auth already succeeded
        }
      }

      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      
      // User-friendly error messages
      // auth/invalid-credential is the v10 SDK replacement for user-not-found + wrong-password
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setError(t('auth.login.errors.invalidCredentials'));
      } else if (err.code === 'auth/user-disabled') {
        setError(t('auth.login.errors.accountDisabled') || t('auth.login.errors.generalError'));
      } else if (err.code === 'auth/too-many-requests') {
        setError(t('auth.login.errors.tooManyAttempts'));
      } else if (err.code === 'auth/network-request-failed') {
        setError(t('auth.login.errors.networkError') || t('auth.login.errors.generalError'));
      } else if (err.code === 'auth/profile-not-found') {
        setError(t('auth.login.errors.profileNotFound') || t('auth.login.errors.generalError'));
      } else {
        setError(t('auth.login.errors.generalError'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-primary flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <Container className="max-w-md">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-card bg-gradient-primary p-1">
              <div className="w-full h-full bg-app-card rounded-xl flex items-center justify-center">
                <span className="text-5xl font-bold text-white">N</span>
              </div>
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            {t('brand.fullName')}
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            {t('auth.login.title')}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-app-card py-8 px-4 shadow-card sm:rounded-2xl sm:px-10 border border-white/10">
            {/* Error Alert (shared with social buttons, shown above everything) */}
            {error && (
              <div className="mb-6 bg-chart-pink/10 border border-chart-pink/30 text-chart-pink px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Social Sign-In */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => handleProviderLogin('google')}
                disabled={providerLoading !== null || loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-white/10 rounded-xl bg-white text-gray-800 font-semibold hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.54 5.54 0 01-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.87-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0012 24z" />
                  <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 010-4.54v-3.1H1.27a12 12 0 000 10.75l4-3.11z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.63l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
                </svg>
                {providerLoading === 'google' ? t('auth.login.signingIn') : t('auth.login.continueWithGoogle')}
              </button>
              <button
                type="button"
                onClick={() => handleProviderLogin('facebook')}
                disabled={providerLoading !== null || loading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-[#1877F2] text-white font-semibold hover:bg-[#1665D8] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z" />
                </svg>
                {providerLoading === 'facebook' ? t('auth.login.signingIn') : t('auth.login.continueWithFacebook')}
              </button>
            </div>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-app-card text-text-muted">{t('auth.login.orContinueWithEmail')}</span>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-text-primary mb-2">
                  {t('auth.login.emailLabel')}
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
                  placeholder={t('auth.login.emailPlaceholder')}
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-text-primary mb-2">
                  {t('auth.login.passwordLabel')}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
                  placeholder={t('auth.login.passwordPlaceholder')}
                />
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="h-4 w-4 text-app-blue focus:ring-app-blue bg-app-secondary border-white/20 rounded accent-app-cyan"
                  />
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-text-secondary">
                    {t('auth.login.rememberMe')}
                  </label>
                </div>

                <div className="text-sm">
                  <Link to="/forgot-password" className="font-semibold text-app-cyan hover:text-app-blue transition-colors">
                    {t('auth.login.forgotPassword')}
                  </Link>
                </div>
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-4 px-8 border border-transparent rounded-xl shadow-button text-base font-semibold text-white bg-gradient-primary hover:shadow-button-hover hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {t('auth.login.signingIn')}
                    </span>
                  ) : (
                    t('auth.login.submitButton')
                  )}
                </button>
              </div>
            </form>

            {/* Register Link */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-app-card text-text-muted">{t('auth.login.noAccount')}</span>
                </div>
              </div>

              <div className="mt-6">
                <Link
                  to="/register"
                  className="w-full flex justify-center py-4 px-8 border-2 border-app-blue rounded-xl text-base font-semibold text-app-blue bg-transparent hover:bg-app-blue/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card transition-all duration-300"
                >
                  {t('auth.login.createAccount')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
