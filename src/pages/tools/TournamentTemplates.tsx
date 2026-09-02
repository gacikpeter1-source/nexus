/**
 * Tournament Templates — club-wide list of tournaments (all teams), reached
 * from Tools. Creating a new tournament from a template (Excel import or
 * manual bracket entry, any format — round-robin, groups, single-elim/
 * "pavúk") is still being designed; this page is the landing spot for it.
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { getClubTournaments } from '../../services/firebase/nominations';
import { getMyStandaloneTournaments } from '../../services/firebase/standaloneTournaments';
import type { Club, Nomination, StandaloneTournament } from '../../types';

const STAFF_ROLES = ['clubOwner', 'trainer', 'assistant', 'admin'];

function earliestGameDate(n: Nomination): string {
  const dates = n.games.map(g => g.date).filter(Boolean).sort();
  return dates[0] || '';
}

export default function TournamentTemplates() {
  const { user } = useAuth();
  const { t } = useLanguage();

  const isStaff = !!user && (STAFF_ROLES.includes(user.role) || user.isSuperAdmin);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClubId, setSelectedClubId] = useState('');
  const [tournaments, setTournaments] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);

  const [standaloneTournaments, setStandaloneTournaments] = useState<StandaloneTournament[]>([]);
  const [loadingStandalone, setLoadingStandalone] = useState(true);

  useEffect(() => {
    if (!user || !isStaff) return;
    getUserClubs(user.id)
      .then(userClubs => {
        setClubs(userClubs);
        if (userClubs.length > 0) setSelectedClubId(userClubs[0].id!);
        else setLoading(false);
      })
      .catch(err => { console.error('TournamentTemplates: load clubs failed', err); setLoading(false); });
  }, [user?.id, isStaff]);

  useEffect(() => {
    if (!selectedClubId) return;
    setLoading(true);
    getClubTournaments(selectedClubId)
      .then(list => setTournaments(list.sort((a, b) => earliestGameDate(b).localeCompare(earliestGameDate(a)))))
      .catch(err => console.error('TournamentTemplates: load tournaments failed', err))
      .finally(() => setLoading(false));
  }, [selectedClubId]);

  useEffect(() => {
    if (!user || !isStaff) return;
    getMyStandaloneTournaments(user.id)
      .then(setStandaloneTournaments)
      .catch(err => console.error('TournamentTemplates: load standalone tournaments failed', err))
      .finally(() => setLoadingStandalone(false));
  }, [user?.id, isStaff]);

  if (!isStaff) {
    return (
      <Container>
        <div className="py-16 text-center">
          <h1 className="text-lg font-bold text-text-primary mb-2">{t('tools.noAccess')}</h1>
          <Link to="/" className="text-app-cyan hover:text-app-cyan/80">{t('nav.dashboard')}</Link>
        </div>
      </Container>
    );
  }

  const teamName = (n: Nomination) => {
    const club = clubs.find(c => c.id === selectedClubId);
    return club?.teams?.find(t => t.id === n.teamId)?.name || '';
  };

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-text-primary">{t('tools.tournaments')}</h1>
            <p className="text-xs text-text-secondary mt-0.5">{t('tools.tournamentsPageDesc')}</p>
          </div>
          <Link to="/tools" className="text-xs text-app-cyan hover:text-app-cyan/80">
            ← {t('tools.title')}
          </Link>
        </div>

        {clubs.length > 1 && (
          <select
            value={selectedClubId}
            onChange={e => setSelectedClubId(e.target.value)}
            className="px-3 py-2 text-sm bg-app-secondary border border-white/10 rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue"
          >
            {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        {/* Existing tournaments */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-bold text-text-primary">{t('tools.existingTournaments')}</h2>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
            </div>
          ) : tournaments.length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('nominations.noTournaments')}</p>
          ) : (
            <div className="space-y-1.5">
              {tournaments.map(tour => (
                <Link
                  key={tour.id}
                  to={`/clubs/${selectedClubId}/tournaments/${tour.id}`}
                  className="flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate">{tour.title}</div>
                    <div className="text-[10px] text-text-muted truncate">{teamName(tour)}</div>
                  </div>
                  <div className="flex-shrink-0 text-[10px] text-text-muted">
                    {earliestGameDate(tour) ? new Date(earliestGameDate(tour) + 'T00:00:00').toLocaleDateString() : t('nominations.dateTbd')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Create — a tournament belongs to one team (roster + bracket both
            live there), so creating one starts by picking which team */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
          <h2 className="text-sm font-bold text-text-primary">{t('tools.createTournament')}</h2>
          <p className="text-xs text-text-secondary">{t('tools.createTournamentDesc')}</p>
          {(clubs.find(c => c.id === selectedClubId)?.teams || []).length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('tools.createTournamentNoTeams')}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(clubs.find(c => c.id === selectedClubId)?.teams || []).map(team => (
                <Link
                  key={team.id}
                  to={`/clubs/${selectedClubId}/teams/${team.id}/nominations/new?kind=tournament`}
                  className="px-3 py-1.5 text-xs font-semibold bg-app-secondary border border-white/10 text-app-cyan rounded-lg hover:border-app-cyan transition-colors"
                >
                  + {team.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Standalone tournaments — no club/team attached, own bracket/scoring
            tool, created through the guided setup wizard */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-4 sm:p-5 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-bold text-text-primary">{t('tools.standaloneTournaments')}</h2>
            <Link
              to="/tools/tournaments/new"
              className="px-3 py-1.5 text-xs font-semibold bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover transition-all"
            >
              + {t('nominations.bracket.wizard.standaloneTitle')}
            </Link>
          </div>
          <p className="text-xs text-text-secondary">{t('tools.standaloneTournamentsDesc')}</p>
          {loadingStandalone ? (
            <div className="flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
            </div>
          ) : standaloneTournaments.length === 0 ? (
            <p className="text-xs text-text-muted py-1">{t('nominations.noTournaments')}</p>
          ) : (
            <div className="space-y-1.5">
              {standaloneTournaments.map(tour => (
                <Link
                  key={tour.id}
                  to={`/tournaments/${tour.id}`}
                  className="flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-text-primary truncate">{tour.title}</div>
                    {tour.location && <div className="text-[10px] text-text-muted truncate">{tour.location}</div>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
}
