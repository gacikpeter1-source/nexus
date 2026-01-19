/**
 * File Upload Component
 * Drag & drop or click to upload files
 */

import { useState, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { uploadFile, validateFile, generateThumbnail } from '../../services/firebase/storage';
import { createMediaFile } from '../../services/firebase/media';
import type { MediaUploadOptions, UploadProgress, MediaType } from '../../types/media';

interface Props {
  options: MediaUploadOptions;
  onUploadComplete?: (mediaId: string, downloadUrl: string) => void;
  onUploadError?: (error: Error) => void;
  multiple?: boolean;
  accept?: string;
  maxSizeMB?: number;
}

export default function FileUpload({
  options,
  onUploadComplete,
  onUploadError,
  multiple = true,
  accept = 'image/*,video/*,application/pdf',
  maxSizeMB = 10
}: Props) {
  const { user } = useAuth();
  const { t } = useLanguage();
  
  const [uploads, setUploads] = useState<Map<string, UploadProgress>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList) {
    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      // Validate file
      const validation = validateFile(file, {
        maxSizeMB,
        allowedTypes: accept.split(',').map(t => t.trim())
      });
      
      if (!validation.valid) {
        if (onUploadError) {
          onUploadError(new Error(validation.error));
        }
        alert(validation.error);
        continue;
      }
      
      // Start upload
      await uploadSingleFile(file);
    }
  }

  async function uploadSingleFile(file: File) {
    try {
      const fileId = `${Date.now()}_${file.name}`;
      
      // Initialize progress
      setUploads(prev => new Map(prev).set(fileId, {
        fileName: file.name,
        progress: 0,
        uploaded: 0,
        total: file.size,
        status: 'pending'
      }));
      
      // Determine media type
      const mediaType: MediaType = file.type.startsWith('image/') ? 'image' :
                                    file.type.startsWith('video/') ? 'video' :
                                    file.type === 'application/pdf' ? 'document' : 'other';
      
      // Upload to storage
      const { downloadUrl, storagePath } = await uploadFile(
        file,
        options,
        (progress) => {
          setUploads(prev => new Map(prev).set(fileId, progress));
        }
      );
      
      // Generate thumbnail for images
      let thumbnailUrl: string | undefined;
      if (mediaType === 'image') {
        try {
          const thumbnail = await generateThumbnail(file);
          const thumbnailFile = new File([thumbnail], `thumb_${file.name}`, { type: 'image/jpeg' });
          const thumbResult = await uploadFile(thumbnailFile, {
            ...options,
            generateThumbnail: false
          });
          thumbnailUrl = thumbResult.downloadUrl;
        } catch (error) {
          console.warn('Could not generate thumbnail:', error);
        }
      }
      
      // Create media entry in database
      const mediaId = await createMediaFile({
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        type: mediaType,
        category: options.category,
        storagePath,
        downloadUrl,
        thumbnailUrl,
        clubId: options.clubId,
        teamId: options.teamId,
        eventId: options.eventId,
        userId: options.userId,
        title: options.title || file.name,
        description: options.description,
        tags: options.tags,
        uploadedBy: user!.id,
        visibility: options.visibility || 'club',
        allowDownload: true,
        isApproved: true // Auto-approve for now
      });
      
      // Complete
      setUploads(prev => {
        const newMap = new Map(prev);
        newMap.delete(fileId);
        return newMap;
      });
      
      if (onUploadComplete) {
        onUploadComplete(mediaId, downloadUrl);
      }
      
    } catch (error: any) {
      console.error('Upload error:', error);
      
      if (onUploadError) {
        onUploadError(error);
      }
      
      alert(t('media.uploadFailed'));
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  }

  function handleClick() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  }

  const isUploading = uploads.size > 0;

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-300
          ${isDragging 
            ? 'border-app-cyan bg-app-cyan/10' 
            : 'border-white/20 hover:border-app-cyan hover:bg-app-secondary'
          }
          ${isUploading ? 'pointer-events-none opacity-50' : ''}
        `}
      >
        <h3 className="text-lg font-semibold text-text-primary mb-2">
          {t('media.dragDrop')}
        </h3>
        <p className="text-text-secondary mb-4">
          {t('media.orClickToSelect')}
        </p>
        <p className="text-sm text-text-muted">
          {t('media.maxSize').replace('{{size}}', maxSizeMB.toString())}
        </p>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple={multiple}
          accept={accept}
          onChange={handleFileInputChange}
          className="hidden"
        />
      </div>

      {/* Upload Progress */}
      {uploads.size > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-text-primary">
            {t('media.uploading')} ({uploads.size})
          </h4>
          
          {Array.from(uploads.entries()).map(([fileId, progress]) => (
            <div key={fileId} className="bg-app-secondary border border-white/10 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                    progress.status === 'complete' ? 'bg-chart-cyan/20' :
                    progress.status === 'error' ? 'bg-chart-pink/20' : 'bg-chart-purple/20'
                  }`}>
                    <div className={`w-3 h-3 rounded-full ${
                      progress.status === 'complete' ? 'bg-chart-cyan' :
                      progress.status === 'error' ? 'bg-chart-pink' : 'bg-chart-purple'
                    }`} />
                  </div>
                  <div>
                    <div className="font-medium text-text-primary">{progress.fileName}</div>
                    <div className="text-sm text-text-muted">
                      {(progress.uploaded / 1024 / 1024).toFixed(2)} MB / 
                      {(progress.total / 1024 / 1024).toFixed(2)} MB
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-lg font-semibold text-app-cyan">
                    {Math.round(progress.progress)}%
                  </div>
                </div>
              </div>
              
              {/* Progress Bar */}
              <div className="w-full bg-app-primary rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    progress.status === 'error' ? 'bg-chart-pink' : 'bg-gradient-primary'
                  }`}
                  style={{ width: `${progress.progress}%` }}
                />
              </div>
              
              {progress.error && (
                <div className="mt-2 text-sm text-chart-pink">
                  {progress.error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

