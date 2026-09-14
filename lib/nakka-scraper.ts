import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import type { Page } from "playwright-core";
import type { NakkaMatchScrapedDTO } from "./types.js";
import { NAKKA_BASE_URL } from "./constants.js";
import { extractMatchIdentifierComponents } from "./match-identifier.js";
import { fetchTournamentDateFromHistoryApi } from "./nakka-api-tournaments.js";

export { scrapeTournamentsByKeyword } from "./nakka-api-tournaments.js";
export { scrapeLeaguesByKeyword } from "./nakka-api-leagues.js";
export { scrapeTournamentMatches } from "./nakka-api-matches.js";
export { scrapeTournamentStats } from "./nakka-api-stats.js";

interface NakkaApiMatchHistory {
  tmid: string;
  startTime: number;
  tpid: string;
  vstpid: string;
  p1tpid: string;
  p2tpid: string;
  p1name: string;
  p2name: string;
  round: string;
  ttype: string;
  title: string;
  subtitle?: string;
}

/**
 * Scrapes tournament date from the Results tab by finding the first match date
 */
async function scrapeTournamentDateFromResults(
  tournamentId: string,
  existingPage: Page
): Promise<Date | null> {
  try {
    const parsedDate = await fetchTournamentDateFromHistoryApi(tournamentId);
    if (parsedDate) {
      return parsedDate;
    }
  } catch (apiError) {
    console.log('API call failed:', apiError);
  }
  
  // Navigate directly to the Results tab using URL parameter
  const historyUrl = `${NAKKA_BASE_URL}/comp.php?id=${tournamentId}&tab=history`;
  
  try {
    console.log(`Navigating to Results tab: ${historyUrl}`);
    
    // Track network requests to find the API endpoint
    const apiRequests: string[] = [];
    existingPage.on("request", (request) => {
      const url = request.url();
      if (url.includes('.php') && (url.includes(tournamentId) || url.includes('history') || url.includes('match'))) {
        apiRequests.push(url);
        console.log('API request:', url);
      }
    });
    
    // Try with increased wait and multiple checks
    await existingPage.goto(historyUrl, { 
      waitUntil: "networkidle",
      timeout: 45000 
    });
    
    console.log('Page loaded, API requests captured:', apiRequests.length);
    
    // Wait longer for dynamic content
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Try to get the page HTML and look for match data directly
    const pageContent = await existingPage.content();
    
    // Look for date patterns in the raw HTML
    let dateMatches = pageContent.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/g);
    
    if (dateMatches && dateMatches.length > 0) {
      console.log(`Found ${dateMatches.length} dates in page HTML`);
      const firstDateStr = dateMatches[0];
      const dateMatch = firstDateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10) - 1;
        const year = parseInt(dateMatch[3], 10);
        const parsedDate = new Date(year, month, day);
        
        if (!isNaN(parsedDate.getTime())) {
          console.log(`Scraped date ${parsedDate.toISOString()} from page HTML for tournament ${tournamentId}`);
          return parsedDate;
        }
      }
    }
    
    // If no dates in slash format, try dot format (DD.MM.YYYY)
    if (!dateMatches) {
      dateMatches = pageContent.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/g);
      
      if (dateMatches && dateMatches.length > 0) {
        console.log(`Found ${dateMatches.length} dates (dot format) in page HTML`);
        const firstDateStr = dateMatches[0];
        const dateMatch = firstDateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        
        if (dateMatch) {
          const day = parseInt(dateMatch[1], 10);
          const month = parseInt(dateMatch[2], 10) - 1;
          const year = parseInt(dateMatch[3], 10);
          const parsedDate = new Date(year, month, day);
          
          if (!isNaN(parsedDate.getTime())) {
            console.log(`Scraped date ${parsedDate.toISOString()} from page HTML (dot format) for tournament ${tournamentId}`);
            return parsedDate;
          }
        }
      }
    }
    
    console.log('No date patterns found in HTML, match results may be loaded dynamically');

    
    // Wait for the match list elements with actual date content to appear
    try {
      console.log('Waiting for match results content to load...');
      await existingPage.waitForFunction(
        () => {
          const elements = document.querySelectorAll('div, span, td');
          for (let i = 0; i < elements.length; i++) {
            const text = elements[i].textContent?.trim();
            // Look for date pattern DD/MM/YYYY HH:MM:SS
            if (text && text.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/)) {
              return true;
            }
          }
          return false;
        },
        { timeout: 10000 }
      );
      console.log('Match list content populated');
    } catch (waitError) {
      console.log('Match list content did not populate, tournament may not have results recorded yet');
    }
    
    // Extract date from the first match in the Results tab
    const matchInfo = await existingPage.evaluate(() => {
      // Try multiple selectors for different tournament page structures
      let matchTitleElements = document.querySelectorAll('.match_list_title_td');
      
      if (matchTitleElements.length === 0) {
        // Try alternative selector for different page structure
        matchTitleElements = document.querySelectorAll('.m_match_title');
      }
      
      // Also try searching for any element with date-like text content
      if (matchTitleElements.length === 0 || !matchTitleElements[0]?.textContent?.trim()) {
        // Try broader search - look for any element containing date patterns
        const allDivs = document.querySelectorAll('div, span, td');
        for (let i = 0; i < allDivs.length; i++) {
          const element = allDivs[i];
          const text = element.textContent?.trim();
          if (text && text.match(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/)) {
            // Found an element with a date in it
            matchTitleElements = [element] as any;
            break;
          }
        }
      }
      
      // Debug: return info about what we found
      const elementsFound = matchTitleElements.length;
      const allTextRaw = Array.from(matchTitleElements).slice(0, 3).map(el => ({
        text: el.textContent?.trim()?.substring(0, 150),
        innerHTML: el.innerHTML?.substring(0, 100),
        className: el.className
      }));
      
      // Get the first match element
      if (matchTitleElements.length > 0) {
        const firstElement = matchTitleElements[0];
        const text = firstElement.textContent?.trim();
        
        if (text) {
          // Match format 1: "DD.MM.YYYY HH:MM:SS - Tournament Name"
          // Match format 2: "DD/MM/YYYY HH:MM:SS - Tournament Name" (slash format)
          // Match format 3: Just "DD.MM.YYYY" or "DD/MM/YYYY"
          let dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
          if (!dateMatch) {
            dateMatch = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          }
          
          if (dateMatch) {
            return { found: true, text, elementsCount: elementsFound };
          }
        }
      }
      
      return { found: false, elementsCount: elementsFound, sampleElements: allTextRaw };
    });
    
    console.log(`Match elements info:`, JSON.stringify(matchInfo, null, 2));
    
    if (matchInfo.found && matchInfo.text) {
      // Parse the date string - support both . and / separators
      let dateMatch = matchInfo.text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (!dateMatch) {
        dateMatch = matchInfo.text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      }
      
      if (dateMatch) {
        const day = parseInt(dateMatch[1], 10);
        const month = parseInt(dateMatch[2], 10) - 1; // JS months are 0-indexed
        const year = parseInt(dateMatch[3], 10);
        const parsedDate = new Date(year, month, day);
        
        if (!isNaN(parsedDate.getTime())) {
          console.log(`Scraped date ${parsedDate.toISOString()} from first match in Results tab for tournament ${tournamentId}`);
          return parsedDate;
        }
      }
    }
    
    // Fallback: If no match results found, try to get date from page title
    console.log('No match results found, trying page title...');
    const titleDate = await existingPage.evaluate(() => {
      const title = document.title;
      // Match DD.MM.YYYY format in title
      const dateMatch = title.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (dateMatch) {
        return {
          found: true,
          day: dateMatch[1],
          month: dateMatch[2],
          year: dateMatch[3]
        };
      }
      return { found: false };
    });
    
    if (titleDate.found) {
      const day = parseInt(titleDate.day, 10);
      const month = parseInt(titleDate.month, 10) - 1;
      const year = parseInt(titleDate.year, 10);
      const parsedDate = new Date(year, month, day);
      
      if (!isNaN(parsedDate.getTime())) {
        console.log(`Scraped date ${parsedDate.toISOString()} from page title for tournament ${tournamentId}`);
        return parsedDate;
      }
    }
    
    console.warn(`No valid date found in Results tab or page title for tournament ${tournamentId}`);
    return null;
  } catch (error) {
    console.error(`Error scraping date from Results tab for tournament ${tournamentId}:`, error);
    return null;
  }
}

/**
 * Fetches match dates from the History API for a tournament
 * Returns a map of match identifier to match date
 */
async function fetchMatchDatesFromHistoryApi(
  tournamentId: string,
  page: Page
): Promise<Map<string, Date>> {
  const matchDateMap = new Map<string, Date>();
  
  try {
    console.log(`Fetching match dates from History API for tournament ${tournamentId}`);
    
    let skip = 0;
    const batchSize = 100;
    let hasMore = true;
    let totalFetched = 0;
    const maxIterations = 20; // Safety limit: max 2000 matches (20 * 100)
    let iterations = 0;
    
    // Paginate through all matches
    while (hasMore && iterations < maxIterations) {
      iterations++;
      const historyApiUrl = `https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_history.php?cmd=get_t_list&tdid=${tournamentId}&skip=${skip}&count=${batchSize}&name=`;
      
      const apiResponse = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url);
          const data = await res.json();
          return { success: true, data };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      }, historyApiUrl);
      
      if (apiResponse.success && apiResponse.data?.list && Array.isArray(apiResponse.data.list)) {
        const matches = apiResponse.data.list;
        console.log(`Batch ${iterations}: Received ${matches.length} matches from History API (skip: ${skip}, total so far: ${totalFetched + matches.length})`);
        totalFetched += matches.length;
        
        for (const match of matches) {
          if (match.startTime && match.startTime > 0 && match.tmid) {
            const matchDate = new Date(match.startTime * 1000);
            
            // The API provides the full match identifier in tmid field
            // We need to convert it to match our scraped format:
            // API format: "t_Z2rJ_4495_t_3_NN2M_hJvk"
            // Our format: "t_Z2rJ_4495_t_3_hJvk_NN2M" (sorted player codes)
            
            const parts = match.tmid.split('_');
            if (parts.length >= 5) {
              const tournamentPart = parts.slice(0, 3).join('_'); // e.g., "t_Z2rJ_4495"
              const matchType = parts[3]; // e.g., "t" or "rr"
              const round = parts[4]; // e.g., "3"
              const player1 = parts[parts.length - 2];
              const player2 = parts[parts.length - 1];
              
              // Sort player codes to match our scraping format
              const [firstCode, secondCode] = [player1, player2].sort();
              const identifier = `${tournamentPart}_${matchType}_${round}_${firstCode}_${secondCode}`;
              
              matchDateMap.set(identifier, matchDate);
            }
          }
        }
        
        // Check if we should fetch more
        if (matches.length < batchSize) {
          hasMore = false;
          console.log(`Last batch received (${matches.length} < ${batchSize}), stopping pagination`);
        } else {
          skip += batchSize;
        }
      } else {
        console.log('No match data received from History API');
        hasMore = false;
      }
    }
    
    if (iterations >= maxIterations) {
      console.warn(`âš ï¸  Reached maximum iteration limit (${maxIterations} batches). Some matches may not have dates.`);
    }
    
    console.log(`âœ… Fetched ${totalFetched} total matches from API, mapped dates for ${matchDateMap.size} matches`);
  } catch (error) {
    console.error('Error fetching match dates from History API:', error);
  }
  
  return matchDateMap;
}

/**
 * Helper function to safely parse numeric value
 */
function parseNumericValue(text: string | null | undefined): number | null {
  if (!text) return null;
  const cleaned = text.trim().replace(/,/g, ".");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Helper function to safely parse integer value
 */
function parseIntValue(text: string | null | undefined): number {
  if (!text) return 0;
  const cleaned = text.trim();
  const parsed = parseInt(cleaned, 10);
  return isNaN(parsed) ? 0 : parsed;
}

// ============================================================================
// LEAGUE SCRAPING FUNCTIONS
// ============================================================================

/**
 * Fetches matches from a league event/season using the History API
 * League events use the same tournament history API endpoint
 */
async function scrapeLeagueEventMatches(
  eventId: string,
  page: Page
): Promise<NakkaMatchScrapedDTO[]> {
  try {
    console.log(`Fetching matches from league event: ${eventId}`);
    
    const matches: NakkaMatchScrapedDTO[] = [];
    let skip = 0;
    const batchSize = 100;
    let hasMore = true;
    let totalFetched = 0;
    const maxIterations = 20;
    let iterations = 0;
    
    // Use the TOURNAMENT History API - league events use the same API structure
    while (hasMore && iterations < maxIterations) {
      iterations++;
      const historyApiUrl = `https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_history.php?cmd=get_t_list&tdid=${eventId}&skip=${skip}&count=${batchSize}&name=`;
      
      console.log(`[League Event ${eventId}] Fetching batch ${iterations} from: ${historyApiUrl}`);
      
      const apiResponse = await page.evaluate(async (url) => {
        try {
          const res = await fetch(url);
          const data = await res.json();
          return { success: true, data };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      }, historyApiUrl);
      
      if (apiResponse.success && apiResponse.data?.list && Array.isArray(apiResponse.data.list)) {
        const matchesData = apiResponse.data.list as NakkaApiMatchHistory[];
        console.log(`Batch ${iterations}: Received ${matchesData.length} matches from event ${eventId} (skip: ${skip})`);
        totalFetched += matchesData.length;
        
        for (const match of matchesData) {
          if (match.tmid && match.p1tpid && match.p2tpid) {
            let matchDate: Date | null = null;
            if (match.startTime && match.startTime > 0) {
              matchDate = new Date(match.startTime * 1000);
            }
            
            // Use league view URL for league matches
            const href = `https://n01darts.com/n01/league/n01_view.html?tmid=${match.tmid}`;
            
            matches.push({
              nakka_match_identifier: match.tmid,
              match_type: match.title || "league",
              first_player_name: match.p1name || "Unknown",
              first_player_code: match.p1tpid,
              second_player_name: match.p2name || "Unknown",
              second_player_code: match.p2tpid,
              href,
              match_date: matchDate,
            });
          }
        }
        
        if (matchesData.length < batchSize) {
          hasMore = false;
          console.log(`Last batch received for event ${eventId} (${matchesData.length} < ${batchSize})`);
        } else {
          skip += batchSize;
        }
      } else {
        console.log(`No match data received from History API for event ${eventId}`);
        hasMore = false;
      }
    }
    
    if (iterations >= maxIterations) {
      console.warn(`âš ï¸  Reached maximum iteration limit for event ${eventId}`);
    }
    
    console.log(`âœ… Total matches fetched from event ${eventId}: ${matches.length}`);
    return matches;
  } catch (error) {
    console.error(`Error fetching matches from event ${eventId}:`, error);
    return [];
  }
}
