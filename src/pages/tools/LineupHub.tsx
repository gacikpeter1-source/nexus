/**
 * Lineup Tool Hub
 * Staff pick an upcoming team event here, then build its position lineup
 * at /calendar/events/:eventId/lineup (also reachable directly from that
 * event's own detail page). Filterable by club and team for staff who
 * manage more than one.
 */

import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getUserClubs } from '../../services/firebase/clubs';
import { getClubEvents } from '../../services/firebase/events';
import type { Club, Event as CalendarEvent } from '../../types';

export default function LineupHub() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [clubFilter, setClubFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userClubs = await getUserClubs(user.id);
      setClubs(userClubs);

      const lists = await Promise.all(userClubs.map(c => getClubEvents(c.id!).catch(() => [])));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcoming = lists
        .flat()
        .filter(e => !!e.teamId)
        .filter(e => new Date(e.date) >= today)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
      setEvents(upcoming);
    } finally {
      setLoading(false);
    }
  };

  const clubById = useMemo(() => new Map(clubs.map(c => [c.id!, c])), [clubs]);

  const teamsForFilter = useMemo(() => {
    if (clubFilter) return clubById.get(clubFilter)?.teams || [];
    // No club chosen: offer every team across every club, so the team
    // filter still works on its own.
    return clubs.flatMap(c => c.teams || []);
  }, [clubFilter, clubById, clubs]);

  useEffect(() => {
    // A team filter picked while "all clubs" was selected can become
    // invalid once a specific club is chosen — drop it rather than silently
    // filtering against a team that club doesn't have.
    if (teamFilter && !teamsForFilter.some(t => t.id === teamFilter)) {
      setTeamFilter('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubFilter]);

  const filteredEvents = events.filter(e =>
    (!clubFilter || e.clubId === clubFilter) &&
    (!teamFilter || e.teamId === teamFilter)
  );

  const showClubName = clubs.length > 1 && !clubFilter;

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">🏒 {t('lineup.title')}</h1>
          <p className="text-xs text-text-secondary mt-0.5">{t('lineup.hubSubtitle')}</p>
        </div>

        {clubs.length > 1 && (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('lineup.filterClub')}</label>
              <select
                value={clubFilter}
                onChange={(e) => setClubFilter(e.target.value)}
                className="w-full px-3 py-2 bg-app-card border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue"
              >
                <option value="">{t('lineup.allClubs')}</option>
                {clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-text-muted mb-1">{t('lineup.filterTeam')}</label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                disabled={teamsForFilter.length === 0}
                className="w-full px-3 py-2 bg-app-card border border-white/10 rounded-lg text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-app-blue disabled:opacity-50"
              >
                <option value="">{t('lineup.allTeams')}</option>
                {teamsForFilter.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
              </select>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto"></div>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 text-center text-sm text-text-secondary">
            {events.length === 0 ? t('lineup.hubEmpty') : t('lineup.hubEmptyFiltered')}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredEvents.map(ev => {
              const club = ev.clubId ? clubById.get(ev.clubId) : undefined;
              const team = club?.teams?.find(tm => tm.id === ev.teamId);
              return (
                <Link
                  key={ev.id}
                  to={`/calendar/events/${ev.id}/lineup`}
                  className="block bg-app-card rounded-xl shadow-card border border-white/10 p-3 hover:border-app-cyan/40 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text-primary truncate">{ev.title}</p>
                      <p className="text-[11px] text-text-muted mt-0.5 truncate">
                        {new Date(ev.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {ev.startTime ? ` · ${ev.startTime}` : ''}
                        {team && ` · ${team.name}`}
                        {showClubName && club && ` · ${club.name}`}
                      </p>
                    </div>
                    <span className="text-[10px] text-app-cyan font-semibold flex-shrink-0">
                      {ev.lineup ? t('lineup.editCta') : t('lineup.createCta')}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}
