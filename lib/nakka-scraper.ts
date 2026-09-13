import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import type { Page } from "playwright-core";
import type {
  NakkaMatchScrapedDTO,
  NakkaMatchPlayerResultScrapedDTO,
  NakkaPlayerStatsDTO,
  NakkaTournamentStatsDTO,
} from "./types.js";
import { NAKKA_BASE_URL } from "./constants.js";
import { extractMatchIdentifierComponents } from "./match-identifier.js";
import { fetchTournamentDateFromHistoryApi } from "./nakka-api-tournaments.js";

export { scrapeTournamentsByKeyword } from "./nakka-api-tournaments.js";
export { scrapeLeaguesByKeyword } from "./nakka-api-leagues.js";
export { scrapeTournamentMatches } from "./nakka-api-matches.js";

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

/**
 * Extracts match identifier components
 */
/**
 * Scrapes player results from a match page
 */
export async function scrapeMatchPlayerResults(
  matchHref: string,
  nakkaMatchIdentifier: string,
  firstPlayerCode: string,
  secondPlayerCode: string,
  retryCount = 0,
  maxRetries = 3
): Promise<NakkaMatchPlayerResultScrapedDTO[]> {
  console.log(`Scraping player results from: ${matchHref} (attempt ${retryCount + 1}/${maxRetries + 1})`);

  const components = extractMatchIdentifierComponents(nakkaMatchIdentifier);
  if (!components) {
    throw new Error(`Failed to parse match identifier: ${nakkaMatchIdentifier}`);
  }

  // Detect if running on Vercel/Lambda or local
  const isProduction = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

  let browser;
  if (isProduction) {
    // Use @sparticuz/chromium for serverless environments
    const executablePath = await chromiumPkg.executablePath();
    console.log("Executable path:", executablePath);
    browser = await chromium.launch({
      args: [
        ...chromiumPkg.args,
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--no-zygote",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-blink-features=AutomationControlled",
        // Memory saving flags
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-component-extensions-with-background-pages",
        "--disable-features=TranslateUI,BlinkGenPropertyTrees",
        "--disable-ipc-flooding-protection",
        "--disable-renderer-backgrounding",
        "--enable-features=NetworkService,NetworkServiceInProcess",
        "--force-color-profile=srgb",
        "--hide-scrollbars",
        "--mute-audio",
        "--disable-accelerated-2d-canvas",
        "--disable-canvas-aa",
        "--disable-2d-canvas-clip-aa",
        // Aggressive memory limits for serverless
        "--js-flags=--max-old-space-size=512",
        "--max_old_space_size=512",
      ],
      executablePath,
      headless: true,
      timeout: 30000,
    });
  } else {
    // Use local Chromium for development
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
      ],
    });
  }

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1024, height: 768 }, // Standard viewport size to keep elements in view
      javaScriptEnabled: true, // Ensure JS is enabled for the stats iframe
    });

    const page = await context.newPage();
    
    // Disable caching to save memory
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache',
      'Accept-Encoding': 'gzip', // Reduce bandwidth/memory
    });
    
    // Aggressive resource blocking to minimize memory usage
    await page.route("**/*", (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      
      // Block everything except essential resources
      if (["image", "font", "media", "stylesheet", "websocket", "manifest", "other"].includes(resourceType)) {
        route.abort();
      } else if (resourceType === "script" && !url.includes("n01")) {
        // Block third-party scripts (analytics, ads, etc.) to save memory
        route.abort();
      } else {
        route.continue();
      }
    });
    
    await page.goto(matchHref, { waitUntil: "domcontentloaded", timeout: 45000 });
    
    // Check if page is still alive immediately
    if (page.isClosed()) {
      throw new Error("ERR_INSUFFICIENT_RESOURCES: Page closed immediately after navigation - Lambda out of memory");
    }
    
    // Skip network idle check - it wastes time and memory in serverless
    // Just wait a tiny bit for DOM to settle
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for Cloudflare with shorter timeout
    const cloudflareChallenge = await page
      .$("title")
      .then((el) => el?.textContent())
      .catch(() => null);
    if (
      cloudflareChallenge?.includes("Just a moment") ||
      cloudflareChallenge?.includes("Cloudflare")
    ) {
      console.log("Cloudflare challenge detected, waiting for bypass...");
      await page.waitForSelector("article", { timeout: 15000 }).catch(() => {
        console.log("Cloudflare bypass may have failed");
      });
    }

    // Wait for essential elements with shorter, safer timeouts
    await page.waitForSelector("article", { timeout: 12000 });
    
    if (page.isClosed()) {
      throw new Error("Page was closed while waiting for article");
    }
    
    await page.waitForSelector("#menu_stats", { timeout: 12000, state: "visible" });
    await page.click("#menu_stats", { force: true });
    
    // Brief wait for UI update
    await new Promise(resolve => setTimeout(resolve, 500));

    if (page.isClosed()) {
      throw new Error("Page was closed after clicking stats");
    }

    await page.waitForSelector("#stats_frame", { timeout: 12000 });
    const statsFrame = page.frameLocator("#stats_frame");
    await statsFrame.locator(".stats_table").waitFor({ timeout: 12000 });

    if (page.isClosed()) {
      throw new Error("Page was closed while waiting for stats frame");
    }

    await page.waitForFunction(new Function(`
      const iframe = document.querySelector("#stats_frame");
      if (!iframe || !iframe.contentDocument) return false;
      const p1Legs = iframe.contentDocument.querySelector("#p1_legs");
      return p1Legs && p1Legs.textContent && p1Legs.textContent.trim() !== "";
    `) as any, { timeout: 12000 });

    console.log("Stats loaded, extracting data...");

    // Get player names - use Function constructor to avoid TypeScript transpilation
    const playerNames = await page.evaluate(new Function(`
      const iframe = document.querySelector("#stats_frame");
      if (!iframe || !iframe.contentDocument) return [];
      const nameTexts = iframe.contentDocument.querySelectorAll(".name_text");
      const result = [];
      for (let i = 0; i < nameTexts.length; i++) {
        const el = nameTexts[i];
        const text = el.textContent;
        result.push(text ? text.trim() : "");
      }
      return result;
    `) as any);

    if (playerNames.length !== 2) {
      throw new Error(`Expected 2 player names, found ${playerNames.length}`);
    }

    // Get statistics - use Function constructor to avoid TypeScript transpilation
    const stats = await page.evaluate(new Function(`
      const iframe = document.querySelector("#stats_frame");
      if (!iframe || !iframe.contentDocument) return {};
      const doc = iframe.contentDocument;
      
      const getValue = (selector) => {
        const el = doc.querySelector(selector);
        if (!el || !el.textContent) return "";
        return el.textContent.trim();
      };

      return {
        p1_legs: getValue("#p1_legs"),
        p1_score: getValue("#p1_score"),
        p1_first9: getValue("#p1_first9"),
        p1_60: getValue("#p1_60"),
        p1_80: getValue("#p1_80"),
        p1_ton00: getValue("#p1_ton00"),
        p1_ton20: getValue("#p1_ton20"),
        p1_ton40: getValue("#p1_ton40"),
        p1_ton70: getValue("#p1_ton70"),
        p1_ton80: getValue("#p1_ton80"),
        p1_highout: getValue("#p1_highout"),
        p1_best: getValue("#p1_best"),
        p1_worst: getValue("#p1_worst"),
        p1_checkout: getValue(".detail.checkout .left"),
        p2_legs: getValue("#p2_legs"),
        p2_score: getValue("#p2_score"),
        p2_first9: getValue("#p2_first9"),
        p2_60: getValue("#p2_60"),
        p2_80: getValue("#p2_80"),
        p2_ton00: getValue("#p2_ton00"),
        p2_ton20: getValue("#p2_ton20"),
        p2_ton40: getValue("#p2_ton40"),
        p2_ton70: getValue("#p2_ton70"),
        p2_ton80: getValue("#p2_ton80"),
        p2_highout: getValue("#p2_highout"),
        p2_best: getValue("#p2_best"),
        p2_worst: getValue("#p2_worst"),
        p2_checkout: getValue(".detail.checkout .right"),
      };
    `) as any);

    const results: NakkaMatchPlayerResultScrapedDTO[] = [];

    const parseCheckout = (text: string): number | null => {
      if (!text) return null;
      const match = text.match(/^([\d.]+)%/);
      if (!match) return null;
      const parsed = parseFloat(match[1]);
      return isNaN(parsed) ? null : parsed;
    };

    for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
      const playerCode = playerIndex === 0 ? firstPlayerCode : secondPlayerCode;
      const nakkaMatchPlayerIdentifier = `${components.tournamentId}_${components.matchType}_${components.round}_${playerCode}`;

      const prefix = playerIndex === 0 ? "p1_" : "p2_";
      const opponentPrefix = playerIndex === 0 ? "p2_" : "p1_";

      const playerScore = parseIntValue(stats[`${prefix}legs`]);
      const opponentScore = parseIntValue(stats[`${opponentPrefix}legs`]);

      const score60 = parseIntValue(stats[`${prefix}60`]);
      const score80 = parseIntValue(stats[`${prefix}80`]);
      const score_60_count = score60 + score80;

      const ton00 = parseIntValue(stats[`${prefix}ton00`]);
      const ton20 = parseIntValue(stats[`${prefix}ton20`]);
      const score_100_count = ton00 + ton20;

      const ton40 = parseIntValue(stats[`${prefix}ton40`]);
      const ton70 = parseIntValue(stats[`${prefix}ton70`]);
      const score_140_count = ton40 + ton70;

      results.push({
        nakka_match_player_identifier: nakkaMatchPlayerIdentifier,
        average_score: parseNumericValue(stats[`${prefix}score`]),
        first_nine_avg: parseNumericValue(stats[`${prefix}first9`]),
        checkout_percentage: parseCheckout(stats[`${prefix}checkout`] || ""),
        score_60_count,
        score_100_count,
        score_140_count,
        score_180_count: parseIntValue(stats[`${prefix}ton80`]),
        high_finish: parseIntValue(stats[`${prefix}highout`]),
        best_leg: parseIntValue(stats[`${prefix}best`]),
        worst_leg: parseIntValue(stats[`${prefix}worst`]),
        player_score: playerScore,
        opponent_score: opponentScore,
      });
    }

    console.log(`Successfully scraped results for ${results.length} players`);
    return results;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Close browser before retry
    try {
      await browser.close();
    } catch (e) {
      console.log("Browser already closed");
    }
    
    // If page closed during navigation, it's a resource issue - DON'T retry
    const isNavigationClosure = errorMessage.includes("Page closed immediately after navigation") ||
                                errorMessage.includes("closed during navigation");
    
    if (isNavigationClosure) {
      console.error("Lambda out of memory - page closed during navigation. This requires Vercel Pro or alternative hosting.");
      throw error;
    }
    
    // Only retry for transient errors that might succeed on retry
    const isTimeoutError = errorMessage.includes("Timeout") || errorMessage.includes("timeout");
    const isClosedAfterLoad = errorMessage.includes("closed while waiting") || 
                              errorMessage.includes("closed after clicking");
    
    if ((isTimeoutError || isClosedAfterLoad) && retryCount < maxRetries) {
      const delayMs = Math.pow(2, retryCount) * 1000;
      console.warn(`Transient error detected: ${errorMessage.substring(0, 100)}. Retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return scrapeMatchPlayerResults(matchHref, nakkaMatchIdentifier, firstPlayerCode, secondPlayerCode, retryCount + 1, maxRetries);
    }

    console.error("Error scraping match player results:", error);
    throw error;
  } finally {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }
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

interface NakkaApiPlayerStats {
  score: number;
  darts: number;
  winLeg: number;
  leg: number;
  winMatch: number;
  match: number;
  ton00: number;
  ton40: number;
  ton70: number;
  ton80: number;
  highOut: number;
  best: number;
  f9Score: number;
  f9Darts: number;
  rank: number;
  rank_d?: number;
  [key: string]: unknown;
}

export async function scrapeTournamentStats(tournamentId: string): Promise<NakkaTournamentStatsDTO> {
  const url = `https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_stats_t.php?cmd=stats_list&tdid=${tournamentId}`;

  console.log(`[scrapeTournamentStats] Fetching stats for tournament: ${tournamentId}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch tournament stats: ${response.status} ${response.statusText}`);
  }

  const raw = (await response.json()) as Record<string, NakkaApiPlayerStats>;

  const round2 = (value: number): number => Math.round(value * 100) / 100;

  const players_stats: NakkaPlayerStatsDTO[] = Object.entries(raw).map(([playerId, s]) => ({
    player_id: playerId,
    rank: s.rank === 0 && s.rank_d ? s.rank_d : s.rank,
    score_100_count: s.ton00,
    score_140_count: s.ton40,
    score_170_count: s.ton70,
    score_180_count: s.ton80,
    high_finish: s.highOut,
    best_leg: s.best,
    average_score: s.darts > 0 ? round2(s.score / (s.darts / 3)) : 0,
    first_nine_avg: s.f9Darts > 0 ? round2(s.f9Score / (s.f9Darts / 3)) : 0,
    win_rate: s.match > 0 ? round2((s.winMatch * 100) / s.match) : 0,
    leg_rate: s.leg > 0 ? round2((s.winLeg * 100) / s.leg) : 0,
    matches_count: s.match,
    legs_count: s.leg,
  }));

  console.log(`[scrapeTournamentStats] Processed ${players_stats.length} player(s) for tournament ${tournamentId}`);

  return {
    tournament_id: tournamentId,
    players_stats,
  };
}
