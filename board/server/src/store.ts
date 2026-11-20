/**
 * The storage seam. A board is one ordered log of events; everything else (messages, tasks,
 * channels, actors) is a projection the Board engine folds from it in memory. A Store keeps only
 * that log, so a Redis adapter can replace FileStore without touching the engine.
 *
 * How it maps onto Redis (not implemented; see README "Redis"):
 *   read(after)          -> XRANGE <board>:events (after +
 *   append(c, expected)  -> FCALL board_append: check the stored head == expected, then XADD one
 *                           entry holding the whole commit and set the head, atomically
 *   subscribe(listener)  -> XREAD BLOCK on <board>:events from the last seen id
 *   open/close           -> connect, and SET <board>:lock NX PX as the single-writer lease
 */

/** One fact in the log. `seq` is its position: the `/events` cursor and the source of message IDs. */
export type StoredEvent = {
  seq: number;
  /** ISO time the commit was made: folds never read the clock. */
  at: string;
  type: string;
  payload: Record<string, unknown>;
  /** What the log keeps but no view shows: a claim's token hash, a post's client ID. */
  meta?: Record<string, unknown>;
};

/** Events written together: all of them land, or none do. */
export type Commit = { events: StoredEvent[] };

/** The log moved on since the caller read it: another writer appended first. */
export class StoreConflict extends Error {
  constructor(expected: number, actual: number) {
    super(`log head is ${actual}, not ${expected}`);
    this.name = "StoreConflict";
  }
}

export interface Store {
  /** Takes the log for this process (FileStore: an exclusive lockfile) and readies it for reads. */
  open(): Promise<void>;
  /** Every committed commit whose events come after `after`, oldest first. */
  read(after: number): AsyncIterable<Commit>;
  /** Appends `commit` durably and atomically if the log's head is still `expectedHead`. */
  append(commit: Commit, expectedHead: number): Promise<void>;
  /** Commits other writers append. A single-writer store never calls `listener`. */
  subscribe(listener: (commit: Commit) => void): () => void;
  /** Releases the log. */
  close(): Promise<void>;
}
