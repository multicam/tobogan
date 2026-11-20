import { afterAll, afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
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

  test("a write that fails part-way is truncated away, and the next append lands cleanly", async () => {
    const dir = scratchDir("fs-enospc");
    let failNext = false;
    const store = new FileStore(dir, {
      writeSync: ((fd: number, data: string) => {
        if (failNext) {
          failNext = false;
          // Half the line reaches the file, then the disk fills.
          fs.writeSync(fd, data.slice(0, Math.floor(data.length / 2)));
          throw Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" });
        }
        return fs.writeSync(fd, data);
      }) as typeof fs.writeSync,
    });
    await store.open();
    open.push(store);
    await store.append(commit(1), 0);
    const before = statSync(join(dir, "events.jsonl")).size;
    failNext = true;
    await expect(store.append(commit(2), 1)).rejects.toThrow(/ENOSPC/);
    expect(statSync(join(dir, "events.jsonl")).size).toBe(before);
    await store.append(commit(2), 1);
    await store.close();
    open.splice(0);
    const again = await opened(dir);
    expect((await all(again)).map((c) => c.events[0]!.seq)).toEqual([1, 2]);
  });

  test("a short write counts as a failed one and is truncated away", async () => {
    const dir = scratchDir("fs-short");
    let shortNext = false;
    const store = new FileStore(dir, {
      writeSync: ((fd: number, data: string) => {
        if (shortNext) {
          shortNext = false;
          return fs.writeSync(fd, data.slice(0, 5));
        }
        return fs.writeSync(fd, data);
      }) as typeof fs.writeSync,
    });
    await store.open();
    open.push(store);
    await store.append(commit(1), 0);
    const before = statSync(join(dir, "events.jsonl")).size;
    shortNext = true;
    await expect(store.append(commit(2), 1)).rejects.toThrow(/short write/);
    expect(statSync(join(dir, "events.jsonl")).size).toBe(before);
  });

  test("a store that can't undo a failed write refuses every later append", async () => {
    const dir = scratchDir("fs-poison");
    let broken = false;
    const store = new FileStore(dir, {
      fsyncSync: ((fd: number) => {
        if (broken) {
          throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
        }
        fs.fsyncSync(fd);
      }) as typeof fs.fsyncSync,
      ftruncateSync: ((fd: number, len?: number) => {
        if (broken) {
          throw Object.assign(new Error("EIO: i/o error"), { code: "EIO" });
        }
        fs.ftruncateSync(fd, len);
      }) as typeof fs.ftruncateSync,
    });
    await store.open();
    open.push(store);
    broken = true;
    await expect(store.append(commit(1), 0)).rejects.toThrow(/EIO/);
    broken = false;
    await expect(store.append(commit(1), 0)).rejects.toThrow(/refuses appends/);
  });

  test("a complete line that isn't JSON fails the open, naming the file and byte offset", async () => {
    const dir = scratchDir("fs-corrupt");
    const first = await opened(dir);
    await first.append(commit(1), 0);
    await first.close();
    open.splice(0);
    const path = join(dir, "events.jsonl");
    const offset = statSync(path).size;
    appendFileSync(path, "not json at all\n");
    appendFileSync(path, `${JSON.stringify(commit(2))}\n`);
    const store = new FileStore(dir);
    const failure = await store.open().then(
      () => null,
      (error: Error) => error,
    );
    open.push(store);
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.name).not.toBe("SyntaxError");
    expect(failure?.message).toContain(path);
    expect(failure?.message).toContain(`byte ${offset}`);
  });

  test("taking over a stale lock fails if another starter took it in between", async () => {
    const dir = scratchDir("fs-race");
    const lock = join(dir, "board.lock");
    writeFileSync(lock, "2147483646\n");
    let raced = false;
    const store = new FileStore(dir, {
      readFileSync: ((path: string, options?: unknown) => {
        const content = fs.readFileSync(path, options as BufferEncoding);
        if (!raced && path === lock) {
          // Right after this starter reads the stale pid, a live competitor takes the lock.
          raced = true;
          fs.writeFileSync(lock, `${process.ppid} competitor\n`);
        }
        return content;
      }) as typeof fs.readFileSync,
    });
    await expect(store.open()).rejects.toThrow(/locked by pid/);
    expect(fs.readFileSync(lock, "utf8")).toBe(`${process.ppid} competitor\n`);
  });

  test("takes over a lock whose holder died", async () => {
    const dir = scratchDir("fs-stale");
    writeFileSync(join(dir, "board.lock"), "2147483646\n");
    const store = await opened(dir);
    await store.append(commit(1), 0);
    expect((await all(store)).length).toBe(1);
  });
});
