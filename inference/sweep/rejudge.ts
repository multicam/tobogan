// Offline re-judge of a recorded run: re-scan its saved transcript with the current escape scan
// and, if clean, run the same oracle on its saved diff. Makes no model call. The corrected row
// is appended to runs.jsonl; latestRuns() lets it supersede the original.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyEscapes, extractToolCalls } from "./oracle";
import { scanCtx } from "./run";
import type { Line } from "./parse";
import type { RunRecord } from "./record";
import { taskById } from "./tasks";
import { judge, removeTree } from "./tree";

export type RejudgeOpts = { workDir: string; depsDir: string | null; forbidden: string[]; oracleTimeoutMs: number };

export async function rejudge(row: RunRecord, opts: RejudgeOpts): Promise<RunRecord> {
  const task = taskById(row.task)!;
  const art = row.artifacts!;
  const lines: Line[] = readFileSync(join(art, "transcript.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);
  const work = join(opts.workDir, row.runId);
  const { attempts, leaks } = classifyEscapes(extractToolCalls(lines), scanCtx(work, join(work, "tree"), opts));
  const escapes = [...leaks, ...attempts];
  const base = { ...row, escapes, reason: undefined as string | undefined };
  if (leaks.length > 0) {
    return { ...base, outcome: "invalid_escape", reason: `rejudged offline, still an escape: ${leaks.slice(0, 3).join(" | ").slice(0, 300)}` };
  }
  if (attempts.length > 0) {
    return { ...base, outcome: "escape_attempt", reason: `rejudged offline, all flagged calls failed: ${attempts.slice(0, 3).join(" | ").slice(0, 300)}` };
  }

  const diffPath = join(art, "diff.patch");
  const diff = existsSync(diffPath) ? readFileSync(diffPath, "utf8") : "";
  if (!diff.trim()) {
    return { ...base, outcome: "sanity_fail", reason: "rejudged offline: empty diff" };
  }
  const judgeDir = join(work, "rejudge");
  removeTree(work);
  const v = await judge(task, diff, judgeDir, opts.oracleTimeoutMs, opts.depsDir);
  writeFileSync(join(art, "oracle.txt"), v.output);
  removeTree(work);
  if (!v.applied) {
    return { ...base, outcome: "sanity_fail", oracleExit: null, reason: "rejudged offline: diff does not apply to a clean parent export" };
  }
  return { ...base, outcome: v.oracleExit === 0 ? "pass" : "fail", oracleExit: v.oracleExit, reason: "rejudged offline after the escape-scan fix" };
}
