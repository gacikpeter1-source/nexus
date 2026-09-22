/**
 * Media Database Service
 * Manage media file entries in Firestore
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
import type { MediaFile } from '../../types/media';

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


