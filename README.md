# BenfordGap

**Live: https://sjgant80-hub.github.io/kar-benfordgap/**

A first-digit fraud screen for any column of amounts. Paste a payables export, expense list or claims file. It compares how often each first digit 1 to 9 appears with Benford's Law and gives a verdict (Nigrini's MAD bands), a chi-square, a z per digit and the digits to look at first. Every unreadable or zero row is counted, and it gives no verdict below a sample floor. It runs in your browser, with no upload and no AI judge.

Built by Kar for AI Native Solutions. MIT.

## Run it

- In the browser: open the live page.
- Command line (Node.js 20+): `node cli.mjs payments.csv amount` prints the result as JSON. `--min-n 200` sets the sample floor. The exit code is 0 for conforms or too few, 2 for marginal or nonconformity, and 1 for bad input.
- As a library: `import { audit, csvColumn } from './kernel.mjs'`.

## Proof

- `node --test kernel.test.mjs`, `node --test checkcase.test.mjs` and `node --test cli.test.mjs` (every exit code the command line promises)
- The witness v0.6 mutation gate runs on `kernel.mjs`, `checkcase.mjs` and `cli.mjs` in CI, on every push. The local receipt is in `receipts/witness.json`: kernel 61/61, cost case 16/16 and command line 13/13, all clean, nothing baselined.

## v2 (2026-11-11)

v1 passed its own gate (12/12) and still had three faults. Each one was found by running a whole class of inputs:
1. The leading-digit loop drifted, giving 1,700 ordinary doubles the wrong digit (3e27 read as 2).
2. There was no sample floor, so 3 numbers were called "maximally divergent".
3. Unreadable rows were dropped silently.

v2 fixes all three. It also adds ledger amount parsing, CSV columns, Nigrini's MAD, chi-square and per-digit z, a live page that explains itself, and a cost case built on ONS figures (`checkcase.mjs` and its basis are vendored byte for byte from sjgant80-hub/sovereign-enterprise; see `vendor/sovereign-enterprise/PROVENANCE.txt`). `benfordScore` from v1 is kept, now with the corrected digit.

## Limits

It is a screen, not proof. Some honest data never follows Benford's Law: assigned numbers, fixed price points, capped amounts, narrow ranges. It checks first digits only. Commas are read only as thousands separators.
