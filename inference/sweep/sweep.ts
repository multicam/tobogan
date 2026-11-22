// Model sweep CLI. See README.md for the design and the full-sweep command.
//   bun sweep.ts prove     [--tasks a,b]                       RED/GREEN proof of each oracle
//   bun sweep.ts run       --sweep <id> [options]              run (or resume) a sweep
//   bun sweep.ts summarize --sweep <id>                        per-cell summary + failure log
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildArgv, CELLS, childEnv } from "./cells";
import { isGenuineRed, type TestsMode } from "./oracle";
import { parseClaudeStream } from "./parse";
import { buildPlan, nextConcurrency, pending, type Ramp } from "./plan";
import { latestRuns, PARK_FIVE_HOUR, PARK_SEVEN_DAY, parkReason, windowsFrom, type Windows } from "./quota";
import { COUNTED_OUTCOMES, type RunRecord } from "./record";
import { rejudge } from "./rejudge";
import { runOne, type RunOpts } from "./run";
import { spawnStreaming } from "./spawn";
import { renderSummary } from "./summary";
import { TASKS, taskById } from "./tasks";
import { exportTree, judge, referenceDiff, removeTree, runOracle, sh, snapshotDeps } from "./tree";

const HERE = import.meta.dir;
const DEFAULT_WORK = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "tobogan-model-sweep");
const MINUTE_MS = 60_000;
// Surface key shared by every Claude cell: they draw on one subscription plan.
const CLAUDE = "claude";

const { positionals, values: v } = parseArgs({
  allowPositionals: true,
  options: {
    sweep: { type: "string" },
    tasks: { type: "string" },
    cells: { type: "string" },
    reps: { type: "string", default: "5" },
    seed: { type: "string", default: "20261122" },
    tests: { type: "string", default: "visible" },
    "work-dir": { type: "string", default: DEFAULT_WORK },
    "results-dir": { type: "string", default: join(HERE, "results") },
    "timeout-min": { type: "string", default: "20" },
    "oracle-timeout-min": { type: "string", default: "5" },
    "concurrency-start": { type: "string", default: "2" },
    "concurrency-max": { type: "string", default: "5" },
    "raise-every": { type: "string", default: "5" },
    "min-gap-s": { type: "string", default: "30" },
    "cooldown-min": { type: "string", default: "15" },
    "retry-excluded": { type: "boolean", default: false },
    "keep-trees": { type: "boolean", default: false },
  },
});

const list = (s: string | undefined, all: string[]): string[] => (s ? s.split(",").map((x) => x.trim()) : all);
const tasks = list(v.tasks, TASKS.map((t) => t.id));
for (const t of tasks) {
  if (!taskById(t)) {
    throw new Error(`unknown task ${t}`);
  }
}

const cmd = positionals[0];
if (cmd === "prove") {
  await prove();
} else if (cmd === "run") {
  await run();
} else if (cmd === "rejudge") {
  await rejudgeExcluded();
} else if (cmd === "summarize") {
  summarize();
} else {
  console.error("usage: bun sweep.ts <prove|run|rejudge|summarize> [options]  (see README.md)");
  process.exit(2);
}

// RED: parent + PR tests must fail on an assertion. GREEN: parent + reference diff + PR tests pass.
async function prove(): Promise<void> {
  const out = join(v["results-dir"]!, "prove");
  mkdirSync(out, { recursive: true });
  const timeoutMs = Number(v["oracle-timeout-min"]) * MINUTE_MS;
  for (const id of tasks) {
    const task = taskById(id)!;
    const dir = join(v["work-dir"]!, "prove", id);
    removeTree(dir);
    const deps = await snapshotDeps(task, v["work-dir"]!);
    await exportTree(task, task.parent, join(dir, "red"), true, deps);
    const red = await runOracle(task, join(dir, "red"), timeoutMs);
    const green = await judge(task, await referenceDiff(task), join(dir, "green"), timeoutMs, deps);
    writeFileSync(join(out, `${id}-red.log`), red.output);
    writeFileSync(join(out, `${id}-green.log`), green.output);
    const ok = isGenuineRed(red.oracleExit, red.output) && green.applied && green.oracleExit === 0;
    const row = { task: id, parent: task.parent, merge: task.merge, redExit: red.oracleExit, redGenuine: isGenuineRed(red.oracleExit, red.output), greenApplied: green.applied, greenExit: green.oracleExit, ok };
    writeFileSync(join(out, `${id}.json`), JSON.stringify(row, null, 1));
    console.log(JSON.stringify(row));
    removeTree(dir);
  }
}

async function run(): Promise<void> {
  if (!v.sweep) {
    throw new Error("--sweep <id> is required");
  }
  const cells = list(v.cells, CELLS.map((c) => c.id));
  const resultsDir = join(v["results-dir"]!, v.sweep);
  mkdirSync(resultsDir, { recursive: true });
  const runsPath = join(resultsDir, "runs.jsonl");
  const prior = latestRuns(readRuns(runsPath));
  // Deferred runs are never done: a later `run` picks them up without --retry-excluded.
  const done = new Set(prior.filter((r) => r.outcome !== "deferred" && (!v["retry-excluded"] || COUNTED_OUTCOMES.has(r.outcome))).map((r) => r.runId));
  const plan = buildPlan(tasks, cells, Number(v.reps), Number(v.seed));
  const waiting = pending(plan, done);
  const ramp: Ramp = { start: Number(v["concurrency-start"]), max: Number(v["concurrency-max"]), raiseEvery: Number(v["raise-every"]) };
  const manifest = await writeManifest(resultsDir, cells, plan.length, ramp);
  const saveManifest = () => writeFileSync(join(resultsDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`sweep ${v.sweep}: ${plan.length} planned, ${waiting.length} pending, results in ${resultsDir}`);

  const opts: Omit<RunOpts, "concurrency"> = {
    sweepId: v.sweep,
    workDir: join(v["work-dir"]!, v.sweep),
    resultsDir,
    tests: v.tests as TestsMode,
    timeoutMs: Number(v["timeout-min"]) * MINUTE_MS,
    oracleTimeoutMs: Number(v["oracle-timeout-min"]) * MINUTE_MS,
    keepTrees: v["keep-trees"]!,
    ...(await isolation()),
  };
  // Limits are per surface: all Claude cells share one plan; each pi cell is its own provider.
  const surfaceKey = (cell: string) => (CELLS.find((c) => c.id === cell)!.surface === "claude" ? CLAUDE : cell);
  const parked = new Map<string, string>();
  const pausedUntil = new Map<string, number>();
  let conc = ramp.start;
  let clean = 0;
  let lastLaunch = 0;
  const inflight = new Set<Promise<void>>();
  const park = (key: string, reason: string, runId?: string) => {
    if (parked.has(key)) {
      return;
    }
    parked.set(key, reason);
    manifest.bindingEvents.push({ at: new Date().toISOString(), kind: "park", surface: key, runId, concurrency: conc, reason });
    saveManifest();
    console.log(`PARK ${key}: ${reason}`);
  };
  const usesClaude = waiting.some((it) => surfaceKey(it.cell) === CLAUDE);
  let windows: Windows | null = usesClaude ? (latestClaudeWindows(prior) ?? (await liveClaudeWindows(opts.workDir))) : null;
  manifest.claudeWindowsAtStart = windows;
  saveManifest();

  while (waiting.length > 0) {
    while (inflight.size >= conc) {
      await Promise.race(inflight);
    }
    // Quota guard before every Claude launch, on the latest reading; parked runs are deferred.
    const reason = windows ? parkReason(windows) : null;
    if (reason) {
      park(CLAUDE, reason);
    }
    for (let i = waiting.length - 1; i >= 0; i--) {
      const key = surfaceKey(waiting[i].cell);
      if (parked.has(key)) {
        const [item] = waiting.splice(i, 1);
        appendFileSync(runsPath, JSON.stringify(stubRecord(item, "deferred", `parked: ${parked.get(key)}`)) + "\n");
      }
    }
    if (waiting.length === 0) {
      break;
    }
    // Ramp, not burst: the launch gap, then the first item whose surface is not cooling down.
    const now = Date.now();
    const gap = lastLaunch + Number(v["min-gap-s"]) * 1000 - now;
    const idx = waiting.findIndex((it) => (pausedUntil.get(surfaceKey(it.cell)) ?? 0) <= now);
    if (gap > 0 || idx === -1) {
      const cooldown = Math.min(...waiting.map((it) => pausedUntil.get(surfaceKey(it.cell)) ?? 0)) - now;
      await Promise.race([Bun.sleep(Math.max(gap, idx === -1 ? cooldown : 0, 1000)), ...inflight]);
      continue;
    }
    const [item] = waiting.splice(idx, 1);
    lastLaunch = now;
    const p: Promise<void> = runOne(item, { ...opts, concurrency: conc })
      .catch((e): RunRecord => stubRecord(item, "run_error", `harness: ${String((e as Error)?.message ?? e).slice(0, 300)}`))
      .then((rec) => {
        appendFileSync(runsPath, JSON.stringify(rec) + "\n");
        console.log(`${rec.runId} ${rec.outcome}${rec.reason ? ` (${rec.reason.slice(0, 120)})` : ""} wall=${Math.round(rec.wallMs / 1000)}s conc=${conc}`);
        const key = surfaceKey(rec.cell);
        if (key === CLAUDE) {
          windows = windowsFrom(rec.rateLimitEvents ?? []) ?? windows;
        }
        if (rec.outcome === "rate_limited") {
          manifest.bindingEvents.push({ at: new Date().toISOString(), kind: "rate_limited", surface: key, runId: rec.runId, concurrency: conc, reason: rec.reason });
          saveManifest();
          conc = nextConcurrency(conc, { cleanSinceChange: 0, rateLimited: true }, ramp);
          clean = 0;
          if (key === CLAUDE) {
            park(CLAUDE, `rate limited: ${rec.reason ?? ""}`, rec.runId);
          } else {
            pausedUntil.set(key, Date.now() + Number(v["cooldown-min"]) * MINUTE_MS);
          }
          return;
        }
        clean += 1;
        const next = nextConcurrency(conc, { cleanSinceChange: clean, rateLimited: false }, ramp);
        if (next !== conc) {
          [conc, clean] = [next, 0];
        }
      })
      .finally(() => inflight.delete(p));
    inflight.add(p);
  }
  await Promise.all(inflight);
  manifest.finishedAt = new Date().toISOString();
  saveManifest();
  summarize();
}

// Latest Claude window reading among this sweep's earlier runs (on resume), if any.
function latestClaudeWindows(rows: RunRecord[]): Windows | null {
  const claude = new Set(CELLS.filter((c) => c.surface === "claude").map((c) => c.id));
  const withEvents = rows.filter((r) => claude.has(r.cell) && (r.rateLimitEvents?.length ?? 0) > 0 && r.startedAt);
  withEvents.sort((a, b) => a.startedAt!.localeCompare(b.startedAt!));
  const last = withEvents.at(-1);
  return last ? windowsFrom(last.rateLimitEvents!) : null;
}

// No reading yet: one trivial haiku prompt reads the plan windows before any Claude task run.
async function liveClaudeWindows(workDir: string): Promise<Windows | null> {
  const dir = join(workDir, "quota-probe");
  mkdirSync(dir, { recursive: true });
  const haiku = CELLS.find((c) => c.id === "haiku")!;
  const res = await spawnStreaming(buildArgv(haiku, "Reply with exactly: OK"), {
    cwd: dir,
    env: childEnv(process.env, haiku.surface),
    timeoutMs: 3 * MINUTE_MS,
    transcriptPath: join(dir, "transcript.jsonl"),
    stderrPath: join(dir, "stderr.txt"),
  });
  return windowsFrom(parseClaudeStream(res.lines).rateLimitEvents);
}

function stubRecord(item: { runId: string; task: string; cell: string; rep: number }, outcome: RunRecord["outcome"], reason: string): RunRecord {
  return {
    ...item,
    sweepId: v.sweep,
    outcome,
    reason,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    firstOutputMs: null,
    wallMs: 0,
    cacheHitRate: null,
    notionalCostUsd: null,
    startedAt: new Date().toISOString(),
  };
}

// Dependency snapshot and forbidden paths for every run. Every path here holds the merged fix
// or another run's work: the source repo and all its worktrees, CC transcripts, results, work.
// ceiling: one source repo per sweep — every task today is qara.
async function isolation(): Promise<{ depsDir: string | null; forbidden: string[] }> {
  const repos = [...new Set(tasks.map((id) => taskById(id)!.repo))];
  if (repos.length !== 1) {
    throw new Error(`one source repo per sweep, got ${repos.join(", ")}`);
  }
  const repo = repos[0];
  const worktrees = (await sh(["git", "-C", repo, "worktree", "list", "--porcelain"], HERE)).out
    .split("\n")
    .filter((l) => l.startsWith("worktree "))
    .map((l) => l.slice("worktree ".length));
  return {
    depsDir: await snapshotDeps(taskById(tasks[0])!, v["work-dir"]!),
    forbidden: [...new Set([repo, ...worktrees, join(homedir(), ".claude", "projects"), v["results-dir"]!, v["work-dir"]!])],
  };
}

function readRuns(path: string): RunRecord[] {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RunRecord);
}

async function writeManifest(resultsDir: string, cells: string[], planned: number, ramp: Ramp) {
  const ver = async (argv: string[]) => (await sh(argv, HERE)).out.trim().split("\n")[0];
  const manifest = {
    sweepId: v.sweep,
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    host: hostname(),
    harnessCommit: (await sh(["git", "rev-parse", "HEAD"], HERE)).out.trim(),
    harnessDirty: (await sh(["git", "status", "--porcelain", "--", "."], HERE)).out.trim().length > 0,
    versions: { claude: await ver(["claude", "--version"]), pi: await ver(["pi", "--version"]), bun: Bun.version },
    profile: "lean: claude -p --setting-sources '' --strict-mcp-config, dontAsk + Bash/Read/Edit/Write/Glob/Grep; pi -p defaults; both read the tree's CLAUDE.md/AGENTS.md",
    tests: v.tests,
    seed: Number(v.seed),
    reps: Number(v.reps),
    planned,
    ramp,
    minGapS: Number(v["min-gap-s"]),
    timeoutMin: Number(v["timeout-min"]),
    cells: CELLS.filter((c) => cells.includes(c.id)).map(({ expectModel, ...c }) => ({ ...c, expectModel: String(expectModel) })),
    tasks: tasks.map((id) => {
      const { brief: _b, ...t } = taskById(id)!;
      return t;
    }),
    bindingEvents: [] as unknown[],
    claudeWindowsAtStart: null as Windows | null,
    claudeGuard: { parkSevenDayAt: PARK_SEVEN_DAY, parkFiveHourAt: PARK_FIVE_HOUR },
  };
  writeFileSync(join(resultsDir, "manifest.json"), JSON.stringify(manifest, null, 1));
  return manifest;
}

// Offline: re-scan and re-judge every run whose latest outcome is invalid_escape or escape_attempt. No model call.
async function rejudgeExcluded(): Promise<void> {
  if (!v.sweep) {
    throw new Error("--sweep <id> is required");
  }
  const runsPath = join(v["results-dir"]!, v.sweep, "runs.jsonl");
  const targets = latestRuns(readRuns(runsPath)).filter((r) => r.outcome === "invalid_escape" || r.outcome === "escape_attempt");
  const { depsDir, forbidden } = await isolation();
  for (const row of targets) {
    const rec = await rejudge(row, { workDir: join(v["work-dir"]!, v.sweep), depsDir, forbidden, oracleTimeoutMs: Number(v["oracle-timeout-min"]) * MINUTE_MS });
    appendFileSync(runsPath, JSON.stringify(rec) + "\n");
    console.log(`${rec.runId} ${row.outcome} -> ${rec.outcome}${rec.reason ? ` (${rec.reason.slice(0, 160)})` : ""}`);
  }
  summarize();
}

function summarize(): void {
  if (!v.sweep) {
    throw new Error("--sweep <id> is required");
  }
  const resultsDir = join(v["results-dir"]!, v.sweep);
  const rows = latestRuns(readRuns(join(resultsDir, "runs.jsonl")));
  const manifestPath = join(resultsDir, "manifest.json");
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
  const tests = manifest?.tests ?? v.tests;
  const notes = [
    `Tests mode: ${tests}.${tests === "hidden" ? " The model never saw the PR tests; this differs from Qara's 2026-11-12 sweep, which handed them over." : ""}`,
    "Profile: effort/thinking medium everywhere; Claude with no settings sources (no hooks), pi on its defaults. Claude cost here runs lower than a real Claude Code subagent carrying Qara's hooks.",
  ];
  const { json, markdown } = renderSummary(v.sweep, rows, notes, manifest?.bindingEvents ?? []);
  writeFileSync(join(resultsDir, "summary.json"), JSON.stringify(json, null, 1));
  writeFileSync(join(resultsDir, "summary.md"), markdown);
  console.log(markdown);
}
