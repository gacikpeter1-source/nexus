import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type AccountLinkRequiredError } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import Container from '../../components/layout/Container';
import AccountLinkModal from '../../components/auth/AccountLinkModal';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [providerLoading, setProviderLoading] = useState<'google' | 'facebook' | null>(null);
  const [linkError, setLinkError] = useState<AccountLinkRequiredError | null>(null);

  const { user, register, loginWithRedirect, pendingLinkError, clearPendingLinkError, linkPendingCredential } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // See Login.tsx for why this page needs to react to `user` and
  // `pendingLinkError` directly — a redirect-based sign-in (Facebook)
  // reloads this page entirely, so nothing local survives to catch its result.
  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  useEffect(() => {
    if (pendingLinkError) {
      setLinkError(pendingLinkError);
      clearPendingLinkError();
    }
  }, [pendingLinkError, clearPendingLinkError]);

  const handleProviderLogin = async (providerName: 'google' | 'facebook') => {
    setError('');

    // Both providers go through a full-page redirect rather than a popup —
    // see Login.tsx's handleProviderLogin for why (Facebook's slow re-auth
    // flow outlasting popup-completion detection; Google's popup appearing
    // to succeed without durably persisting on an iOS home-screen PWA).
    setProviderLoading(providerName);
    try {
      await loginWithRedirect(providerName);
    } catch (err) {
      console.error('Redirect login error:', err);
      setError(t('auth.register.errors.generalError'));
      setProviderLoading(null);
    }
  };

  const handleLinkAccount = async (password: string) => {
    if (!linkError) return;
    await linkPendingCredential(linkError.email, password, linkError.pendingCredential);
    setLinkError(null);
    navigate('/');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    // Validation
    if (displayName.length < 2) {
      setError(t('auth.register.errors.nameShort'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.register.errors.passwordShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.register.errors.passwordMismatch'));
      return;
    }

    setLoading(true);

    try {
      await register(email, password, displayName);
      setSuccess(true);
      
      // Show success message for 2 seconds, then redirect
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err: any) {
      console.error('Registration error:', err);

      if (err.code === 'auth/email-already-in-use') {
        setError(t('auth.register.errors.emailInUse'));
      } else if (err.code === 'auth/invalid-email') {
        setError(t('auth.register.errors.invalidEmail'));
      } else if (err.code === 'auth/weak-password' || err.code === 'auth/password-does-not-meet-requirements') {
        setError(t('auth.register.errors.weakPassword'));
      } else if (err.code === 'auth/network-request-failed') {
        setError(t('auth.login.errors.generalError'));
      } else {
        setError(t('auth.register.errors.generalError'));
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
            {t('auth.register.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            {t('auth.register.subtitle')}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-app-card py-8 px-4 shadow-card sm:rounded-2xl sm:px-10 border border-white/10">
            {success ? (
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-chart-cyan/20 mb-4">
                  <svg className="h-6 w-6 text-chart-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-text-primary mb-2">{t('auth.register.success.title')}</h3>
                <p className="text-sm text-text-secondary mb-4">
                  {t('auth.register.success.message')}
                </p>
                <p className="text-xs text-text-muted">{t('auth.register.success.redirecting')}</p>
              </div>
            ) : (
              <>
                {/* Error Alert (shared with social buttons) */}
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
                {/* Display Name */}
                <div>
                  <label htmlFor="displayName" className="block text-sm font-semibold text-text-primary mb-2">
                    {t('auth.register.nameLabel')}
                  </label>
                  <input
                    id="displayName"
                    name="displayName"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
                    placeholder={t('auth.register.namePlaceholder')}
                  />
                </div>

                {/* Email Field */}
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-text-primary mb-2">
                    {t('auth.register.emailLabel')}
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
                    placeholder={t('auth.register.emailPlaceholder')}
                  />
                </div>

                {/* Password Field */}
                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-text-primary mb-2">
                    {t('auth.register.passwordLabel')}
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
                    placeholder={t('auth.register.passwordPlaceholder')}
                  />
                  <p className="mt-1 text-xs text-text-muted">{t('auth.register.passwordHint')}</p>
                </div>

                {/* Confirm Password Field */}
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold text-text-primary mb-2">
                    {t('auth.register.confirmPasswordLabel')}
                  </label>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="appearance-none block w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
                    placeholder={t('auth.register.confirmPasswordPlaceholder')}
                  />
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
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('auth.register.creatingAccount')}
                      </span>
                    ) : (
                      t('auth.register.submitButton')
                    )}
                  </button>
                </div>
                </form>
              </>
            )}

            {/* Login Link */}
            {!success && (
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-app-card text-text-muted">{t('auth.register.hasAccount')}</span>
                  </div>
                </div>

                <div className="mt-6">
                  <Link
                    to="/login"
                    className="w-full flex justify-center py-4 px-8 border-2 border-app-blue rounded-xl text-base font-semibold text-app-blue bg-transparent hover:bg-app-blue/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card transition-all duration-300"
                  >
                    {t('auth.register.signInInstead')}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </Container>

      {linkError && (
        <AccountLinkModal
          linkError={linkError}
          onLink={handleLinkAccount}
          onCancel={() => setLinkError(null)}
        />
      )}
    </div>
  );
}
