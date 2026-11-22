// Render a sweep's rows as summary.json + summary.md: per-cell table, suspicious wins, failure log.
import { CELLS } from "./cells";
import type { RunRecord } from "./record";
import { latestRuns } from "./quota";
import { median, summarizeCell, totalTokens, type CellSummary, type Spread } from "./stats";

// A pass under this fraction of its task's median tokens gets a manual output check before it
// counts (INFER-3: suspiciously cheap means possibly broken).
const SUSPECT_FRACTION = 0.25;

type Failure = { runId: string; outcome: string; reason: string };

// A manifest.json bindingEvents entry (see sweep.ts): a Claude park or a rate-limit refusal.
export type BindingEvent = { at?: string; kind?: string; surface?: string; runId?: string; concurrency?: number; reason?: string };

const thousands = (n: number): string => Math.round(n).toLocaleString("en-US");

// "Additional figures from raw data": per task and cell, min / median / max total tokens of the
// passing runs (one row per run id, the latest wins), then the sweep's park and rate-limit events.
function figuresSection(rows: RunRecord[], events: BindingEvent[]): string[] {
  const passes = latestRuns(rows).filter((r) => r.outcome === "pass");
  const tasks = [...new Set(passes.map((r) => r.task))].sort();
  const cells = CELLS.map((c) => c.id);
  const table = tasks.flatMap((task) =>
    cells.flatMap((cell) => {
      const xs = passes.filter((r) => r.task === task && r.cell === cell).map(totalTokens);
      return xs.length ? [`| ${task} | ${cell} | ${xs.length} | ${thousands(Math.min(...xs))} | ${thousands(median(xs)!)} | ${thousands(Math.max(...xs))} |`] : [];
    }),
  );
  return [
    "## Additional figures from raw data",
    "",
    "Total tokens (input + output + cache read + cache write) per run, passing runs only, one row per run id with the latest winning.",
    "",
    "| task | cell | n | min | median | max |",
    "| --- | --- | --- | --- | --- | --- |",
    ...table,
    "",
    "Binding events (`bindingEvents` in `manifest.json`):",
    "",
    ...(events.length
      ? events.map((e) => `- ${e.kind ?? "event"} ${e.surface ?? "?"} at ${e.at ?? "?"}${e.runId ? ` (${e.runId})` : ""}, concurrency ${e.concurrency ?? "?"}${e.reason ? `: ${e.reason}` : ""}`)
      : ["No park or rate-limit events."]),
    "",
  ];
}

export function renderSummary(sweepId: string, rows: RunRecord[], notes: string[] = [], events: BindingEvent[] = []): { json: { sweepId: string; cells: CellSummary[]; suspects: RunRecord[]; failures: Failure[] }; markdown: string } {
  const order = CELLS.map((c) => c.id).filter((id) => rows.some((r) => r.cell === id));
  const cells = order.map((id) => summarizeCell(id, rows.filter((r) => r.cell === id)));

  const suspects = rows.filter((r) => {
    if (r.outcome !== "pass") {
      return false;
    }
    // Neighbours are passes on the same task (any cell): task size dominates token counts.
    const m = median(rows.filter((x) => x.task === r.task && x.outcome === "pass").map(totalTokens));
    return m !== null && totalTokens(r) < SUSPECT_FRACTION * m;
  });
  const deferred = rows.filter((r) => r.outcome === "deferred");
  const failures = rows.filter((r) => r.outcome !== "pass" && r.outcome !== "deferred").map((r) => ({ runId: r.runId, outcome: r.outcome, reason: r.reason ?? "" }));

  // Pass rate cannot rank cells when every attempted cell solved every task.
  const attempted = cells.filter((c) => c.attempted > 0);
  const atCeiling = attempted.length > 0 && attempted.every((c) => c.passRate === 1);
  const ceiling = atCeiling
    ? [
        "**Ceiling:** every attempted run in every cell passed, so pass rate does not discriminate between models here; compare cost, startup and wall time instead.",
        "For a discriminating wave, use harder tasks: larger multi-file PRs, cross-module refactors, specs that need a design decision, or tasks whose tests check behaviour the brief only implies. Add gate checks (typecheck, lint, the repo's line cap) to the oracle.",
        "",
      ]
    : [];

  const fmt = (x: number | null, d = 0) => (x === null ? "–" : x.toFixed(d));
  const sp = (s: Spread, scale = 1, d = 0) => (s.median === null ? "–" : `${fmt(s.median / scale, d)} [${fmt(s.p25! / scale, d)}–${fmt(s.p75! / scale, d)}]`);
  const lines = [
    `# Model sweep ${sweepId}`,
    "",
    "Tokens are provider usage summed over the run (input + output + cache read + cache write). $ is pi's or Claude Code's list-price estimate, not plan credits. Spreads are median [p25–p75]; task pass rate is median [min–max] over tasks.",
    "",
    ...notes.map((n) => `- ${n}`),
    ...(notes.length ? [""] : []),
    ...ceiling,
    `Deferred (parked by the Claude quota guard, resumed by a later run): ${deferred.length}${deferred.length ? ` (${[...new Set(deferred.map((r) => r.cell))].map((c) => `${c} ${deferred.filter((r) => r.cell === c).length}`).join(", ")})` : ""}.`,
    "",
    "| cell | pass | pass rate (95% CI) | task pass rate | k tokens / pass | notional $ / pass | k tokens / run | startup s | wall s | cache hit | excluded (rate-limited) |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...cells.map(
      (c) =>
        `| ${c.cell} | ${c.passes}/${c.attempted} | ${fmt(c.passRate, 2)} (${c.passRateCi95.map((x) => x.toFixed(2)).join("–")}) | ${fmt(c.taskPassRate.median, 2)} [${fmt(c.taskPassRate.min, 2)}–${fmt(c.taskPassRate.max, 2)}] | ${fmt(c.tokensPerPass === null ? null : c.tokensPerPass / 1000)} | ${fmt(c.notionalUsdPerPass, 3)} | ${sp(c.tokens, 1000)} | ${sp(c.startupMs, 1000, 1)} | ${sp(c.wallMs, 1000)} | ${sp(c.cacheHitRate, 1, 2)} | ${c.excluded} (${c.rateLimited}) |`,
    ),
    "",
    "Notional $ / pass and k tokens / pass divide the cost of every counted attempt, failed attempts included, by the number of passes; a cell with failures looks dearer per pass than per run.",
    "",
    "## Suspicious wins (check the output before counting)",
    "",
    ...(suspects.length ? suspects.map((r) => `- ${r.runId}: ${totalTokens(r)} tokens`) : ["None."]),
    "",
    "## Failure log",
    "",
    ...(failures.length ? failures.map((f) => `- ${f.runId}: ${f.outcome}${f.reason ? ` — ${f.reason}` : ""}`) : ["None."]),
    "",
    ...figuresSection(rows, events),
  ];
  return { json: { sweepId, cells, suspects, failures }, markdown: lines.join("\n") };
}
