# NMODE: Modes, review and worktrees in Noodle, and what a three-level autonomy dial would change in Qara and csf

**Track:** noodle · **Type:** research · **Date:** 2026-11-23

**Question:** how do Noodle's three run modes (auto, supervised, manual), its review and approval flow, its control commands and its git-worktree isolation work, and how far is each enforced by code? Would an explicit three-level autonomy dial simplify the many separate rules Qara and csf use for the same jobs?

**Scope.** Noodle's `mode`, the pending-review flow and the screen a person uses for it, the control channel (pause, steer, requeue and the rest), the `worktree/` package and `noodle worktree` CLI, and the `quality`, `review` and `adversarial-review` skills as merge gates. Scheduling internals belong to NSCHED, skills to NSKILL, events and runtimes to NADAPT, CLI/server/UI presentation in general to NVIEW, and the brain to NBRAIN. They are cited only where the mode feature touches them.

**Sources.**
- Noodle at commit `82d2921c52370f23f29086de81ccfb600939c037` (v0.1.5, last push 2026-03-19). Paths are relative to the Noodle repo root. Read only; nothing was built or run.
- Qara at `$HOME/qara`, read 2026-11-23: `.claude/skills/core/workflows/{git-update-repo,merge-conflict-resolution,publication-checklist}.md` (git-update-repo and delegation-guide read in full), `.claude/context/{delegation-guide,acts,hooks-guide}.md`, `.claude/hooks/lib/authority-ledger.ts`, `.claude/scripts/authority.ts`, `.claude/hooks/lib/state/mode-state-store.ts`, `decisions/2026-11-06-authority-ledger.md`, `decisions/2026-11-02-standing-maintenance-and-publication-authority.md`, `.claude/skills/pi/SKILL.md` and `references/pi-subagents.md` (pi-subagents read in full).
- csf-build as installed in `/media/ssdev/tg-pro/cub/node_modules/csf-build`, and cub itself, read only; nothing was run there.

"Verified" means read in source or on a fetched page. A claim that an identifier has no caller rests on an untruncated `rg` over every `.go` file, hidden directories included, and the doctrine says so. Every judgement about fit for Qara or csf is Unverified until tested. Nothing here is Tested: we ran nothing.

**Summary.**
- The three modes gate one thing in code that runs: whether a finished stage with changes merges by itself (`internal/mode/gate.go:30-32`, called once at `loop/cook_completion.go:135`). The docs and the package comment say manual also gates scheduling and dispatch. `CanSchedule` and `CanDispatch` have no caller outside the gate file and tests, there is no `dispatch` control action, the scheduling brief carries no mode, and the `schedule` skill tells the agent to never pause for confirmation. A per-skill gate was built once (`permissions.merge`) and deliberately deleted.
- A runtime mode change is written to `state.snapshot.json` and survives a restart. Once that file exists, editing `mode` in `.noodle.toml` does nothing until `noodle reset`. The transition record always names the actor `control`.
- Review is a real file-backed queue and a real screen: a diff (stat plus highlighted unified diff) and three buttons. Merge conflicts and blocking stage messages use the same queue in every mode. "Has changes" means committed work only.
- Isolation is structural for dispatch (`ValidateLinkedCheckout` runs on every non-schedule dispatch) but agents launch with permission checks off, and the Bash hook that guards the primary checkout is only wired in Noodle's own `.claude/settings.json`, not installed for a user's project.
- Qara and csf already have what a dial would add: `acts.md` (act, who, enforced by, source), an append-only authority ledger, a mode-change log, and csf's actor-stamped drain events. Both are ahead on landing evidence. Neither needs a dial. The one transferable lesson is Noodle's gap itself: a stated gate with no code behind it.

## Doctrines

**NMODE-1. Treat Noodle's mode as a one-gate switch in code and a three-gate switch in prose.**
`mode` is `auto`, `supervised` or `manual`, default `supervised`. In running code it decides only whether a completed stage with a changed worktree merges automatically or is parked for a person. The docs say manual also withholds scheduling and dispatch. No code path does.
- Why: copying the docs table would import a guarantee the source does not give. A manual-mode loop in Noodle still schedules and dispatches.
- Evidence:
  - What is claimed. Matrix: auto/auto/auto, supervised auto/auto/human, manual human/human/human, and "No automatic scheduling, no automatic dispatch, no auto-merge" (`docs/concepts/modes.md:21,39-43`). The architecture note repeats it (`brain/architecture.md:104`). The package comment says one global mode "deterministically gates schedule, dispatch, retry, and merge behavior" (`internal/mode/mode.go:3-4`). The `status.json` field doc says "governing schedule, dispatch, and merge gates" (`internal/schemadoc/specs.go:122`).
  - What the code does. `CanSchedule` and `CanDispatch` return `m != RunModeManual` (`internal/mode/gate.go:17-25`). An untruncated search of every `.go` file (hidden directories included) finds them referenced only inside `BlockedReason` (`gate.go:40,44`) and in tests. `ActionSchedule` and `ActionDispatch` are referenced nowhere outside `internal/mode/` and tests. `BlockedReason` has one production call, with `ActionAutoMerge` (`loop/cook_completion.go:137`). `CanAutoMerge` (`gate.go:30-32`) has one production call (`loop/cook_completion.go:135`). The string `"manual"` appears in non-test Go only in the mode validators and the gate file.
  - What the loop reads. `buildCycleBrief` and the dispatch path test only `l.state` (running, idle, paused, draining) (`loop/loop_cycle_pipeline.go:22-24`). The scheduling brief has no mode field (no match for `mode` in non-test `mise/*.go`). The `schedule` skill says "Operate fully autonomously. Never ask the user to choose or pause for confirmation" (`.agents/skills/schedule/SKILL.md:13`); the `quality` skill says "Operate fully autonomously. Never ask the user" (`.agents/skills/quality/SKILL.md:11`).
  - No control action starts a dispatch. The dispatcher has 20 cases and none is `dispatch` (`loop/control.go:238-285`), although the design plan promised "manual `dispatch` control action for explicit launch in manual mode" (`brain/archive/plans/82-backend-v2-first-principles/phase-06-unified-mode-and-control-api.md:14`).
  - No per-skill or per-stage key exists. `config.Config` has one `Mode` string (`config/types_defaults.go:19`). `skill.Frontmatter` has `name`, `description`, `model`, `schedule` (`skill/frontmatter.go:11-16`). A stage has `task_key, prompt, skill, provider, model, runtime, group, status, extra, extra_prompt` (`internal/orderx/types.go:31-42`). The only keys read from `extra` are the merge-recovery ones (`merge_worktree`, `merge_mode`, `merge_branch`; `loop/canonical_checkpoint.go:372-377`). The comment at `gate.go:28-29` leaves per-skill overrides to "the caller"; no caller exists.
  - Default is `supervised` (`config/parse.go:17,82`; `CHANGELOG.md:26`). `INSTALL.md` also writes `mode = "supervised"` into the generated config.
  - Edge: an empty canonical mode makes `CanAutoMerge` false and `BlockedReason` return `""`, and the loop substitutes "merge requires review" (`loop/cook_completion.go:136-141`).
  - Pinned by: the gate as a pure function, `internal/mode/mode_test.go:11` `TestGateBehaviorMatrix`. The merge gate in the loop, `loop/loop_merge_reconcile_test.go:163` `TestAutoMergeWithLocalChanges` and `:211` `TestSupervisedMergeWithLocalChangesParksPendingReview` (asserts the reason string). The schedule and dispatch gates are exercised only by `internal/integration/resilience_test.go:302` `TestControlPressureUnderLoad`, whose test code calls `gate.CanDispatch` itself (`:348`) and counts blocked dispatches in its own loop, so it proves the function, not the loop. No test runs the loop in manual mode (a search of `RunModeManual` and `"manual"` in loop, dispatcher, server and e2e tests finds only `loop/canonical_checkpoint_test.go:132`, which emits a mode event).
- Basis: Verified
- Code: `internal/mode/gate.go`, `loop/cook_completion.go:130-142`. Gap: schedule and dispatch gates, retry gate, `dispatch` control action, per-skill override.

**NMODE-2. A mode change is a command, an event, a snapshot write and an audit record, and it survives a restart.**
At run time a person or agent sends `{"action":"mode","value":"auto|supervised|manual"}`. The loop validates the value, emits `mode_changed`, and the reducer stores the mode, bumps `ModeEpoch` and appends a record. The checkpoint is written at once and is what a restart loads.
- Why: it makes autonomy changes durable and attributable in principle. In practice the record never says who asked, and a stale `.noodle.toml` is silently ignored.
- Evidence:
  - `controlMode` accepts only the three strings, sets `l.config.Mode` and emits `mode_changed` with `requested_by` fixed to `"control"` and `reason` to `"mode control command"` (`loop/control_orders.go:13-30`).
  - `reduceModeChanged` increments `ModeEpoch` and appends a `ModeTransitionRecord` (from, to, epoch, requested_by, reason, applied_at); history is capped at 50 (`internal/reducer/reducer.go:347-378`, `internal/state/state.go:66-76`). The reducer would take any actor from the payload; the control command never supplies one. A second path, `control_received` with command `mode_change`, hard-codes actor `control` too (`reducer.go:380-410`); no production code emits that command (`"mode_change"` appears only at `reducer.go:387`).
  - Persistence. `emitEventChecked` reduces, then calls `persistCanonicalCheckpoint` (`loop/loop.go:635-666`), which writes `<runtimeDir>/state.snapshot.json` (`loop/canonical_checkpoint.go:20-25,87-101`). The state JSON carries `mode`, `mode_epoch`, `mode_transitions` (`internal/state/state.go:84-86`).
  - Restart. `loadOrBootstrapCanonical` runs during start (`loop/loop.go:328`). If the snapshot file exists it becomes `l.canonical` with no override from config (`canonical_checkpoint.go:27-63`). The config mode is used only when the loop is constructed (`loop.go:124`) and when a first canonical state is synthesised because no snapshot exists (`canonical_checkpoint.go:80`, `loop/state_orders.go:80`). The gate reads `l.canonical.Mode` (`cook_completion.go:135`). So a runtime-changed mode survives a restart, and a later edit of `mode` in `.noodle.toml` has no effect until the runtime directory is removed. `noodle reset` does that and refuses while `noodle.lock` is held (`cmd_reset.go:25-52`).
  - Nothing writes the new mode back to `.noodle.toml`: no file-writing path in non-test `config/*.go`.
  - Display. The status file reads canonical mode (`loop/stamp_status.go:21-23`). The server's config endpoint returns `s.config.Mode`, its own field set at construction (`server/server.go:50,85,284-286`), so it can show the startup value after a runtime change. Whether the field shares memory with the loop's config was not traced.
  - The epoch helpers `StampEffect`, `ValidateEpoch`, `TransitionMode`, `NewModeState` have no caller outside `internal/mode/` and tests. The promised in-flight rule, "Effects are stamped with creation `mode_epoch`; executor revalidates epoch before commit" (`phase-06-...md:28-31`), is not wired.
  - Pinned by: the reducer, `internal/reducer/reducer_test.go:394-428` (epoch increments, `requested_by` `user:alice` round trip) and `:555` (unknown mode ignored). Loading a snapshot: `loop/canonical_checkpoint_test.go:94-143` writes a snapshot with `Mode: auto` but asserts only the event counter. None pins the `mode` control command, restart survival, or snapshot-over-config precedence.
- Basis: Verified (code); the stale-display point is Verified for the field read, Unverified for aliasing
- Code: `loop/control_orders.go:13`, `internal/reducer/reducer.go:347`, `loop/canonical_checkpoint.go:27`. Gap: actor not recorded, epoch validation unused, restart and precedence untested.

**NMODE-3. Human approval is a file-backed queue plus three control commands.**
When a stage is parked, the loop writes `<runtimeDir>/pending-review.json`. A person approves with `merge`, refuses with `reject`, or sends back with `request-changes` plus text. All three act on an `order_id` found in that queue.
- Why: a queue on disk survives restarts and can be read by any tool, which is what makes supervised mode usable from a CLI, a TUI or a web page.
- Evidence:
  - Schema: `PendingReviewItem` with json keys `order_id, stage_index, task_key, title, prompt, provider, model, runtime, skill, plan, rationale, worktree_name, worktree_path, session_id, reason` (`loop/pending_review.go:17-33`). The file is `{"items":[...]}`, sorted by `order_id`, written atomically (`pending_review.go:76-106`). It is a projection of canonical state (`PendingReviews`). `Title` is always written empty and `Rationale` is never filled.
  - `controlMerge` (`loop/control_review.go:12-75`) requires a pending entry, asks `worktreeHasChanges`, emits `stage_review_approved` ("approved by user") then `stage_completed`. With no changes it just advances the order and does not clean the worktree (`:48-51`). With changes it merges through the queue (or directly with none).
  - `controlReject` (`control_review.go:77-121`) force-cleans the worktree first (`:89-91`), then emits `stage_review_rejected`, records a terminal order failure and forwards `review_rejected` to the scheduler agent.
  - `controlRequestChanges` (`control_review.go:123-178`) emits `stage_review_changes_requested`, records a stage-terminal failure with the feedback, forwards `request_changes` and force-cleans the worktree (`cleanupCookWorktree`, `loop/cook_failure.go:38-43`). At max concurrency it logs "deferred" and returns nil (`:135-138`), so the command is acked `ok` without having been applied.
  - A reviewer reads the diff through `GET /api/reviews/{id}/diff` (`server/server.go:290-317`; screen in NMODE-15).
  - Pinned by (bodies read): `loop/pending_review_test.go:15` `TestParkPendingReviewWritesFile` (item written with order, session). `loop/control_test.go:78` merge removes the pending item and empties the file; `:54` a generic merge error removes the pending item and marks order and stage failed; `:96` reject removes it; `:162` request-changes marks the order failed; `:238` empty feedback allowed; `:256` request-changes on a non-pending order errors; `:268` a write failure keeps the item pending. Not found by name: the max-concurrency deferral.
- Basis: Verified
- Code: `loop/pending_review.go`, `loop/control_review.go`.

**NMODE-4. Parking for review is not only for supervised mode: conflicts and blocking messages park in every mode.**
Three things enter the queue: a completed stage in a non-auto mode (NMODE-1), a merge conflict, and a stage whose agent emitted a blocking `stage_message`. The scheduler agent can also force one with `park-review`.
- Why: in auto mode there is still a human fallback for the two cases the loop cannot decide. It is the nearest thing Noodle has to an escalation rule.
- Evidence:
  - Order of checks in `handleCompletion` (`loop/cook_completion.go:116-154`): a schedule stage returns early to `handleScheduleCompletion` (`:123-125`); a blocking stage message parks (`:126-129`, `processStageMessage` `:169-183`); then `worktreeHasChanges`; then the mode gate parks or merges (`:130-150`).
  - Conflict: `handleMergeError` forwards `merge_conflict` to the scheduler, emits `merge_failed`, then `parkPendingReview(cook, "merge conflict: ...")` with the comment "so the chef can decide" (`loop/cook_merge.go:134-161`). A conflict on a schedule stage is returned, not parked (`:136-138`). Other merge errors fail the stage, hint the scheduler to create a new order, and force-clean the worktree (`:163-199`). The handler is reached from `cook_completion.go:84,419`, `loop/merge_cycle.go:22` (queued merges) and `loop/reconcile.go:496`.
  - A `stage_message` is blocking when `blocking` is omitted (`.agents/skills/quality/SKILL.md:63`).
  - `park-review` is "the sole creation path for pending reviews" by the scheduler (`loop/control_scheduler.go:117-119`); the HTTP layer does not accept it (NMODE-6).
  - Inference, not run: approving a conflict-parked item sends it back through the merge queue, which hits the same conflict and parks again (`merge_cycle.go:22`). No test covers it.
  - Pinned by: `loop/loop_merge_reconcile_test.go:100` `TestCycleMergeConflictMarksFailedAndSkips` (the name is stale; the body asserts the order is parked with a reason containing "merge conflict", in auto mode, on the remote-branch path). None for the blocking stage message (no test references `blocked by stage message` or `IsBlocking`). None for the local-rebase conflict reaching the loop.
- Basis: Verified (code, tests); Unverified (the re-park inference)
- Code: `loop/cook_completion.go:116-154`, `loop/cook_merge.go:134-199`.

**NMODE-5. The control channel is an append-only NDJSON file with acks, deduplication and a sequence watermark.**
Anything that can append to `<runtimeDir>/control.ndjson` can steer the loop: the HTTP server, a script, an agent. The loop reads it under a file lock each cycle, applies each line once, appends an ack to `control-ack.ndjson` and truncates the control file.
- Why: a file is the simplest interface that works across processes and survives a loop restart. Its only access control is filesystem permission (NMODE-12).
- Evidence:
  - Paths: `control.ndjson`, `control-ack.ndjson`, `control.lock`, `last-applied-seq` (`loop/control.go:20-26`).
  - Flow: `processControlCommands` locks, reads, applies, appends acks, truncates (`control.go:77-118`). IDs are deduplicated against the ack file loaded at start (`hydrateProcessedCommands`, `:30-75`). A missing ID becomes a deterministic `cmd-auto-<hash>` of the payload (`:172`). An invalid JSON line is acked as `error`. Commands at or below `lastAppliedSeq` are skipped.
  - Payload fields (`server/server.go:211-223`): `id, action, order_id, name, target, prompt, value, task_key, provider, model, skill`. The ack has `id, action, status (ok|error), message, failure, at`.
  - Acks say the handler accepted the command, not that the effect finished. `stop` and live `steer` run in goroutines with a 30 second timeout and ack `ok` first (`control.go:317-345`, `loop/cook_steer.go:73`).
  - Pinned by: sequence assignment, persistence round trip, skipping of replayed commands and idempotent replay, `loop/control_test.go:575,620,678,719`; deterministic ID when missing `:767`, distinct IDs for distinct timestamps `:801`; last-applied-seq flushed `:833`. The HTTP side: `server/server_test.go:116-160` (a `pause` round trip and ack).
- Basis: Verified
- Code: `loop/control.go`, `loop/control_orders.go`, `loop/control_scheduler.go`.

**NMODE-6. The control commands split into loop state, order edits, session control, review and mode; the buttons cover only a few.**
The dispatcher accepts 20 actions (`dispatchControlCommand`, `loop/control.go:238-285`). The HTTP layer accepts 18. The UI sends seven.
- Why: this is the vocabulary an operator has when a run goes wrong. It is the reference for what Qara and csf let an operator say (NMODE-14).
- Evidence:

| Group | Action | Effect |
| --- | --- | --- |
| Loop state | `pause` | state `paused`; the cycle brief is built but planning does not proceed (`loop/loop_cycle_pipeline.go:22-24`); running cooks are not stopped |
| | `resume` | state `running` |
| | `drain` | state `draining`; the loop exits when no watchers remain and merges settle (`loop/loop.go:390-396`) |
| | `set-max-concurrency` | changes the cap |
| Orders | `enqueue` | adds an order (`order_id`, `prompt`, `task_key` default `execute`, optional `skill`, `provider`, `model`) (`loop/control_orders.go:32`) |
| | `skip` | cancels the order |
| | `requeue` | resets failed or cancelled stages to pending and reactivates the order; errors "not in failed state" when nothing resets (`control_orders.go:151-175`) |
| | `edit-item`, `reorder`, `advance`, `add-stage` | edit or move queue items and stages |
| Sessions | `kill` | force-kills a session by worktree name or session ID |
| | `stop` | graceful interrupt when steerable, else force-kill and cleanup |
| | `stop-all` | force-kills every active cook |
| | `steer` | live: interrupt then send message; else kill and respawn with "Resume context ... Chef steering ..." (`loop/cook_steer.go:37-182`); target `schedule` re-plans through the scheduler |
| Review | `merge`, `reject`, `request-changes`, `park-review` | NMODE-3; `park-review` forces an item into the queue |
| Mode | `mode` | NMODE-2 |

  - `add-stage` and `park-review` are not in the HTTP `validActions` (`server/ws_hub.go:354-361`), so only a file append reaches them.
  - The UI sends `merge`, `reject`, `request-changes`, `steer`, `stop`, `stop-all`, `advance` and nothing else (`ui/src/components/ReviewList.tsx:49-65`, `ReviewBanner.tsx:11-24`, `AgentFeed.tsx:93-122`, `SchedulerFeed.tsx:85-105`). No pause, resume, drain, requeue, enqueue or mode control is on screen; the todo "Add a UI setting to change the run mode" is open (`brain/todos.md:37`, item 100).
  - Steers are recorded in the session event log as a `user` tool event (`cook_steer.go:81-122`).
  - Pinned by: pause and resume (`loop/control_test.go:595-596,702-713,853`); enqueue `:288`; edit-item `:348`; reorder `:407`; skip `:453`; requeue `:494,:876`; advance, add-stage, park-review (`loop/control_scheduler_test.go:13,80,144`); steer in depth (`loop/cook_steer_test.go:85-372`: live interrupt, non-steerable respawn, unknown session, schedule target, user event, concurrent steers). Only a logging check for `kill` (`loop/log_test.go:329`) and an ack check for `stop` (`loop/loop_test.go:877`). None found for `mode`, `drain`, `stop-all`, `set-max-concurrency`.
- Basis: Verified
- Code: `loop/control*.go`, `loop/cook_steer.go`, `server/ws_hub.go:354`.

**NMODE-7. Each agent works in its own linked worktree, and the merge is rebase, then merge, then cleanup, under a lock.**
A cook gets `<project>/.worktrees/<name>`. Merging takes a PID-stamped lock, requires the root on the integration branch with a clean tree, rebases the worktree branch onto the base, merges it, then removes the worktree and branch.
- Why: concurrent agents cannot trample each other's working tree, and merges are serialised so each rebases on the previous result.
- Evidence:
  - Path: `filepath.Join(l.projectDir, ".worktrees", name)` (`loop/cook_spawn.go:250-252`). One active cook per worktree (`cook_spawn.go:63-67`). `Create` adds `.worktrees/` to `.gitignore`, runs `git worktree add <path> -b <name> [from]`, symlinks `.claude/settings.local.json` and installs dependencies (`worktree/commands.go:15-60`).
  - Branch lookup: an existing branch of that name, else `noodle/<name>` (`worktree/app.go:207-221`). Integration branch: configured, else discovered (`worktree/app.go:34-39`).
  - `Merge` (`worktree/commands_merge.go:16-99`): acquire lock; worktree must exist; shell CWD not inside it; must be on base; no staged or unstaged changes in the root; zero unmerged commits means "nothing to merge"; a dirty worktree is stashed with `--include-untracked` (`:60-62`), rebased (`git rebase <base>`) and the stash popped; then `git merge <branch>`; then `git worktree remove`, `git branch -d`, `git worktree prune`, dependency reinstall.
  - Lock: `.worktrees/.merge-lock`, created by hard link, containing `pid\nunixtime`. Default timeout 300 seconds. Stale locks (dead PID or bad format) are removed (`worktree/lock.go:14-151`).
  - Remote variant `MergeRemoteBranch` fetches `origin/<branch>`, merges it, and deletes the remote branch (`commands_merge.go:101-140`). It is used when a runtime reports a remote `sync` result (`loop/cook_merge.go:24-27`).
  - The loop serialises merges through a merge queue with backpressure limit 128 (`loop/loop_cycle_pipeline.go:14`).
  - Pinned by: `worktree/worktree_test.go:468` `TestMerge`; `:508-557` remote merge and typed conflict; `:594-779` lock acquired, released on error, released on no commits, ownership, active lock blocks, corrupt content, waits for release; `:1166` `TestMergeWithDirtyWorktree` (a staged uncommitted file is stashed and the committed file lands); `worktree/worktree_integration_prune_test.go:62-196` integration-branch policy.
- Basis: Verified
- Code: `worktree/commands_merge.go`, `worktree/lock.go`, `loop/cook_spawn.go`.

**NMODE-8. Conflicts are classified, never auto-resolved, and routed to the scheduler and the person.**
A failed rebase or merge is checked for conflict markers. A conflict becomes a `MergeConflictError`. The loop reports it to the scheduler agent and parks the order. Nothing resolves it by itself.
- Why: a deterministic conflict retried by a loop never succeeds. A named error type lets callers stop retrying.
- Evidence:
  - Doc comment: "marks deterministic git merge/rebase conflicts so callers can avoid retry loops and surface manual resolution paths" (`worktree/merge_conflict.go`).
  - In `Merge`, a rebase failure after a stash aborts the rebase and pops the stash, then returns the conflict error (`worktree/commands_merge.go:62-75`). With no stash the rebase is not aborted, and with no conflict markers it returns "rebase failed — resolve conflicts manually in <path>" (`:75`).
  - Loop side: `forwardToScheduler(cook, "merge_conflict", ...)`, so a new order can be created to fix it (NMODE-4).
  - Pinned by: `worktree/worktree_test.go:557` `TestMergeRemoteBranchConflictReturnsTypedError` and `:619` `TestMergeLockReleasedOnError` (which asserts a `MergeConflictError`). The loop's reaction is pinned by `loop_merge_reconcile_test.go:100` (NMODE-4).
- Basis: Verified
- Code: `worktree/merge_conflict.go`, `loop/cook_merge.go:134-161`.

**NMODE-9. Cleanup refuses to destroy unmerged work unless forced; prune is conservative; the loop's own rejects force.**
`cleanup <name>` stops with an instruction when the branch has unmerged commits. `--force` discards. `prune` removes only worktrees whose commits are all patch-equivalent to the base and whose tree is clean.
- Why: cleanup is the one irreversible step. A safe default keeps a crashed agent's work.
- Evidence:
  - `ensureNoUnmergedCommits` returns "use '... cleanup <name> --force' to discard, or '... merge <name>' to keep" (`worktree/commands_cleanup.go:64-76`).
  - Branch delete tries `-d`, then `-D` only when forced. A shell CWD inside the worktree refuses cleanup.
  - `Prune` (`commands_cleanup.go:156`) uses `git cherry` (no `+` lines) plus a clean-tree check and skips and reports everything else.
  - The loop force-cleans on dispatch failure, on reject, on request-changes and on a non-conflict merge failure (`loop/cook_spawn.go:203`, `control_review.go:89-91`, `loop/cook_failure.go:41`), so a human reject discards the agent's commits.
  - Pinned by: `worktree/worktree_test.go:984-1094` (`TestCleanup`, `TestCleanupRefusesUnmergedCommits`, `TestCleanupForce`, missing directory) and `worktree/worktree_integration_prune_test.go:242-335` (prune removes patch-equivalent worktrees, skips unmerged and nested unmerged). The loop's force-cleaning is not tested for loss of commits.
- Basis: Verified
- Code: `worktree/commands_cleanup.go`.

**NMODE-10. The guard against bad merges is the human gate plus an optional quality skill, and "has changes" means committed work only.**
Noodle runs no tests itself before a merge. The loop relies on `worktreeHasChanges` to decide whether a merge is needed, and on an optional follow-up stage (the `quality` skill) to reject.
- Why: a reader assuming a built-in test gate would be wrong. And an agent that leaves work uncommitted is treated as having done nothing.
- Evidence:
  - `worktreeHasChanges` (`loop/cook_merge.go:77-101`) is true when the runtime reported a pushed branch (`spawn.json` `sync` of type `branch`), else when `HasUnmergedCommits` is true, which counts `+` lines of `git cherry <integration-branch> <branch>` (`worktree/app.go:183-189,361-381`). Uncommitted edits and untracked files are not counted. Only commits whose patch is not already on the base count.
  - Consequence (inference from the code): a stage that finishes with only uncommitted or untracked changes reads as "no changes", completes through `completeWithoutMerge` with no review parked (`cook_completion.go:143-150`), and the order moves on. The cook preamble tells agents to commit (`dispatcher/preamble.go`: "Commit with conventional commit messages"), which is the only thing preventing it. Whether the worktree is then removed was not traced.
  - `quality` skill: "Post-cook quality gate", `schedule:` "Follow-up stage after execute. Cross-provider review preferred" (`.agents/skills/quality/SKILL.md`). Steps: scope check against the plan phase, `go vet ./...` and `go test ./...`, optional `scripts/lint-arch.sh`, principle compliance, test evidence, runtime verification. The verdict is a `stage_message` event with `blocking: true|false` (`:57-66`). A blocking verdict parks the order (NMODE-4).
  - Group ordering: "2 execute stages run concurrently (group 0), then quality runs after both finish (group 1)" (`docs/concepts/scheduling.md:136`). NSCHED reports that the planner does not actually run groups in parallel.
  - `adversarial-review` skill: reviewers must run on the opposite model's CLI (`codex exec` or `claude -p`), not subagents; one, two or three reviewers by diff size; scheduled "after cook sessions that produce large diffs (200+ lines)". Its verdict is a synthesis, not a merge control. `review` skill: interactive; in autonomous sessions it writes `brain/audits/review-<date>-<subject>.md` and files todos.
  - Whether a `quality` stage runs at all is the scheduler agent's choice from skill `schedule:` hints. Nothing in the loop requires one.
  - Merge-time checks that are code: committed changes exist, the merge lock, a clean root, rebase success.
  - Pinned by: the loop tests use a fake worktree whose `HasUnmergedCommits` defaults to true (`loop/loop_test.go:57`; comment at `loop_merge_reconcile_test.go:169`); `TestAutoAdvanceWithoutChanges` (`:273`) covers the no-change branch. `HasUnmergedCommits` itself is exercised only indirectly (a list call, `worktree_integration_prune_test.go:236`); no test makes a worktree with only uncommitted or untracked changes. Nothing pins the quality gate parking an order.
- Basis: Verified (code); Unverified (the uncommitted-work consequence)
- Code: `.agents/skills/quality/SKILL.md`, `loop/cook_merge.go:77`, `worktree/app.go:183`. Gap: no code-enforced test or review gate before merge; uncommitted work invisible.

**NMODE-11. Agents run with permission prompts off; dispatch requires a linked worktree, and the Bash hook is not installed for users.**
Claude is launched with `--permission-mode bypassPermissions` and Codex with `--dangerously-bypass-approvals-and-sandbox`. The process dispatcher refuses to start an agent in a primary checkout. The worktree hook denies only a few Bash patterns and is wired only in Noodle's own repository.
- Why: the modes control merges, not what an agent may do inside its worktree. A comparable setup in Qara would need its own guards to carry that weight.
- Evidence:
  - Claude args (`dispatcher/command.go:20-26`). Codex args (`dispatcher/command.go:46-52`).
  - `ValidateLinkedCheckout` rejects a primary checkout, a missing path or a non-git directory (`worktree/enforcement.go:12-42`). It has one production call site: `resolveWorktreeForDispatch` in the process dispatcher (`dispatcher/process_dispatcher.go:127`). It is skipped when `AllowPrimaryCheckout` is set, and only the schedule agent and bootstrap set it (`loop/schedule.go:164,251`). The cook dispatch request does not set it (`loop/cook_spawn.go:81-95`). So every cook dispatch through the process runtime must name a linked worktree; the scheduler agent runs in the primary checkout. The sprites and cursor dispatchers do not call it (no other caller).
  - `noodle worktree hook` reads PreToolUse JSON and acts only on `Bash`. It denies `git worktree (add|list|remove|prune|lock|unlock|move|repair)` and `cd ... .worktrees/...`. When env `COOK=1` and the checkout is primary, it also denies likely write commands (`git add|commit|merge|rebase|reset|...`, installs, `mkdir`, `mv`, `rm`, `touch`, `cp`) (`worktree/hook.go:13-92`). The denial uses Claude Code's `permissionDecision: "deny"` (`hook.go:98-135`).
  - `COOK` is read at `hook.go:59` and set nowhere in non-test code (hidden directories searched), so the write-denial branch is dead unless a user sets it. The hook is registered in Noodle's own `.claude/settings.json:9`; `noodle start`'s first-run scaffold writes `.noodle.toml` and skills but no hook (`startup/firstrun.go` has no hook or settings text). Edits by tools other than Bash (Edit, Write) are not covered.
  - Pinned by: `worktree/enforcement_test.go:9,24` (primary rejected with "primary checkout", linked worktree accepted); `worktree/hook_test.go:10-125` (a 30-row command table including the `COOK` contexts, `IsPrimaryCheckout`, `RunHook` deny JSON). No test that the dispatcher refuses a primary path (the dispatcher call is untested by name).
- Basis: Verified
- Code: `dispatcher/command.go`, `dispatcher/process_dispatcher.go:116-132`, `worktree/hook.go`, `worktree/enforcement.go`.

**NMODE-12. The control server is localhost-bound with no authentication.**
`POST /api/control` is the single write endpoint for the UI. It binds `127.0.0.1`, limits bodies to 64 KB and allows CORS only from localhost origins.
- Why: any local process can send merge, mode or stop-all. A web page that can reach localhost could also try a simple POST, because browsers enforce CORS on reading responses, not on sending simple requests, and the server decodes JSON regardless of `Content-Type`. That second point is this document's analysis of the code, not a tested exploit.
- Evidence: default address `127.0.0.1:0` and port scan from a start port (`server/server.go:30,62-64,108-115`). CORS `isLocalhostOrigin` (`server/server.go:405-428`). 64 KB limit and `json.NewDecoder(r.Body)` (`server/server.go:226-233`). No token, session or origin check in `handleControl`. Pinned by: round trips only (`server/server_test.go:116-161`); none for rejection of a foreign origin or a missing token.
- Basis: Verified (code); Unverified (cross-site reach)
- Code: `server/server.go:226-262`.

**NMODE-13. The tests pin the merge gate, the queue and the control plumbing; they do not pin the manual-mode claim, the mode command, or the restart.**
- Why: the tests show which behaviours are pinned. Each doctrine above names its tests; this one gathers the holes.
- Evidence (bodies read for the tests named in NMODE-1 to NMODE-12; the rest by name):
  - Pure-function tests give false comfort. `TestGateBehaviorMatrix` and `TestControlPressureUnderLoad` both call the gate from test code. They would pass if the loop never consulted the gate for scheduling or dispatch, which is the case.
  - No test for: the `mode` control command; a restart that restores a changed mode; snapshot-over-config precedence; a blocking `stage_message` parking an order; a conflict-parked order approved again; a worktree with only uncommitted changes; the dispatcher refusing a primary path; the HTTP control endpoint's origin handling; `drain`, `stop-all`, `set-max-concurrency`.
  - Strong where it matters: the review commands, the control sequence and dedup, steering, the merge lock, cleanup refusal and prune.
  - Size: `internal/mode/mode_test.go` 378 lines, `loop/control_test.go` 916, `worktree/worktree_test.go` 1199.
- Basis: Verified
- Code: the files named in NMODE-1 to NMODE-12.

**NMODE-14. Qara and csf already have the three postures as separate rules; a dial would be a reading aid at best, and the existing registers already do that job.**
Mapped onto Noodle's dial, Qara and csf are "supervised" for merges (a review step precedes every merge) and "auto" for starting work. Both keep the rules per act and per repository, and both record which rules are code and which are prose. A single three-level label cannot say which of Qara's landing rows applies, and Qara's own rules say autonomy changes no write scope and mode activation needs JM's keyword (`delegation-guide.md:79-83`).
- Why: the owner asked whether a dial would simplify the many separate rules. The table below puts the gates side by side. The result: the rules are the same few questions in different clothes, and Qara's `acts.md` is already the table that answers them, with a column ("enforced by") that Noodle's own docs lack and whose absence caused NMODE-1.
- Evidence: the table. "Not found" means not found in the files named in Sources; it is not a claim of absence everywhere.

| Gate | Noodle | Qara | csf |
| --- | --- | --- | --- |
| Who may start work | The scheduler agent writes orders and the loop dispatches in every mode; the cycle checks only paused or draining (`loop/loop_cycle_pipeline.go:22-24`); `enqueue` adds an order (`loop/control_orders.go:32`); the schedule skill never pauses (`.agents/skills/schedule/SKILL.md:13`) | The orchestrator, for authorized work only: "Continue authorized work autonomously" (`delegation-guide.md:54`); analysis alone authorizes nothing (`git-update-repo.md:22`); executing a mode needs JM's keyword (`delegation-guide.md:83`); one launch at a time under a load bound for pi (`pi-subagents.md:57-60`) | A human admission row per work order: `csf-admit <WO> --by <text>` (`src/admission/csf-admit.ts:8-15`), "a human saying 'this work order may be built'" (`src/admission/admission-record.ts:2-3`); the gate trusts committed rows only (`admission-record.ts:20-24`); the orchestrator is the only scheduler (`skills/orchestration/drain/bootstrap-loop-and-dispatch.md:24`; Qara `acts.md` row "Schedule csf drain") |
| Who may merge | Auto mode: the loop (`loop/cook_completion.go:143-148`). Otherwise whoever sends `merge`: any process that can append to the control file or reach localhost (`server/server.go:226`) | The parent after a blind review; a sub merges its own PR; never a peer's PR (`git-update-repo.md:88,116-126`; `delegation-guide.md:106-107`, `acts.md` rows "Merge an owned, reviewed PR" and "Peer PR adoption") | The merge train fast-forwards master on a green ladder, one train at a time (`merge-train-solver-and-escalations.md:14-19`); escalations need JM's typed ruling (`:427-435`) |
| Evidence the merge needs | Committed changes, merge lock, clean root, rebase success (`loop/cook_merge.go:77-101`, `worktree/commands_merge.go:16-99`); a quality stage only if the scheduler adds one (NMODE-10) | A blind `MERGE` for the exact head, `CLEAN` state, exact file set, green gates, combined-tree typecheck and tests, `--match-head-commit <sha>` (`git-update-repo.md:104-113`) | A recorded `APPROVED` review (`drain-event-types.ts:88-93`); the full gate ladder plus `drain.trainGates` run once on the assembled tree, bisect on red (`merge-train-solver-and-escalations.md:14-17`); an approval over `NEEDS_CHANGES` needs JM's override line committed in the review file (`src/drain/drain-start/drain-approval-override.ts:1-12`) |
| On conflict | Typed error, forwarded to the scheduler, parked for a person, never resolved (`loop/cook_merge.go:134-161`; NMODE-8) | Stop and report; a conflicting PR is never pushed to base (`git-update-repo.md:131-133`); `merge-conflict-resolution.md` has a worker resolve with trade-off analysis, then test, and "Escalate for major conflicts" (`Rules` 1-4) | `pick-conflict`: the node goes to `solving`, a solver resolves (`drain-event-types.ts:144`); only `spec-ambiguity` or `csf-infra` parks (`:123`); never rebase a drain trunk (`merge-train-solver-and-escalations.md:436-440`) |
| Who may change the posture | Any control writer; the actor is recorded as `control` (`loop/control_orders.go:17-21`) | JM's typed words only, captured by the prompt hook into the ledger (`decisions/2026-11-06-authority-ledger.md:13-17`); mode activation by JM's keyword; settings by `approve settings <sha>` (`acts.md`) | Owner-marker verbs: `--by jm` (`src/drain/drain-recorder/drain-owner-guards.ts:22-27`); the orchestrator may unpark only with a recorded verbatim ruling and its date (`:33`, `buildUnparkEvent` `:82`) |
| Where held items live | `pending-review.json` plus canonical `PendingReviews` (`loop/pending_review.go:76-106`) | No single list: open PRs, the ledger via `authority.ts status`, handoff and `WIP.md`, `scripts/pi-lane-status.ts` for pi Runs (`pi/SKILL.md:176-184`) | `parked` nodes in the drain ledger (`pipeline.db` `drains.graph`, `drain/SKILL.md:44-45`), listed by `csf-drain escalations` (`merge-train-solver-and-escalations.md:334`), `status --json`, and the `held` action of `next` (`drain-action-types.ts:19-25`) |
| How an operator steers a running loop | 20 actions with acks and dedup (NMODE-5, NMODE-6): pause, resume, drain, steer, stop, kill, requeue, edit | For pi Runs: `bsvc runs inspect / cancel / adjudicate`, a steer after capturing `ledger.lastSeq`, and `bsvc runs wait --after-seq` for the effect (`pi/SKILL.md:39-41,134-160`); for subs, `SendMessage` (`delegation-guide.md:143`). No pause verb found | `record`, `park`, `unpark`, `release`, `retire`, `trunk-accept`, `close-landed` (`src/drain/csf-drain.ts:261-447`; `merge-train-solver-and-escalations.md:332-426`). `next` is a read-only view (`bootstrap-loop-and-dispatch.md:24`). No pause, steer or cancel of a running stage found; the orchestrator stops itself under a stop set (`drain/SKILL.md:240-290`) |

  - Qara's own prose gate has the same shape as Noodle's gap, but is labelled. `acts.md` says of the merge standing rule: "no hook checks it against a merge; an expired grant never stops merging" (row "Merge a reviewed qara PR"), and its column "enforced by" reads `prose` for most rows and names a hook or script for the rest.
  - Disagreement to resolve, not resolved here: `delegation-guide.md:70-71` lists `csf-admit --by jm` among acts JM performs himself, while `acts.md` row "Work-order admission / release adjudication for cub and drop-ship" lets the orchestrator do it (AD d62 as amended by d83, 2026-11-16).
  - Not found: the `GO cub#<n> <sha>` merge rule in cub's `factory/`, `CLAUDE.md` or `AGENTS.md` (the GO form is in `delegation-guide.md:195`), and a written owner-only rule for cub's `specs/`. The nearest text is csf-build's README line 22 ("Specs are authored externally with the installed csf-specs and adopted before guarded dispatch; adoption and eligibility never grant human acceptance") and `acts.md` rows "Brief approval" (JM only) and "Specs approval" (orchestrator, with "whether csf-specs can record delegated approval is unverified").
- Basis: Verified (each cited cell); Unverified (the mapping and any claim about simplification)
- Code: n/a (comparison). Gap: none required in Qara or csf by this doctrine.

**NMODE-15. The review screen is a diff plus three buttons, with no confirmation and no mode control.**
A person sees pending reviews in two places and acts through the same three commands.
- Why: this is what "supervised" means in practice. It sets the bar for any Qara or csf equivalent: a reader sees the stat and the diff and decides.
- Evidence:
  - The Reviews page (`ui/src/routes/reviews.tsx` renders `ui/src/components/ReviewList.tsx`). One tab per pending review, labelled by title, task key or order ID (`ReviewList.tsx:195-209`). The centre panel is headed "Quality Review: <session>" with the task key badge and the park reason (`:11-28`) and a "Generated Diff" section. The right panel is "Review Actions" with the skill, model and worktree name (`:77-98`).
  - The diff view (`ui/src/components/DiffViewer.tsx`, 49 lines): a diffstat block above a syntax-highlighted unified diff; states "Loading diff...", "No changes", and the error text. The server runs `git diff base...HEAD` and `--stat` in the worktree, with `--no-ext-diff --no-textconv` (`worktree/diff.go:19-42`). It shows committed changes only, from the merge base. The base is `origin/HEAD`'s branch, else `main` (`diff.go:46-61`), which can differ from the integration branch the merge uses (`worktree/app.go:34-39`). A cleaned worktree returns "worktree no longer available" (`server/server.go:312-315`).
  - Buttons: "Approve & Merge" (sends `merge`), "Request Changes" (first click opens a text input "What needs to change?", second click or Enter sends `request-changes` with the text; empty text is ignored), "Dismiss Order" (sends `reject`, which force-cleans the worktree: NMODE-9) (`ReviewList.tsx:43-146`). No confirmation dialog.
  - The same actions appear as a banner "Ready for review" with MERGE, REJECT, REQUEST CHANGES in the agent feed of a session with a pending review (`ui/src/components/AgentFeed.tsx:153`, `ReviewBanner.tsx:39-95`). The banner sends request-changes even with empty text (`ReviewBanner.tsx:23-27`); the page does not.
  - Not shown: the quality verdict message that caused a blocking park, the plan, the prompt, test output (the item carries `prompt` and `plan` but the screen does not render them), and the loop's mode. The header says "Quality Review" whether or not a quality stage ran. The empty state says "Completed sessions in supervised mode appear here" (`:160`), but conflicts and blocking messages also appear (NMODE-4).
  - The `thinking-in-noodle` page, the FAQ and `docs/concepts/modes.md` say nothing about review; the only user-facing mention of the screen is `docs/getting-started.md:64` ("the reviews page lets you approve or reject work before it merges").
  - Pinned by: `ui/src/components/ReviewList.test.tsx` and `ContextPanel.test.tsx` exist; their bodies were not read.
- Basis: Verified (UI source, server code); Unverified (UI tests)
- Code: `ui/src/components/ReviewList.tsx`, `ReviewBanner.tsx`, `DiffViewer.tsx`, `worktree/diff.go`.

**NMODE-16. Per-skill merge permissions were built and deleted; manual gating was planned and never built.**
Noodle's own history answers the question of whether per-skill or per-stage gating is coming: it was removed on purpose, and the manual-mode gates were promised and not delivered.
- Why: it tells a borrower which parts of the dial are a design and which are a wish. Qara should not model a dial on the manual column.
- Evidence:
  - Design choice, 2026-03: the v2 plan weighed "1. Keep two controls and wire missing behavior. 2. Single global mode with explicit gate semantics. 3. Two modes only + per-skill overrides." and chose 2 "for operator clarity and deterministic gate evaluation" (`brain/archive/plans/82-backend-v2-first-principles/phase-06-unified-mode-and-control-api.md:18-24`). Its verification list still says "auto: full automation with per-skill merge permissions" (`:60`) and "manual: no auto schedule/dispatch/retry, explicit dispatch required" (`:62`), and "UX acceptance: blocked actions include `why` and exact next control command" (`:64`).
  - Per-skill gate removed: "Simplify task type frontmatter — replace `permissions.merge` with runtime worktree detection ... Deleted `NoodleMeta`, `Permissions`, `CanMerge`. Added `HasUnmergedCommits` ... Replaced static `canMergeStage` with runtime `worktreeHasChanges`" (`brain/archive/completed_todos.md:23`, item 89). Also `brain/codebase/runtime-routing-owned-by-orders.md:9`. An earlier plan had added `permissions.merge: false` for `quality` (`brain/archive/plans/75-channel-ui-redesign/phase-09-backend-auto-advance-and-dismiss.md:60`).
  - The V2 rewrite is marked done with "Autonomy replaced with tri-state mode (auto/supervised/manual)" and "Resilience tests pass all acceptance criteria" (`brain/archive/completed_todos.md:29`, item 82), yet the manual gates are absent (NMODE-1) and the resilience test simulates them.
  - State of each item today: per-skill permission, deleted and replaced by a runtime check; manual dispatch action, planned and not built; schedule and dispatch gates, built as functions and not wired; epoch cancellation, built as helpers and not wired; UI mode setting, open (`brain/todos.md:37`, item 100, tag `#needs_plan`).
- Basis: Verified
- Code: Gap: see NMODE-1 and NMODE-2.

**NMODE-17. Noodle's stated stance is "supervise after the fact"; the default mode contradicts it.**
The principle says agents should not block on the human and design for review-after-the-fact; the default mode requires approval before the fact for every merge.
- Why: it explains why the mode feature is thin. The project's own principle favours auto, and `supervised` was made the default late (changelog) as a safety choice.
- Evidence: `brain/principles/never-block-on-the-human.md`: "The human supervises asynchronously. Agents must stay unblocked — make reasonable decisions, proceed, and let the human course-correct after the fact"; "Design workflows for review-after-the-fact, not approval-before-the-fact"; boundaries: irreversible actions (force-push, delete production data, send external messages) still require confirmation, and "The human can always interrupt". The cookbook pins `mode = "auto"` "on purpose for an unattended demo" (`docs/cookbook/minimal-noodle-loop.md:32`). The docs call the mode "a trust dial" you move "as trust builds" (`docs/concepts/modes.md:47-49`). Judgement (Unverified): "the human can always interrupt" is the control channel (NMODE-5); "irreversible actions require confirmation" is not backed by code, because reject and request-changes force-clean worktrees and `auto` merges to the integration branch without a check (NMODE-9, NMODE-10).
- Basis: Verified (quotes); Unverified (the judgement)
- Code: n/a.

**NMODE-18. Qara already keeps the records a dial would add: an act register, an authority ledger and a mode-change log.**
- Why: it removes the first borrow the first pass proposed (a posture log with the real actor) and shows where Qara is ahead.
- Evidence:
  - `acts.md`: columns act, who, enforced by (prose, hook, script, ledger), source (ruling and date). One line states "JM-only closed set and approval procedures" live in `address-all-in-subs/SKILL.md` § 1 (`.claude/context/acts.md:3`).
  - Authority ledger: only the native prompt hook appends to `authority.jsonl`; each row has `ts, session, cwd, repo, kind, text (at most 200 chars), act, ttlHours, exclusions`, and `revoke` rows end earlier grants (`.claude/hooks/lib/authority-ledger.ts:50-76,170-185`; `decisions/2026-11-06-authority-ledger.md:13-17`). The CLI is read-only: `authority.ts status` only (`.claude/scripts/authority.ts`, 14 lines). The decision admits "event fields are not cryptographic proof of a person" (`:27`).
  - Mode log: `logModeEvent` appends `{timestamp, event, ...fields}` (activated, deactivated, reactivated) to `mode-changes.jsonl` (`.claude/hooks/lib/state/mode-state-store.ts:84-96`; deactivation logging `.claude/hooks/lib/mode/mode-state-lifecycle.ts:212`). It records the session, not a person, and a write failure is swallowed ("Fail-open — never block on logging", `:93-95`).
  - So the actor is recorded, as a session and a typed human turn, not a hard-coded string. Where Qara is weaker than a ledger: `acts.md` says a merge needs no live grant and "no hook checks it against a merge", so `stop merging` is a prose stop for the orchestrator.
  - Worktree and merge hooks exist in code: shared-tree git scoping, force-push read, a `gh pr merge` cleanup that must be `&&`-chained (`merge_cleanup.rs`), the worktree loss guard (`.claude/context/hooks-guide.md:125,129`); the mode gates apply only while cruise or drive is active (`.claude/hooks/pre-tool-use-mode-gates.ts:1-30`).
- Basis: Verified
- Code: `.claude/hooks/lib/authority-ledger.ts`, `.claude/hooks/lib/state/mode-state-store.ts`, `.claude/context/acts.md`. Gap: none.

**NMODE-19. The actor on a posture change is hard-coded in Noodle, self-declared in csf, and hook-captured in Qara.**
- Why: "who raised the dial" is only as good as how the actor is established. It decides whether a log is evidence.
- Evidence:
  - Noodle: `requested_by` is the literal `"control"` (`loop/control_orders.go:20-23`); the control channel has no identity (NMODE-12).
  - csf: owner-ruled verbs require `--by jm` (`assertOwnerActor`, `drain-owner-guards.ts:22-31`), but the marker is typed text. `close-landed` "takes any non-empty `--by`, so the actor value is the caller's honesty" (`merge-train-solver-and-escalations.md:400-401`), and `csf-admit --by` is "stored verbatim" (`csf-admit.ts:10-12`). Drain events carry `by` and, for an orchestrator unpark, the verbatim ruling and date (`drain-event-types.ts:115-167`), in the drain ledger.
  - Qara: the human turn is captured by a hook, not typed by an agent; agents "never type, renew or extend the grant" (`acts.md` row "Merge a reviewed qara PR"). Residual: same-user event replay is not authenticated (`decisions/2026-11-06-authority-ledger.md:27`).
- Basis: Verified
- Code: Gap in csf: `close-landed` accepts any actor (see Open 2).

## Reference

### How a finished stage flows (Noodle)
1. A cook runs in `.worktrees/<name>`. Its session ends `completed`; `handleCompletion` runs (`loop/cook_completion.go:116`).
2. A schedule stage is handled and its order removed. Any other stage with a blocking `stage_message` is parked (NMODE-4).
3. `worktreeHasChanges` is false (no committed, unmerged patch and no pushed branch): the stage completes with no merge and no review (NMODE-10).
4. Changes and mode `auto`: `stage_completed`, merge queue, rebase, merge, cleanup, `merge_completed`.
5. Changes and mode `supervised` or `manual`: write `pending-review.json` with reason "supervised mode requires merge approval" or "manual mode requires merge approval" (`internal/mode/gate.go:49-54`).
6. A person sends `merge`, `reject` or `request-changes` (NMODE-3, NMODE-15). Reject and request-changes discard the worktree and hand the reason to the scheduler agent.
7. A merge conflict at any merge parks with the conflict text (NMODE-8).

### Files on disk (under the runtime directory `.noodle/` unless noted)
| File | Role |
| --- | --- |
| `state.snapshot.json` | canonical state: orders, pending reviews, `mode`, `mode_epoch`, `mode_transitions`, effect ledger; loaded on start, written after each event |
| `pending-review.json` | `{"items":[PendingReviewItem...]}`, projection of canonical state |
| `status.json` | loop state, active orders, `mode` (from canonical), max concurrency, warnings |
| `control.ndjson` | commands in, truncated after each pass |
| `control-ack.ndjson` | one ack per command; source of dedup IDs |
| `control.lock`, `last-applied-seq` | file lock and sequence watermark |
| `noodle.lock` | held while the loop runs; `noodle reset` refuses when it is held |
| `sessions/<id>/spawn.json` | runtime sync result (branch, type) used for remote merge |
| `<project>/.worktrees/<name>` | linked worktrees; `.worktrees/.merge-lock` is the merge lock |

### CLI (`docs/reference/cli.md:75-146`, `cmd_worktree.go`)
`noodle worktree create <name> [--from <ref>]`, `exec <name> <cmd...>`, `merge <name> [--into <branch>]`, `cleanup <name> [--force]`, `list`, `prune`, `hook`. No CLI verb exists for pause, merge approval, mode change or steer. Those go through the HTTP/WebSocket API or an append to `control.ndjson`. The CLI top-level commands in the docs are `start`, `status`, `skills`, `schema`, `worktree`, `event`, `reset`.

### Config
`mode = "supervised"` in `.noodle.toml` (`docs/reference/configuration.md:20-30`). Valid values: `auto`, `supervised`, `manual`. Used only when no `state.snapshot.json` exists (NMODE-2).

### Qara and csf worktree homes (for NMODE-7 comparison)
| Home | Made by | Used for | Evidence |
| --- | --- | --- | --- |
| `<repo>/.claude/worktrees/<name>` | Claude Code's `isolation: "worktree"` | CC sub-agents; closed out by `scripts/closeout/remove-finished-worktree.ts` (refuses anything outside this directory) | `scripts/closeout/remove-finished-worktree.ts:17,119-126`; `.claude/hooks/lib/rtk-worktree-guard.sh:5-9` |
| `~/.herdr/worktrees/<repo>/<pi-run-id>` | bsvc, when it starts a pi Run ("bsvc starts the Run in its own worktree") | pi Runs; torn down with `bsvc runs cleanup <id>`; never removed by hand | `pi-subagents.md:84,312-317`; paths in `WIP.md:50,62-65` and `scripts/pi-lane-status.test.ts:169`; no Qara script creates it (the creating code is in the `bsvc` package, not read) |
| `~/.cub-wt/<name>` | by hand or by an orchestrator for cub work-order branches | cub; removed after merge | named in cub `plans/archive/2026-11/drain--autonomous-end-to-end-v1.md:182` and research logs; no written rule found |
| `~/.csf/runs`, or the profile's `checkoutsRoot` | `csf-run lane open` | csf drain lanes, reset and reused until `retire` | `drain/SKILL.md:143-144,233-238` |

### The Qara landing ladder, as the nearest analogue to Noodle's merge gate
Rows 0a to 6 of `git-update-repo.md:104-114`: envelope check, pre-review check, blind review at the exact head, review budget (8 counted rounds), fourth check (state CLEAN, file set, gates), combined-tree typecheck and focused tests, merge with `--match-head-commit`, branch delete by proof. Compare Noodle: lock, clean root, rebase, merge (NMODE-7).

### Embedded agent instructions found
None executed. Material to study, and one set worth flagging:
- `INSTALL.md` is written for an installing agent. It tells it to fetch and write files from `raw.githubusercontent.com/poteto/noodle/main/...` (the `noodle` skill and four adapter scripts that it then makes executable with `chmod +x`), unpinned and from a moving branch; to "Read the conversation history in `~/.claude/` and `~/.codex/` for this project" before writing skills; to run `brew install poteto/tap/noodle` on macOS or download a release binary elsewhere; and to ask the user which provider to use. It generates `mode = "supervised"`. Reading private conversation history and running unpinned remote scripts are the risky parts.
- The `quality`, `schedule` and `review` skills say "Operate fully autonomously. Never ask the user" or "Do not use AskUserQuestion" in autonomous sessions. The principle `never-block-on-the-human` says "Proceed, then present" and keeps irreversible actions behind confirmation (NMODE-17).
- `.agents/skills/execute/references/team-execution.md:8` spawns teammates with `mode: "bypassPermissions"`.
- Noodle's own `.claude/settings.json` registers a Bash `PreToolUse` hook that runs `$CLAUDE_PROJECT_DIR/bin/noodle worktree hook` and a `block-sleep.sh`, and a `SessionStart` hook `inject-brain.sh`. The shell scripts were not read.
- Noodle behaviours worth knowing: `worktree create` edits `.gitignore` and installs dependencies (`worktree/commands.go:21-30`); agents launch with permission bypass (NMODE-11).
These are studied, not followed.

## Borrow list
Fewer rows than the first pass: the new reading undermines four of the five. Dropped, with reasons, below the table.

| Rank | What | Target | Size | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | A check that every `hook:` and `script:` path named in the "enforced by" column of `acts.md` exists, so a stated gate cannot name code that is gone or never existed. This is Noodle's gap (NMODE-1) turned into a test | Qara: new `scripts/check-acts-enforcers.ts` (about 60 lines: read `.claude/context/acts.md`, extract the backticked `hook:` and `script:` paths from the third column, fail on a missing file) plus one entry in the `check:*` list in `package.json`; the existing `scripts/check-rule-owners.ts` already guards pointers to `acts.md` and is the model | small | low (read-only check) | Open 1; first confirm no existing check does it (`scripts/orch-state.ts` references `acts.md` and was not read) |
| 2 | Name the real actor on csf's owner verbs: apply the `assertOwnerActor` allowlist (`jm`, plus `orchestrator` where a recorded ruling exists) to `close-landed`, which today takes any non-empty `--by` | csf-build: `src/recovery/csf-drain-close-landed.ts` and `src/drain/drain-recorder/drain-owner-guards.ts` (add the call and a test; the doc line at `merge-train-solver-and-escalations.md:400-401` would change) | small | medium (csf is live; needs a csf-build PR and the drain fence in `delegation-guide.md:199`) | Open 2. This is a csf finding made by comparing actors (NMODE-19), not something borrowed from Noodle |

**Dropped from the first pass.**
- A posture log with the real actor in Qara's authority CLI: Qara already has an append-only ledger and a mode-change log (NMODE-18); the CLI is read-only by design.
- A dial table as a reading aid: `acts.md` is that table, with an enforcement column (NMODE-14, NMODE-18).
- A held-items list in csf: csf has `escalations`, `status --json` and the `held` action (NMODE-14).
- A control-command ack file in Qara's pi machinery: pi has inspect, cancel, adjudicate, a steer protocol and a sequence-numbered turn ledger; `--after-seq` acks the effect, which is stronger than Noodle's receipt-style ack (NMODE-5, NMODE-14). pi has no pause verb found; that is a possible gap, not a borrow.
- A conflict-parks-in-every-mode cross-reference in `git-update-repo.md`: the file already stops on conflict (`:131-133`), and csf resolves by solver.

**Not to borrow.**
- The mode gate matrix as written. It advertises schedule and dispatch gates that do not exist (NMODE-1).
- Permission-bypass launch with a narrow Bash-only hook as the safety layer (NMODE-11). Qara's guards are broader.
- The unauthenticated localhost control endpoint (NMODE-12).
- Rebase-then-merge with stash and pop in one working tree. Qara's PR-based, exact-head, merge-commit landing is stronger and already owner-approved.
- Force-cleaning the worktree on reject (NMODE-9). Qara and csf keep unmerged work (`pi-subagents.md:312-317`).
- A single global dial. It cannot carry Qara's per-repo and per-act exclusions, and Noodle itself deleted the per-skill override it would need (NMODE-16).
- "Has changes" as committed patches only (NMODE-10); Qara's close-out already checks dirty and unmerged state.

## Open
Ask one at a time, recommendation first.
1. Should Qara get the `acts.md` enforcer-liveness check (Borrow 1)? Recommend yes: small, read-only, and it is the one lesson from Noodle that Qara does not already have. Confirm first that no existing check covers it.
2. Should csf's `close-landed` (and any verb that takes a free `--by`) check the actor against the owner marker and the recorded-ruling form, as `unpark` does? Recommend yes, through a csf-build PR; the doc already admits the actor is "the caller's honesty".
3. Which text stands for who may run `csf-admit`: `delegation-guide.md:70-71` (JM's act, typed 2026-11-09) or the `acts.md` row letting the orchestrator admit for cub and drop-ship (AD d62 as amended by d83, 2026-11-16)? Recommend the later `acts.md` row and a one-line edit to the delegation guide, but this is an owner ruling.
4. Is a named three-level label wanted at all? Recommend no: the dial adds no gate Qara or csf lack, and `acts.md` already shows which gates are code. Close this with the doctrine rather than build anything.
5. Does JM want a diff-review screen for his own acceptance and merge decisions (NMODE-15), or do blind reviewers and acceptance sittings stay the only review? Recommend no screen: Qara's review is by blind agents on the exact head and JM's sittings are on merged work. Revisit only if JM starts reviewing diffs himself.
6. Should `stop merging` become a code gate, given `acts.md` says "no hook checks it against a merge"? Recommend decide after Borrow 1 shows how many other rows are prose; do not build a gate for one row.

Answered and moved into doctrines: whether a runtime-changed mode survives a restart (NMODE-2); whether dispatch enforces a linked checkout (NMODE-11); what "has changes" counts (NMODE-10); whether Qara already keeps a posture log or pi has acks (NMODE-18, NMODE-14); whether per-skill gating was planned (NMODE-16); whether a conflict or blocking review should auto-resolve in an owner repo (Noodle never auto-resolves, NMODE-8; csf resolves pick-conflicts by solver; Qara stops and reports: no change recommended).

**Facts still unknown (need a run).**
- What happens to a worktree whose only changes are uncommitted: removed, left on disk, or reused by the next stage (NMODE-10).
- Whether "Approve & Merge" on a conflict-parked order re-parks or fails the order (NMODE-4).
- Whether the server's `/api/config`-style endpoint shows the startup mode after a runtime change (needs the running server; NMODE-2).
- Whether the UI tests (`ReviewList.test.tsx`, `ContextPanel.test.tsx`) pin the buttons.
- Whether `bsvc` (not read) offers a pause or an ack for steer beyond the turn ledger, and what creates `~/.herdr/worktrees`.
- The text of cub's owner-only `specs/` rule and of any `GO cub#<n> <sha>` rule in cub; neither was found in the files read.
- Whether a Qara check already verifies the paths named in `acts.md` (`scripts/orch-state.ts` not read).

## Sources
- Noodle at `82d2921c52370f23f29086de81ccfb600939c037`: `docs/concepts/{modes,scheduling}.md`, `docs/reference/{cli,configuration,faq}.md`, `docs/thinking-in-noodle.md`, `docs/getting-started.md`, `docs/cookbook/minimal-noodle-loop.md`, `CHANGELOG.md`, `INSTALL.md`, `CLAUDE.md`, `internal/mode/{gate,mode}.go`, `internal/reducer/reducer.go`, `internal/state/state.go`, `internal/orderx/types.go`, `internal/schemadoc/specs.go`, `config/{parse,types_defaults}.go`, `skill/frontmatter.go`, `loop/{control,control_orders,control_review,control_scheduler,cook_completion,cook_merge,cook_failure,cook_spawn,cook_steer,canonical_checkpoint,pending_review,loop,loop_cycle_pipeline,stamp_status,state_orders,merge_cycle}.go`, `worktree/{app,commands,commands_merge,commands_cleanup,lock,hook,enforcement,merge_conflict,diff}.go`, `dispatcher/{command,process_dispatcher,preamble}.go`, `server/{server,ws_hub}.go`, `cmd_reset.go`, `cmd_worktree.go`, `ui/src/components/{ReviewList,ReviewBanner,DiffViewer,AgentFeed,SchedulerFeed}.tsx`, `.claude/settings.json`, `.agents/skills/{quality,review,adversarial-review,schedule}/SKILL.md`, `brain/{architecture,todos}.md`, `brain/principles/never-block-on-the-human.md`, `brain/archive/plans/82-backend-v2-first-principles/phase-06-unified-mode-and-control-api.md`, `brain/archive/completed_todos.md`, `brain/codebase/runtime-routing-owned-by-orders.md`. Tests read: `internal/mode/mode_test.go`, `internal/integration/resilience_test.go`, `internal/reducer/reducer_test.go`, `loop/{control,pending_review,loop_merge_reconcile,canonical_checkpoint}_test.go`, `worktree/{enforcement,hook,diff,worktree}_test.go`.
- Qara: `$HOME/qara/.claude/skills/core/workflows/{git-update-repo,merge-conflict-resolution,publication-checklist}.md`, `.claude/context/{delegation-guide,acts,hooks-guide}.md`, `.claude/hooks/lib/authority-ledger.ts`, `.claude/hooks/lib/state/mode-state-store.ts`, `.claude/hooks/lib/mode/mode-state-lifecycle.ts`, `.claude/hooks/pre-tool-use-mode-gates.ts`, `.claude/scripts/authority.ts`, `.claude/skills/pi/SKILL.md`, `.claude/skills/pi/references/pi-subagents.md`, `decisions/2026-11-06-authority-ledger.md`, `decisions/2026-11-02-standing-maintenance-and-publication-authority.md`, `scripts/closeout/remove-finished-worktree.ts`, `WIP.md`.
- csf-build (read only): `/media/ssdev/tg-pro/cub/node_modules/csf-build/{README.md,skills/orchestration/drain/{SKILL,bootstrap-loop-and-dispatch,merge-train-solver-and-escalations}.md,src/drain/csf-drain.ts,src/drain/drain-vocabulary/{node-state,drain-types,drain-event-types,drain-action-types}.ts,src/drain/drain-recorder/drain-owner-guards.ts,src/drain/drain-start/drain-approval-override.ts,src/admission/{csf-admit,csf-admission,admission-record}.ts}`.
- cub (read only): `CLAUDE.md`, `AGENTS.md`, `.githooks/pre-commit`, `decisions/2026-10-03-spec-loop-moves-to-csf-brief.md`, `plans/archive/2026-11/drain--autonomous-end-to-end-v1.md`. No `.env*` file was opened.
- Sibling documents: NSCHED, NSKILL, NADAPT, NVIEW.
