/**
 * Event Detail Page
 * View event details and RSVP
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
import type { CalendarEvent } from '../../types';

export default function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { canModify } = usePermissions();
  const navigate = useNavigate();

  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [userRsvp, setUserRsvp] = useState<'yes' | 'no' | 'maybe' | null>(null);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);

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
      }
    } catch (error) {
      console.error('Error loading event:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRsvp = async (response: 'yes' | 'no' | 'maybe') => {
    if (!eventId || !user) return;

    setRsvpLoading(true);
    try {
      await rsvpToEvent(eventId, user.id, response);
      setUserRsvp(response);
      await loadEvent(); // Reload to update counts
    } catch (error) {
      console.error('Error submitting RSVP:', error);
    } finally {
      setRsvpLoading(false);
    }
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

  if (!event) {
    return (
      <Container>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            {t('events.detail.notFound')}
          </h2>
          <Link
            to="/calendar"
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-600 transition-colors inline-block"
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
  const canRsvp = event.rsvpRequired && !locked && !deadlinePassed && (!full || userRsvp === 'yes');

  return (
    <Container className="max-w-4xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-3xl font-bold text-gray-900">{event.title}</h1>
                <span className={`px-3 py-1 text-sm font-semibold rounded-full ${
                  event.type === 'club'
                    ? 'bg-blue-100 text-blue-800'
                    : event.type === 'team'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {t(`events.types.${event.type}`)}
                </span>
              </div>
            </div>

            {canEdit && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => navigate(`/calendar/events/${event.id}/edit`)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {t('common.edit')}
                </button>
                <button
                  onClick={handleDeleteEvent}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            )}
          </div>

          {/* Event Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <div>
                  <p className="text-sm text-gray-500">{t('events.detail.date')}</p>
                  <p className="font-medium text-gray-900">
                    {new Date(event.date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {event.startTime && (
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-500">{t('events.detail.time')}</p>
                    <p className="font-medium text-gray-900">
                      {event.startTime} {event.endTime && `- ${event.endTime}`}
                    </p>
                  </div>
                </div>
              )}

              {event.location && (
                <div className="flex items-start space-x-3">
                  <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <div>
                    <p className="text-sm text-gray-500">{t('events.detail.location')}</p>
                    <p className="font-medium text-gray-900">{event.location}</p>
                  </div>
                </div>
              )}
            </div>

            {/* RSVP Stats */}
            {event.rsvpRequired && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-3">{t('events.detail.rsvpStats')}</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{t('events.detail.going')}</span>
                    <span className="font-semibold text-green-600">{event.rsvpYes?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{t('events.detail.notGoing')}</span>
                    <span className="font-semibold text-red-600">{event.rsvpNo?.length || 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{t('events.detail.maybe')}</span>
                    <span className="font-semibold text-yellow-600">{event.rsvpMaybe?.length || 0}</span>
                  </div>
                  {event.maxParticipants && (
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                      <span className="text-sm text-gray-600">{t('events.detail.capacity')}</span>
                      <span className="font-semibold text-gray-900">
                        {event.rsvpYes?.length || 0} / {event.maxParticipants}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Description */}
          {event.description && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-2">{t('events.detail.description')}</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{event.description}</p>
            </div>
          )}
        </div>

        {/* RSVP Section */}
        {event.rsvpRequired && user && (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {t('events.detail.yourResponse')}
            </h2>

            {/* Current RSVP Status */}
            {userRsvp && (
              <div className={`mb-4 p-4 rounded-lg ${
                userRsvp === 'yes'
                  ? 'bg-green-50 border border-green-200'
                  : userRsvp === 'no'
                  ? 'bg-red-50 border border-red-200'
                  : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <p className="text-sm font-medium">
                  {userRsvp === 'yes' && t('events.detail.youAreGoing')}
                  {userRsvp === 'no' && t('events.detail.youAreNotGoing')}
                  {userRsvp === 'maybe' && t('events.detail.youAreMaybe')}
                </p>
              </div>
            )}

            {/* Lock/Deadline Messages */}
            {locked && (
              <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">{t('events.detail.eventLocked')}</p>
              </div>
            )}
            {deadlinePassed && !locked && (
              <div className="mb-4 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <p className="text-sm text-gray-600">{t('events.detail.deadlinePassed')}</p>
              </div>
            )}
            {full && !userRsvp && !locked && !deadlinePassed && (
              <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-sm text-orange-800">{t('events.detail.eventFull')}</p>
              </div>
            )}

            {/* RSVP Buttons */}
            {canRsvp && (
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => handleRsvp('yes')}
                  disabled={rsvpLoading}
                  className={`flex-1 px-4 py-2 rounded-md transition-colors ${
                    userRsvp === 'yes'
                      ? 'bg-green-600 text-white'
                      : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
                  }`}
                >
                  ✓ {t('events.detail.going')}
                </button>
                <button
                  onClick={() => handleRsvp('maybe')}
                  disabled={rsvpLoading}
                  className={`flex-1 px-4 py-2 rounded-md transition-colors ${
                    userRsvp === 'maybe'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-yellow-50 text-yellow-700 hover:bg-yellow-100 border border-yellow-200'
                  }`}
                >
                  ? {t('events.detail.maybe')}
                </button>
                <button
                  onClick={() => handleRsvp('no')}
                  disabled={rsvpLoading}
                  className={`flex-1 px-4 py-2 rounded-md transition-colors ${
                    userRsvp === 'no'
                      ? 'bg-red-600 text-white'
                      : 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                  }`}
                >
                  ✗ {t('events.detail.notGoing')}
                </button>
              </div>
            )}

            {/* Cancel RSVP */}
            {userRsvp && canRsvp && (
              <button
                onClick={handleCancelRsvp}
                disabled={rsvpLoading}
                className="mt-3 w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {t('events.detail.cancelRsvp')}
              </button>
            )}
          </div>
        )}

        {/* Back Button */}
        <div>
          <Link
            to="/calendar"
            className="inline-flex items-center text-primary hover:text-primary-600"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            {t('events.detail.backToCalendar')}
          </Link>
        </div>
      </div>
    </Container>
  );
}

