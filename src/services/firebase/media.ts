/**
 * Media Database Service
 * Manage media files and galleries in Firestore
 */

import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { deleteFile } from './storage';
import type { MediaFile, MediaGallery } from '../../types/media';

/**
 * Create media file entry in database
 */
export async function createMediaFile(
  mediaData: Omit<MediaFile, 'id' | 'uploadedAt' | 'updatedAt' | 'views' | 'downloads'>
): Promise<string> {
  try {
    const media: Omit<MediaFile, 'id'> = {
      ...mediaData,
      views: 0,
      downloads: 0,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const mediaRef = await addDoc(collection(db, 'media'), media);
    
    // Update with ID
    await updateDoc(mediaRef, { id: mediaRef.id });
    
    console.log('✅ Media file created:', mediaRef.id);
    return mediaRef.id;
    
  } catch (error) {
    console.error('❌ Error creating media file:', error);
    throw error;
  }
}

/**
 * Get media file by ID
 */
export async function getMediaFile(mediaId: string): Promise<MediaFile | null> {
  try {
    const mediaDoc = await getDoc(doc(db, 'media', mediaId));
    
    if (!mediaDoc.exists()) {
      return null;
    }
    
    return { id: mediaDoc.id, ...mediaDoc.data() } as MediaFile;
    
  } catch (error) {
    console.error('❌ Error getting media file:', error);
    throw error;
  }
}

/**
 * Get media files by context (event, team, club, user)
 */
export async function getMediaFiles(filters: {
  clubId?: string;
  teamId?: string;
  eventId?: string;
  userId?: string;
  category?: string;
  type?: string;
  limit?: number;
}): Promise<MediaFile[]> {
  try {
    let q = query(collection(db, 'media'));
    
    // Apply filters
    if (filters.clubId) {
      q = query(q, where('clubId', '==', filters.clubId));
    }
    if (filters.teamId) {
      q = query(q, where('teamId', '==', filters.teamId));
    }
    if (filters.eventId) {
      q = query(q, where('eventId', '==', filters.eventId));
    }
    if (filters.userId) {
      q = query(q, where('userId', '==', filters.userId));
    }
    if (filters.category) {
      q = query(q, where('category', '==', filters.category));
    }
    if (filters.type) {
      q = query(q, where('type', '==', filters.type));
    }
    
    // Order by upload date (newest first)
    q = query(q, orderBy('uploadedAt', 'desc'));
    
    // Apply limit
    if (filters.limit) {
      q = query(q, firestoreLimit(filters.limit));
    }
    
    const snapshot = await getDocs(q);
    
    const media = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as MediaFile));
    
    return media;
    
  } catch (error) {
    console.error('❌ Error getting media files:', error);
    throw error;
  }
}

/**
 * Update media file
 */
export async function updateMediaFile(
  mediaId: string,
  updates: Partial<MediaFile>
): Promise<void> {
  try {
    const mediaRef = doc(db, 'media', mediaId);
    
    await updateDoc(mediaRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Media file updated:', mediaId);
    
  } catch (error) {
    console.error('❌ Error updating media file:', error);
    throw error;
  }
}

/**
 * Delete media file (from database and storage)
 */
export async function deleteMediaFile(mediaId: string): Promise<void> {
  try {
    // Get media file to get storage path
    const media = await getMediaFile(mediaId);
    
    if (!media) {
      throw new Error('Media file not found');
    }
    
    // Delete from storage
    await deleteFile(media.storagePath);
    
    // Delete thumbnail if exists
    if (media.thumbnailUrl) {
      const thumbnailPath = media.storagePath.replace(/\.[^.]+$/, '_thumb.jpg');
      try {
        await deleteFile(thumbnailPath);
      } catch (error) {
        console.warn('Could not delete thumbnail:', error);
      }
    }
    
    // Delete from database
    await deleteDoc(doc(db, 'media', mediaId));
    
    console.log('✅ Media file deleted:', mediaId);
    
  } catch (error) {
    console.error('❌ Error deleting media file:', error);
    throw error;
  }
}

/**
 * Increment view count
 */
export async function incrementViews(mediaId: string): Promise<void> {
  try {
    const media = await getMediaFile(mediaId);
    if (!media) return;
    
    await updateMediaFile(mediaId, {
      views: (media.views || 0) + 1
    });
    
  } catch (error) {
    console.error('Error incrementing views:', error);
  }
}

/**
 * Increment download count
 */
export async function incrementDownloads(mediaId: string): Promise<void> {
  try {
    const media = await getMediaFile(mediaId);
    if (!media) return;
    
    await updateMediaFile(mediaId, {
      downloads: (media.downloads || 0) + 1
    });
    
  } catch (error) {
    console.error('Error incrementing downloads:', error);
  }
}

// ==================== Galleries ====================

/**
 * Create media gallery
 */
export async function createGallery(
  galleryData: Omit<MediaGallery, 'id' | 'createdAt' | 'updatedAt' | 'mediaIds' | 'mediaCount'>
): Promise<string> {
  try {
    const gallery: Omit<MediaGallery, 'id'> = {
      ...galleryData,
      mediaIds: [],
      mediaCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const galleryRef = await addDoc(collection(db, 'galleries'), gallery);
    
    // Update with ID
    await updateDoc(galleryRef, { id: galleryRef.id });
    
    console.log('✅ Gallery created:', galleryRef.id);
    return galleryRef.id;
    
  } catch (error) {
    console.error('❌ Error creating gallery:', error);
    throw error;
  }
}

/**
 * Get gallery by ID
 */
export async function getGallery(galleryId: string): Promise<MediaGallery | null> {
  try {
    const galleryDoc = await getDoc(doc(db, 'galleries', galleryId));
    
    if (!galleryDoc.exists()) {
      return null;
    }
    
    return { id: galleryDoc.id, ...galleryDoc.data() } as MediaGallery;
    
  } catch (error) {
    console.error('❌ Error getting gallery:', error);
    throw error;
  }
}

/**
 * Get galleries by context
 */
export async function getGalleries(filters: {
  clubId?: string;
  teamId?: string;
  eventId?: string;
}): Promise<MediaGallery[]> {
  try {
    let q = query(collection(db, 'galleries'));
    
    if (filters.clubId) {
      q = query(q, where('clubId', '==', filters.clubId));
    }
    if (filters.teamId) {
      q = query(q, where('teamId', '==', filters.teamId));
    }
    if (filters.eventId) {
      q = query(q, where('eventId', '==', filters.eventId));
    }
    
    q = query(q, orderBy('createdAt', 'desc'));
    
    const snapshot = await getDocs(q);
    
    const galleries = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as MediaGallery));
    
    return galleries;
    
  } catch (error) {
    console.error('❌ Error getting galleries:', error);
    throw error;
  }
}

/**
 * Add media to gallery
 */
export async function addMediaToGallery(
  galleryId: string,
  mediaId: string
): Promise<void> {
  try {
    const gallery = await getGallery(galleryId);
    if (!gallery) throw new Error('Gallery not found');
    
    if (!gallery.mediaIds.includes(mediaId)) {
      await updateDoc(doc(db, 'galleries', galleryId), {
        mediaIds: [...gallery.mediaIds, mediaId],
        mediaCount: gallery.mediaCount + 1,
        updatedAt: new Date().toISOString()
      });
      
      console.log('✅ Media added to gallery');
    }
    
  } catch (error) {
    console.error('❌ Error adding media to gallery:', error);
    throw error;
  }
}

/**
 * Remove media from gallery
 */
export async function removeMediaFromGallery(
  galleryId: string,
  mediaId: string
): Promise<void> {
  try {
    const gallery = await getGallery(galleryId);
    if (!gallery) throw new Error('Gallery not found');
    
    await updateDoc(doc(db, 'galleries', galleryId), {
      mediaIds: gallery.mediaIds.filter(id => id !== mediaId),
      mediaCount: Math.max(0, gallery.mediaCount - 1),
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ Media removed from gallery');
    
  } catch (error) {
    console.error('❌ Error removing media from gallery:', error);
    throw error;
  }
}

/**
 * Delete gallery
 */
export async function deleteGallery(galleryId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'galleries', galleryId));
    console.log('✅ Gallery deleted:', galleryId);
  } catch (error) {
    console.error('❌ Error deleting gallery:', error);
    throw error;
  }
}

