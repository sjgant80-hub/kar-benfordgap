import { test } from 'node:test';
import assert from 'node:assert/strict';
import K, { VERSION, EXPECTED, MAD_BANDS, CHI2_8, Z_CRIT, Z_LOOK, MAD_FROM_N, DEFAULT_MIN_N, leadingDigit, parseAmount, madBand, chi2Band, overLine, lookLine, chi2Verdict, benfordScore, audit, honestRates, csvColumn } from './kernel.mjs';

const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const POW2 = Array.from({ length: 1000 }, (_, i) => 2 ** (i + 1));
// 20 amounts for each first digit: a flat (non-Benford) spread over less than one order of magnitude
const FLAT = []; for (let d = 1; d <= 9; d++) for (let j = 0; j < 20; j++) FLAT.push(d * 100 + j);
const CHI_NOTE = "under 1000 amounts, so the verdict comes from the chi-square test: Nigrini's MAD bands flag most honest columns this small";

test('constants: Benford shares, Nigrini bands, chi-square criticals, z, floor, version', () => {
  assert.equal(EXPECTED.length, 9);
  near(EXPECTED[0], 0.3010299956639812); near(EXPECTED[8], 0.04575749056067513);
  near(EXPECTED.reduce((a, b) => a + b, 0), 1);
  assert.deepEqual(MAD_BANDS.map((b) => [b.upTo, b.verdict]), [[0.006, 'close'], [0.012, 'acceptable'], [0.015, 'marginal']]);
  assert.deepEqual(MAD_BANDS.map((b) => b.say), ['close conformity', 'acceptable conformity', 'marginally acceptable conformity']);
  assert.deepEqual({ ...CHI2_8 }, { p05: 15.507, p01: 20.09 });
  assert.equal(Z_CRIT, 1.96); assert.equal(Z_LOOK, 2.773); assert.equal(MAD_FROM_N, 1000); assert.equal(DEFAULT_MIN_N, 100); assert.equal(VERSION, '2.1.0');
  assert.ok(Object.isFrozen(EXPECTED) && Object.isFrozen(MAD_BANDS) && Object.isFrozen(CHI2_8));
  assert.equal(K.audit, audit); assert.equal(K.csvColumn, csvColumn); assert.equal(K.leadingDigit, leadingDigit);
  assert.equal(K.parseAmount, parseAmount); assert.equal(K.benfordScore, benfordScore); assert.equal(K.VERSION, VERSION);
  assert.equal(K.honestRates, honestRates); assert.equal(K.Z_LOOK, Z_LOOK); assert.equal(K.MAD_FROM_N, MAD_FROM_N);
  assert.equal(K.EXPECTED, EXPECTED); assert.equal(K.MAD_BANDS, MAD_BANDS); assert.equal(K.CHI2_8, CHI2_8);
  assert.equal(K.Z_CRIT, Z_CRIT); assert.equal(K.DEFAULT_MIN_N, DEFAULT_MIN_N);
});

test('leadingDigit: the v1 drift fault is gone on the whole power grid, both extremes included', () => {
  let bad = 0;
  for (let k = -323; k <= 308; k++) for (let d = 1; d <= 9; d++) {
    const n = Number(`${d}e${k}`); if (n === 0 || !Number.isFinite(n)) continue;
    if (leadingDigit(n) !== Number(n.toExponential()[0])) bad++;
  }
  assert.equal(bad, 0);
  assert.equal(leadingDigit(3e27), 3); assert.equal(leadingDigit(7e57), 7); // v1 said 2 and 6
  assert.equal(leadingDigit(Number.MIN_VALUE), 5); assert.equal(leadingDigit(Number.MAX_VALUE), 1);
  assert.equal(leadingDigit(-0.0042), 4); assert.equal(leadingDigit(9.99), 9); assert.equal(leadingDigit(1), 1);
  for (const x of [0, -0, NaN, Infinity, -Infinity, '5', null, undefined, {}, 5n]) assert.equal(leadingDigit(x), null);
});

test('parseAmount: ledger forms read, ambiguous forms refused', () => {
  const ok = { '£1,234.56': 1234.56, '(250.00)': -250, '-$99': -99, ' 12 ': 12, '1e3': 1000, '+7': 7, '€ 5': 5,
    '1,234,567.8 GBP': 1234567.8, '¥300': 300, '10 usd': 10, '.5': 0.5, '5.': 5, '-(3)': null, '0': 0, '12,345': 12345,
    '  (1,000)  ': -1000, '2EUR': 2, '-0.07': -0.07 };
  for (const [k, v] of Object.entries(ok)) assert.equal(parseAmount(k), v, k);
  for (const k of ['1,5', '1.234,56', '12abc', '', '(-3)', '(+3)', '--5', '+-5', 'USD', '£', '1,2345', ',123', '1e', 'e3', '1.2.3', '(5', '5)', '1 000', '(123x', 'x123)'])
    assert.equal(parseAmount(k), null, k);
  assert.equal(parseAmount(42.5), 42.5); assert.equal(parseAmount(-1), -1);
  for (const x of [NaN, Infinity, null, undefined, {}, [], true, '1e999']) assert.equal(parseAmount(x), null);
});

test('benfordScore (v1 API) keeps its contract', () => {
  const r = benfordScore([1, 10, 100, 1000, 0, 'x', NaN]);
  assert.deepEqual(r.counts, [4, 0, 0, 0, 0, 0, 0, 0, 0]); assert.equal(r.n, 4); assert.equal(r.ok, true);
  near(r.score, 0.6989700043360188);
  near(benfordScore([1, 2, 3, 4, 5, 6, 7, 8, 9]).score, 0.2687266579946291);
  assert.equal(benfordScore([]).ok, false); assert.equal(benfordScore([0]).why, 'no valid nonzero finite numbers in input');
  assert.equal(benfordScore('x').why, 'input is not an array');
});

test('audit: powers of 2 (a sequence that follows Benford exactly in the limit) conform closely', () => {
  const a = audit(POW2);
  assert.equal(a.ok, true); assert.equal(a.version, '2.1.0'); assert.equal(a.rows, 1000); assert.equal(a.n, 1000); assert.equal(a.verdictBy, 'MAD');
  assert.deepEqual(a.counts, [301, 176, 125, 97, 79, 69, 56, 52, 45]);
  near(a.shares[0], 0.301); near(a.shares[8], 0.045);
  near(a.mad, 0.0006782085123664783); near(a.chi2, 0.15855057629204392); near(a.score, 0.0030519383056491524);
  near(a.span, 300.7289656683172, 1e-6);
  assert.deepEqual(a.digits.map((d) => d.z).map((z) => Math.round(z * 1e6)), [0, 0, 0, 0, 0, 196522, 201856, 49876, 38967]);
  assert.equal(a.verdict, 'close'); assert.equal(a.madSay, 'close conformity'); assert.equal(a.chi2Band, 'p>=0.05');
  assert.deepEqual(a.lookFirst, []); assert.deepEqual(a.notes, []); assert.equal(a.minN, 100);
  assert.deepEqual(a.digits[0], { digit: 1, count: 301, share: 0.301, expected: EXPECTED[0], z: 0, high: false, low: false });
});

test('audit: a flat spread is nonconformity, names the high digits by z and flags the low ones', () => {
  const a = audit(FLAT);
  assert.deepEqual(a.counts, [20, 20, 20, 20, 20, 20, 20, 20, 20]);
  near(a.mad, 0.05971703510991756); near(a.chi2, 72.30569272419241);
  assert.equal(a.verdict, 'nonconformity'); assert.equal(a.madSay, 'nonconformity'); assert.equal(a.chi2Band, 'p<0.01');
  assert.equal(a.verdictBy, 'chi-square');
  // digit 6 is too common at 1.96 (z 2.22) but under the nine-digit line 2.773, so it is marked in the table, not named
  assert.deepEqual(a.lookFirst, [9, 8, 7]);
  assert.deepEqual(a.digits.filter((d) => d.low).map((d) => d.digit), [1, 2]);
  assert.deepEqual(a.digits.filter((d) => d.high).map((d) => d.digit), [6, 7, 8, 9]);
  near(a.digits[0].z, 5.4735777393680864); near(a.digits[1].z, 2.1909614259676458); near(a.digits[4].z, 1.4484638619875931);
  near(a.span, 0.9633155113861113);
  assert.deepEqual(a.notes, [CHI_NOTE, "the amounts span 0.96 orders of magnitude; Benford's Law needs data spread over several (two or more), so treat any verdict as weak"]);
});

test('audit: below the floor it refuses to judge (v1 called 3 numbers maximally divergent)', () => {
  const a = audit([1, 10, 100]);
  assert.equal(a.ok, true); assert.equal(a.verdict, 'too-few'); assert.equal(a.madSay, 'not judged'); assert.deepEqual(a.lookFirst, []); assert.equal(a.verdictBy, 'none');
  assert.equal(a.notes[0], 'only 3 usable amounts; below 100 the first-digit pattern is mostly noise, so no verdict is given');
  assert.equal(a.notes.length, 1); near(a.span, 2);
  assert.equal(audit(FLAT, { minN: 181 }).verdict, 'too-few'); assert.equal(audit(FLAT, { minN: 180 }).verdict, 'nonconformity');
  assert.deepEqual(audit(FLAT, { minN: 181 }).lookFirst, []);
  // with the floor lowered, one amount is judged by chi-square (11.63, under the 5% line) and the verdict is marked weak
  const one = audit([5], { minN: 1 });
  assert.equal(one.verdict, 'acceptable'); assert.equal(one.minN, 1); assert.equal(one.verdictBy, 'chi-square'); near(one.chi2, 11.629253136513338);
  assert.deepEqual(one.notes.slice(0, 2), ['the floor was lowered to 1; with 1 amount(s), treat the verdict as weak', CHI_NOTE]);
  // the weak note is for judged columns under the usual floor of 100: 99 gets it, 100 does not, and too-few never does
  assert.deepEqual(audit(POW2.slice(0, 99), { minN: 50 }).notes, ['the floor was lowered to 50; with 99 amount(s), treat the verdict as weak', CHI_NOTE]);
  assert.deepEqual(audit(POW2.slice(0, 100), { minN: 50 }).notes, [CHI_NOTE]);
  assert.deepEqual(audit(POW2.slice(0, 99), { minN: 100 }).notes, ['only 99 usable amounts; below 100 the first-digit pattern is mostly noise, so no verdict is given']);
  assert.equal(audit([5], {}).minN, 100); assert.equal(audit([5], null).minN, 100); assert.equal(audit([5], 7).minN, 100);
  for (const m of [0, -1, 1.5, '10', null, NaN]) assert.equal(audit([5], { minN: m }).why, 'minN must be a whole number, 1 or more');
});

test('audit: every skipped row is counted with its reason', () => {
  const a = audit([...POW2, '£oops', 0, '0.00', '(1,000)', '', 'x']);
  assert.equal(a.rows, 1006); assert.equal(a.n, 1001); assert.deepEqual(a.skipped, { unreadable: 3, zero: 2 });
  assert.equal(a.counts[0], 302);
  assert.deepEqual(a.notes, ['3 row(s) could not be read as an amount and were left out', '2 zero amount(s) left out (zero has no first digit)']);
  const none = audit([0, 'x', '']);
  assert.deepEqual(none, { ok: false, why: 'no usable nonzero amounts in the list', skipped: { unreadable: 2, zero: 1 }, rows: 3 });
  assert.equal(audit('x').why, 'give a list of amounts'); assert.equal(audit(null).ok, false);
});

test('audit: MAD band edges, chi-square edges, span edge, high vs low', () => {
  // the band chosen is the first whose upper edge the MAD does not pass
  const mk = (mad) => MAD_BANDS.find((b) => mad <= b.upTo);
  assert.equal(mk(0.006).verdict, 'close'); assert.equal(mk(0.0060001).verdict, 'acceptable'); assert.equal(mk(0.015).verdict, 'marginal');
  assert.equal(mk(0.0150001), undefined);
  // a sample whose shares are Benford's to within rounding: n = 1000 counts rounded from the expected shares
  const counts = EXPECTED.map((e) => Math.round(e * 1000));
  const vals = []; counts.forEach((c, i) => { for (let j = 0; j < c; j++) vals.push((i + 1) * 10 ** (j % 4)); });
  const a = audit(vals);
  assert.equal(a.verdict, 'close'); assert.equal(a.chi2Band, 'p>=0.05'); assert.ok(a.span >= 2); assert.deepEqual(a.notes, []);
  // span exactly 2 is not narrow; just under is
  const spanNotes = (v) => audit(v, { minN: 1 }).notes.filter((x) => x.startsWith('the amounts span')).length;
  assert.equal(spanNotes([1, 100]), 0);
  assert.equal(spanNotes([1, 99.9]), 1);
  // chi-square: turning the largest powers of 2 into 1s tilts digit 1; 81 is under 5%, 82 crosses it, 92 is under 1%, 93 crosses
  const tilt = (extra) => { const v = POW2.slice(); for (let i = 0; i < extra; i++) v[v.length - 1 - i] = 1; return audit(v); };
  assert.equal(tilt(81).chi2Band, 'p>=0.05'); assert.equal(tilt(82).chi2Band, 'p<0.05'); assert.equal(tilt(92).chi2Band, 'p<0.05'); assert.equal(tilt(93).chi2Band, 'p<0.01');
  near(tilt(82).chi2, 15.886837077029272); near(tilt(93).chi2, 20.35672861469575);
  // one digit's z test is more sensitive than the overall chi-square: 45 extra 1s mark digit 1 too common (z 2.10),
  // and 59 name it to look at first (z 2.79 passes the nine-digit line; 58 gives 2.72), all while chi-square is under 5%
  assert.equal(tilt(45).chi2Band, 'p>=0.05'); assert.deepEqual(tilt(45).lookFirst, []);
  assert.equal(tilt(45).digits[0].high, true); assert.equal(tilt(45).digits[0].low, false);
  assert.deepEqual(tilt(58).lookFirst, []); assert.deepEqual(tilt(59).lookFirst, [1]); assert.equal(tilt(59).chi2Band, 'p>=0.05');
  near(tilt(58).digits[0].z, 2.7210280485223985, 1e-9); near(tilt(59).digits[0].z, 2.789967185831773, 1e-9);
  // negative amounts count by their size
  assert.deepEqual(audit(POW2.map((x) => -x)).counts, audit(POW2).counts);
});

test('audit: z sits exactly at the line it is compared to', () => {
  // a digit whose z equals Z_CRIT is not flagged (strictly greater flags)
  const a = audit(FLAT);
  for (const d of a.digits) { assert.equal(d.high, d.share > d.expected && d.z > Z_CRIT); assert.equal(d.low, d.share < d.expected && d.z > Z_CRIT); }
  // continuity correction: with n=1, a digit equal to its expected count rounding gives z floored at 0, never negative
  for (const d of audit([1], { minN: 1 }).digits) assert.ok(d.z >= 0);
  near(audit([1], { minN: 1 }).digits[1].z, Math.max(0, (EXPECTED[1] - 0.5) / Math.sqrt(EXPECTED[1] * (1 - EXPECTED[1]))));
  near(audit([1], { minN: 1 }).digits[0].z, (1 - EXPECTED[0] - 0.5) / Math.sqrt(EXPECTED[0] * (1 - EXPECTED[0])));
});

test('csvColumn: header by name or index, quotes, CRLF, blank lines, short rows', () => {
  const t = 'id,Amount,note\r\n1,"1,200.00","a, ""b"""\r\n2,30\r\n\r\n3,(5.00),x\n';
  const r = csvColumn(t, ' amount ');
  assert.deepEqual(r, { ok: true, header: ['id', 'Amount', 'note'], column: 'Amount', values: ['1,200.00', '30', '(5.00)'] });
  assert.deepEqual(csvColumn(t, 2).values, ['a, "b"', '', 'x']);
  assert.deepEqual(csvColumn('a\n1\n2', 0).values, ['1', '2']);
  assert.deepEqual(csvColumn('a,b\n1,2', 'b').values, ['2']);
  assert.deepEqual(csvColumn('a,b\n"x\ny",2\n', 0).values, ['x\ny']);
  assert.equal(csvColumn(t, 'missing').why, 'that column is not in the header');
  assert.deepEqual(csvColumn(t, 'missing').header, ['id', 'Amount', 'note']);
  for (const c of [3, -1, 1.5]) assert.equal(csvColumn(t, c).ok, false);
  assert.equal(csvColumn(t, null).why, 'name the column or give its number');
  for (const x of ['', '  \n', null, 5]) assert.equal(csvColumn(x, 0).why, 'the CSV is empty');
  // end to end: a ledger column straight into the screen
  const a = audit(csvColumn(t, 'amount').values, { minN: 1 });
  assert.deepEqual(a.counts, [1, 0, 1, 0, 1, 0, 0, 0, 0]); assert.equal(a.skipped.unreadable, 0);
});

test('fuzz: no input class throws', () => {
  const junk = [undefined, null, 0, -1, NaN, '', 'x', {}, [], [[]], [{}], [null, undefined, NaN], Symbol('s'), () => 1, 5n, [5n, Symbol('t')], new Proxy([], { get() { throw new Error('boom'); } })];
  for (const j of junk) {
    for (const f of [() => audit(j), () => audit([j]), () => audit([1, 2], j), () => csvColumn(j, j), () => csvColumn('a\n1', j), () => parseAmount(j), () => leadingDigit(j), () => benfordScore([j]), () => honestRates(j, j, j)]) {
      assert.doesNotThrow(f);
    }
  }
  assert.equal(audit(new Proxy([], { get() { throw new Error('boom'); } })).why, 'the list could not be read');
});

test('the three lines, tested exactly on the line', () => {
  assert.equal(madBand(0).verdict, 'close'); assert.equal(madBand(0.006).verdict, 'close'); assert.equal(madBand(0.0060001).verdict, 'acceptable');
  assert.equal(madBand(0.012).verdict, 'acceptable'); assert.equal(madBand(0.0120001).verdict, 'marginal');
  assert.equal(madBand(0.015).verdict, 'marginal'); assert.equal(madBand(0.0150001), null);
  assert.equal(chi2Band(20.09), 'p<0.05'); assert.equal(chi2Band(20.0901), 'p<0.01');
  assert.equal(chi2Band(15.507), 'p>=0.05'); assert.equal(chi2Band(15.5071), 'p<0.05'); assert.equal(chi2Band(0), 'p>=0.05');
  assert.equal(overLine(1.96), false); assert.equal(overLine(1.9600001), true); assert.equal(overLine(0), false);
  assert.equal(lookLine(2.773), false); assert.equal(lookLine(2.7730001), true); assert.equal(lookLine(2.5), false);
  assert.equal(chi2Verdict(0), 'acceptable'); assert.equal(chi2Verdict(15.507), 'acceptable'); assert.equal(chi2Verdict(15.5071), 'marginal');
  assert.equal(chi2Verdict(20.09), 'marginal'); assert.equal(chi2Verdict(20.0901), 'nonconformity');
  assert.equal(K.madBand, madBand); assert.equal(K.chi2Band, chi2Band); assert.equal(K.overLine, overLine); assert.equal(K.lookLine, lookLine); assert.equal(K.chi2Verdict, chi2Verdict);
});

test('csvColumn: CR alone and CRLF read the same as LF', () => {
  const LF = String.fromCharCode(10), CR = String.fromCharCode(13);
  const mk = (e) => ['a,b', '1,2', '3,4', ''].join(e);
  const lf = csvColumn(mk(LF), 'b').values;
  assert.deepEqual(lf, ['2', '4']);
  assert.deepEqual(csvColumn(mk(CR), 'b').values, lf);
  assert.deepEqual(csvColumn(mk(CR + LF), 'b').values, lf);
  assert.deepEqual(csvColumn(['a,b', '1,2', '3,4'].join(CR + LF), 'b').values, lf);
  assert.deepEqual(csvColumn(['a,b', '"x' + CR + LF + 'y",2'].join(CR + LF), 'a').values, ['x' + LF + 'y']);
});

test('the verdict switches test at MAD_FROM_N: 999 amounts by chi-square, 1,000 by the MAD bands', () => {
  const a999 = audit(POW2.slice(0, 999)), a1000 = audit(POW2);
  assert.equal(a999.verdictBy, 'chi-square'); assert.equal(a999.verdict, 'acceptable'); assert.equal(a999.madSay, 'close conformity');
  assert.deepEqual(a999.notes, [CHI_NOTE]);
  assert.equal(a1000.verdictBy, 'MAD'); assert.equal(a1000.verdict, 'close'); assert.deepEqual(a1000.notes, []);
  // past the MAD bands on a big file is nonconformity, whatever chi-square says
  const big = []; for (let d = 1; d <= 9; d++) for (let j = 0; j < 120; j++) big.push(d * 10 ** (j % 4) + j / 1000);
  const b = audit(big);
  assert.equal(b.n, 1080); assert.equal(b.verdictBy, 'MAD'); assert.equal(b.verdict, 'nonconformity'); assert.equal(b.madSay, 'nonconformity');
});

test('honestRates: how often honest data is flagged, re-run exactly from a seed (v2.0 fault 4 and 5)', () => {
  // the MAD bands alone flag almost every honest 100-amount column; the shipped verdict flags 5%
  assert.deepEqual(honestRates(100, 200, 1), { ok: true, n: 100, trials: 200, seed: 1, mad: 0.985, chi2: 0.05, look: 0.04, flagged: 0.05 });
  assert.deepEqual(honestRates(300, 100, 2), { ok: true, n: 300, trials: 100, seed: 2, mad: 0.59, chi2: 0.04, look: 0.02, flagged: 0.04 });
  // at 1,000 the verdict is the MAD band's, and it flags what the bands flag
  assert.deepEqual(honestRates(1000, 40, 7), { ok: true, n: 1000, trials: 40, seed: 7, mad: 0.05, chi2: 0.1, look: 0.075, flagged: 0.05 });
  assert.deepEqual(honestRates(100, 20, 3), honestRates(100, 20, 3));
  assert.notDeepEqual(honestRates(100, 50, 3), honestRates(100, 50, 4));
  // every edge of every input
  for (const [n, tr, s] of [[1, 1, 0], [100000, 1, 0], [1, 10000, 0], [1, 1, 4294967295]]) assert.equal(honestRates(n, tr, s).ok, true);
  for (const [n, tr, s, why] of [
    [0, 1, 0, 'n must be a whole number from 1 to 100,000'], [100001, 1, 0, 'n must be a whole number from 1 to 100,000'], [1.5, 1, 0, 'n must be a whole number from 1 to 100,000'],
    [1, 0, 0, 'trials must be a whole number from 1 to 10,000'], [1, 10001, 0, 'trials must be a whole number from 1 to 10,000'], [1, '1', 0, 'trials must be a whole number from 1 to 10,000'],
    [1, 1, -1, 'seed must be a whole number from 0 to 4,294,967,295'], [1, 1, 4294967296, 'seed must be a whole number from 0 to 4,294,967,295'], [1, 1, '1', 'seed must be a whole number from 0 to 4,294,967,295'],
  ]) assert.deepEqual(honestRates(n, tr, s), { ok: false, why });
});
