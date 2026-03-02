import { chromium } from "playwright-core";
import chromiumPkg from "@sparticuz/chromium";
import type { Page } from "playwright-core";
import type {
  NakkaTournamentScrapedDTO,
  NakkaMatchScrapedDTO,
  NakkaMatchPlayerResultScrapedDTO,
} from "./types.js";
import { NAKKA_BASE_URL, NAKKA_STATUS_CODES } from "./constants.js";

interface NakkaApiTournament {
  tdid: string;
  title: string;
  status: number;
  t_date: number;
  createTime?: number;
}

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
    // First try: Call the history API directly to get match data
    const historyApiUrl = `https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_history.php?cmd=get_t_list&tdid=${tournamentId}&skip=0&count=1&name=`;
    
    console.log(`Fetching match history from API directly`);
    
    const apiResponse = await existingPage.evaluate(async (url) => {
      try {
        const res = await fetch(url);
        const data = await res.json();
        return { success: true, data, dataType: Array.isArray(data) ? 'array' : typeof data, length: Array.isArray(data) ? data.length : 0 };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }, historyApiUrl);
    
    console.log('API Response:', JSON.stringify(apiResponse, null, 2).substring(0, 500));
    
    if (apiResponse.success && apiResponse.data && apiResponse.data.list && Array.isArray(apiResponse.data.list) && apiResponse.data.list.length > 0) {
      console.log(`Received ${apiResponse.data.list.length} matches from history API`);
      
      // Look for the first match with a date
      for (const match of apiResponse.data.list) {
        if (match.startTime && match.startTime > 0) {
          // startTime is a Unix timestamp
          const matchDate = new Date(match.startTime * 1000);
          
          // Subtract 4 hours to account for finals being played later/next day
          matchDate.setHours(matchDate.getHours() - 4);
          
          // Strip time component - keep only the date at midnight UTC
          const parsedDate = new Date(Date.UTC(matchDate.getFullYear(), matchDate.getMonth(), matchDate.getDate(), 0, 0, 0, 0));
          
          if (!isNaN(parsedDate.getTime())) {
            console.log(`Scraped date ${parsedDate.toISOString()} from match history API for tournament ${tournamentId} (adjusted -4 hours, time stripped)`);
            return parsedDate;
          }
        }
      }
      
      console.log('Match data received but no valid dates found');
    } else {
      const hasList = apiResponse.data && apiResponse.data.list;
      const listLength = hasList && Array.isArray(apiResponse.data.list) ? apiResponse.data.list.length : 0;
      console.log(`No match data from history API (success: ${apiResponse.success}, hasList: ${!!hasList}, listLength: ${listLength})`);
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
      console.warn(`⚠️  Reached maximum iteration limit (${maxIterations} batches). Some matches may not have dates.`);
    }
    
    console.log(`✅ Fetched ${totalFetched} total matches from API, mapped dates for ${matchDateMap.size} matches`);
  } catch (error) {
    console.error('Error fetching match dates from History API:', error);
  }
  
  return matchDateMap;
}

/**
 * Scrapes tournaments from Nakka by keyword using Playwright with stealth
 */
export async function scrapeTournamentsByKeyword(
  keyword: string,
  retryCount = 0
): Promise<NakkaTournamentScrapedDTO[]> {
  const url = `${NAKKA_BASE_URL}/?keyword=${encodeURIComponent(keyword)}`;
  console.log("Launching Chromium browser...");
  console.log("Target URL:", url);

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
      viewport: { width: 800, height: 600 }, // Reduced viewport to save memory
      locale: "en-US",
      timezoneId: "Europe/Warsaw",
    });

    const page = await context.newPage();
    
    // Disable caching to save memory
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache',
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
    const allApiData: NakkaApiTournament[] = [];

    // Intercept API responses
    page.on("response", async (response) => {
      const responseUrl = response.url();
      if (
        responseUrl.includes("n01_tournament.php") &&
        responseUrl.includes("cmd=get_list")
      ) {
        try {
          const data = (await response.json()) as NakkaApiTournament[];
          if (data && Array.isArray(data)) {
            allApiData.push(...data);
          }
        } catch (error) {
          console.error("Failed to parse API response:", error);
        }
      }
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    // Wait for API response or network idle instead of arbitrary timeout
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch (e) {
      // If network doesn't go idle in 5 seconds, continue anyway
      console.log("Network didn't go idle, continuing...");
    }

    console.log(`Collected: ${allApiData.length} tournaments`);

    if (allApiData.length === 0) {
      console.error("No tournament data intercepted from API");
      return [];
    }

    const tournaments: NakkaTournamentScrapedDTO[] = [];
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);

    for (const item of allApiData) {
      let parsedDate: Date | null = null;
      
      // First, try to get date from API
      //if (item.t_date && item.t_date > 0) {
      //  parsedDate = new Date(item.t_date * 1000);
      //}
      
      // If no date from API and tournament is completed, scrape from Results tab
      if (!parsedDate && item.tdid && item.status === Number(NAKKA_STATUS_CODES.COMPLETED)) {
        console.log(`No API date for tournament ${item.tdid}, fetching from Results tab...`);
        try {
          parsedDate = await scrapeTournamentDateFromResults(item.tdid, page);
        } catch (error) {
          console.error(`Failed to scrape date for tournament ${item.tdid}:`, error);
          // Skip this tournament if we can't get a date
          continue;
        }
      }

      if (
        item.tdid &&
        item.status === Number(NAKKA_STATUS_CODES.COMPLETED) &&
        parsedDate &&
        parsedDate < now &&
        parsedDate >= sixMonthsAgo
      ) {
        const href = `${NAKKA_BASE_URL}/comp.php?id=${item.tdid}`;

        tournaments.push({
          nakka_identifier: item.tdid,
          tournament_name: item.title || "Unknown Tournament",
          href,
          tournament_date: parsedDate,
          status: "completed",
        });
      }
    }

    console.log(`Filtered to ${tournaments.length} completed tournaments`);
    return tournaments;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isResourceError = errorMessage.includes("ERR_INSUFFICIENT_RESOURCES") || 
                           errorMessage.includes("ERR_OUT_OF_MEMORY");
    
    if (isResourceError && retryCount < 2) {
      console.warn(`Memory error detected, retrying (${retryCount + 1}/2)...`);
      await browser.close().catch(() => {});
      // Wait a bit to let Lambda clean up
      await new Promise(resolve => setTimeout(resolve, 2000));
      return scrapeTournamentsByKeyword(keyword, retryCount + 1);
    }
    
    throw error;
  } finally {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Fetches matches from a tournament using the History API
 */
export async function scrapeTournamentMatches(
  tournamentHref: string,
  retryCount = 0
): Promise<NakkaMatchScrapedDTO[]> {
  console.log("Fetching matches from API for:", tournamentHref);

  const tournamentIdMatch = tournamentHref.match(/[?&]id=([^&]+)/);
  if (!tournamentIdMatch) {
    throw new Error(`Could not extract tournament ID from URL: ${tournamentHref}`);
  }
  const tournamentId = tournamentIdMatch[1];

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
    });

    const page = await context.newPage();
    
    console.log(`Fetching matches from History API for tournament ${tournamentId}`);
    
    const matches: NakkaMatchScrapedDTO[] = [];
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
        const matchesData = apiResponse.data.list as NakkaApiMatchHistory[];
        console.log(`Batch ${iterations}: Received ${matchesData.length} matches from History API (skip: ${skip}, total so far: ${totalFetched + matchesData.length})`);
        totalFetched += matchesData.length;
        
        for (const match of matchesData) {
          if (match.tmid && match.p1tpid && match.p2tpid) {
            // Parse match date from startTime
            let matchDate: Date | null = null;
            if (match.startTime && match.startTime > 0) {
              matchDate = new Date(match.startTime * 1000);
            }
            
            const href = `https://n01darts.com/n01/tournament/n01_view.html?tmid=${match.tmid}`;
            
            matches.push({
              nakka_match_identifier: match.tmid,
              match_type: match.title || "unknown",
              first_player_name: match.p1name || "Unknown",
              first_player_code: match.p1tpid,
              second_player_name: match.p2name || "Unknown",
              second_player_code: match.p2tpid,
              href,
              match_date: matchDate,
            });
          }
        }
        
        // Check if we should fetch more
        if (matchesData.length < batchSize) {
          hasMore = false;
          console.log(`Last batch received (${matchesData.length} < ${batchSize}), stopping pagination`);
        } else {
          skip += batchSize;
        }
      } else {
        console.log('No match data received from History API');
        hasMore = false;
      }
    }
    
    if (iterations >= maxIterations) {
      console.warn(`⚠️  Reached maximum iteration limit (${maxIterations} batches). Some matches may not be fetched.`);
    }
    
    const matchesWithDates = matches.filter(m => m.match_date).length;
    console.log(`✅ Total matches fetched: ${matches.length}`);
    console.log(`Matches with dates: ${matchesWithDates}/${matches.length}`);

    return matches;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isResourceError = errorMessage.includes("ERR_INSUFFICIENT_RESOURCES") || 
                           errorMessage.includes("ERR_OUT_OF_MEMORY");
    
    if (isResourceError && retryCount < 2) {
      console.warn(`Memory error detected, retrying (${retryCount + 1}/2)...`);
      await browser.close().catch(() => {});
      // Wait a bit to let Lambda clean up
      await new Promise(resolve => setTimeout(resolve, 2000));
      return scrapeTournamentMatches(tournamentHref, retryCount + 1);
    }
    
    throw error;
  } finally {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }
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
function extractMatchIdentifierComponents(nakkaMatchIdentifier: string): {
  tournamentId: string;
  matchType: string;
  round: string;
} | null {
  const parts = nakkaMatchIdentifier.split("_");

  if (parts.length < 5) {
    console.error(`Invalid match identifier format: ${nakkaMatchIdentifier}`);
    return null;
  }

  const tournamentId = parts.slice(0, 3).join("_");
  const matchType = parts[3];
  const round = parts[4];

  return {
    tournamentId,
    matchType,
    round
  };
}

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

interface NakkaApiLeague {
  lgid: string;
  title: string;
}

interface NakkaApiLeagueEvent {
  tdid: string;
  title: string;
  status: number;
}

/**
 * Fetches leagues from the Nakka League API by keyword
 */
async function fetchLeaguesByKeyword(
  keyword: string,
  page: Page
): Promise<NakkaApiLeague[]> {
  try {
    const { NAKKA_LEAGUE_API_URL } = await import("./constants.js");
    const leagueApiUrl = `${NAKKA_LEAGUE_API_URL}?cmd=get_list&skip=0&count=30&keyword=${encodeURIComponent(keyword)}`;
    console.log(`Fetching leagues from API: ${leagueApiUrl}`);
    
    const apiResponse = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url);
        const data = await res.json();
        return { success: true, data };
      } catch (error) {
        return { success: false, error: String(error) };
      }
    }, leagueApiUrl);
    
    if (apiResponse.success && Array.isArray(apiResponse.data)) {
      console.log(`Received ${apiResponse.data.length} leagues from API`);
      return apiResponse.data as NakkaApiLeague[];
    } else {
      console.log('No league data received from API');
      return [];
    }
  } catch (error) {
    console.error('Error fetching leagues from API:', error);
    return [];
  }
}

/**
 * Scrapes events from a league portal page
 */
async function scrapeLeaguePortalForEvents(
  lgid: string,
  page: Page
): Promise<NakkaApiLeagueEvent[]> {
  try {
    const { NAKKA_LEAGUE_BASE_URL } = await import("./constants.js");
    const portalUrl = `${NAKKA_LEAGUE_BASE_URL}/portal.php?lgid=${lgid}`;
    console.log(`Scraping league portal: ${portalUrl}`);
    
    await page.goto(portalUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    
    // Wait for API response or network idle
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch (e) {
      console.log("Network didn't go idle, continuing...");
    }
    
    // Try to extract event IDs from the page
    const events = await page.evaluate(() => {
      const eventItems: { tdid: string; title: string; status: number }[] = [];
      
      // Look for tournament items (td.tournament_item)
      const tournamentItems = document.querySelectorAll('td.tournament_item');
      
      if (tournamentItems.length > 0) {
        tournamentItems.forEach(item => {
          const link = item.querySelector('a[href*="season.php?id="]');
          if (link) {
            const href = link.getAttribute('href');
            const match = href?.match(/id=([^&]+)/);
            if (match) {
              const tdid = match[1];
              
              // Extract title from .t_name div, excluding the spans
              const titleDiv = link.querySelector('.t_name');
              let title = 'Unknown Event';
              if (titleDiv) {
                // Clone the div and remove spans to get just the title text
                const clonedDiv = titleDiv.cloneNode(true) as HTMLElement;
                clonedDiv.querySelectorAll('span').forEach(span => span.remove());
                title = clonedDiv.textContent?.trim() || 'Unknown Event';
              }
              
              // Extract status from CSS class (e.g., "status_40" means status = 40)
              let status = 0;
              const statusSpan = link.querySelector('.status[class*="status_"]');
              if (statusSpan) {
                const classList = Array.from(statusSpan.classList);
                for (const className of classList) {
                  if (className.startsWith('status_')) {
                    const statusNum = parseInt(className.replace('status_', ''), 10);
                    if (!isNaN(statusNum)) {
                      status = statusNum;
                      break;
                    }
                  }
                }
              }
              
              eventItems.push({ 
                tdid, 
                title,
                status
              });
            }
          }
        });
      }
      
      // Fallback: look for table rows with event data (old structure)
      if (eventItems.length === 0) {
        const table = document.querySelector('#tournament_list_table tbody');
        if (table) {
          const rows = table.querySelectorAll('tr.t_item');
          rows.forEach(row => {
            const tdid = row.getAttribute('tdid');
            const titleEl = row.querySelector('.td_title a');
            const title = titleEl?.textContent?.trim() || 'Unknown Event';
            
            // Extract status from CSS class
            let status = 0;
            const statusSpan = row.querySelector('.status[class*="status_"]');
            if (statusSpan) {
              const classList = Array.from(statusSpan.classList);
              for (const className of classList) {
                if (className.startsWith('status_')) {
                  const statusNum = parseInt(className.replace('status_', ''), 10);
                  if (!isNaN(statusNum)) {
                    status = statusNum;
                    break;
                  }
                }
              }
            }
            
            if (tdid) {
              eventItems.push({ 
                tdid, 
                title,
                status
              });
            }
          });
        }
      }
      
      return eventItems;
    });
    
    console.log(`Found ${events.length} events in league ${lgid}`);
    return events;
  } catch (error) {
    console.error(`Error scraping league portal for ${lgid}:`, error);
    return [];
  }
}

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
      console.warn(`⚠️  Reached maximum iteration limit for event ${eventId}`);
    }
    
    console.log(`✅ Total matches fetched from event ${eventId}: ${matches.length}`);
    return matches;
  } catch (error) {
    console.error(`Error fetching matches from event ${eventId}:`, error);
    return [];
  }
}

/**
 * Main function: Scrapes leagues by keyword and synchronizes matches <= 6 months old
 */
export async function scrapeLeaguesByKeyword(
  keyword: string,
  retryCount = 0
): Promise<{
  leagues: import("./types.js").NakkaLeagueScrapedDTO[];
}> {
  console.log("Launching Chromium browser for league scraping...");

  // Detect if running on Vercel/Lambda or local
  const isProduction = process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME;

  let browser;
  if (isProduction) {
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
        "--js-flags=--max-old-space-size=512",
        "--max_old_space_size=512",
      ],
      executablePath,
      headless: true,
      timeout: 30000,
    });
  } else {
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
      viewport: { width: 800, height: 600 },
      locale: "en-US",
      timezoneId: "Europe/Warsaw",
    });

    const page = await context.newPage();
    
    // Disable caching and block unnecessary resources
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache',
    });
    
    await page.route("**/*", (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url();
      
      if (["image", "font", "media", "stylesheet", "websocket", "manifest", "other"].includes(resourceType)) {
        route.abort();
      } else if (resourceType === "script" && !url.includes("n01")) {
        route.abort();
      } else {
        route.continue();
      }
    });

    // Step 1: Fetch leagues by keyword
    // Need to navigate to a page first to use page.evaluate
    await page.goto('https://n01darts.com', { waitUntil: "domcontentloaded", timeout: 30000 });
    const apiLeagues = await fetchLeaguesByKeyword(keyword, page);
    
    if (apiLeagues.length === 0) {
      console.log("No leagues found for keyword:", keyword);
      return { leagues: [] };
    }

    // Step 2: Build league DTOs with dynamic import
    const { NAKKA_LEAGUE_BASE_URL } = await import("./constants.js");
    const leagues: import("./types.js").NakkaLeagueScrapedDTO[] = apiLeagues.map(league => ({
      lgid: league.lgid,
      league_name: league.title || "Unknown League",
      portal_href: `${NAKKA_LEAGUE_BASE_URL}/portal.php?lgid=${league.lgid}`,
      events: [], // Initialize empty events array
    }));

    console.log(`Processing ${leagues.length} leagues...`);

    // Step 3: Scrape events from each league portal and nest them (filter by completed status and date)
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    
    let totalFilteredEvents = 0;
    for (const league of leagues) {
      const events = await scrapeLeaguePortalForEvents(league.lgid, page);
      
      console.log(`League ${league.lgid}: Found ${events.length} events`);
      
      for (const event of events) {
        // Only include completed events (similar to tournament filtering)
        if (event.status === Number(NAKKA_STATUS_CODES.COMPLETED)) {
          // Get date for completed event (same as tournaments)
          console.log(`Event ${event.tdid} is completed, fetching date from Results tab...`);
          let eventDate: Date | null = null;
          
          try {
            eventDate = await scrapeTournamentDateFromResults(event.tdid, page);
          } catch (error) {
            console.error(`Failed to scrape date for event ${event.tdid}:`, error);
            // Skip this event if we can't get a date
            continue;
          }
          
          // Only add event if we got a valid date and it's within the last 6 months
          if (eventDate && eventDate >= sixMonthsAgo) {
            league.events.push({
              event_id: event.tdid,
              event_name: event.title,
              event_href: `${NAKKA_LEAGUE_BASE_URL}/season.php?id=${event.tdid}`,
              league_id: league.lgid,
              event_status: "completed",
              event_date: eventDate,
            });
            totalFilteredEvents++;
          } else if (!eventDate) {
            console.log(`Skipping event ${event.tdid} - no valid date found`);
          } else {
            console.log(`Skipping event ${event.tdid} - date ${eventDate.toISOString()} outside 6-month range`);
          }
        } else {
          console.log(`Skipping event ${event.tdid} - status: ${event.status} (not completed)`);
        }
      }
    }

    console.log(`✅ Final results: ${leagues.length} leagues, ${totalFilteredEvents} completed events`);

    return {
      leagues,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isResourceError = errorMessage.includes("ERR_INSUFFICIENT_RESOURCES") || 
                           errorMessage.includes("ERR_OUT_OF_MEMORY");
    
    if (isResourceError && retryCount < 2) {
      console.warn(`Memory error detected, retrying (${retryCount + 1}/2)...`);
      await browser.close().catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));
      return scrapeLeaguesByKeyword(keyword, retryCount + 1);
    }
    
    throw error;
  } finally {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }
}
