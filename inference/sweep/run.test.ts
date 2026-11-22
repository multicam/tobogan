// The run.ts wiring of the early kill, driven by a fake spawner; no model is called.
import { describe, expect, test } from "bun:test";
import { CELLS } from "./cells";
import { RUN_MARKER, decideOutcome, isLegacyRow, runAgent, runEnv, scanCtx } from "./run";
import type { SpawnResult } from "./spawn";

type SpawnOpts = Parameters<typeof import("./spawn").spawnStreaming>[1];

const cell = (id: string) => CELLS.find((c) => c.id === id)!;
const BASE = { cwd: "/unused", env: {}, timeoutMs: 1000, transcriptPath: "/unused/t", stderrPath: "/unused/e" };
const init = (apiKeySource: string) => JSON.stringify({ type: "system", subtype: "init", apiKeySource, model: "claude-haiku-5-5" });

// Replays scripted stdout through the caller's killOn like spawnStreaming does; records the options.
function fakeSpawner(stdout: string[]) {
  const seen: { opts?: SpawnOpts } = {};
  const spawner = async (_argv: string[], opts: SpawnOpts): Promise<SpawnResult> => {
    seen.opts = opts;
    const lines: SpawnResult["lines"] = [];
    let killedEarly = false;
    for (const line of stdout) {
      lines.push({ t: 1, line });
      if (opts.killOn?.(line)) {
        killedEarly = true;
        break;
      }
    }
    return { lines, exitCode: killedEarly ? null : 0, signal: killedEarly ? "SIGKILL" : null, timedOut: false, wallMs: 1, droppedPartials: 0, killedEarly };
  };
  return { spawner, seen };
}

describe("per-run scratch dir (row 4)", () => {
  test("both surfaces get the run's own TMPDIR, whatever the parent had", () => {
    for (const surface of ["claude", "pi"] as const) {
      expect(runEnv(surface, "/w/r1/tmp", { PATH: "/usr/bin", TMPDIR: "/tmp" }).TMPDIR).toBe("/w/r1/tmp");
    }
  });
  test("the scan allows exactly that directory", () => {
    const ctx = scanCtx("/w/r1", "/w/r1/tree", { depsDir: null, forbidden: [] });
    expect(ctx.tmp).toBe("/w/r1/tmp");
    expect(ctx.legacyTmp).toBe(false);
  });
  test("a legacy row (recorded without perRunTmp) allows bare /tmp", () => {
    expect(scanCtx("/w/r1", "/w/r1/tree", { depsDir: null, forbidden: [] }, true).legacyTmp).toBe(true);
  });
});

describe("new runs carry the strict-scan marker (review row 5)", () => {
  test("the marker runOne stamps on its record makes the row non-legacy, so rejudge scans it strictly", () => {
    expect(RUN_MARKER).toEqual({ perRunTmp: true });
    expect(isLegacyRow({ ...RUN_MARKER })).toBe(false);
    expect(isLegacyRow({})).toBe(true);
    expect(isLegacyRow({ perRunTmp: false })).toBe(true);
  });
});

describe("runAgent", () => {
  test("a Claude run opening with a metered init is killed early and is a route_error", async () => {
    const { spawner, seen } = fakeSpawner([init("placeholder-key-source"), JSON.stringify({ type: "result", result: "late" })]);
    const out = await runAgent(cell("haiku"), "brief", BASE, spawner);
    expect(seen.opts?.killOn).toBeDefined();
    expect(out.res.killedEarly).toBe(true);
    expect(out.res.lines).toHaveLength(1);
    expect(out.route).toContain("anthropic-metered");
  });
  test("a Claude run on subscription auth is not killed and has no route problem", async () => {
    const { spawner } = fakeSpawner([init("none")]);
    const out = await runAgent(cell("haiku"), "brief", BASE, spawner);
    expect(out.res.killedEarly).toBe(false);
    expect(out.route).toBeNull();
  });
  test("a pi cell is not given the kill rule", async () => {
    const { spawner, seen } = fakeSpawner([init("placeholder-key-source")]);
    const out = await runAgent(cell("glm"), "brief", BASE, spawner);
    expect(seen.opts?.killOn).toBeUndefined();
    expect(out.res.killedEarly).toBe(false);
  });
});

describe("decideOutcome", () => {
  const clean = { res: { timedOut: false, exitCode: 0, signal: null as string | null }, s: { rateLimitEvents: [] as unknown[], errorText: null as string | null, turns: 3 }, route: null as string | null, timeoutMs: 1000, attempts: [] as string[], leaks: [] as string[] };

  test("a metered init, killed early, ends as route_error (runAgent output into the mapping)", async () => {
    const { spawner } = fakeSpawner([init("placeholder-key-source"), JSON.stringify({ type: "result", result: "late" })]);
    const { res, s, route } = await runAgent(cell("haiku"), "brief", BASE, spawner);
    const v = decideOutcome({ ...clean, res, s, route });
    expect(v.outcome).toBe("route_error");
    expect(v.reason).toContain("anthropic-metered");
  });

  test("a clean run has no outcome yet (the oracle decides)", () => {
    expect(decideOutcome(clean)).toEqual({ outcome: null, reason: "" });
  });

  test("precedence: route, rate limit, timeout, CLI error, then escapes", () => {
    expect(decideOutcome({ ...clean, route: "x", leaks: ["l"] }).outcome).toBe("route_error");
    expect(decideOutcome({ ...clean, s: { ...clean.s, rateLimitEvents: [{ status: "rejected" }] }, leaks: ["l"] }).outcome).toBe("rate_limited");
    expect(decideOutcome({ ...clean, res: { ...clean.res, timedOut: true } }).outcome).toBe("timeout");
    expect(decideOutcome({ ...clean, res: { ...clean.res, exitCode: 1 } }).outcome).toBe("run_error");
    expect(decideOutcome({ ...clean, leaks: ["l"], attempts: ["a"] }).outcome).toBe("invalid_escape");
  });

  test("failed flagged calls alone are an escape_attempt; any success among them is a leak", () => {
    expect(decideOutcome({ ...clean, attempts: ["Read {}"] }).outcome).toBe("escape_attempt");
    expect(decideOutcome({ ...clean, attempts: ["Read {}"], leaks: ["Bash {}"] }).outcome).toBe("invalid_escape");
  });
});
