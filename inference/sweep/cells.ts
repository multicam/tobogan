// The five approved model routes (owner approval 2026-11-22), their argv and the route check.
//
//   haiku | sonnet | opus  -> claude -p, subscription OAuth only (metered key scrubbed)
//   glm                    -> pi --provider zai --model glm-5.3-flash  (Z.AI Coding Plan endpoint)
//   codex                  -> pi with no provider/model: pi's default route (openai-codex)
//
// Harness profile "lean": Claude loads no settings sources (no user or project hooks; Qara's
// hook stack would otherwise gate a headless run), pi runs on its own defaults. Both still read
// the run tree's CLAUDE.md / AGENTS.md. --bare is never used: it forces API-key auth.

export type Surface = "claude" | "pi";

export type Cell = {
  id: string;
  surface: Surface;
  model?: string;
  provider?: string;
  effort: string;
  // Stream checks: expected provider label and a pattern the resolved model id must match.
  expectProvider: string;
  expectModel: RegExp;
};

export const EFFORT = "medium";

export const CELLS: Cell[] = [
  { id: "haiku", surface: "claude", model: "haiku", effort: EFFORT, expectProvider: "anthropic-subscription", expectModel: /haiku/ },
  { id: "sonnet", surface: "claude", model: "sonnet", effort: EFFORT, expectProvider: "anthropic-subscription", expectModel: /sonnet/ },
  { id: "opus", surface: "claude", model: "opus", effort: EFFORT, expectProvider: "anthropic-subscription", expectModel: /opus/ },
  { id: "glm", surface: "pi", provider: "zai", model: "glm-5.3-flash", effort: EFFORT, expectProvider: "zai", expectModel: /^glm-5\.3-flash$/ },
  { id: "codex", surface: "pi", effort: EFFORT, expectProvider: "openai-codex", expectModel: /^gpt-/ },
];

// Tools a Claude cell may use without a prompt. dontAsk denies everything else.
const CLAUDE_TOOLS = "Bash Read Edit Write Glob Grep";

// Variables that would switch a child to metered billing, another endpoint, or make it think
// it is nested in this session. CLAUDE_CODE_OAUTH_TOKEN is subscription auth and is kept.
const DROP_EXACT = new Set(["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "CLAUDECODE", "QARA_TDD_AGENT_ID"]);
const KEEP_EXACT = new Set(["CLAUDE_CODE_OAUTH_TOKEN"]);
const DROP_PREFIX = /^CLAUDE_CODE_/;

export function childEnv(base: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined || DROP_EXACT.has(k)) {
      continue;
    }
    if (DROP_PREFIX.test(k) && !KEEP_EXACT.has(k)) {
      continue;
    }
    out[k] = v;
  }
  return out;
}

export function buildArgv(cell: Cell, brief: string): string[] {
  if (cell.surface === "claude") {
    return [
      "claude",
      "-p",
      "--model",
      cell.model!,
      "--effort",
      cell.effort,
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--permission-mode",
      "dontAsk",
      "--allowedTools",
      CLAUDE_TOOLS,
      "--",
      brief,
    ];
  }
  const route = cell.provider ? ["--provider", cell.provider, "--model", cell.model!] : [];
  return ["pi", "-p", "--mode", "json", "--no-session", ...route, "--thinking", cell.effort, "--", brief];
}

// Null when the stream shows the approved route; otherwise why the run is not this cell.
export function routeProblem(cell: Cell | undefined, seen: { provider: string | null; model: string | null }): string | null {
  if (!cell) {
    return "unknown cell";
  }
  if (seen.provider !== cell.expectProvider) {
    return `provider ${seen.provider ?? "missing"} is not ${cell.expectProvider}`;
  }
  if (!seen.model || !cell.expectModel.test(seen.model)) {
    return `model ${seen.model ?? "missing"} does not match ${cell.expectModel}`;
  }
  return null;
}
