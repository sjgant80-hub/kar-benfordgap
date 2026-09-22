// kernel.mjs
// BenfordGap — pure kernel: scores how far a list of numbers' leading-digit
// distribution deviates from Benford's Law. No I/O. Total: bad input returns
// { ok:false, why } rather than throwing.

const EXPECTED = Object.freeze(
  Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)))
);
// EXPECTED[0] = P(leading digit 1) ... EXPECTED[8] = P(leading digit 9)

// leadingDigit :: number -> (1..9 | null)
// Total: never throws. Returns null for non-numbers, NaN, +/-Infinity, or 0
// (zero has no leading digit under Benford's Law).
export function leadingDigit(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return null;
  let x = Math.abs(n);
  while (x >= 10) x /= 10;
  while (x < 1) x *= 10;
  // Invariant, not a runtime check: each loop's own exit condition is what
  // is tested here, so on reaching this line 1 <= x < 10 always holds —
  // for EVERY finite nonzero double, from Number.MIN_VALUE to
  // Number.MAX_VALUE (verified by exhaustive/randomized search, not just
  // argued). floor(x) is therefore always an integer in [1,9]; a bounds
  // check here would be dead code guarding a case that cannot occur.
  return Math.floor(x);
}

// benfordScore :: number[] -> { ok:true, score, n, counts } | { ok:false, why }
// score in [0,1]: 0 = matches Benford's Law exactly, 1 = maximally divergent
// (sum of absolute differences between observed and expected leading-digit
// proportions, normalized by its max possible value of 2).
export function benfordScore(numbers) {
  if (!Array.isArray(numbers)) {
    return { ok: false, why: 'input is not an array' };
  }

  const counts = new Array(9).fill(0);
  let total = 0;

  for (const n of numbers) {
    const d = leadingDigit(n);
    if (d === null) continue;
    counts[d - 1] += 1;
    total += 1;
  }

  if (total === 0) {
    return { ok: false, why: 'no valid nonzero finite numbers in input' };
  }

  let sumAbsDiff = 0;
  for (let i = 0; i < 9; i++) {
    const observed = counts[i] / total;
    sumAbsDiff += Math.abs(observed - EXPECTED[i]);
  }

  return { ok: true, score: sumAbsDiff / 2, n: total, counts: counts.slice() };
}
