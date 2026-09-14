import type { NakkaPlayerStatsDTO, NakkaTournamentStatsDTO } from "./types.js";
import { httpsJsonRequest } from "./https-json.js";
import { NAKKA_STATS_API_URL } from "./constants.js";

export interface NakkaApiPlayerStats {
  score: number;
  darts: number;
  winLeg: number;
  leg: number;
  winMatch: number;
  match: number;
  ton00: number;
  ton40: number;
  ton70: number;
  ton80: number;
  highOut: number;
  best: number;
  f9Score: number;
  f9Darts: number;
  rank: number;
  rank_d?: number;
  [key: string]: unknown;
}

export function isTournamentStatsPayload(
  data: unknown
): data is Record<string, NakkaApiPlayerStats> {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return false;
  }

  if (typeof (data as { result?: unknown }).result === "number") {
    return false;
  }

  return true;
}

export function roundStat(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toPlayerStatsDto(
  playerId: string,
  stats: NakkaApiPlayerStats
): NakkaPlayerStatsDTO {
  return {
    player_id: playerId,
    rank: stats.rank === 0 && stats.rank_d ? stats.rank_d : stats.rank,
    score_100_count: stats.ton00,
    score_140_count: stats.ton40,
    score_170_count: stats.ton70,
    score_180_count: stats.ton80,
    high_finish: stats.highOut,
    best_leg: stats.best,
    average_score: stats.darts > 0 ? roundStat(stats.score / (stats.darts / 3)) : 0,
    first_nine_avg:
      stats.f9Darts > 0 ? roundStat(stats.f9Score / (stats.f9Darts / 3)) : 0,
    win_rate: stats.match > 0 ? roundStat((stats.winMatch * 100) / stats.match) : 0,
    leg_rate: stats.leg > 0 ? roundStat((stats.winLeg * 100) / stats.leg) : 0,
    matches_count: stats.match,
    legs_count: stats.leg,
  };
}

export function toTournamentStatsDto(
  tournamentId: string,
  raw: Record<string, NakkaApiPlayerStats>
): NakkaTournamentStatsDTO {
  return {
    tournament_id: tournamentId,
    players_stats: Object.entries(raw).map(([playerId, stats]) =>
      toPlayerStatsDto(playerId, stats)
    ),
  };
}

export async function fetchTournamentStatsFromApi(
  tournamentId: string
): Promise<NakkaTournamentStatsDTO> {
  const url = `${NAKKA_STATS_API_URL}?cmd=stats_list&tdid=${encodeURIComponent(tournamentId)}`;
  console.log(`[API] Requesting tournament stats: ${url}`);

  const data = await httpsJsonRequest<unknown>(url);

  if (!isTournamentStatsPayload(data)) {
    throw new Error(
      `Tournament stats API returned invalid payload: ${JSON.stringify(data)}`
    );
  }

  const result = toTournamentStatsDto(tournamentId, data);
  console.log(
    `[API] Processed ${result.players_stats.length} player(s) for tournament ${tournamentId}`
  );

  return result;
}

export async function scrapeTournamentStats(
  tournamentId: string
): Promise<NakkaTournamentStatsDTO> {
  return fetchTournamentStatsFromApi(tournamentId);
}
