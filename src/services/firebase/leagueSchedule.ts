/**
 * League Schedule Service
 * Manage synced league games from scrapers
 */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import type { ScrapedGame } from '../leagueScraper';

export interface LeagueGame {
  id: string;
  clubId: string;
  teamId: string;
  seasonId?: string;
  
  // Game details
  homeTeam: string;
  guestTeam: string;
  date: string;          // YYYY-MM-DD format
  time: string;          // HH:MM format
  round?: string;
  location?: string;
  
  // Results
  result?: string;       // "3:2" format
  homeScore?: number;
  guestScore?: number;
  status: 'upcoming' | 'played' | 'cancelled';
  
  // Scraper tracking
  source: 'scraped' | 'manual';
  scrapedId?: string;    // External ID from scraper
  lastSyncedAt?: string;
  
  // Calendar integration
  eventId?: string;      // Linked calendar event ID
  
  // Metadata
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create league game entry
 */
export async function createLeagueGame(
  gameData: Omit<LeagueGame, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const game = {
      ...gameData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const gameRef = await addDoc(collection(db, 'leagueSchedule'), game);
    
    // Update with ID
    await updateDoc(gameRef, { id: gameRef.id });
    
    console.log('✅ League game created:', gameRef.id);
    return gameRef.id;
    
  } catch (error) {
    console.error('❌ Error creating league game:', error);
    throw error;
  }
}

/**
 * Get league schedule for a team
 */
export async function getTeamLeagueSchedule(
  teamId: string,
  seasonId?: string
): Promise<LeagueGame[]> {
  try {
    let q = query(
      collection(db, 'leagueSchedule'),
      where('teamId', '==', teamId),
      orderBy('date', 'asc')
    );
    
    if (seasonId) {
      q = query(q, where('seasonId', '==', seasonId));
    }
    
    const snapshot = await getDocs(q);
    
    const games = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as LeagueGame));
    
    return games;
    
  } catch (error) {
    console.error('❌ Error getting league schedule:', error);
    throw error;
  }
}

/**
 * Update league game
 */
export async function updateLeagueGame(
  gameId: string,
  updates: Partial<LeagueGame>
): Promise<void> {
  try {
    const gameRef = doc(db, 'leagueSchedule', gameId);
    
    await updateDoc(gameRef, {
      ...updates,
      updatedAt: new Date().toISOString()
    });
    
    console.log('✅ League game updated:', gameId);
    
  } catch (error) {
    console.error('❌ Error updating league game:', error);
    throw error;
  }
}

/**
 * Delete league game
 */
export async function deleteLeagueGame(gameId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'leagueSchedule', gameId));
    console.log('✅ League game deleted:', gameId);
  } catch (error) {
    console.error('❌ Error deleting league game:', error);
    throw error;
  }
}

/**
 * Find game by external ID (from scraper)
 */
export async function findGameByScrapedId(
  scrapedId: string
): Promise<LeagueGame | null> {
  try {
    const q = query(
      collection(db, 'leagueSchedule'),
      where('scrapedId', '==', scrapedId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    return {
      id: snapshot.docs[0].id,
      ...snapshot.docs[0].data()
    } as LeagueGame;
    
  } catch (error) {
    console.error('❌ Error finding game by scraped ID:', error);
    throw error;
  }
}

/**
 * Sync scraped games to database
 * Creates new games and updates existing ones
 */
export async function syncScrapedGames(
  scrapedGames: ScrapedGame[],
  clubId: string,
  teamId: string,
  userId: string
): Promise<{ created: number; updated: number }> {
  try {
    let created = 0;
    let updated = 0;
    
    for (const scrapedGame of scrapedGames) {
      // Check if game already exists
      const existing = await findGameByScrapedId(scrapedGame.externalId);
      
      // Convert DD.MM.YYYY to YYYY-MM-DD
      const [day, month, year] = scrapedGame.date.split('.');
      const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Parse result if available
      let homeScore: number | undefined;
      let guestScore: number | undefined;
      if (scrapedGame.result) {
        const [home, guest] = scrapedGame.result.split(':').map(s => parseInt(s.trim()));
        homeScore = home;
        guestScore = guest;
      }
      
      const gameDate = new Date(isoDate);
      const status: 'upcoming' | 'played' = new Date() > gameDate ? 'played' : 'upcoming';
      
      if (existing) {
        // Update existing game
        const updates: Partial<LeagueGame> = {
          result: scrapedGame.result,
          homeScore,
          guestScore,
          status,
          lastSyncedAt: new Date().toISOString()
        };
        
        await updateLeagueGame(existing.id, updates);
        updated++;
        
      } else {
        // Create new game
        const gameData: Omit<LeagueGame, 'id' | 'createdAt' | 'updatedAt'> = {
          clubId,
          teamId,
          homeTeam: scrapedGame.homeTeam,
          guestTeam: scrapedGame.guestTeam,
          date: isoDate,
          time: scrapedGame.time,
          round: scrapedGame.round,
          location: scrapedGame.location,
          result: scrapedGame.result,
          homeScore,
          guestScore,
          status,
          source: 'scraped',
          scrapedId: scrapedGame.externalId,
          lastSyncedAt: new Date().toISOString(),
          createdBy: userId
        };
        
        await createLeagueGame(gameData);
        created++;
      }
    }
    
    console.log(`✅ Sync complete: ${created} created, ${updated} updated`);
    return { created, updated };
    
  } catch (error) {
    console.error('❌ Error syncing games:', error);
    throw error;
  }
}

