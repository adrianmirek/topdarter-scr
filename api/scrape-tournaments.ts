import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeTournamentsByKeyword } from "../lib/nakka-scraper.js";

const corsHeaders = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
  "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, topdarter-api-key",
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    Object.entries(corsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });
    return res.status(200).end();
  }

  // Add CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  // Optional: API Key authentication
  const apiKey = process.env.TOPDARTER_API_KEY;
  console.log("[DEBUG] API Key set:", apiKey ? "Yes (length: " + apiKey.length + ")" : "No");
  console.log("[DEBUG] topdarter-api-key header:", req.headers["topdarter-api-key"] || "Not provided");
  
  if (apiKey && req.headers["topdarter-api-key"] !== apiKey) {
    console.log("[AUTH] Unauthorized access attempt");
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { keyword } = req.body;

    if (!keyword || typeof keyword !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Missing or invalid keyword parameter" });
    }

    console.log(`[API] Scraping tournaments for keyword: "${keyword}"`);

    const tournaments = await scrapeTournamentsByKeyword(keyword);

    console.log(`[API] Successfully scraped ${tournaments.length} tournaments`);

    return res.status(200).json({
      success: true,
      data: tournaments,
      count: tournaments.length,
    });
  } catch (error) {
    console.error("[API] Scraping error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}

