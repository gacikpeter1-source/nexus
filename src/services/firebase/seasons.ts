/**
 * Firebase Service: Season Management
 * Handles CRUD operations for club seasons
 */

import { db } from '../../config/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import type { Season } from '../../types';

const COLLECTION_NAME = 'seasons';

/**
 * Create a new season
 */
export async function createSeason(seasonData: Omit<Season, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    // If this season is marked as active, deactivate other seasons
    if (seasonData.isActive) {
      await deactivateAllSeasons(seasonData.clubId);
    }

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...seasonData,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    return docRef.id;
  } catch (error) {
    console.error('❌ Error creating season:', error);
    throw error;
  }
}

/**
 * Get a single season by ID
 */
export async function getSeason(seasonId: string): Promise<Season | null> {
  try {
    const docRef = doc(db, COLLECTION_NAME, seasonId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Season;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting season:', error);
    throw error;
  }
}

/**
 * Get all seasons for a club
 */
export async function getClubSeasons(clubId: string): Promise<Season[]> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('clubId', '==', clubId),
      orderBy('startDate', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    } as Season));
  } catch (error) {
    console.error('❌ Error getting club seasons:', error);
    throw error;
  }
}

/**
 * Get the active season for a club
 */
export async function getActiveSeason(clubId: string): Promise<Season | null> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('clubId', '==', clubId),
      where('isActive', '==', true)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Season;
    }
    return null;
  } catch (error) {
    console.error('❌ Error getting active season:', error);
    throw error;
  }
}

/**
 * Update a season
 */
export async function updateSeason(
  seasonId: string,
  seasonData: Partial<Omit<Season, 'id' | 'clubId' | 'createdBy' | 'createdAt'>>
): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, seasonId);
    
    // If marking this season as active, deactivate other seasons first
    if (seasonData.isActive) {
      const season = await getSeason(seasonId);
      if (season) {
        await deactivateAllSeasons(season.clubId);
      }
    }

    await updateDoc(docRef, {
      ...seasonData,
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('❌ Error updating season:', error);
    throw error;
  }
}

/**
 * Delete a season
 */
export async function deleteSeason(seasonId: string): Promise<void> {
  try {
    const docRef = doc(db, COLLECTION_NAME, seasonId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('❌ Error deleting season:', error);
    throw error;
  }
}

/**
 * Deactivate all seasons for a club
 */
async function deactivateAllSeasons(clubId: string): Promise<void> {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('clubId', '==', clubId),
      where('isActive', '==', true)
    );

    const querySnapshot = await getDocs(q);
    const updatePromises = querySnapshot.docs.map(doc =>
      updateDoc(doc.ref, {
        isActive: false,
        updatedAt: Timestamp.now(),
      })
    );

    await Promise.all(updatePromises);
  } catch (error) {
    console.error('❌ Error deactivating seasons:', error);
    throw error;
  }
}

/**
 * Get season for a specific date
 */
export async function getSeasonForDate(clubId: string, date: Date): Promise<Season | null> {
  try {
    const seasons = await getClubSeasons(clubId);
    const dateStr = date.toISOString().split('T')[0];

    for (const season of seasons) {
      if (dateStr >= season.startDate && dateStr <= season.endDate) {
        return season;
      }
    }

    return null;
  } catch (error) {
    console.error('❌ Error getting season for date:', error);
    throw error;
  }
}


