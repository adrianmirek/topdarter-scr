import type { VercelRequest, VercelResponse } from "@vercel/node";
import { scrapeTournamentByTdid } from "../lib/nakka-api-tournaments.js";

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
  console.log("[DEBUG] API Key set:", apiKey ? "Yes (length: " + apiKey.length + ")" : "No");
  console.log("[DEBUG] topdarter-api-key header:", req.headers["topdarter-api-key"] || "Not provided");

  if (apiKey && req.headers["topdarter-api-key"] !== apiKey) {
    console.log("[AUTH] Unauthorized access attempt");
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const { nakka_identifier } = req.body;

    if (!nakka_identifier || typeof nakka_identifier !== "string") {
      return res
        .status(400)
        .json({ success: false, error: "Missing or invalid nakka_identifier parameter" });
    }

    console.log(`[API] Scraping tournament for nakka_identifier: "${nakka_identifier}"`);

    const tournament = await scrapeTournamentByTdid(nakka_identifier);

    if (!tournament) {
      console.log(`[API] Tournament ${nakka_identifier} was skipped or not found`);
      return res.status(200).json({
        success: true,
        data: null,
      });
    }

    console.log(`[API] Successfully scraped tournament ${nakka_identifier}`);

    return res.status(200).json({
      success: true,
      data: tournament,
    });
  } catch (error) {
    console.error("[API] Scraping error:", error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
}
