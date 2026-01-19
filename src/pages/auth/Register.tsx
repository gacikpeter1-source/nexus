import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import Container from '../../components/layout/Container';

export default function Register() {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const { register } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

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
      } else if (err.code === 'auth/weak-password') {
        setError(t('auth.register.errors.weakPassword'));
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
              <form className="space-y-6" onSubmit={handleSubmit}>
                {/* Error Alert */}
                {error && (
                  <div className="bg-chart-pink/10 border border-chart-pink/30 text-chart-pink px-4 py-3 rounded-xl text-sm">
                    {error}
                  </div>
                )}

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
    </div>
  );
}
