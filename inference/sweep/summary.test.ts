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
  test("says that cost per pass charges failed attempts to the passes", () => {
    expect(markdown).toMatch(/\/ pass .*failed attempts included/i);
  });
  test("the failure log tells an escape attempt from a leak", () => {
    const r = renderSummary("s4", [row("glm", "invalid_escape", 10, "Read leaked"), row("codex", "escape_attempt", 20, "Read failed")]);
    expect(r.markdown).toContain("invalid_escape — Read leaked");
    expect(r.markdown).toContain("escape_attempt — Read failed");
  });
});

describe("renderSummary figures from raw data", () => {
  const at = (task: string, cell: string, rep: number, tokens: number, outcome: RunRecord["outcome"] = "pass"): RunRecord => ({ ...row(cell, outcome, tokens), runId: `${task}__${cell}__r${rep}`, task, rep });
  const events = [
    { at: "2026-11-21T23:49:40Z", kind: "park", surface: "claude", runId: "q1__haiku__r0", concurrency: 3, reason: "five_hour 0.98 >= 0.98" },
    { at: "2026-11-21T23:55:00Z", kind: "rate_limited", surface: "glm", runId: "q1__glm__r1", concurrency: 2, reason: "429" },
  ];
  const rows = [
    at("q1", "glm", 0, 3000),
    at("q1", "glm", 1, 1000),
    at("q1", "glm", 2, 2000),
    at("q1", "glm", 3, 9999, "fail"), // not a pass: left out
    at("q1", "glm", 1, 1500), // same run id again: the later row wins over the 1000 above
    at("q1", "codex", 0, 400),
    at("q2", "codex", 0, 800),
  ];
  const { markdown } = renderSummary("s5", rows, [], events);

  test("per task and cell, min, median and max tokens of passing runs, deduped by run id with the latest row winning", () => {
    expect(markdown).toContain("## Additional figures from raw data");
    expect(markdown).toContain("| q1 | glm | 3 | 1,500 | 2,000 | 3,000 |");
    expect(markdown).toContain("| q1 | codex | 1 | 400 | 400 | 400 |");
    expect(markdown).toContain("| q2 | codex | 1 | 800 | 800 | 800 |");
    expect(markdown).not.toContain("9,999");
  });
  test("lists park and rate-limit events from the manifest", () => {
    expect(markdown).toContain("park claude at 2026-11-21T23:49:40Z");
    expect(markdown).toContain("concurrency 3");
    expect(markdown).toContain("rate_limited glm at 2026-11-21T23:55:00Z");
  });
  test("says so when there are no events", () => {
    expect(renderSummary("s6", rows).markdown).toContain("No park or rate-limit events.");
  });
});
