import { randomBytes } from "node:crypto";
import * as nodeFs from "node:fs";
import { closeSync, existsSync, linkSync, mkdirSync, openSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { StoreConflict, type Commit, type Store } from "./store.ts";

const LOG = "events.jsonl";
const LOCK = "board.lock";
/** Held only while a stale lock is replaced, so two starters can't both take it over. */
const TAKEOVER = "board.lock.takeover";
const NEWLINE = 0x0a;

/** The file calls whose failure the store must survive: tests swap one to make it fail. */
export type FileOps = Pick<typeof nodeFs, "writeSync" | "fsyncSync" | "ftruncateSync" | "readFileSync">;

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
 *   <dir>/board.lock     `<pid> <nonce>` of the process holding the board; a dead holder's is taken over
 *
 * A crash can leave at most one torn line at the end: no append acknowledged it, so open drops it.
 * A failed write is cut back at once; a complete line that isn't a commit is damage, and open stops.
 * ceiling: the whole log is read into memory on open, and the lock trusts pids (a recycled pid
 * reads as alive) — upgrade trigger: logs past ~100 MB, or boards shared across hosts (use Redis).
 */
export class FileStore implements Store {
  private fd: number | null = null;
  private head = 0;
  private commits: Commit[] = [];
  /** Bytes of the log that hold acknowledged commits: where a failed write is cut back to. */
  private size = 0;
  /** Set when a failed write couldn't be undone: the file's tail is unknown, so nothing more is appended. */
  private poisoned: Error | null = null;
  /** This process's lock content: what close checks before removing the lock. */
  private lockId: string | null = null;
  private readonly fs: FileOps;

  constructor(
    readonly dir: string,
    ops: Partial<FileOps> = {},
  ) {
    this.fs = { ...nodeFs, ...ops };
  }

  async open(): Promise<void> {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    this.lock();
    try {
      const path = join(this.dir, LOG);
      const fresh = !existsSync(path);
      this.fd = openSync(path, "a+", 0o600);
      if (fresh) {
        this.syncDir();
      }
      this.load(path);
    } catch (error) {
      // A damaged log leaves the board closed, its lock released.
      await this.close();
      throw error;
    }
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
    if (this.poisoned) {
      throw new Error(`board ${this.dir} refuses appends: a failed write couldn't be undone (${this.poisoned.message}); restart to recover`);
    }
    if (expectedHead !== this.head) {
      throw new StoreConflict(expectedHead, this.head);
    }
    const last = commit.events.at(-1);
    if (!last) {
      return;
    }
    // One write, then fsync: the commit is acknowledged only once it is on disk. Any failure
    // (a short write, ENOSPC, a failed fsync) cuts the file back to its acknowledged length.
    const line = Buffer.from(`${JSON.stringify(commit)}\n`);
    try {
      const written = this.fs.writeSync(this.fd, line);
      if (written !== line.length) {
        throw new Error(`short write: ${written} of ${line.length} bytes`);
      }
      this.fs.fsyncSync(this.fd);
    } catch (error) {
      this.undo(error as Error);
      throw error;
    }
    this.size += line.length;
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
    if (this.lockId !== null) {
      // Remove the lock only while it is still ours.
      const path = join(this.dir, LOCK);
      if (this.readLock(path) === this.lockId) {
        unlinkSync(path);
      }
      this.lockId = null;
    }
  }

  /** Cuts the log back to its acknowledged commits; if even that fails, refuses later appends. */
  private undo(cause: Error): void {
    try {
      this.fs.ftruncateSync(this.fd!, this.size);
      this.fs.fsyncSync(this.fd!);
    } catch (error) {
      this.poisoned = new Error(`${cause.message}; then truncating back failed: ${(error as Error).message}`);
    }
  }

  /**
   * Takes the lockfile, or explains who holds it. The lock is created whole (a temp file holding
   * our `<pid> <nonce>`, linked into place, which fails if one exists), so no reader sees it empty.
   * A dead holder's lock is replaced only under the takeover file, after reading it again there,
   * and the result is read back: two starters can't both win. A recycled pid reads as alive, so
   * the board refuses to start rather than risk two writers.
   */
  private lock(): void {
    const path = join(this.dir, LOCK);
    const id = `${process.pid} ${randomBytes(8).toString("hex")}`;
    const temp = this.writeTemp(id);
    try {
      try {
        linkSync(temp, path);
        this.lockId = id;
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
          throw error;
        }
      }
      this.refuseIfHeld(this.readLock(path));
      this.takeOver(path, temp, id);
    } finally {
      // Gone already when a takeover renamed it into place.
      this.unlinkQuietly(temp);
    }
  }

  /** Replaces a dead holder's lock with ours, holding the takeover file while it does. */
  private takeOver(path: string, temp: string, id: string): void {
    const guard = join(this.dir, TAKEOVER);
    const guardTemp = this.writeTemp(id);
    try {
      linkSync(guardTemp, guard);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      const holder = this.holderOf(this.readLock(guard));
      throw new Error(
        holder !== null && alive(holder)
          ? `board ${this.dir} is being taken over by pid ${holder}`
          : `board ${this.dir}: a takeover by pid ${holder} died part-way: remove ${guard} once no server is running`,
      );
    } finally {
      this.unlinkQuietly(guardTemp);
    }
    try {
      // Read again under the guard: another starter may have taken the lock since the first read.
      this.refuseIfHeld(this.readLock(path));
      renameSync(temp, path);
      if (this.readLock(path) !== id) {
        throw new Error(`board ${this.dir}: lost the lock while taking it over`);
      }
      this.lockId = id;
    } finally {
      unlinkSync(guard);
    }
  }

  private refuseIfHeld(content: string): void {
    const holder = this.holderOf(content);
    if (holder !== null && alive(holder)) {
      throw new Error(`board ${this.dir} is locked by pid ${holder}`);
    }
  }

  private holderOf(content: string): number | null {
    const pid = Number.parseInt(content, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }

  private readLock(path: string): string {
    try {
      return this.fs.readFileSync(path, "utf8").trim();
    } catch {
      return "";
    }
  }

  /** A fsynced file holding `content`, next to the lock, to link or rename into place. */
  private writeTemp(content: string): string {
    const temp = join(this.dir, `${LOCK}.${process.pid}.${randomBytes(6).toString("hex")}`);
    const fd = openSync(temp, "wx", 0o600);
    try {
      this.fs.writeSync(fd, `${content}\n`);
      this.fs.fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return temp;
  }

  private unlinkQuietly(path: string): void {
    try {
      unlinkSync(path);
    } catch {
      // Already gone.
    }
  }

  /** Reads every commit, truncating a torn tail that no append acknowledged. */
  private load(path: string): void {
    const bytes = this.fs.readFileSync(path);
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
        this.accept(this.parseLine(line, path, start), path, start);
      }
      start = end + 1;
    }
    this.size = start;
  }

  /** A complete line is a commit an append acknowledged: if it isn't one, the log is damaged, not torn. */
  private parseLine(line: string, path: string, offset: number): Commit {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      throw new Error(`${path} at byte ${offset}: a complete line isn't JSON (${(error as Error).message}): the log is damaged, restore it before starting`);
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as Commit).events)) {
      throw new Error(`${path} at byte ${offset}: a line isn't a commit ({"events":[...]}): the log is damaged`);
    }
    return parsed as Commit;
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
    this.fs.ftruncateSync(this.fd, length);
    this.fs.fsyncSync(this.fd);
  }

  private syncDir(): void {
    const fd = openSync(this.dir, "r");
    try {
      this.fs.fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}
