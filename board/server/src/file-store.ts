import {
  closeSync,
  existsSync,
  fsyncSync,
  ftruncateSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { StoreConflict, type Commit, type Store } from "./store.ts";

const LOG = "events.jsonl";
const LOCK = "board.lock";
const NEWLINE = 0x0a;

/** Whether a process with this pid is running (EPERM: it is, as another user). */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * A board's log as one append-only file in its own directory:
 *
 *   <dir>/events.jsonl   one line per commit, {"events":[...]}, fsynced before append resolves
 *   <dir>/board.lock     the pid holding the board; a dead holder's lock is taken over
 *
 * A crash can leave at most one torn line at the end: no append acknowledged it, so open drops it.
 * ceiling: the whole log is read into memory on open, and the lock trusts pids (a recycled pid
 * reads as alive) — upgrade trigger: logs past ~100 MB, or boards shared across hosts (use Redis).
 */
export class FileStore implements Store {
  private fd: number | null = null;
  private head = 0;
  private commits: Commit[] = [];
  private locked = false;

  constructor(readonly dir: string) {}

  async open(): Promise<void> {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.lock();
    const path = join(this.dir, LOG);
    const fresh = !existsSync(path);
    this.fd = openSync(path, "a+", 0o600);
    if (fresh) {
      this.syncDir();
    }
    this.load(path);
  }

  async *read(after: number): AsyncIterable<Commit> {
    for (const commit of this.commits) {
      const last = commit.events.at(-1);
      if (last && last.seq > after) {
        yield commit;
      }
    }
  }

  async append(commit: Commit, expectedHead: number): Promise<void> {
    if (this.fd === null) {
      throw new Error("FileStore: append before open");
    }
    if (expectedHead !== this.head) {
      throw new StoreConflict(expectedHead, this.head);
    }
    const last = commit.events.at(-1);
    if (!last) {
      return;
    }
    // One write, then fsync: the commit is acknowledged only once it is on disk.
    writeSync(this.fd, `${JSON.stringify(commit)}\n`);
    fsyncSync(this.fd);
    this.commits.push(commit);
    this.head = last.seq;
  }

  subscribe(_listener: (commit: Commit) => void): () => void {
    // Single writer: the lockfile guarantees no other process appends.
    return () => {};
  }

  async close(): Promise<void> {
    if (this.fd !== null) {
      closeSync(this.fd);
      this.fd = null;
    }
    if (this.locked) {
      unlinkSync(join(this.dir, LOCK));
      this.locked = false;
    }
  }

  /** Takes the lockfile, or explains who holds it. */
  private lock(): void {
    const path = join(this.dir, LOCK);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const fd = openSync(path, "wx", 0o600);
        writeSync(fd, `${process.pid}\n`);
        fsyncSync(fd);
        closeSync(fd);
        this.locked = true;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
      const holder = Number.parseInt(readFileSync(path, "utf8"), 10);
      if (Number.isInteger(holder) && holder > 0 && alive(holder)) {
        throw new Error(`board ${this.dir} is locked by pid ${holder}`);
      }
      unlinkSync(path);
    }
    throw new Error(`board ${this.dir}: could not take its lock`);
  }

  /** Reads every commit, truncating a torn tail that no append acknowledged. */
  private load(path: string): void {
    const bytes = readFileSync(path);
    let start = 0;
    while (start < bytes.length) {
      const end = bytes.indexOf(NEWLINE, start);
      if (end === -1) {
        // No newline: the write was cut short before its fsync returned.
        this.truncate(start);
        break;
      }
      const line = bytes.subarray(start, end).toString("utf8");
      if (line.trim() !== "") {
        this.accept(JSON.parse(line) as Commit, path, start);
      }
      start = end + 1;
    }
  }

  private accept(commit: Commit, path: string, offset: number): void {
    for (const event of commit.events) {
      if (event.seq !== this.head + 1) {
        throw new Error(`${path} at byte ${offset}: event ${event.seq} follows ${this.head}`);
      }
      this.head = event.seq;
    }
    this.commits.push(commit);
  }

  private truncate(length: number): void {
    if (this.fd === null) {
      return;
    }
    ftruncateSync(this.fd, length);
    fsyncSync(this.fd);
  }

  private syncDir(): void {
    const fd = openSync(this.dir, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
