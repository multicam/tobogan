// Pure helpers on the run path: the brief, tool-call extraction, the escape scan and oracle
// verdicts. No model judges a run; the PR's tests do (approved design, 2026-11-22).
import { join, resolve } from "node:path";
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

// `failed` is set when the transcript carries the call's result: true when the tool reported an
// error, false when it did not, undefined when no result was found (a killed run, a cut line).
export type ToolCall = { name: string; args: Json; failed?: boolean };

// Every tool call, from pi (toolCall) or claude (tool_use) events, each paired with its result:
//   claude: assistant tool_use{id}      <-> user tool_result{tool_use_id, is_error}
//   pi:     message_end toolCall{id}    <-> turn_end toolResults[]{toolCallId, isError}
//                                           (or a message_end with role "toolResult")
export function extractToolCalls(lines: Line[]): ToolCall[] {
  const out: (ToolCall & { id?: string })[] = [];
  const errored = new Map<string, boolean>();
  for (const { line } of lines) {
    const isCall = line.includes("toolCall") || line.includes("tool_use");
    const isResult = line.includes("toolResult") || line.includes("tool_result");
    if (!isCall && !isResult) {
      continue;
    }
    let ev: Json;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    const content = ev.message?.content;
    if (isCall && Array.isArray(content) && (ev.type === "message_end" || ev.type === "assistant")) {
      for (const c of content) {
        if (c?.type === "toolCall" || c?.type === "tool_use") {
          out.push({ id: c.id, name: String(c.name), args: (c.arguments ?? c.input ?? {}) as Json });
        }
      }
    }
    if (!isResult) {
      continue;
    }
    for (const r of Array.isArray(ev.toolResults) ? ev.toolResults : []) {
      errored.set(String(r?.toolCallId), r?.isError === true);
    }
    if (ev.message?.role === "toolResult") {
      errored.set(String(ev.message.toolCallId), ev.message.isError === true);
    }
    for (const c of Array.isArray(content) ? content : []) {
      if (c?.type === "tool_result") {
        errored.set(String(c.tool_use_id), c.is_error === true);
      }
    }
  }
  return out.map(({ id, ...call }) => (id !== undefined && errored.has(id) ? { ...call, failed: errored.get(id) } : call));
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

export type ScanCtx = {
  // Paths that hold the fix or other runs' work, matched as substrings (so `<repo>-worktrees`
  // siblings are caught too).
  forbidden: string[];
  // Prefixes removed before the forbidden-substring match (the run's own work dir, the deps copy).
  allow: string[];
  // The run's tree: relative paths resolve against it, and only it (plus deps and SAFE_DIRS) is "inside".
  root: string;
  home: string;
  // Read-only dependency snapshot, inside by permission.
  deps: string | null;
};

// Where legitimate runs go besides their tree: system executables and libraries, scratch space,
// /dev/null. From the sampled full-20261122 transcripts: /usr/bin/{git,grep,find,head,tail,sed,
// mktemp} and /bin/ls. The run's own work dir is deliberately not here: `../x` from the tree lands in it.
const SAFE_DIRS = ["/usr", "/bin", "/lib", "/lib64", "/tmp", "/dev/null"];

// First segments that make a slash-leading shell token a real filesystem path rather than a
// regex or sed address (`sed -n '/a/,/b/p'`, `rg '/api/'`).
const SYSTEM_ROOTS = new Set(["home", "root", "etc", "var", "opt", "mnt", "media", "srv", "proc", "sys", "run", "Users", "private"]);

const within = (abs: string, dir: string): boolean => {
  const d = dir.replace(/\/+$/, "");
  return abs === d || abs.startsWith(`${d}/`);
};

const expandTilde = (p: string, home: string): string => (p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p);

// True when `p`, resolved from `cwd` with `~` expanded, lands outside the tree and the allowlist.
function leavesTree(p: string, cwd: string, ctx: ScanCtx): boolean {
  const abs = resolve(cwd, expandTilde(p, ctx.home));
  return ![ctx.root, ...(ctx.deps ? [ctx.deps] : []), ...SAFE_DIRS].some((d) => within(abs, d));
}

// Path-like shell tokens: relative ones that walk up, tilde ones, and absolute ones under a
// system root. Quotes, separators, redirects and `=` split tokens; `cd <dir>` moves the
// resolution base for the rest of the one command string (cross-call cwd is not tracked).
function shellEscapes(command: string, ctx: ScanCtx): boolean {
  let cwd = ctx.root;
  const tokens = command.split(/[\s;&|()<>=`"'{}$]+/).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const pathLike = t === ".." || t.startsWith("../") || t.includes("/../") || t.endsWith("/..") || t.startsWith("~") || (t.startsWith("/") && SYSTEM_ROOTS.has(t.split("/")[1]));
    if (pathLike && leavesTree(t, cwd, ctx)) {
      return true;
    }
    if (t === "cd" && tokens[i + 1] && !tokens[i + 1].startsWith("-")) {
      cwd = resolve(cwd, expandTilde(tokens[i + 1], ctx.home));
    }
  }
  return false;
}

// A tool call's file-tool path fields and Glob pattern, as written.
function locationsOf({ name, args }: ToolCall): string[] {
  const where = LOCATION_FIELDS.map((f) => args[f]).filter((x): x is string => typeof x === "string");
  if (name === "Glob" && typeof args.pattern === "string") {
    where.push(args.pattern);
  }
  return where;
}

// Tool calls that reach outside the run tree: web tools, network commands, forbidden paths, and
// any file-tool path or obvious shell path argument that resolves outside the tree. Only where a
// call goes is read, never what it writes. Returns the flagged calls.
export function flaggedCalls(calls: ToolCall[], ctx: ScanCtx): ToolCall[] {
  const strip = (s: string) => ctx.allow.reduce((acc, a) => acc.split(a).join(""), s);
  return calls.filter((call) => {
    if (WEB_TOOL.test(call.name)) {
      return true;
    }
    const where = locationsOf(call);
    const command = typeof call.args.command === "string" ? call.args.command : "";
    if (NETWORK_COMMAND.test(strip(command))) {
      return true;
    }
    if ([...where.map(strip), strip(command)].some((s) => ctx.forbidden.some((p) => s.includes(p)))) {
      return true;
    }
    return where.some((w) => leavesTree(w, ctx.root, ctx)) || shellEscapes(command, ctx);
  });
}

const describeCall = ({ name, args }: ToolCall): string => `${name} ${JSON.stringify(args)}`;

// Flagged calls as "name {args}" strings.
export function scanEscapes(calls: ToolCall[], ctx: ScanCtx): string[] {
  return flaggedCalls(calls, ctx).map(describeCall);
}

const SHELL_TOOL = /^(bash|shell)$/i;
// One simple command: no separators, pipes, newlines or substitutions.
const SIMPLE_COMMAND = /^[^;&|\n`$()]*$/;

// Split flagged calls into attempts (the tool reported an error: nothing was read or written)
// and leaks (it succeeded, or no result was found). Fails closed. A shell call counts as an
// attempt only when it is one simple command, since a compound command can read and then fail.
export function classifyEscapes(calls: ToolCall[], ctx: ScanCtx): { attempts: string[]; leaks: string[] } {
  const attempts: string[] = [];
  const leaks: string[] = [];
  for (const call of flaggedCalls(calls, ctx)) {
    const simpleEnough = !SHELL_TOOL.test(call.name) || SIMPLE_COMMAND.test(String(call.args.command ?? ""));
    (call.failed === true && simpleEnough ? attempts : leaks).push(describeCall(call));
  }
  return { attempts, leaks };
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
