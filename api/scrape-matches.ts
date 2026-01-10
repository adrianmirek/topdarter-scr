import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeTournamentMatches } from "../lib/nakka-scraper.js";

const corsHeaders = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
  "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, topdarter-api-key",
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

  const apiKey = process.env.TOPDARTER_API_KEY;
  if (apiKey && req.headers["topdarter-api-key"] !== apiKey) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { tournamentHref } = req.body;

    if (!tournamentHref || typeof tournamentHref !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid tournamentHref parameter",
      });
    }

    console.log(`[API] Scraping matches from: ${tournamentHref}`);

    const matches = await scrapeTournamentMatches(tournamentHref);

    console.log(`[API] Successfully scraped ${matches.length} matches`);

    return res.status(200).json({
      success: true,
      data: matches,
      count: matches.length,
    });
  } catch (error) {
    console.error("[API] Scraping error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

