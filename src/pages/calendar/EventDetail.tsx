/**
 * Event Detail Page - COMPACT REDESIGN
 * Response buttons inline with event info, much more compact design
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
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [responseMessage, setResponseMessage] = useState('');
  const [pendingResponse, setPendingResponse] = useState<'confirmed' | 'declined' | 'maybe' | null>(null);
  const [responsesWithNames, setResponsesWithNames] = useState<Array<{
    userId: string;
    userName: string;
    userPhoto?: string;
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
            userPhoto: userData?.photoURL,
            response: responseData.response,
            message: responseData.message,
            timestamp: responseData.timestamp,
          };
        } catch (error) {
          return {
            userId,
            userName: 'Unknown User',
            userPhoto: undefined,
            response: responseData.response,
            message: responseData.message,
            timestamp: responseData.timestamp,
          };
        }
      })
    );

    responsesArray.sort((a, b) => {
      const order = { confirmed: 0, maybe: 1, declined: 2 };
      return (order[a.response as keyof typeof order] || 3) - (order[b.response as keyof typeof order] || 3);
    });

    setResponsesWithNames(responsesArray);
  };

  const handleRsvpClick = (response: 'confirmed' | 'declined' | 'maybe') => {
    if (response === 'confirmed') {
      handleRsvp(response, '');
    } else {
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

  const getResponseIcon = (response: string) => {
    switch (response) {
      case 'confirmed': return '✓';
      case 'declined': return '✗';
      case 'maybe': return '?';
      default: return '';
    }
  };

  const getResponseColor = (response: string) => {
    switch (response) {
      case 'confirmed': return 'text-chart-cyan';
      case 'declined': return 'text-chart-pink';
      case 'maybe': return 'text-chart-purple';
      default: return 'text-text-secondary';
    }
  };

  if (loading) {
    return (
      <Container className="max-w-4xl py-2">
        <div className="text-center py-6">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-cyan mx-auto mb-2"></div>
          <p className="text-xs text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!event) {
    return (
      <Container className="max-w-4xl py-2">
        <div className="text-center py-6">
          <h2 className="text-base sm:text-lg font-bold text-text-primary mb-2">
            {t('events.detail.notFound')}
          </h2>
          <Link
            to="/calendar"
            className="inline-block px-4 py-2 text-xs bg-gradient-primary text-white rounded-lg shadow-button hover:shadow-button-hover transition-all font-semibold"
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

  return (
    <Container className="max-w-4xl py-2">
      <div className="space-y-2">
        {/* Compact Header with Event Info & Response Buttons */}
        <div className="bg-app-card rounded-lg border border-white/10 p-2.5 sm:p-3">
          {/* Title Row */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-text-primary break-words">
                {event.title}
              </h1>
              <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded mt-1 ${
                event.visibilityLevel === 'club' || event.type === 'club'
                  ? 'bg-chart-blue/20 text-chart-blue'
                  : event.visibilityLevel === 'team' || event.type === 'team'
                  ? 'bg-chart-cyan/20 text-chart-cyan'
                  : 'bg-app-secondary text-text-secondary'
              }`}>
                {t(`events.types.${event.visibilityLevel || event.type}`)}
              </span>
            </div>

            {canEdit && (
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => navigate(`/calendar/events/${event.id}/edit`)}
                  className="px-2 py-1 text-[10px] bg-app-secondary border border-white/10 text-text-primary rounded hover:bg-white/10 transition-all"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={handleDeleteEvent}
                  className="px-2 py-1 text-[10px] bg-chart-pink/20 border border-chart-pink/30 text-chart-pink rounded hover:bg-chart-pink/30 transition-all"
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>

          {/* Event Details Grid - Compact */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-2">
            <div className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-text-primary font-medium">
                {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </div>

            {event.startTime && (
              <div className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-text-primary font-medium">{event.startTime}</span>
              </div>
            )}

            {event.location && (
              <div className="flex items-center gap-1.5 col-span-2">
                <svg className="w-3.5 h-3.5 text-text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <span className="text-text-primary font-medium truncate">{event.location}</span>
              </div>
            )}
          </div>

          {/* Inline Stats & Response Buttons */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10">
            {/* Compact Stats */}
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-chart-cyan font-bold">{event.confirmedCount || 0}</span>
                <span className="text-text-muted">going</span>
              </div>
              {event.participantLimit && (
                <>
                  <span className="text-text-muted">/</span>
                  <span className="text-text-muted">{event.participantLimit} max</span>
                </>
              )}
            </div>

            {/* Response Buttons - Inline */}
            {user && canRsvp && !showMessageInput && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleRsvpClick('confirmed')}
                  disabled={rsvpLoading}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all disabled:opacity-50 ${
                    userRsvp === 'confirmed'
                      ? 'bg-chart-cyan text-white'
                      : 'bg-chart-cyan/10 text-chart-cyan border border-chart-cyan/30 hover:bg-chart-cyan/20'
                  }`}
                >
                  ✓
                </button>
                <button
                  onClick={() => handleRsvpClick('maybe')}
                  disabled={rsvpLoading}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all disabled:opacity-50 ${
                    userRsvp === 'maybe'
                      ? 'bg-chart-purple text-white'
                      : 'bg-chart-purple/10 text-chart-purple border border-chart-purple/30 hover:bg-chart-purple/20'
                  }`}
                >
                  ?
                </button>
                <button
                  onClick={() => handleRsvpClick('declined')}
                  disabled={rsvpLoading}
                  className={`px-2 py-1 text-[10px] font-medium rounded transition-all disabled:opacity-50 ${
                    userRsvp === 'declined'
                      ? 'bg-chart-pink text-white'
                      : 'bg-chart-pink/10 text-chart-pink border border-chart-pink/30 hover:bg-chart-pink/20'
                  }`}
                >
                  ✗
                </button>
              </div>
            )}
          </div>

          {/* Current User Status - Compact */}
          {userRsvp && !showMessageInput && (
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className={`font-medium ${
                userRsvp === 'confirmed' ? 'text-chart-cyan' :
                userRsvp === 'declined' ? 'text-chart-pink' : 'text-chart-purple'
              }`}>
                {userRsvp === 'confirmed' && `✓ ${t('events.detail.youAreGoing')}`}
                {userRsvp === 'declined' && `✗ ${t('events.detail.youAreNotGoing')}`}
                {userRsvp === 'maybe' && `? ${t('events.detail.youAreMaybe')}`}
              </span>
              {canRsvp && (
                <button
                  onClick={handleCancelRsvp}
                  className="text-text-muted hover:text-text-primary text-[10px]"
                >
                  {t('events.detail.cancelRsvp')}
                </button>
              )}
            </div>
          )}

          {/* Message Input - Compact */}
          {showMessageInput && pendingResponse && (
            <div className="mt-2 p-2 bg-app-secondary rounded">
              <textarea
                value={responseMessage}
                onChange={(e) => setResponseMessage(e.target.value)}
                placeholder={t('events.response.messagePlaceholder')}
                rows={2}
                className="w-full px-2 py-1.5 text-xs bg-app-background border border-white/10 rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-app-cyan resize-none mb-1.5"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={handleSubmitWithMessage}
                  disabled={rsvpLoading}
                  className="flex-1 px-3 py-1.5 text-xs bg-gradient-primary text-white rounded font-semibold disabled:opacity-50"
                >
                  {rsvpLoading ? t('common.loading') : t('events.response.submit')}
                </button>
                <button
                  onClick={handleCancelMessageInput}
                  className="px-3 py-1.5 text-xs bg-app-background border border-white/10 text-text-primary rounded"
                >
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Locked/Full Messages - Compact */}
          {(locked || deadlinePassed || full) && (
            <div className="mt-2 text-xs text-text-muted">
              {locked && '🔒 ' + t('events.detail.eventLocked')}
              {deadlinePassed && !locked && '⏰ ' + t('events.detail.deadlinePassed')}
              {full && !locked && !deadlinePassed && '📍 ' + t('events.detail.eventFull')}
            </div>
          )}
        </div>

        {/* Description - Compact */}
        {event.description && (
          <div className="bg-app-card rounded-lg border border-white/10 p-2.5">
            <p className="text-xs text-text-secondary whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        {/* All Responses - Compact List with Photos */}
        {responsesWithNames.length > 0 && (
          <div className="bg-app-card rounded-lg border border-white/10 p-2.5">
            <h3 className="text-xs font-semibold text-text-primary mb-2">
              {t('events.response.allResponses')} ({responsesWithNames.length})
            </h3>
            <div className="space-y-1.5">
              {responsesWithNames.map((resp) => (
                <div
                  key={resp.userId}
                  className="flex items-center gap-2"
                >
                  {/* Profile Picture */}
                  {resp.userPhoto ? (
                    <img
                      src={resp.userPhoto}
                      alt={resp.userName}
                      className="w-6 h-6 rounded-full object-cover border border-white/10 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-primary flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                      {resp.userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  
                  {/* Response Icon */}
                  <span className={`font-bold text-xs ${getResponseColor(resp.response)} flex-shrink-0`}>
                    {getResponseIcon(resp.response)}
                  </span>
                  
                  {/* User Name */}
                  <span className="text-text-primary text-xs flex-1 truncate font-medium">
                    {resp.userName}
                  </span>
                  
                  {/* Message */}
                  {resp.message && (
                    <span className="text-text-muted text-[10px] italic truncate max-w-[120px] sm:max-w-[200px]">
                      "{resp.message}"
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back Button */}
        <Link
          to="/calendar"
          className="inline-flex items-center gap-1.5 text-xs text-app-cyan hover:text-app-cyan/80 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t('events.detail.backToCalendar')}
        </Link>
      </div>
    </Container>
  );
}
