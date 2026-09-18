/**
 * Public, no-login response page for a Tournament Registration invite sent
 * by email (Phase 2 — clubs not yet on Nexus). Reached via a link with an
 * entryId + token, verified server-side by two callable functions
 * (getRegistrationEntryPublic / respondToRegistrationEntryPublic) that use
 * the Admin SDK, so no Firestore auth/rules are needed for this visitor.
 *
 * Deliberately a real page with a real button rather than an instant-action
 * link — corporate/email security scanners auto-prefetch links in inboxes,
 * which would otherwise silently trigger an accept/decline before a human
 * ever sees it.
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import {
  getRegistrationEntryPublic,
  respondToRegistrationEntryPublic,
  type PublicRegistrationEntryView,
} from '../services/firebase/tournamentRegistrations';

export default function RegistrationResponse() {
  const { entryId } = useParams<{ entryId: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const { t } = useLanguage();

  const [view, setView] = useState<PublicRegistrationEntryView | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [squadName, setSquadName] = useState('');
  const [submitting, setSubmitting] = useState<'accepted' | 'declined' | null>(null);
  const [error, setError] = useState('');
  const [justResponded, setJustResponded] = useState<'accepted' | 'declined' | null>(null);

  useEffect(() => {
    if (!entryId || !token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    getRegistrationEntryPublic(entryId, token)
      .then(setView)
      .catch(() => setInvalid(true))
      .finally(() => setLoading(false));
  }, [entryId, token]);

  const handleRespond = async (status: 'accepted' | 'declined') => {
    if (!entryId || !token) return;
    if (status === 'accepted' && !squadName.trim()) return;
    setSubmitting(status);
    setError('');
    try {
      await respondToRegistrationEntryPublic({
        entryId,
        token,
        status,
        squadName: status === 'accepted' ? squadName.trim() : undefined,
      });
      setJustResponded(status);
    } catch (err) {
      console.error('Error responding to registration entry:', err);
      setError(t('registrationResponse.submitError'));
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <Container className="max-w-md">
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto" />
          <p className="text-xs text-text-muted mt-3">{t('registrationResponse.loading')}</p>
        </div>
      </Container>
    );
  }

  if (invalid || !view) {
    return (
      <Container className="max-w-md">
        <div className="text-center py-16 space-y-3">
          <h1 className="text-lg font-bold text-text-primary">{t('registrationResponse.invalidLink')}</h1>
          <Link to="/welcome" className="inline-block text-xs text-app-cyan hover:text-app-cyan/80">
            {t('registrationResponse.learnMore')}
          </Link>
        </div>
      </Container>
    );
  }

  const { entry, registration } = view;
  const alreadyResponded = entry.status !== 'pending' || justResponded;
  const finalStatus = justResponded || (entry.status !== 'pending' ? entry.status : null);

  return (
    <Container className="max-w-md">
      <div className="py-8 space-y-4">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold text-text-primary">{registration.title}</h1>
          <p className="text-xs text-text-secondary">
            {registration.category && <span>{registration.category} · </span>}
            {t('registrationResponse.deadlineLabel')} {new Date(registration.deadline + 'T00:00:00').toLocaleDateString()}
          </p>
          <p className="text-xs text-text-muted">
            {t('registrationResponse.invitedAs')} <span className="text-text-primary font-semibold">{entry.clubName}</span>
          </p>
        </div>

        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-5 space-y-4">
          {alreadyResponded && finalStatus ? (
            <div className="text-center space-y-2">
              <p className="text-sm font-semibold text-text-primary">
                {finalStatus === 'accepted'
                  ? t('registrationResponse.respondedAccepted', { squadName: squadName.trim() || entry.squadName || entry.clubName })
                  : t('registrationResponse.respondedDeclined')}
              </p>
              <p className="text-xs text-text-muted">
                {finalStatus === 'accepted' ? t('registrationResponse.thanksAccepted') : t('registrationResponse.thanksDeclined')}
              </p>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  {t('registrationResponse.squadNamePrompt')}
                </label>
                <input
                  type="text"
                  value={squadName}
                  onChange={e => setSquadName(e.target.value)}
                  placeholder={t('registrationResponse.squadNamePlaceholder')}
                  className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
                />
              </div>

              {error && <p className="text-xs text-chart-pink">{error}</p>}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRespond('accepted')}
                  disabled={!!submitting || !squadName.trim()}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gradient-primary text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {t('registrationResponse.accept')}
                </button>
                <button
                  type="button"
                  onClick={() => handleRespond('declined')}
                  disabled={!!submitting}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold bg-app-secondary border border-chart-pink/40 text-chart-pink rounded-xl disabled:opacity-40"
                >
                  {t('registrationResponse.decline')}
                </button>
              </div>
            </>
          )}
        </div>

        <div className="text-center pt-2">
          <p className="text-[11px] text-text-muted">{t('registrationResponse.poweredBy')}</p>
          <Link to="/welcome" className="text-[11px] text-app-cyan hover:text-app-cyan/80">
            {t('registrationResponse.learnMore')}
          </Link>
        </div>
      </div>
    </Container>
  );
}
