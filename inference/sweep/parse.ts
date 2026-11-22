// Stream parsers: timestamped CLI output -> one usage summary per run.
// Tokens come from the provider usage fields the CLIs relay, never from counting chunks (INFER-5).
//
//   pi -p --mode json            -> message_end{assistant, usage}   per turn  -> summed
//   claude -p stream-json        -> result{modelUsage | usage}      cumulative -> taken as is
import type { Usage } from "./record";

export type Line = { t: number; line: string };

export type StreamSummary = {
  usage: Usage;
  turns: number;
  model: string | null;
  provider: string | null;
  authSource: string | null;
  firstOutputMs: number | null;
  finalText: string;
  errorText: string | null;
  notionalCostUsd: number | null;
  permissionDenials: number;
  rateLimitEvents: unknown[];
};

const RATE_LIMIT = /rate.?limit|\b429\b|quota|usage limit|overloaded|too many requests/i;

// Claude Code's init event reports "none" when no API key is in play (subscription OAuth).
const SUBSCRIPTION_AUTH = "none";

type Json = Record<string, any>;

function emptySummary(): StreamSummary {
  return {
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    turns: 0,
    model: null,
    provider: null,
    authSource: null,
    firstOutputMs: null,
    finalText: "",
    errorText: null,
    notionalCostUsd: null,
    permissionDenials: 0,
    rateLimitEvents: [],
  };
}

// True for a Claude init line whose apiKeySource is not exactly subscription auth: the run is on
// a metered or foreign route and can be killed before it spends anything. Fails closed: a missing
// or non-string apiKeySource counts as metered.
export function meteredInit(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return false;
  }
  try {
    const ev = JSON.parse(trimmed);
    return ev.type === "system" && ev.subtype === "init" && ev.apiKeySource !==SUBSCRIPTION_AUTH;
  } catch {
    return false;
  }
}

function* events(lines: Line[]): Generator<{ t: number; ev: Json }> {
  for (const { t, line } of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      yield { t, ev: JSON.parse(trimmed) };
    } catch {
      // A truncated last line (killed process) is expected; skip it.
    }
  }
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function textOf(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .filter((c) => c?.type === "text")
    .map((c) => String(c.text ?? ""))
    .join("");
}

export function parsePiStream(lines: Line[]): StreamSummary {
  const s = emptySummary();
  let cost = 0;
  let sawCost = false;
  for (const { t, ev } of events(lines)) {
    // First streamed assistant token of any kind marks the end of spawn overhead.
    if (ev.type === "message_update" && ev.assistantMessageEvent && s.firstOutputMs === null) {
      s.firstOutputMs = t;
    }
    if (ev.type !== "message_end" || ev.message?.role !== "assistant") {
      continue;
    }
    const m = ev.message;
    const u = m.usage ?? {};
    s.usage.input += num(u.input);
    s.usage.output += num(u.output);
    s.usage.cacheRead += num(u.cacheRead);
    s.usage.cacheWrite += num(u.cacheWrite);
    if (u.cost && typeof u.cost.total === "number") {
      cost += u.cost.total;
      sawCost = true;
    }
    s.turns += 1;
    s.provider = m.provider ?? s.provider;
    s.model = m.model ?? s.model;
    s.firstOutputMs ??= t;
    const text = textOf(m.content);
    if (text) {
      s.finalText = text;
    }
    if (m.stopReason === "error" || m.stopReason === "aborted") {
      s.errorText = String(m.errorMessage ?? m.stopReason);
    }
  }
  s.notionalCostUsd = sawCost ? cost : null;
  return s;
}

export function parseClaudeStream(lines: Line[]): StreamSummary {
  const s = emptySummary();
  for (const { t, ev } of events(lines)) {
    if (ev.type === "system" && ev.subtype === "init") {
      s.model = ev.model ?? null;
      s.authSource = ev.apiKeySource ?? null;
      s.provider = s.authSource === SUBSCRIPTION_AUTH ? "anthropic-subscription" : "anthropic-metered";
      continue;
    }
    if (ev.type === "rate_limit_event") {
      s.rateLimitEvents.push(ev.rate_limit_info ?? ev);
      continue;
    }
    if ((ev.type === "stream_event" || ev.type === "assistant") && s.firstOutputMs === null) {
      s.firstOutputMs = t;
    }
    if (ev.type === "result") {
      readClaudeResult(s, ev);
    }
  }
  return s;
}

function readClaudeResult(s: StreamSummary, ev: Json): void {
  const byModel = ev.modelUsage && typeof ev.modelUsage === "object" ? Object.values(ev.modelUsage as Json) : [];
  if (byModel.length > 0) {
    for (const u of byModel) {
      s.usage.input += num(u.inputTokens);
      s.usage.output += num(u.outputTokens);
      s.usage.cacheRead += num(u.cacheReadInputTokens);
      s.usage.cacheWrite += num(u.cacheCreationInputTokens);
    }
  } else {
    const u = ev.usage ?? {};
    s.usage = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheWrite: num(u.cache_creation_input_tokens),
    };
  }
  s.turns = num(ev.num_turns);
  s.finalText = typeof ev.result === "string" ? ev.result : "";
  s.notionalCostUsd = typeof ev.total_cost_usd === "number" ? ev.total_cost_usd : null;
  s.permissionDenials = Array.isArray(ev.permission_denials) ? ev.permission_denials.length : 0;
  if (ev.is_error) {
    s.errorText = s.finalText || String(ev.subtype ?? "error");
  }
}

// Share of prompt-side tokens served from cache.
export function cacheHitRate(u: Usage): number | null {
  const prompt = u.input + u.cacheRead + u.cacheWrite;
  return prompt > 0 ? u.cacheRead / prompt : null;
}

export function classifyError(message: string): "rate_limited" | "run_error" {
  return RATE_LIMIT.test(message) ? "rate_limited" : "run_error";
}
