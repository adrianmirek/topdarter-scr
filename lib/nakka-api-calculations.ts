/**
 * Nakka API Calculations - Helper functions for extracting and calculating player statistics
 * from Nakka tournament API responses
 */

/**
 * Dart data structure from Nakka API
 */
export interface NakkaDartData {
  score: number;
  left: number;
}

/**
 * Leg data structure from Nakka API
 */
export interface NakkaLegData {
  time: number;
  first: number;
  currentRound: number;
  selectRound: number;
  endFlag: number;
  middleForDiddle: number;
  winner: number;
  playerData: NakkaDartData[][];
  startTime: number;
  endTime: number;
}

/**
 * Player stats structure from Nakka API
 */
export interface NakkaPlayerStatsData {
  name: string;
  tid: string;
  sname: string;
  fid: string;
  gid: string;
  country: string;
  pid: string;
  tpid: string;
  order: number | null;
  me: number;
  winSets: number;
  winLegs: number;
  allScore: number;
  allDarts: number;
  allMarks: number;
}

/**
 * Complete Nakka API response structure
 */
export interface NakkaApiMatchResponse {
  tdid: string;
  lgid: string;
  tmid: string;
  ttype: string;
  round: string;
  gs_round: number;
  t_no: number;
  mid: string;
  scid: string;
  scMode: number;
  schid: string;
  exitResult: number;
  autoNext: number;
  startTime: number;
  updateTime: number;
  title: string;
  orgTitle: string;
  match_type: string;
  startScore: number;
  roundLimit: number;
  maxRound: number;
  overkill: number;
  currnetInput: string;
  currentSet: number;
  currentLeg: number;
  limitSet: number;
  limitLeg: number;
  drawMode: number;
  endMatch: number;
  viewMode: number;
  relayMode: number;
  tournamentMode: number;
  private: number;
  delete: number;
  legData: NakkaLegData[];
  statsData: NakkaPlayerStatsData[];
}

/**
 * Groups playerData into rounds (visits)
 * Each round normally has 3 darts, unless final round has fewer
 * Negative scores (-1, -2, -3) indicate final round with 1, 2, or 3 darts
 * @param playerDarts - Array of dart data for a player
 * @returns Array of round totals
 */
function groupDartsIntoRounds(playerDarts: NakkaDartData[]): number[] {
  const rounds: number[] = [];
  let currentRound = 0;
  let dartsInRound = 0;

  for (const dart of playerDarts) {
    // Negative score indicates final round (checkout attempt)
    if (dart.score < 0) {
      // Final round with fewer than 3 darts
      rounds.push(currentRound);
      currentRound = 0;
      dartsInRound = 0;
    } else {
      currentRound += dart.score;
      dartsInRound++;

      // Normal round has 3 darts
      if (dartsInRound === 3) {
        rounds.push(currentRound);
        currentRound = 0;
        dartsInRound = 0;
      }
    }
  }

  // Push any remaining round
  if (dartsInRound > 0) {
    rounds.push(currentRound);
  }

  return rounds;
}

/**
 * Calculates average score per round (visit) for a player across all legs
 * Uses statsData: average = allScore * 3 / allDarts
 * (3 because normally 3 darts per round, except final round with negative score)
 * @param statsData - Player statistics from API
 * @returns Average score per round or null if no darts thrown
 */
export function calculateAverageScore(statsData: NakkaPlayerStatsData): number | null {
  if (statsData.allDarts === 0) return null;
  // average = total score * (darts per round) / total darts
  const average = (statsData.allScore * 3) / statsData.allDarts;
  return Math.round(average * 100) / 100; // Round to 2 decimals
}

/**
 * Calculates average score for first 9 darts (first 3 actual throws per leg)
 * Formula: average of (per-leg first 3 darts average)
 * Note: First dart in each leg is score=0 (starting position), so we skip it
 * For each leg: (dart[1] + dart[2] + dart[3]) / 3
 * Then average all these per-leg averages
 * @param legData - Array of leg data
 * @param playerIndex - Index of player (0 or 1)
 * @returns Average of first 3 darts per leg (excluding starting 0)
 */
export function calculateFirstNineAverage(
  legData: NakkaLegData[],
  playerIndex: number
): number | null {
  if (legData.length === 0) return null;

  let sumOfPerLegAverages = 0;
  let legCount = 0;

  // Process each leg
  for (const leg of legData) {
    const playerDarts = leg.playerData[playerIndex];
    if (!playerDarts || playerDarts.length < 4) continue;

    // Take first 3 ACTUAL darts (skip index 0 which is starting position with score=0)
    // Use indices 1, 2, 3
    const firstThreeDarts = playerDarts.slice(1, 4);
    const sum = firstThreeDarts.reduce((total, dart) => total + dart.score, 0);
    const legAverage = sum / 3;

    sumOfPerLegAverages += legAverage;
    legCount++;
  }

  if (legCount === 0) return null;

  // Calculate average of all per-leg averages
  const firstNineAverage = sumOfPerLegAverages / legCount;
  return Math.round(firstNineAverage * 100) / 100; // Round to 2 decimals
}

/**
 * Counts visit scores within a range (min and max inclusive).
 * Buckets used by scrape-player-results:
 * - score_60_count:  60 <= score < 100  (60-99)
 * - score_100_count: 100 <= score < 140 (100-139)
 * - score_140_count: 140 <= score < 171 (140-170)
 * - score_180_count: 171 <= score <= 180
 */
export function calculateScoreRangeCounts(
  legData: NakkaLegData[],
  playerIndex: number,
  minScore: number,
  maxScore: number
): number {
  let count = 0;

  for (const leg of legData) {
    const playerDarts = leg.playerData[playerIndex];
    if (!playerDarts) continue;

    for (const dart of playerDarts) {
      if (dart.score >= minScore && dart.score <= maxScore) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Calculates the highest finish (checkout value) of the entire match.
 * The finish of a leg is the remaining score at the start of the visit that
 * reached left === 0 (Nakka stores that visit as a negative dart-count score).
 */
export function calculateHighFinish(
  legData: NakkaLegData[],
  playerIndex: number
): number {
  let maxFinish = 0;

  for (const leg of legData) {
    const playerDarts = leg.playerData[playerIndex];
    if (!playerDarts || playerDarts.length === 0) continue;

    const finish = getLegCheckoutScore(playerDarts);
    if (finish !== null && finish > maxFinish) {
      maxFinish = finish;
    }
  }

  return maxFinish;
}

function getLegCheckoutScore(playerDarts: NakkaDartData[]): number | null {
  const finalDart = playerDarts[playerDarts.length - 1];
  if (finalDart.left !== 0) return null;

  const previousDart = playerDarts.length > 1 ? playerDarts[playerDarts.length - 2] : null;
  if (previousDart) {
    return previousDart.left;
  }

  return finalDart.score > 0 ? finalDart.score : null;
}

/**
 * Counts darts thrown in a visit.
 * Opening {score: 0, left: 501} is not a visit.
 * A normal visit is 3 darts (including score 0).
 * A negative score is the finishing visit dart count (-1/-2/-3).
 */
function countDartsInVisit(dart: NakkaDartData, visitIndex: number): number {
  if (visitIndex === 0 && dart.score === 0) {
    return 0;
  }
  if (dart.score < 0) {
    return Math.abs(dart.score);
  }
  return 3;
}

function countDartsInFinishedLeg(playerDarts: NakkaDartData[]): number | null {
  if (playerDarts.length === 0) return null;
  const finalDart = playerDarts[playerDarts.length - 1];
  if (finalDart.left !== 0) return null;

  let dartCount = 0;
  for (let i = 0; i < playerDarts.length; i++) {
    dartCount += countDartsInVisit(playerDarts[i], i);
  }
  return dartCount;
}

/**
 * Dart counts for legs this player finished (checked out).
 * Unfinished / opponent-won legs are omitted.
 */
export function calculateLegScores(
  legData: NakkaLegData[],
  playerIndex: number
): number[] {
  const dartCounts: number[] = [];

  for (const leg of legData) {
    const playerDarts = leg.playerData[playerIndex];
    if (!playerDarts) continue;

    const dartCount = countDartsInFinishedLeg(playerDarts);
    if (dartCount !== null) {
      dartCounts.push(dartCount);
    }
  }

  return dartCounts;
}

/**
 * Best leg: fewest darts used to finish a leg this player won.
 */
export function calculateBestLeg(
  legData: NakkaLegData[],
  playerIndex: number
): number {
  const dartCounts = calculateLegScores(legData, playerIndex);
  if (dartCounts.length === 0) return 0;
  return Math.min(...dartCounts);
}

/**
 * Worst leg: most darts used to finish a leg this player won.
 */
export function calculateWorstLeg(
  legData: NakkaLegData[],
  playerIndex: number
): number {
  const dartCounts = calculateLegScores(legData, playerIndex);
  if (dartCounts.length === 0) return 0;
  return Math.max(...dartCounts);
}

/**
 * Extracts player indices from stats data based on player codes
 * @param statsData - Array of player statistics
 * @param firstPlayerCode - Code for first player (tpid)
 * @param secondPlayerCode - Code for second player (tpid)
 * @returns Object with firstPlayerIndex and secondPlayerIndex
 */
export function extractPlayerIdentifiers(
  statsData: NakkaPlayerStatsData[],
  firstPlayerCode: string,
  secondPlayerCode: string
): { firstPlayerIndex: number; secondPlayerIndex: number } {
  let firstPlayerIndex = -1;
  let secondPlayerIndex = -1;

  for (let i = 0; i < statsData.length; i++) {
    if (statsData[i].tpid === firstPlayerCode) {
      firstPlayerIndex = i;
    }
    if (statsData[i].tpid === secondPlayerCode) {
      secondPlayerIndex = i;
    }
  }

  if (firstPlayerIndex === -1 || secondPlayerIndex === -1) {
    throw new Error(
      `Player codes not found in stats data. First: ${firstPlayerCode}, Second: ${secondPlayerCode}`
    );
  }

  return { firstPlayerIndex, secondPlayerIndex };
}

/**
 * Bogey numbers that cannot be finished in 3 darts (101-170 rule)
 * These numbers require an additional round, so don't count as missed darts
 */
const BOGEY_NUMBERS = [159, 162, 163, 165, 166, 168, 169];

/**
 * Determines how many darts were attempted at double for a given remaining score
 * when trying to finish the leg
 * 
 * Rules:
 * - >170: 0 darts (impossible to finish; max checkout is 170)
 * - 101-170: 1 dart can be missed (needs 3 darts minimum to finish, like 120)
 * - 100: 2 darts can be missed (can finish with T20 + D20)
 * - 99: 1 dart can be missed (exception/edge case - needs 3 darts minimum)
 * - 41-98: 2 darts can be missed
 * - ≤40: 3 darts can be missed (can hit any double from D20 down to D1)
 * - Bogey numbers (159,162,163,165,166,168,169): 0 darts (needs another round)
 * 
 * BUT: need to check if next round remaining is > 40 (no double available)
 * If next round remaining > 40, then no darts at double are counted for this attempt
 */
function calculateDartsAtDoubleForFinish(
  remainingScore: number,
  nextRoundRemaining: number | null
): number {
  // Impossible to finish above 170 (highest 3-dart checkout is 170)
  if (remainingScore > 170) {
    return 0;
  }

  // If next round remaining > 40, cannot finish in next round, so 0 darts at double counted
  if (nextRoundRemaining !== null && nextRoundRemaining > 40) {
    return 0;
  }

  // Rule: ≤40 - always 3 darts at double
  if (remainingScore <= 40) {
    return 3;
  }

  // Bogey numbers - don't count (need another round)
  if (BOGEY_NUMBERS.includes(remainingScore)) {
    return 0;
  }

  // Rule: 101-170 - 1 dart can be missed (needs 3 darts minimum)
  if (remainingScore > 100) {
    return 1;
  }

  // Rule: 100 - 2 darts can be missed
  if (remainingScore === 100) {
    return 2;
  }

  // Exception: 99 - 1 dart can be missed (edge case)
  if (remainingScore === 99) {
    return 1;
  }

  // Rule: 41-98 - 2 darts can be missed
  if (remainingScore >= 41 && remainingScore <= 98) {
    return 2;
  }

  return 0; // Default
}

/**
 * Odd remainings under 40 cannot be finished with a double until one dart
 * leaves an even number, so that visit has one fewer dart at double.
 */
function isOddRemainingUnder40(remaining: number): boolean {
  return remaining > 0 && remaining < 40 && remaining % 2 === 1;
}

function applyOddRemainingAttemptAdjustment(
  dartsAtDouble: number,
  remainingAtStart: number | null
): number {
  if (remainingAtStart !== null && isOddRemainingUnder40(remainingAtStart)) {
    return Math.max(0, dartsAtDouble - 1);
  }
  return dartsAtDouble;
}

/**
 * Calculates checkout percentage based on Nakka scoring rules
 * 
 * Algorithm:
 * 1. Each DART at remaining ≤40 is a separate checkout ATTEMPT
 * 2. Darts at double depends on context:
 *    - If PREVIOUS remaining was >40 (just entered ≤40): Apply rules based on previous value
 *    - If PREVIOUS remaining was ≤40 (continuing): Always 3 darts
 *    - If score < 0 (final round): theoretical darts at double from previous remaining,
 *      minus unused darts in that visit. A successful checkout counts as 1.
 *      Example: 95 needs 2 darts; -2 => 1/1 = 100%; -3 => 1/2 = 50%.
 *    - If the visit starts on an odd remaining under 40: subtract 1 attempt
 *      (a single is required before a double is available).
 * 3. Successful checkouts: when left == 0
 * 
 * @param legData - Array of leg data
 * @param playerIndex - Index of player (0 or 1)
 * @returns Checkout percentage (0-100) or null if no checkout attempts
 */
export function calculateCheckoutAttemptCounts(
  legData: NakkaLegData[],
  playerIndex: number
): { successfulCheckouts: number; totalDartsAtDouble: number } {
  let successfulCheckouts = 0;
  let totalDartsAtDouble = 0;

  // Process each leg
  for (const leg of legData) {
    const playerDarts = leg.playerData[playerIndex];
    if (!playerDarts || playerDarts.length === 0) continue;

    // Process each dart
    for (let i = 0; i < playerDarts.length; i++) {
      const dart = playerDarts[i];
      const prevDart = i > 0 ? playerDarts[i - 1] : null;

      // Handle final rounds (negative score)
      if (dart.score < 0) {
        const actualDarts = Math.abs(dart.score);
        let theoreticalDartsAtDouble: number;

        if (prevDart && prevDart.left > 40) {
          // Entered finish from >40: darts at double if a full 3-dart visit was used
          theoreticalDartsAtDouble = calculateDartsAtDoubleForFinish(
            prevDart.left,
            dart.left
          );
        } else {
          // Already in ≤40: every dart in a 3-dart visit can be at double
          theoreticalDartsAtDouble = 3;
        }

        // Unused darts are not attempts (e.g. -2 from 95: 2 needed, 1 unused → 1 attempt)
        const unusedDarts = 3 - actualDarts;
        let dartsAtDouble = Math.max(0, theoreticalDartsAtDouble - unusedDarts);
        dartsAtDouble = applyOddRemainingAttemptAdjustment(
          dartsAtDouble,
          prevDart ? prevDart.left : null
        );

        totalDartsAtDouble += dartsAtDouble;

        if (dart.left === 0) {
          successfulCheckouts++;
        }
      }
      // Handle darts in finishing range (≤40)
      else if (dart.left <= 40 && dart.left > 0) {
        let dartsAtDouble: number;

        // Check if we just ENTERED finishing range (previous was >40)
        if (prevDart && prevDart.left > 40) {
          // Just entered ≤40: apply rules based on PREVIOUS remaining value
          dartsAtDouble = calculateDartsAtDoubleForFinish(prevDart.left, dart.left);
        } else {
          // Continuing in ≤40: always 3 darts
          dartsAtDouble = 3;
        }

        dartsAtDouble = applyOddRemainingAttemptAdjustment(
          dartsAtDouble,
          prevDart ? prevDart.left : null
        );

        totalDartsAtDouble += dartsAtDouble;

        if (dart.left === 0) {
          successfulCheckouts++;
        }
      }
      // Handle successful finish (left = 0)
      else if (dart.left === 0 && dart.score >= 0) {
        // Successful finish with non-final round score
        let dartsAtDouble = 3;
        dartsAtDouble = applyOddRemainingAttemptAdjustment(
          dartsAtDouble,
          prevDart ? prevDart.left : null
        );
        totalDartsAtDouble += dartsAtDouble;
        successfulCheckouts++;
      }
    }
  }

  return { successfulCheckouts, totalDartsAtDouble };
}

export function calculateCheckoutPercentage(
  legData: NakkaLegData[],
  playerIndex: number
): number | null {
  const { successfulCheckouts, totalDartsAtDouble } =
    calculateCheckoutAttemptCounts(legData, playerIndex);

  if (totalDartsAtDouble === 0) return null;

  const percentage = (successfulCheckouts / totalDartsAtDouble) * 100;
  return Math.round(percentage * 100) / 100; // Round to 2 decimals
}

/**
 * Alternative checkout percentage calculation using TopDarter algorithm
 * Use this if dartsAtDouble data is available
 * Formula: (successfulCheckouts / dartsAtDouble) * 100
 *
 * @param successfulCheckouts - Number of successful checkouts
 * @param dartsAtDouble - Total darts aimed at double
 * @returns Checkout percentage (0-100)
 */
export function calculateCheckoutPercentageTopDarter(
  successfulCheckouts: number,
  dartsAtDouble: number
): number {
  if (dartsAtDouble === 0) return 0;
  const percentage = (successfulCheckouts / dartsAtDouble) * 100;
  return Math.round(percentage * 100) / 100; // Round to 2 decimals
}
