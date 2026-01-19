/**
 * League Schedule Scraper Service
 * Parses HTML from league websites and extracts game schedules
 * 
 * NOTE: For production, consider using Firebase Cloud Functions to avoid CORS issues
 * This client-side implementation works for CORS-enabled sites or with proxy
 */

import axios from 'axios';

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

/**
 * Scrape league schedule from URL
 * Supports various league website formats
 * 
 * @param url - League website URL
 * @param corsProxy - Optional CORS proxy (e.g., 'https://cors-anywhere.herokuapp.com/')
 * @returns Array of scraped games
 */
export async function scrapeLeagueSchedule(
  url: string,
  corsProxy?: string
): Promise<ScrapedGame[]> {
  try {
    // Use CORS proxy if provided (for development/testing)
    const fetchUrl = corsProxy ? `${corsProxy}${url}` : url;
    
    console.log('🔍 Scraping:', url);
    
    const response = await axios.get(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      },
      timeout: 15000
    });
    
    const html = response.data;
    
    // Parse HTML using browser's DOMParser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Try different parsing strategies
    let games: ScrapedGame[] = [];
    
    // Strategy 1: hlcana.sk pattern (text-based)
    const hlcanaGames = parseHlcanaPattern(doc);
    if (hlcanaGames.length > 0) {
      games = hlcanaGames;
    }
    
    // Strategy 2: Table-based parsing (common format)
    if (games.length === 0) {
      games = parseTableFormat(doc);
    }
    
    // Strategy 3: Generic pattern matching
    if (games.length === 0) {
      games = parseGenericFormat(doc);
    }
    
    console.log(`✅ Found ${games.length} games`);
    return games;
    
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === 'ERR_NETWORK') {
        throw new Error('CORS_ERROR: Unable to fetch from this URL. For production, use Firebase Cloud Functions.');
      }
      if (error.response?.status === 404) {
        throw new Error('URL_NOT_FOUND: The URL does not exist.');
      }
    }
    
    console.error('Scraper error:', error);
    throw error;
  }
}

/**
 * Parse hlcana.sk pattern
 * Format: Round / HomeTeam / Score / GuestTeam / Date / Time
 */
function parseHlcanaPattern(doc: Document): ScrapedGame[] {
  const games: ScrapedGame[] = [];
  
  // Get all text content
  const bodyText = doc.body.textContent || '';
  const lines = bodyText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 3 && l !== 'Detail zápasu');
  
  // Find games (pattern: round, home, score, guest, date, time)
  for (let i = 0; i < lines.length - 5; i++) {
    const line = lines[i];
    
    // Check if line is "X. kolo" (round)
    if (line.match(/^\d+\.\s*kolo$/i)) {
      const round = line;
      const homeTeam = lines[i + 1];
      const separator = lines[i + 2];
      const guestTeam = lines[i + 3];
      const dateLine = lines[i + 4];
      const timeLine = lines[i + 5];
      
      // Validate date/time format
      const date = dateLine.replace(/\s*-\s*$/, '').trim();
      const time = timeLine.trim();
      
      if (date.match(/^\d{2}\.\d{2}\.\d{4}$/) && time.match(/^\d{2}:\d{2}$/)) {
        // Remove last 3 chars (abbreviations) from team names
        const cleanHomeTeam = homeTeam.length > 3 ? homeTeam.slice(0, -3).trim() : homeTeam;
        const cleanGuestTeam = guestTeam.length > 3 ? guestTeam.slice(0, -3).trim() : guestTeam;
        
        // Extract result if game played
        let result: string | undefined = undefined;
        const scoreMatch = separator.match(/^(\d+)\s*:\s*(\d+)$/);
        if (scoreMatch) {
          result = `${scoreMatch[1]}:${scoreMatch[2]}`;
        }
        
        games.push({
          externalId: `hlcana-${date}-${time}-${i}`.replace(/[\s:.]/g, '-'),
          round,
          homeTeam: cleanHomeTeam,
          guestTeam: cleanGuestTeam,
          date,
          time,
          result,
          type: 'game'
        });
        
        i += 5; // Skip ahead
      }
    }
  }
  
  return games;
}

/**
 * Parse table-based format
 * Common in many league websites
 */
function parseTableFormat(doc: Document): ScrapedGame[] {
  const games: ScrapedGame[] = [];
  
  // Find all tables
  const tables = doc.querySelectorAll('table');
  
  tables.forEach((table, tableIndex) => {
    const rows = table.querySelectorAll('tr');
    
    rows.forEach((row, rowIndex) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length < 3) return; // Need at least date, teams, time
      
      const cellsText = Array.from(cells).map(c => c.textContent?.trim() || '');
      
      // Try to identify date, teams, and score
      let date = '';
      let time = '';
      let homeTeam = '';
      let guestTeam = '';
      let result: string | undefined = undefined;
      
      for (const text of cellsText) {
        // Date pattern (DD.MM.YYYY or YYYY-MM-DD)
        if (text.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
          date = text;
        } else if (text.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // Convert YYYY-MM-DD to DD.MM.YYYY
          const [year, month, day] = text.split('-');
          date = `${day}.${month}.${year}`;
        }
        
        // Time pattern (HH:MM)
        if (text.match(/^\d{2}:\d{2}$/)) {
          time = text;
        }
        
        // Score pattern
        if (text.match(/^\d+\s*:\s*\d+$/)) {
          result = text.replace(/\s/g, '');
        }
        
        // Team vs Team pattern
        const vsMatch = text.match(/^(.+?)\s*(?:vs\.?|–|-)\s*(.+)$/i);
        if (vsMatch) {
          homeTeam = vsMatch[1].trim();
          guestTeam = vsMatch[2].trim();
        }
      }
      
      // If we found valid data, add game
      if (date && (homeTeam || guestTeam)) {
        games.push({
          externalId: `table-${tableIndex}-${rowIndex}`,
          homeTeam: homeTeam || 'Unknown',
          guestTeam: guestTeam || 'Unknown',
          date,
          time: time || '00:00',
          result,
          type: 'game'
        });
      }
    });
  });
  
  return games;
}

/**
 * Parse generic format
 * Fallback for unstructured HTML
 */
function parseGenericFormat(doc: Document): ScrapedGame[] {
  const games: ScrapedGame[] = [];
  
  // Look for date patterns in entire document
  const bodyText = doc.body.textContent || '';
  const datePattern = /(\d{2}\.\d{2}\.\d{4})/g;
  const timePattern = /(\d{2}:\d{2})/g;
  
  const dates = bodyText.match(datePattern) || [];
  const times = bodyText.match(timePattern) || [];
  
  // Simple heuristic: pair dates with times
  const minLength = Math.min(dates.length, times.length);
  
  for (let i = 0; i < minLength; i++) {
    games.push({
      externalId: `generic-${i}`,
      homeTeam: 'Team 1', // Placeholder
      guestTeam: 'Team 2', // Placeholder
      date: dates[i],
      time: times[i],
      type: 'game'
    });
  }
  
  return games;
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


