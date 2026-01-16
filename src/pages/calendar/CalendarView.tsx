/**
 * Calendar View Page
 * Monthly calendar view with events
 */

import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import { getClubEvents } from '../../services/firebase/events';
import { getUserClubs } from '../../services/firebase/clubs';
import { PERMISSIONS } from '../../constants/permissions';
import type { CalendarEvent, Club } from '../../types';

export default function CalendarView() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { can } = usePermissions();
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [selectedClub, setSelectedClub] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'month' | 'list'>('month');

  useEffect(() => {
    if (user) {
      loadClubs();
    }
  }, [user]);

  useEffect(() => {
    if (clubs.length > 0) {
      loadEvents();
    }
  }, [clubs, selectedClub, currentDate]);

  const loadClubs = async () => {
    if (!user) return;

    try {
      const userClubs = await getUserClubs(user.id);
      setClubs(userClubs);
    } catch (error) {
      console.error('Error loading clubs:', error);
    }
  };

  const loadEvents = async () => {
    try {
      let allEvents: CalendarEvent[] = [];

      if (selectedClub === 'all') {
        // Load events from all clubs
        for (const club of clubs) {
          const clubEvents = await getClubEvents(club.id!);
          allEvents = [...allEvents, ...clubEvents];
        }
      } else {
        allEvents = await getClubEvents(selectedClub);
      }

      setEvents(allEvents);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calendar helper functions
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const formatDate = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  const getEventsForDay = (day: number) => {
    const dateStr = formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
    return events.filter(event => event.date === dateStr);
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const today = () => {
    setCurrentDate(new Date());
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthName = currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <Container>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('calendar.title')}</h1>
            <p className="mt-2 text-gray-600">{t('calendar.subtitle')}</p>
          </div>

          <div className="flex items-center space-x-4">
            {can(PERMISSIONS.CREATE_PERSONAL_EVENT) && (
              <button
                onClick={() => navigate('/calendar/create')}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors"
              >
                {t('calendar.createEvent')}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Club Filter */}
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">
                {t('calendar.filterByClub')}:
              </label>
              <select
                value={selectedClub}
                onChange={(e) => setSelectedClub(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-primary focus:border-primary"
              >
                <option value="all">{t('calendar.allClubs')}</option>
                {clubs.map((club) => (
                  <option key={club.id} value={club.id!}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>

            {/* View Toggle */}
            <div className="flex items-center space-x-2 bg-gray-100 rounded-md p-1">
              <button
                onClick={() => setView('month')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  view === 'month'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('calendar.monthView')}
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  view === 'list'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t('calendar.listView')}
              </button>
            </div>
          </div>
        </div>

        {/* Calendar/List View */}
        {view === 'month' ? (
          /* Month View */
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <button
                onClick={previousMonth}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center space-x-4">
                <h2 className="text-lg font-semibold text-gray-900">{monthName}</h2>
                <button
                  onClick={today}
                  className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  {t('calendar.today')}
                </button>
              </div>

              <button
                onClick={nextMonth}
                className="p-2 hover:bg-gray-100 rounded-md transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="p-4">
              {/* Day Names */}
              <div className="grid grid-cols-7 gap-2 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-gray-500 py-2"
                  >
                    {t(`calendar.days.${day.toLowerCase()}`)}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-2">
                {/* Empty cells for days before first day of month */}
                {Array.from({ length: firstDay }).map((_, index) => (
                  <div key={`empty-${index}`} className="aspect-square" />
                ))}

                {/* Actual days */}
                {Array.from({ length: daysInMonth }).map((_, index) => {
                  const day = index + 1;
                  const dayEvents = getEventsForDay(day);
                  const isToday =
                    day === new Date().getDate() &&
                    currentDate.getMonth() === new Date().getMonth() &&
                    currentDate.getFullYear() === new Date().getFullYear();

                  return (
                    <div
                      key={day}
                      className={`aspect-square border rounded-lg p-2 hover:border-primary transition-colors cursor-pointer ${
                        isToday ? 'bg-primary bg-opacity-10 border-primary' : 'border-gray-200'
                      }`}
                      onClick={() => {
                        if (dayEvents.length > 0) {
                          navigate(`/calendar/day/${formatDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), day))}`);
                        }
                      }}
                    >
                      <div className="text-sm font-medium text-gray-900">{day}</div>
                      {dayEvents.length > 0 && (
                        <div className="mt-1 space-y-1">
                          {dayEvents.slice(0, 2).map((event) => (
                            <div
                              key={event.id}
                              className="text-xs px-1 py-0.5 bg-primary text-white rounded truncate"
                              title={event.title}
                            >
                              {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-xs text-gray-500">
                              +{dayEvents.length - 2} more
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* List View */
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
            {events.length > 0 ? (
              <div className="space-y-4">
                {events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/calendar/events/${event.id}`}
                    className="block border border-gray-200 rounded-lg p-4 hover:border-primary transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-1">{event.title}</h3>
                        <p className="text-sm text-gray-600 mb-2">{event.description}</p>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span>{new Date(event.date).toLocaleDateString()}</span>
                          {event.startTime && <span>{event.startTime}</span>}
                          {event.location && <span>📍 {event.location}</span>}
                        </div>
                      </div>
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        event.type === 'club'
                          ? 'bg-blue-100 text-blue-800'
                          : event.type === 'team'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {t(`calendar.eventTypes.${event.type}`)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-600">{t('calendar.noEvents')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}

