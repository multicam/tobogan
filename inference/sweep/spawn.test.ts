// spawnStreaming's early kill, driven by a fake child (a shell script); no model is called.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnStreaming } from "./spawn";

const INIT = JSON.stringify({ type: "system", subtype: "init", apiKeySource: "placeholder-source" });

async function fake(script: string, killOn: (line: string) => boolean) {
  const dir = mkdtempSync(join(tmpdir(), "sweep-spawn-"));
  try {
    return await spawnStreaming(["sh", "-c", script], {
      cwd: dir,
      env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 60_000,
      transcriptPath: join(dir, "t.jsonl"),
      stderrPath: join(dir, "e.txt"),
      killOn,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("spawnStreaming killOn", () => {
  test("kills the child as soon as a line matches, without waiting for it to finish", async () => {
    const res = await fake(`echo '${INIT}'; sleep 30; echo late`, (l) => l.includes("placeholder-source"));
    expect(res.killedEarly).toBe(true);
    expect(res.timedOut).toBe(false);
    expect(res.wallMs).toBeLessThan(10_000);
    expect(res.lines.map((l) => l.line)).toEqual([INIT]);
  });
  test("leaves a run alone when no line matches", async () => {
    const res = await fake("echo ok", () => false);
    expect(res.killedEarly).toBe(false);
    expect(res.exitCode).toBe(0);
  });
});
