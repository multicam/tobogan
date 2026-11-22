// One run end to end: fresh tree -> agent CLI -> diff -> sanity gate -> escape scan -> oracle.
//
//   work/<runId>/tree     the agent's tree (deleted after unless keepTrees)
//   work/<runId>/judge    clean parent export + diff + pristine tests (deleted after)
//   results/<sweep>/runs/<runId>/{transcript.jsonl,stderr.txt,diff.patch,oracle.txt}
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CELLS, buildArgv, childEnv, routeProblem } from "./cells";
import { buildBrief, extractToolCalls, scanEscapes, type TestsMode } from "./oracle";
import { cacheHitRate, classifyError, parseClaudeStream, parsePiStream } from "./parse";
import type { PlanItem } from "./plan";
import type { Outcome, RunRecord } from "./record";
import { spawnStreaming } from "./spawn";
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

  const res = await spawnStreaming(buildArgv(cell, buildBrief(task, opts.tests)), {
    cwd: tree,
    env: childEnv(process.env),
    timeoutMs: opts.timeoutMs,
    transcriptPath: join(art, "transcript.jsonl"),
    stderrPath: join(art, "stderr.txt"),
  });
  const s = cell.surface === "claude" ? parseClaudeStream(res.lines) : parsePiStream(res.lines);
  const diff = await captureDiff(task, tree);
  writeFileSync(join(art, "diff.patch"), diff);
  const escapes = scanEscapes(extractToolCalls(res.lines), opts.forbidden, [`${work}/`, ...(opts.depsDir ? [opts.depsDir] : [])]);

  // Outcome precedence: wrong route, refusal by quota, CLI error, escape, then the model's result.
  let outcome: Outcome | null = null;
  let reason = "";
  const route = s.turns > 0 || s.model ? routeProblem(cell, s) : null;
  const refused = s.rateLimitEvents.some((e: any) => e?.status === REFUSED);
  if (route) {
    [outcome, reason] = ["route_error", route];
  } else if (refused || (s.errorText && classifyError(s.errorText) === "rate_limited")) {
    [outcome, reason] = ["rate_limited", s.errorText ?? "rate_limit_event rejected"];
  } else if (res.timedOut) {
    [outcome, reason] = ["timeout", `killed after ${opts.timeoutMs} ms`];
  } else if (res.exitCode !== 0 || s.errorText || s.turns === 0) {
    [outcome, reason] = ["run_error", s.errorText ?? `exit ${res.exitCode} ${res.signal ?? ""}`.trim()];
  } else if (escapes.length > 0) {
    [outcome, reason] = ["invalid_escape", escapes.slice(0, 3).join(" | ").slice(0, 300)];
  }

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
