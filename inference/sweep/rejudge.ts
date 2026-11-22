// Offline re-judge of a recorded run: re-scan its saved transcript with the current escape scan
// and, if clean, run the same oracle on its saved diff. Makes no model call. The corrected row
// is appended to runs.jsonl; latestRuns() lets it supersede the original.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyEscapes, extractToolCalls } from "./oracle";
import { latestRuns } from "./quota";
import { scanCtx } from "./run";
import type { Line } from "./parse";
import type { RunRecord } from "./record";
import { taskById } from "./tasks";
import { judge, removeTree } from "./tree";

export type RejudgeOpts = { workDir: string; depsDir: string | null; forbidden: string[]; oracleTimeoutMs: number };

const readTranscript = (art: string): Line[] =>
  readFileSync(join(art, "transcript.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Line);

const escapeKind = (o: string): string => (o === "invalid_escape" || o === "escape_attempt" ? o : "clean");

// Read-only replay of every latest row of a sweep through the current escape scan. Returns one
// line per run (`<id> old=<outcome> new=<invalid_escape|escape_attempt|clean|no-transcript>`,
// CHANGED when the scan's verdict differs from what the old outcome implied) and a count line.
// It reads runs.jsonl and each transcript.jsonl and writes nothing (pinned by rejudge.test.ts).
// Transcripts are looked up under `<sweepDir>/runs/<id>/`, not the path recorded in the row.
export function dryRunSweep(sweepDir: string, opts: Pick<RejudgeOpts, "workDir" | "depsDir" | "forbidden">): string[] {
  const rows = latestRuns(
    readFileSync(join(sweepDir, "runs.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as RunRecord),
  );
  let changed = 0;
  const out = rows.map((row) => {
    const art = join(sweepDir, "runs", row.runId);
    if (!existsSync(join(art, "transcript.jsonl"))) {
      return `${row.runId} old=${row.outcome} new=no-transcript`;
    }
    const work = join(opts.workDir, row.runId);
    const { attempts, leaks } = classifyEscapes(extractToolCalls(readTranscript(art)), scanCtx(work, join(work, "tree"), opts, row.perRunTmp !== true));
    const now = leaks.length > 0 ? "invalid_escape" : attempts.length > 0 ? "escape_attempt" : "clean";
    const differs = now !== escapeKind(row.outcome);
    changed += differs ? 1 : 0;
    const first = [...leaks, ...attempts][0];
    return `${row.runId} old=${row.outcome} new=${now}${differs ? " CHANGED" : ""}${differs && first ? ` | ${first.slice(0, 300)}` : ""}`;
  });
  return [...out, `${rows.length} runs, ${changed} changed`];
}

export async function rejudge(row: RunRecord, opts: RejudgeOpts): Promise<RunRecord> {
  const task = taskById(row.task)!;
  const art = row.artifacts!;
  const lines = readTranscript(art);
  const work = join(opts.workDir, row.runId);
  const { attempts, leaks } = classifyEscapes(extractToolCalls(lines), scanCtx(work, join(work, "tree"), opts, row.perRunTmp !== true));
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
