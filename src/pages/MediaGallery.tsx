/**
 * Media Gallery Page
 * View and manage media files
 */

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import Container from '../components/layout/Container';
import FileUpload from '../components/media/FileUpload';
import MediaGalleryView from '../components/media/MediaGalleryView';
import type { MediaCategory } from '../types/media';

export default function MediaGallery() {
  const { clubId, teamId } = useParams<{ clubId?: string; teamId?: string }>();
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const [showUpload, setShowUpload] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory | 'all'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  const categories: { value: MediaCategory | 'all'; label: string }[] = [
    { value: 'all', label: t('media.allMedia') },
    { value: 'event', label: t('media.events') },
    { value: 'team', label: t('media.team') },
    { value: 'document', label: t('media.documents') },
    { value: 'other', label: t('media.other') }
  ];

  function handleUploadComplete() {
    setShowUpload(false);
    setRefreshKey(prev => prev + 1);
  }

  const canUpload = user?.role && ['admin', 'clubOwner', 'trainer'].includes(user.role);

  return (
    <Container>
      <div className="py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">
              {t('media.gallery')}
            </h1>
          </div>
          
          {canUpload && (
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="px-8 py-4 bg-gradient-primary text-white rounded-xl shadow-button hover:shadow-button-hover hover:-translate-y-0.5 transition-all duration-300 font-semibold"
            >
              {showUpload ? t('common.cancel') : t('media.uploadFiles')}
            </button>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-3 mb-8">
          {categories.map(cat => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`
                px-6 py-3 rounded-xl font-semibold transition-all duration-300
                ${selectedCategory === cat.value
                  ? 'bg-gradient-primary text-white shadow-button'
                  : 'bg-app-secondary text-text-secondary hover:bg-white/10 border border-white/10'
                }
              `}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Upload Section */}
        {showUpload && (
          <div className="mb-8 bg-app-card rounded-2xl shadow-card border border-white/10 p-6">
            <h2 className="text-xl font-semibold text-text-primary mb-4">
              {t('media.uploadFiles')}
            </h2>
            
            <FileUpload
              options={{
                category: selectedCategory === 'all' ? 'other' : selectedCategory,
                clubId,
                teamId,
                visibility: 'club'
              }}
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
          <MediaGalleryView
            key={refreshKey}
            clubId={clubId}
            teamId={teamId}
            category={selectedCategory === 'all' ? undefined : selectedCategory}
            allowDelete={canUpload}
          />
        </div>
      </div>
    </Container>
  );
}

