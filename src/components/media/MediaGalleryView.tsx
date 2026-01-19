/**
 * Media Gallery View Component
 * Display media files in a grid with lightbox
 */

import { useState, useEffect } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { getMediaFiles, deleteMediaFile, incrementViews } from '../../services/firebase/media';
import { useAuth } from '../../contexts/AuthContext';
import type { MediaFile } from '../../types/media';

interface Props {
  clubId?: string;
  teamId?: string;
  eventId?: string;
  userId?: string;
  category?: string;
  limit?: number;
  allowDelete?: boolean;
  onMediaClick?: (media: MediaFile) => void;
}

export default function MediaGalleryView({
  clubId,
  teamId,
  eventId,
  userId,
  category,
  limit,
  allowDelete = false,
  onMediaClick
}: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMedia, setSelectedMedia] = useState<MediaFile | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadMedia();
  }, [clubId, teamId, eventId, userId, category]);

  async function loadMedia() {
    try {
      setLoading(true);
      
      const files = await getMediaFiles({
        clubId,
        teamId,
        eventId,
        userId,
        category,
        limit
      });
      
      setMedia(files);
      
    } catch (error) {
      console.error('Error loading media:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleMediaClick(mediaItem: MediaFile) {
    // Increment view count
    incrementViews(mediaItem.id);
    
    if (onMediaClick) {
      onMediaClick(mediaItem);
    } else {
      setSelectedMedia(mediaItem);
    }
  }

  async function handleDelete(mediaId: string) {
    if (!confirm(t('media.confirmDelete'))) return;
    
    try {
      setDeleting(mediaId);
      await deleteMediaFile(mediaId);
      setMedia(media.filter(m => m.id !== mediaId));
      
      if (selectedMedia?.id === mediaId) {
        setSelectedMedia(null);
      }
      
    } catch (error) {
      console.error('Error deleting media:', error);
      alert(t('media.deleteFailed'));
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-cyan mx-auto mb-4"></div>
        <p className="text-text-secondary">{t('common.loading')}</p>
      </div>
    );
  }

  if (media.length === 0) {
    return (
      <div className="py-12 text-center">
        <h3 className="text-xl font-semibold text-text-primary mb-2">
          {t('media.noFiles')}
        </h3>
        <p className="text-text-secondary">
          {t('media.noFilesDesc')}
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {media.map(mediaItem => (
          <div
            key={mediaItem.id}
            className="group relative aspect-square bg-app-secondary rounded-2xl border border-white/10 overflow-hidden cursor-pointer hover:-translate-y-1 hover:shadow-card transition-all duration-300"
            onClick={() => handleMediaClick(mediaItem)}
          >
            {/* Image/Video Thumbnail */}
            {mediaItem.type === 'image' && (
              <img
                src={mediaItem.thumbnailUrl || mediaItem.downloadUrl}
                alt={mediaItem.title || mediaItem.fileName}
                className="w-full h-full object-cover"
              />
            )}
            
            {mediaItem.type === 'video' && (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-chart-purple to-chart-pink">
                <svg className="w-16 h-16 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              </div>
            )}
            
            {mediaItem.type === 'document' && (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-app-blue to-chart-cyan">
                <svg className="w-16 h-16 text-white mb-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <div className="text-xs text-white px-2 text-center truncate max-w-full font-medium">
                  {mediaItem.fileName}
                </div>
              </div>
            )}

            {/* Overlay on Hover */}
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-opacity flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-center p-4">
                <div className="font-semibold mb-1 truncate">
                  {mediaItem.title || mediaItem.fileName}
                </div>
                {mediaItem.views !== undefined && (
                  <div className="text-sm text-text-secondary">
                    {mediaItem.views} {t('media.views')}
                  </div>
                )}
              </div>
            </div>

            {/* Delete Button (if allowed) */}
            {allowDelete && (user?.id === mediaItem.uploadedBy || user?.role === 'admin') && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(mediaItem.id);
                }}
                disabled={deleting === mediaItem.id}
                className="absolute top-2 right-2 p-2 bg-chart-pink text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-chart-pink/80 disabled:bg-gray-600 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedMedia && (
        <div
          className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedMedia(null)}
        >
          <button
            onClick={() => setSelectedMedia(null)}
            className="absolute top-4 right-4 text-white text-4xl hover:text-app-cyan transition-colors font-bold"
          >
            ×
          </button>

          <div
            className="max-w-7xl max-h-full overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            {selectedMedia.type === 'image' && (
              <img
                src={selectedMedia.downloadUrl}
                alt={selectedMedia.title || selectedMedia.fileName}
                className="max-w-full max-h-[90vh] mx-auto rounded-2xl"
              />
            )}

            {/* Video */}
            {selectedMedia.type === 'video' && (
              <video
                src={selectedMedia.downloadUrl}
                controls
                className="max-w-full max-h-[90vh] mx-auto rounded-2xl"
              >
                {t('media.videoNotSupported')}
              </video>
            )}

            {/* Document */}
            {selectedMedia.type === 'document' && (
              <div className="bg-app-card rounded-2xl border border-white/10 shadow-card p-8 max-w-2xl mx-auto">
                <svg className="w-20 h-20 text-app-blue mx-auto mb-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
                <h3 className="text-xl font-bold text-text-primary mb-4 text-center">
                  {selectedMedia.title || selectedMedia.fileName}
                </h3>
                {selectedMedia.description && (
                  <p className="text-text-secondary mb-6 text-center">
                    {selectedMedia.description}
                  </p>
                )}
                <div className="flex space-x-4">
                  <a
                    href={selectedMedia.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 text-center font-semibold"
                  >
                    {t('media.viewDocument')}
                  </a>
                  {selectedMedia.allowDownload && (
                    <a
                      href={selectedMedia.downloadUrl}
                      download={selectedMedia.fileName}
                      className="flex-1 px-6 py-3 bg-app-secondary border border-white/10 text-text-primary rounded-xl hover:bg-white/10 transition-all duration-300 text-center font-semibold"
                    >
                      {t('media.download')}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Info Bar */}
            <div className="bg-app-card border border-white/10 rounded-2xl shadow-card p-4 mt-2">
              <h3 className="font-bold text-text-primary mb-2">
                {selectedMedia.title || selectedMedia.fileName}
              </h3>
              {selectedMedia.description && (
                <p className="text-text-secondary mb-2">{selectedMedia.description}</p>
              )}
              <div className="flex items-center space-x-4 text-sm text-text-muted">
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-app-blue mr-2"></span>
                  {new Date(selectedMedia.uploadedAt).toLocaleDateString()}
                </span>
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-chart-cyan mr-2"></span>
                  {selectedMedia.views || 0} {t('media.views')}
                </span>
                <span className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-chart-purple mr-2"></span>
                  {(selectedMedia.fileSize / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

