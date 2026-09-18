/**
 * Create Tournament Registration
 * A separate, additional pre-step for standalone tournaments — invite known
 * clubs and let them accept/decline before the actual tournament exists.
 * Does not touch CreateStandaloneTournament at all.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { createTournamentRegistration, inviteClubToRegistration } from '../../services/firebase/tournamentRegistrations';
import { SPORTS } from '../../constants/sports';
import type { Club } from '../../types';

interface InvitedClub {
  clubId?: string;
  clubName: string;
  email: string;
}

export default function CreateTournamentRegistration() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [sport, setSport] = useState('');
  const [deadline, setDeadline] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [directory, setDirectory] = useState<Club[]>([]);
  const [search, setSearch] = useState('');
  const [invited, setInvited] = useState<InvitedClub[]>([]);
  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  useEffect(() => {
    getDocs(collection(db, 'clubs'))
      .then(snap => setDirectory(snap.docs.map(d => ({ id: d.id, ...d.data() } as Club))))
      .catch(err => console.error('CreateTournamentRegistration: load clubs failed', err));
  }, []);

  const searchResults = search.trim().length < 2
    ? []
    : directory
        .filter(c => c.name.toLowerCase().includes(search.trim().toLowerCase()))
        .filter(c => !invited.some(i => i.clubId === c.id))
        .slice(0, 8);

  const addClub = (club: Club) => {
    setInvited(prev => [...prev, { clubId: club.id, clubName: club.name, email: club.contactEmail || '' }]);
    setSearch('');
  };

  const addManual = () => {
    if (!manualName.trim()) return;
    setInvited(prev => [...prev, { clubName: manualName.trim(), email: manualEmail.trim() }]);
    setManualName('');
    setManualEmail('');
  };

  const removeInvited = (index: number) => {
    setInvited(prev => prev.filter((_, i) => i !== index));
  };

  const updateInvitedEmail = (index: number, email: string) => {
    setInvited(prev => prev.map((inv, i) => (i === index ? { ...inv, email } : inv)));
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (!title.trim()) { setError(t('tournamentRegistration.errors.titleRequired')); return; }
    if (!deadline) { setError(t('tournamentRegistration.errors.deadlineRequired')); return; }

    setError('');
    setSubmitting(true);
    try {
      const registrationId = await createTournamentRegistration({
        createdBy: user.id,
        title: title.trim(),
        category: category.trim() || undefined,
        sport: sport || undefined,
        deadline,
      });

      await Promise.all(
        invited.map(inv =>
          inviteClubToRegistration({
            registrationId,
            clubId: inv.clubId,
            clubName: inv.clubName,
            email: inv.email || undefined,
            invitedBy: user.id,
          })
        )
      );

      navigate(`/tools/tournaments/registrations/${registrationId}`);
    } catch (err) {
      console.error('Error creating tournament registration:', err);
      setError(t('tournamentRegistration.errors.createFailed'));
      setSubmitting(false);
    }
  };

  return (
    <Container className="max-w-2xl">
      <div className="py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">{t('tournamentRegistration.createTitle')}</h1>
          <p className="text-xs text-text-secondary mt-0.5">{t('tournamentRegistration.createSubtitle')}</p>
        </div>

        {error && (
          <div className="bg-chart-pink/10 border border-chart-pink/30 text-chart-pink px-4 py-2.5 rounded-xl text-sm">
            {error}
          </div>
        )}

        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">{t('tournamentRegistration.title')}</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t('tournamentRegistration.titlePlaceholder')}
              className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">{t('tournamentRegistration.category')}</label>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder={t('tournamentRegistration.categoryPlaceholder')}
                className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">{t('tournamentRegistration.deadline')}</label>
              <input
                type="date"
                value={deadline}
                onChange={e => setDeadline(e.target.value)}
                className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-primary mb-1.5">{t('tournamentRegistration.sport')}</label>
            <select
              value={sport}
              onChange={e => setSport(e.target.value)}
              className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
            >
              <option value="">{t('common.optional')}</option>
              {SPORTS.map(s => (
                <option key={s.id} value={s.id}>{s.icon} {t(`sports.${s.id}`)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-bold text-text-primary">{t('tournamentRegistration.inviteClubs')}</h2>
          <p className="text-xs text-text-secondary">{t('tournamentRegistration.inviteClubsDesc')}</p>

          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('tournamentRegistration.searchClubPlaceholder')}
              className="w-full px-3 py-2.5 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
            {searchResults.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-app-card border border-white/10 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => addClub(c)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="text-sm text-text-primary truncate">{c.name}</span>
                    {c.contactEmail && <span className="text-[10px] text-text-muted truncate">{c.contactEmail}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={manualName}
              onChange={e => setManualName(e.target.value)}
              placeholder={t('tournamentRegistration.manualNamePlaceholder')}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
            <input
              type="email"
              value={manualEmail}
              onChange={e => setManualEmail(e.target.value)}
              placeholder={t('tournamentRegistration.manualEmailPlaceholder')}
              className="flex-1 min-w-0 px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue"
            />
            <button
              type="button"
              onClick={addManual}
              disabled={!manualName.trim()}
              className="px-3 py-2 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              + {t('common.add')}
            </button>
          </div>

          {invited.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {invited.map((inv, i) => (
                <div key={i} className="flex items-center gap-2 bg-app-secondary border border-white/10 rounded-lg p-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {inv.clubName} {!inv.clubId && <span className="text-[9px] text-text-muted font-normal">({t('tournamentRegistration.notOnNexus')})</span>}
                    </p>
                    <input
                      type="email"
                      value={inv.email}
                      onChange={e => updateInvitedEmail(i, e.target.value)}
                      placeholder={t('tournamentRegistration.emailPlaceholder')}
                      className="w-full mt-1 px-2 py-1 text-[11px] bg-app-primary border border-white/10 rounded text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-app-blue"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeInvited(i)}
                    className="text-text-muted hover:text-chart-pink text-sm px-1 flex-shrink-0"
                    aria-label={t('common.remove')}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full px-4 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? t('common.loading') : t('tournamentRegistration.createButton')}
        </button>
      </div>
    </Container>
  );
}
