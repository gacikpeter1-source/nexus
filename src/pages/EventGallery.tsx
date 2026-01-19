/**
 * Event Gallery Page
 * View and upload photos for a specific event
 */

import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import Container from '../components/layout/Container';
import FileUpload from '../components/media/FileUpload';
import MediaGalleryView from '../components/media/MediaGalleryView';
import { getEvent } from '../services/firebase/events';
import type { Event as CalendarEvent } from '../types';

export default function EventGallery() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  async function loadEvent() {
    try {
      setLoading(true);
      if (!eventId) return;
      
      const eventData = await getEvent(eventId);
      setEvent(eventData);
      
    } catch (error) {
      console.error('Error loading event:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleUploadComplete() {
    setShowUpload(false);
    setRefreshKey(prev => prev + 1);
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

  if (!event) {
    return (
      <Container>
        <div className="py-8 text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-4">
            {t('events.notFound')}
          </h1>
        </div>
      </Container>
    );
  }

  const canUpload = user && (
    user.role === 'admin' ||
    user.role === 'clubOwner' ||
    user.role === 'trainer' ||
    event.createdBy === user.id
  );

  return (
    <Container>
      <div className="py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">
                {event.title}
              </h1>
            </div>
            
            {canUpload && (
              <button
                onClick={() => setShowUpload(!showUpload)}
                className="px-8 py-4 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
              >
                {showUpload ? t('common.cancel') : t('media.uploadPhotos')}
              </button>
            )}
          </div>
          
          {event.description && (
            <p className="text-text-secondary">{event.description}</p>
          )}
        </div>

        {/* Upload Section */}
        {showUpload && (
          <div className="mb-8 bg-app-card rounded-2xl shadow-card border border-white/10 p-6">
            <h2 className="text-xl font-semibold text-text-primary mb-4">
              {t('media.uploadPhotos')}
            </h2>
            
            <FileUpload
              options={{
                category: 'event',
                clubId: event.clubId,
                teamId: event.teamId,
                eventId: event.id,
                visibility: 'club',
                title: event.title
              }}
              accept="image/*,video/*"
              onUploadComplete={handleUploadComplete}
              onUploadError={(error) => {
                console.error('Upload error:', error);
                alert(t('media.uploadFailed'));
              }}
            />
          </div>
        )}

        {/* Gallery */}
        <div className="bg-app-card rounded-2xl shadow-card border border-white/10 p-6">
          <h2 className="text-xl font-semibold text-text-primary mb-6">
            {t('media.photos')} & {t('media.videos')}
          </h2>
          
          <MediaGalleryView
            key={refreshKey}
            eventId={eventId}
            clubId={event.clubId}
            category="event"
            allowDelete={canUpload || false}
          />
        </div>
      </div>
    </Container>
  );
}

