/**
 * Unit tests for Nakka API calculation functions
 */

import {
  calculateAverageScore,
  calculateFirstNineAverage,
  calculateScoreRangeCounts,
  calculateHighFinish,
  calculateLegScores,
  calculateBestLeg,
  calculateWorstLeg,
  calculateCheckoutPercentage,
  calculateCheckoutPercentageTopDarter,
  extractPlayerIdentifiers,
  type NakkaDartData,
  type NakkaLegData,
  type NakkaPlayerStatsData,
} from "../lib/nakka-api-calculations";

// ============================================================================
// TEST DATA
// ============================================================================

/**
 * Sample player stats from the requirements
 */
const samplePlayer1Stats: NakkaPlayerStatsData = {
  name: "Pacek Mateusz",
  tid: "",
  sname: "",
  fid: "",
  gid: "",
  country: "",
  pid: "0a1efb86_1788459167420",
  tpid: "ydcg",
  order: null,
  me: 0,
  winSets: 0,
  winLegs: 3,
  allScore: 1503,
  allDarts: 107,
  allMarks: 0,
};

const samplePlayer2Stats: NakkaPlayerStatsData = {
  name: "Pacek Mikołaj",
  tid: "",
  sname: "",
  fid: "",
  gid: "",
  country: "",
  pid: "d338b88b_1788459167420",
  tpid: "hsyq",
  order: null,
  me: 0,
  winSets: 0,
  winLegs: 0,
  allScore: 1441,
  allDarts: 105,
  allMarks: 0,
};

/**
 * Sample leg data (simplified from requirements)
 */
const sampleLegData: NakkaLegData[] = [
  {
    time: 1788459454282,
    first: 0,
    currentRound: 12,
    selectRound: 12,
    endFlag: 1,
    middleForDiddle: 0,
    winner: 0,
    playerData: [
      // Player 1: successful checkout
      [
        { score: 0, left: 501 },
        { score: 41, left: 460 },
        { score: 22, left: 438 },
        { score: 140, left: 298 },
        { score: 44, left: 254 },
        { score: 49, left: 205 },
        { score: 60, left: 145 },
        { score: 36, left: 109 },
        { score: 20, left: 89 },
        { score: 26, left: 63 },
        { score: 43, left: 20 },
        { score: 0, left: 20 },
        { score: 0, left: 20 },
        { score: -1, left: 0 }, // Checkout successful
      ],
      // Player 2: failed checkout
      [
        { score: 0, left: 501 },
        { score: 24, left: 477 },
        { score: 20, left: 457 },
        { score: 31, left: 426 },
        { score: 46, left: 380 },
        { score: 26, left: 354 },
        { score: 62, left: 292 },
        { score: 60, left: 232 },
        { score: 45, left: 187 },
        { score: 42, left: 145 },
        { score: 28, left: 117 },
        { score: 77, left: 40 },
        { score: 20, left: 20 }, // Did not finish
      ],
    ],
    startTime: 1788459190,
    endTime: 1788459454,
  },
  {
    time: 1788459745011,
    first: 1,
    currentRound: 13,
    selectRound: 13,
    endFlag: 1,
    middleForDiddle: 0,
    winner: 0,
    playerData: [
      // Player 1: successful checkout
      [
        { score: 0, left: 501 },
        { score: 55, left: 446 },
        { score: 97, left: 349 },
        { score: 100, left: 249 },
        { score: 32, left: 217 },
        { score: 100, left: 117 },
        { score: 77, left: 40 },
        { score: 30, left: 10 },
        { score: 6, left: 4 },
        { score: 0, left: 4 },
        { score: 2, left: 2 },
        { score: 0, left: 2 },
        { score: 0, left: 2 },
        { score: 0, left: 2 },
        { score: -3, left: 0 }, // Checkout successful
      ],
      // Player 2: failed checkout
      [
        { score: 0, left: 501 },
        { score: 26, left: 475 },
        { score: 60, left: 415 },
        { score: 44, left: 371 },
        { score: 45, left: 326 },
        { score: 81, left: 245 },
        { score: 30, left: 215 },
        { score: 35, left: 180 },
        { score: 97, left: 83 },
        { score: 38, left: 45 },
        { score: 21, left: 24 },
        { score: 22, left: 2 },
        { score: 0, left: 2 },
        { score: 0, left: 2 },
        { score: 0, left: 2 }, // Did not finish
      ],
    ],
    startTime: 1788459461,
    endTime: 1788459745,
  },
  {
    time: 1788459941579,
    first: 0,
    currentRound: 9,
    selectRound: 9,
    endFlag: 1,
    middleForDiddle: 0,
    winner: 0,
    playerData: [
      // Player 1: successful checkout
      [
        { score: 0, left: 501 },
        { score: 40, left: 461 },
        { score: 25, left: 436 },
        { score: 125, left: 311 },
        { score: 81, left: 230 },
        { score: 40, left: 190 },
        { score: 60, left: 130 },
        { score: 51, left: 79 },
        { score: 39, left: 40 },
        { score: 20, left: 20 },
        { score: -1, left: 0 }, // Checkout successful
      ],
      // Player 2: failed checkout
      [
        { score: 0, left: 501 },
        { score: 45, left: 456 },
        { score: 41, left: 415 },
        { score: 7, left: 408 },
        { score: 29, left: 379 },
        { score: 59, left: 320 },
        { score: 70, left: 250 },
        { score: 44, left: 206 },
        { score: 85, left: 121 },
        { score: 81, left: 40 }, // Did not finish
      ],
    ],
    startTime: 1788459757,
    endTime: 1788459941,
  },
];

// ============================================================================
// TESTS
// ============================================================================

describe("Nakka API Calculations", () => {
  describe("calculateAverageScore", () => {
    test("should calculate correct average score for player 1", () => {
      const result = calculateAverageScore(samplePlayer1Stats);
      const expected = Math.round((1503 / 107) * 100) / 100;
      expect(result).toBe(expected);
      expect(result).toBeCloseTo(14.05, 2);
    });

    test("should calculate correct average score for player 2", () => {
      const result = calculateAverageScore(samplePlayer2Stats);
      const expected = Math.round((1441 / 105) * 100) / 100;
      expect(result).toBe(expected);
      expect(result).toBeCloseTo(13.72, 2);
    });

    test("should return null for zero darts", () => {
      const stats = { ...samplePlayer1Stats, allDarts: 0, allScore: 0 };
      const result = calculateAverageScore(stats);
      expect(result).toBeNull();
    });
  });

  describe("calculateFirstNineAverage", () => {
    test("should calculate first nine average correctly", () => {
      const result = calculateFirstNineAverage(sampleLegData, 0);
      expect(result).not.toBeNull();
      expect(result).toBeGreaterThan(0);
    });

    test("should return null for empty leg data", () => {
      const result = calculateFirstNineAverage([], 0);
      expect(result).toBeNull();
    });

    test("should handle legs with fewer than 9 darts", () => {
      const shortLeg: NakkaLegData = {
        ...sampleLegData[0],
        playerData: [
          [
            { score: 20, left: 481 },
            { score: 20, left: 461 },
            { score: 20, left: 441 },
          ],
          sampleLegData[0].playerData[1],
        ],
      };
      const result = calculateFirstNineAverage([shortLeg], 0);
      expect(result).not.toBeNull();
      expect(result).toBe(20); // (20 + 20 + 20) / 3 = 20
    });
  });

  describe("calculateScoreRangeCounts", () => {
    const bucketLeg: NakkaLegData[] = [
      {
        time: 0,
        first: 0,
        currentRound: 1,
        selectRound: 1,
        endFlag: 1,
        middleForDiddle: 0,
        winner: 0,
        playerData: [
          [
            { score: 59, left: 442 },
            { score: 60, left: 382 },
            { score: 99, left: 283 },
            { score: 100, left: 183 },
            { score: 139, left: 44 },
            { score: 140, left: 301 },
            { score: 170, left: 131 },
            { score: 171, left: 0 },
            { score: 180, left: 0 },
          ],
          [],
        ],
        startTime: 0,
        endTime: 0,
      },
    ];

    test("should count 60 range as 60 <= score < 100", () => {
      expect(calculateScoreRangeCounts(bucketLeg, 0, 60, 99)).toBe(2);
    });

    test("should count 100 range as 100 <= score < 140", () => {
      expect(calculateScoreRangeCounts(bucketLeg, 0, 100, 139)).toBe(2);
    });

    test("should count 140 range as 140 <= score < 171", () => {
      expect(calculateScoreRangeCounts(bucketLeg, 0, 140, 170)).toBe(2);
    });

    test("should count 180 range as 171 <= score <= 180", () => {
      expect(calculateScoreRangeCounts(bucketLeg, 0, 171, 180)).toBe(2);
    });

    test("should return 0 for non-existent range", () => {
      const result = calculateScoreRangeCounts(sampleLegData, 0, 1, 10);
      expect(result).toBe(0);
    });
  });

  describe("calculateHighFinish", () => {
    test("should use remaining before the checkout visit, not the negative dart count", () => {
      const result = calculateHighFinish(sampleLegData, 0);
      expect(result).toBe(20);
    });

    test("should return the best finish across all legs", () => {
      const legs: NakkaLegData[] = [52, 56, 111].map((finish, index) => ({
        time: index,
        first: 0,
        currentRound: 2,
        selectRound: 2,
        endFlag: 1,
        middleForDiddle: 0,
        winner: 0,
        playerData: [
          [
            { score: 0, left: 501 },
            { score: 501 - finish, left: finish },
            { score: -2, left: 0 },
          ],
          [],
        ],
        startTime: 0,
        endTime: 0,
      }));

      expect(calculateHighFinish(legs, 0)).toBe(111);
    });

    test("should return 0 for player with no checkouts", () => {
      const result = calculateHighFinish(sampleLegData, 1);
      expect(result).toBe(0);
    });
  });

  describe("calculateLegScores", () => {
    test("should count only finished legs, including finishing darts", () => {
      const result = calculateLegScores(sampleLegData, 0);
      expect(result).toEqual([37, 42, 28]);
    });

    test("should omit legs the player did not finish", () => {
      expect(calculateLegScores(sampleLegData, 1)).toEqual([]);
    });

    test("should return empty array for no legs", () => {
      const result = calculateLegScores([], 0);
      expect(result).toEqual([]);
    });
  });

  describe("calculateBestLeg and calculateWorstLeg", () => {
    function finishedLeg(darts: number): NakkaDartData[] {
      const visits: NakkaDartData[] = [{ score: 0, left: 501 }];
      const fullVisits = Math.floor((darts - 1) / 3);
      const finishDarts = darts - fullVisits * 3;
      let left = 501;
      for (let i = 0; i < fullVisits; i++) {
        const score = Math.min(60, left - 2);
        left -= score;
        visits.push({ score, left });
      }
      visits.push({ score: -finishDarts, left: 0 });
      return visits;
    }

    function unfinishedLeg(): NakkaDartData[] {
      return [
        { score: 0, left: 501 },
        { score: 60, left: 441 },
        { score: 60, left: 381 },
      ];
    }

    function toLegData(playerVisits: NakkaDartData[][]): NakkaLegData[] {
      return playerVisits.map((visits, index) => ({
        time: index,
        first: 0,
        currentRound: visits.length,
        selectRound: visits.length,
        endFlag: 1,
        middleForDiddle: 0,
        winner: 0,
        playerData: [visits, []],
        startTime: 0,
        endTime: 0,
      }));
    }

    test("should use fewest finished darts as best and most as worst, ignoring opponent wins", () => {
      const legs = toLegData([
        finishedLeg(15),
        finishedLeg(21),
        unfinishedLeg(),
        finishedLeg(18),
      ]);

      expect(calculateLegScores(legs, 0)).toEqual([15, 21, 18]);
      expect(calculateBestLeg(legs, 0)).toBe(15);
      expect(calculateWorstLeg(legs, 0)).toBe(21);
    });

    test("should return 0 when the player never finished a leg", () => {
      expect(calculateBestLeg(sampleLegData, 1)).toBe(0);
      expect(calculateWorstLeg(sampleLegData, 1)).toBe(0);
    });

    test("should return 0 for empty leg data", () => {
      expect(calculateBestLeg([], 0)).toBe(0);
      expect(calculateWorstLeg([], 0)).toBe(0);
    });
  });

  describe("calculateCheckoutPercentage", () => {
    test("should calculate checkout percentage for player 1 (3 successful)", () => {
      const result = calculateCheckoutPercentage(sampleLegData, 0);
      // Player 1 should have 3 successful checkouts out of 3 legs
      expect(result).toBeCloseTo(100, 1);
    });

    test("should calculate checkout percentage for player 2 (0 successful)", () => {
      const result = calculateCheckoutPercentage(sampleLegData, 1);
      // Player 2 should have 0 successful checkouts out of 3 legs
      expect(result).toBe(0);
    });

    test("should return null for empty leg data", () => {
      const result = calculateCheckoutPercentage([], 0);
      expect(result).toBeNull();
    });
  });

  describe("calculateCheckoutPercentageTopDarter", () => {
    test("should calculate correctly with TopDarter formula", () => {
      // 1 successful / 7 attempts = 14.29%
      const result = calculateCheckoutPercentageTopDarter(1, 7);
      expect(result).toBe(14.29);
    });

    test("should return 0 for zero attempts", () => {
      const result = calculateCheckoutPercentageTopDarter(1, 0);
      expect(result).toBe(0);
    });

    test("should calculate 100% for all successful", () => {
      const result = calculateCheckoutPercentageTopDarter(5, 5);
      expect(result).toBe(100);
    });

    test("should calculate 50% for half successful", () => {
      const result = calculateCheckoutPercentageTopDarter(5, 10);
      expect(result).toBe(50);
    });
  });

  describe("extractPlayerIdentifiers", () => {
    test("should extract correct player indices", () => {
      const statsData = [samplePlayer1Stats, samplePlayer2Stats];
      const result = extractPlayerIdentifiers(statsData, "ydcg", "hsyq");

      expect(result.firstPlayerIndex).toBe(0);
      expect(result.secondPlayerIndex).toBe(1);
    });

    test("should extract correct player indices in reverse order", () => {
      const statsData = [samplePlayer2Stats, samplePlayer1Stats];
      const result = extractPlayerIdentifiers(statsData, "ydcg", "hsyq");

      expect(result.firstPlayerIndex).toBe(1);
      expect(result.secondPlayerIndex).toBe(0);
    });

    test("should throw error for missing first player code", () => {
      const statsData = [samplePlayer1Stats, samplePlayer2Stats];
      expect(() => {
        extractPlayerIdentifiers(statsData, "nonexistent", "hsyq");
      }).toThrow();
    });

    test("should throw error for missing second player code", () => {
      const statsData = [samplePlayer1Stats, samplePlayer2Stats];
      expect(() => {
        extractPlayerIdentifiers(statsData, "ydcg", "nonexistent");
      }).toThrow();
    });
  });

  describe("Integration tests", () => {
    test("should calculate all fields for sample player 1", () => {
      const stats = samplePlayer1Stats;
      const legData = sampleLegData;

      const averageScore = calculateAverageScore(stats);
      const firstNineAvg = calculateFirstNineAverage(legData, 0);
      const checkoutPercentage = calculateCheckoutPercentage(legData, 0);
      const score60Count = calculateScoreRangeCounts(legData, 0, 60, 99);
      const score100Count = calculateScoreRangeCounts(legData, 0, 100, 139);
      const score140Count = calculateScoreRangeCounts(legData, 0, 140, 170);
      const score180Count = calculateScoreRangeCounts(legData, 0, 171, 180);
      const highFinish = calculateHighFinish(legData, 0);
      const bestLeg = calculateBestLeg(legData, 0);
      const worstLeg = calculateWorstLeg(legData, 0);

      expect(averageScore).toBeCloseTo(14.05, 1);
      expect(firstNineAvg).toBeGreaterThan(0);
      expect(checkoutPercentage).toBeCloseTo(100, 1);
      expect(score60Count).toBeGreaterThanOrEqual(0);
      expect(score100Count).toBeGreaterThanOrEqual(0);
      expect(score140Count).toBeGreaterThanOrEqual(0);
      expect(score180Count).toBeGreaterThanOrEqual(0);
      expect(highFinish).toBeGreaterThan(0);
      expect(bestLeg).toBeGreaterThan(0);
      expect(worstLeg).toBeGreaterThan(0);
    });

    test("should calculate all fields for sample player 2", () => {
      const stats = samplePlayer2Stats;
      const legData = sampleLegData;

      const averageScore = calculateAverageScore(stats);
      const firstNineAvg = calculateFirstNineAverage(legData, 1);
      const checkoutPercentage = calculateCheckoutPercentage(legData, 1);
      const score60Count = calculateScoreRangeCounts(legData, 1, 60, 99);
      const score100Count = calculateScoreRangeCounts(legData, 1, 100, 139);
      const score140Count = calculateScoreRangeCounts(legData, 1, 140, 170);
      const score180Count = calculateScoreRangeCounts(legData, 1, 171, 180);
      const highFinish = calculateHighFinish(legData, 1);
      const bestLeg = calculateBestLeg(legData, 1);
      const worstLeg = calculateWorstLeg(legData, 1);

      expect(averageScore).toBeCloseTo(13.72, 1);
      expect(firstNineAvg).toBeGreaterThan(0);
      expect(checkoutPercentage).toBe(0);
      expect(score60Count).toBeGreaterThanOrEqual(0);
      expect(score100Count).toBeGreaterThanOrEqual(0);
      expect(score140Count).toBeGreaterThanOrEqual(0);
      expect(score180Count).toBeGreaterThanOrEqual(0);
      expect(highFinish).toBe(0);
      expect(bestLeg).toBe(0);
      expect(worstLeg).toBe(0);
    });
  });
});
