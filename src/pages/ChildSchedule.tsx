/**
 * Child Schedule Page
 * View child's events and RSVP on their behalf
 */

import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import Container from '../components/layout/Container';
import { getChild } from '../services/firebase/parentChild';
import { getUserEvents, rsvpToEvent } from '../services/firebase/events';
import type { User, CalendarEvent } from '../types';

export default function ChildSchedule() {
  const { childId } = useParams<{ childId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  
  const [child, setChild] = useState<User | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState<string | null>(null);

  useEffect(() => {
    if (childId) {
      loadChildData();
    }
  }, [childId]);

  async function loadChildData() {
    try {
      setLoading(true);
      
      // Get child
      const childData = await getChild(childId!);
      if (!childData) {
        navigate('/parent/dashboard');
        return;
      }
      
      // Verify this parent can manage this child
      if (!childData.parentIds?.includes(user!.id)) {
        navigate('/parent/dashboard');
        return;
      }
      
      setChild(childData);
      
      // Get child's events
      const childEvents = await getUserEvents(childId!);
      setEvents(childEvents as any);
      
    } catch (error) {
      console.error('Error loading child data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleRsvp(eventId: string, response: 'confirmed' | 'declined' | 'maybe') {
    try {
      setRsvpLoading(eventId);
      
      // RSVP on behalf of child
      await rsvpToEvent(eventId, childId!, response);
      
      // Reload events
      await loadChildData();
      
    } catch (error) {
      console.error('Error RSVPing:', error);
      alert(t('events.detail.rsvpError'));
    } finally {
      setRsvpLoading(null);
    }
  }

  function getRsvpStatus(event: CalendarEvent): 'confirmed' | 'declined' | 'maybe' | null {
    if (!event.responses || !childId) return null;
    const userResponse = event.responses[childId];
    return userResponse?.response || null;
  }

  if (loading) {
    return (
      <Container>
        <div className="py-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
          <p className="text-text-secondary">{t('common.loading')}</p>
        </div>
      </Container>
    );
  }

  if (!child) {
    return (
      <Container>
        <div className="py-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">{t('parent.childNotFound')}</h1>
          <Link to="/parent/dashboard" className="text-app-blue hover:text-app-cyan transition-colors">
            {t('parent.backToDashboard')}
          </Link>
        </div>
      </Container>
    );
  }

  return (
    <Container>
      <div className="py-8">
        {/* Header */}
        <div className="mb-8">
          <Link to="/parent/dashboard" className="text-app-blue hover:text-app-cyan transition-colors mb-4 inline-block">
            ← {t('parent.backToDashboard')}
          </Link>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">
                {child.displayName}'s {t('parent.schedule')}
              </h1>
            </div>
            
            <Link
              to={`/parent/child/${childId}/edit`}
              className="px-6 py-3 bg-app-secondary text-text-primary border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-300 font-semibold"
            >
              {t('common.edit')}
            </Link>
          </div>
        </div>

        {/* Child Info */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 mb-8">
          <div className="flex items-center">
            <div className="w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-button">
              {child.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="ml-6">
              <h2 className="text-2xl font-semibold text-text-primary">{child.displayName}</h2>
              {child.dateOfBirth && (
                <p className="text-text-secondary mt-1">
                  {t('parent.bornOn')} {new Date(child.dateOfBirth).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-white/10">
            <div className="text-center">
              <div className="text-3xl font-bold text-app-blue">{child.clubIds?.length || 0}</div>
              <div className="text-sm text-text-secondary">{t('parent.clubs')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-chart-purple">{child.teamIds?.length || 0}</div>
              <div className="text-sm text-text-secondary">{t('parent.teams')}</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-chart-cyan">{events.length}</div>
              <div className="text-sm text-text-secondary">{t('parent.upcomingEvents')}</div>
            </div>
          </div>
        </div>

        {/* Events List */}
        <h2 className="text-2xl font-bold text-text-primary mb-4">{t('parent.upcomingEvents')}</h2>
        
        {events.length === 0 ? (
          <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-12 text-center">
            <h3 className="text-xl font-semibold text-text-primary mb-2">
              {t('parent.noEvents')}
            </h3>
            <p className="text-text-secondary">
              {t('parent.noEventsDescription')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map(event => {
              const rsvpStatus = getRsvpStatus(event);
              const isLoading = rsvpLoading === event.id;
              
              return (
                <div
                  key={event.id}
                  className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6 hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <h3 className="text-lg font-semibold text-text-primary">
                          {event.title}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          event.type === 'personal' ? 'bg-chart-blue/20 text-chart-blue' :
                          event.type === 'team' ? 'bg-chart-cyan/20 text-chart-cyan' :
                          'bg-chart-purple/20 text-chart-purple'
                        }`}>
                          {t(`calendar.${event.type}`)}
                        </span>
                      </div>
                      
                      <div className="space-y-2 text-sm text-text-secondary">
                        <div className="flex items-center">
                          <span className="w-2 h-2 rounded-full bg-app-blue mr-3"></span>
                          <span>{new Date(event.date).toLocaleDateString()}</span>
                        </div>
                        
                        {event.startTime && (
                          <div className="flex items-center">
                            <span className="w-2 h-2 rounded-full bg-chart-cyan mr-3"></span>
                            <span>{event.startTime} - {event.endTime}</span>
                          </div>
                        )}
                        
                        {event.location && (
                          <div className="flex items-center">
                            <span className="w-2 h-2 rounded-full bg-chart-purple mr-3"></span>
                            <span>{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {/* RSVP Status & Actions */}
                    <div className="ml-6">
                      {rsvpStatus ? (
                        <div className="text-center mb-3">
                          <div className={`px-4 py-2 rounded-xl font-semibold mb-2 ${
                            rsvpStatus === 'confirmed' ? 'bg-chart-cyan/20 text-chart-cyan' :
                            rsvpStatus === 'declined' ? 'bg-chart-pink/20 text-chart-pink' :
                            'bg-chart-purple/20 text-chart-purple'
                          }`}>
                            {rsvpStatus === 'confirmed' ? t('events.detail.going') :
                             rsvpStatus === 'declined' ? t('events.detail.notGoing') :
                             t('events.detail.maybe')}
                          </div>
                        </div>
                      ) : null}
                      
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleRsvp(event.id, 'confirmed')}
                          disabled={isLoading}
                          className={`px-4 py-2 rounded-xl font-semibold transition-all duration-300 ${
                            rsvpStatus === 'confirmed'
                              ? 'bg-chart-cyan text-white shadow-button'
                              : 'bg-chart-cyan/20 text-chart-cyan hover:bg-chart-cyan/30'
                          } disabled:opacity-50`}
                        >
                          ✓
                        </button>
                        
                        <button
                          onClick={() => handleRsvp(event.id, 'maybe')}
                          disabled={isLoading}
                          className={`px-4 py-2 rounded-xl font-semibold transition-all duration-300 ${
                            rsvpStatus === 'maybe'
                              ? 'bg-chart-purple text-white shadow-button'
                              : 'bg-chart-purple/20 text-chart-purple hover:bg-chart-purple/30'
                          } disabled:opacity-50`}
                        >
                          ?
                        </button>
                        
                        <button
                          onClick={() => handleRsvp(event.id, 'declined')}
                          disabled={isLoading}
                          className={`px-4 py-2 rounded-xl font-semibold transition-all duration-300 ${
                            rsvpStatus === 'declined'
                              ? 'bg-chart-pink text-white shadow-button'
                              : 'bg-chart-pink/20 text-chart-pink hover:bg-chart-pink/30'
                          } disabled:opacity-50`}
                        >
                          ✗
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Container>
  );
}

