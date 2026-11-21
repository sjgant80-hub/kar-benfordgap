// BenfordGap as a cell of the estate genome: its judge (the kernel's own verdict, recomputed), its lane and its health.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, inLane, health } from './genome/cell.mjs';

const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
// the kernel's own test columns (kernel.test.mjs)
const POW2 = Array.from({ length: 1000 }, (_, i) => 2 ** (i + 1));
const FLAT = []; for (let d = 1; d <= 9; d++) for (let j = 0; j < 20; j++) FLAT.push(d * 100 + j);
const tilt = (extra) => { const v = POW2.slice(); for (let i = 0; i < extra; i++) v[v.length - 1 - i] = 1; return v; };

test('judge: each of the five verdicts, claimed for the column that earns it, is verified', async () => {
  assert.equal(await judge({ values: POW2, verdict: 'close' }), 'verified');
  assert.equal(await judge({ values: POW2.slice(0, 100), verdict: 'acceptable' }), 'verified');
  assert.equal(await judge({ values: tilt(80), verdict: 'marginal' }), 'verified');
  assert.equal(await judge({ values: FLAT, verdict: 'nonconformity' }), 'verified');
  assert.equal(await judge({ values: FLAT, minN: 181, verdict: 'too-few' }), 'verified');
});

test('judge: a verdict the screen did not give is unverified, whichever way it errs', async () => {
  assert.equal(await judge({ values: FLAT, verdict: 'acceptable' }), 'unverified', 'made-up digits claimed to pass');
  assert.equal(await judge({ values: FLAT, verdict: 'close' }), 'unverified');
  assert.equal(await judge({ values: POW2, verdict: 'nonconformity' }), 'unverified', 'a conforming column claimed to fail');
  assert.equal(await judge({ values: FLAT, minN: 181, verdict: 'nonconformity' }), 'unverified', 'a verdict below the floor');
  assert.equal(await judge({ values: FLAT, minN: 180, verdict: 'too-few' }), 'unverified');
});

test('judge: a claim that is not one of the five verdicts, or amounts the kernel cannot read, is refused', async () => {
  for (const b of [{ values: FLAT }, { values: FLAT, verdict: 'fraud' }, { values: FLAT, verdict: 5 }, { values: 'x', verdict: 'nonconformity' },
    { values: [0, 'x', ''], verdict: 'too-few' }, { values: FLAT, minN: 0, verdict: 'nonconformity' }, null, 'x', seed.boundary.outOfLane]) {
    assert.equal(await judge(b), 'refused', String(JSON.stringify(b)).slice(0, 80));
  }
});

test('judge: the seed cases split good from bad', async () => {
  assert.deepEqual(seed.judge.cases.good, { values: FLAT, verdict: 'nonconformity' });
  assert.equal(await judge(seed.judge.cases.good), 'verified');
  assert.equal(await judge(seed.judge.cases.bad), 'unverified');
});

test('lane: a readable column is in lane, even one too short to judge; what the kernel refuses is out', async () => {
  assert.equal(await inLane({ values: FLAT }), true);
  assert.equal(await inLane({ values: [5] }), true);
  assert.equal(await inLane(seed.boundary.inLane), true);
  assert.equal(await inLane({ values: [5], minN: 1 }), true);
  for (const b of [null, undefined, 'x', 5, {}, seed.boundary.outOfLane, { values: '120, 4500, 80' }, { values: [] },
    { values: [0, 'x', ''] }, { values: [5], minN: 0 }, { values: [5], minN: 1.5 }, { values: [5], minN: '10' }]) {
    assert.equal(await inLane(b), false, String(JSON.stringify(b)));
  }
});

test('health says what BenfordGap cannot measure from inside its repository', async () => {
  assert.deepEqual(await health(), { used: null, dependedOn: null, lastEarned: null });
});
