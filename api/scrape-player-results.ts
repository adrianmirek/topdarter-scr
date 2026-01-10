import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeMatchPlayerResults } from "../lib/nakka-scraper.js";

const corsHeaders = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
  "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, X-API-Key",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(200).end();
  }

  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  const apiKey = process.env.SCRAPER_API_KEY;
  if (apiKey && req.headers["x-api-key"] !== apiKey) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { matchHref, nakkaMatchIdentifier } = req.body;

    if (!matchHref || !nakkaMatchIdentifier) {
      return res.status(400).json({
        success: false,
        error: "Missing matchHref or nakkaMatchIdentifier parameter",
      });
    }

    console.log(`[API] Scraping player results for match: ${nakkaMatchIdentifier}`);

    const playerResults = await scrapeMatchPlayerResults(matchHref, nakkaMatchIdentifier);

    console.log(`[API] Successfully scraped ${playerResults.length} player results`);

    return res.status(200).json({
      success: true,
      data: playerResults,
      count: playerResults.length,
    });
  } catch (error) {
    console.error("[API] Scraping error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

