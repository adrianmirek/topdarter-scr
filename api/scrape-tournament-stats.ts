import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeTournamentStats } from "../lib/nakka-scraper.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

const corsHeaders = {
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS,POST",
  "Access-Control-Allow-Headers": "X-Requested-With, Content-Type, topdarter-api-key",
};

async function readRawBody(req: VercelRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

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
    const rawBody = await readRawBody(req);
    let parsedBody: Record<string, unknown>;

    try {
      parsedBody = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ success: false, error: "Request body must be valid JSON", received: rawBody });
    }

    const { tournamentId } = parsedBody;

    if (!tournamentId || typeof tournamentId !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid tournamentId parameter",
      });
    }

    console.log(`[API] Scraping tournament stats for: ${tournamentId}`);

    const stats = await scrapeTournamentStats(tournamentId);

    console.log(`[API] Successfully scraped stats for ${stats.players_stats.length} player(s)`);

    return res.status(200).json({
      success: true,
      data: stats,
      count: stats.players_stats.length,
    });
  } catch (error) {
    console.error("[API] Scraping error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
