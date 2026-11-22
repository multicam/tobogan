// Shared run-record types: one JSONL row per run in results/<sweep>/runs.jsonl.

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

// Outcome of one run. "pass", "fail", "sanity_fail" (empty or non-applying diff) and "timeout"
// (the model never finished) count toward pass rate. Rate limits, CLI/harness errors, route
// mismatches and escapes outside the run tree are excluded and logged separately.
export type Outcome =
  | "pass"
  | "fail"
  | "sanity_fail"
  | "rate_limited"
  | "timeout"
  | "run_error"
  | "route_error"
  | "invalid_escape"
  // Claude cells parked by the quota guard (quota.ts): not attempted, resumed by a later `run`.
  | "deferred";

export const COUNTED_OUTCOMES: ReadonlySet<Outcome> = new Set(["pass", "fail", "sanity_fail", "timeout"]);

export type RunRecord = {
  runId: string;
  sweepId?: string;
  task: string;
  cell: string;
  rep: number;
  outcome: Outcome;
  reason?: string;
  usage: Usage;
  turns?: number;
  model?: string | null;
  provider?: string | null;
  effort?: string;
  firstOutputMs: number | null;
  wallMs: number;
  cacheHitRate: number | null;
  notionalCostUsd: number | null;
  quotaShare?: number | null;
  quotaNote?: string;
  rateLimitEvents?: unknown[];
  permissionDenials?: number;
  diffBytes?: number;
  escapes?: string[];
  oracleExit?: number | null;
  startedAt?: string;
  concurrency?: number;
  artifacts?: string;
};
