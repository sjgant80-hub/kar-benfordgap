// kernel.mjs — BenfordGap v2: a first-digit screen for a column of amounts (a ledger, an expense export, a claims
// list). It counts how often each first digit 1..9 appears, compares that to Benford's Law, and says whether the
// column conforms, how strongly, and which digits to look at first. Pure, deterministic, no I/O.
// Total: any input returns { ok: false, why } or a result; it never throws.
//
// v2 fixes three faults in v1, each found by running the input class, not by reading the code:
//  1. leadingDigit divided by 10 in a loop, which drifts: 1,700 ordinary doubles (3e27, 7e57, ...) got the wrong
//     digit while the comment claimed an exhaustive check. v2 reads the digit from the number's own decimal form.
//  2. v1 flagged 3 numbers as "maximally divergent". v2 refuses to judge below a sample floor (minN, default 100).
//  3. v1 dropped every row it could not read ("£1,234.56", "(250.00)") without saying so. v2 reads ledger amounts
//     and counts every row it skips, with the reason.
//
// v2.1 fixes two faults in v2.0, found the same way: by running honest data (columns drawn to follow the law
// exactly) through it at each size. honestRates() below re-runs that measurement; the page runs it live.
//  4. v2.0 took the verdict from Nigrini's MAD bands at every size. Those bands only hold for large files: on
//     honest data they flagged 97% of 100-amount columns and 63% of 300-amount ones, and fell under 5% only at
//     about 1,000. Chi-square at its 5% line flags 4 to 5% of honest columns at every size. So under 1,000
//     amounts the verdict now comes from chi-square, and from 1,000 up from the MAD bands.
//  5. v2.0 named a digit to "look at first" whenever its z passed 1.96. With nine digits tested at once, about
//     one honest column in five got one. The look-first line is now 2.773, the 5% line shared over nine digits
//     (Bonferroni). The table's per-digit too-common and too-rare marks keep Nigrini's 1.96.

export const VERSION = '2.1.0';

/** Benford's expected share of first digit d, d = 1..9: log10(1 + 1/d). EXPECTED[0] is digit 1. */
export const EXPECTED = Object.freeze(Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1))));

/** Nigrini's first-digit MAD bands (mean absolute deviation of the nine shares). */
export const MAD_BANDS = Object.freeze([
  { upTo: 0.006, verdict: 'close', say: 'close conformity' },
  { upTo: 0.012, verdict: 'acceptable', say: 'acceptable conformity' },
  { upTo: 0.015, verdict: 'marginal', say: 'marginally acceptable conformity' },
]);

/** chi-square critical values at 8 degrees of freedom (nine digits, one constraint). */
export const CHI2_8 = Object.freeze({ p05: 15.507, p01: 20.09 });

/** z above this (two-sided 5%) marks a single digit as over- or under-represented. */
export const Z_CRIT = 1.96;

/** z above this names a digit to look at first: the two-sided 5% line shared over nine digits (Bonferroni), z(1 - 0.05/18). */
export const Z_LOOK = 2.773;

/** from this many amounts the verdict comes from Nigrini's MAD bands; below it, from chi-square (fault 4 above). */
export const MAD_FROM_N = 1000;

export const DEFAULT_MIN_N = 100;

/** Nigrini's band for a MAD: the first band whose upper edge it does not pass; null past the last (nonconformity). */
export function madBand(mad) {
  return MAD_BANDS.find((b) => mad <= b.upTo) || null;
}

/** where a chi-square (8 degrees of freedom) falls: past the 1% line, past the 5% line, or neither. */
export function chi2Band(chi2) {
  if (chi2 > CHI2_8.p01) return 'p<0.01';
  if (chi2 > CHI2_8.p05) return 'p<0.05';
  return 'p>=0.05';
}

/** a digit's z flags it only when strictly past the line. */
export function overLine(z) {
  return z > Z_CRIT;
}

/** a too-common digit is named to look at first only when its z is strictly past the nine-digit line. */
export function lookLine(z) {
  return z > Z_LOOK;
}

/** the verdict chi-square gives a column too small for the MAD bands: past the 1% line nonconformity, past 5% marginal. */
export function chi2Verdict(chi2) {
  if (chi2 > CHI2_8.p01) return 'nonconformity';
  if (chi2 > CHI2_8.p05) return 'marginal';
  return 'acceptable';
}

/** first significant digit of a finite nonzero number, from its shortest decimal form; null otherwise. */
export function leadingDigit(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return null;
  return Math.abs(n).toExponential().charCodeAt(0) - 48;
}

const PLAIN = /^(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;
const GROUPED = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

/**
 * a ledger amount as a number, or null. Reads: 1234.56 · "1,234.56" · "£1,234.56" · "-$99" · "(250.00)" (a
 * negative, accountants' style) · " 12 " · "1e3". Refuses anything ambiguous rather than guessing: "1,5", "1.234,56",
 * "12abc", "", "(-3)". Commas are only read as thousands groups of three.
 */
export function parseAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) { neg = true; s = s.slice(1, -1).trim(); }
  if (s.startsWith('-') || s.startsWith('+')) {
    if (neg) return null; // a sign inside accountants' brackets is ambiguous
    neg = s[0] === '-';
    s = s.slice(1);
  }
  s = s.replace(/^[£$€¥]\s*/, '').replace(/\s*(GBP|USD|EUR)$/i, '');
  if (s.includes(',')) {
    if (!GROUPED.test(s)) return null;
    s = s.split(',').join('');
  }
  if (!PLAIN.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** v1's single number, kept: half the summed absolute gap between observed and expected shares, 0 (exact) to 1. */
export function benfordScore(numbers) {
  if (!Array.isArray(numbers)) return { ok: false, why: 'input is not an array' };
  const counts = new Array(9).fill(0);
  let total = 0;
  for (const n of numbers) {
    const d = leadingDigit(n);
    if (d === null) continue;
    counts[d - 1] += 1;
    total += 1;
  }
  if (total === 0) return { ok: false, why: 'no valid nonzero finite numbers in input' };
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Math.abs(counts[i] / total - EXPECTED[i]);
  return { ok: true, score: sum / 2, n: total, counts };
}

/**
 * the screen. values: an array of numbers or ledger strings. opts.minN: the fewest usable amounts it will judge.
 * Returns the counts, the shares, MAD with Nigrini's band, chi-square against the 5% and 1% critical values, a z
 * per digit, the digits to look at first, how many orders of magnitude the data spans, every skipped row by reason,
 * and one verdict: too-few · close · acceptable · marginal · nonconformity. verdictBy says which test gave it:
 * 'MAD' from MAD_FROM_N amounts up, 'chi-square' below that, 'none' when there are too few to judge.
 */
export function audit(values, opts) {
  try {
    if (!Array.isArray(values)) return { ok: false, why: 'give a list of amounts' };
    const o = opts && typeof opts === 'object' ? opts : {};
    const minN = o.minN === undefined ? DEFAULT_MIN_N : o.minN;
    if (!Number.isInteger(minN) || minN < 1) return { ok: false, why: 'minN must be a whole number, 1 or more' };

    const counts = new Array(9).fill(0);
    const skipped = { unreadable: 0, zero: 0 };
    let n = 0, lo = Infinity, hi = 0;
    for (const v of values) {
      const a = parseAmount(v);
      if (a === null) { skipped.unreadable += 1; continue; }
      if (a === 0) { skipped.zero += 1; continue; }
      const abs = Math.abs(a);
      counts[leadingDigit(abs) - 1] += 1;
      n += 1;
      lo = Math.min(lo, abs);
      hi = Math.max(hi, abs);
    }
    if (n === 0) return { ok: false, why: 'no usable nonzero amounts in the list', skipped, rows: values.length };

    const shares = counts.map((c) => c / n);
    let chi2 = 0, gap = 0;
    const digits = [];
    for (let i = 0; i < 9; i++) {
      const e = EXPECTED[i];
      const diff = shares[i] - e;
      gap += Math.abs(diff);
      chi2 += (counts[i] - n * e) ** 2 / (n * e);
      // Nigrini's z for one digit, with the continuity correction 1/(2n), floored at 0
      const z = Math.max(0, (Math.abs(diff) - 1 / (2 * n)) / Math.sqrt(e * (1 - e) / n));
      const flagged = overLine(z), side = Math.sign(diff);
      digits.push({ digit: i + 1, count: counts[i], share: shares[i], expected: e, z, high: flagged && side === 1, low: flagged && side === -1 });
    }
    const mad = gap / 9;
    const span = Math.log10(hi / lo);
    const band = madBand(mad);
    const tooFew = n < minN;
    const verdictBy = tooFew ? 'none' : n < MAD_FROM_N ? 'chi-square' : 'MAD';
    const verdict = tooFew ? 'too-few' : verdictBy === 'MAD' ? (band ? band.verdict : 'nonconformity') : chi2Verdict(chi2);
    const lookFirst = tooFew ? [] : digits.filter((d) => d.high && lookLine(d.z)).sort((a, b) => b.z - a.z).map((d) => d.digit);

    const notes = [];
    if (tooFew) notes.push(`only ${n} usable amounts; below ${minN} the first-digit pattern is mostly noise, so no verdict is given`);
    else if (n < DEFAULT_MIN_N) notes.push(`the floor was lowered to ${minN}; with ${n} amount(s), treat the verdict as weak`);
    if (verdictBy === 'chi-square') notes.push(`under ${MAD_FROM_N} amounts, so the verdict comes from the chi-square test: Nigrini's MAD bands flag most honest columns this small`);
    if (span < 2) notes.push(`the amounts span ${span.toFixed(2)} orders of magnitude; Benford's Law needs data spread over several (two or more), so treat any verdict as weak`);
    if (skipped.unreadable) notes.push(`${skipped.unreadable} row(s) could not be read as an amount and were left out`);
    if (skipped.zero) notes.push(`${skipped.zero} zero amount(s) left out (zero has no first digit)`);

    return {
      ok: true, version: VERSION, rows: values.length, n, minN, skipped, counts, shares, digits,
      mad, madSay: tooFew ? 'not judged' : band ? band.say : 'nonconformity',
      chi2, chi2Band: chi2Band(chi2), score: gap / 2, span, verdict, verdictBy, lookFirst, notes,
    };
  } catch {
    return { ok: false, why: 'the list could not be read' };
  }
}

/**
 * how often this screen flags honest data. Draws `trials` columns of n amounts that follow Benford's Law exactly
 * (spread evenly on a log scale over four orders of magnitude, from a seeded generator, so the same seed always
 * gives the same answer) and returns the share of them that Nigrini's MAD bands alone would flag (marginal or
 * worse), that chi-square at 5% would flag, that get a digit to look at first, and that this screen's verdict flags.
 */
export function honestRates(n, trials, seed) {
  if (!Number.isInteger(n) || n < 1 || n > 100000) return { ok: false, why: 'n must be a whole number from 1 to 100,000' };
  if (!Number.isInteger(trials) || trials < 1 || trials > 10000) return { ok: false, why: 'trials must be a whole number from 1 to 10,000' };
  if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295) return { ok: false, why: 'seed must be a whole number from 0 to 4,294,967,295' };
  let s = seed;
  // a linear congruential generator in plain doubles: s stays under 2^32, so s * 1664525 stays exact
  const next = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  let mad = 0, chi2 = 0, look = 0, flagged = 0;
  for (let t = 0; t < trials; t++) {
    const v = [];
    for (let i = 0; i < n; i++) v.push(10 ** (1 + 4 * next()));
    const r = audit(v, { minN: 1 });
    const band = madBand(r.mad);
    if (!band || band.verdict === 'marginal') mad += 1;
    if (r.chi2Band !== 'p>=0.05') chi2 += 1;
    if (r.lookFirst.length) look += 1;
    if (r.verdict === 'marginal' || r.verdict === 'nonconformity') flagged += 1;
  }
  return { ok: true, n, trials, seed, mad: mad / trials, chi2: chi2 / trials, look: look / trials, flagged: flagged / trials };
}

/**
 * one column of a CSV as a list of cell strings. column: a header name (exact, case-insensitive) or a 0-based index.
 * Handles quoted cells with commas and doubled quotes, CRLF, and a trailing newline. Rows too short for the column
 * count as missing and are returned as ''.
 */
export function csvColumn(text, column) {
  try {
    if (typeof text !== 'string' || text.trim() === '') return { ok: false, why: 'the CSV is empty' };
    const src = text.replace(/\r\n?/g, '\n');
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (q) {
        if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    const kept = rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
    const header = kept[0];
    let idx;
    if (typeof column === 'number') idx = column;
    else if (typeof column === 'string') idx = header.findIndex((h) => h.trim().toLowerCase() === column.trim().toLowerCase());
    else return { ok: false, why: 'name the column or give its number' };
    if (!Number.isInteger(idx) || idx < 0 || idx >= header.length) return { ok: false, why: 'that column is not in the header', header };
    return { ok: true, header, column: header[idx], values: kept.slice(1).map((r) => (idx < r.length ? r[idx] : '')) };
  } catch {
    return { ok: false, why: 'the CSV could not be read' };
  }
}

export default { VERSION, EXPECTED, MAD_BANDS, CHI2_8, Z_CRIT, Z_LOOK, MAD_FROM_N, DEFAULT_MIN_N, leadingDigit, parseAmount, madBand, chi2Band, overLine, lookLine, chi2Verdict, benfordScore, audit, honestRates, csvColumn };
