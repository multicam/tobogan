// Claude quota guard (owner ruling 2026-11-22). Claude Code's stream reports plan-window
// utilization in rate_limit_event; before each Claude launch the sweep reads the latest one and
// parks only the Claude cells above these limits. The headroom is reserved for the owner's
// own working sessions. Parked runs are recorded as "deferred" and resumed by a later `run`.
import type { RunRecord } from "./record";

export type Windows = { fiveHour: number | null; sevenDay: number | null };

export const PARK_SEVEN_DAY = 0.95;
export const PARK_FIVE_HOUR = 0.98;

const util = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function windowsFrom(events: unknown[]): Windows | null {
  const last = events.at(-1) as Record<string, any> | undefined;
  if (!last) {
    return null;
  }
  if (last.unifiedWindows) {
    return { fiveHour: util(last.unifiedWindows.five_hour?.utilization), sevenDay: util(last.unifiedWindows.seven_day?.utilization) };
  }
  // Older event shape: one window per event, named by rateLimitType.
  return {
    fiveHour: last.rateLimitType === "five_hour" ? util(last.utilization) : null,
    sevenDay: last.rateLimitType === "seven_day" ? util(last.utilization) : null,
  };
}

export function parkReason(w: Windows): string | null {
  if (w.sevenDay !== null && w.sevenDay >= PARK_SEVEN_DAY) {
    return `seven_day ${w.sevenDay} >= ${PARK_SEVEN_DAY}`;
  }
  if (w.fiveHour !== null && w.fiveHour >= PARK_FIVE_HOUR) {
    return `five_hour ${w.fiveHour} >= ${PARK_FIVE_HOUR}`;
  }
  return null;
}

// Last row per run id: a run deferred, then done on resume, counts once with its final outcome.
export function latestRuns(rows: RunRecord[]): RunRecord[] {
  const byId = new Map<string, RunRecord>();
  for (const r of rows) {
    byId.delete(r.runId);
    byId.set(r.runId, r);
  }
  return [...byId.values()];
}
