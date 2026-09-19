import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { getTeamTournaments } from '../../services/firebase/nominations';
import { getClubRegistrationEntries, getTournamentRegistration } from '../../services/firebase/tournamentRegistrations';
import type { Nomination, RegistrationEntry, TournamentRegistration } from '../../types';

interface Props {
  clubId: string;
  teamId: string;
}

interface RegistrationInviteRow {
  entry: RegistrationEntry;
  registration: TournamentRegistration;
}

function earliestGameDate(n: Nomination): string {
  const dates = n.games.map(g => g.date).filter(Boolean).sort();
  return dates[0] || '';
}

export default function TournamentsTab({ clubId, teamId }: Props) {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [tournaments, setTournaments] = useState<Nomination[]>([]);
  const [loading, setLoading] = useState(true);

  // Tournament Registration invites (see Tools > Tournaments > Tournament
  // Registration) — these arrive at the CLUB level, since the organizer
  // usually doesn't know a club's internal team structure. Shown here on
  // every team's tab as long as no team has claimed it yet (entry.teamId
  // unset), plus always on the team that did claim it. Once a trainer
  // responds and picks this team, it stops appearing on other teams' tabs.
  const [registrationInvites, setRegistrationInvites] = useState<RegistrationInviteRow[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);

  useEffect(() => { load(); loadRegistrationInvites(); }, [clubId, teamId]);

  const load = async () => {
    setLoading(true);
    try {
      const all = await getTeamTournaments(clubId, teamId);
      setTournaments(
        all.sort((a, b) => earliestGameDate(b).localeCompare(earliestGameDate(a)))
      );
    } catch (err) {
      console.error('TournamentsTab: load failed', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRegistrationInvites = async () => {
    setLoadingInvites(true);
    try {
      const entries = (await getClubRegistrationEntries(clubId))
        .filter(e => !e.teamId || e.teamId === teamId);
      const registrations = await Promise.all(
        [...new Set(entries.map(e => e.registrationId))].map(id => getTournamentRegistration(id))
      );
      const byId = new Map(registrations.filter((r): r is TournamentRegistration => !!r).map(r => [r.id, r]));
      const rows = entries
        .map(entry => {
          const registration = byId.get(entry.registrationId);
          return registration ? { entry, registration } : null;
        })
        .filter((r): r is RegistrationInviteRow => !!r)
        .sort((a, b) => b.registration.deadline.localeCompare(a.registration.deadline));
      setRegistrationInvites(rows);
    } catch (err) {
      console.error('TournamentsTab: registration invites load failed', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  const inviteStatusColor = (status: RegistrationEntry['status']) =>
    status === 'accepted' ? 'text-chart-cyan' : status === 'declined' ? 'text-chart-pink' : 'text-yellow-400';

  return (
    <div className="space-y-4">
      {!loadingInvites && registrationInvites.length > 0 && (
        <div className="space-y-1.5">
          <h2 className="text-sm sm:text-base font-bold text-text-primary">{t('tournamentRegistration.teamTabSectionTitle')}</h2>
          {registrationInvites.map(({ entry, registration }) => (
            <button
              key={entry.id}
              onClick={() => navigate(`/tools/tournaments/registrations/${registration.id}`)}
              className="w-full text-left flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-text-primary truncate">{registration.title}</div>
                <div className="text-[10px] text-text-muted">
                  {registration.category && <span>{registration.category} · </span>}
                  {t('tournamentRegistration.deadlineLabel')} {new Date(registration.deadline + 'T00:00:00').toLocaleDateString()}
                </div>
              </div>
              <span className={`flex-shrink-0 text-[10px] font-semibold ${inviteStatusColor(entry.status)}`}>
                {t(`tournamentRegistration.status.${entry.status}`)}
              </span>
            </button>
          ))}
        </div>
      )}

      <h2 className="text-sm sm:text-base font-bold text-text-primary">{t('nominations.tournamentsTabLabel')}</h2>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-app-cyan" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="text-center py-10 space-y-1">
          <div className="text-2xl">🏆</div>
          <p className="text-xs text-text-secondary">{t('nominations.noTournaments')}</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {tournaments.map(tour => {
            const date = earliestGameDate(tour);
            const confirmedCount = Object.values(tour.primary).filter(e => e.status === 'confirmed').length;
            const gamesWithScore = tour.games.filter(g => g.teamScore !== undefined && g.opponentScore !== undefined).length;
            return (
              <button
                key={tour.id}
                onClick={() => navigate(`/clubs/${clubId}/tournaments/${tour.id}`)}
                className="w-full text-left flex items-center gap-2 p-2.5 bg-app-secondary border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-text-primary truncate">{tour.title}</div>
                  <div className="text-[10px] text-text-muted">
                    {date ? new Date(date + 'T00:00:00').toLocaleDateString() : t('nominations.dateTbd')}
                  </div>
                </div>
                <div className="flex-shrink-0 text-[10px] text-text-secondary text-right">
                  <div>{confirmedCount} {t('nominations.playedLabel')}</div>
                  <div className="text-text-muted">{gamesWithScore}/{tour.games.length} {t('nominations.scoresLabel')}</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
