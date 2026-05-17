/**
 * Verify Email Page
 * Shows when user needs to verify their email address
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { sendVerificationEmail, checkAndSyncEmailVerification } from '../../services/firebase/emailVerification';

export default function VerifyEmail() {
  const { firebaseUser, logout, refreshUser } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleResendEmail = async () => {
    if (!firebaseUser) return;
    
    setResending(true);
    setError('');
    setMessage('');
    
    try {
      await sendVerificationEmail(firebaseUser);
      setMessage(t('auth.verifyEmail.emailSent'));
    } catch (err: any) {
      setError(err.message || t('auth.verifyEmail.resendError'));
    } finally {
      setResending(false);
    }
  };

  const handleCheckVerification = async () => {
    if (!firebaseUser) return;
    
    setChecking(true);
    setError('');
    setMessage('');
    
    try {
      const isVerified = await checkAndSyncEmailVerification(firebaseUser);
      
      if (isVerified) {
        // Refresh user data and redirect to dashboard
        await refreshUser();
        navigate('/');
      } else {
        setMessage(t('auth.verifyEmail.notVerifiedYet'));
      }
    } catch (err) {
      setError(t('auth.verifyEmail.checkError'));
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (!firebaseUser) {
    navigate('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-app-primary flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Container className="max-w-md">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center shadow-card">
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            {t('auth.verifyEmail.title')}
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            {t('auth.verifyEmail.subtitle')}
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-app-card py-8 px-4 shadow-card sm:rounded-2xl sm:px-10 border border-white/10">
            
            {/* Email Address */}
            <div className="mb-6 text-center">
              <p className="text-sm text-text-secondary mb-2">
                {t('auth.verifyEmail.sentTo')}
              </p>
              <p className="text-base font-semibold text-text-primary">
                {firebaseUser.email}
              </p>
            </div>

            {/* Success Message */}
            {message && (
              <div className="mb-6 bg-chart-cyan/10 border border-chart-cyan/30 text-chart-cyan px-4 py-3 rounded-xl text-sm">
                {message}
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-chart-pink/10 border border-chart-pink/30 text-chart-pink px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Instructions */}
            <div className="mb-6 bg-app-secondary/50 border border-white/10 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                {t('auth.verifyEmail.instructions.title')}
              </h3>
              <ol className="text-sm text-text-secondary space-y-2 list-decimal list-inside">
                <li>{t('auth.verifyEmail.instructions.step1')}</li>
                <li>{t('auth.verifyEmail.instructions.step2')}</li>
                <li>{t('auth.verifyEmail.instructions.step3')}</li>
              </ol>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              {/* Check Verification Button */}
              <button
                onClick={handleCheckVerification}
                disabled={checking}
                className="w-full flex justify-center py-4 px-8 border border-transparent rounded-xl shadow-button text-base font-semibold text-white bg-gradient-primary hover:shadow-button-hover hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300"
              >
                {checking ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('auth.verifyEmail.checking')}
                  </span>
                ) : (
                  t('auth.verifyEmail.checkButton')
                )}
              </button>

              {/* Resend Email Button */}
              <button
                onClick={handleResendEmail}
                disabled={resending}
                className="w-full flex justify-center py-4 px-8 border-2 border-app-blue rounded-xl text-base font-semibold text-app-blue bg-transparent hover:bg-app-blue/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
              >
                {resending ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-app-blue" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('auth.verifyEmail.resending')}
                  </span>
                ) : (
                  t('auth.verifyEmail.resendButton')
                )}
              </button>
            </div>

            {/* Divider */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-app-card text-text-muted">{t('common.or')}</span>
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <div className="mt-6">
              <button
                onClick={handleLogout}
                className="w-full flex justify-center py-3 px-8 border border-white/20 rounded-xl text-sm font-medium text-text-secondary bg-transparent hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card transition-all duration-300"
              >
                {t('auth.verifyEmail.logout')}
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-6 text-center">
              <p className="text-xs text-text-muted">
                {t('auth.verifyEmail.helpText')}
              </p>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
