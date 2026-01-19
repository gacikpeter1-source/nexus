/**
 * Media & File Upload Types
 */

export type MediaType = 'image' | 'video' | 'document' | 'other';

export type MediaCategory = 
  | 'event'       // Event photos/videos
  | 'team'        // Team photos
  | 'profile'     // User profile pictures
  | 'club'        // Club branding/logos
  | 'document'    // Forms, PDFs, documents
  | 'other';

export interface MediaFile {
  id: string;
  
  // File details
  fileName: string;
  fileSize: number;          // bytes
  mimeType: string;
  type: MediaType;
  category: MediaCategory;
  
  // Storage
  storagePath: string;       // Firebase Storage path
  downloadUrl: string;       // Public download URL
  thumbnailUrl?: string;     // Thumbnail for images/videos
  
  // Context
  clubId?: string;           // Associated club
  teamId?: string;           // Associated team
  eventId?: string;          // Associated event
  userId?: string;           // Associated user
  
  // Metadata
  title?: string;
  description?: string;
  tags?: string[];
  
  // Upload info
  uploadedBy: string;        // User ID
  uploadedAt: string;
  
  // Permissions
  visibility: 'public' | 'club' | 'team' | 'private';
  allowDownload: boolean;
  
  // Stats
  views?: number;
  downloads?: number;
  
  // Moderation
  isApproved: boolean;       // For user-uploaded content
  approvedBy?: string;
  approvedAt?: string;
  
  updatedAt: string;
}

export interface MediaGallery {
  id: string;
  
  // Gallery info
  name: string;
  description?: string;
  coverImage?: string;       // URL to cover photo
  
  // Context
  clubId?: string;
  teamId?: string;
  eventId?: string;
  
  // Media
  mediaIds: string[];        // References to MediaFile IDs
  mediaCount: number;
  
  // Permissions
  visibility: 'public' | 'club' | 'team' | 'private';
  allowUploads: boolean;     // Can members upload to this gallery?
  allowedRoles?: string[];   // Which roles can upload
  
  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface UploadProgress {
  fileName: string;
  progress: number;          // 0-100
  uploaded: number;          // bytes
  total: number;             // bytes
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

export interface MediaUploadOptions {
  category: MediaCategory;
  clubId?: string;
  teamId?: string;
  eventId?: string;
  userId?: string;
  title?: string;
  description?: string;
  tags?: string[];
  visibility?: 'public' | 'club' | 'team' | 'private';
  generateThumbnail?: boolean;
}


