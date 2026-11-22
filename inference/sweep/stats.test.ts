// Per-cell summary: pass rate (median and spread over tasks), cost per pass, startup, cache hits.
import { describe, expect, test } from "bun:test";
import { median, quantile, summarizeCell, wilson } from "./stats";
import type { RunRecord } from "./record";

const row = (task: string, outcome: RunRecord["outcome"], tokens: number, extra: Partial<RunRecord> = {}): RunRecord => ({
  runId: `${task}__glm__r0`,
  task,
  cell: "glm",
  rep: 0,
  outcome,
  usage: { input: tokens / 2, output: 100, cacheRead: tokens / 2 - 100, cacheWrite: 0 },
  firstOutputMs: 1000,
  wallMs: 60000,
  cacheHitRate: 0.5,
  notionalCostUsd: 0.1,
  ...extra,
} as RunRecord);

describe("median and quantile", () => {
  test("median of odd and even lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  test("quantile interpolates", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
    expect(quantile([1, 2, 3, 4, 5], 0.75)).toBe(4);
  });
});

describe("wilson", () => {
  test("5/5 has a lower bound near 0.57", () => {
    const [lo, hi] = wilson(5, 5);
    expect(lo).toBeCloseTo(0.566, 2);
    expect(hi).toBe(1);
  });
  test("0 trials is [0, 1]", () => {
    expect(wilson(0, 0)).toEqual([0, 1]);
  });
});

describe("summarizeCell", () => {
  const rows = [
    row("t1", "pass", 1000),
    row("t1", "pass", 3000),
    row("t2", "fail", 2000),
    row("t2", "pass", 2000),
    row("t3", "rate_limited", 10),
  ];
  const s = summarizeCell("glm", rows);

  test("rate-limited runs are excluded from pass rate and counted separately", () => {
    expect(s.attempted).toBe(4);
    expect(s.rateLimited).toBe(1);
    expect(s.passes).toBe(3);
    expect(s.passRate).toBeCloseTo(0.75, 6);
  });
  test("pass rate median and spread are across tasks", () => {
    expect(s.taskPassRate.median).toBeCloseTo(0.75, 6);
    expect(s.taskPassRate.min).toBe(0.5);
    expect(s.taskPassRate.max).toBe(1);
  });
  test("tokens per pass charges failed attempts to the passes", () => {
    expect(s.tokensPerPass).toBeCloseTo((1000 + 3000 + 2000 + 2000) / 3, 6);
    expect(s.notionalUsdPerPass).toBeCloseTo(0.4 / 3, 6);
  });
  test("startup and cache-hit medians come from attempted runs", () => {
    expect(s.startupMs.median).toBe(1000);
    expect(s.cacheHitRate.median).toBe(0.5);
  });
  test("a cell with no passes has null cost per pass", () => {
    expect(summarizeCell("glm", [row("t1", "fail", 10)]).tokensPerPass).toBeNull();
  });
});
