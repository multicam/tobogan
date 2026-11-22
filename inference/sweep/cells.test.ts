// Cells: the five model routes, their argv, the child environment and the route check.
import { describe, expect, test } from "bun:test";
import { CELLS, buildArgv, childEnv, routeProblem } from "./cells";

describe("CELLS", () => {
  test("are exactly the five approved routes", () => {
    expect(CELLS.map((c) => c.id)).toEqual(["haiku", "sonnet", "opus", "glm", "codex"]);
  });
});

describe("childEnv", () => {
  test("drops the metered key, base-URL overrides and inherited Claude Code session variables", () => {
    const env = childEnv({
      PATH: "/usr/bin",
      HOME: "/home/x",
      ANTHROPIC_API_KEY: "placeholder",
      ANTHROPIC_AUTH_TOKEN: "placeholder",
      ANTHROPIC_BASE_URL: "http://elsewhere",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_SUBAGENT_MODEL_FORCE: "1",
      CLAUDE_CODE_USE_BEDROCK: "1",
      QARA_TDD_AGENT_ID: "a1",
      ANTHROPIC_FOUNDRY_API_KEY: "placeholder",
      ANTHROPIC_FOUNDRY_RESOURCE: "placeholder",
      ANTHROPIC_BEDROCK_BASE_URL: "http://elsewhere",
      ANTHROPIC_VERTEX_PROJECT_ID: "placeholder",
      CLAUDE_CODE_OAUTH_TOKEN: "subscription-token",
      UNSET: undefined,
    });
    expect(env).toEqual({ PATH: "/usr/bin", HOME: "/home/x", CLAUDE_CODE_OAUTH_TOKEN: "subscription-token" });
  });
});

describe("childEnv for claude cells (allowlist)", () => {
  test("keeps only what claude -p needs and drops other routing, credential and model-override variables", () => {
    const env = childEnv(
      {
        PATH: "/usr/bin",
        HOME: "/home/x",
        LANG: "en_US.UTF-8",
        LC_ALL: "C",
        TERM: "xterm",
        XDG_CACHE_HOME: "/home/x/.cache",
        HTTPS_PROXY: "http://proxy",
        CLAUDE_CODE_OAUTH_TOKEN: "subscription-token",
        AWS_BEARER_TOKEN_BEDROCK: "placeholder",
        AWS_ACCESS_KEY_ID: "placeholder",
        AWS_SECRET_ACCESS_KEY: "placeholder",
        AWS_REGION: "x",
        GOOGLE_APPLICATION_CREDENTIALS: "/x.json",
        ANTHROPIC_MODEL: "opus",
        ANTHROPIC_DEFAULT_SONNET_MODEL: "x",
        OPENAI_API_KEY: "placeholder",
        ZAI_API_KEY: "placeholder",
      },
      "claude",
    );
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/x",
      LANG: "en_US.UTF-8",
      LC_ALL: "C",
      TERM: "xterm",
      XDG_CACHE_HOME: "/home/x/.cache",
      HTTPS_PROXY: "http://proxy",
      CLAUDE_CODE_OAUTH_TOKEN: "subscription-token",
    });
  });

  test("pi cells keep their provider credentials (denylist only)", () => {
    const env = childEnv({ PATH: "/usr/bin", ZAI_API_KEY: "placeholder", ANTHROPIC_API_KEY: "placeholder" }, "pi");
    expect(env).toEqual({ PATH: "/usr/bin", ZAI_API_KEY: "placeholder" });
  });
});

describe("KNOWN LIMIT: the Claude and pi child environments differ (documented gap, not desired behaviour)", () => {
  const parent = { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/c", BUN_INSTALL: "/b", NODE_OPTIONS: "--x", GIT_AUTHOR_NAME: "n", CI: "1", SSH_AUTH_SOCK: "/s" };

  test("the same parent env reaches pi cells but is dropped for Claude cells", () => {
    expect(childEnv(parent, "claude")).toEqual({ PATH: "/usr/bin" });
    expect(childEnv(parent, "pi")).toEqual(parent);
  });
});

describe("buildArgv", () => {
  const brief = "do the task";
  const cell = (id: string) => CELLS.find((c) => c.id === id)!;

  test("claude cells use print mode, stream-json, the cell model and never --bare", () => {
    const argv = buildArgv(cell("haiku"), brief);
    expect(argv[0]).toBe("claude");
    expect(argv).toContain("-p");
    expect(argv.join(" ")).toContain("--output-format stream-json");
    expect(argv.join(" ")).toContain("--model haiku");
    expect(argv).not.toContain("--bare");
    expect(argv).not.toContain("--dangerously-skip-permissions");
    expect(argv.at(-1)).toBe(brief);
  });

  test("glm goes through pi's zai provider on the Coding Plan model", () => {
    const argv = buildArgv(cell("glm"), brief);
    expect(argv.slice(0, 1)).toEqual(["pi"]);
    expect(argv.join(" ")).toContain("--provider zai --model glm-5.3-flash");
    expect(argv.join(" ")).toContain("--mode json");
  });

  test("codex takes pi's default route: no provider or model flag", () => {
    const argv = buildArgv(cell("codex"), brief);
    expect(argv).not.toContain("--provider");
    expect(argv).not.toContain("--model");
    expect(argv.at(-1)).toBe(brief);
  });
});

describe("routeProblem", () => {
  test("accepts the expected provider and model family", () => {
    expect(routeProblem(CELLS[0], { provider: "anthropic-subscription", model: "claude-haiku-5-5" })).toBeNull();
    expect(routeProblem(CELLS[3], { provider: "zai", model: "glm-5.3-flash" })).toBeNull();
    expect(routeProblem(CELLS[4], { provider: "openai-codex", model: "gpt-6.2-sol" })).toBeNull();
  });
  test("rejects metered auth, a substituted model and a missing model", () => {
    expect(routeProblem(CELLS[0], { provider: "anthropic-metered", model: "claude-haiku-5-5" })).toMatch(/provider/);
    expect(routeProblem(CELLS[1], { provider: "anthropic-subscription", model: "claude-haiku-5-5" })).toMatch(/model/);
    expect(routeProblem(CELLS[4], { provider: "openai-codex", model: null })).toMatch(/model/);
  });
});
