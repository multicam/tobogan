// Per-cell summary statistics. Pass rate excludes runs that never got a fair attempt
// (rate limit, timeout, harness or route error, escape); those are counted separately.
import { COUNTED_OUTCOMES, type RunRecord } from "./record";

export type Spread = { median: number | null; min: number | null; max: number | null; p25: number | null; p75: number | null };

export type CellSummary = {
  cell: string;
  attempted: number;
  passes: number;
  rateLimited: number;
  excluded: number;
  passRate: number | null;
  passRateCi95: [number, number];
  taskPassRate: Spread;
  tokensPerPass: number | null;
  notionalUsdPerPass: number | null;
  tokens: Spread;
  startupMs: Spread;
  wallMs: Spread;
  cacheHitRate: Spread;
};

// 1.96 = two-sided 95% normal quantile, for the Wilson interval.
const Z95 = 1.96;

export function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) {
    return null;
  }
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function median(xs: number[]): number | null {
  return quantile(xs, 0.5);
}

export function wilson(k: number, n: number): [number, number] {
  if (n === 0) {
    return [0, 1];
  }
  const p = k / n;
  const z2 = Z95 * Z95;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

function spread(xs: number[]): Spread {
  return {
    median: median(xs),
    min: xs.length ? Math.min(...xs) : null,
    max: xs.length ? Math.max(...xs) : null,
    p25: quantile(xs, 0.25),
    p75: quantile(xs, 0.75),
  };
}

export const totalTokens = (r: RunRecord): number => r.usage.input + r.usage.output + r.usage.cacheRead + r.usage.cacheWrite;

export function summarizeCell(cell: string, rows: RunRecord[]): CellSummary {
  const counted = rows.filter((r) => COUNTED_OUTCOMES.has(r.outcome));
  const passes = counted.filter((r) => r.outcome === "pass").length;

  // Pass rate per task, then its median and spread across tasks.
  const byTask = new Map<string, RunRecord[]>();
  for (const r of counted) {
    byTask.set(r.task, [...(byTask.get(r.task) ?? []), r]);
  }
  const taskRates = [...byTask.values()].map((rs) => rs.filter((r) => r.outcome === "pass").length / rs.length);

  // Cost per pass charges every counted attempt, failed ones included, to the passes.
  const tokenSum = counted.reduce((a, r) => a + totalTokens(r), 0);
  const costs = counted.map((r) => r.notionalCostUsd);
  const costSum = costs.every((c) => typeof c === "number") ? (costs as number[]).reduce((a, c) => a + c, 0) : null;

  const present = (xs: (number | null | undefined)[]): number[] => xs.filter((x): x is number => typeof x === "number");

  return {
    cell,
    attempted: counted.length,
    passes,
    rateLimited: rows.filter((r) => r.outcome === "rate_limited").length,
    excluded: rows.length - counted.length,
    passRate: counted.length ? passes / counted.length : null,
    passRateCi95: wilson(passes, counted.length),
    taskPassRate: spread(taskRates),
    tokensPerPass: passes ? tokenSum / passes : null,
    notionalUsdPerPass: passes && costSum !== null ? costSum / passes : null,
    tokens: spread(counted.map(totalTokens)),
    startupMs: spread(present(counted.map((r) => r.firstOutputMs))),
    wallMs: spread(counted.map((r) => r.wallMs)),
    cacheHitRate: spread(present(counted.map((r) => r.cacheHitRate))),
  };
}
