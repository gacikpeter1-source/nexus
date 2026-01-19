# 🚧 Phase 8: League Schedule Scraper - IN PROGRESS

**Status**: Core scraper service implemented, UI components needed  
**Complexity**: HIGH - HTML parsing, CORS handling, multiple formats

---

## ✅ Completed So Far

### 1. **League Scraper Service** (src/services/leagueScraper.ts)

**Functions Implemented** (5+ functions):
- `scrapeLeagueSchedule()` - Main scraping function with 3 parsing strategies
- `parseHlcanaPattern()` - Parses hlcana.sk format (Slovak league)
- `parseTableFormat()` - Parses HTML table-based schedules
- `parseGenericFormat()` - Fallback parser for any format
- `filterGamesByTeam()` - Filter games by team name
- `convertToISODate()` - Date format conversion
- `getHomeOrAway()` - Detect home/away games

**Features**:
- ✅ Multi-format HTML parsing (3 strategies)
- ✅ CORS proxy support for development
- ✅ Error handling (CORS, 404, timeout)
- ✅ Browser-based parsing (DOMParser)
- ✅ Team filtering
- ✅ Score extraction
- ✅ Round detection

### 2. **Dependencies Installed**
- ✅ axios (HTTP requests)
- ✅ cheerio (server-side HTML parsing)

---

## 🔜 Still Needed

### UI Components (Estimated: 2-3 hours)

1. **League Schedule Page** (`src/pages/LeagueSchedule.tsx`)
   - Configure scraper per team
   - Test URL and preview games
   - Sync games to calendar
   - View synced games
   - Rescrape for updates

2. **Scraper Config Modal** (`src/components/league/ScraperConfigModal.tsx`)
   - URL input
   - Team identifier input
   - Test scraper button
   - Preview results
   - Save configuration

3. **Game Preview Modal** (`src/components/league/GamePreviewModal.tsx`)
   - Show scraped games
   - Select games to sync
   - Filter by team
   - Confirm sync

4. **Synced Games List** (`src/components/league/SyncedGamesList.tsx`)
   - Display league schedule
   - Show results
   - Update scores
   - Link to calendar events

### Firebase Integration

5. **League Schedule Collection**
   - Store synced games
   - Track external IDs
   - Link to calendar events
   - Store scraper configs in club documents

### Translations
- Add league scraper keys (EN + SK)
- Error messages
- UI labels

---

## 🎯 How It Will Work

### User Flow:

1. **Club Owner/Trainer** goes to Team Settings
2. Clicks **"Configure League Scraper"**
3. Enters:
   - League website URL (e.g., hlcana.sk/zapasy)
   - Team identifier (e.g., "HK Myslava")
4. Clicks **"Test Scraper"**
5. System fetches HTML and shows **preview of games**
6. User selects which games to sync
7. Clicks **"Sync Games"**
8. System creates:
   - League schedule entries (leagueSchedule collection)
   - Calendar events (events collection)
9. Games appear in team calendar
10. Can **rescrape weekly** to update scores

---

## ⚠️ Important Notes

### CORS Issues

**Problem**: Browsers block cross-origin requests  
**Solution Options**:

1. **Development**: Use CORS proxy
   ```typescript
   scrapeLeagueSchedule(url, 'https://cors-anywhere.herokuapp.com/')
   ```

2. **Production**: Use Firebase Cloud Functions
   ```javascript
   // functions/index.js
   exports.scrapeLeagueSchedule = functions.https.onCall(async (data) => {
     const response = await axios.get(data.url);
     return parseGames(response.data);
   });
   ```

3. **Best**: League provides API (no scraping needed)

### Supported Formats

Currently supports:
- ✅ hlcana.sk (Slovak hockey league)
- ✅ HTML tables (common format)
- ✅ Generic date/time patterns

Can be extended for:
- Other league websites
- Different sports
- Various HTML structures

---

## 📊 Next Steps

1. Create LeagueSchedule page
2. Create ScraperConfig modal
3. Create GamePreview modal
4. Add translations
5. Update routes
6. Test with real league URLs
7. Deploy Firebase function (optional)

---

**Estimated Time Remaining**: 2-3 hours  
**Current Progress**: ~30%

---

## 💡 Quick Implementation Note

Due to complexity and CORS limitations, consider:

**Option A**: Complete full UI (2-3 hours more)
**Option B**: Skip to Phase 9 (File Uploads), return to scraper later
**Option C**: Implement basic manual game entry (simpler alternative)

Which would you prefer?


