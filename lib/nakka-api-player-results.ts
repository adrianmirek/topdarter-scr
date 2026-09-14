import type { NakkaMatchPlayerResultScrapedDTO } from "./types.js";
import { extractMatchIdentifierComponents } from "./match-identifier.js";
import { httpsJsonRequest } from "./https-json.js";
import {
  calculateAverageScore,
  calculateFirstNineAverage,
  calculateCheckoutPercentage,
  calculateScoreRangeCounts,
  calculateHighFinish,
  calculateBestLeg,
  calculateWorstLeg,
  extractPlayerIdentifiers,
  type NakkaApiMatchResponse,
} from "./nakka-api-calculations.js";

/**
 * Fetches player match results from the Nakka API (no browser).
 */
export async function fetchMatchPlayerResultsFromApi(
  nakkaMatchIdentifier: string,
  firstPlayerCode: string,
  secondPlayerCode: string
): Promise<NakkaMatchPlayerResultScrapedDTO[]> {
  console.log(`[API] Fetching player results for match: ${nakkaMatchIdentifier}`);

  const components = extractMatchIdentifierComponents(nakkaMatchIdentifier);
  if (!components) {
    throw new Error(`Failed to parse match identifier: ${nakkaMatchIdentifier}`);
  }

  const apiUrl =
    "https://tk2-228-23746.vs.sakura.ne.jp/n01/tournament/n01_user_t.php?cmd=match_view&sid=";

  console.log(`[API] Requesting: ${apiUrl}`);

  const apiData = await httpsJsonRequest<NakkaApiMatchResponse>(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: JSON.stringify({
      tmid: nakkaMatchIdentifier,
    }),
  });

  if (!apiData.legData || !Array.isArray(apiData.legData)) {
    throw new Error("Invalid API response: legData is missing or not an array");
  }

  if (!apiData.statsData || !Array.isArray(apiData.statsData)) {
    throw new Error("Invalid API response: statsData is missing or not an array");
  }

  const { firstPlayerIndex } = extractPlayerIdentifiers(
    apiData.statsData,
    firstPlayerCode,
    secondPlayerCode
  );

  const results: NakkaMatchPlayerResultScrapedDTO[] = [];

  for (let playerIndex = 0; playerIndex < 2; playerIndex++) {
    const statsData = apiData.statsData[playerIndex];
    const isFirstPlayer = playerIndex === firstPlayerIndex;
    const playerCode = isFirstPlayer ? firstPlayerCode : secondPlayerCode;
    const nakkaMatchPlayerIdentifier = `${components.tournamentId}_${components.matchType}_${components.round}_${playerCode}`;
    const opponentIndex = 1 - playerIndex;
    const opponentStats = apiData.statsData[opponentIndex];

    results.push({
      nakka_match_player_identifier: nakkaMatchPlayerIdentifier,
      average_score: calculateAverageScore(statsData),
      first_nine_avg: calculateFirstNineAverage(apiData.legData, playerIndex),
      checkout_percentage: calculateCheckoutPercentage(apiData.legData, playerIndex),
      score_60_count: calculateScoreRangeCounts(apiData.legData, playerIndex, 60, 99),
      score_100_count: calculateScoreRangeCounts(apiData.legData, playerIndex, 100, 139),
      score_140_count: calculateScoreRangeCounts(apiData.legData, playerIndex, 140, 170),
      score_180_count: calculateScoreRangeCounts(apiData.legData, playerIndex, 171, 180),
      high_finish: calculateHighFinish(apiData.legData, playerIndex),
      best_leg: calculateBestLeg(apiData.legData, playerIndex),
      worst_leg: calculateWorstLeg(apiData.legData, playerIndex),
      player_score: statsData.winLegs,
      opponent_score: opponentStats.winLegs,
    });
  }

  console.log(`[API] Successfully scraped results for ${results.length} players`);
  return results;
}
