# Checkout Percentage Calculation - TopDarter Analysis

**Date**: 2026-09-09  
**Status**: 🔴 **BLOCKING ISSUE - REQUIRES DATA VERIFICATION**

---

## Executive Summary

The TopDarter checkout percentage algorithm is **fundamentally different** from simple success rate calculations. It requires tracking `dartsAtDouble` (darts aimed at double per visit), which **may not be available** in the Nakka API response.

**Key Finding**: The provided Nakka API response structure does NOT explicitly include `dartsAtDouble` data, making accurate checkout percentage calculation impossible without API modification or data reverse-engineering.

---

## TopDarter Algorithm Reference

### Formula
```
checkoutPercentage = (successfulCheckouts / dartsAtDouble) * 100
```

### Components

**1. DartVisit Record**
```typescript
{
  score: number;          // Points scored this visit
  remaining: number;      // Remaining points after visit
  dartsThrown: number;    // Total darts thrown
  dartsAtDouble: number;  // Darts aimed at double (KEY FIELD)
}
```

**2. Calculation Logic**
```typescript
function calculateCheckoutPercentage(visits: DartVisit[]): number {
  // Sum ALL darts aimed at double across all visits
  const totalDartsAtDouble = visits.reduce(
    (sum, visit) => sum + visit.dartsAtDouble, 
    0
  );

  // Edge case: no attempts at doubles
  if (totalDartsAtDouble === 0) return 0;

  // Count visits where remaining = 0 (successful)
  const successfulCheckouts = visits.filter(
    visit => visit.remaining === 0
  ).length;

  // Calculate percentage with 2 decimal places
  return Math.round(
    (successfulCheckouts / totalDartsAtDouble) * 100 * 100
  ) / 100;
}
```

### Important Notes

**✓ Correct Aggregation**
- When combining multiple matches, **sum the numerators and denominators**
- Example: (1/2 + 1/10 + 2/5) should be calculated as (1+1+2)/(2+10+5) = 4/17 = 23.53%

**✗ Wrong Aggregation**
- Do NOT average percentages: (50% + 10% + 40%) / 3 = 33.33% ❌
- This loses information about the different sample sizes

---

## Why DartsAtDouble is Essential

### The Ambiguity Problem

Given only `{ score: 40, remaining: 0, dartsThrown: 2 }`, we cannot determine `dartsAtDouble`:

**Scenario 1**: D20, D20
```
Start: 40 remaining
Dart 1: Hit D20 → 20 remaining
Dart 2: Hit D20 → 0 remaining ✓
dartsAtDouble = 2
```

**Scenario 2**: Miss D20, D20
```
Start: 40 remaining  
Dart 1: Miss D20 → 40 remaining
Dart 2: Hit D20 → 20 remaining ✗
```
(This doesn't match the example - would have 20 remaining, not 0)

**Scenario 3**: T10, D10
```
Start: 40 remaining
Dart 1: T10 (triple) → 10 remaining
Dart 2: D10 (double) → 0 remaining ✓
dartsAtDouble = 1
```

**Scenario 4**: T5, T5, D10
```
Start: 40 remaining
Dart 1: T5 → 25 remaining
Dart 2: T5 → 10 remaining
Dart 3: D10 → 0 remaining ✓
(But we only have 2 darts thrown - doesn't match)
```

**Conclusion**: Without explicit `dartsAtDouble`, we cannot reliably determine the number of double attempts.

---

## Analysis of Sample Data

### Provided Requirements Sample

```json
{
  "legData": [
    // Leg 1, Leg 2, Leg 3
    { "playerData": [[...], [...]], ... },
    { "playerData": [[...], [...]], ... },
    { "playerData": [[...], [...]], ... }
  ],
  "statsData": [
    {
      "name": "Pacek Mateusz",
      "tpid": "ydcg",
      "winLegs": 3,
      "allScore": 1503,
      "allDarts": 107
    },
    {
      "name": "Pacek Mikołaj",
      "tpid": "hsyq",
      "winLegs": 0,
      "allScore": 1441,
      "allDarts": 105
    }
  ]
}
```

### Current Data vs Required

| Field | Available | Required | Status |
|-------|-----------|----------|--------|
| score | ✓ | ✓ | Have it |
| remaining | ✓ | ✓ | Have it |
| dartsThrown | ✗ | ✓ | **MISSING** |
| dartsAtDouble | ✗ | ✓ | **MISSING** ❌ |

### Expected Checkout Percentages

- Player 1 (ydcg): **7.5%** (per requirements)
- Player 2 (hsyq): **0%** (per requirements)

### Hypothesis Testing

**Hypothesis 1: Simple Success Rate**
```
Player 1: 3 legs total, 1 won = 1/3 = 33.33%  ❌ (expected 7.5%)
Player 2: 3 legs total, 0 won = 0/3 = 0%      ✓ (matches!)
```
Partially correct but doesn't match Player 1.

**Hypothesis 2: Unknown dartsAtDouble**
```
Player 1: 1 successful / X dartsAtDouble = 7.5%
         => X = 1 / 0.075 = 13.33 (approximately 13)
         
This suggests Player 1 had ~13 darts aimed at double across 3 legs
```

If this is correct, then the API response **must contain** dartsAtDouble data somewhere.

---

## Where DartsAtDouble Comes From

### n01 Scoring System
In original n01, when a player throws darts:
1. Scorer inputs each dart's score
2. For **each finishing visit**, scorer explicitly indicates **number of darts aimed at double**
3. This creates the `dartsAtDouble` value

### Nakka Implementation
Nakka claims to track "Checkout Mode" (as per your note). This likely means:
- Nakka tracks which darts were aimed at double
- This could be:
  1. Explicitly stored in the API response (we need to find it)
  2. Calculated from dart sequences (e.g., double starts at end of visit)
  3. Inferred from leg outcomes

---

## Potential Sources in Nakka API

### Checked ❌ Not Found
- `dartsAtDouble` - direct field
- `darts_at_double` - snake_case variant
- `doublesAttempted` - alternative name
- Within `playerData[][]` array - detailed dart info

### Unchecked ⓘ Not Yet Verified
- Different API endpoint (e.g., `cmd=match_detail` instead of `cmd=match_view`)
- `n01_history.php` API with different parameters
- Response headers or metadata
- Nested within `statsData` array
- Computed field based on score patterns

---

## Implementation Approach - DECISION REQUIRED

### Option A: Use Simple Success Rate (TEMPORARY)
```typescript
function calculateCheckoutPercentage(legData: NakkaLegData[], playerIndex: number): number {
  const legCount = legData.length;
  const successfulCount = legData.filter(leg => 
    leg.playerData[playerIndex][leg.playerData[playerIndex].length - 1].left === 0
  ).length;
  
  return legCount === 0 ? 0 : (successfulCount / legCount) * 100;
}
```

**Pros**: 
- Works with current API data
- Quick to implement

**Cons**: 
- Incorrect per TopDarter algorithm
- Won't match 7.5% expected value
- Misleading statistic

### Option B: Reverse-Engineer from Patterns (NOT RECOMMENDED)
Try to infer `dartsAtDouble` from score sequences:
```typescript
// Pseudocode - highly unreliable
if (score === 0 && remaining === 0) {
  // Final visit - likely aimed at double
  dartsAtDouble = estimateFromPattern(previousScores);
}
```

**Pros**: 
- Doesn't require API changes

**Cons**: 
- Highly error-prone
- No validation possible
- Would fail on edge cases

### Option C: Find dartsAtDouble in API (RECOMMENDED)
1. Make actual API request
2. Inspect full response structure
3. Search for `dartsAtDouble` data
4. Verify with known match results

**Pros**: 
- Correct algorithm
- Reliable results

**Cons**: 
- Requires API investigation
- May need API endpoint modification
- Blocks implementation

### Option D: Hybrid Approach (BEST PRACTICE)
1. Implement checkout calculation with placeholder
2. Store both:
   - Simple success rate (current capability)
   - Checkout percentage **with TODO comment**
3. Once `dartsAtDouble` is available:
   - Update calculation function
   - Recalculate historical data if needed

### Option E: Keep Chromium Fallback (SAFEST)
- Use API for performance metrics (average_score, first_nine, etc.)
- Keep Chromium scraper for checkout percentage only
- Merge results before saving to database

**Pros**:
- No loss of accuracy
- Proven algorithm
- Gradual transition possible

**Cons**:
- Still uses Chromium (memory overhead)
- More complex code
- Defeats some migration benefits

---

## Recommendation

### Immediate Action (BEFORE IMPLEMENTATION)

**Priority 1: Verify API Data**
1. Make request to actual Nakka API with provided match ID
2. Pretty-print full JSON response
3. Search for any `double*`, `checkout*`, or `attempt*` fields
4. Check if leg structure has additional fields

**Priority 2: Review Requirements**
1. How was 7.5% originally calculated in Chromium version?
2. Does Chromium scraper extract `dartsAtDouble` from somewhere?
3. Is there documentation on Nakka checkout mode?

**Priority 3: Decision**
1. If `dartsAtDouble` found in API → Use Option C (correct algorithm)
2. If `dartsAtDouble` NOT found → Choose Option D or E
3. Document final approach in implementation code

---

## Code Template - Once Verified

### If dartsAtDouble IS Available

```typescript
interface NakkaVisit {
  score: number;
  remaining: number;
  dartsThrown: number;
  dartsAtDouble: number;  // ✓ If found
}

function calculateCheckoutPercentage(visits: NakkaVisit[]): number {
  const attempts = visits.reduce((sum, v) => sum + v.dartsAtDouble, 0);
  
  if (attempts === 0) return 0;
  
  const successful = visits.filter(v => v.remaining === 0).length;
  
  return Math.round((successful / attempts) * 100 * 100) / 100;
}
```

### If dartsAtDouble is NOT Available

```typescript
function calculateCheckoutPercentage(legData: NakkaLegData[], playerIndex: number): number {
  // TODO: Verify this is the correct approach
  // Requirements specify 7.5% for player 1, but we cannot calculate this
  // from API data without dartsAtDouble. See checkout-percentage-analysis.md
  
  const legCount = legData.length;
  const successful = legData.filter(leg =>
    leg.endFlag === 1 && 
    leg.playerData[playerIndex][leg.playerData[playerIndex].length - 1].left === 0
  ).length;
  
  return legCount === 0 ? 0 : (successful / legCount) * 100;
}
```

---

## Testing Approach

Once implemented, test with:

```typescript
// Sample data with known result
const matches = [
  {
    id: "t_4XDx_2564_rr_0_hsyq_ydcg",
    player1: "ydcg",
    player1Expected: 7.5,
    player2: "hsyq", 
    player2Expected: 0.0
  }
];

// Verify calculation matches expected
for (const match of matches) {
  const result = calculateCheckoutPercentage(apiData, playerIndex);
  assert(result === match.expectedPercentage);
}
```

---

## Summary

| Aspect | Status | Impact |
|--------|--------|--------|
| Algorithm Known | ✓ | TopDarter reference provided |
| Data Available in API | ❌ | **BLOCKING** |
| Can Calculate 7.5% | ❌ | **BLOCKING** |
| Simple Alternative | ✓ | Partial solution available |
| Implementation Ready | ❌ | Awaiting verification |

**BLOCKING**: Cannot proceed with implementation until API data is verified.

---

**Document Version**: 1.0  
**Status**: 🔴 **BLOCKING - AWAITING VERIFICATION**  
**Action Required**: Verify dartsAtDouble availability in Nakka API response
