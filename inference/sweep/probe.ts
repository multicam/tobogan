// Route probe: one trivial prompt through one cell, in an empty temp dir, printing the parsed
// summary and the route check. Proves auth and usage capture before any task run.
// Usage: bun probe.ts <cell>
import { mkdirSync, mkdtempSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CELLS, buildArgv, childEnv, routeProblem } from "./cells";
import { parseClaudeStream, parsePiStream } from "./parse";
import { spawnStreaming } from "./spawn";

const PROBE_TIMEOUT_MS = 180_000;

const cell = CELLS.find((c) => c.id === process.argv[2]);
if (!cell) {
  console.error(`usage: bun probe.ts <${CELLS.map((c) => c.id).join("|")}>`);
  process.exit(2);
}
// Same default work root as sweep.ts, outside any checkout so no repo context loads.
const root = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "tobogan-model-sweep", "probe");
mkdirSync(root, { recursive: true });
const dir = mkdtempSync(join(root, `${cell.id}-`));
const res = await spawnStreaming(buildArgv(cell, "Reply with exactly: OK"), {
  cwd: dir,
  env: childEnv(process.env, cell.surface),
  timeoutMs: PROBE_TIMEOUT_MS,
  transcriptPath: join(dir, "transcript.jsonl"),
  stderrPath: join(dir, "stderr.txt"),
});
const s = cell.surface === "claude" ? parseClaudeStream(res.lines) : parsePiStream(res.lines);
console.log(
  JSON.stringify(
    {
      cell: cell.id,
      exitCode: res.exitCode,
      timedOut: res.timedOut,
      wallMs: res.wallMs,
      firstOutputMs: s.firstOutputMs,
      provider: s.provider,
      authSource: s.authSource,
      model: s.model,
      usage: s.usage,
      turns: s.turns,
      finalText: s.finalText.slice(0, 80),
      errorText: s.errorText,
      rateLimitEvents: s.rateLimitEvents,
      routeProblem: routeProblem(cell, s),
      dir,
    },
    null,
    1,
  ),
);
