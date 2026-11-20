import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Access } from "../src/access.ts";
import { Board, type LeaseConfig } from "../src/board.ts";
import type { Caller } from "../src/board.ts";
import { HttpError } from "../src/errors.ts";
import { FileStore } from "../src/file-store.ts";

const made: string[] = [];

/** A fresh empty directory for one test, removed by `cleanUp`. */
export function scratchDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `csf-board-${prefix}-`));
  made.push(dir);
  return dir;
}

const opened: Board[] = [];

/**
 * Closes the boards and removes the dirs this file's tests made. Each test file registers it
 * itself with `afterAll(cleanUp)`: this module is loaded once for the whole run, so a hook
 * registered here would attach to the first file that imports it, and later files would leak.
 */
export async function cleanUp(): Promise<void> {
  for (const board of opened.splice(0)) {
    await board.close().catch(() => {});
  }
  for (const dir of made.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A principal calling as itself (or as `profile`), with full access unless `can` narrows it. */
export function callerFor(handle: string, options: { profile?: string; can?: string } = {}): Caller {
  const principal = { id: `csf:user:${handle}`, handle, name: handle.toUpperCase() };
  const access = options.can === undefined ? Access.full() : Access.narrowed(options.can);
  if (options.profile) {
    return {
      principal,
      profile: options.profile,
      access,
      actor: { id: `${principal.id}+${options.profile}`, kind: "agent", handle: `${handle}/${options.profile}`, name: options.profile, avatar: null, via: { name: handle, environment: null } },
    };
  }
  return { principal, profile: null, access, actor: { id: principal.id, kind: "person", handle, name: principal.name, avatar: null } };
}

/** A settable clock, starting now. */
export function fakeClock() {
  let at = Date.now();
  const clock = () => at;
  clock.advance = (ms: number) => {
    at += ms;
  };
  return clock;
}

/** A board on a fresh FileStore; closed when the file's tests end. */
export async function openBoard(options: { leases?: LeaseConfig; clock?: () => number; dir?: string } = {}): Promise<Board> {
  const board = await Board.open(new FileStore(options.dir ?? scratchDir("board")), options.leases ?? {}, options.clock);
  opened.push(board);
  return board;
}

/** The HttpError `run` throws (sync or async), or a failure naming what it did instead. */
export async function refusal(run: () => unknown): Promise<HttpError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof HttpError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a refusal, and it succeeded");
}
