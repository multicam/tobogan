// Parsers turn a timestamped CLI stream into one usage summary per run.
// Fixtures are trimmed copies of real `pi -p --mode json` output (2026-11-22) and the
// documented `claude -p --output-format stream-json` event shapes.
import { describe, expect, test } from "bun:test";
import { cacheHitRate, classifyError, meteredInit, parseClaudeStream, parsePiStream, type Line } from "./parse";

const stamp = (objs: unknown[], step = 100): Line[] => objs.map((o, i) => ({ t: (i + 1) * step, line: JSON.stringify(o) }));

const piUsage = (input: number, output: number, cacheRead = 0) => ({
  input,
  output,
  cacheRead,
  cacheWrite: 0,
  totalTokens: input + output + cacheRead,
  cost: { input: 0.001, output: 0.0001, cacheRead: 0, cacheWrite: 0, total: 0.0011, totalFromProvider: false },
});

const piAssistant = (usage: ReturnType<typeof piUsage>, text: string, stopReason = "stop") => ({
  type: "message_end",
  message: { role: "assistant", content: [{ type: "text", text }], provider: "zai", model: "glm-5.3-flash", usage, stopReason },
});

describe("parsePiStream", () => {
  test("sums usage over assistant turns and takes model and provider from the stream", () => {
    const lines = stamp([
      { type: "session", version: 3, id: "s1" },
      { type: "agent_start" },
      { type: "message_end", message: { role: "user", content: [{ type: "text", text: "go" }] } },
      { type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "The" } },
      piAssistant(piUsage(6000, 20), "step one", "toolUse"),
      piAssistant(piUsage(500, 30, 6000), "done"),
      { type: "agent_settled", aborted: false },
    ]);
    const s = parsePiStream(lines);
    expect(s.usage).toEqual({ input: 6500, output: 50, cacheRead: 6000, cacheWrite: 0 });
    expect(s.turns).toBe(2);
    expect(s.provider).toBe("zai");
    expect(s.model).toBe("glm-5.3-flash");
    expect(s.firstOutputMs).toBe(400);
    expect(s.finalText).toBe("done");
    expect(s.notionalCostUsd).toBeCloseTo(0.0022, 6);
    expect(s.errorText).toBeNull();
  });

  test("an assistant error stop is surfaced as errorText", () => {
    const err = { ...piAssistant(piUsage(0, 0), ""), message: { ...piAssistant(piUsage(0, 0), "").message, stopReason: "error", errorMessage: "429 Too Many Requests" } };
    const s = parsePiStream(stamp([err]));
    expect(s.errorText).toContain("429");
  });

  test("non-JSON lines are ignored, not fatal", () => {
    const s = parsePiStream([{ t: 5, line: "warning: something" }, ...stamp([piAssistant(piUsage(10, 1), "ok")])]);
    expect(s.turns).toBe(1);
  });
});

describe("parseClaudeStream", () => {
  const init = { type: "system", subtype: "init", model: "claude-haiku-5-5", apiKeySource: "none", permissionMode: "dontAsk" };
  const result = {
    type: "result",
    subtype: "success",
    is_error: false,
    num_turns: 4,
    result: "All tests pass.",
    total_cost_usd: 0.05,
    usage: { input_tokens: 99, output_tokens: 99, cache_read_input_tokens: 99, cache_creation_input_tokens: 99 },
    modelUsage: {
      "claude-haiku-5-5": { inputTokens: 1200, outputTokens: 800, cacheReadInputTokens: 30000, cacheCreationInputTokens: 9000, costUSD: 0.04 },
      "claude-haiku-5-5-helper": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0.01 },
    },
    permission_denials: [{ tool_name: "WebFetch" }],
  };

  test("takes cumulative usage from result.modelUsage, model and auth source from init", () => {
    const s = parseClaudeStream(
      stamp([init, { type: "stream_event", event: { type: "message_start" } }, { type: "assistant", message: { content: [] } }, result]),
    );
    expect(s.usage).toEqual({ input: 1300, output: 850, cacheRead: 30000, cacheWrite: 9000 });
    expect(s.model).toBe("claude-haiku-5-5");
    expect(s.provider).toBe("anthropic-subscription");
    expect(s.authSource).toBe("none");
    expect(s.turns).toBe(4);
    expect(s.firstOutputMs).toBe(200);
    expect(s.finalText).toBe("All tests pass.");
    expect(s.permissionDenials).toBe(1);
    expect(s.notionalCostUsd).toBeCloseTo(0.05, 6);
    expect(s.errorText).toBeNull();
  });

  test("an API-key auth source is reported as a metered provider, never as subscription", () => {
    const s = parseClaudeStream(stamp([{ ...init, apiKeySource: "ANTHROPIC_API_KEY" }, result]));
    expect(s.provider).toBe("anthropic-metered");
  });

  test("falls back to result.usage when modelUsage is absent", () => {
    const { modelUsage: _drop, ...bare } = result;
    const s = parseClaudeStream(stamp([init, bare]));
    expect(s.usage).toEqual({ input: 99, output: 99, cacheRead: 99, cacheWrite: 99 });
  });

  test("an error result and rate-limit events are captured", () => {
    const s = parseClaudeStream(
      stamp([init, { type: "rate_limit_event", rate_limit_info: { status: "allowed_warning", utilization: 0.8 } }, { ...result, is_error: true, subtype: "error_during_execution", result: "Claude AI usage limit reached" }]),
    );
    expect(s.errorText).toContain("usage limit");
    expect(s.rateLimitEvents).toHaveLength(1);
  });
});

describe("meteredInit", () => {
  const init = (apiKeySource: string) => JSON.stringify({ type: "system", subtype: "init", apiKeySource, model: "claude-haiku-5-5" });
  test("is true for an init event whose apiKeySource is not none", () => {
    expect(meteredInit(init("ANTHROPIC_API_KEY"))).toBe(true);
    expect(meteredInit(init("none"))).toBe(false);
  });
  test("fails closed: an init with a missing or non-string apiKeySource is metered", () => {
    expect(meteredInit(JSON.stringify({ type: "system", subtype: "init" }))).toBe(true);
    expect(meteredInit(JSON.stringify({ type: "system", subtype: "init", apiKeySource: null }))).toBe(true);
    expect(meteredInit(JSON.stringify({ type: "system", subtype: "init", apiKeySource: 0 }))).toBe(true);
    expect(meteredInit(init("None"))).toBe(true);
  });
  test("ignores other events and non-JSON lines", () => {
    expect(meteredInit(JSON.stringify({ type: "assistant", apiKeySource: "x" }))).toBe(false);
    expect(meteredInit(JSON.stringify({ type: "system", subtype: "other" }))).toBe(false);
    expect(meteredInit("not json")).toBe(false);
    expect(meteredInit("{truncated")).toBe(false);
  });
});

describe("cacheHitRate", () => {
  test("is cache reads over all prompt-side tokens", () => {
    expect(cacheHitRate({ input: 100, output: 5, cacheRead: 300, cacheWrite: 100 })).toBeCloseTo(0.6, 6);
  });
  test("is null when there were no prompt tokens", () => {
    expect(cacheHitRate({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBeNull();
  });
});

describe("classifyError", () => {
  test.each(["429 Too Many Requests", "Claude AI usage limit reached", "rate_limit_error", "quota exceeded", "Overloaded"])("%s is a rate limit", (msg) => {
    expect(classifyError(msg)).toBe("rate_limited");
  });
  test("anything else is a run error", () => {
    expect(classifyError("tool crashed")).toBe("run_error");
  });
});
