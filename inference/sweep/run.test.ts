// The run.ts wiring of the early kill, driven by a fake spawner; no model is called.
import { describe, expect, test } from "bun:test";
import { CELLS } from "./cells";
import { runAgent } from "./run";
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
