// Pure helpers on the run path: the brief, tool-call extraction, the escape scan and oracle
// verdicts. No model judges a run; the PR's tests do (approved design, 2026-11-22).
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Line } from "./parse";
import type { Task } from "./tasks";

export type TestsMode = "visible" | "hidden";

// Identical for every task, cell and mode, so a provider can cache it (INFER-5). The variable
// part (task, acceptance check) comes last.
const PREAMBLE = `You are doing one coding task in a standalone copy of a repository. Your current working directory is the repository root.

Rules:
- Read and edit files only inside the current directory. Do not read, list or search anything outside it.
- For scratch files use $TMPDIR, which is private to this run. Never use a fixed path such as /tmp/x: anything outside the current directory and $TMPDIR is treated as leaving the tree.
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
const LOCATION_FIELDS = ["path", "file_path", "notebook_path", "cwd", "glob"];
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
  // The run's tree: relative paths resolve against it, and only it (plus deps, tmp and SAFE_DIRS) is "inside".
  root: string;
  home: string;
  // Read-only dependency snapshot, inside by permission.
  deps: string | null;
  // The run's private scratch dir, exported to the child as TMPDIR. `$TMPDIR` resolves to it.
  tmp: string | null;
};

// Where legitimate runs go besides their tree: system executables and libraries, and the
// standard streams. From the sampled full-20261122 transcripts: /usr/bin/{git,grep,find,head,
// tail,sed,mktemp} and /bin/ls. Bare /tmp is deliberately not here (another run's or session's
// scratch lives there); the run's own dir is ScanCtx.tmp. Neither is the run's work dir:
// `../x` from the tree lands in it.
const SAFE_DIRS = ["/usr", "/bin", "/lib", "/lib64", "/dev/null", "/dev/stdin", "/dev/stdout", "/dev/stderr"];

// First segments that make a slash-leading shell token a real filesystem path rather than a
// regex or sed address (`sed -n '/a/,/b/p'`, `rg '/api/'`). A first segment that exists on this
// machine's `/` counts too, so an unlisted root is not a free pass.
const SYSTEM_ROOTS = new Set([
  "home", "root", "etc", "var", "opt", "mnt", "media", "srv", "proc", "sys", "run", "tmp", "dev", "boot",
  "data", "nix", "snap", "sbin", "usr", "bin", "lib", "lib64", "Users", "private", "Volumes", "workspace",
]);

const within = (abs: string, dir: string): boolean => {
  const d = dir.replace(/\/+$/, "");
  return abs === d || abs.startsWith(`${d}/`);
};

// `~user` cannot be expanded here, so any `~name` form is outside by definition.
const isTildeUser = (p: string): boolean => /^~[^/]/.test(p);

const expandTilde = (p: string, home: string): string => (p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p);

// True when `p`, resolved from `cwd` with `~` expanded, lands outside the tree and the allowlist.
function leavesTree(p: string, cwd: string, ctx: ScanCtx): boolean {
  if (isTildeUser(p)) {
    return true;
  }
  const abs = resolve(cwd, expandTilde(p, ctx.home));
  return ![ctx.root, ...(ctx.deps ? [ctx.deps] : []), ...(ctx.tmp ? [ctx.tmp] : []), ...SAFE_DIRS].some((d) => within(abs, d));
}

// Heredoc bodies (`<<X`, `<<'X'`, `<<-X`, up to the terminator line) are content being written,
// not where the call goes, so they are removed before the command is read.
const HEREDOC = /<<(?!<)(-?)\s*(['"]?)([A-Za-z_]\w*)\2/;

function stripHeredocs(command: string): string {
  const kept: string[] = [];
  let terminator: string | null = null;
  let indented = false;
  for (const line of command.split("\n")) {
    if (terminator !== null) {
      if ((indented ? line.trim() : line) === terminator) {
        terminator = null;
      }
      continue;
    }
    kept.push(line);
    const m = line.match(HEREDOC);
    if (m) {
      terminator = m[3];
      indented = m[1] === "-";
    }
  }
  return kept.join("\n");
}

// `$HOME`, `${HOME}`, `$TMPDIR` and `${TMPDIR}` resolve to the values the child runs with.
function expandKnownVars(command: string, ctx: ScanCtx): string {
  return command
    .replace(/\$\{HOME\}|\$HOME\b/g, ctx.home)
    .replace(/\$\{TMPDIR\}|\$TMPDIR\b/g, ctx.tmp ?? "/tmp");
}

// `$VAR/…` or `${VAR}/…` where VAR is not set in the same command: a path prefix this scan cannot resolve.
const VAR_PATH = /(^|[\s"'=:;&|(`])\$\{?([A-Za-z_]\w*)\}?\//g;
const ASSIGNMENT = /(^|[\s;&|(])([A-Za-z_]\w*)=/g;

function unresolvedVarPaths(command: string): number {
  const assigned = new Set(Array.from(command.matchAll(ASSIGNMENT), (m) => m[2]));
  return Array.from(command.matchAll(VAR_PATH)).filter((m) => !assigned.has(m[2])).length;
}

const isRealRoot = (t: string): boolean => {
  const first = t.split("/")[1];
  return t === "/" || SYSTEM_ROOTS.has(first) || (first !== "" && existsSync(`/${first}`));
};

// A word that names a place: relative paths that walk up, `~`, `~/x`, `~name`, and absolute paths
// whose first segment is a real root. `~` as an operator (awk `$1 ~ /x/`, bash `=~`, bitwise
// `~mask` inside `((…))`) is not a path.
function isPathWord(t: string, prev: string | undefined, arithmetic: boolean): boolean {
  if (t === ".." || t.startsWith("../") || t.includes("/../") || t.endsWith("/..")) {
    return true;
  }
  if (t === "~") {
    return !prev?.startsWith("$");
  }
  if (t.startsWith("~/")) {
    return true;
  }
  if (/^~[A-Za-z_][\w.-]*(\/|$)/.test(t)) {
    return !arithmetic;
  }
  return t.startsWith("/") && isRealRoot(t);
}

type ShellScan = { operands: number; cwd: string };

// Path operands of one command string that leave the tree, tracking `cd` through it. Commands
// split on ; & | newlines and parentheses; words on whitespace, quotes and redirects. A bare `cd`
// goes home, which is outside. `startCwd` is where the call begins.
function shellScan(command: string, ctx: ScanCtx, startCwd: string): ShellScan {
  let cwd = startCwd;
  let operands = unresolvedVarPaths(command);
  const arithmetic = command.includes("((");
  for (const segment of command.split(/[;&|\n()`]+/)) {
    const words = segment.split(/[\s<>"'{}]+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === "=~" || w === "!~") {
        continue;
      }
      const t = w.includes("=") && !w.startsWith("=") ? w.slice(w.indexOf("=") + 1) : w;
      if (t && isPathWord(t, words[i - 1], arithmetic) && leavesTree(t, cwd, ctx)) {
        operands++;
      }
      if (i === 0 && w === "cd") {
        const target = words[1];
        if (target === undefined) {
          operands++;
        } else if (!target.startsWith("-")) {
          cwd = resolve(cwd, expandTilde(target, ctx.home));
        }
      }
    }
  }
  return { operands, cwd };
}

// A tool call's file-tool path fields (and a Grep glob) and Glob pattern, as written.
function locationsOf({ name, args }: ToolCall): string[] {
  const where = LOCATION_FIELDS.map((f) => args[f]).filter((x): x is string => typeof x === "string");
  if (name === "Glob" && typeof args.pattern === "string") {
    where.push(args.pattern);
  }
  return where;
}

// Claude's Bash tool keeps one shell for the whole run (the working directory carries across
// calls); pi's bash tool starts a fresh shell per call. See README "Known limits".
const PERSISTENT_SHELL = /^Bash$/;

type Inspection = { call: ToolCall; operands: number };

// Calls that reach outside the run tree, each with the count of flagged path operands (at least
// one for a call flagged by policy alone: web tool, network command, forbidden path).
function inspectCalls(calls: ToolCall[], ctx: ScanCtx): Inspection[] {
  const strip = (s: string) => ctx.allow.reduce((acc, a) => acc.split(a).join(""), s);
  const out: Inspection[] = [];
  let cwd = ctx.root;
  for (const call of calls) {
    if (WEB_TOOL.test(call.name)) {
      out.push({ call, operands: 1 });
      continue;
    }
    const where = locationsOf(call);
    const command = expandKnownVars(stripHeredocs(typeof call.args.command === "string" ? call.args.command : ""), ctx);
    const persistent = PERSISTENT_SHELL.test(call.name);
    const scan = shellScan(command, ctx, persistent ? cwd : ctx.root);
    if (persistent && call.failed !== true) {
      cwd = scan.cwd;
    }
    const policy = NETWORK_COMMAND.test(strip(command)) || [...where.map(strip), strip(command)].some((s) => ctx.forbidden.some((p) => s.includes(p)));
    const operands = scan.operands + where.filter((w) => leavesTree(w, ctx.root, ctx)).length;
    if (operands > 0 || policy) {
      out.push({ call, operands: Math.max(operands, 1) });
    }
  }
  return out;
}

// Tool calls that reach outside the run tree: web tools, network commands, forbidden paths, and
// any file-tool path or obvious shell path argument that resolves outside the tree. Only where a
// call goes is read, never what it writes. Returns the flagged calls.
export function flaggedCalls(calls: ToolCall[], ctx: ScanCtx): ToolCall[] {
  return inspectCalls(calls, ctx).map((i) => i.call);
}

const describeCall = ({ name, args }: ToolCall): string => `${name} ${JSON.stringify(args)}`;

// Flagged calls as "name {args}" strings.
export function scanEscapes(calls: ToolCall[], ctx: ScanCtx): string[] {
  return flaggedCalls(calls, ctx).map(describeCall);
}

const SHELL_TOOL = /^(bash|shell)$/i;
// One simple command: no separators, pipes, newlines or substitutions.
const SIMPLE_COMMAND = /^[^;&|\n`$()]*$/;
// Commands that exit 1 after a successful read (no match, files differ).
const EXIT_ONE_AFTER_READ = /(^|[\s;&|(])(\S*\/)?(grep|egrep|fgrep|rg|ag|diff|cmp|comm)\s/;

// Split flagged calls into attempts (the tool reported an error: nothing was read or written)
// and leaks (it succeeded, or no result was found). Fails closed. A shell call counts as an
// attempt only when it is one simple command with exactly one flagged path operand and is not a
// grep- or diff-style command: `cat ../a ../missing` reads one then fails, and `grep -rn x ../src`
// exits 1 after reading.
export function classifyEscapes(calls: ToolCall[], ctx: ScanCtx): { attempts: string[]; leaks: string[] } {
  const attempts: string[] = [];
  const leaks: string[] = [];
  for (const { call, operands } of inspectCalls(calls, ctx)) {
    const command = String(call.args.command ?? "");
    const certain = !SHELL_TOOL.test(call.name) || (operands === 1 && SIMPLE_COMMAND.test(command) && !EXIT_ONE_AFTER_READ.test(command));
    (call.failed === true && certain ? attempts : leaks).push(describeCall(call));
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
