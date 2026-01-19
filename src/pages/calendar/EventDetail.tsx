/**
 * Event Detail Page - WITH RESPONSE MESSAGES
 * Mobile-first, compact design with full response system
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { usePermissions } from '../../hooks/usePermissions';
import Container from '../../components/layout/Container';
import {
  getEvent,
  rsvpToEvent,
  cancelRsvp,
  getUserRsvpStatus,
  isEventLocked,
  isRsvpDeadlinePassed,
  isEventFull,
  deleteEvent,
  joinWaitlist,
  leaveWaitlist,
  getWaitlistPosition,
  isUserOnWaitlist,
} from '../../services/firebase/events';
import { getUser } from '../../services/firebase/users';
import type { Event as CalendarEvent, EventResponseData } from '../../types';

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { canModify } = usePermissions();
  const navigate = useNavigate();

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [userRsvp, setUserRsvp] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [responseMessage, setResponseMessage] = useState('');
  const [pendingResponse, setPendingResponse] = useState<'confirmed' | 'declined' | 'maybe' | null>(null);
  const [responsesWithNames, setResponsesWithNames] = useState<Array<{
    userId: string;
    userName: string;
    response: string;
    message?: string;
    timestamp: any;
  }>>([]);

  useEffect(() => {
    if (eventId && user) {
      loadEvent();
    }
  }, [eventId, user]);

  const loadEvent = async () => {
    if (!eventId || !user) return;

    try {
      const eventData = await getEvent(eventId);
      setEvent(eventData);

      if (eventData) {
        const status = await getUserRsvpStatus(eventId, user.id);
        setUserRsvp(status);

        // Load response names
        if (eventData.responses) {
          await loadResponsesWithNames(eventData.responses);
        }
      }
    } catch (error) {
      console.error('Error loading event:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadResponsesWithNames = async (responses: { [userId: string]: EventResponseData }) => {
    const responsesArray = await Promise.all(
      Object.entries(responses).map(async ([userId, responseData]) => {
        try {
          const userData = await getUser(userId);
          return {
            userId,
            userName: userData?.displayName || userData?.email || 'Unknown User',
            response: responseData.response,
            message: responseData.message,
            timestamp: responseData.timestamp,
          };
        } catch (error) {
          return {
            userId,
            userName: 'Unknown User',
            response: responseData.response,
            message: responseData.message,
            timestamp: responseData.timestamp,
          };
        }
      })
    );

    // Sort by response type (confirmed first, then maybe, then declined)
    responsesArray.sort((a, b) => {
      const order = { confirmed: 0, maybe: 1, declined: 2 };
      return (order[a.response as keyof typeof order] || 3) - (order[b.response as keyof typeof order] || 3);
    });

    setResponsesWithNames(responsesArray);
  };

  const handleRsvpClick = (response: 'confirmed' | 'declined' | 'maybe') => {
    // For confirmed, submit immediately
    if (response === 'confirmed') {
      handleRsvp(response, '');
    } else {
      // For declined/maybe, show message input
      setPendingResponse(response);
      setShowMessageInput(true);
      setResponseMessage('');
    }
  };

  const handleRsvp = async (response: 'confirmed' | 'declined' | 'maybe', message: string) => {
    if (!eventId || !user) return;

    setRsvpLoading(true);
    try {
      await rsvpToEvent(eventId, user.id, response, message || undefined);
      setUserRsvp(response);
      setShowMessageInput(false);
      setPendingResponse(null);
      setResponseMessage('');
      await loadEvent();
    } catch (error) {
      console.error('Error submitting RSVP:', error);
      alert(t('events.response.error'));
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleSubmitWithMessage = () => {
    if (pendingResponse) {
      handleRsvp(pendingResponse, responseMessage);
    }
  };

  const handleCancelMessageInput = () => {
    setShowMessageInput(false);
    setPendingResponse(null);
    setResponseMessage('');
  };

  const handleCancelRsvp = async () => {
    if (!eventId || !user) return;

    setRsvpLoading(true);
    try {
      await cancelRsvp(eventId, user.id);
      setUserRsvp(null);
      await loadEvent();
    } catch (error) {
      console.error('Error canceling RSVP:', error);
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleDeleteEvent = async () => {
    if (!eventId || !event) return;

    if (confirm(t('events.detail.confirmDelete'))) {
      try {
        await deleteEvent(eventId);
        navigate('/calendar');
      } catch (error) {
        console.error('Error deleting event:', error);
      }
    }
  };

  const handleJoinWaitlist = async () => {
    if (!eventId || !user) return;

    setWaitlistLoading(true);
    try {
      await joinWaitlist(eventId, user.id);
      await loadEvent();
    } catch (error) {
      console.error('Error joining waitlist:', error);
      alert(t('events.waitlist.joinError'));
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handleLeaveWaitlist = async () => {
    if (!eventId || !user) return;

    setWaitlistLoading(true);
    try {
      await leaveWaitlist(eventId, user.id);
      await loadEvent();
    } catch (error) {
      console.error('Error leaving waitlist:', error);
      alert(t('events.waitlist.leaveError'));
    } finally {
      setWaitlistLoading(false);
    }
  };

  // Format reminder text
  const formatReminderText = (minutesBefore: number): string => {
    if (minutesBefore < 60) {
      return `${minutesBefore} ${t('events.reminders.units.minutes')}`;
    } else if (minutesBefore < 1440) {
      const hours = Math.floor(minutesBefore / 60);
      return `${hours} ${t('events.reminders.units.hours')}`;
    } else {
      const days = Math.floor(minutesBefore / 1440);
      return `${days} ${t('events.reminders.units.days')}`;
    }
  };

  const getResponseIcon = (response: string) => {
    switch (response) {
      case 'confirmed':
        return '✓';
      case 'declined':
        return '✗';
      case 'maybe':
        return '?';
      default:
        return '';
    }
  };

  const getResponseColor = (response: string) => {
    switch (response) {
      case 'confirmed':
        return 'text-chart-cyan';
      case 'declined':
        return 'text-chart-pink';
      case 'maybe':
        return 'text-chart-purple';
      default:
        return 'text-text-secondary';
    }
  };

  if (loading) {
    return (
      <Container className="max-w-2xl py-4">
        <div className="text-center py-8 sm:py-12">
          <div className="animate-spin rounded-full h-8 w-8 sm:h-12 sm:w-12 border-b-2 border-app-cyan mx-auto mb-3 sm:mb-4"></div>
          <p className="text-xs sm:text-sm text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!event) {
    return (
      <Container className="max-w-2xl py-4">
        <div className="text-center py-8 sm:py-12">
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-text-primary mb-3 sm:mb-4">
            {t('events.detail.notFound')}
          </h2>
          <Link
            to="/calendar"
            className="inline-block px-4 sm:px-6 py-2 sm:py-3 bg-gradient-primary text-white text-sm sm:text-base rounded-lg sm:rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all font-semibold"
          >
            {t('events.detail.backToCalendar')}
          </Link>
        </div>
      </Container>
    );
  }

  const canEdit = user && canModify('event', event.createdBy, event.clubId);
  const locked = isEventLocked(event);
  const deadlinePassed = isRsvpDeadlinePassed(event);
  const full = isEventFull(event);
  const canRsvp = !locked && !deadlinePassed && (!full || userRsvp === 'confirmed');
  const onWaitlist = user ? isUserOnWaitlist(event, user.id) : false;
  const waitlistPosition = user && onWaitlist ? getWaitlistPosition(event, user.id) : null;

  return (
    <Container className="max-w-2xl py-2 sm:py-4">
      <div className="space-y-3 sm:space-y-4">
        {/* Header Card */}
        <div className="bg-app-card rounded-xl sm:rounded-2xl border border-white/10 p-3 sm:p-4 md:p-6">
          {/* Title & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-text-primary mb-2 break-words">
                {event.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`px-2 py-1 text-xs font-semibold rounded-lg ${
                  event.visibilityLevel === 'club' || event.type === 'club'
                    ? 'bg-chart-blue/20 text-chart-blue'
                    : event.visibilityLevel === 'team' || event.type === 'team'
                    ? 'bg-chart-cyan/20 text-chart-cyan'
                    : 'bg-app-secondary text-text-secondary'
                }`}>
                  {t(`events.types.${event.visibilityLevel || event.type}`)}
                </span>
              </div>
            </div>

            {canEdit && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => navigate(`/calendar/events/${event.id}/edit`)}
                  className="px-3 py-2 text-xs sm:text-sm bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={handleDeleteEvent}
                  className="px-3 py-2 text-xs sm:text-sm bg-chart-pink/20 border border-chart-pink/30 text-chart-pink rounded-lg hover:bg-chart-pink/30 transition-all"
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>

          {/* Event Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {/* Date & Time */}
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-text-muted mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-text-muted">{t('events.detail.date')}</p>
                  <p className="text-sm font-medium text-text-primary">
                    {new Date(event.date + 'T00:00:00').toLocaleDateString()}
                  </p>
                </div>
              </div>

              {event.startTime && (
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-text-muted mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-muted">{t('events.detail.time')}</p>
                    <p className="text-sm font-medium text-text-primary">
                      {event.startTime}
                      {event.endTime && ` - ${event.endTime}`}
                      {event.duration && ` (${event.duration} min)`}
                    </p>
                  </div>
                </div>
              )}

              {event.location && (
                <div className="flex items-start gap-2">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-text-muted mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-muted">{t('events.detail.location')}</p>
                    <p className="text-sm font-medium text-text-primary break-words">{event.location}</p>
                  </div>
                </div>
              )}
            </div>

            {/* RSVP Stats */}
            <div className="bg-app-secondary rounded-lg sm:rounded-xl p-3 sm:p-4 border border-white/10">
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                {t('events.detail.rsvpStats')}
              </h3>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">{t('events.response.confirmed')}</span>
                  <span className="text-sm font-semibold text-chart-cyan">{event.confirmedCount || 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">{t('events.response.declined')}</span>
                  <span className="text-sm font-semibold text-chart-pink">
                    {event.responses ? Object.values(event.responses).filter((r: any) => r.response === 'declined').length : 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">{t('events.response.maybe')}</span>
                  <span className="text-sm font-semibold text-chart-purple">
                    {event.responses ? Object.values(event.responses).filter((r: any) => r.response === 'maybe').length : 0}
                  </span>
                </div>
                {event.participantLimit && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
                    <span className="text-xs text-text-secondary">{t('events.detail.capacity')}</span>
                    <span className="text-sm font-semibold text-text-primary">
                      {event.confirmedCount || 0} / {event.participantLimit}
                    </span>
                  </div>
                )}
                {event.waitlist && event.waitlist.length > 0 && (
                  <div className="flex items-center justify-between pt-1.5 border-t border-white/10">
                    <span className="text-xs text-text-secondary">{t('events.waitlist.title')}</span>
                    <span className="text-sm font-semibold text-app-cyan">{event.waitlist.length}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {event.description && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                {t('events.detail.description')}
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary whitespace-pre-wrap break-words">
                {event.description}
              </p>
            </div>
          )}

          {/* Event Reminders */}
          {event.reminders && event.reminders.length > 0 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <h3 className="text-sm font-semibold text-text-primary mb-2">
                {t('events.reminders.title')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {event.reminders.map((reminder: any) => (
                  <div
                    key={reminder.id}
                    className="flex items-center gap-2 p-2 bg-app-secondary border border-white/10 rounded-lg"
                  >
                    <span className="text-base">🔔</span>
                    <span className="text-xs text-text-primary font-medium flex-1">
                      {formatReminderText(reminder.minutesBefore)} {t('events.reminders.before')}
                    </span>
                    {reminder.sent && (
                      <span className="text-xs text-chart-cyan">✓</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lock Period Info */}
          {event.lockPeriod && event.lockPeriod.enabled && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <div className="flex items-center gap-2 p-3 bg-chart-pink/10 border border-chart-pink/30 rounded-lg">
                <svg className="w-5 h-5 text-chart-pink flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-chart-pink">
                    {t('events.detail.lockPeriod')}: {Math.floor(event.lockPeriod.minutesBefore / 60)}h {t('events.reminders.before')}
                  </p>
                  {locked && (
                    <p className="text-xs text-text-muted mt-0.5">
                      🔒 {t('events.detail.eventLocked')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* All Responses List */}
        {responsesWithNames.length > 0 && (
          <div className="bg-app-card rounded-xl sm:rounded-2xl border border-white/10 p-3 sm:p-4 md:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-text-primary mb-3">
              {t('events.response.allResponses')} ({responsesWithNames.length})
            </h2>
            <div className="space-y-2">
              {responsesWithNames.map((resp) => (
                <div
                  key={resp.userId}
                  className="flex items-start gap-3 p-3 bg-app-secondary rounded-lg border border-white/10"
                >
                  <span className={`text-lg font-bold ${getResponseColor(resp.response)} flex-shrink-0`}>
                    {getResponseIcon(resp.response)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-text-primary">
                        {resp.userName}
                      </span>
                      <span className={`text-xs font-semibold ${getResponseColor(resp.response)}`}>
                        {t(`events.response.${resp.response}`)}
                      </span>
                    </div>
                    {resp.message && (
                      <p className="text-xs text-text-secondary italic bg-app-background/50 rounded p-2 mt-1">
                        "{resp.message}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* RSVP Section */}
        {user && (
          <div className="bg-app-card rounded-xl sm:rounded-2xl border border-white/10 p-3 sm:p-4 md:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-text-primary mb-3">
              {t('events.detail.yourResponse')}
            </h2>

            {/* Current RSVP Status */}
            {userRsvp && !showMessageInput && (
              <div className={`mb-3 p-3 rounded-lg border ${
                userRsvp === 'confirmed'
                  ? 'bg-chart-cyan/10 border-chart-cyan/30'
                  : userRsvp === 'declined'
                  ? 'bg-chart-pink/10 border-chart-pink/30'
                  : 'bg-chart-purple/10 border-chart-purple/30'
              }`}>
                <p className="text-xs sm:text-sm font-medium text-text-primary">
                  {userRsvp === 'confirmed' && `✓ ${t('events.detail.youAreGoing')}`}
                  {userRsvp === 'declined' && `✗ ${t('events.detail.youAreNotGoing')}`}
                  {userRsvp === 'maybe' && `? ${t('events.detail.youAreMaybe')}`}
                </p>
                {event.responses?.[user.id]?.message && (
                  <p className="text-xs text-text-secondary italic mt-2 bg-app-background/30 rounded p-2">
                    {t('events.response.yourMessage')}: "{event.responses[user.id].message}"
                  </p>
                )}
              </div>
            )}

            {/* Message Input for Decline/Maybe */}
            {showMessageInput && pendingResponse && (
              <div className="mb-3 p-4 bg-app-secondary border border-white/10 rounded-lg">
                <h3 className="text-sm font-semibold text-text-primary mb-2">
                  {pendingResponse === 'declined' 
                    ? t('events.response.declineWithMessage')
                    : t('events.response.maybeWithMessage')}
                </h3>
                <textarea
                  value={responseMessage}
                  onChange={(e) => setResponseMessage(e.target.value)}
                  placeholder={t('events.response.messagePlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-app-background border border-white/10 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-app-cyan resize-none mb-3"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSubmitWithMessage}
                    disabled={rsvpLoading}
                    className="flex-1 px-4 py-2 bg-gradient-primary text-white text-sm font-semibold rounded-lg shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all disabled:opacity-50"
                  >
                    {rsvpLoading ? t('common.loading') : t('events.response.submit')}
                  </button>
                  <button
                    onClick={handleCancelMessageInput}
                    disabled={rsvpLoading}
                    className="px-4 py-2 bg-app-background border border-white/10 text-text-primary text-sm rounded-lg hover:bg-white/5 transition-all disabled:opacity-50"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            )}

            {/* Waitlist Section */}
            {onWaitlist && (
              <div className="mb-3 p-3 bg-app-cyan/10 border border-app-cyan/30 rounded-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                  <div>
                    <p className="text-xs sm:text-sm font-semibold text-app-cyan mb-1">
                      {t('events.waitlist.youAreOnWaitlist')}
                    </p>
                    <p className="text-xs text-text-muted">
                      {t('events.waitlist.position')}: #{waitlistPosition}
                    </p>
                  </div>
                  <button
                    onClick={handleLeaveWaitlist}
                    disabled={waitlistLoading}
                    className="px-3 py-2 text-xs bg-app-secondary border border-white/10 text-text-primary rounded-lg hover:bg-white/10 transition-all disabled:opacity-50"
                  >
                    {t('events.waitlist.leave')}
                  </button>
                </div>
                <p className="text-xs text-text-secondary">
                  {t('events.waitlist.notifyWhenAvailable')}
                </p>
              </div>
            )}

            {/* Full Event Message */}
            {full && !userRsvp && !onWaitlist && !locked && !deadlinePassed && (
              <div className="mb-3 p-3 bg-chart-pink/10 border border-chart-pink/30 rounded-lg">
                <p className="text-xs sm:text-sm font-medium text-chart-pink">
                  {t('events.detail.eventFull')}
                </p>
              </div>
            )}

            {/* Join Waitlist Button */}
            {full && !userRsvp && !onWaitlist && !locked && !deadlinePassed && (
              <button
                onClick={handleJoinWaitlist}
                disabled={waitlistLoading}
                className="w-full mb-3 px-4 py-2.5 sm:py-3 bg-gradient-primary text-white text-sm sm:text-base font-semibold rounded-lg sm:rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all disabled:opacity-50"
              >
                {waitlistLoading ? t('common.loading') : t('events.waitlist.join')}
              </button>
            )}

            {/* RSVP Buttons */}
            {canRsvp && !showMessageInput && (
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => handleRsvpClick('confirmed')}
                    disabled={rsvpLoading}
                    className={`px-3 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50 ${
                      userRsvp === 'confirmed'
                        ? 'bg-chart-cyan text-white'
                        : 'bg-chart-cyan/10 text-chart-cyan border border-chart-cyan/30 hover:bg-chart-cyan/20'
                    }`}
                  >
                    ✓ {t('events.response.attend')}
                  </button>
                  <button
                    onClick={() => handleRsvpClick('maybe')}
                    disabled={rsvpLoading}
                    className={`px-3 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50 ${
                      userRsvp === 'maybe'
                        ? 'bg-chart-purple text-white'
                        : 'bg-chart-purple/10 text-chart-purple border border-chart-purple/30 hover:bg-chart-purple/20'
                    }`}
                  >
                    ? {t('events.response.maybe')}
                  </button>
                  <button
                    onClick={() => handleRsvpClick('declined')}
                    disabled={rsvpLoading}
                    className={`px-3 py-2.5 text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50 ${
                      userRsvp === 'declined'
                        ? 'bg-chart-pink text-white'
                        : 'bg-chart-pink/10 text-chart-pink border border-chart-pink/30 hover:bg-chart-pink/20'
                    }`}
                  >
                    ✗ {t('events.response.decline')}
                  </button>
                </div>
                <p className="text-xs text-text-muted text-center">
                  {t('events.response.messageHint')}
                </p>
              </div>
            )}

            {/* Cancel RSVP */}
            {userRsvp && canRsvp && !showMessageInput && (
              <button
                onClick={handleCancelRsvp}
                disabled={rsvpLoading}
                className="mt-2 w-full py-2 text-xs text-text-muted hover:text-text-primary transition-colors"
              >
                {t('events.detail.cancelRsvp')}
              </button>
            )}

            {/* Locked/Deadline Messages */}
            {locked && (
              <div className="mt-3 p-3 bg-app-secondary border border-white/10 rounded-lg">
                <p className="text-xs text-text-secondary">🔒 {t('events.detail.eventLocked')}</p>
              </div>
            )}
            {deadlinePassed && !locked && (
              <div className="mt-3 p-3 bg-app-secondary border border-white/10 rounded-lg">
                <p className="text-xs text-text-secondary">⏰ {t('events.detail.deadlinePassed')}</p>
              </div>
            )}
          </div>
        )}

        {/* Back Button */}
        <div className="pt-2">
          <Link
            to="/calendar"
            className="inline-flex items-center gap-2 text-sm text-app-cyan hover:text-app-cyan/80 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t('events.detail.backToCalendar')}
          </Link>
        </div>
      </div>
    </Container>
  );
}
