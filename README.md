# BenfordGap

**Live: https://sjgant80-hub.github.io/kar-benfordgap/**

A first-digit fraud screen for any column of amounts. Paste a payables export, expense list or claims file. It compares how often each first digit 1 to 9 appears with Benford's Law and gives a verdict, a chi-square, Nigrini's MAD, a z per digit and the digits to look at first. The verdict comes from chi-square under 1,000 amounts and from Nigrini's MAD bands from 1,000 up, and it says which. Every unreadable or zero row is counted, and it gives no verdict below a sample floor. It runs in your browser, with no upload and no AI judge.

Built by Kar for AI Native Solutions. MIT.

## Run it

- In the browser: open the live page.
- Command line (Node.js 20+): `node cli.mjs payments.csv amount` prints the result as JSON, with the same two SHA-256 fingerprints the page shows (input: the screened cells joined with a newline; result: JSON of v, n, counts, skipped, verdict, minN in that order). `--min-n 200` sets the sample floor. The exit code is 0 for conforms or too few, 2 for marginal or nonconformity, and 1 for bad input.
- As a library: `import { audit, csvColumn } from './kernel.mjs'`.

## Proof

- `node --test kernel.test.mjs`, `node --test checkcase.test.mjs` and `node --test cli.test.mjs` (every exit code the command line promises)
- The witness v0.6 mutation gate runs on `kernel.mjs`, `checkcase.mjs` and `cli.mjs` in CI, on every push. The local receipt is in `receipts/witness.json`: kernel 90/90, cost case 16/16 and command line 13/13, all clean, nothing baselined.

## v2.1 (2026-11-11)

v2 passed its gate (61/61) and two more faults turned up when honest columns (drawn to follow the law exactly) were run through it at each size:
4. It took the verdict from Nigrini's MAD bands at every size. Those bands flagged almost every honest 100-amount column and most 300-amount ones; they hold only from about 1,000 amounts. v2.1 uses chi-square below 1,000 (it flags about 5% of honest columns at every size) and the MAD bands from 1,000 up.
5. It named a digit to "look at first" whenever one digit's z passed 1.96, which happens by chance in about one honest column in five when nine digits are tested. v2.1 uses 2.773, the 5% line shared over nine digits (Bonferroni).

`honestRates(n, trials, seed)` in the kernel re-runs that measurement from a seed; the page runs it live and the tests pin its results. The command line's exit codes now have their own tests and gate (`cli.test.mjs`).

## v2 (2026-11-11)

v1 passed its own gate (12/12) and still had three faults. Each one was found by running a whole class of inputs:
1. The leading-digit loop drifted, giving 1,700 ordinary doubles the wrong digit (3e27 read as 2).
2. There was no sample floor, so 3 numbers were called "maximally divergent".
3. Unreadable rows were dropped silently.

v2 fixes all three. It also adds ledger amount parsing, CSV columns, Nigrini's MAD, chi-square and per-digit z, a live page that explains itself, and a cost case built on ONS figures (`checkcase.mjs` and its basis are vendored byte for byte from sjgant80-hub/sovereign-enterprise; see `vendor/sovereign-enterprise/PROVENANCE.txt`). `benfordScore` from v1 is kept, now with the corrected digit.

## Limits

It is a screen, not proof. Some honest data never follows Benford's Law: assigned numbers, fixed price points, capped amounts, narrow ranges. It checks first digits only. Commas are read only as thousands separators.
