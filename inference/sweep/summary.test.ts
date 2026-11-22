// Summary rendering: per-cell rows, the suspicious-win flag (INFER-3) and the failure log.
import { describe, expect, test } from "bun:test";
import type { RunRecord } from "./record";
import { renderSummary } from "./summary";

const row = (cell: string, outcome: RunRecord["outcome"], tokens: number, reason?: string): RunRecord => ({
  runId: `t__${cell}__r${tokens}`,
  task: "t",
  cell,
  rep: 0,
  outcome,
  reason,
  usage: { input: tokens, output: 0, cacheRead: 0, cacheWrite: 0 },
  firstOutputMs: 1500,
  wallMs: 30000,
  cacheHitRate: 0.9,
  notionalCostUsd: 0.2,
});

describe("renderSummary", () => {
  const rows = [row("glm", "pass", 100000), row("glm", "pass", 110000), row("glm", "pass", 5000), row("haiku", "fail", 80000, "1 fail"), row("haiku", "rate_limited", 0, "429")];
  const { json, markdown } = renderSummary("s1", rows);

  test("has one summary per cell, in cell order", () => {
    expect(json.cells.map((c) => c.cell)).toEqual(["haiku", "glm"]);
  });
  test("flags a pass far cheaper than its task's median as suspect", () => {
    expect(json.suspects.map((r) => r.runId)).toEqual(["t__glm__r5000"]);
  });
  test("a small task's passes are judged against that task, not the cell's bigger tasks (q1928)", () => {
    const small = (cell: string, k: number) => ({ ...row(cell, "pass", k * 1000), runId: `q1928__${cell}__r${k}`, task: "q1928" });
    const big = (k: number) => ({ ...row("glm", "pass", k * 1000), runId: `q1543__glm__r${k}`, task: "q1543" });
    const r = renderSummary("s2", [small("glm", 86), small("glm", 100), small("codex", 90), big(3000), big(3600), big(4000)]);
    expect(r.json.suspects).toEqual([]);
  });
  test("states the ceiling when every attempted cell passed everything, and only then", () => {
    expect(renderSummary("s3", [row("glm", "pass", 1000), row("codex", "pass", 1000)]).markdown).toMatch(/ceiling/i);
    expect(markdown).not.toMatch(/ceiling/i);
  });
  test("the failure log lists every non-pass with its reason", () => {
    expect(json.failures.map((f) => f.outcome).sort()).toEqual(["fail", "rate_limited"]);
    expect(markdown).toContain("429");
  });
  test("markdown carries the per-cell table", () => {
    expect(markdown).toContain("| cell |");
    expect(markdown).toMatch(/\| glm \| 3\/3 /);
  });
});
