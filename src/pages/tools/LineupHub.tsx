/**
 * Lineup Tool Hub
 * Staff pick an upcoming team event here, then build its position lineup
 * at /calendar/events/:eventId/lineup (also reachable directly from that
 * event's own detail page).
 */

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import Container from '../../components/layout/Container';
import { getClubEvents } from '../../services/firebase/events';
import type { Event as CalendarEvent } from '../../types';

export default function LineupHub() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const clubIds = user.clubIds || [];
      const lists = await Promise.all(clubIds.map(id => getClubEvents(id).catch(() => [])));
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

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          <h1 className="text-xl font-bold text-text-primary">🏒 {t('lineup.title')}</h1>
          <p className="text-xs text-text-secondary mt-0.5">{t('lineup.hubSubtitle')}</p>
        </div>

        {loading ? (
          <div className="text-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto"></div>
          </div>
        ) : events.length === 0 ? (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 text-center text-sm text-text-secondary">
            {t('lineup.hubEmpty')}
          </div>
        ) : (
          <div className="space-y-2">
            {events.map(ev => (
              <Link
                key={ev.id}
                to={`/calendar/events/${ev.id}/lineup`}
                className="block bg-app-card rounded-xl shadow-card border border-white/10 p-3 hover:border-app-cyan/40 hover:-translate-y-0.5 transition-all duration-300"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{ev.title}</p>
                    <p className="text-[11px] text-text-muted mt-0.5">
                      {new Date(ev.date).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                      {ev.startTime ? ` · ${ev.startTime}` : ''}
                    </p>
                  </div>
                  <span className="text-[10px] text-app-cyan font-semibold flex-shrink-0">
                    {ev.lineup ? t('lineup.editCta') : t('lineup.createCta')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
