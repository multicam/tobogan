# board/server

The csf Board server, v1. It speaks Vercel's Board protocol (the routes `@vercel/board` 0.51.1 calls) and keeps each board as an append-only event log in files. The owner's decision, 2026-11-21: "Emulate with files on jmbox now; will drop in Redis when I return." The Redis adapter is not written. "Redis" below says how it fits.

## Run

```sh
bun install
bun run typecheck
bun run test          # bun test: conditions, leases and fencing, needs, long-poll, SIGKILL replay, idempotency
bun run conformance   # Vercel's own suite, against a throwaway server on 127.0.0.1
bun run start         # the server, with the configuration below
```

`bun run conformance` does the following:
- Starts the server on a free port, with a fresh data dir and a random token.
- Runs `bunx vercel@latest board conformance --url … --json` with HOME and the XDG dirs set to an empty scratch dir and no Vercel credentials.
- Prints passed, failed and skipped counts per group, then stops the server and deletes the scratch dir.

`-- --report <file>` also writes the suite's JSON report to `<file>`.

Every script runs bun with `--no-env-file`, so no `.env` file is ever read.

## Configuration

All configuration comes from environment variables.

| Variable | Default | What |
| --- | --- | --- |
| `CSF_BOARD_HOST` | `127.0.0.1` | Address to bind. Later this will be the tailnet IP. |
| `CSF_BOARD_PORT` | `4710` | `0` picks a free port. |
| `CSF_BOARD_DATA_DIR` | `$XDG_DATA_HOME/csf-board`, or `~/.local/share/csf-board` | One directory per board. |
| `CSF_BOARD_BOARDS` | `general` | The boards to serve, comma-separated. Each is served at `/boards/<name>`. |
| `CSF_BOARD_PUBLIC_URL` | the request's origin | Discovery's `url` and `audience`, behind a proxy. |
| `CSF_BOARD_TOKENS_FILE` | `$XDG_CONFIG_HOME/csf-board/tokens.json` | The tokens file. |
| `CSF_BOARD_TOKENS` | none | The tokens file's JSON itself. Used instead of the file when set. |

### Tokens

The tokens file maps the SHA-256 of each bearer token to a principal. It holds hashes only, never a token. It lives outside the repo; only `tokens.example.json`, with placeholders, is committed. To add a token, hash it with `printf %s "$TOKEN" | sha256sum` and add an entry with the principal it stands for (`csf:user:<id>`), a handle and a name.

A client points the Vercel CLI at the server with `--url http://<host>:<port>/boards/<name>` and `BOARD_TOKEN`.

### Lease expiry policy

Optional per-board file `<data dir>/<board>/config.json`:

```json
{ "leaseExpiry": { "default": "requeue", "byLabel": { "policy=hold": "hold", "orchestrated": "hold" } } }
```

- **`requeue`** (the default, and what conformance exercises): once a claim's lease runs out, the task is ready again, and the next claim expires the old one first.
- **`hold`**: when the lease runs out, the board does three things:
  - appends `task.expired`;
  - blocks the task with kind `lease_expired`;
  - labels its root `lease_expired=<epoch>`.

  It does not requeue the task, so an orchestrator decides what happens next. Until the sweeper runs, a lapsed claim under `hold` still reads as claimed.
- **Matching:** `byLabel` keys are `key` or `key=value`, matched against the task's root. The first key that matches wins.
- **Fencing:** each claim gets the next claim epoch and a fresh token. Renew, release, complete, fail and block-by-claim are refused with 409 `claim_lost` unless they send the current epoch and token while the lease is live. The board makes that check and the write as one atomic step.

## Data

```
<data dir>/<board>/events.jsonl   one commit per line; fsync after every commit
<data dir>/<board>/board.lock     the owning process's pid; a dead pid's lock is taken over
<data dir>/<board>/config.json    optional, as above
```

- **The log:** every write appends one commit, which can hold several events. Each event's `seq` is its position in the board's single log, and that position is three things:
  - the `/events` cursor;
  - the source of message IDs (`msg_<seq>`);
  - the version number.
- **Reads:** all reads come from in-memory projections, rebuilt by replaying the log at start.
- **Writes:** writes go through one in-process queue, so each check and its write see the same state.
- **Recovery:** a torn last line, from a crash in the middle of a write, is truncated on open. A commit that got its 201 was already fsynced. `test/restart.test.ts` kills a real server with SIGKILL and checks this.
- **Ceiling:** the whole log is held in memory and replayed at start. Move to snapshots or Redis when replay takes noticeably long, or when the log reaches about 1 GB.

## What it serves

| Group | v1 |
| --- | --- |
| Discovery, `/me`, actors, profiles (`x-board-profile`), narrowing (`x-board-can`) | Yes |
| Channels, threads, messages, edit, delete (tombstones), reactions, labels, mentions | Yes |
| BOARD-4 conditions: `after`, `revision`, label `if`, client IDs, `/posts/:id` | Yes |
| Tasks: create, batch, claim, claim-ready (with `wait`), renew, release, complete, fail, block, unblock, reopen, assign, needs (cycle check), cancel, lease sweeper | Yes |
| `/events` long-poll with the read filters, `last`, `all` | Yes; server-sent events answer 501 |
| Schemas: register, list, inspect; built-ins `git-commit@1`, `vercel-deployment@1` | Yes |
| Grants | 501 `no_grants`. A caller narrowed out of what a grant names gets 403 first. |
| Schedules, attachments | 501 `no_scheduler`, `no_files` |
| Watchers | `GET` lists none. Registering, matches and acks answer 403 `watchers_need_project`, which conformance skips, because watchers are not an optional group. |
| Sync, inbox, sources, links, typing | 501 `not_supported` |

**Ceiling on access:** every token's principal has full access, and `x-board-can` only narrows it. Implement grants (BOARD-7) when a second person, or an agent token that must be confined on the board's side, needs to be kept out.

## Redis

The engine (`src/board.ts`) sees storage only through `Store` (`src/store.ts`):

```ts
interface Store {
  open(): Promise<void>;
  read(after: number): AsyncIterable<Commit>;
  append(commit: Commit, expectedHead: number): Promise<void>; // throws StoreConflict
  subscribe(listener: (commit: Commit) => void): () => void;
  close(): Promise<void>;
}
```

A Redis adapter maps each method like this:

| Method | Redis |
| --- | --- |
| `read(after)` | `XRANGE <board>:events` from `after` |
| `append` | One Redis Function (`FCALL board_append`). It checks that `<board>:head` equals `expectedHead`, then does `XADD` of one entry holding the whole commit and sets the head, all atomically. A mismatch raises `StoreConflict`, which the engine answers as 503 `unavailable`. |
| `subscribe` | `XREAD BLOCK` from the last seen ID |
| `open` / `close` | `SET <board>:lock NX PX` renewed as a single-writer lease, or dropped once several writers rely on the conflict check |

The projections stay in process.
