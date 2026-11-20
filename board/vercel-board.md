# BOARD: Vercel Board, the reference data model

**Track:** board · **Type:** research · **Date:** 2026-11-20

**Question:** what does Vercel's Board hold and promise, so that a csf version can keep the same data model and replace it, or be replaced by it, without changing callers?

**Source.** The "Board CLI Reference" page of Vercel's documentation (`vercel board`), text pasted by the owner on 2026-11-20. Board is an Experimental Vercel feature, so the reference may change. The Board SDK, Board concepts (tasks, sync) and Board Access Control pages it links to were not seen. Quotations are verbatim.

## Doctrines

**BOARD-1. Keep Board's data model and CLI contract, so either implementation can replace the other.**
The csf version uses the same objects, IDs, states, labels, error reasons and exit codes as Vercel's Board. Anything it adds lives outside the shared model (its own labels or schemas), never as a change to it. The full task state list and the HTTP protocol are not yet seen (see Open), so the rule covers them once they are.
- Why: owner decision, 2026-11-20: "we will respect the data model for drop in replacement if needed". A drop-in replacement in either direction keeps the option to move to Vercel's hosted Board, or off it, without rewriting agents and scripts.
- Evidence: Board publishes a conformance check, `vercel board conformance`, which "checks that a board you name speaks the Board protocol", so compatibility can be tested rather than claimed (BOARD-12).
- Basis: Decision (owner)
- Code: Gap: no implementation yet. Where it lives is open (see Open).

**BOARD-2. Model a board as channels that hold threads, each thread a root message and its replies.**
Channels are paths, and a path prefix such as `dev/` names a subtree. A first post creates a channel; `channels create` creates an empty one, and `--private` closes it to everyone but its creator. A team can keep several named boards, and its default board is named General.
- Why: every other object (tasks, schedules, sync, filters) hangs off this hierarchy. Getting it wrong breaks every caller.
- Evidence: CLI reference, "Read channels and threads", "Create channels", "Choose a board".
- Basis: Verified
- Code: Gap.

**BOARD-3. Give every message an ID, an author, up to 10,000 characters of text, labels, reactions, attachments, structured blocks and a revision.**
- IDs print as `msg_…` and are passed back exactly as printed.
- Attachments: up to 10 per message, each up to 100 MB.
- Labels are `k=v` pairs, and labels under `board.` are reserved for the board (`reserved_label`).
- Only the author edits or deletes a message. A deleted message becomes a tombstone and loses its labels.
- Why: the message is the unit every command reads and writes.
- Evidence: CLI reference, "Message IDs", "Post and reply", "Edit, delete, react, and label".
- Basis: Verified
- Code: Gap.

**BOARD-4. Offer a condition on every write that can race, and change nothing when it fails.**
The conditions are:
- `reply --after <id>`: only while that message is still the thread's newest (`newer_message`).
- `edit` or `delete --if-revision <N>`: only at that revision (`revision_conflict`).
- `label --if k=v` or `--if-unset K`: only in that label state (`label_conflict`).
- `--idempotency-key`: posts once, even when the same key is sent again.
- Why: several agents write to one board. Without conditional writes, two agents claim the same work or overwrite each other.
- Evidence: CLI reference, the conditions table under "Edit, delete, react, and label", and the `post`/`reply` options.
- Basis: Verified
- Code: Gap.

**BOARD-5. Treat a task as a thread with a state the board keeps, claimed under a lease.**
- **Operations:** create (a new thread, an existing thread, or a plan from a JSON file), claim (one task, or the oldest ready one with `--ready`, optionally `--wait`), renew, release, complete with a result, fail with a reason, block for a person (`--kind`), unblock, reopen, assign to a profile or `--pool`, set `needs`, cancel.
- **Who:** an owner, or someone with `manage` in the channel, settles changes reserved to the owner (`task_not_owned`).
- **Running a command:** `tasks run <id> -- <cmd>` claims a task, runs the command and settles the task by its exit code. A `SIGTERM` releases the task (exit 143).
- **Lost claims:** a claim is lost when its lease runs out, or when the task is released, held or canceled (`claim_lost`), so abandoned work returns to the queue.
- **Dependencies:** `needs` makes a task wait for others. A task that isn't readable, or a cycle, fails with `invalid_needs`.
- **States seen in error reasons:** claimed, assigned, waiting, blocked and finished, plus `open` and `all` as list filters. The full state list is on the Tasks page, which was not seen.
- Why: this is the part of Board that an orchestrator uses to hand work to agents. The reference says to use tasks "instead of an `owner` label. A task has a lease, so work that an agent abandons returns to the queue."
- Evidence: CLI reference, "Work with tasks" and its reason table.
- Basis: Verified (operations, reasons); Unverified (the full state machine)
- Code: Gap.

**BOARD-6. Make every actor a person or a named profile of a person, and give a profile its owner's permissions.**
- A profile is set with `--as` or `BOARD_PROFILE`, and is "named, never detected". It has its own handle (`ada/fx`), up to 32 letters, numbers and hyphens, starting with a letter.
- Parallel agents need separate profiles, because "agents that share a profile are one actor".
- A mention resolves only when exactly one visible actor has that handle. Otherwise it stays plain text, and a mention never makes a write fail. `@[actor-id]` names one of several actors that share a handle.
- Why: the orchestrator and each subagent must be told apart in the record, while access stays with the person.
- Evidence: CLI reference, "Post from coding agents", "Mention people and agents".
- Basis: Verified
- Code: Gap.

**BOARD-7. Control access with grants, each naming principals and permissions per channel pattern.**
- **Principals:** users, projects (with environments), apps, all users, all projects, all apps, and `--everyone`.
- **Permissions:** `read`, `post`, `react`, `label`, `sync` and `manage`, or `all` or `none`.
- **Other operations:** `grants explain` shows which grant decides a channel.
- **Closing a channel:** closing it to everyone closes it to its creator too, so the grant that keeps the creator in comes first.
- Why: a board for a law firm carries matter data. Access must be explicit and explainable.
- Evidence: CLI reference, "Control access". The access-model page was not seen.
- Basis: Verified (surface); Unverified (how grants combine)
- Code: Gap.

**BOARD-8. Expose activity as an event stream that can be followed, waited on and resumed from a cursor.**
- `tail` prints events live. `wait` blocks until the next matching event, for 30 minutes by default, and exits 1 with `timeout`.
- Both take the read filters: `--by`, `--mentions`, `--label`, `--text`, `--source`, `--re` and `--after`.
- `wait` prints the command that continues from the event it returned, "so a loop misses nothing between two waits".
- Why: "block until someone answers" is how an agent waits for a person's sign-off without polling.
- Evidence: CLI reference, "Follow activity and wait for replies".
- Basis: Verified
- Code: Gap.

**BOARD-9. Accept structured data only as JSON that matches a registered, immutable schema version.**
- Schemas are named `name@version`, and a version never changes.
- Data is checked on write: `invalid_block` for data that doesn't match, `schema_not_found` for an unknown schema.
- `git-commit@1` and `vercel-deployment@1` are built in.
- Why: agents read data, not prose. Immutable versions keep old messages valid.
- Evidence: CLI reference, "Post structured data".
- Basis: Verified
- Code: Gap.

**BOARD-10. Let schedules post later, once or on an interval of at least one minute, as their author.**
- Why: reminders and recurring check-ins belong to the board, not to a cron job outside it.
- Evidence: CLI reference, "Schedule posts".
- Basis: Verified
- Code: Gap.

**BOARD-11. Keep the CLI contract: `--json` output, a JSON error with `reason` and `next`, and fixed exit codes.**
- Exit codes: `0` success; `1` failure or timeout; `2` usage error or no board; `130` Ctrl-C; `143` `SIGTERM` during `tasks run`.
- A board is addressed by URL (`https://api.vercel.com/v1/messageboard/boards/<board>?teamId=<team>`) or by name, in a fixed resolution order: `--url`, then `--scope`/`--name`, then `BOARD_URL`, then the project's team, then the login's default team.
- Why: scripts and agents branch on `reason` and exit codes. Matching them is what makes the csf version a drop-in replacement for callers.
- Evidence: CLI reference, "Exit codes", "Choose a board", "Environment variables".
- Basis: Verified
- Code: Gap.

**BOARD-12. Prove compatibility by passing Board's own conformance check.**
`vercel board conformance --url <csf-board>` against a scratch board of the csf version is the acceptance test for BOARD-1. The check writes to the board, changes grants and deletes what it posted, so it runs only against a test board.
- Why: "drop-in" is a claim until a check that can fail says so (FLEET-1).
- Evidence: CLI reference, "Check a board", which states that the check "posts test messages", "changes grants, deletes what it posted", and runs only on a board named with `--name`, `--url`, `BOARD_NAME` or `BOARD_URL`. Whether the protocol it checks is published as a specification was not seen.
- Basis: Verified (the check exists); Unverified (that it accepts a non-Vercel URL)
- Code: Gap.

## Open

- **Where the csf version lives,** for example in `csf-build` or its own repository, and how tasks map onto csf drains, work orders and lanes. Owner: the owner, with the Orchestrator session.
- **The HTTP protocol.** Is it specified (Board SDK page, conformance source), or only implied by the CLI? Owner: the owner, by pasting the Board SDK page or approving a capture of the conformance check's requests.
- **The full task state machine** and the lease length (BOARD-5). Owner: the owner, by pasting the Tasks page.
- **How grants combine** (BOARD-7). Owner: the owner, by pasting the Board Access Control page.
- **Whether `vercel board conformance` accepts a non-Vercel `--url`** (BOARD-12). Owner: the owner, by approving the capture above.

## Reference

- First-version scope, owner decision 2026-11-20: option C, the orchestrator task queue first (BOARD-5, BOARD-8), on a model that grows into the full board. Sync with Slack, GitHub and Linear is left out of the first version because syncing "shows it to everyone in the platform channel". The planning document will carry it as a doctrine.

## Sources

- Vercel, "Board CLI Reference" (`/docs/cli/board`), pasted by the owner 2026-11-20. Experimental feature.
