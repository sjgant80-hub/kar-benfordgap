// cell.mjs — BenfordGap's three answers for the birth check (seed.json, genome/).
//
// judge  a claimed screen verdict for a column of amounts is verified when BenfordGap's own audit (audit in kernel.mjs,
//        the same kernel the page and the command line run) gives that same verdict; unverified when it gives another;
//        refused when the claim is not one of the screen's five verdicts or the amounts are not a column it can read.
//        The judge checks the screen's verdict, not the data: a column that conforms can still hold made-up numbers.
// lane   the kernel's own refusal: a list of amounts with at least one usable nonzero amount, and a valid floor if one
//        is given.
import { audit } from '../kernel.mjs';

const VERDICTS = ['too-few', 'close', 'acceptable', 'marginal', 'nonconformity'];
const run = (input) => audit(input?.values, { minN: input?.minN });

export async function inLane(input) {
  return run(input).ok === true;
}

export async function judge(input) {
  const r = run(input);
  if (r.ok !== true || !VERDICTS.includes(input.verdict)) return 'refused';
  return r.verdict === input.verdict ? 'verified' : 'unverified';
}

// health: BenfordGap runs in a visitor's browser and on other people's machines and sends nothing back, so its use,
// who depends on it and when it last earned its keep cannot be seen from inside the repository: null, said honestly
export async function health() {
  return { used: null, dependedOn: null, lastEarned: null };
}
