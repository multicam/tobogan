// The sweep's scheduling decisions, free of the CLI: what to launch next, when to park Claude,
// how concurrency ramps and halves (INFER-7), and what counts as done on resume. Clock, sleep,
// runner and sinks are injected so tests drive it without a model or a real timer.
import { nextConcurrency, type PlanItem, type Ramp } from "./plan";
import { parkReason, windowsFrom, type Windows } from "./quota";
import { COUNTED_OUTCOMES, type Outcome, type RunRecord } from "./record";

// Surface key shared by every Claude cell: they draw on one subscription plan.
export const CLAUDE = "claude";

export type SchedulerCfg = {
  ramp: Ramp;
  minGapMs: number;
  cooldownMs: number;
  // Limits are per surface: all Claude cells share one plan; each pi cell is its own provider.
  surfaceOf: (cell: string) => string;
};

export type SchedulerDeps = {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  runOne: (item: PlanItem, concurrency: number) => Promise<RunRecord>;
  // runs.jsonl sink.
  append: (rec: RunRecord) => void;
  // manifest bindingEvents sink (park, rate_limited).
  event: (e: { at: string; kind: string; surface: string; runId?: string; concurrency: number; reason?: string }) => void;
  stub: (item: PlanItem, outcome: Outcome, reason: string) => RunRecord;
  log: (msg: string) => void;
};

// Run ids already finished in `prior` (latest row per run id). Deferred runs are never done: a
// later `run` picks them up without --retry-excluded. With it, only runs that got a fair attempt
// (counted outcomes) are done; excluded ones go again.
export function doneRunIds(prior: RunRecord[], retryExcluded: boolean): Set<string> {
  return new Set(prior.filter((r) => r.outcome !== "deferred" && (!retryExcluded || COUNTED_OUTCOMES.has(r.outcome))).map((r) => r.runId));
}

// Drains `waiting` (mutated). `windows` is the latest Claude plan-window reading, if any.
export async function schedule(waiting: PlanItem[], initialWindows: Windows | null, cfg: SchedulerCfg, deps: SchedulerDeps): Promise<void> {
  const { ramp } = cfg;
  const parked = new Map<string, string>();
  const pausedUntil = new Map<string, number>();
  const inflight = new Set<Promise<void>>();
  let windows = initialWindows;
  let conc = ramp.start;
  let clean = 0;
  let lastLaunch = 0;

  const park = (key: string, reason: string, runId?: string) => {
    if (parked.has(key)) {
      return;
    }
    parked.set(key, reason);
    deps.event({ at: new Date(deps.now()).toISOString(), kind: "park", surface: key, runId, concurrency: conc, reason });
    deps.log(`PARK ${key}: ${reason}`);
  };

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
      const key = cfg.surfaceOf(waiting[i].cell);
      if (parked.has(key)) {
        const [item] = waiting.splice(i, 1);
        deps.append(deps.stub(item, "deferred", `parked: ${parked.get(key)}`));
      }
    }
    if (waiting.length === 0) {
      break;
    }
    // Ramp, not burst: the launch gap, then the first item whose surface is not cooling down.
    const now = deps.now();
    const gap = lastLaunch + cfg.minGapMs - now;
    const idx = waiting.findIndex((it) => (pausedUntil.get(cfg.surfaceOf(it.cell)) ?? 0) <= now);
    if (gap > 0 || idx === -1) {
      const cooldown = Math.min(...waiting.map((it) => pausedUntil.get(cfg.surfaceOf(it.cell)) ?? 0)) - now;
      await Promise.race([deps.sleep(Math.max(gap, idx === -1 ? cooldown : 0, 1000)), ...inflight]);
      continue;
    }
    const [item] = waiting.splice(idx, 1);
    lastLaunch = now;
    const p: Promise<void> = deps
      .runOne(item, conc)
      .catch((e): RunRecord => deps.stub(item, "run_error", `harness: ${String((e as Error)?.message ?? e).slice(0, 300)}`))
      .then((rec) => {
        deps.append(rec);
        deps.log(`${rec.runId} ${rec.outcome}${rec.reason ? ` (${rec.reason.slice(0, 120)})` : ""} wall=${Math.round(rec.wallMs / 1000)}s conc=${conc}`);
        const key = cfg.surfaceOf(rec.cell);
        if (key === CLAUDE) {
          windows = windowsFrom(rec.rateLimitEvents ?? []) ?? windows;
        }
        if (rec.outcome === "rate_limited") {
          deps.event({ at: new Date(deps.now()).toISOString(), kind: "rate_limited", surface: key, runId: rec.runId, concurrency: conc, reason: rec.reason });
          conc = nextConcurrency(conc, { cleanSinceChange: 0, rateLimited: true }, ramp);
          clean = 0;
          if (key === CLAUDE) {
            park(CLAUDE, `rate limited: ${rec.reason ?? ""}`, rec.runId);
          } else {
            pausedUntil.set(key, deps.now() + cfg.cooldownMs);
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
}
