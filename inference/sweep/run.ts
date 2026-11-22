// One run end to end: fresh tree -> agent CLI -> diff -> sanity gate -> escape scan -> oracle.
//
//   work/<runId>/tree     the agent's tree (deleted after unless keepTrees)
//   work/<runId>/judge    clean parent export + diff + pristine tests (deleted after)
//   results/<sweep>/runs/<runId>/{transcript.jsonl,stderr.txt,diff.patch,oracle.txt}
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { CELLS, buildArgv, childEnv, routeProblem, type Cell } from "./cells";
import { buildBrief, classifyEscapes, extractToolCalls, type ScanCtx, type TestsMode } from "./oracle";
import { cacheHitRate, classifyError, meteredInit, parseClaudeStream, parsePiStream } from "./parse";
import type { PlanItem } from "./plan";
import type { Outcome, RunRecord } from "./record";
import { spawnStreaming, type SpawnResult } from "./spawn";
import { taskById } from "./tasks";
import { captureDiff, exportTree, judge, removeTree } from "./tree";

export type RunOpts = {
  sweepId: string;
  workDir: string;
  resultsDir: string;
  tests: TestsMode;
  timeoutMs: number;
  oracleTimeoutMs: number;
  keepTrees: boolean;
  concurrency: number;
  // Read-only dependency snapshot (tree.snapshotDeps) and paths a run must never touch:
  // the source repo and its worktrees, CC transcripts, the results root, the work root.
  depsDir: string | null;
  forbidden: string[];
};

// A rate-limit event with this status means the request was refused, not merely warned.
const REFUSED = "rejected";

type SpawnOpts = Parameters<typeof spawnStreaming>[1];

// Spawn the cell's CLI, parse its stream and check the route. The spawner is a seam for tests.
export async function runAgent(cell: Cell, brief: string, base: SpawnOpts, spawner: typeof spawnStreaming = spawnStreaming) {
  const res: SpawnResult = await spawner(buildArgv(cell, brief), {
    ...base,
    // A Claude run whose init reports a non-subscription auth source is killed at once.
    killOn: cell.surface === "claude" ? meteredInit : undefined,
  });
  const s = cell.surface === "claude" ? parseClaudeStream(res.lines) : parsePiStream(res.lines);
  const route = s.turns > 0 || s.model || res.killedEarly ? routeProblem(cell, s) : null;
  return { res, s, route };
}

// Escape-scan context for one run: its tree is the only inside; its work dir and the deps copy
// are stripped from the forbidden-substring check.
export function scanCtx(work: string, tree: string, opts: Pick<RunOpts, "depsDir" | "forbidden">, legacyTmp = false): ScanCtx {
  return { forbidden: opts.forbidden, allow: [`${work}/`, ...(opts.depsDir ? [opts.depsDir] : [])], root: tree, home: homedir(), deps: opts.depsDir, tmp: runTmp(work), legacyTmp };
}

// Stamped on every record runOne writes. Rows without it are legacy (recorded before per-run
// TMPDIR) and are re-scanned with bare /tmp allowed; every new row is scanned strictly.
export const RUN_MARKER = { perRunTmp: true } as const;
export const isLegacyRow = (row: { perRunTmp?: boolean }): boolean => row.perRunTmp !== true;

// Each run's private scratch dir, so no run reads another's (or another session's) files in /tmp.
const runTmp = (work: string): string => join(work, "tmp");

// The child's environment for one run: the surface's filtered env, with TMPDIR pointing at the run's own dir.
export function runEnv(surface: Cell["surface"], tmp: string, base: Record<string, string | undefined> = process.env): Record<string, string> {
  return { ...childEnv(base, surface), TMPDIR: tmp };
}

// Outcome precedence: wrong route, refusal by quota, timeout, CLI error, escape; null when the
// run finished cleanly and the oracle decides. Only a flagged call that succeeded (or has no
// result) is an invalid_escape; flagged calls that all failed are an escape_attempt. Both are
// excluded from pass counts (record.ts).
export function decideOutcome(i: {
  res: Pick<SpawnResult, "timedOut" | "exitCode" | "signal">;
  s: { rateLimitEvents: unknown[]; errorText: string | null; turns: number };
  route: string | null;
  timeoutMs: number;
  attempts: string[];
  leaks: string[];
}): { outcome: Outcome | null; reason: string } {
  const refused = i.s.rateLimitEvents.some((e: any) => e?.status === REFUSED);
  if (i.route) {
    return { outcome: "route_error", reason: i.route };
  }
  if (refused || (i.s.errorText && classifyError(i.s.errorText) === "rate_limited")) {
    return { outcome: "rate_limited", reason: i.s.errorText ?? "rate_limit_event rejected" };
  }
  if (i.res.timedOut) {
    return { outcome: "timeout", reason: `killed after ${i.timeoutMs} ms` };
  }
  if (i.res.exitCode !== 0 || i.s.errorText || i.s.turns === 0) {
    return { outcome: "run_error", reason: i.s.errorText ?? `exit ${i.res.exitCode} ${i.res.signal ?? ""}`.trim() };
  }
  if (i.leaks.length > 0) {
    return { outcome: "invalid_escape", reason: i.leaks.slice(0, 3).join(" | ").slice(0, 300) };
  }
  if (i.attempts.length > 0) {
    return { outcome: "escape_attempt", reason: `all flagged calls failed: ${i.attempts.slice(0, 3).join(" | ").slice(0, 300)}` };
  }
  return { outcome: null, reason: "" };
}

export async function runOne(item: PlanItem, opts: RunOpts): Promise<RunRecord> {
  const task = taskById(item.task)!;
  const cell = CELLS.find((c) => c.id === item.cell)!;
  const work = join(opts.workDir, item.runId);
  const art = join(opts.resultsDir, "runs", item.runId);
  mkdirSync(art, { recursive: true });
  removeTree(work);
  const tree = join(work, "tree");
  const startedAt = new Date().toISOString();
  await exportTree(task, task.parent, tree, opts.tests === "visible", opts.depsDir);
  mkdirSync(runTmp(work), { recursive: true });

  const { res, s, route } = await runAgent(cell, buildBrief(task, opts.tests), {
    cwd: tree,
    env: runEnv(cell.surface, runTmp(work)),
    timeoutMs: opts.timeoutMs,
    transcriptPath: join(art, "transcript.jsonl"),
    stderrPath: join(art, "stderr.txt"),
  });
  const diff = await captureDiff(task, tree);
  writeFileSync(join(art, "diff.patch"), diff);
  const { attempts, leaks } = classifyEscapes(extractToolCalls(res.lines), scanCtx(work, tree, opts));
  const escapes = [...leaks, ...attempts];

  let { outcome, reason } = decideOutcome({ res, s, route, timeoutMs: opts.timeoutMs, attempts, leaks });

  // Sanity gate, then the oracle (only for runs that finished cleanly).
  let oracleExit: number | null = null;
  if (outcome === null && !diff.trim()) {
    [outcome, reason] = ["sanity_fail", "empty diff"];
  }
  if (outcome === null) {
    const v = await judge(task, diff, join(work, "judge"), opts.oracleTimeoutMs, opts.depsDir);
    writeFileSync(join(art, "oracle.txt"), v.output);
    oracleExit = v.oracleExit;
    if (!v.applied) {
      [outcome, reason] = ["sanity_fail", "diff does not apply to a clean parent export"];
    } else {
      outcome = v.oracleExit === 0 ? "pass" : "fail";
    }
  }
  if (!opts.keepTrees) {
    removeTree(work);
  }

  return {
    runId: item.runId,
    sweepId: opts.sweepId,
    task: item.task,
    cell: item.cell,
    rep: item.rep,
    outcome: outcome!,
    reason: reason || undefined,
    usage: s.usage,
    turns: s.turns,
    model: s.model,
    provider: s.provider,
    effort: cell.effort,
    firstOutputMs: s.firstOutputMs,
    wallMs: res.wallMs,
    cacheHitRate: cacheHitRate(s.usage),
    notionalCostUsd: s.notionalCostUsd,
    quotaShare: null,
    quotaNote: quotaNote(cell.surface, s.rateLimitEvents),
    rateLimitEvents: s.rateLimitEvents,
    permissionDenials: s.permissionDenials,
    diffBytes: diff.length,
    escapes,
    ...RUN_MARKER,
    oracleExit,
    startedAt,
    concurrency: opts.concurrency,
    artifacts: art,
  };
}

// Per-run quota share is not observable on any route: Claude reports only threshold-level
// window utilization, pi relays no quota fields. Record what is visible.
function quotaNote(surface: string, events: unknown[]): string {
  if (surface !== "claude") {
    return "no quota field in pi's stream (GLM plan credits and Codex windows not relayed)";
  }
  const last = events.at(-1) as any;
  if (!last?.unifiedWindows) {
    return "no rate_limit_event seen";
  }
  const w = last.unifiedWindows;
  return `window utilization (threshold-level): five_hour ${w.five_hour?.utilization ?? "?"}, seven_day ${w.seven_day?.utilization ?? "?"}`;
}
