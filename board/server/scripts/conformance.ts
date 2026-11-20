/**
 * Runs Vercel's Board conformance suite against this server, on 127.0.0.1 only:
 *
 *   bun run conformance [-- --keep] [-- --report <file>]
 *
 * It starts the server on a free port with a fresh data dir and a throwaway token (hashed into an
 * in-memory tokens file), runs `bunx vercel@latest board conformance --url … --json` with HOME and
 * XDG dirs pointed at an empty scratch dir and no Vercel credentials, prints a tally per group,
 * then stops the server and deletes the scratch dir (`--keep` keeps it, with the raw JSON).
 *
 * Exits 0 when no check in a target group failed.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashToken } from "../src/tokens.ts";

const TARGET_GROUPS = ["core", "paging", "search", "tasks", "schemas"];
const BOARD = "conformance";
const RUN_TIMEOUT_MS = 15 * 60 * 1000;
const START_TIMEOUT_MS = 20_000;

type Check = { group: string; name: string; status: "passed" | "failed" | "skipped"; detail?: string };

const keep = process.argv.includes("--keep");
const reportAt = process.argv.indexOf("--report");
const reportFile = reportAt === -1 ? null : process.argv[reportAt + 1];
const root = resolve(import.meta.dir, "..");
const scratch = mkdtempSync(join(tmpdir(), "csf-board-conformance-"));
const home = join(scratch, "home");
mkdirSync(home, { recursive: true });
const token = randomBytes(32).toString("base64url");
const tokens = JSON.stringify({ tokens: [{ sha256: hashToken(token), principal: "csf:user:conformance", handle: "conformance", name: "Conformance" }] });

const server = spawn("bun", ["--no-env-file", "src/main.ts"], {
  cwd: root,
  env: {
    PATH: process.env.PATH ?? "",
    CSF_BOARD_HOST: "127.0.0.1",
    CSF_BOARD_PORT: "0",
    CSF_BOARD_DATA_DIR: join(scratch, "data"),
    CSF_BOARD_BOARDS: BOARD,
    CSF_BOARD_TOKENS: tokens,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
const serverLog: string[] = [];
server.stderr.on("data", (chunk: Buffer) => serverLog.push(chunk.toString()));

function listening(): Promise<string> {
  return new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error(`the server didn't start in ${START_TIMEOUT_MS / 1000}s:\n${serverLog.join("")}`)), START_TIMEOUT_MS);
    let out = "";
    server.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const found = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
      if (found) {
        clearTimeout(timer);
        done(found[1]!);
      }
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      fail(new Error(`the server exited (${code}) before listening:\n${serverLog.join("")}`));
    });
  });
}

function runConformance(url: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: home,
    XDG_CONFIG_HOME: home,
    XDG_DATA_HOME: home,
    XDG_CACHE_HOME: join(home, ".cache"),
    BOARD_TOKEN: token,
    // Reuse the machine's bun package cache so the CLI isn't downloaded again on each run.
    BUN_INSTALL_CACHE_DIR: process.env.BUN_INSTALL_CACHE_DIR ?? join(homedir(), ".bun", "install", "cache"),
    NO_COLOR: "1",
  };
  return new Promise((done) => {
    const child = spawn("bunx", ["vercel@latest", "board", "conformance", "--url", url, "--json"], { cwd: home, env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), RUN_TIMEOUT_MS);
    child.once("exit", (code) => {
      clearTimeout(timer);
      done({ code, stdout, stderr });
    });
  });
}

let exitCode = 1;
try {
  const base = await listening();
  const url = `${base}/boards/${BOARD}`;
  console.log(`server: ${url}`);
  const run = await runConformance(url);
  const start = run.stdout.indexOf("{");
  let report: { checks: Check[]; ok: boolean } | null = null;
  try {
    report = JSON.parse(run.stdout.slice(start));
  } catch {
    report = null;
  }
  if (keep) {
    writeFileSync(join(scratch, "conformance.json"), run.stdout);
    writeFileSync(join(scratch, "conformance.stderr"), run.stderr);
    writeFileSync(join(scratch, "server.log"), serverLog.join(""));
  }
  if (reportFile && report) {
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
  }
  if (!report || !Array.isArray(report.checks)) {
    console.error(`conformance gave no report (exit ${run.code}):\n${run.stdout.slice(0, 4000)}\n${run.stderr.slice(-4000)}`);
  } else {
    const groups = new Map<string, Check[]>();
    for (const check of report.checks) {
      groups.set(check.group, [...(groups.get(check.group) ?? []), check]);
    }
    let targetFailed = 0;
    for (const [group, checks] of groups) {
      const count = (s: Check["status"]) => checks.filter((c) => c.status === s).length;
      console.log(`${group.padEnd(12)} passed ${String(count("passed")).padStart(3)}  failed ${String(count("failed")).padStart(3)}  skipped ${String(count("skipped")).padStart(3)}`);
      for (const check of checks.filter((c) => c.status === "failed")) {
        console.log(`  FAILED ${check.name}\n         ${(check.detail ?? "").split("\n")[0]}`);
        if (TARGET_GROUPS.includes(group)) {
          targetFailed += 1;
        }
      }
    }
    const all = report.checks;
    console.log(`total        passed ${all.filter((c) => c.status === "passed").length}  failed ${all.filter((c) => c.status === "failed").length}  skipped ${all.filter((c) => c.status === "skipped").length}`);
    exitCode = targetFailed === 0 ? 0 : 1;
  }
} catch (error) {
  console.error((error as Error).message);
} finally {
  server.kill("SIGTERM");
  await new Promise((done) => {
    const timer = setTimeout(() => {
      server.kill("SIGKILL");
      done(null);
    }, 5000);
    server.once("exit", () => {
      clearTimeout(timer);
      done(null);
    });
    if (server.exitCode !== null) {
      clearTimeout(timer);
      done(null);
    }
  });
  if (keep) {
    console.log(`kept: ${scratch}`);
  } else {
    rmSync(scratch, { recursive: true, force: true });
  }
}
process.exit(exitCode);
