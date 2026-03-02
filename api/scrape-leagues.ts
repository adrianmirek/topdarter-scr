import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeLeaguesByKeyword } from "../lib/nakka-scraper.js";

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

  // Only accept POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ 
      success: false, 
      error: "Method not allowed. Use POST with JSON body: {\"keyword\": \"your-keyword\"}" 
    });
  }

  // Optional: API Key authentication
  const apiKey = process.env.TOPDARTER_API_KEY;
  console.log("[DEBUG] API Key set:", apiKey ? "Yes (length: " + apiKey.length + ")" : "No");
  console.log("[DEBUG] topdarter-api-key header:", req.headers["topdarter-api-key"] || "Not provided");
  
  if (apiKey && req.headers["topdarter-api-key"] !== apiKey) {
    console.log("[AUTH] Unauthorized access attempt");
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    // Check if body exists and is an object
    if (!req.body || typeof req.body !== "object") {
      console.log("[DEBUG] Invalid body:", req.body);
      return res.status(400).json({ 
        success: false, 
        error: "Invalid request body. Send JSON with Content-Type: application/json" 
      });
    }

    const { keyword } = req.body;

    if (!keyword || typeof keyword !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Missing or invalid keyword parameter in body" });
    }

    console.log(`[API] Scraping leagues and their events for keyword: "${keyword}"`);

    const result = await scrapeLeaguesByKeyword(keyword);
    
    // Calculate stats from nested structure
    const totalEvents = result.leagues.reduce((sum, league) => sum + league.events.length, 0);

    console.log(`[API] Successfully scraped ${result.leagues.length} leagues with ${totalEvents} completed events`);

    return res.status(200).json({
      success: true,
      data: {
        leagues: result.leagues,
      },
      stats: {
        leaguesCount: result.leagues.length,
        eventsCount: totalEvents,
      },
    });
  } catch (error) {
    console.error("[API] League scraping error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
