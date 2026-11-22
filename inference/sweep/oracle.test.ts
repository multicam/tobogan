// Pure helpers on the run path: brief, tool-call extraction, escape scan, oracle verdicts.
import { describe, expect, test } from "bun:test";
import { buildBrief, extractToolCalls, isGenuineRed, parseBunCounts, scanEscapes } from "./oracle";
import type { Line } from "./parse";

const task = { id: "t", kind: "k", repo: "/r", parent: "p", merge: "m", testFiles: ["scripts/a.test.ts"], brief: "Fix the thing." };

describe("buildBrief", () => {
  test("starts with the same preamble for every task and mode (stable cache prefix)", () => {
    const a = buildBrief(task, "visible");
    const b = buildBrief({ ...task, brief: "Other." }, "hidden");
    const prefixLen = a.indexOf("## Task");
    expect(prefixLen).toBeGreaterThan(100);
    expect(b.slice(0, prefixLen)).toBe(a.slice(0, prefixLen));
  });
  test("visible mode names the acceptance test; hidden mode does not", () => {
    expect(buildBrief(task, "visible")).toContain("bun test ./scripts/a.test.ts");
    expect(buildBrief(task, "hidden")).not.toContain("scripts/a.test.ts");
    expect(buildBrief(task, "hidden")).toContain("tests you cannot see");
  });
});

describe("extractToolCalls", () => {
  const L = (o: unknown): Line => ({ t: 1, line: JSON.stringify(o) });
  test("reads pi toolCall items and claude tool_use items", () => {
    const pi = [L({ type: "message_end", message: { role: "assistant", content: [{ type: "toolCall", name: "bash", arguments: { command: "ls" } }] } })];
    const cl = [L({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "/x/y" } }] } })];
    expect(extractToolCalls(pi)).toEqual([{ name: "bash", args: { command: "ls" } }]);
    expect(extractToolCalls(cl)).toEqual([{ name: "Read", args: { file_path: "/x/y" } }]);
  });
});

const call = (name: string, args: Record<string, unknown>) => ({ name, args });

describe("scanEscapes", () => {
  const forbidden = ["/home/u/qara", "/home/u/.cache/sweep"];
  const own = ["/home/u/.cache/sweep/full/q1468__glm__r1/"];

  test("flags reads of the source repo, gh run as a command, network git and web tools", () => {
    const hits = scanEscapes(
      [
        call("Read", { file_path: "/home/u/qara/scripts/a.ts" }),
        call("bash", { command: "cd /home/u/qara && ls" }),
        call("Bash", { command: "gh pr view 1" }),
        call("bash", { command: "ls && gh api repos/x" }),
        call("bash", { command: "git fetch origin" }),
        call("WebFetch", { url: "x" }),
      ],
      forbidden,
      own,
    );
    expect(hits).toHaveLength(6);
  });

  test("flags a path outside the run's own tree even when it looks like it (q1862__sonnet__r0)", () => {
    const mangled = call("Read", { file_path: "/home/u/.cache/sweep/full-q1862--sonnet--r0-tree/scripts/closeout/delete-merged-branch.ts" });
    expect(scanEscapes([mangled], forbidden, ["/home/u/.cache/sweep/full/q1862__sonnet__r0/"])).toHaveLength(1);
  });

  test("ignores edit and write content that quotes gh, git show or forbidden paths (q1468, q1543, q1862)", () => {
    const hits = scanEscapes(
      [
        call("edit", { path: "scripts/pi-lane-status.test.ts", edits: [{ oldText: "x", newText: "case 'gh pr list --state open':" }] }),
        call("edit", { path: "/home/u/.cache/sweep/full/q1468__glm__r1/tree/scripts/lib/pi-lane-collect.ts", edits: [{ oldText: "a", newText: "git show HEAD:x" }] }),
        call("Edit", { file_path: "/home/u/.cache/sweep/full/q1468__glm__r1/tree/a.ts", old_string: "jsonOutput('gh pr list', run)", new_string: "y" }),
        call("write", { path: "/home/u/.cache/sweep/full/q1468__glm__r1/tree/b.test.ts", content: "// see /home/u/qara\nspawn(['git','log'])" }),
        call("edit", { edits: [{ oldText: "", newText: "runs `gh pr list`" }] }),
      ],
      forbidden,
      own,
    );
    expect(hits).toEqual([]);
  });

  test("ignores history commands inside the one-commit run tree and quoted search patterns (q1543)", () => {
    const hits = scanEscapes(
      [
        call("bash", { command: "/usr/bin/git rev-parse --is-inside-work-tree && /usr/bin/git log --oneline -3" }),
        call("bash", { command: "/usr/bin/git status --short; rg -n 'allowlist|readAtRef|git show' scripts/gate/mutation-audit*" }),
        call("bash", { command: "rg -n 'gh pr list' scripts" }),
      ],
      forbidden,
      own,
    );
    expect(hits).toEqual([]);
  });

  test("a sibling run's tree is flagged; the run's own tree is not", () => {
    const hits = scanEscapes(
      [call("Read", { file_path: "/home/u/.cache/sweep/full/q1468__glm__r1/tree/x.ts" }), call("Read", { file_path: "/home/u/.cache/sweep/full/q1468__glm__r2/tree/x.ts" })],
      forbidden,
      own,
    );
    expect(hits).toEqual(['Read {"file_path":"/home/u/.cache/sweep/full/q1468__glm__r2/tree/x.ts"}']);
  });

  test("a qara-worktrees sibling is flagged by prefix", () => {
    expect(scanEscapes([call("Glob", { pattern: "**/*.ts", path: "/home/u/qara-worktrees/x" })], forbidden, own)).toHaveLength(1);
  });
});

describe("parseBunCounts and isGenuineRed", () => {
  test("parses pass and fail counts", () => {
    expect(parseBunCounts(" 12 pass\n 1 fail\n 40 expect() calls")).toEqual({ pass: 12, fail: 1 });
  });
  test("a failing run with some passes is a genuine RED", () => {
    expect(isGenuineRed(1, " 12 pass\n 1 fail\n")).toBe(true);
  });
  test("a load error (no test passed) or a green run is not", () => {
    expect(isGenuineRed(1, "error: Cannot find module './x'\n 0 pass\n 1 fail\n")).toBe(false);
    expect(isGenuineRed(0, " 13 pass\n 0 fail\n")).toBe(false);
  });
});
