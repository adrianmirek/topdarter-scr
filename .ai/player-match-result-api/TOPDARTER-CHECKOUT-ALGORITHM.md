# TopDarter Checkout Algorithm Reference

**Source**: Provided analysis from TopDarter implementation  
**Date**: 2026-09-09  
**Status**: Reference implementation provided

---

## 1. Core Concept

### Simple Definition
**Checkout percentage** = (successful checkouts) / (darts aimed at double) × 100

### Why It Matters
- Measures accuracy of finishing attempts
- Different from "success rate" which counts legs
- Requires tracking attempts at double, not just outcomes

---

## 2. Example Calculations

### Example 1: Single Match with 3 Visits

```
Visit 1: 40 remaining
  Throw 1: Miss D20 (still 40)
  Throw 2: Miss D20 (still 40)  
  Throw 3: S20    (goes down to 20)
  Darts at double: 2
  Success: No (remaining = 20)

Visit 2: 20 remaining
  Throw 1: Miss D10
  Throw 2: Miss D10
  Throw 3: Miss D10
  Darts at double: 3
  Success: No (remaining = 20)

Visit 3: 20 remaining
  Throw 1: Miss D10
  Throw 2: D10 ✓
  Darts at double: 2
  Success: Yes (remaining = 0)

Result:
  Successful checkouts: 1
  Total darts at double: 2 + 3 + 2 = 7
  Percentage: 1 / 7 × 100 = 14.29%
```

### Example 2: Three Matches (Aggregation)

```
Match A: 1 successful / 2 attempts = 50%
Match B: 1 successful / 10 attempts = 10%
Match C: 2 successful / 5 attempts = 40%

WRONG: (50 + 10 + 40) / 3 = 33.33% ❌
       (This ignores sample sizes)

CORRECT: (1 + 1 + 2) / (2 + 10 + 5) = 4 / 17 = 23.53% ✓
         (Sum numerators, sum denominators)
```

### Example 3: No Attempts at Double

```
Visit 1: 100 remaining
  Throw 1: T20 (40 left)
  Throw 2: T20 (40 left)
  Throw 3: T20 (40 left)
  Darts at double: 0
  Success: No

Result:
  Successful checkouts: 0
  Total darts at double: 0
  Percentage: 0 / 0 → 0% (by default, not NaN)
```

---

## 3. C# Implementation (Reference)

### Object-Oriented Version

```csharp
public sealed class CheckoutStats
{
    public int CheckoutAttempts { get; private set; }
    public int Checkouts { get; private set; }

    public decimal CheckoutPercentage =>
        CheckoutAttempts == 0
            ? 0m
            : Math.Round(
                (decimal)Checkouts / CheckoutAttempts * 100m,
                2,
                MidpointRounding.AwayFromZero);

    public void AddVisit(int dartsAtDouble, bool checkout)
    {
        if (dartsAtDouble < 0 || dartsAtDouble > 3)
            throw new ArgumentOutOfRangeException(
                nameof(dartsAtDouble),
                "Darts at double must be between 0 and 3.");

        if (checkout && dartsAtDouble == 0)
            throw new ArgumentException(
                "A successful checkout must contain at least one dart at double.");

        CheckoutAttempts += dartsAtDouble;

        if (checkout)
            Checkouts++;
    }
}

// Usage Example
var stats = new CheckoutStats();
stats.AddVisit(dartsAtDouble: 2, checkout: false);  // Visit 1: failed
stats.AddVisit(dartsAtDouble: 3, checkout: false);  // Visit 2: failed
stats.AddVisit(dartsAtDouble: 2, checkout: true);   // Visit 3: success

Console.WriteLine(stats.Checkouts);          // 1
Console.WriteLine(stats.CheckoutAttempts);   // 7
Console.WriteLine(stats.CheckoutPercentage); // 14.29
```

### Functional Version (Immutable)

```csharp
public record DartVisit(
    int Score,
    int Remaining,
    int DartsThrown,
    int DartsAtDouble);

public record CheckoutStatistics(
    int Checkouts,
    int Attempts,
    decimal Percentage);

public static class CheckoutCalculator
{
    public static CheckoutStatistics Calculate(
        IEnumerable<DartVisit> visits)
    {
        var visitList = visits.ToList();

        // Sum all darts aimed at double
        var attempts = visitList.Sum(x => x.DartsAtDouble);

        // Count visits that finished (remaining = 0)
        var checkouts = visitList.Count(x =>
            x.Remaining == 0 &&
            x.DartsAtDouble > 0);

        // Calculate with proper rounding
        var percentage = attempts == 0
            ? 0m
            : Math.Round(
                (decimal)checkouts / attempts * 100m,
                2,
                MidpointRounding.AwayFromZero);

        return new CheckoutStatistics(
            checkouts,
            attempts,
            percentage);
    }
}

// Usage Example
var visits = new[]
{
    new DartVisit(
        Score: 45,
        Remaining: 40,
        DartsThrown: 3,
        DartsAtDouble: 0),

    new DartVisit(
        Score: 0,
        Remaining: 40,
        DartsThrown: 3,
        DartsAtDouble: 3),

    new DartVisit(
        Score: 40,
        Remaining: 0,
        DartsThrown: 2,
        DartsAtDouble: 2)
};

var result = CheckoutCalculator.Calculate(visits);
// Result: Checkouts = 1, Attempts = 5, Percentage = 20.00
```

---

## 4. TypeScript Implementation

```typescript
interface DartVisit {
  score: number;
  remaining: number;
  dartsThrown: number;
  dartsAtDouble: number;
}

interface CheckoutStatistics {
  checkouts: number;
  attempts: number;
  percentage: number;
}

function calculateCheckoutPercentage(visits: DartVisit[]): CheckoutStatistics {
  // Sum all darts aimed at double across all visits
  const attempts = visits.reduce((sum, visit) => sum + visit.dartsAtDouble, 0);
  
  // Edge case: no attempts at doubles means 0% by default
  if (attempts === 0) {
    return {
      checkouts: 0,
      attempts: 0,
      percentage: 0,
    };
  }
  
  // Count visits where remaining = 0 (successful checkout)
  const checkouts = visits.filter(visit => visit.remaining === 0).length;
  
  // Calculate percentage with 2 decimal places
  const percentage = Math.round(
    (checkouts / attempts) * 100 * 100
  ) / 100;
  
  return {
    checkouts,
    attempts,
    percentage,
  };
}

// Usage
const visits: DartVisit[] = [
  { score: 45, remaining: 40, dartsThrown: 3, dartsAtDouble: 2 },
  { score: 0, remaining: 40, dartsThrown: 3, dartsAtDouble: 3 },
  { score: 40, remaining: 0, dartsThrown: 2, dartsAtDouble: 2 },
];

const result = calculateCheckoutPercentage(visits);
console.log(result);
// { checkouts: 1, attempts: 7, percentage: 14.29 }
```

---

## 5. Key Validation Rules

### ✓ Valid Cases
```
dartsAtDouble > 0 AND remaining == 0  → Successful checkout
dartsAtDouble > 0 AND remaining > 0   → Failed attempt at checkout
dartsAtDouble == 0                    → No attempt at double
```

### ✗ Invalid Cases
```
dartsAtDouble == 0 AND remaining == 0 → INVALID
  (Cannot finish without aiming at double)

dartsAtDouble > 3                      → INVALID
  (Maximum 3 darts per visit)

dartsAtDouble < 0                      → INVALID
  (Negative darts impossible)
```

---

## 6. Rounding and Precision

### Rule: MidpointRounding.AwayFromZero
```csharp
Math.Round(14.285m, 2, MidpointRounding.AwayFromZero)
= 14.29  // Rounds up when exactly halfway

Math.Round(14.284m, 2, MidpointRounding.AwayFromZero)
= 14.28  // Rounds down normally

Math.Round(14.286m, 2, MidpointRounding.AwayFromZero)
= 14.29  // Rounds up normally
```

### Equivalent in TypeScript
```typescript
// Method 1: Using standard Math.round
Math.round((14.285 * 100)) / 100  // = 14.29

// Method 2: Using proper rounding function
function round(value: number, decimals: number): number {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

round(14.285, 2)  // = 14.29
```

---

## 7. Nakka-Specific Considerations

### Problem: DartsAtDouble May Not Be Explicit

**In n01 scoring system**: Scorer explicitly enters how many darts aimed at double

**In Nakka data**: The `dartsAtDouble` value might be:
1. Explicitly stored in the API response
2. Calculated/inferred from dart sequences
3. Not available at all

### Solution: Checkout Mode
Nakka documents "Checkout Mode" as a feature to show checkout success percentage.
This suggests:
- Nakka tracks the necessary data
- It may be stored differently than n01
- Need to find the exact field/calculation

### Critical Difference from Simple Rate
```
WRONG: (legs_won / total_legs) * 100
  Example: 1 leg won / 3 legs = 33.33%

CORRECT: (successful_checkouts / darts_at_double) * 100
  Example: 1 successful / 7 attempts = 14.29%
```

For requirements sample:
- Player 1: 1 leg won / 3 legs = 33.33% ❌
- But requirements say: 7.5% ✓
- This means: 1 successful / ~13 darts at double = 7.7% ≈ 7.5%

**Conclusion**: DartsAtDouble data MUST be available in Nakka API somewhere.

---

## 8. Aggregation Rules (Important!)

### Correct Aggregation
When combining multiple matches or tournaments, aggregate at the metric level:

```typescript
function aggregateCheckoutPercentage(matchResults: CheckoutStatistics[]): number {
  const totalCheckouts = matchResults.reduce((sum, r) => sum + r.checkouts, 0);
  const totalAttempts = matchResults.reduce((sum, r) => sum + r.attempts, 0);
  
  if (totalAttempts === 0) return 0;
  
  return Math.round((totalCheckouts / totalAttempts) * 100 * 100) / 100;
}

// Example
const matches = [
  { checkouts: 1, attempts: 2, percentage: 50 },
  { checkouts: 1, attempts: 10, percentage: 10 },
  { checkouts: 2, attempts: 5, percentage: 40 },
];

aggregateCheckoutPercentage(matches)
= (1 + 1 + 2) / (2 + 10 + 5) * 100
= 4 / 17 * 100
= 23.53%

// NOT: (50 + 10 + 40) / 3 = 33.33% ❌
```

### Database Design Implication
Store atomic checkout data:
```sql
CREATE TABLE PlayerVisit (
  id INT PRIMARY KEY,
  playerId INT,
  matchId INT,
  score INT,
  remaining INT,
  dartsThrown INT,
  dartsAtDouble INT,  -- KEY FIELD
  FOREIGN KEY (playerId) REFERENCES Player(id),
  FOREIGN KEY (matchId) REFERENCES Match(id)
);

-- Then calculate percentage from atomic data
SELECT 
  SUM(CASE WHEN remaining = 0 THEN 1 ELSE 0 END) as checkouts,
  SUM(dartsAtDouble) as attempts,
  ROUND(
    SUM(CASE WHEN remaining = 0 THEN 1 ELSE 0 END) * 100.0 / 
    SUM(dartsAtDouble),
    2
  ) as checkoutPercentage
FROM PlayerVisit
WHERE playerId = ?
```

---

## 9. Implementation Checklist

When implementing checkout percentage in TypeScript/JavaScript:

- [ ] Define DartVisit interface with dartsAtDouble field
- [ ] Implement calculateCheckoutPercentage function
- [ ] Add edge case handling (zero attempts)
- [ ] Verify rounding to 2 decimal places
- [ ] Test with provided examples
- [ ] Validate with sample match data (7.5%)
- [ ] Ensure aggregation uses sum-of-numerators rule
- [ ] Add TypeScript strict mode checks
- [ ] Document algorithm in code comments
- [ ] Create unit tests with known results

---

## 10. References

### Source Documents
1. TopDarter C# implementation (provided)
2. Original n01 checkout mode specification (referenced)
3. Nakka "Checkout Mode" feature documentation (to be verified)

### Key Insights
1. TopDarter uses functional programming approach (preferred)
2. Rounding uses "away from zero" method
3. Aggregation MUST use sum-of-fractions, not average
4. Database should store atomic visit data for recalculation
5. Nakka may have different field names/structure

---

**Version**: 1.0  
**Status**: Reference Implementation Complete  
**Next Step**: Verify DartsAtDouble availability in Nakka API
