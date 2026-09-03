/**
 * Shown when a Google/Facebook sign-in is blocked because the email already
 * belongs to an account created a different way. If that existing account
 * uses a password, this collects it, signs the user in, and links the new
 * provider to that same account — from then on both work interchangeably.
 * If the existing account uses a different provider instead (no password to
 * check), there's nothing to collect here — just point them at it.
 */

import { useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import type { AccountLinkRequiredError } from '../../contexts/AuthContext';

interface Props {
  linkError: AccountLinkRequiredError;
  onLink: (password: string) => Promise<void>;
  onCancel: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  'password': 'Email/Password',
  'google.com': 'Google',
  'facebook.com': 'Facebook',
};

export default function AccountLinkModal({ linkError, onLink, onCancel }: Props) {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const canUsePassword = linkError.existingMethods.includes('password');
  const otherProviderLabel = linkError.existingMethods
    .filter(m => m !== 'password')
    .map(m => PROVIDER_LABELS[m] || m)
    .join(', ');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setError('');
    setSubmitting(true);
    try {
      await onLink(password);
    } catch (err: any) {
      console.error('AccountLinkModal: link failed', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError(t('auth.link.wrongPassword'));
      } else {
        setError(t('auth.link.error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-app-card w-full max-w-sm rounded-2xl border border-white/10 shadow-2xl p-5">
          <h2 className="text-base font-bold text-text-primary mb-1">{t('auth.link.title')}</h2>

          {canUsePassword ? (
            <>
              <p className="text-xs text-text-secondary mb-4">
                {t('auth.link.description', { email: linkError.email })}
              </p>
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoFocus
                  placeholder={t('auth.login.passwordPlaceholder')}
                  className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                />
                {error && <p className="text-xs text-chart-pink">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    className="flex-1 px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !password}
                    className="flex-1 px-4 py-2.5 bg-gradient-primary rounded-xl text-sm font-semibold text-white shadow-button hover:shadow-button-hover transition-all disabled:opacity-50"
                  >
                    {submitting ? t('common.loading') : t('auth.link.confirmButton')}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <p className="text-xs text-text-secondary mb-4">
                {t('auth.link.otherProviderDescription', { email: linkError.email, provider: otherProviderLabel || t('auth.link.otherProviderFallback') })}
              </p>
              <button
                onClick={onCancel}
                className="w-full px-4 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-sm font-semibold text-text-primary hover:bg-white/10 transition-colors"
              >
                {t('common.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
