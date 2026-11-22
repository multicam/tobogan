// Pure helpers on the run path: the brief, tool-call extraction, the escape scan and oracle
// verdicts. No model judges a run; the PR's tests do (approved design, 2026-11-22).
import type { Line } from "./parse";
import type { Task } from "./tasks";

export type TestsMode = "visible" | "hidden";

// Identical for every task, cell and mode, so a provider can cache it (INFER-5). The variable
// part (task, acceptance check) comes last.
const PREAMBLE = `You are doing one coding task in a standalone copy of a repository. Your current working directory is the repository root.

Rules:
- Read and edit files only inside the current directory. Do not read, list or search anything outside it.
- No git history (no git log, show or blame, no diff against other commits), no gh, no web access.
- Do not commit, stash or create branches. Leave your changes uncommitted in the working tree.
- Do not run bun install or any other package install; the tests you need run without it.
- Do not run the repository's whole test suite.
- Work without asking questions; nobody will answer. When you are done, reply with one short paragraph saying what you changed.
`;

export function buildBrief(task: Task, mode: TestsMode): string {
  const check =
    mode === "visible"
      ? `The acceptance test is already in place and currently fails: ${task.testFiles.map((f) => `\`bun test ./${f}\``).join(", ")}. Done means it passes. Do not edit that test file.`
      : "Maintainers will judge your change with tests you cannot see. You may write and run tests of your own.";
  return `${PREAMBLE}\n## Task\n\n${task.brief}\n\n## Acceptance check\n\n${check}\n`;
}

type Json = Record<string, any>;

export type ToolCall = { name: string; args: Json };

// Every tool call, from pi (toolCall) or claude (tool_use) events.
export function extractToolCalls(lines: Line[]): ToolCall[] {
  const out: ToolCall[] = [];
  for (const { line } of lines) {
    if (!line.includes("toolCall") && !line.includes("tool_use")) {
      continue;
    }
    let ev: Json;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const content = ev.message?.content;
    if (!Array.isArray(content) || (ev.type !== "message_end" && ev.type !== "assistant")) {
      continue;
    }
    for (const c of content) {
      if (c?.type === "toolCall" || c?.type === "tool_use") {
        out.push({ name: String(c.name), args: (c.arguments ?? c.input ?? {}) as Json });
      }
    }
  }
  return out;
}

// Only where a call *goes* is scanned: file-tool path fields and the shell command. Edit/write
// content routinely quotes `gh pr list`, `git show` or paths from the code under change, so
// scanning it flagged honest edits (13 false positives in full-20261122).
const LOCATION_FIELDS = ["path", "file_path", "notebook_path", "cwd"];
const WEB_TOOL = /^(WebFetch|WebSearch|web_fetch|web_search|fetch)$/;

// Network reach from a shell command, in command position (start, or after ; & | ( or $( ).
// git log/show/blame are not here: a run tree is a one-commit repo with no history to leak;
// `git -C <source repo> …` is still caught by the forbidden-path check.
const NETWORK_COMMAND = /(^|[;&|(]\s*|\$\(\s*)(gh\s+\w|git\s+(fetch|pull|clone)\b|curl\s|wget\s)/m;

// Tool calls that reach outside the run tree. `forbidden` lists paths that hold the fix or other
// runs' work, matched as substrings (so `<repo>-worktrees` siblings are caught too). Occurrences
// of an `allow` prefix (the run's own dirs) are removed first. Returns "name {args}" strings.
export function scanEscapes(calls: ToolCall[], forbidden: string[], allow: string[] = []): string[] {
  const strip = (s: string) => allow.reduce((acc, a) => acc.split(a).join(""), s);
  const hits = calls.filter(({ name, args }) => {
    if (WEB_TOOL.test(name)) {
      return true;
    }
    const where = LOCATION_FIELDS.map((f) => args[f]).filter((x): x is string => typeof x === "string");
    if (name === "Glob" && typeof args.pattern === "string") {
      where.push(args.pattern);
    }
    const command = typeof args.command === "string" ? strip(args.command) : "";
    if (NETWORK_COMMAND.test(command)) {
      return true;
    }
    return [...where.map(strip), command].some((s) => forbidden.some((p) => s.includes(p)));
  });
  return hits.map(({ name, args }) => `${name} ${JSON.stringify(args)}`);
}

export function parseBunCounts(output: string): { pass: number; fail: number } {
  const pass = output.match(/^\s*(\d+) pass\b/m);
  const fail = output.match(/^\s*(\d+) fail\b/m);
  return { pass: pass ? Number(pass[1]) : 0, fail: fail ? Number(fail[1]) : 0 };
}

// RED must be an assertion failure: the file loaded (some test passed) and some test failed.
export function isGenuineRed(exitCode: number, output: string): boolean {
  const { pass, fail } = parseBunCounts(output);
  return exitCode !== 0 && pass > 0 && fail > 0;
}
