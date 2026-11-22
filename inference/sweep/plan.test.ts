// Run plan: seeded interleaved order, resume by run id, and the concurrency ramp.
import { describe, expect, test } from "bun:test";
import { buildPlan, nextConcurrency, pending } from "./plan";

describe("buildPlan", () => {
  const plan = buildPlan(["a", "b"], ["haiku", "glm", "codex"], 2, 7);

  test("has one run per task, cell and repetition with stable ids", () => {
    expect(plan).toHaveLength(12);
    expect(new Set(plan.map((p) => p.runId)).size).toBe(12);
    expect(plan.map((p) => p.runId)).toContain("a__glm__r1");
  });
  test("is deterministic for a seed and differs across seeds", () => {
    expect(buildPlan(["a", "b"], ["haiku", "glm", "codex"], 2, 7)).toEqual(plan);
    expect(buildPlan(["a", "b"], ["haiku", "glm", "codex"], 2, 8).map((p) => p.runId)).not.toEqual(plan.map((p) => p.runId));
  });
  test("interleaves cells: no cell runs twice in a row within a repetition block", () => {
    const block = plan.slice(0, 6).map((p) => p.cell);
    for (let i = 1; i < block.length; i++) {
      expect(block[i]).not.toBe(block[i - 1]);
    }
  });
});

describe("pending", () => {
  test("drops runs already recorded", () => {
    const plan = buildPlan(["a"], ["glm"], 3, 1);
    expect(pending(plan, new Set(["a__glm__r0"])).map((p) => p.runId).sort()).toEqual(["a__glm__r1", "a__glm__r2"]);
  });
});

describe("nextConcurrency", () => {
  const ramp = { start: 2, max: 5, raiseEvery: 4 };
  test("raises one step after every raiseEvery clean completions, up to max", () => {
    expect(nextConcurrency(2, { cleanSinceChange: 3, rateLimited: false }, ramp)).toBe(2);
    expect(nextConcurrency(2, { cleanSinceChange: 4, rateLimited: false }, ramp)).toBe(3);
    expect(nextConcurrency(5, { cleanSinceChange: 9, rateLimited: false }, ramp)).toBe(5);
  });
  test("halves on a rate limit, never below one", () => {
    expect(nextConcurrency(5, { cleanSinceChange: 0, rateLimited: true }, ramp)).toBe(2);
    expect(nextConcurrency(1, { cleanSinceChange: 0, rateLimited: true }, ramp)).toBe(1);
  });
});
