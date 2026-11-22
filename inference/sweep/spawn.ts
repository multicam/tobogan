// Spawn one agent CLI in its own process group, timestamp stdout lines on arrival, and kill the
// whole group on timeout. Timestamps are ms since spawn, so the first assistant event's stamp
// is the spawn overhead (INFER-8).
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import type { Line } from "./parse";

export type SpawnResult = { lines: Line[]; exitCode: number | null; signal: string | null; timedOut: boolean; wallMs: number; droppedPartials: number };

// Streaming deltas (pi message_update, claude stream_event) are only needed for the first-output
// stamp; keeping all of them would make transcripts tens of MB. Keep the first one and count the rest.
const PARTIAL = /^\{"type":"(message_update|stream_event)"/;

// Grace between SIGTERM and SIGKILL for the process group on timeout.
const KILL_GRACE_MS = 5000;

export async function spawnStreaming(
  argv: string[],
  opts: { cwd: string; env: Record<string, string>; timeoutMs: number; transcriptPath: string; stderrPath: string },
): Promise<SpawnResult> {
  const t0 = performance.now();
  const child = spawn(argv[0], argv.slice(1), { cwd: opts.cwd, env: opts.env, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const transcript = createWriteStream(opts.transcriptPath);
  const stderr = createWriteStream(opts.stderrPath);
  child.stderr!.pipe(stderr);

  const lines: Line[] = [];
  let droppedPartials = 0;
  let sawPartial = false;
  const rl = createInterface({ input: child.stdout! });
  rl.on("line", (line) => {
    const t = Math.round(performance.now() - t0);
    if (PARTIAL.test(line)) {
      if (sawPartial) {
        droppedPartials += 1;
        return;
      }
      sawPartial = true;
    }
    lines.push({ t, line });
    transcript.write(JSON.stringify({ t, line }) + "\n");
  });

  // Timeout: TERM the group, then KILL it after a grace period.
  let timedOut = false;
  const killGroup = (sig: NodeJS.Signals) => {
    try {
      process.kill(-child.pid!, sig);
    } catch {
      // Group already gone.
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    killGroup("SIGTERM");
    setTimeout(() => killGroup("SIGKILL"), KILL_GRACE_MS).unref();
  }, opts.timeoutMs);

  const [exitCode, signal] = await new Promise<[number | null, string | null]>((resolve) => {
    child.on("close", (code, sig) => resolve([code, sig]));
    child.on("error", () => resolve([null, "spawn-error"]));
  });
  clearTimeout(timer);
  // Reap any stragglers the CLI left in its group (background shells, servers).
  killGroup("SIGKILL");
  await new Promise<void>((r) => transcript.end(r));
  await new Promise<void>((r) => stderr.end(r));
  return { lines, exitCode, signal, timedOut, wallMs: Math.round(performance.now() - t0), droppedPartials };
}
