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

/**
 * Scrapes tournament date from the Results tab by finding the first match date
 */
async function scrapeTournamentDateFromResults(
  tournamentId: string,
  existingPage: Page
): Promise<Date | null> {
  try {
    // First try: Call the history API directly to get match data
    const historyApiUrl = `https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_history.php?cmd=get_t_list&tdid=${tournamentId}&skip=0&count=30&name=`;
    
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
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);

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
        parsedDate >= oneYearAgo
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
 * Parses match type from subtitle and base type
 */
function parseMatchType(subtitle: string | null, baseType: string): string {
  if (baseType === "rr") return "rr";
  if (!subtitle) return "t_unknown";
  return `t_${subtitle.toLowerCase().replace(/\s+/g, "_")}`;
}

/**
 * Extracts player names from the page for a given match
 */
async function extractPlayerNamesForMatch(
  page: Page,
  tpid: string,
  vstpid: string
): Promise<{ first: string; second: string }> {
  const firstPlayerElement = await page.$(`[tpid="${tpid}"] .entry_name`);
  const secondPlayerElement = await page.$(`[tpid="${vstpid}"] .entry_name`);

  const first = firstPlayerElement ? (await firstPlayerElement.textContent())?.trim() || "Unknown" : "Unknown";
  const second = secondPlayerElement ? (await secondPlayerElement.textContent())?.trim() || "Unknown" : "Unknown";

  return { first, second };
}

/**
 * Extracts opponent name from the page by player code
 */
async function extractOpponentName(page: Page, vstpid: string): Promise<string> {
  const element = await page.$(`[tpid="${vstpid}"] .entry_name`);
  return element ? (await element.textContent())?.trim() || "Unknown" : "Unknown";
}

/**
 * Scrapes group stage (round-robin) matches from tournament page
 */
async function scrapeGroupMatches(page: Page, tournamentId: string): Promise<NakkaMatchScrapedDTO[]> {
  const matches: NakkaMatchScrapedDTO[] = [];
  const seenIdentifiers = new Set<string>();

  const rrContainer = await page.$("#rr_container");
  if (!rrContainer) {
    console.log("No #rr_container found - skipping group matches");
    return matches;
  }

  const results = await page.$$(".rr_result.view_button");
  console.log(`Found ${results.length} potential group match elements`);

  for (const result of results) {
    try {
      const ttype = await result.getAttribute("ttype");
      if (ttype !== "rr") continue;

      const subtitle = await result.getAttribute("subtitle");
      const round = (await result.getAttribute("round")) || "0";
      const tpid = await result.getAttribute("tpid");
      const vstpid = await result.getAttribute("vstpid");

      if (!tpid || !vstpid) continue;

      const hasAverage = await result.$(".r_avg");
      if (!hasAverage) continue;

      const [firstCode, secondCode] = [tpid, vstpid].sort();
      const identifier = `${tournamentId}_rr_${round}_${firstCode}_${secondCode}`;
      const href = `${NAKKA_BASE_URL}/n01_view.html?tmid=${identifier}`;

      if (seenIdentifiers.has(identifier)) continue;
      seenIdentifiers.add(identifier);

      const playerNames = await extractPlayerNamesForMatch(page, tpid, vstpid);

      matches.push({
        nakka_match_identifier: identifier,
        match_type: parseMatchType(subtitle, "rr"),
        first_player_name: playerNames.first,
        first_player_code: firstCode,
        second_player_name: playerNames.second,
        second_player_code: secondCode,
        href,
      });

      console.log(`Scraped group match: ${identifier}`);
    } catch (error) {
      console.error("Error scraping group match:", error);
    }
  }

  console.log(`Total group matches scraped: ${matches.length}`);
  return matches;
}

/**
 * Scrapes knockout stage matches from tournament page
 */
async function scrapeKnockoutMatches(page: Page, tournamentId: string): Promise<NakkaMatchScrapedDTO[]> {
  const matches: NakkaMatchScrapedDTO[] = [];
  const seenIdentifiers = new Set<string>();

  const bracketContainer = await page.$("#bracket_container");
  if (!bracketContainer) {
    console.log("No #bracket_container found - skipping knockout matches");
    return matches;
  }

  const items = await page.$$('.t_item.view_button[ttype="t"]');
  console.log(`Found ${items.length} potential knockout match elements`);

  for (const item of items) {
    try {
      const ttype = await item.getAttribute("ttype");
      if (ttype !== "t") continue;

      const subtitle = await item.getAttribute("subtitle");
      const round = (await item.getAttribute("round")) || "0";
      const tpid = await item.getAttribute("tpid");
      const vstpid = await item.getAttribute("vstpid");

      if (!tpid || !vstpid) continue;

      const [firstCode, secondCode] = [tpid, vstpid].sort();
      const identifier = `${tournamentId}_t_${round}_${firstCode}_${secondCode}`;
      const href = `${NAKKA_BASE_URL}/n01_view.html?tmid=${identifier}`;

      if (seenIdentifiers.has(identifier)) continue;
      seenIdentifiers.add(identifier);

      const playerName = await item
        .$eval(".entry_name", (el) => el.textContent?.trim() || "Unknown")
        .catch(() => "Unknown");
      const opponentName = await extractOpponentName(page, vstpid);

      matches.push({
        nakka_match_identifier: identifier,
        match_type: parseMatchType(subtitle, "t"),
        first_player_name: playerName,
        first_player_code: firstCode,
        second_player_name: opponentName,
        second_player_code: secondCode,
        href,
      });

      console.log(`Scraped knockout match: ${identifier}`);
    } catch (error) {
      console.error("Error scraping knockout match:", error);
    }
  }

  console.log(`Total knockout matches scraped: ${matches.length}`);
  return matches;
}

/**
 * Scrapes matches from a tournament page
 */
export async function scrapeTournamentMatches(
  tournamentHref: string,
  retryCount = 0
): Promise<NakkaMatchScrapedDTO[]> {
  console.log("Launching stealth browser to scrape matches from:", tournamentHref);

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
      viewport: { width: 800, height: 600 }, // Reduced viewport to save memory
    });

    const page = await context.newPage();
    
    // Disable caching to save memory
    await page.setExtraHTTPHeaders({
      'Cache-Control': 'no-cache',
    });
    
    // Block heavy resources to save memory in serverless
    await page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      // Block images, fonts, media, stylesheets - only allow documents, scripts, xhr, fetch
      if (["image", "font", "media", "stylesheet"].includes(resourceType)) {
        route.abort();
      } else {
        route.continue();
      }
    });
    
    await page.goto(tournamentHref, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    
    // Wait for page to be ready instead of arbitrary timeout
    try {
      await page.waitForLoadState("networkidle", { timeout: 5000 });
    } catch (e) {
      console.log("Network didn't go idle, continuing...");
    }

    const [groupMatches, knockoutMatches] = await Promise.all([
      scrapeGroupMatches(page, tournamentId),
      scrapeKnockoutMatches(page, tournamentId),
    ]);

    const allMatches = [...groupMatches, ...knockoutMatches];
    console.log(`Total matches scraped: ${allMatches.length}`);

    return allMatches;
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
  firstPlayerCode: string;
  secondPlayerCode: string;
} | null {
  const parts = nakkaMatchIdentifier.split("_");

  if (parts.length < 5) {
    console.error(`Invalid match identifier format: ${nakkaMatchIdentifier}`);
    return null;
  }

  const tournamentId = parts.slice(0, 3).join("_");
  const matchType = parts[3];
  const round = parts[4];
  const firstPlayerCode = parts[parts.length - 2];
  const secondPlayerCode = parts[parts.length - 1];

  return {
    tournamentId,
    matchType,
    round,
    firstPlayerCode,
    secondPlayerCode,
  };
}

/**
 * Scrapes player results from a match page
 */
export async function scrapeMatchPlayerResults(
  matchHref: string,
  nakkaMatchIdentifier: string,
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
      viewport: { width: 480, height: 320 }, // Minimal viewport to save maximum memory
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

    await page.waitForFunction(
      () => {
        const iframe = document.querySelector("#stats_frame") as HTMLIFrameElement;
        if (!iframe || !iframe.contentDocument) return false;
        const p1Legs = iframe.contentDocument.querySelector("#p1_legs");
        return p1Legs && p1Legs.textContent && p1Legs.textContent.trim() !== "";
      },
      { timeout: 12000 }
    );

    console.log("Stats loaded, extracting data...");

    // Get player names
    const playerNames = await page.evaluate(() => {
      const iframe = document.querySelector("#stats_frame") as HTMLIFrameElement;
      if (!iframe || !iframe.contentDocument) return [];
      const nameTexts = iframe.contentDocument.querySelectorAll(".name_text");
      return Array.from(nameTexts).map((el) => el.textContent?.trim() || "");
    });

    if (playerNames.length !== 2) {
      throw new Error(`Expected 2 player names, found ${playerNames.length}`);
    }

    // Get statistics
    const stats = await page.evaluate(() => {
      const iframe = document.querySelector("#stats_frame") as HTMLIFrameElement;
      if (!iframe || !iframe.contentDocument) return {};

      const doc = iframe.contentDocument;
      const getValue = (selector: string): string => {
        const el = doc.querySelector(selector);
        return el?.textContent?.trim() || "";
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
    });

    const results: NakkaMatchPlayerResultScrapedDTO[] = [];

    const parseCheckout = (text: string): number | null => {
      if (!text) return null;
      const match = text.match(/^([\d.]+)%/);
      if (!match) return null;
      const parsed = parseFloat(match[1]);
      return isNaN(parsed) ? null : parsed;
    };

    for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
      const playerCode = playerIndex === 0 ? components.firstPlayerCode : components.secondPlayerCode;
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
      return scrapeMatchPlayerResults(matchHref, nakkaMatchIdentifier, retryCount + 1, maxRetries);
    }

    console.error("Error scraping match player results:", error);
    throw error;
  } finally {
    if (browser && browser.isConnected()) {
      await browser.close().catch(() => {});
    }
  }
}

