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
 * Scrapes tournaments from Nakka by keyword using Playwright with stealth
 */
export async function scrapeTournamentsByKeyword(
  keyword: string
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
        "--single-process",
        "--no-zygote",
      ],
      executablePath,
      headless: true,
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
      viewport: { width: 1920, height: 1080 },
      locale: "en-US",
      timezoneId: "Europe/Warsaw",
    });

    const page = await context.newPage();
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
    await page.waitForTimeout(3000);

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
      if (item.t_date && item.t_date > 0) {
        parsedDate = new Date(item.t_date * 1000);
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
  } finally {
    await browser.close();
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
  tournamentHref: string
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
        "--single-process",
        "--no-zygote",
      ],
      executablePath,
      headless: true,
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
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();
    await page.goto(tournamentHref, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    const [groupMatches, knockoutMatches] = await Promise.all([
      scrapeGroupMatches(page, tournamentId),
      scrapeKnockoutMatches(page, tournamentId),
    ]);

    const allMatches = [...groupMatches, ...knockoutMatches];
    console.log(`Total matches scraped: ${allMatches.length}`);

    return allMatches;
  } finally {
    await browser.close();
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
        "--single-process",
        "--no-zygote",
      ],
      executablePath,
      headless: true,
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
      viewport: { width: 1920, height: 1080 },
    });

    const page = await context.newPage();
    await page.goto(matchHref, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(5000);

    // Check for Cloudflare
    const cloudflareChallenge = await page
      .$("title")
      .then((el) => el?.textContent())
      .catch(() => null);
    if (
      cloudflareChallenge?.includes("Just a moment") ||
      cloudflareChallenge?.includes("Cloudflare")
    ) {
      console.log("Cloudflare challenge detected, waiting longer...");
      await page.waitForTimeout(10000);
    }

    await page.waitForSelector("article", { timeout: 15000 });
    await page.waitForSelector("#menu_stats", { timeout: 20000, state: "visible" });
    await page.waitForTimeout(1000);
    await page.click("#menu_stats", { force: true });

    await page.waitForSelector("#stats_frame", { timeout: 15000 });
    const statsFrame = page.frameLocator("#stats_frame");
    await statsFrame.locator(".stats_table").waitFor({ timeout: 15000 });

    await page.waitForFunction(
      () => {
        const iframe = document.querySelector("#stats_frame") as HTMLIFrameElement;
        if (!iframe || !iframe.contentDocument) return false;
        const p1Legs = iframe.contentDocument.querySelector("#p1_legs");
        return p1Legs && p1Legs.textContent && p1Legs.textContent.trim() !== "";
      },
      { timeout: 15000 }
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
    await browser.close();

    const isTimeoutError =
      error instanceof Error && (error.message.includes("Timeout") || error.message.includes("timeout"));

    if (isTimeoutError && retryCount < maxRetries) {
      const delayMs = Math.pow(2, retryCount) * 1000;
      console.warn(`Timeout error, retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return scrapeMatchPlayerResults(matchHref, nakkaMatchIdentifier, retryCount + 1, maxRetries);
    }

    console.error("Error scraping match player results:", error);
    throw error;
  } finally {
    if (browser.isConnected()) {
      await browser.close();
    }
  }
}

