/**
 * Unit tests for Nakka tournament stats mapping and payload rules.
 */

import {
  isTournamentStatsPayload,
  roundStat,
  toPlayerStatsDto,
  toTournamentStatsDto,
  type NakkaApiPlayerStats,
} from "../lib/nakka-api-stats";

const samplePlayer: NakkaApiPlayerStats = {
  score: 12846,
  darts: 603,
  winLeg: 22,
  leg: 26,
  winMatch: 7,
  match: 7,
  ton00: 25,
  ton40: 7,
  ton70: 0,
  ton80: 3,
  highOut: 83,
  best: 15,
  f9Score: 5524,
  f9Darts: 234,
  rank: 1,
};

const sampleZeroRank: NakkaApiPlayerStats = {
  score: 5178,
  darts: 325,
  winLeg: 3,
  leg: 12,
  winMatch: 0,
  match: 3,
  ton00: 3,
  ton40: 0,
  ton70: 0,
  ton80: 0,
  highOut: 84,
  best: 24,
  f9Score: 1663,
  f9Darts: 108,
  rank: 0,
  rank_d: 12,
};

describe("isTournamentStatsPayload", () => {
  test("should accept result 0 with a stats object", () => {
    expect(
      isTournamentStatsPayload({ result: 0, kind: "stats_list", stats: { KfXM: samplePlayer } })
    ).toBe(true);
    expect(isTournamentStatsPayload({ result: 0, stats: {} })).toBe(true);
  });

  test("should reject the -50 error body", () => {
    expect(isTournamentStatsPayload(-50)).toBe(false);
    expect(isTournamentStatsPayload({ result: -50 })).toBe(false);
    expect(isTournamentStatsPayload({ stats: { KfXM: samplePlayer } })).toBe(false);
  });

  test("should reject a raw player map, arrays, and null", () => {
    expect(isTournamentStatsPayload({ KfXM: samplePlayer })).toBe(false);
    expect(isTournamentStatsPayload([samplePlayer])).toBe(false);
    expect(isTournamentStatsPayload(null)).toBe(false);
  });
});

describe("toPlayerStatsDto", () => {
  test("should map counts, rank, and derived averages", () => {
    const dto = toPlayerStatsDto("KfXM", samplePlayer);

    expect(dto.player_id).toBe("KfXM");
    expect(dto.rank).toBe(1);
    expect(dto.score_100_count).toBe(25);
    expect(dto.score_140_count).toBe(7);
    expect(dto.score_170_count).toBe(0);
    expect(dto.score_180_count).toBe(3);
    expect(dto.high_finish).toBe(83);
    expect(dto.best_leg).toBe(15);
    expect(dto.matches_count).toBe(7);
    expect(dto.legs_count).toBe(26);
    expect(dto.average_score).toBe(roundStat(12846 / (603 / 3)));
    expect(dto.first_nine_avg).toBe(roundStat(5524 / (234 / 3)));
    expect(dto.win_rate).toBe(100);
    expect(dto.leg_rate).toBe(roundStat((22 * 100) / 26));
  });

  test("should use rank_d when rank is 0", () => {
    const dto = toPlayerStatsDto("0I87", sampleZeroRank);
    expect(dto.rank).toBe(12);
  });

  test("should return 0 for averages and rates when denominators are 0", () => {
    const dto = toPlayerStatsDto("none", {
      ...samplePlayer,
      score: 10,
      darts: 0,
      f9Score: 10,
      f9Darts: 0,
      winMatch: 1,
      match: 0,
      winLeg: 1,
      leg: 0,
    });

    expect(dto.average_score).toBe(0);
    expect(dto.first_nine_avg).toBe(0);
    expect(dto.win_rate).toBe(0);
    expect(dto.leg_rate).toBe(0);
  });
});

describe("toTournamentStatsDto", () => {
  test("should wrap mapped players under the tournament id", () => {
    const dto = toTournamentStatsDto("t_3CaN_8156", { KfXM: samplePlayer });

    expect(dto.tournament_id).toBe("t_3CaN_8156");
    expect(dto.players_stats).toHaveLength(1);
    expect(dto.players_stats[0].player_id).toBe("KfXM");
  });
});
