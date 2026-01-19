/**
 * Firebase Storage Service
 * Handle file uploads, downloads, and management
 */

import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  getMetadata
} from 'firebase/storage';
import { storage } from '../../config/firebase';
import type { MediaUploadOptions, UploadProgress } from '../../types/media';

/**
 * Upload file to Firebase Storage
 * Returns download URL and storage path
 */
export async function uploadFile(
  file: File,
  options: MediaUploadOptions,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ downloadUrl: string; storagePath: string }> {
  try {
    // Generate storage path
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    let basePath = '';
    
    if (options.category === 'profile' && options.userId) {
      basePath = `users/${options.userId}/profile`;
    } else if (options.category === 'event' && options.eventId) {
      basePath = `clubs/${options.clubId}/events/${options.eventId}`;
    } else if (options.category === 'team' && options.teamId) {
      basePath = `clubs/${options.clubId}/teams/${options.teamId}`;
    } else if (options.category === 'club' && options.clubId) {
      basePath = `clubs/${options.clubId}/branding`;
    } else if (options.category === 'document') {
      basePath = `clubs/${options.clubId}/documents`;
    } else {
      basePath = `uploads/${options.category}`;
    }
    
    const storagePath = `${basePath}/${timestamp}_${sanitizedFileName}`;
    const storageRef = ref(storage, storagePath);
    
    // Start upload
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    // Track progress
    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress: UploadProgress = {
            fileName: file.name,
            progress: (snapshot.bytesTransferred / snapshot.totalBytes) * 100,
            uploaded: snapshot.bytesTransferred,
            total: snapshot.totalBytes,
            status: 'uploading'
          };
          
          if (onProgress) {
            onProgress(progress);
          }
        },
        (error) => {
          console.error('Upload error:', error);
          
          if (onProgress) {
            onProgress({
              fileName: file.name,
              progress: 0,
              uploaded: 0,
              total: file.size,
              status: 'error',
              error: error.message
            });
          }
          
          reject(error);
        },
        async () => {
          // Upload complete
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          
          if (onProgress) {
            onProgress({
              fileName: file.name,
              progress: 100,
              uploaded: file.size,
              total: file.size,
              status: 'complete'
            });
          }
          
          resolve({ downloadUrl, storagePath });
        }
      );
    });
    
  } catch (error) {
    console.error('Upload file error:', error);
    throw error;
  }
}

/**
 * Delete file from Firebase Storage
 */
export async function deleteFile(storagePath: string): Promise<void> {
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
    console.log('✅ File deleted:', storagePath);
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    throw error;
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(storagePath: string) {
  try {
    const fileRef = ref(storage, storagePath);
    const metadata = await getMetadata(fileRef);
    return metadata;
  } catch (error) {
    console.error('Error getting metadata:', error);
    throw error;
  }
}

/**
 * List all files in a directory
 */
export async function listFiles(directoryPath: string): Promise<string[]> {
  try {
    const dirRef = ref(storage, directoryPath);
    const result = await listAll(dirRef);
    
    const urls = await Promise.all(
      result.items.map(item => getDownloadURL(item))
    );
    
    return urls;
  } catch (error) {
    console.error('Error listing files:', error);
    throw error;
  }
}

/**
 * Validate file before upload
 */
export function validateFile(
  file: File,
  options: {
    maxSizeMB?: number;
    allowedTypes?: string[];
  } = {}
): { valid: boolean; error?: string } {
  const {
    maxSizeMB = 10,
    allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'video/mp4']
  } = options;
  
  // Check file size
  const maxSizeBytes = maxSizeMB * 1024 * 1024;
  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit`
    };
  }
  
  // Check file type
  if (!allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed`
    };
  }
  
  return { valid: true };
}

/**
 * Generate thumbnail from image file (client-side)
 */
export async function generateThumbnail(
  file: File,
  maxWidth: number = 300,
  maxHeight: number = 300
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Calculate new dimensions
        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Could not generate thumbnail'));
            }
          },
          'image/jpeg',
          0.8
        );
      };
      
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = e.target?.result as string;
    };
    
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}


