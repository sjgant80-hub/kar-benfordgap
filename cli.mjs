#!/usr/bin/env node
// cli.mjs — BenfordGap from the command line.
//   node cli.mjs <file.csv> <column name or 0-based number> [--min-n N]
//   node cli.mjs <file.txt>                (one amount per line)
// Prints the kernel's result as JSON. Exit code: 0 conforms or too few, 2 marginal or nonconformity, 1 bad input.
import { readFileSync } from 'node:fs';
import { audit, csvColumn } from './kernel.mjs';

const args = process.argv.slice(2);
const mi = args.indexOf('--min-n');
const minN = mi >= 0 ? Number(args[mi + 1]) : undefined;
const pos = mi >= 0 ? args.filter((_, i) => i !== mi && i !== mi + 1) : args;
const [file, column] = pos;
if (!file) { console.error('usage: node cli.mjs <file> [column] [--min-n N]'); process.exit(1); }
let text;
try { text = readFileSync(file, 'utf8'); } catch { console.error('cannot read ' + file); process.exit(1); }
let values;
if (column === undefined) values = text.split(/\r\n?|\n/).filter((l) => l.trim() !== '');
else {
  const r = csvColumn(text, /^\d+$/.test(column) ? Number(column) : column);
  if (!r.ok) { console.error(r.why); process.exit(1); }
  values = r.values;
}
const a = audit(values, minN === undefined ? {} : { minN });
console.log(JSON.stringify(a, null, 2));
process.exit(!a.ok ? 1 : a.verdict === 'marginal' || a.verdict === 'nonconformity' ? 2 : 0);
