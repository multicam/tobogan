import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FileStore } from "../src/file-store.ts";
import { StoreConflict, type Commit } from "../src/store.ts";
import { cleanUp, scratchDir } from "./helpers.ts";

afterAll(cleanUp);

const commit = (seq: number, type = "message.posted"): Commit => ({
  events: [{ seq, at: "2026-11-21T00:00:00.000Z", type, payload: { n: seq } }],
});

async function all(store: FileStore): Promise<Commit[]> {
  const out: Commit[] = [];
  for await (const c of store.read(0)) {
    out.push(c);
  }
  return out;
}

const open: FileStore[] = [];
afterEach(async () => {
  for (const store of open.splice(0)) {
    await store.close();
  }
});

async function opened(dir: string): Promise<FileStore> {
  const store = new FileStore(dir);
  await store.open();
  open.push(store);
  return store;
}

describe("FileStore", () => {
  test("replays what it committed after a reopen", async () => {
    const dir = scratchDir("fs-replay");
    const first = await opened(dir);
    await first.append(commit(1), 0);
    await first.append({ events: [...commit(2).events, ...commit(3).events] }, 1);
    await first.close();
    open.splice(0);
    const second = await opened(dir);
    const commits = await all(second);
    expect(commits.map((c) => c.events.map((e) => e.seq))).toEqual([[1], [2, 3]]);
  });

  test("reads only what comes after a seq", async () => {
    const store = await opened(scratchDir("fs-after"));
    await store.append(commit(1), 0);
    await store.append(commit(2), 1);
    const later: number[] = [];
    for await (const c of store.read(1)) {
      later.push(...c.events.map((e) => e.seq));
    }
    expect(later).toEqual([2]);
  });

  test("refuses an append whose expected head is stale", async () => {
    const store = await opened(scratchDir("fs-conflict"));
    await store.append(commit(1), 0);
    await expect(store.append(commit(2), 0)).rejects.toBeInstanceOf(StoreConflict);
  });

  test("drops a torn last line, which no append acknowledged, and appends after it", async () => {
    const dir = scratchDir("fs-torn");
    const first = await opened(dir);
    await first.append(commit(1), 0);
    await first.close();
    open.splice(0);
    appendFileSync(join(dir, "events.jsonl"), '{"events":[{"seq":2,"at":"x","ty');
    const second = await opened(dir);
    expect((await all(second)).length).toBe(1);
    await second.append(commit(2), 1);
    const lines = readFileSync(join(dir, "events.jsonl"), "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[1]!).events[0].seq).toBe(2);
  });

  test("refuses a second process's open while the board is locked", async () => {
    const dir = scratchDir("fs-lock");
    await opened(dir);
    await expect(new FileStore(dir).open()).rejects.toThrow(/locked/);
  });

  test("takes over a lock whose holder died", async () => {
    const dir = scratchDir("fs-stale");
    writeFileSync(join(dir, "board.lock"), "2147483646\n");
    const store = await opened(dir);
    await store.append(commit(1), 0);
    expect((await all(store)).length).toBe(1);
  });
});
