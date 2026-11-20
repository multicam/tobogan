import { afterAll, expect, test } from "bun:test";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { hashToken } from "../src/tokens.ts";

type Child = ChildProcessByStdio<null, Readable, Readable>;

const root = resolve(import.meta.dir, "..");
const dir = mkdtempSync(join(tmpdir(), "csf-board-restart-"));
const token = randomBytes(24).toString("base64url");
const tokens = JSON.stringify({ tokens: [{ sha256: hashToken(token), principal: "csf:user:ada", handle: "ada", name: "Ada" }] });
const children: Child[] = [];

afterAll(() => {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGKILL");
    }
  }
  rmSync(dir, { recursive: true, force: true });
});

/** The server as its own process, as it runs for real; resolves with its URL once it listens. */
function serve(): Promise<{ child: Child; url: string }> {
  const child = spawn("bun", ["--no-env-file", "src/main.ts"], {
    cwd: root,
    env: { PATH: process.env.PATH ?? "", CSF_BOARD_PORT: "0", CSF_BOARD_DATA_DIR: dir, CSF_BOARD_TOKENS: tokens },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  return new Promise((done, fail) => {
    let out = "";
    let err = "";
    child.stderr.on("data", (c: Buffer) => (err += c.toString()));
    child.stdout.on("data", (c: Buffer) => {
      out += c.toString();
      const found = /listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
      if (found) {
        done({ child, url: `${found[1]}/boards/general` });
      }
    });
    child.once("exit", (code) => fail(new Error(`server exited (${code}) before listening: ${err}`)));
  });
}

const exited = (child: Child) => new Promise((done) => (child.exitCode !== null || child.signalCode !== null ? done(null) : child.once("exit", done)));

async function call<T>(url: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) {
    throw new Error(`${path}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

type Message = { id: string; text: string; task?: { state: string; epoch: number } };

test("every committed write survives SIGKILL and a restart, and the lock is taken over", async () => {
  const first = await serve();
  const posted: string[] = [];
  for (let i = 0; i < 20; i++) {
    posted.push((await call<{ message: Message }>(first.url, "/messages", { channel: "dev", text: `message ${i}` })).message.id);
  }
  const { task } = await call<{ task: Message }>(first.url, "/tasks", { channel: "work", text: "survive", claim: true, lease: 600 });
  first.child.kill("SIGKILL");
  await exited(first.child);
  expect(first.child.signalCode).toBe("SIGKILL");
  expect(existsSync(join(dir, "general", "board.lock"))).toBe(true);

  const second = await serve();
  const read = await call<{ messages: Message[] }>(second.url, "/messages?channel=dev&limit=100");
  expect(read.messages.map((m) => m.id)).toEqual(posted);
  expect(read.messages.map((m) => m.text)).toEqual(posted.map((_, i) => `message ${i}`));
  const thread = await call<{ message: Message }>(second.url, `/messages/${task.id}`);
  expect(thread.message.task).toMatchObject({ state: "claimed", epoch: 1 });
  // The log goes on from where it stopped: no position is handed out twice.
  const next = await call<{ message: Message }>(second.url, "/messages", { channel: "dev", text: "after restart" });
  expect(posted).not.toContain(next.message.id);
  second.child.kill("SIGTERM");
  await exited(second.child);
  expect(existsSync(join(dir, "general", "board.lock"))).toBe(false);
}, 30_000);
