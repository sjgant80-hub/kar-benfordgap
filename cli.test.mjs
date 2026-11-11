// cli.test.mjs — the command line's exit code contract, as cli.mjs and the README state it:
//   0 = conforms (close / acceptable) or too few to judge · 2 = marginal or nonconformity · 1 = bad input.
// v2's first CI run expected 0 from a file the CLI is meant to flag; this pins every documented code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.mjs');
const dir = mkdtempSync(join(tmpdir(), 'benfordgap-cli-'));
const put = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const run = (...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { code: r.status, out: json(r.stdout), err: r.stderr };
};
const NL = '\n';

// 1,000 amounts spread evenly on a log scale over three orders of magnitude: the shape Benford's Law describes.
const benford = Array.from({ length: 1000 }, (_, i) => (10 * 10 ** ((3 * (i + 0.5)) / 1000)).toFixed(2));

// 2,000 amounts with 121 of the first-digit-1 amounts moved to first digit 9: MAD 0.0135, Nigrini's marginal band.
const EXP = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));
const marginal = [];
EXP.map((e) => Math.round(e * 2000))
  .map((c, i) => c + (i === 0 ? -121 : i === 8 ? 121 : 0))
  .forEach((k, i) => {
    for (let j = 0; j < k; j++) marginal.push(((i + 1 + ((j * 7919) % 1000) / 1000) * 10 ** (1 + (j % 4))).toFixed(2));
  });

// 300 amounts kept just under a £5,000 sign-off limit: almost every first digit is 4.
const underLimit = Array.from({ length: 300 }, (_, i) => `£${(4700 + ((i * 37) % 299)).toLocaleString('en-GB')}.00`);

test('a Benford-shaped column conforms: exit 0', () => {
  const r = run(put('good.csv', 'id,amount' + NL + benford.map((a, i) => `${i},${a}`).join(NL) + NL), 'amount');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.verdict, 'close');
  assert.equal(r.out.n, 1000);
});

test('amounts kept under a sign-off limit are flagged: exit 2, digit 4 first', () => {
  const r = run(put('limit.csv', 'amount' + NL + underLimit.map((a) => `"${a}"`).join(NL) + NL), 'amount');
  assert.equal(r.code, 2, r.err);
  assert.equal(r.out.verdict, 'nonconformity');
  assert.equal(r.out.lookFirst[0], 4);
  assert.equal(r.out.skipped.unreadable, 0);
});

test('a mild drift is marginal, and marginal is flagged: exit 2, digit 9 first', () => {
  const r = run(put('marginal.txt', marginal.join(NL) + NL));
  assert.equal(r.code, 2, r.err);
  assert.equal(r.out.verdict, 'marginal');
  assert.deepEqual(r.out.lookFirst, [9]);
});

test('three amounts with the floor lowered to 1 are judged by chi-square, not flagged, and marked weak: exit 0', () => {
  const r = run(put('t.csv', 'amount\n1\n20\n300\n'), 'amount', '--min-n', '1');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.verdict, 'acceptable');
  assert.equal(r.out.verdictBy, 'chi-square');
  assert.equal(r.out.minN, 1);
  assert.match(r.out.notes[0], /^the floor was lowered to 1; with 3 amount/);
  // three amounts all starting with 9 (a 1-in-10,000 event under the law): chi-square past its 1% line, even this small
  const flagFirst = run('--min-n', '1', put('t1.csv', 'amount\n9\n90\n900\n'), 'amount');
  assert.equal(flagFirst.code, 2, flagFirst.err);
  assert.equal(flagFirst.out.verdict, 'nonconformity');
  assert.equal(flagFirst.out.minN, 1);
});

test('three amounts under the default floor get no verdict: exit 0, too-few', () => {
  const r = run(put('t2.csv', 'amount\n1\n20\n300\n'), 'amount');
  assert.equal(r.code, 0, r.err);
  assert.equal(r.out.verdict, 'too-few');
  assert.equal(r.out.minN, 100);
});

test('one amount per line (blank lines and CRLF ignored), and a column by number', () => {
  const body = NL + benford.slice(0, 500).join(NL) + NL + NL + '  ' + NL + benford.slice(500).join('\r\n') + NL + NL;
  const txt = run(put('good.txt', body));
  assert.equal(txt.code, 0, txt.err);
  assert.equal(txt.out.n, 1000);
  assert.equal(txt.out.rows, 1000); // blank lines are not rows
  assert.equal(txt.out.skipped.unreadable, 0);
  const byIndex = run(put('good2.csv', 'id,amount' + NL + benford.map((a, i) => `${i},${a}`).join(NL) + NL), '1');
  assert.equal(byIndex.code, 0, byIndex.err);
  assert.equal(byIndex.out.n, 1000);
});

test('bad input: exit 1 with a reason', () => {
  assert.equal(run().code, 1);
  assert.equal(run(join(dir, 'missing.csv'), 'amount').code, 1);
  const noCol = run(put('nocol.csv', 'amount\n1\n'), 'price');
  assert.equal(noCol.code, 1);
  assert.notEqual(noCol.err.trim(), '');
  const badFloor = run(put('t3.csv', 'amount\n1\n20\n300\n'), 'amount', '--min-n', 'abc');
  assert.equal(badFloor.code, 1);
  assert.equal(badFloor.out.ok, false);
  const nothing = run(put('none.csv', 'amount\nn/a\n0\n'), 'amount');
  assert.equal(nothing.code, 1);
});
