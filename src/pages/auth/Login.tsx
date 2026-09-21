import { useState, useEffect, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, type AccountLinkRequiredError } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import Container from '../../components/layout/Container';
import AccountLinkModal from '../../components/auth/AccountLinkModal';
import { isInAppBrowser } from '../../utils/browserDetection';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [providerLoading, setProviderLoading] = useState<'google' | 'facebook' | null>(null);
  const [linkError, setLinkError] = useState<AccountLinkRequiredError | null>(null);

  // Set when this page was opened as the Google sign-in bridge tab for an
  // iOS standalone PWA (see AuthContext's loginWithRedirect) — renders a
  // standalone "sign in here, then go back to the app" screen instead of
  // the normal login form.
  const isBridge = new URLSearchParams(window.location.search).get('authBridge') === 'google';
  const [bridgeStatus, setBridgeStatus] = useState<'idle' | 'signing-in' | 'done' | 'error'>('idle');

  const { user, login, loginWithRedirect, loginViaBridgePopup, pendingLinkError, clearPendingLinkError, pendingRedirectError, clearPendingRedirectError, linkPendingCredential } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Where to go after a successful sign-in — the join-team link (or anything
  // else that requires auth first) stashes its own path here before sending
  // someone here to log in; consume it once and fall back to the dashboard.
  const redirectAfterAuth = () => {
    const dest = sessionStorage.getItem('redirectAfterLogin');
    if (dest) {
      sessionStorage.removeItem('redirectAfterLogin');
      navigate(dest);
    } else {
      navigate('/');
    }
  };

  // A redirect-based sign-in (Facebook) reloads the page — this catches
  // both a successful return (AuthContext's own redirect-result handler
  // already set `user`, we just need to leave) and a link-required return
  // (surfaced via pendingLinkError, since the component that started the
  // redirect no longer exists to catch it directly).
  // The bridge tab is excluded: it signs in only to hand the session back to
  // the standalone app via a cookie (see loginViaBridgePopup) — it should
  // show its own "you can return to the app now" screen, not the dashboard.
  useEffect(() => {
    if (user && !isBridge) redirectAfterAuth();
  }, [user, navigate, isBridge]);

  const handleBridgeSignIn = async () => {
    setBridgeStatus('signing-in');
    try {
      await loginViaBridgePopup();
      setBridgeStatus('done');
    } catch (err: any) {
      console.error('Bridge sign-in error:', err);
      // User dismissed the account picker — let them try again without an error flash.
      setBridgeStatus(err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request' ? 'idle' : 'error');
    }
  };

  useEffect(() => {
    if (pendingLinkError) {
      setLinkError(pendingLinkError);
      clearPendingLinkError();
    }
  }, [pendingLinkError, clearPendingLinkError]);

  // Google/Facebook sign-in returning from a redirect can fail with no
  // Firebase error at all (a real, known Android/mobile-browser failure
  // mode) — surfaced here as plain text since this only ever shows up
  // after the page has already reloaded, where a console isn't visible.
  useEffect(() => {
    if (pendingRedirectError) {
      setError(`Google sign-in did not complete: ${pendingRedirectError}`);
      clearPendingRedirectError();
    }
  }, [pendingRedirectError, clearPendingRedirectError]);

  // Shared by password login, provider login, and the account-link flow —
  // optionally creates the "Remember Me" server session cookie, then leaves.
  const completeLogin = async (idToken: string | null) => {
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
    redirectAfterAuth();
  };

  const handleProviderLogin = async (providerName: 'google' | 'facebook') => {
    setError('');
    setProviderLoading(providerName);
    try {
      // Google on a regular browser tab resolves via popup and returns here
      // normally; Facebook, and Google on an iOS standalone PWA, navigate
      // away — see AuthContext's loginWithRedirect for why.
      await loginWithRedirect(providerName, rememberMe);
    } catch (err) {
      console.error('Provider login error:', err);
      setError(t('auth.login.errors.generalError'));
    } finally {
      setProviderLoading(null);
    }
  };

  const handleLinkAccount = async (password: string) => {
    if (!linkError) return;
    const idToken = await linkPendingCredential(linkError.email, password, linkError.pendingCredential);
    setLinkError(null);
    await completeLogin(idToken);
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

      redirectAfterAuth();
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

  if (isBridge) {
    return (
      <div className="min-h-screen bg-app-primary flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center space-y-5">
          <h2 className="text-2xl font-bold text-text-primary">{t('brand.fullName')}</h2>
          {bridgeStatus === 'idle' && (
            <>
              <p className="text-text-secondary">{t('auth.login.bridge.intro')}</p>
              <button
                type="button"
                onClick={handleBridgeSignIn}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-white/10 rounded-xl bg-white text-gray-800 font-semibold hover:bg-gray-100 transition-all"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                {t('auth.login.continueWithGoogle')}
              </button>
            </>
          )}
          {bridgeStatus === 'signing-in' && <p className="text-text-secondary">{t('auth.login.signingIn')}</p>}
          {bridgeStatus === 'done' && (
            <>
              <p className="text-app-cyan font-medium">{t('auth.login.bridge.done')}</p>
              <button
                type="button"
                onClick={() => window.close()}
                className="w-full py-3 px-4 rounded-xl bg-app-blue text-white font-semibold hover:opacity-90 transition-all"
              >
                {t('auth.login.bridge.closeTab')}
              </button>
            </>
          )}
          {bridgeStatus === 'error' && (
            <>
              <p className="text-red-400">{t('auth.login.bridge.error')}</p>
              <button
                type="button"
                onClick={handleBridgeSignIn}
                className="w-full py-3 px-4 rounded-xl bg-app-blue text-white font-semibold hover:opacity-90 transition-all"
              >
                {t('auth.login.continueWithGoogle')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-primary flex flex-col justify-center py-4 sm:py-10 sm:px-6 lg:px-8">
      {/* Language Switcher - Top Right */}
      <div className="absolute top-3 right-3">
        <LanguageSwitcher />
      </div>

      <Container className="max-w-md">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-xl overflow-hidden shadow-card bg-gradient-primary p-1">
              <div className="w-full h-full bg-app-card rounded-lg flex items-center justify-center">
                <span className="text-2xl font-bold text-white">N</span>
              </div>
            </div>
          </div>
          <h2 className="mt-3 text-center text-2xl font-bold text-text-primary">
            {t('brand.fullName')}
          </h2>
          <p className="mt-1 text-center text-sm text-text-secondary">
            {t('auth.login.title')}
          </p>
        </div>

        <div className="mt-4 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-app-card py-5 px-4 shadow-card sm:rounded-2xl sm:px-8 border border-white/10">
            {/* Error Alert (shared with social buttons, shown above everything) */}
            {error && (
              <div className="mb-4 bg-chart-pink/10 border border-chart-pink/30 text-chart-pink px-4 py-2.5 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Shown before they even try — Google sign-in is unreliable or
                blocked entirely inside an in-app browser (Viber, Facebook,
                Instagram, ...), failing silently rather than with a clear
                error. Email/password below still works fine here. */}
            {isInAppBrowser() && (
              <div className="mb-4 bg-yellow-400/10 border border-yellow-400/30 text-yellow-200 px-4 py-2.5 rounded-xl text-xs">
                {t('auth.login.inAppBrowserWarning')}
              </div>
            )}

            {/* Social Sign-In */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleProviderLogin('google')}
                disabled={providerLoading !== null || loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-white/10 rounded-xl bg-white text-gray-800 font-semibold hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.47a5.54 5.54 0 01-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.92l-3.87-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.11A12 12 0 0012 24z" />
                  <path fill="#FBBC05" d="M5.27 14.27a7.2 7.2 0 010-4.54v-3.1H1.27a12 12 0 000 10.75l4-3.11z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.27 6.63l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" />
                </svg>
                {providerLoading === 'google' ? t('auth.login.signingIn') : t('auth.login.continueWithGoogle')}
              </button>
              {(window.navigator as any).standalone === true && (
                <p className="text-xs text-text-muted text-center -mt-1">{t('auth.login.bridge.hint')}</p>
              )}
              {/* Facebook login is temporarily hidden — not wired up yet, so
                  showing it would just confuse users. handleProviderLogin
                  still supports 'facebook'; re-add the button below once
                  it's ready. */}
            </div>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-app-card text-text-muted">{t('auth.login.orContinueWithEmail')}</span>
              </div>
            </div>

            <form className="space-y-3.5" onSubmit={handleSubmit}>
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-text-primary mb-1.5">
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
                  className="appearance-none block w-full px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
                  placeholder={t('auth.login.emailPlaceholder')}
                />
              </div>

              {/* Password Field */}
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-text-primary mb-1.5">
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
                  className="appearance-none block w-full px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
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
                  className="w-full flex justify-center py-3 px-8 border border-transparent rounded-xl shadow-button text-base font-semibold text-white bg-gradient-primary hover:shadow-button-hover hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300"
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
            <div className="mt-4">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-app-card text-text-muted">{t('auth.login.noAccount')}</span>
                </div>
              </div>

              <div className="mt-4">
                <Link
                  to="/register"
                  className="w-full flex justify-center py-3 px-8 border-2 border-app-blue rounded-xl text-base font-semibold text-app-blue bg-transparent hover:bg-app-blue/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card transition-all duration-300"
                >
                  {t('auth.login.createAccount')}
                </Link>
              </div>
            </div>

            <div className="mt-3 text-center">
              <Link to="/welcome" className="text-sm text-text-muted hover:text-app-cyan transition-colors">
                {t('welcomePage.linkText')}
              </Link>
            </div>
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
