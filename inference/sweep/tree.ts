// Run trees and the oracle. A run tree is `git archive <parent>` unpacked into a fresh repo with
// one commit: no history, so the merged fix is not reachable through git. The judge applies the
// model's non-test diff to a second fresh export with the pristine PR tests and runs them.
import { existsSync, mkdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { childEnv } from "./cells";
import type { Task } from "./tasks";

export type ShResult = { code: number; out: string };

// Global hooks (core.hooksPath) must never fire inside a throwaway tree.
const GIT = ["git", "-c", "core.hooksPath=/dev/null", "-c", "user.name=model-sweep", "-c", "user.email=model-sweep@localhost", "-c", "commit.gpgsign=false"];

// Paths never part of a model's diff: dependencies an agent may have installed anyway.
const DIFF_EXCLUDES = ["node_modules", "**/node_modules/**", "bun.lock", "bun.lockb"];

export async function sh(argv: string[], cwd: string, opts: { timeoutMs?: number; stdin?: Blob; env?: Record<string, string> } = {}): Promise<ShResult> {
  const proc = Bun.spawn(argv, { cwd, stdin: opts.stdin ?? "ignore", stdout: "pipe", stderr: "pipe", env: opts.env, timeout: opts.timeoutMs, killSignal: "SIGKILL" });
  const [out, err] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const code = await proc.exited;
  return { code, out: out + err };
}

async function must(argv: string[], cwd: string, opts: { stdin?: Blob } = {}): Promise<string> {
  const r = await sh(argv, cwd, opts);
  if (r.code !== 0) {
    throw new Error(`${argv.slice(0, 4).join(" ")} failed (${r.code}): ${r.out.slice(0, 400)}`);
  }
  return r.out;
}

// Unpack `sha` of `repo` into `dest` (must not exist). Optionally place the PR's test files
// from the merge commit, then make the single base commit.
export async function exportTree(task: Task, sha: string, dest: string, withTests: boolean, depsDir: string | null): Promise<void> {
  mkdirSync(dest, { recursive: true });
  const archive = Bun.spawn(["git", "-C", task.repo, "archive", "--format=tar", sha], { stdout: "pipe", stderr: "pipe" });
  const tar = await new Response(archive.stdout).blob();
  if ((await archive.exited) !== 0) {
    throw new Error(`git archive ${sha} failed`);
  }
  await must(["tar", "-x", "-f", "-"], dest, { stdin: tar });
  if (withTests) {
    await placeTests(task, dest);
  }
  await must([...GIT, "init", "-q", "-b", "base"], dest);
  await must([...GIT, "add", "-A"], dest);
  await must([...GIT, "commit", "-q", "-m", "base"], dest);
  if (depsDir) {
    symlinkSync(depsDir, join(dest, "node_modules"));
  }
}

// One read-only copy of the source repo's node_modules per work dir, so no run can write into
// (or walk from) the live checkout. Reused across runs and resumes.
// ceiling: the copy is of the repo's *current* dependencies, not the parent's lockfile — fine
// for tasks ~10 days old; pin per task if an oracle starts failing on deps.
export const depsPath = (task: Task, workDir: string): string => join(workDir, "deps", basename(task.repo), "node_modules");

export async function snapshotDeps(task: Task, workDir: string): Promise<string | null> {
  const src = join(task.repo, "node_modules");
  if (!existsSync(src)) {
    return null;
  }
  const dest = depsPath(task, workDir);
  if (existsSync(dest)) {
    return dest;
  }
  const staging = `${dest}.partial`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  await must(["cp", "-a", src, staging], workDir);
  await must(["chmod", "-R", "a-w", staging], workDir);
  renameSync(staging, dest);
  return dest;
}

export async function placeTests(task: Task, dest: string): Promise<void> {
  for (const f of task.testFiles) {
    const body = await must(["git", "-C", task.repo, "show", `${task.merge}:${f}`], dest);
    mkdirSync(dirname(join(dest, f)), { recursive: true });
    writeFileSync(join(dest, f), body);
  }
}

// Everything the model changed or added, minus the PR test files and dependencies.
export async function captureDiff(task: Task, tree: string): Promise<string> {
  await must([...GIT, "add", "-A"], tree);
  const excludes = [...task.testFiles, ...DIFF_EXCLUDES].map((p) => `:(exclude,glob)${p}`);
  return must([...GIT, "diff", "--cached", "--binary", "HEAD", "--", ".", ...excludes], tree);
}

// The diff between parent and merge, minus the PR tests: the reference fix, for GREEN proofs.
export async function referenceDiff(task: Task): Promise<string> {
  const excludes = task.testFiles.map((p) => `:(exclude)${p}`);
  return must(["git", "-C", task.repo, "diff", "--binary", task.parent, task.merge, "--", ".", ...excludes], task.repo);
}

export type Verdict = { applied: boolean; oracleExit: number | null; output: string };

// Fresh parent export + pristine PR tests + diff, then each PR test file in turn.
export async function judge(task: Task, diff: string, dir: string, timeoutMs: number, depsDir: string | null): Promise<Verdict> {
  await exportTree(task, task.parent, dir, true, depsDir);
  if (diff.trim()) {
    const patch = join(dir, "..", "judge.patch");
    writeFileSync(patch, diff);
    const applied = await sh([...GIT, "apply", "--binary", "--whitespace=nowarn", patch], dir);
    if (applied.code !== 0) {
      return { applied: false, oracleExit: null, output: applied.out };
    }
  }
  return { applied: true, ...(await runOracle(task, dir, timeoutMs)) };
}

export async function runOracle(task: Task, dir: string, timeoutMs: number): Promise<{ oracleExit: number; output: string }> {
  const r = await sh(["bun", "test", ...task.testFiles.map((f) => `./${f}`)], dir, { timeoutMs, env: childEnv(process.env) });
  return { oracleExit: r.code, output: r.out };
}

export function removeTree(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
