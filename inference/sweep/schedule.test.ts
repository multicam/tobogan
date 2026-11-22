// The scheduling loop with an injected clock, sleep and runner: no model, no real timers.
import { describe, expect, test } from "bun:test";
import type { PlanItem } from "./plan";
import { latestRuns } from "./quota";
import type { RunRecord } from "./record";
import { doneRunIds, schedule, type SchedulerDeps } from "./schedule";

const MINUTE = 60_000;
const item = (cell: string, rep: number): PlanItem => ({ runId: `t__${cell}__r${rep}`, task: "t", cell, rep });
const rec = (it: PlanItem, outcome: RunRecord["outcome"], extra: Partial<RunRecord> = {}): RunRecord => ({
  runId: it.runId, task: it.task, cell: it.cell, rep: it.rep, outcome,
  usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }, firstOutputMs: null, wallMs: 1, cacheHitRate: null, notionalCostUsd: null, ...extra,
});
const windowEvent = (fiveHour: number, sevenDay = 0.1) => [{ unifiedWindows: { five_hour: { utilization: fiveHour }, seven_day: { utilization: sevenDay } } }];

// Fake world: sleep advances the clock; the runner yields a macrotask so completions interleave.
function world(outcomeOf: (it: PlanItem) => Partial<RunRecord> & { outcome: RunRecord["outcome"] } = () => ({ outcome: "pass" })) {
  const state = { clock: 1_000_000, inflight: 0, peak: 0, launches: [] as { runId: string; at: number; conc: number }[], appended: [] as RunRecord[], events: [] as { kind?: string; surface?: string; concurrency?: number }[], logs: [] as string[] };
  const deps: SchedulerDeps = {
    now: () => state.clock,
    sleep: async (ms) => {
      state.clock += ms;
    },
    runOne: async (it, conc) => {
      state.launches.push({ runId: it.runId, at: state.clock, conc });
      state.inflight += 1;
      state.peak = Math.max(state.peak, state.inflight);
      await new Promise((r) => setTimeout(r, 0));
      state.inflight -= 1;
      const { outcome, ...extra } = outcomeOf(it);
      return rec(it, outcome, extra);
    },
    append: (r) => state.appended.push(r),
    event: (e) => state.events.push(e),
    stub: (it, outcome, reason) => rec(it, outcome, { reason }),
    log: (m) => state.logs.push(m),
  };
  return { state, deps };
}

const cfg = { ramp: { start: 1, max: 3, raiseEvery: 2 }, minGapMs: 0, cooldownMs: 15 * MINUTE, surfaceOf: (cell: string) => (["haiku", "sonnet", "opus"].includes(cell) ? "claude" : cell) };

describe("schedule", () => {
  test("ramps concurrency up one step per raiseEvery clean runs, to the max and no further", async () => {
    const { state, deps } = world();
    await schedule(Array.from({ length: 12 }, (_, i) => item(i % 2 ? "glm" : "codex", i)), null, cfg, deps);
    const concs = state.launches.map((l) => l.conc);
    expect(concs[0]).toBe(1);
    expect(Math.max(...concs)).toBe(3);
    expect(concs.every((c, i) => i === 0 || c >= concs[i - 1])).toBe(true);
    expect(state.peak).toBeLessThanOrEqual(3);
    expect(state.appended).toHaveLength(12);
  });

  test("a rate limit halves concurrency, is logged, and pauses only that surface for the cooldown", async () => {
    const { state, deps } = world((it) => (it.runId === "t__glm__r0" ? { outcome: "rate_limited", reason: "429" } : { outcome: "pass" }));
    // Four launch at once (glm0 first); glm0's refusal halves 4 to 2, so codex3 starts at 2 and glm1 waits.
    const work = [item("glm", 0), item("codex", 0), item("codex", 1), item("codex", 2), item("codex", 3), item("glm", 1)];
    await schedule(work, null, { ...cfg, ramp: { start: 4, max: 4, raiseEvery: 5 } }, deps);
    const rl = state.events.find((e) => e.kind === "rate_limited");
    expect(rl).toMatchObject({ surface: "glm", concurrency: 4 });
    const rlAt = state.launches.find((l) => l.runId === "t__glm__r0")!.at;
    expect(state.launches.find((l) => l.runId === "t__codex__r3")!.conc).toBe(2);
    const glm1 = state.launches.find((l) => l.runId === "t__glm__r1")!;
    expect(glm1.at - rlAt).toBeGreaterThanOrEqual(15 * MINUTE);
    // codex was never paused or parked
    expect(state.appended.filter((r) => r.cell === "codex").map((r) => r.outcome)).toEqual(["pass", "pass", "pass", "pass"]);
  });

  test("parks only Claude at the five-hour and seven-day thresholds; pi cells keep running", async () => {
    for (const [five, seven] of [[0.98, 0.1], [0.1, 0.95]]) {
      const { state, deps } = world();
      await schedule([item("haiku", 0), item("glm", 0), item("sonnet", 0), item("codex", 0)], { fiveHour: five, sevenDay: seven }, cfg, deps);
      expect(state.launches.map((l) => l.runId).sort()).toEqual(["t__codex__r0", "t__glm__r0"]);
      const deferred = state.appended.filter((r) => r.outcome === "deferred");
      expect(deferred.map((r) => r.cell).sort()).toEqual(["haiku", "sonnet"]);
      expect(state.events.filter((e) => e.kind === "park")).toHaveLength(1);
    }
  });

  test("below the thresholds Claude runs; a later reading at the threshold parks the rest", async () => {
    const { state, deps } = world((it) => (it.runId === "t__haiku__r0" ? { outcome: "pass", rateLimitEvents: windowEvent(0.99) } : { outcome: "pass" }));
    await schedule([item("haiku", 0), item("haiku", 1), item("sonnet", 0)], { fiveHour: 0.5, sevenDay: 0.5 }, { ...cfg, ramp: { start: 1, max: 1, raiseEvery: 5 } }, deps);
    expect(state.launches.map((l) => l.runId)).toEqual(["t__haiku__r0"]);
    expect(state.appended.filter((r) => r.outcome === "deferred")).toHaveLength(2);
  });

  test("a Claude rate limit parks Claude (remaining Claude runs deferred) and still halves concurrency", async () => {
    const { state, deps } = world((it) => (it.runId === "t__haiku__r0" ? { outcome: "rate_limited", reason: "usage limit" } : { outcome: "pass" }));
    await schedule([item("haiku", 0), item("sonnet", 0), item("glm", 0)], null, { ...cfg, ramp: { start: 1, max: 4, raiseEvery: 9 } }, deps);
    expect(state.appended.find((r) => r.runId === "t__sonnet__r0")?.outcome).toBe("deferred");
    expect(state.appended.find((r) => r.runId === "t__glm__r0")?.outcome).toBe("pass");
    expect(state.events.map((e) => e.kind)).toContain("park");
  });
});

describe("resume", () => {
  test("deferred runs are never done; retry-excluded re-runs only the excluded outcomes", () => {
    const rows = [
      rec(item("haiku", 0), "deferred"),
      rec(item("glm", 0), "pass"),
      rec(item("glm", 1), "fail"),
      rec(item("glm", 2), "rate_limited"),
      rec(item("codex", 0), "escape_attempt"),
    ];
    expect([...doneRunIds(rows, false)].sort()).toEqual(["t__codex__r0", "t__glm__r0", "t__glm__r1", "t__glm__r2"]);
    expect([...doneRunIds(rows, true)].sort()).toEqual(["t__glm__r0", "t__glm__r1"]);
  });

  test("a run deferred and then completed on resume counts once, with its final outcome", () => {
    const it = item("haiku", 0);
    const rows = latestRuns([rec(it, "deferred"), rec(item("glm", 0), "pass"), rec(it, "pass")]);
    expect(rows.filter((r) => r.runId === it.runId).map((r) => r.outcome)).toEqual(["pass"]);
    expect(rows).toHaveLength(2);
    expect(doneRunIds(rows, false).has(it.runId)).toBe(true);
  });
});
