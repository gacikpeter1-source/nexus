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
import CompactWeekView from '../../components/calendar/CompactWeekView';
import { getClubEvents } from '../../services/firebase/events';
import { getUserClubs } from '../../services/firebase/clubs';
import { PERMISSIONS } from '../../constants/permissions';
import type { Event as CalendarEvent, Club } from '../../types';

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
  const [view, setView] = useState<'month' | 'week' | 'list'>('month');

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
      console.log('👤 Loading clubs for user:', user.id);
      console.log('👤 User clubIds:', user.clubIds);
      
      const userClubs = await getUserClubs(user.id);
      console.log('🏢 User clubs loaded:', userClubs.map(c => ({ id: c.id, name: c.name })));
      setClubs(userClubs);
      
      // If no clubs, stop loading immediately
      if (userClubs.length === 0) {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error loading clubs:', error);
      setLoading(false); // Stop loading on error too
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

  // Format date in local timezone (YYYY-MM-DD) without UTC conversion
  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

  // Week view helpers
  const previousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const nextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const getWeekDates = () => {
    const dates = [];
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Go to Sunday
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const monthName = currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const weekDates = getWeekDates();
  const weekRange = `${weekDates[0].toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} - ${weekDates[6].toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  if (loading) {
    return (
      <Container>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  return (
    <Container className="overflow-x-hidden">
      <div className="space-y-3 sm:space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 md:gap-4">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-text-primary truncate">{t('calendar.title')}</h1>
          </div>

          <div className="flex items-center shrink-0">
            {can(PERMISSIONS.CREATE_PERSONAL_EVENT) && (
              <button
                onClick={() => navigate('/calendar/create')}
                className="w-full sm:w-auto px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 bg-gradient-primary text-white rounded-lg sm:rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold text-xs sm:text-sm md:text-base whitespace-nowrap"
              >
                {t('calendar.createEvent')}
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="bg-app-card shadow-card rounded-xl sm:rounded-2xl border border-white/10 p-2 sm:p-3 md:p-4 lg:p-6">
          <div className="flex flex-col gap-2 sm:gap-3 md:gap-4">
            {/* Club Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 md:gap-3">
              <label className="text-[10px] sm:text-xs md:text-sm font-semibold text-text-primary whitespace-nowrap shrink-0">
                {t('calendar.filterByClub')}:
              </label>
              <select
                value={selectedClub}
                onChange={(e) => setSelectedClub(e.target.value)}
                className="w-full sm:w-auto min-w-0 px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm bg-app-secondary border border-white/10 rounded-lg sm:rounded-xl text-text-primary focus:outline-none focus:ring-2 focus:ring-app-blue transition-all"
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
            <div className="flex items-center gap-1 bg-app-secondary border border-white/10 rounded-lg sm:rounded-xl p-0.5 sm:p-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <button
                onClick={() => setView('month')}
                className={`flex-1 min-w-[70px] px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm rounded-md sm:rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${
                  view === 'month'
                    ? 'bg-gradient-primary text-white shadow-button'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('calendar.monthView')}
              </button>
              <button
                onClick={() => setView('week')}
                className={`flex-1 min-w-[70px] px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm rounded-md sm:rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${
                  view === 'week'
                    ? 'bg-gradient-primary text-white shadow-button'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('calendar.weekView')}
              </button>
              <button
                onClick={() => setView('list')}
                className={`flex-1 min-w-[70px] px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 text-[10px] sm:text-xs md:text-sm rounded-md sm:rounded-lg transition-all duration-300 font-semibold whitespace-nowrap ${
                  view === 'list'
                    ? 'bg-gradient-primary text-white shadow-button'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t('calendar.listView')}
              </button>
            </div>
          </div>
        </div>

        {/* Calendar/Week/List View */}
        {view === 'week' ? (
          /* Week View - Compact */
          <div className="bg-app-card shadow-card rounded-xl sm:rounded-2xl border border-white/10 p-2 sm:p-3 md:p-4 lg:p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 sm:mb-3 md:mb-4 lg:mb-6 pb-2 sm:pb-3 md:pb-4 border-b border-white/10 gap-1 sm:gap-2">
              <button
                onClick={previousWeek}
                className="p-1 sm:p-1.5 md:p-2 hover:bg-app-secondary rounded-md sm:rounded-lg transition-all duration-300 text-text-primary flex-shrink-0"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 md:gap-3 min-w-0 flex-1">
                <h2 className="text-[10px] sm:text-xs md:text-sm lg:text-base font-semibold text-text-primary truncate text-center sm:text-left">{weekRange}</h2>
                <button
                  onClick={today}
                  className="px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-[10px] sm:text-xs md:text-sm bg-app-secondary border border-white/10 rounded-md sm:rounded-lg hover:bg-white/10 transition-all duration-300 font-semibold text-text-primary whitespace-nowrap shrink-0"
                >
                  {t('calendar.today')}
                </button>
              </div>

              <button
                onClick={nextWeek}
                className="p-1 sm:p-1.5 md:p-2 hover:bg-app-secondary rounded-md sm:rounded-lg transition-all duration-300 text-text-primary flex-shrink-0"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Compact Week View Component */}
            <CompactWeekView 
              events={events}
              selectedDate={currentDate}
              onDateSelect={setCurrentDate}
              weeksToShow={4}
            />

            {/* Empty State */}
            {events.length === 0 && (
              <div className="text-center py-12 text-text-muted mt-6">
                <p className="text-lg mb-2">{t('calendar.noEvents')}</p>
                <p className="text-sm">{t('calendar.noEventsHint')}</p>
              </div>
            )}
          </div>
        ) : view === 'month' ? (
          /* Month View */
          <div className="bg-app-card shadow-card rounded-2xl border border-white/10 overflow-hidden">
            {/* Calendar Header */}
            <div className="flex items-center justify-between p-2 sm:p-3 md:p-4 lg:p-6 border-b border-white/10 gap-1 sm:gap-2">
              <button
                onClick={previousMonth}
                className="p-1 sm:p-1.5 md:p-2 hover:bg-app-secondary rounded-md sm:rounded-lg transition-all duration-300 text-text-primary flex-shrink-0"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 md:gap-3 min-w-0 flex-1">
                <h2 className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-text-primary truncate text-center sm:text-left">{monthName}</h2>
                <button
                  onClick={today}
                  className="px-2 sm:px-3 md:px-4 py-1 sm:py-1.5 md:py-2 text-[10px] sm:text-xs md:text-sm bg-app-secondary border border-white/10 rounded-md sm:rounded-lg hover:bg-white/10 transition-all duration-300 font-semibold text-text-primary whitespace-nowrap shrink-0"
                >
                  {t('calendar.today')}
                </button>
              </div>

              <button
                onClick={nextMonth}
                className="p-1 sm:p-1.5 md:p-2 hover:bg-app-secondary rounded-md sm:rounded-lg transition-all duration-300 text-text-primary flex-shrink-0"
              >
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Calendar Grid */}
            <div className="p-2 sm:p-4 md:p-6">
              {/* Day Names */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div
                    key={day}
                    className="text-center text-[10px] sm:text-xs md:text-sm font-semibold text-text-secondary py-1 sm:py-2"
                  >
                    {t(`calendar.days.${day.toLowerCase()}`)}
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2">
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
                      className={`aspect-square border rounded-lg sm:rounded-xl p-1 sm:p-2 hover:border-app-blue transition-all duration-300 ${
                        dayEvents.length > 0 ? 'cursor-default' : 'cursor-pointer'
                      } ${
                        isToday ? 'bg-app-blue/20 border-app-blue' : 'border-white/10 bg-app-secondary'
                      }`}
                    >
                      <div className={`text-center text-xs sm:text-sm font-semibold ${
                        isToday ? 'text-app-blue' : 'text-text-primary'
                      }`}>{day}</div>
                      {dayEvents.length > 0 && (
                        <div className="mt-0.5 sm:mt-1 space-y-0.5 sm:space-y-1">
                          {dayEvents.slice(0, 2).map((event) => (
                            <Link
                              key={event.id}
                              to={`/calendar/events/${event.id}`}
                              className="block text-[8px] sm:text-[10px] px-0.5 sm:px-1 py-0.5 bg-gradient-primary text-white rounded truncate hover:opacity-90 transition-opacity"
                              title={event.title}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {event.title}
                            </Link>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-[7px] sm:text-[9px] text-text-muted text-center">
                              +{dayEvents.length - 2}
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
          <div className="bg-app-card shadow-card rounded-2xl border border-white/10 p-3 sm:p-4 md:p-6">
            {events.length > 0 ? (
              <div className="space-y-3 sm:space-y-4">
                {events.map((event) => (
                  <Link
                    key={event.id}
                    to={`/calendar/events/${event.id}`}
                    className="block border border-white/10 rounded-xl sm:rounded-2xl p-3 sm:p-4 md:p-6 hover:border-app-blue hover:-translate-y-0.5 sm:hover:-translate-y-1 transition-all duration-300 bg-app-secondary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm sm:text-base text-text-primary mb-1 sm:mb-2 truncate">{event.title}</h3>
                        <p className="text-xs sm:text-sm text-text-secondary mb-2 sm:mb-3 line-clamp-2">{event.description}</p>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-text-muted">
                          <span className="flex items-center">
                            <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-app-blue mr-1.5 sm:mr-2 flex-shrink-0"></span>
                            <span className="truncate">{new Date(event.date).toLocaleDateString()}</span>
                          </span>
                          {event.startTime && (
                            <span className="flex items-center">
                              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-chart-cyan mr-1.5 sm:mr-2 flex-shrink-0"></span>
                              <span className="truncate">{event.startTime}</span>
                            </span>
                          )}
                          {event.location && (
                            <span className="flex items-center">
                              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-chart-purple mr-1.5 sm:mr-2 flex-shrink-0"></span>
                              <span className="truncate">{event.location}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                        event.type === 'club'
                          ? 'bg-chart-blue/20 text-chart-blue'
                          : event.type === 'team'
                          ? 'bg-chart-cyan/20 text-chart-cyan'
                          : 'bg-chart-purple/20 text-chart-purple'
                      }`}>
                        {t(`calendar.eventTypes.${event.type}`)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-text-secondary">{t('calendar.noEvents')}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}


