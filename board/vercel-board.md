# BOARD: Vercel Board, the reference data model

**Track:** board · **Type:** research · **Date:** 2026-11-21

**Question:** what does Vercel's Board hold and promise, so that a csf version can keep the same data model and replace it, or be replaced by it, without changing callers?

**Sources.** There are three:
- Vercel's "Board CLI Reference" page (`vercel board`), pasted by the owner on 2026-11-20.
- Vercel's "Board Concepts" page, pasted by the owner on 2026-11-21.
- A local capture of the protocol between Vercel CLI 66.6.0 (SDK `@vercel/board` 0.51.1) and a board, together with the conformance runs of the csf server v1 (then tobogan's `board/server`, merged in PR #8; now `wove-design/csf-board`, BOARD-19), made on 2026-11-21.

Board is an Experimental Vercel feature, so all of this may change. The Board SDK and Board Access Control pages were not seen. Quotations are verbatim.

"Code" lines name paths in the `wove-design/csf-board` repository, pinned at `7c5fb97c` (byte-identical to tobogan's `board/server` at `f2dfe38`, BOARD-19); `src/…`, `test/…` and `scripts/…` are relative to its root. "Tested" below means implemented in `csf-board` and covered by its automated tests: `bun run test`, and `bun run conformance` (Vercel's own suite, 61 passed, 0 failed, 29 skipped against CLI 66.6.0).

## Doctrines

**BOARD-1. Keep Board's data model and CLI contract, so either implementation can replace the other.**
The csf version uses the same objects, IDs, states, labels, error reasons, wire protocol and exit codes as Vercel's Board. Anything it adds lives outside the shared model (its own labels or schemas), never as a change to it.
- Why: owner decision, 2026-11-20: "we will respect the data model for drop in replacement if needed". A drop-in replacement in either direction keeps the option to move to Vercel's hosted Board, or off it, without rewriting agents and scripts.
- Evidence: the csf server v1 passes Vercel's own conformance check (BOARD-12), run with CLI 66.6.0 against a csf board: 61 passed, 0 failed, 29 skipped. The run script (`scripts/conformance.ts`) exits non-zero if any check in the groups v1 targets (core, paging, search, tasks, schemas) fails. No per-group breakdown of the 29 skipped checks was reviewed for this document. Drop-in replacement is therefore proven only for the groups v1 keeps, and not for grants, schedules, attachments, sync or watchers (BOARD-15).
- Basis: Decision (owner, 2026-11-20); Tested (the groups v1 keeps)
- Code: `csf-board` as a whole. Gap: grants, schedules, attachments, sync and watchers (BOARD-15).

**BOARD-2. Model a board as channels that hold threads, each thread a root message and its replies.**
- **Hierarchy:** team, then board, then channel, then thread, then message.
- **Boards:** each board has its own channels, its own grants and one event log. A team can keep several named boards, and its default board is named General.
- **Channels:** a channel is a path, and a path prefix such as `dev/` names a subtree. A first post creates a channel; `channels create` creates an empty one.
- **Threads:** a thread is a root message and its replies, one level deep. Any message ID in a thread identifies that thread.
- **Private channels:** the CLI's `--private` closes a channel to everyone but its creator. The create-channel request body is a strict `{path}`, so the captured wire carries no private flag. How the CLI makes a channel private was not captured.
- Why: every other object (tasks, schedules, sync, filters) hangs off this hierarchy. Getting it wrong breaks every caller.
- Evidence: Concepts page, the object hierarchy and identifiers; CLI reference, "Read channels and threads", "Create channels", "Choose a board"; protocol capture, the create-channel body.
- Basis: Verified, Tested
- Code: `src/board.ts` (channels, threads, posts), `src/state.ts` (the projections), `src/wire.ts` (`CreateChannelBody`). Each name in `CSF_BOARD_BOARDS` is a board with its own log (`src/main.ts`). Teams are not modelled, so discovery reports `team_id: null`. Gap: private channels.

**BOARD-3. Give every message an opaque ID, one author, up to 10,000 characters of Markdown, labels, reactions, attachments, structured data and a revision.**
- **IDs:** a message ID is opaque. It prints as `msg_…` and is passed back exactly as printed. A caller never parses it or derives anything from it.
- **Attachments:** up to 10 per message, each up to 100 MB.
- **Labels:** labels are `k=v` pairs, and a label is identified by its key. Labels under `board.` are reserved for the board (`reserved_label`).
- **Edits:** only the author edits or deletes a message. A deleted message becomes a tombstone and loses its labels.
- Why: the message is the unit every command reads and writes.
- Evidence: Concepts page, "Message" (Markdown by one actor, with labels, reactions, attachments and data) and the identifiers; CLI reference, "Message IDs", "Post and reply", "Edit, delete, react, and label"; protocol capture ("message IDs are opaque").
- Basis: Verified, Tested
- Code: `src/board.ts`, which caps text at `TEXT_MAX` and checks reserved labels and authorship; `test/board.test.ts`, "only a message's author edits it" and "no caller writes a label under board.". v1 happens to mint `msg_<seq>`. That is its own choice, not part of the model. Gap: attachments, which answer 501 `no_files` (BOARD-15).

**BOARD-4. Offer a condition on every write that can race, and change nothing when it fails.**
The conditions are:
- `reply --after <id>`: only while that message is still the thread's newest (`newer_message`).
- `edit` or `delete --if-revision <N>`: only at that revision (`revision_conflict`).
- `label --if k=v` or `--if-unset K`: only in that label state (`label_conflict`).
- `--idempotency-key`: posts once, even when the same key is sent again. On the wire, the key arrives as a client ID `key:<principal>:<32 hex>`, and the board accepts it only from that principal.
- Why: several agents write to one board. Without conditional writes, two agents claim the same work or overwrite each other.
- Evidence: CLI reference, the conditions table under "Edit, delete, react, and label", and the `post`/`reply` options; protocol capture, the client-ID form.
- Basis: Verified, Tested
- Code: `src/board.ts`, which checks the conditions inside the write queue and checks client IDs; `GET /posts/:id` in `src/http.ts`; `test/board.test.ts`, under "conditions" and "idempotency" ("a key: ID is only its own principal's").

**BOARD-5. Treat a task as a thread with a state the board keeps, claimed under a fenced lease.**
- **Identity:** a task is identified by its root message ID.
- **States:** `waiting`, `ready`, `claimed`, `blocked`, `completed`, `failed`, `canceled`. The first four are open. `open` and `all` are list filters, not states.
- **Lease:** 30 to 3600 seconds on a local board, 900 by default. Vercel's cap is never under 300 seconds.
- **Claims:** a claim carries an epoch and a token, and every write made under the claim must send both.
- **Operations:** create (a new thread, an existing thread, or a plan from a JSON file), claim (one task, or the oldest ready one with `--ready`, optionally `--wait`), renew, release, complete with a result, fail with a reason, block for a person (`--kind`), unblock, reopen, assign to a profile or `--pool`, set `needs`, cancel.
- **Who:** an owner, or someone with `manage` in the channel, settles changes reserved to the owner (`task_not_owned`).
- **Running a command:** `tasks run <id> -- <cmd>` claims a task, runs the command and settles the task by its exit code. A `SIGTERM` releases the task (exit 143).
- **Lost claims:** a claim is lost when its lease runs out, or when the task is released, held or canceled (`claim_lost`). What happens to a task whose lease runs out is the board's policy (BOARD-18).
- **Dependencies:** `needs` makes a task `waiting` until the tasks it needs complete. A task that isn't readable, or a cycle, fails with `invalid_needs`.
- Why: this is the part of Board that an orchestrator uses to hand work to agents. The reference says to use tasks "instead of an `owner` label. A task has a lease, so work that an agent abandons returns to the queue."
- Evidence: CLI reference, "Work with tasks" and its reason table; Concepts page, the task identifier; protocol capture, the state list, the lease bounds and the claim's epoch and token.
- Basis: Verified, Tested
- Code: `src/board.ts` (the task operations, `LEASE_MIN_S`, `LEASE_MAX_S`, `LEASE_DEFAULT_S`, and `fenced`), `src/state.ts` (`TaskState`), `src/wire.ts`; `test/board.test.ts`, under "leases and epoch fencing" and "needs"; the conformance tasks group.

**BOARD-6. Make every actor a person or a named profile, and give a profile its owner's permissions.**
- **Kinds:** the Concepts page lists four kinds of actor: a person, a project's deployment, an app, or an agent's profile. On the wire, the captured `kind` is `person` or `agent`. How deployments and apps appear on the wire was not captured.
- **Identity:** every actor has an actor ID and a handle such as `ada/fx`.
- **Profiles:** a profile is set with `--as` or `BOARD_PROFILE`, and is "named, never detected". It reaches the board as the header `x-board-profile`. A profile's handle (`ada/fx`) uses up to 32 letters, numbers and hyphens, starting with a letter.
- **Separate profiles:** parallel agents need separate profiles, because "agents that share a profile are one actor".
- **Mentions:** a mention resolves only when exactly one visible actor has that handle. Otherwise it stays plain text, and a mention never makes a write fail. `@[actor-id]` names one of several actors that share a handle.
- Why: the orchestrator and each subagent must be told apart in the record, while access stays with the person.
- Evidence: Concepts page, actors; CLI reference, "Post from coding agents", "Mention people and agents"; protocol capture, `x-board-profile` and the actor kinds.
- Basis: Verified, Tested (person and agent)
- Code: `callerOf` in `src/http.ts`; mentions are settled in `src/board.ts`; `test/http.test.ts`, "/me is the principal, or the profile its header names". v1 forms a profile's actor ID as `<principal>+<profile>`. That is its own choice, not part of the model. Gap: deployment and app actors.

**BOARD-7. Control access with grants, each naming principals and permissions per channel pattern.**
- **Principals:** users, projects (with environments), apps, all users, all projects, all apps, and `--everyone`.
- **Permissions:** `read`, `post`, `react`, `label`, `sync` and `manage`, or `all` or `none`.
- **IDs:** a grant is identified by an ID such as `g4`.
- **Other operations:** `grants explain` shows which grant decides a channel.
- **Closing a channel:** closing it to everyone closes it to its creator too, so the grant that keeps the creator in comes first.
- Why: a board for a law firm carries matter data. Access must be explicit and explainable.
- Evidence: CLI reference, "Control access"; Concepts page, the grant identifier. The Access Control page was not seen.
- Basis: Verified (surface); Unverified (how grants combine)
- Code: Gap: grants answer 501 `no_grants` (`src/http.ts`). Every token's principal has full access. The request header `x-board-can` can only narrow that access (`src/access.ts`, tested in `test/http.test.ts`). The permission implications in `access.ts` are v1's reading, not the Access Control page.

**BOARD-8. Expose activity as one event log that can be followed, waited on and resumed from a cursor.**
- **One log:** every write appends an event. Reads, `tail`, `wait` and watchers all follow that one log, and an event is identified by its cursor.
- **Commands:** `tail` prints events live. `wait` blocks until the next matching event, for 30 minutes by default, and exits 1 with `timeout`. Both take the read filters: `--by`, `--mentions`, `--label`, `--text`, `--source`, `--re` and `--after`.
- **Resuming:** `wait` prints the command that continues from the event it returned, "so a loop misses nothing between two waits".
- **Wire:** `wait` and `tail` are long-polls on `GET /events?after=<cursor>&wait=<seconds>`, not server-sent events. The board must hold the request open until an event arrives or the wait runs out.
- Why: "block until someone answers" is how an agent waits for a person's sign-off without polling.
- Evidence: Concepts page, the event log and the event identifier; CLI reference, "Follow activity and wait for replies"; protocol capture, the long-poll.
- Basis: Verified, Tested
- Code: `src/board.ts` (`poll`, `changed`, the waiter cap), `src/http.ts` (`/events` and `holdOpen`, which keeps a poll open past Bun's 10-second idle timeout), `src/store.ts` (one log per board); `test/http.test.ts`, under the long-poll tests. v1 holds one long-poll for at most 300 seconds (`src/wire.ts`) and answers server-sent events with 501. How the CLI spreads a 30-minute `wait` over shorter polls was not captured.

**BOARD-9. Accept structured data only as JSON that matches a registered, immutable schema version.**
- Schemas are named `name@version`, and a version never changes.
- Data is checked on write: `invalid_block` for data that doesn't match, `schema_not_found` for an unknown schema.
- `git-commit@1` and `vercel-deployment@1` are built in.
- Why: agents read data, not prose. Immutable versions keep old messages valid.
- Evidence: CLI reference, "Post structured data".
- Basis: Verified, Tested
- Code: `src/blocks.ts`; the conformance schemas group.

**BOARD-10. Let schedules post later, once or on an interval of at least one minute, as their author.**
- Why: reminders and recurring check-ins belong to the board, not to a cron job outside it.
- Evidence: CLI reference, "Schedule posts".
- Basis: Verified
- Code: Gap: schedules answer 501 `no_scheduler` (`src/http.ts`).

**BOARD-11. Keep the CLI contract: `--json` output, a JSON error with `reason` and `next`, and fixed exit codes.**
- **Wire errors:** an error on the wire is `{"error":{"code":"…","message":"…"}}`, and the CLI shows `code` as `reason`. A board therefore keeps the reasons by answering with them as `code`.
- **Exit codes:** `0` success; `1` failure or timeout; `2` usage error or no board; `130` Ctrl-C; `143` `SIGTERM` during `tasks run`. The CLI sets them.
- **Addressing:** a board is addressed by URL (`https://api.vercel.com/v1/messageboard/boards/<board>?teamId=<team>`) or by name, in a fixed resolution order: `--url`, then `--scope`/`--name`, then `BOARD_URL`, then the project's team, then the login's default team. `--url` takes a non-Vercel URL too: the CLI checks neither the scheme nor the host.
- Why: scripts and agents branch on `reason` and exit codes. Matching them is what makes the csf version a drop-in replacement for callers.
- Evidence: CLI reference, "Exit codes", "Choose a board", "Environment variables"; protocol capture, the error envelope and the unchecked `--url`.
- Basis: Verified, Tested
- Code: `src/errors.ts` (`HttpError`, `errorResponse`); `test/http.test.ts`, "errors are { error: { code, message } } with a message". The conformance runs reach v1 at `http://127.0.0.1:<port>/boards/<name>` (`scripts/conformance.ts`).

**BOARD-12. Prove compatibility by passing Board's own conformance check.**
`vercel board conformance --url <csf-board>` against a scratch board of the csf version is the acceptance test for BOARD-1. The check writes to the board, changes grants and deletes what it posted, so it runs only against a test board.
- Why: "drop-in" is a claim until a check that can fail says so (FLEET-1).
- Evidence: CLI reference, "Check a board", which states that the check "posts test messages", "changes grants, deletes what it posted", and runs only on a board named with `--name`, `--url`, `BOARD_NAME` or `BOARD_URL`. The check accepts a non-Vercel URL and needs no Vercel login: the v1 run used `BOARD_TOKEN` against `http://127.0.0.1`, with empty HOME and XDG directories, and got 61 passed, 0 failed, 29 skipped with CLI 66.6.0.
- Basis: Verified, Tested
- Code: `scripts/conformance.ts` (`bun run conformance`). It runs `vercel@latest`, so a later CLI can change the counts. Rerun it whenever the CLI version changes.

**BOARD-13. Answer discovery without a token, and every other request only with a bearer token.**
- **Discovery:** `GET <base>` without auth returns `{audience, url, sync: []}`, and `audience` equals the URL the client was given with `--url`.
- **Every other request:** sends `Authorization: Bearer <token>`. `BOARD_TOKEN` supplies the token without a Vercel login.
- **Headers:** two request headers shape the caller: `x-board-profile` (BOARD-6) and `x-board-can` (BOARD-7).
- Why: discovery is what the captured client reads first, without a token. A board that requires a token for it, or answers with another shape, departs from the captured protocol.
- Evidence: protocol capture, discovery and auth.
- Basis: Verified (protocol capture), Tested
- Code: `createHandler` in `src/http.ts` (with `CSF_BOARD_PUBLIC_URL` behind a proxy) and `src/tokens.ts`, which holds the SHA-256 of each token; `test/http.test.ts`, "discovery needs no token and names the board's URL" and "everything else needs a known bearer token".

**BOARD-14. Serve a csf board at a base URL with no query string.**
The client builds each request by appending the route's path to the base URL, so a query string in the base ends up in the middle of the path and breaks routing. A csf board is mounted at a path (`/boards/<name>`), never addressed by a query.
- Why: a base URL such as `…/board?name=x` sends every request to a path that doesn't exist.
- Evidence: protocol capture, which shows the paths concatenated onto the base. Vercel's own URL carries `?teamId=` (BOARD-11); how the client treats that URL was not captured, so this doctrine binds only csf boards.
- Basis: Verified (protocol capture)
- Code: `createHandler` in `src/http.ts` mounts each board at `/boards/<name>`.

**BOARD-15. Answer a group the board doesn't keep with the status that conformance skips.**
- **Optional groups:** these answer 501, and the conformance check skips them.
- **Watchers and sync:** the capture shows that neither can be skipped with a 501. Specific 403 codes skip them.
- **What v1 does:**
  - It answers watchers with a 403.
  - It answers sync routes with 501 and advertises no sync targets in discovery.
  - Its runs show 0 failed.

  Which of these made the check skip sync, or whether its sync checks send no request at all, was not determined.
- Why: an unkept group that answers anything else counts as a conformance failure rather than as a skip, and BOARD-12 then can't tell a missing feature from a broken one.
- Evidence: protocol capture and the v1 conformance runs: 29 skipped, 0 failed.
- Basis: Verified (protocol capture), Tested
- Code: `src/http.ts` answers each unkept group as follows:
  - grants: 501 `no_grants`;
  - schedules: 501 `no_scheduler`;
  - attachments: 501 `no_files`;
  - server-sent events, sync routes, inbox, sources, links and typing: 501 `not_supported`;
  - watchers: listed as none, while registering, matches and acks answer 403 `watchers_need_project`;
  - discovery advertises `sync: []`.

  `test/http.test.ts`, "optional features answer 501, so conformance skips them". The watcher 403 rests on the conformance run alone. Gap: no 403 code for sync, should a later CLI stop skipping it.

**BOARD-16. Build the orchestrator's task queue first, on a model that grows into the full board.**
The first version covers tasks (BOARD-5) and the event log (BOARD-8) on the full data model. Sync with Slack, GitHub and Linear stays out of it.
- Why: owner decision, 2026-11-20: option C, the orchestrator task queue first. Sync is left out because syncing "shows it to everyone in the platform channel".
- Evidence: owner's choice of option C, 2026-11-20.
- Basis: Decision (owner, 2026-11-20)
- Code: `csf-board`, v1. It serves the core, tasks, long-poll events and schemas; sync answers 501 (BOARD-15).

**BOARD-17. Store each board's event log in Redis on jmbox, reached over Tailscale, and in files behind the same `Store` interface until then.**
The engine sees storage only through `Store`, so moving from files to Redis changes no caller and no projection.
- Why: owner decision, 2026-11-21: "Emulate with files on jmbox now; will drop in Redis when I return." Keeping the seam narrow keeps the switch to Redis a single adapter.
- Evidence: owner decision, 2026-11-21; csf-board's `README.md`, "Redis", which maps each `Store` method onto Redis.
- Basis: Decision (owner, 2026-11-21)
- Code: `src/store.ts` (`Store`) and `src/file-store.ts` (`FileStore`), covered by `test/file-store.test.ts` and `test/restart.test.ts`. Gap: the Redis adapter, and Redis on jmbox itself (see Open).

**BOARD-18. Set lease-expiry policy per board and per label, hold csf drain tasks when a lease runs out, and fence every claim with its epoch.**
- **`hold`:** csf drain tasks use the `hold` policy. When a lease runs out, the board appends an event, marks the task `lease_expired` and never requeues it automatically. The orchestrator decides whether to dispatch it again.
- **`requeue`:** other tasks may use the `requeue` policy, Board's default.
- **Fencing:** each claim's epoch is its fencing token. A write that sends an older epoch is refused with `claim_lost`.
- Why: owner decision, 2026-11-21: redispatching a csf drain task is the orchestrator's call, not the board's. This document's reading is that an automatic requeue could run the task a second time beside an agent that is slow but still alive, and that the epoch fence refuses whichever writer is late.
- Evidence: owner decision, 2026-11-21.
- Basis: Decision (owner, 2026-11-21); Tested (the mechanism)
- Code: the sweeper and `fenced` in `src/board.ts`; `leaseConfig` in `src/main.ts`, which reads `<data dir>/<board>/config.json`. Under `hold`, the board appends `task.expired`, blocks the task with kind `lease_expired` and labels its root `lease_expired=<epoch>`. `test/board.test.ts`: "under hold, a lapsed claim is blocked and labelled lease_expired, not requeued" and "a claim's writes need its epoch and token". Gaps:
  - The code's default is `requeue`, and no csf board's `config.json` sets `hold` yet.
  - Until the sweeper runs, a lapsed claim under `hold` still reads as claimed.

**BOARD-19. Keep the server's code in its own repository, `wove-design/csf-board`, and its research and decisions here.**
The code moved with its history; this document stays the model it must keep, and its "Code" lines point into that repository.
- Why: owner decision, 2026-11-21: "Yes as recommended" to moving the board server into its own `csf-board` repository under `wove-design`, as the Orchestrator session suggested. A csf service gets its own repository like the other csf repositories, and tobogan stays a research workspace.
- Evidence: owner decision, 2026-11-21. `wove-design/csf-board` (private, default branch `master`) was seeded by `git subtree split --prefix=board/server` at tobogan `f2dfe38`; its `master` (`7c5fb97c`) has the same tree (`933332ff`) as tobogan's `board/server`. From a fresh clone: `bun run test` 49 pass, 0 fail; `bun run conformance` 61 passed, 0 failed, 29 skipped.
- Basis: Decision (owner, 2026-11-21)
- Code: `wove-design/csf-board` as a whole.

## Open

- **How grants combine** (BOARD-7). Owner: the owner, by pasting the Board Access Control page.
- **The csf usage model:** how tasks map onto csf drains, work orders and lanes. It is being discussed with the owner and will be its own document. Owner: the owner.
- **Redis on jmbox** (BOARD-17): a separate instance, reached over Tailscale, which needs the owner's sudo to set up. Owner: the owner.
- **The v1 ceilings** in csf-board's `README.md`. Owner: the owner, deciding when each is lifted.
  - The whole log is held in memory and replayed at start. Move to snapshots or Redis when replay takes noticeably long, or near about 1 GB.
  - Every token's principal has full access. Implement grants once a second person, or an agent token that must be confined on the board's side, needs to be kept out.

## Sources

- Vercel, "Board CLI Reference" (`/docs/cli/board`), pasted by the owner 2026-11-20. Experimental feature.
- Vercel, "Board Concepts", pasted by the owner 2026-11-21. Experimental feature.
- Protocol capture: Vercel CLI 66.6.0 and SDK `@vercel/board` 0.51.1 against a board, together with the v1 conformance runs (61 passed, 0 failed, 29 skipped). Local, 2026-11-21. Not committed.
