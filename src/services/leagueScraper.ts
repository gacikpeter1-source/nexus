/**
 * League Schedule Scraper Service (client side)
 *
 * The actual HTML fetch + parsing runs server-side in the `scrapeLeagueUrl`
 * Cloud Function — a direct browser fetch of an arbitrary league website hits
 * that site's CORS policy and fails for most real sites. This file just calls
 * the callable function and keeps the small client-only helpers.
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

export interface ScrapedGame {
  externalId: string;
  round?: string;
  homeTeam: string;
  guestTeam: string;
  date: string;        // DD.MM.YYYY format
  time: string;        // HH:MM format
  result?: string;     // "3:2" format or null
  location?: string;
  type: 'game';
}

export interface ScraperConfig {
  url: string;
  teamIdentifier: string;
  enabled: boolean;
  lastScrapedAt?: string;
}

const scrapeLeagueUrlFn = httpsCallable<{ url: string }, { games: ScrapedGame[] }>(functions, 'scrapeLeagueUrl');

/**
 * Scrape a league schedule URL via the scrapeLeagueUrl Cloud Function.
 *
 * @param url - League website URL
 * @returns Array of scraped games
 */
export async function scrapeLeagueSchedule(url: string): Promise<ScrapedGame[]> {
  try {
    console.log('🔍 Scraping:', url);
    const result = await scrapeLeagueUrlFn({ url });
    console.log(`✅ Found ${result.data.games.length} games`);
    return result.data.games;
  } catch (error: any) {
    console.error('Scraper error:', error);
    if (error?.code === 'functions/not-found') {
      throw new Error('URL_NOT_FOUND: The URL does not exist.');
    }
    if (error?.code === 'functions/unavailable') {
      throw new Error('CORS_ERROR: Unable to fetch from this URL.');
    }
    throw error;
  }
}

/**
 * Filter games by team identifier
 *
 * @param games - All scraped games
 * @param teamIdentifier - Team name to filter by
 * @returns Games involving the specified team
 */
export function filterGamesByTeam(
  games: ScrapedGame[],
  teamIdentifier: string
): ScrapedGame[] {
  const identifier = teamIdentifier.toLowerCase();

  return games.filter(game =>
    game.homeTeam.toLowerCase().includes(identifier) ||
    game.guestTeam.toLowerCase().includes(identifier)
  );
}

/**
 * Convert DD.MM.YYYY to YYYY-MM-DD (ISO format)
 */
export function convertToISODate(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split('.');
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Detect if team is home or away
 */
export function getHomeOrAway(
  game: ScrapedGame,
  teamIdentifier: string
): 'home' | 'away' {
  const identifier = teamIdentifier.toLowerCase();
  return game.homeTeam.toLowerCase().includes(identifier) ? 'home' : 'away';
}
