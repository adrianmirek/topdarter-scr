import type { NakkaMatchPlayerResultScrapedDTO } from "./types.js";
import { extractMatchIdentifierComponents } from "./match-identifier.js";
import { httpsJsonRequest } from "./https-json.js";
import { NAKKA_V1_MATCH_GET_URL } from "./constants.js";
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

export interface NakkaV1MatchGetResponse {
  result?: number;
  match?: NakkaApiMatchResponse;
}

export function isMatchGetPayload(
  data: unknown
): data is { result: 0; match: NakkaApiMatchResponse } {
  if (!data || typeof data !== "object") {
    return false;
  }

  const payload = data as NakkaV1MatchGetResponse;
  return payload.result === 0 && Boolean(payload.match) && typeof payload.match === "object";
}

/**
 * Public match/get used by player-results and the 501 tournament probe.
 * Example: https://push.n01darts.com/api/v1/match/get?mid=iFLeTEwI_1789162367448
 */
export async function fetchMatchViewFromApi(
  mid: string
): Promise<NakkaApiMatchResponse> {
  const url = `${NAKKA_V1_MATCH_GET_URL}?mid=${encodeURIComponent(mid)}`;
  console.log(`[API] Requesting match get: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);
  if (!isMatchGetPayload(data)) {
    throw new Error(
      `Match get API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  return data.match;
}

/**
 * Documented match/get used by the 501 tournament probe.
 */
export async function fetchMatchViewFromApiByMid(
  mid: string
): Promise<NakkaApiMatchResponse> {
  return fetchMatchViewFromApi(mid);
}

/**
 * Fetches player match results from the Nakka API (no browser).
 */
export async function fetchMatchPlayerResultsFromApi(
  nakkaMid: string,
  firstPlayerCode: string,
  secondPlayerCode: string
): Promise<NakkaMatchPlayerResultScrapedDTO[]> {
  console.log(`[API] Fetching player results for match: ${nakkaMid}`);

  const apiData = await fetchMatchViewFromApi(nakkaMid);

  const components = extractMatchIdentifierComponents(apiData.tmid);
  if (!components) {
    throw new Error(`Failed to parse match identifier: ${apiData.tmid}`);
  }

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
