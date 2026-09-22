import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as K from './kernel.mjs';

const EPS = 1e-9;

test('pure powers of ten: all leading digit 1, maximal skew', () => {
  const r = K.benfordScore([1, 10, 100, 1000]);
  assert.equal(r.ok, true);
  assert.equal(r.n, 4);
  assert.deepEqual(r.counts, [4, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.ok(Math.abs(r.score - 0.6989700043360188) < EPS);
});

test('sign invariance: negative powers of ten score identically to positive', () => {
  const r = K.benfordScore([-1, -10, -100, -1000]);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.score - 0.6989700043360188) < EPS);
});

test('uniform leading digits 1-9: closer to Benford but still measurably off', () => {
  const r = K.benfordScore([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(r.ok, true);
  assert.equal(r.n, 9);
  assert.deepEqual(r.counts, [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.ok(Math.abs(r.score - 0.2687266579946291) < EPS);
});

test('empty array is invalid input, not a throw', () => {
  const r = K.benfordScore([]);
  assert.equal(r.ok, false);
  assert.equal(typeof r.why, 'string');
});

test('all zeros: no leading digits exist, invalid input', () => {
  const r = K.benfordScore([0, 0, 0]);
  assert.equal(r.ok, false);
  assert.equal(typeof r.why, 'string');
});

test('non-array input never throws, returns ok:false', () => {
  const r = K.benfordScore('not an array');
  assert.equal(r.ok, false);
  assert.equal(typeof r.why, 'string');
  assert.equal(K.leadingDigit(NaN), null);
  assert.equal(K.leadingDigit(Infinity), null);
});

test('smallest representable double still yields a valid digit 1-9', () => {
  // Number.MIN_VALUE (5e-324) exercises the `x < 1` multiply loop through
  // its full range near the subnormal floor — pins that the result never
  // falls out of [1,9] even at the extreme low end.
  const d = K.leadingDigit(Number.MIN_VALUE);
  assert.equal(d, 4);
  assert.ok(d >= 1 && d <= 9);
});

test('largest representable double still yields a valid digit 1-9', () => {
  // Number.MAX_VALUE exercises the `x >= 10` divide loop through its full
  // range at the extreme high end — same invariant, other extreme.
  const d = K.leadingDigit(Number.MAX_VALUE);
  assert.equal(d, 1);
  assert.ok(d >= 1 && d <= 9);
});

test('near-underflow magnitude still yields a valid digit 1-9', () => {
  // 1e-320 sits deep in subnormal territory (well below 2.2e-308), forcing
  // many multiply-by-10 iterations before crossing into [1,10) — pins the
  // loop invariant holds even under heavy iteration/rounding pressure.
  const d = K.leadingDigit(1e-320);
  assert.equal(d, 9);
  assert.ok(d >= 1 && d <= 9);
});
