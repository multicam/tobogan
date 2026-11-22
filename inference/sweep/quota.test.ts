// Claude quota guard (owner ruling 2026-11-22): park the Claude cells when the weekly window is
// at or above 95% or the five-hour window at or above 98%; the headroom is the owner's own work.
import { describe, expect, test } from "bun:test";
import { latestRuns, parkReason, windowsFrom } from "./quota";
import type { RunRecord } from "./record";

const ev = (five: number, week: number) => ({ status: "allowed_warning", unifiedWindows: { five_hour: { utilization: five }, seven_day: { utilization: week } } });

describe("windowsFrom", () => {
  test("reads the last event's five-hour and weekly utilization", () => {
    expect(windowsFrom([ev(0.5, 0.6), ev(0.92, 0.76)])).toEqual({ fiveHour: 0.92, sevenDay: 0.76 });
  });
  test("falls back to the top-level window when unifiedWindows is absent", () => {
    expect(windowsFrom([{ rateLimitType: "seven_day", utilization: 0.97 }])).toEqual({ fiveHour: null, sevenDay: 0.97 });
  });
  test("reads the old one-window-per-event shape across events", () => {
    const five = { rateLimitType: "five_hour", utilization: 0.99 };
    const week = { rateLimitType: "seven_day", utilization: 0.4 };
    expect(windowsFrom([five, week])).toEqual({ fiveHour: 0.99, sevenDay: 0.4 });
  });
  test("a last event missing a window keeps the latest earlier reading of that window", () => {
    const partial = { status: "allowed", unifiedWindows: { seven_day: { utilization: 0.5 } } };
    expect(windowsFrom([ev(0.99, 0.4), partial])).toEqual({ fiveHour: 0.99, sevenDay: 0.5 });
    expect(windowsFrom([ev(0.99, 0.4), { status: "allowed" }])).toEqual({ fiveHour: 0.99, sevenDay: 0.4 });
  });
  test("is null without events", () => {
    expect(windowsFrom([])).toBeNull();
  });
});

describe("parkReason", () => {
  test("runs below both limits", () => {
    expect(parkReason({ fiveHour: 0.97, sevenDay: 0.94 })).toBeNull();
  });
  test("parks at 95% weekly or 98% five-hour, inclusive", () => {
    expect(parkReason({ fiveHour: 0.5, sevenDay: 0.95 })).toMatch(/seven_day 0.95/);
    expect(parkReason({ fiveHour: 0.98, sevenDay: 0.5 })).toMatch(/five_hour 0.98/);
  });
  test("an unknown window does not park on its own", () => {
    expect(parkReason({ fiveHour: null, sevenDay: null })).toBeNull();
  });
});

describe("latestRuns", () => {
  const r = (runId: string, outcome: RunRecord["outcome"]) => ({ runId, outcome }) as RunRecord;
  test("keeps the last row per run id, so a deferred run later done counts once", () => {
    const rows = latestRuns([r("a", "deferred"), r("b", "pass"), r("a", "fail")]);
    expect(rows.map((x) => `${x.runId}:${x.outcome}`).sort()).toEqual(["a:fail", "b:pass"]);
  });
});
