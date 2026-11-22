# NADAPT: Noodle's adapters, events and runtimes, and what Qara and csf should take

**Track:** noodle · **Type:** research · **Date:** 2026-11-23

**Question:** how do Noodle's adapters (backlog sync), events (loop, session and live-message channels) and runtimes (process, Sprites, session capture) work and how sound are they; how do they compare with Qara's pi/bsvc/herdr/hooks machinery, csf-build's stage dispatch, the tobogan `board/` track and its `csf-board` server, and the `inference/sweep/` harness; and what is worth borrowing?

**Scope.** Noodle v0.1.5: `adapter/`, `adapters/`, `defaults/adapters/`, `docs/concepts/adapters.md`; `event/`, `cmd_event.go`, `docs/concepts/events.md`; `runtime/`, `dispatcher/` (where launching really lives), `parse/`, `stamp/`, `docs/concepts/runtimes.md`. Skills, scheduling, brain, modes, review/worktrees and the CLI/UI are other documents (NSKILL, NSCHED, NBRAIN, NMODE, NVIEW) and are touched only where they meet this one.

**Sources.**
- Noodle `poteto/noodle` at commit `82d2921c52370f23f29086de81ccfb600939c037` (last pushed 2026-03-19), read-only clone. Paths without a prefix are relative to the Noodle repo root. Nothing in it was built, run or tested.
- Published concept pages for adapters, events and runtimes at poteto.github.io/noodle, fetched 2026-11-23 (see NADAPT-18).
- Qara at `$HOME/qara`; csf-build as installed in `/media/ssdev/tg-pro/cub/node_modules/csf-build` (read only, nothing run there); tobogan `board/`, the `csf-board` repo at `/media/ssdev/tg-pro/csf-board` (read only), and `inference/sweep/`. All read 2026-11-23. No `bsvc`, `pi`, `herdr` or model call was made.
- brainmaxxing (`ec4d8e43...`) is not part of this feature and was not read.

**Basis rules.** "Verified" means read in source at the SHA above or in the named Qara, csf, board or sweep file, or read on a fetched page. "Verified (paraphrase)" marks a claim from the fetch tool's summary of a page. Every judgement about fit for Qara or csf, and every analogy, is "Unverified". Nothing is "Tested": we ran nothing. A "test pins it" statement means a test body or name was read; it does not mean we ran the test.

## Doctrines

**NADAPT-1. Treat Noodle's adapter contract as two live shell commands (`sync`, `done`) and two documented-but-unused ones (`add`, `edit`).**
An adapter is a name plus a map of action to shell command in `.noodle.toml`. The loop calls `sync` (inside every mise build) and `done` (when an order's last stage finishes). `add` and `edit` have default scripts and a test but nothing in the loop or CLI calls them.
- Why: an integration planned around `add`/`edit` would rest on code that does not run.
- Evidence: `config/types_defaults.go:26-29` (`AdapterConfig{Skill, Scripts}`), `:200-212` (default `backlog` adapter, four scripts). The only non-test call sites of `adapter.Runner` are `mise/builder.go:48` (`SyncBacklog`) and `loop/cook_completion.go:345` (`Run(..., "backlog", "done", ...)`). `docs/concepts/adapters.md` marks `add`/`edit` "planned"; the published page says the same (NADAPT-18). The `schedule` skill tells agents to run `noodle adapter run backlog add` (`.agents/skills/schedule/SKILL.md:39`), but the root has no adapter command (`cmd_*.go` files: event, reset, schema, skills, start, status, version, worktree) and a search of non-test Go for `"adapter"` finds only config diagnostics (`main.go:155`, `config/diagnostics.go`): the skill names a command that does not exist at this SHA.
- Test that pins it: `defaults_adapters_test.go` `TestDefaultBacklogAddDoneEditRoundTrip` runs the shipped `add`/`edit`/`done` scripts directly, never through the loop. No test asserts the loop does not call `add`/`edit`.
- Basis: Verified
- Code: Gap in Noodle: no `add`/`edit` caller, no `adapter run` command.

**NADAPT-2. Read `sync` as "dump the whole backlog as NDJSON, every cycle", with per-line validation that warns and never aborts.**
`sync` takes no input and prints one JSON object per line. Only `id` and `title` are required (non-empty after trimming). `status` (`done` is dropped) and `plan` are the only other keys Noodle reads; every other key is kept in `Extra` and passed to `mise.json`. A bad line (invalid JSON, missing id or title, a line over 1 MiB) is skipped and becomes a warning string, shown in the UI, the log and an `ADAPTER WARNINGS` section of the scheduler prompt. A non-zero exit is the only fatal case.
- Why: the best-copied idea in the adapter layer: one bad record never blocks the rest, and the warning reaches the agent that can repair it. The cost is a full re-pull on every mise build, so a slow tracker slows the loop.
- Evidence: `adapter/types.go:17-51` (`BacklogItem`, `UnmarshalJSON` separating known from extra keys), `adapter/sync.go:11` (1 MiB cap), `:13-46` (`ParseBacklogItems`), `:48-56` (`validateBacklogItem`), `mise/builder.go:44-56,133-` (warnings appended; `filterActiveBacklog` drops `done`), `adapter/types.go:5-10` (well-known statuses `open`, `in_progress`, `done`, "not exhaustive"), `brain/codebase/backlog-sync-parse-errors-are-recoverable-warnings.md`. Warning text in code is `parse backlog sync line N: ...` and `backlog sync line N: missing required field id|title` (`adapter/sync.go:34,52,55`); the docs page's examples (`backlog sync line 3: invalid JSON: ...`) differ in wording.
- Tests that pin it: `adapter/runner_test.go` `TestParseBacklogItemsValidation` (missing id gives a warning, no error), `TestParseBacklogItemsSkipsInvalidJSON` (3 lines, 2 items, 1 warning naming line 2); `adapter/fixture_test.go` over `adapter/testdata/{backlog-sync,backlog-with-plan,backlog-missing-id}`. No test covers the 1 MiB line cap or the pass-through `Extra` round trip by name (not found in the `Test*` list).
- Basis: Verified
- Code: `adapter/sync.go`, `adapter/types.go`, `mise/builder.go`.

**NADAPT-3. Know that task-to-item mapping is "order id equals item id", and that `done` carries no claim, lease or idempotency, and nothing ever sets `in_progress`.**
The scheduler turns a backlog item into an order whose id is the item id. When the last stage of a non-failing order completes, the loop runs `done <order-id>`. A "standalone" order with an id that matches no item calls `done` anyway; the script must do nothing. Until `done` runs the item stays `open` in the tracker, so the only guard against double work is Noodle's own `orders.json` and tickets.
- Why: this decides how a board adapter must be built (NADAPT-5).
- Evidence: `loop/cook_completion.go:344-349` (done on the final stage; error returned unless `isMissingAdapter`), `loop/util.go:105-111` (`isMissingAdapter` = lowercased error contains "not configured" or "no such file"), `.agents/skills/schedule/SKILL.md:37-47`, `defaults/adapters/backlog-done` (`sed "s/^$id\. \[ \]/$id. [x]/"`: re-running is harmless; an id with `/` or regex characters would break the expression). `BacklogStatusInProgress` appears only in `adapter/types.go:8` (search of non-test Go).
- Tests: none found for the `done` call in `loop/` (a search of `loop/*_test.go` for adapter `done` handling found only the files that mock `Dependencies.Adapter`; I did not read each body). `isMissingAdapter` has no test by name.
- Basis: Verified (mechanism); the shared-tracker consequence is Unverified, reasoned from the code.
- Code: `loop/cook_completion.go`, `defaults/adapters/backlog-done`.

**NADAPT-4. Treat the adapter runner as a trusted shell wrapper with no timeout, no environment control and one hard-coded adapter name.**
`Runner.Run` runs `sh -c "<command> <quoted args>"` in the project root with optional stdin, capturing stdout and stderr; failure returns stderr in the error. The only bound is the caller's context. `SyncBacklog` and the `done` call hard-code the name `backlog`, so another configured adapter is validated but never called.
- Why: a Qara or csf design must not assume the "named adapters" the config shape suggests, and must add its own timeout and credential scoping if it ever shells out like this.
- Evidence: `adapter/runner.go:31-85` (`Run`; `exec.CommandContext(ctx, "sh", "-c", ...)` at `:55`, `cmd.Dir`), `:85-90` (`SyncBacklog` calls `Run(ctx, "backlog", "sync", ...)`), `:93-104` (`commandWithArgs`: each argument quoted with `shellx.Quote`, the command string is not), `config/diagnostics.go:79-135` (only checks a skill and non-empty scripts exist).
- Tests: `adapter/runner_test.go` `TestRunnerRunSuccessWithArgs`, `TestRunnerRunCapturesStderrOnError`. None for timeout (none exists) or a second adapter name.
- Basis: Verified
- Code: `adapter/runner.go`. Gap in Noodle: timeout, named-adapter dispatch.

**NADAPT-5. Do not run Noodle against the csf board: the board's claim and lease model cannot be carried by Noodle's two live adapter commands.**
`sync` can list board tasks and `done` can complete one, but a board completion needs the claim's epoch and token (`settleTask` runs `fenced(root, body, now)`), and `done` receives only the item id. To make it work the adapter would have to claim a task during `sync` (a read with a side effect, whose lease Noodle never renews) and keep the token in a side file. A lapsed lease under the board's `hold` policy for csf drain tasks then blocks the task while Noodle's order is still running. The full operation-by-operation mapping is in the Reference ("Noodle against the csf board").
- Why: BOARD-5 and BOARD-18 exist to stop a second runner from working a task beside a live claim. An adapter that claims inside `sync` reintroduces the race the fence removes, and Noodle's `in_progress` is never written back.
- Evidence: Noodle side NADAPT-2, NADAPT-3. Board side: `/media/ssdev/tg-pro/csf-board/src/board.ts:972-978` (`fenced`: same epoch, token match, lease not run out, else `claim_lost`), `:1349-1375` (`settleTask` release/complete/fail all call `fenced`), `:1280-1335` (`claimTask`, `claimNext`), `:1337-1347` (`renewTask`), `:34-36,42-43` (lease 30 to 3600 s, default 900, `lease_expired` hold), `:51-55` (the 22 feed event types, `actor.seen` and `task.renewed` hidden), `board/vercel-board.md` BOARD-5, BOARD-8, BOARD-16, BOARD-18.
- Basis: Verified for each side; the conclusion that the join fails is Unverified (nobody built it).
- Code: Gap: nothing built, and this document recommends not building it (Open 1).

**NADAPT-6. Distinguish Noodle's event channels: three stores and one live message path.**
(1) The loop event log `.noodle/loop-events.ndjson`: lifecycle records the loop writes and any caller may append; advisory context for the scheduler. (2) Per-session logs `.noodle/sessions/<id>/events.ndjson`: normalised agent activity plus agent-to-loop messages (`stage_message`, `stage_yield`, tickets). (3) An internal ingest arbiter of canonical state events (four sources, 16 types, deterministic ids, per-source idempotency) feeding the reducers, not described in the docs. (4) Not a store: `forwardToScheduler` writes a one-line message into the scheduler session's stdin through its controller when the scheduler is steerable, and drops it otherwise (10 s timeout).
- Why: `events.md` documents only (1) and a corner of (2). "Noodle's event model" is four unrelated designs.
- Evidence: `event/loop_event.go:16-39` (14 `LoopEventType`s, `LoopEvent{Seq,Type,At,Payload}`), `event/types.go:11-44` (13 session types, `Event{Type,Payload,Timestamp,SessionID}`), `event/paths.go:1-15`, `internal/ingest/types.go:14-61`, `loop/cook_completion.go:354-395` (`forwardToScheduler`, `controller.Steerable()`, 10 s timeout, message text `[type] owner=... order=... stage=N task=...: details`). `docs/concepts/events.md` lists 8 loop types; code defines 14.
- Basis: Verified
- Code: `event/`, `internal/ingest/`, `loop/cook_completion.go`.

**NADAPT-7. Copy the "events are context, not triggers" rule and the watermark digest only if a feed to digest exists; csf-board already has the cursor version.**
External callers run `noodle event emit <type> [--payload <json>]` (any string type, any valid JSON). On the next mise build the scheduler receives `recent_events`: events after the highest-`seq` `schedule.completed` record, capped at the last 50, each with a derived summary. There is no trigger matching: the schedule skill's prose decides how to react.
- Why: cheap and self-limiting (the watermark shows each event about once; the cap bounds the prompt). But `csf-board`'s `GET /events?after=<cursor>` plus `wait` gives the same "since I last looked" read with a durable cursor and no truncation (BOARD-8), so there is nothing to port for csf.
- Evidence: `cmd_event.go:26-80`, `mise/builder.go:163-226` (`maxRecentEvents = 50` at `:163`; `readRecentEvents` skips bad lines, returns empty on open error, watermark = last `schedule.completed`), `event/loop_event.go:41` (`maxLoopEventLines = 200`), `docs/concepts/events.md` ("no mechanical trigger matching"), `board/vercel-board.md` BOARD-8.
- Tests: `mise/builder_test.go` `TestReadRecentEventsWatermark`, `...EmptyFile`, `...MissingFile`, `...MalformedLines`, `...Cap`, `...Summary` (and two owner-prefix summary tests); `cmd_event_test.go` `TestEventEmit_WritesNDJSON`, `_NoPayload`, `_InvalidPayload`, `_EmptyTypeRejected`.
- Basis: Verified (mechanism); fit is Unverified.
- Code: `mise/builder.go`, `event/loop_event.go`.

**NADAPT-8. Do not copy the loop-event writer: seq is per-process, truncation is not atomic, nothing is synced, and a corrupt session line reads as no events.**
The exact lines that lead there:
- *In-memory `seq`.* `LoopEventWriter` keeps `seq` in a struct field (`event/loop_event.go:45-50`), reads the file's highest `seq` only in `NewLoopEventWriter` (`:55-62`, `readHighestSeq` `:125-147`), and increments under a `sync.Mutex` that exists per writer (`:68-71`). `noodle event emit` builds a new writer per invocation (`cmd_event.go:70`), so its mutex is not the loop's. Two processes can read the same highest `seq` and both write `seq+1`.
- *Non-atomic truncation.* After each append `Emit` calls `w.truncate()` (`:113`), which opens the file, reads every line, and if over 200 lines rewrites it with `os.WriteFile(w.path, ...)` (`:150-177`, rewrite at `:176`), a truncate-then-write, not temp-and-rename. An append by another process between the read (`:156-164`) and the write (`:176`) is lost. Contrast `event/tickets.go`, which uses `writeTicketsAtomic` (via `internal/filex`).
- *No fsync.* The append is `OpenFile(O_APPEND|O_CREATE|O_WRONLY)`, `f.Write`, `f.Close` (`:96-111`) with no `Sync`; the session writer is the same (`event/writer.go:73-79`).
- *Corrupt line as no events.* `EventReader.ReadSession` returns `parse event line N` on one bad line (`event/reader.go:75-77`); `readStageYield` and `readStageMessage` return nil on `err != nil || len(events) == 0` (`loop/cook_completion.go:430-463`); `handleStageFailure` then falls through to failing the stage (`:233-250`).
- *Ignored write errors.* Loop events are emitted as `_ = l.events.Emit(...)` (for example `loop/cook_completion.go:301,310`).
A single short `O_APPEND` write is atomic on Linux in practice, which is why the ordinary case works.
- Why: events carry scheduling context and, for session events, the stage-completion signal (NADAPT-9). The docs promise nothing stronger than "append"; none is implemented.
- Tests: `event/loop_event_test.go` `TestLoopEventWriter_ConcurrentSafe` (10 goroutines, one writer: unique seqs; proves the mutex, not cross-process safety), `_MonotonicSequences`, `_Truncation` (250 emits, 200 remain), `_ContinuesSeqFromExistingFile`, `_WriteFailureLogs`; `cmd_event_test.go` `TestEventEmit_MonotonicSequences` (sequential invocations, not concurrent); `event/writer_reader_test.go` (round trip, filter, tail, missing log, wrong session). No test starts two writers or processes on one file, none truncates during an append, none feeds a corrupt line to a stage read.
- Basis: Verified for the code lines and test coverage; the lost-event and duplicate-seq outcomes are Unverified inference: we did not provoke either.
- Code: Gap in Noodle: cross-process `seq`, atomic truncate, durable append.

**NADAPT-9. The agent-declared `stage_yield` outranking the exit code is Noodle's best runtime idea, but csf already has the same shape, and no test exercises Noodle's version.**
Agents run `noodle event emit --session $NOODLE_SESSION_ID stage_yield --payload '{"message": "..."}'` when the deliverable is done. If the process then exits badly, `handleStageFailure` reads the latest `stage_yield` and completes the stage. `stage_message` does the opposite: `blocking` defaults to true and parks the order for review; `blocking:false` forwards text to the scheduler and lets the order advance. Ticket events (`ticket_claim` and four more) materialise into `tickets.json` as advisory claims by target.
- Why: it decouples "the work exists" from "the process ended cleanly". csf's stage runner decides completion in a priority order starting with "the Run checkout's HEAD moved off the base sha" (NADAPT-17), which is the same decoupling, evidenced by a commit instead of a message.
- Evidence: `event/types.go:24-66`, `loop/cook_completion.go:168-181` (blocking message parks via `parkPendingReview`), `:229-239` (yield overrides non-clean exit), `dispatcher/process_dispatcher.go:173` (`NOODLE_SESSION_ID`), `.agents/skills/{execute,plan,quality,skill-creator}/SKILL.md` (the emit instructions), `event/tickets.go:35-80`.
- Tests: tickets are pinned by `event/tickets_test.go` `TestTicketMaterializerLifecycle` and `event/fixture_test.go` over `event/testdata/*` (duplicate claims, equal timestamps, release by previous claimant, inactive sessions). A search of every `_test.go` for "yield" and for `stage_message` finds no match: neither `stage_yield` nor `stage_message` handling is tested.
- Basis: Verified
- Code: `event/types.go`, `loop/cook_completion.go`, `event/tickets.go`. Gap in Noodle: tests for yield and message.

**NADAPT-10. Read "runtime" as a thin seam over `dispatcher/`: process is real, Sprites is real but optional, Cursor is configured but not wired, tmux is gone, and the custom command template is fed by no config key.**
`runtime.Runtime` has `Dispatch`, `Terminate`, `ForceKill`, `Recover`. `DispatcherRuntime` adds a per-runtime concurrency cap. `DispatcherFactory` routes by the request's runtime name and, when a non-process runtime fails to start a session, falls back to a local process with a warning on the request. The scheduler picks a runtime per stage from `routing.available_runtimes`; a stage that names none gets `process`, not `runtime.default`. `ProcessDispatcherConfig.RuntimeDefault` (the custom `sh -c` template) is read by `buildCmd` but `loop/defaults.go:30-47` never sets it, so no `.noodle.toml` key reaches it.
- Why: `runtimes.md` overstates the runtime package. Launch, parse and kill logic is in `dispatcher/` (about 4,400 lines); `runtime/` is about 500. The template feature is dead code from a config point of view.
- Evidence: `runtime/runtime.go:44-71`, `runtime/dispatcher_runtime.go:42-69`, `dispatcher/factory.go:32-53`, `brain/codebase/runtime-routing-owned-by-orders.md`, `internal/rtcap/registry.go:12-40`, `config/types_defaults.go:70-100` and `config/parse.go:100-101` (caps: process 4, sprites 50, cursor 10), `dispatcher/process_dispatcher.go:26,222-253` (`RuntimeDefault`, `buildCustomRuntimeCmd`), `loop/defaults.go:30-47`, `:50-` (Sprites wired only when `sprite_name` is set), `brain/plans/69-cursor-dispatcher/overview.md` (status `ready`).
- Tests: `dispatcher/factory_test.go` (`...RoutesDefaultToProcess`, `...RoutesSpritesRuntime`, `...RejectsUnknownRuntime`, `...FallsBackToProcessOnRemoteFailure`, `...NoFallbackForProcessFailure`); `runtime/dispatcher_runtime_test.go` (`...ConcurrencyLimit`, `...UnlimitedConcurrency`, `...DecrementOnDispatchError`); `dispatcher/skill_bundle_test.go` `TestResolveTemplateVars`, `...NoQuoting`. No test of the custom template through `buildCmd`.
- Basis: Verified
- Code: `runtime/`, `dispatcher/factory.go`, `internal/rtcap/`.

**NADAPT-11. Note exactly how a session is launched, and that every agent runs with approvals off.**
The per-runtime command lines are in the Reference. In short: Claude gets stream-json in and out with `--permission-mode bypassPermissions` and a bidirectional stdin controller; Codex gets `exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json` with the prompt on stdin. The cwd is a linked worktree unless the request allows the primary checkout. Provider and model are required on every request (`Validate`); defaults come from `[routing.defaults]` and the order's stage may override them. The child environment is the parent's minus `CLAUDECODE`, plus `NOODLE_*` variables.
- Why: it fixes what "Claude Code, Codex and others" means (two CLIs, no others) and the unattended-permission stance. Noodle handles no API keys: the CLIs authenticate themselves.
- Evidence: `dispatcher/command.go:20-58,93-117,119-131`, `dispatcher/process_dispatcher.go:57-111,116-132,164-197,203-218,222-253`, `dispatcher/types.go:33-70`, `config/types_defaults.go:31-45`, `brain/codebase/provider-routing-must-fail-loudly.md`.
- Tests: `dispatcher/types_test.go` `TestDispatchRequestValidate`; `dispatcher/claude_controller_test.go` `TestReplaceFlagRemovesOldAndAppendsNew`; `dispatcher/skill_bundle_test.go` (skill text for Claude vs Codex). I found no test asserting the argv lists in `command.go` or the env set.
- Basis: Verified
- Code: `dispatcher/command.go`, `dispatcher/process_dispatcher.go`.

**NADAPT-12. Borrow the shape of the canonical session-event record and the stamp-then-parse pipeline, but note that a malformed JSON line aborts the stream by design.**
Every stdout line gets `_ts` and is written verbatim to `raw.ndjson`; non-JSON lines are skipped; each stamped line is routed by its top-level `type` to the Claude or Codex adapter and becomes zero or more `CanonicalEvent`s (record in the Reference). An unrecognised type becomes a visible `error` event. A line that starts with `{` but is not valid JSON makes `injectTimestamp` fail, `ProcessLine` returns the error, `Process` returns `process line N: ...`, and `processStream` publishes a warning and returns without reading further.
- Why: cost sits on the same record as its turn, across two CLIs. After an abort nothing reads the child's stdout pipe; a child that keeps writing will fill the pipe buffer and block until killed. That last step follows from pipe semantics and the code: `waitForExit` waits on the process, not the stream, so the session would hang. Unverified: we did not run it.
- Evidence: `stamp/processor.go:22-112` (`Process`), `:66` (skip lines not starting with `{`), `:70-73` (return on error), `:126-140` (`injectTimestamp`), `parse/registry.go:62-112`, `parse/canonical.go:1-26`, `parse/claude.go:114-123`, `parse/codex.go:35-37`, `dispatcher/session_base.go:299-320` (`processStream`: warning only if `ctx.Err() == nil`), `dispatcher/process_session.go:84-94` (`waitForExit` waits on `process.Done()`).
- Tests that pin it: `stamp/testdata/invalid-json-input` is a fixture with `expected_failure: true` expecting an error containing `parse JSON object`, so the abort is deliberate and pinned. `stamp/processor_test.go` (`TestProcessSkipsNonJSONLines`, `...FailsWhenLineExceedsScannerLimit`, `...WritesStampedAndSidecarEvents`, unknown type, rate-limit and control-response routing); `parse/fixture_test.go` over `parse/testdata/*`; `parse/parse_test.go` (417 lines). The hang is pinned by nothing.
- Basis: Verified (code, fixtures); the hang is Unverified.
- Code: `parse/`, `stamp/`, `dispatcher/session_base.go`.

**NADAPT-13. Borrow the outcome rule "completion evidence beats exit code"; do not borrow Noodle's supervision, and know what a restart does to live sessions.**
Status is resolved after the stream drains from canonical signals: `result` or `complete` means completed even on a non-zero exit or a cancelled context; cancellation counts only without completion; a negative exit code is killed; `action` without `result` is "no turn completed"; `init` only is "no work produced"; nothing is "no events emitted". Termination signals the whole process group. There is no wall-clock timeout and no stall detector: the monitor hard-codes `Stuck: false`. The only bounds are `--max-turns` and `--max-budget-usd` on Claude. After a restart, `Recover` returns sessions whose `process.json` PID is alive and whose `meta.json` contains the substring `"status":"running"`; the loop records them as adopted (emits `session_adopted`, indexes `adoptedTargets`), then only watches `meta.json` for a terminal status (`collectAdoptedCompletions`). A recovered handle's `Terminate`, `ForceKill` and `Controller` are no-ops, so an adopted session cannot be killed or steered by the loop; a dead PID is pruned each cycle (`refreshAdoptedTargets`). Live steering (`steerLive`) interrupts a Claude session and sends a new prompt; a non-steerable one is killed and respawned with a summary of files touched, recent actions and ticket progress read from its session log (`buildSteerResumeContext`).
- Why: the outcome rule fixes a real race (final `result` lost because status was read before the stream drained). The recovery path trusts a substring of a file written by a different component (the monitor pass writes `meta.json`: `monitor/fileio.go:33`, `loop/session_meta_repair.go`), and the dispatcher's own `spawn.json` carries no status.
- Evidence: `dispatcher/session_base.go:217-264`, `brain/codebase/session-failure-classification-crash-only.md`, `dispatcher/process_group_unix.go:10-33`, `dispatcher/process_session.go:84-107`, `monitor/derive.go:112`, `runtime/process_recover.go:20-87` (`:59` substring test, `:65` string replace, `:76-87` no-op handle), `loop/reconcile.go:108-146` (recovery loop and `session_adopted` event), `:649-678` (`refreshAdoptedTargets`), `loop/adopted_helpers.go:16-32` (`readSessionStatus`), `loop/cook_completion.go:398-424` (`collectAdoptedCompletions`), `loop/cook_steer.go` (`steerLive`, `steerRespawn`, `buildSteerResumeContext`; function bodies read, exact line numbers not recorded), `dispatcher/dispatch_metadata.go:11-60` (`spawn.json` fields). A search of non-test Go in `loop/`, `monitor/`, `config/`, `dispatcher/` for stuck or timeout finds only a 30 s interrupt timeout (`dispatcher/claude_controller.go:15`), a 30 s steer timeout (`loop/cook_steer.go`), a 10 s scheduler-forward timeout and a 60 s Sprites sync timeout.
- Tests that pin it: `dispatcher/process_session_test.go` (`...CompletedFromResult`, `...CancellationWithoutCompletion`, `...CompletionWinsOverCancellation`, `...ActionWithoutCompletionFails`, `...SignalExitKilled`, `...CostAccumulation`, `...WritesHeartbeat`, `HeartbeatThrottling`, `...DroppedEventSummary`); `dispatcher/process_test.go` (spawn, done, force kill, exit code); `runtime/process_recover_test.go` (live PID, dead PID rewrites meta to exited, no `process.json`, empty dir); `loop/reconcile_pid_test.go` (prune dead PIDs); `loop/loop_test.go` `TestCycleCompletesAdoptedCookFromMetaState`; `loop/cook_steer_test.go` (live interrupt and redirect, non-steerable falls back to respawn, interrupt failure). Not pinned: a stalled or runaway session, the no-op recovered handle's inability to kill.
- Basis: Verified
- Code: `dispatcher/session_base.go`, `runtime/process_recover.go`, `loop/reconcile.go`. Gap in Noodle: stall detection, hard timeout, killable adopted sessions.

**NADAPT-14. Qara and csf are ahead of Noodle on launch, supervision, teardown and completion evidence; Noodle is ahead on a single cross-provider event record and on in-band steering with a respawn fallback.**
The three-column comparison is in the Reference. In short: Qara's pi path gives each Run its own worktree and branch, a ledger with sequence numbers, a verified teardown ladder, a load gate and pane discipline enforced by hooks; csf spawns detached to a log with spawn-intent receipts, decides completion in a fixed priority and detects false greens, and keeps a git-ref run ledger. Noodle has a worktree and a process group.
- Why: it says what not to take from Noodle and where its design fills a real gap: Qara has no one canonical stream record across Claude, Codex and pi output (hooks log tool calls; each script parses what it needs).
- Evidence: see the Reference table's citations; Qara `.claude/context/csf-pi-mechanics.md`, `.claude/skills/pi/SKILL.md:93-146`, `.claude/skills/pi/references/pi-subagents.md:24-88,295-370`; csf `src/runner/csf-stage-core.ts:107-190`, `src/runner/csf-stage-spawn.ts:1-40`, `docs/run-ledger.md`.
- Basis: Unverified for the comparison (a judgement); Verified for each fact cited.
- Code: n/a.

**NADAPT-15. The sweep is already stricter than Noodle on guards, and the two share a stream-parsing job that is not worth a shared module yet.**
`inference/sweep/spawn.ts` runs `claude -p` or `pi -p` in its own process group, stamps lines by arrival, can kill the group the moment a line matches (`killOn`, used on a non-subscription `apiKeySource` at `init`, failing closed), enforces a timeout with TERM then KILL after 5 s and finally kills stragglers. `quota.ts` parks Claude cells at 95% (seven-day) or 98% (five-hour) plan-window use read from `rate_limit_event`. `parse.ts` reduces both streams to one usage summary. `run.ts` `decideOutcome` treats any non-zero exit as `run_error` (`:78`), the opposite of Noodle's completion-wins rule, deliberately: a sweep measurement should not count a run that crashed after answering. Noodle parses `rate_limit_event` only to ignore it.
- Why: Noodle's outcome rule does not transfer to the sweep (measurement integrity), and a shared parser would serve two consumers with different goals.
- Evidence: `inference/sweep/spawn.ts:7-85`, `quota.ts:1-40`, `parse.ts:1-12,40-100,160-185`, `run.ts:59-87`, `cells.ts:94-95`; Noodle `parse/registry.go:34-45`, `CHANGELOG.md` ("route claude rate_limit_event without error").
- Basis: Verified (what each file does); the rest is Unverified.
- Code: `inference/sweep/`. No shared module.

**NADAPT-16. Keep Qara's hooks as its tool-call and session-lifecycle log, and Claude Code's own peer messaging as its cross-session channel; neither needs a Noodle-style event log.**
Qara's events exist at four grains: hook records (`audit-log` appends every tool call to `tool-usage.jsonl` with model and duration; `subagent-start`/`subagent-stop` log to `subagent-tracking.jsonl`; `stop-failure` logs `stop-failures.jsonl`; the PreToolUse decision ledger `pretool-decisions.jsonl` has a versioned row schema), bsvc run ledgers with sequence numbers (`bsvc runs wait --after-seq`), the triage Finding queue (`scripts/triage.ts list|show|check`; resolution is "one bounded pass" with attempts), and peer messaging. Peer messaging is Claude Code's own: each running session registers a file under `~/.claude/sessions/` carrying a `messagingSocketPath`, `peerProtocol` and `peerFeatures`, and a Unix socket per session sits under `/run/user/<uid>/cc-socks/`; orchestrators use `ListAgents` and `SendMessage`, with `notify_when_idle`. Qara documents the use (briefs, acknowledgement, GO/HOLD with head sha, authority limits), not the socket protocol, which is not in the repo.
- Why: an external system injecting an event for an orchestrator to read at its next planning point has no Qara analogue, but the one place that would need it is the board, whose `/events` log already covers it (NADAPT-7).
- Evidence: `.claude/context/hooks-guide.md:111-153` (agent-hooks subcommand table), `:304-346` (decision ledger), `.claude/skills/hook-authoring/SKILL.md`, `.claude/skills/triage-issue/SKILL.md`, `.claude/skills/triage-resolution/workflows/resolve-queue.md:1-30,139-166`, `.claude/context/delegation-guide.md:143,189-197` (peer sessions), `docs/HARNESS-PARITY.md` § 1 (cited from the guide; not opened), the session registry's key names (`messagingSocketPath`, `peerProtocol`, `peerFeatures`, `pid`, `sessionId`), and `/run/user/<uid>/cc-socks/*.sock` existing on this host. Values in the registry files were not read.
- Basis: Verified (files and key names); the "no Noodle-style log needed" judgement is Unverified.
- Code: n/a.

**NADAPT-17. csf-build decides a stage is finished by a fixed priority, with "branch pushed" not among the signals; it reads no GitHub.**
`decideEvent` returns, in order: LANDED (or LANE-COMMIT on a drain lane branch) when the Run checkout's HEAD sha differs from the base sha; SETTLED when the bsvc Run state is `awaiting-review`, `accepted`, `rejected`, `failed` or `cancelled` (exit 0 only for `awaiting-review` and `accepted`); CSF-EXIT when the `csf-advance` process exited. `isFalseGreen` overrides a claimed success when the Run ended cancelled, failed or rejected or the log carries the 60-minute-ceiling cancellation line. Dispatch spawns `csf-advance` detached onto a log with a spawn-intent receipt first and a `SPAWN-FAILED` receipt on failure. Records live in `.csf/pipeline.db` (drains, leases), `.csf/records/YYYY/MM/*.jsonl` (admission rows, as cited by cub's `factory/_decisions.md`) and an outbox, and run numbers are git refs `refs/csf/runs/NNN` never deleted. A search of csf-build `src` and `skills` for `gh`, `octokit` and `api.github` finds no GitHub client: landing goes through git (`src/landing/`), and the work-order queue is files and SQLite (`factory/work-orders`, `pipeline.db`), with PR numbers recorded by hand in cub's decision files.
- Why: this answers Open 3: a pi Run's completion in csf is a moved HEAD or a settled Run state, so a message-style `stage_yield` adds nothing. It also means csf never needed an external-tracker adapter: its backlog is the repo.
- Evidence: `node_modules/csf-build/src/runner/csf-stage-core.ts:107-115` (`SETTLED_STATES`), `:123-139` (`decideEvent`), `:155,170-180` (`isFalseGreen`), `src/runner/csf-stage-spawn.ts:1-40`, `docs/run-ledger.md:1-9`, `skills/orchestration/drain/SKILL.md:58-84`; cub `factory/_decisions.md` (admission rows link to `.csf/records/...-admission.jsonl`).
- Basis: Verified
- Code: `csf-build/src/runner/csf-stage-core.ts`. n/a for us.

**NADAPT-18. The published concept pages match the repo's `docs/`; a few repo details the pages do not carry.**
The fetched pages for adapters, events and runtimes agree with `docs/concepts/*.md`: `sync` and `done` live, `add`/`edit` planned, `done <id>` with no stdin and no output; the same 8 internal event types; 200 retained records and 50 in the mise; the same `noodle event emit` forms and session path; runtimes `process` (default 4) and `sprites` (default 50, example 20); Cursor not mentioned; custom runtimes "coming". The fetch summary of the adapters page said it carried no validation rules or example warning strings, which the repo page does (§ Validation); this is probably the summariser dropping a section, not a difference, and was not checked against the raw page.
- Why: it closes the question of whether the docs site is newer than the repo; the pages give no sign of it.
- Evidence: fetches of `https://poteto.github.io/noodle/concepts/adapters`, `/concepts/events`, `/concepts/runtimes` on 2026-11-23, against `docs/concepts/{adapters,events,runtimes}.md`.
- Basis: Verified (paraphrase)
- Code: n/a.

## Borrow list

The reading changed the list: most of the earlier candidates are undermined. csf already decides completion by evidence, the board already has the cursor log and fenced claims, and Qara's teardown and pi lifecycle are stricter than anything in Noodle. What remains is small. Sizes: S under a day. All fit judgements are Unverified.

| Rank | What | Target (exact file, change) | Size | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | Resume brief from the session record when a Run is replaced: files touched, last 5 actions, last 3 progress notes (`buildSteerResumeContext`, NADAPT-13) | `.claude/skills/pi/references/pi-subagents.md` § Recovery and limits (or the brief template in § Dispatch boundary): add a short rule that a replacement Run's brief carries a summary built from `bsvc runs inspect <id>` and the transcript, never "continue where it stopped" | S | Low; a summary can mislead if it is stale, so it should cite the transcript path | read what `bsvc runs inspect` exposes (not done) |
| 2 | Directory-fixture test layout for stream parsers: one directory per case with recorded input and an `expected.md` that can declare an expected failure and a `source_hash` (NADAPT-12) | `inference/sweep/parse.test.ts`: move the inline stream samples to `inference/sweep/testdata/<case>/{input.ndjson,expected.md}` read by one loop test | S | Low; fixtures from real streams cost model runs unless captured from existing sweep transcripts under `inference/sweep/results/` | none |
| 3 | A tested-script contract for any future adapter: run the real script with a fixed env var for the data file and assert its stdout lines (`defaults_adapters_test.go`, NADAPT-2) | only if a csf-board scratch adapter is ever written (Open 1); then `scripts/adapter-board-sync.test.ts` | S | Low | Open 1 |

**Do not borrow.**
- A csf-board adapter for Noodle, and Noodle itself against the board (NADAPT-5): the lease and fence cannot be carried by `sync`/`done`.
- The loop-event writer (NADAPT-8), the three-store event design and the ingest arbiter (NADAPT-6).
- `stage_yield` (NADAPT-9, NADAPT-17): csf's moved-HEAD and settled-state evidence already does the job.
- The watermark digest (NADAPT-7): the board's `/events?after=` cursor and `wait` replace it.
- "Completion wins over exit code" as a rule for the sweep (NADAPT-15): the sweep's strictness is deliberate; csf already has the rule plus a false-green check (NADAPT-17).
- Bypass-permission launch defaults, Sprites and Cursor runtimes, `sh -c` adapters without a timeout, PID-file recovery by substring match, Noodle's supervision (NADAPT-10, 11, 13, 14).
- A shared Noodle-style canonical parser across sweep and csf logs (NADAPT-15): two consumers with different goals.

## Open

Only decisions that need the owner. Each can be asked on its own.

1. **Should anyone try Noodle against the board at all?** Recommendation: no. NADAPT-5 shows the fence cannot survive the adapter contract, and csf already has its own queue (NADAPT-17). If you want a trial, use a scratch repo and a read-only `sync` with no claim.
2. **Is this research track's output "ideas only", with the three small borrows above as the whole yield?** Recommendation: yes; move to the other five documents for the larger findings (scheduling, skills, modes).

**Facts still unknown (not owner decisions).**
- Whether two Noodle processes really duplicate a `seq` or lose a line on truncate, and whether the stamp abort hangs a still-writing child: both inferred from code, never run.
- The exact line numbers inside `loop/cook_steer.go` for `steerLive`, `steerRespawn` and `buildSteerResumeContext`: bodies read, line numbers not recorded.
- What `bsvc runs inspect` exposes for resume briefs (borrow 1): `bsvc` was not run, and its source is in another repository.
- The Claude Code peer-messaging socket protocol: not documented in Qara; only key names in the session registry were read.
- `docs/HARNESS-PARITY.md` § 1 (peer messaging across harnesses): cited by the delegation guide, not opened.
- Whether the published adapters page carries the validation section (NADAPT-18): summary-level fetch only.
- How `orderx` and the scheduler fill a stage's provider and model beyond `[routing.defaults]`: belongs to NSCHED.

## Reference

### Adapter contract: commands, stdin and stdout

| Action | Called by | Argv | Stdin | Stdout | Failure handling |
| --- | --- | --- | --- | --- | --- |
| `sync` | mise build every cycle (`mise/builder.go:48`) | none | none | NDJSON, one object per line | script missing: warning "backlog sync script missing; returning empty backlog"; non-zero exit: fatal error; bad line: warning, skipped |
| `done` | final stage of a non-failing order (`loop/cook_completion.go:345`) | `<id>` (shell-quoted) | none | ignored | error returned unless text contains "not configured" or "no such file" |
| `add` | nobody | none | JSON, e.g. `{"title":"Ship feature"}` (optional `section`) | the new item's id | n/a |
| `edit` | nobody | `<id>` | JSON, e.g. `{"title":"Ship feature v2"}` | none | n/a |

`sync` line, quoted from `docs/concepts/adapters.md` (Noodle's own words): `{"id": "1", "title": "Fix login bug", "status": "open", "tags": ["bug", "auth"], "priority": 1}`. Required: `id`, `title`. Read by Noodle: `status` (`done` filtered out), `plan` (path to a plan file). Everything else passes through to `mise.json`.

Config (`.noodle.toml`):

```toml
[adapters.backlog]
skill = "backlog"
[adapters.backlog.scripts]
sync = "adapters/backlog-sync"
add  = "adapters/backlog-add"
done = "adapters/backlog-done"
edit = "adapters/backlog-edit"
```

`config/types_defaults.go:200-212` fills a missing `backlog` adapter and any missing script of it. Shipped scripts: `defaults/adapters/` (POSIX shell; `NOODLE_TODOS_FILE`, default `todos.md`), and for Noodle's own repo a Go helper `adapters/main.go` (subcommands `backlog-sync|add|done|edit`, default file `brain/todos.md`). `todos.md` line format: `N. [ ] Title #tag ~small|medium|large [[plans/NN-slug/overview]]` under `## Section` headings with `<!-- next-id: N -->`. Tests: `defaults_adapters_test.go` (sync parse, add/done/edit round trip), `adapter/*_test.go`.

### Noodle against the csf board: operation mapping

| Noodle | Carries what | Board operation | What is missing |
| --- | --- | --- | --- |
| adapter `sync` | list open items | `GET /messages` / `tasks list` (state `waiting`, `ready`, `claimed`, `blocked`) mapped to `status: open`; root message id as `id`; text as `title`; labels, `needs`, state as pass-through keys | no claim: listing alone does not stop another runner; `claimed` items would show as open to Noodle |
| (none in contract) | claim | `claimTask` / `claimNext` (epoch, token, lease 30 to 3600 s) | Noodle has no claim step and no place to store a token |
| (none) | renew | `renewTask` (needs epoch and token) | Noodle never renews; a long order outlives a 900 s default lease |
| adapter `done <id>` | complete | `settleTask(..., "complete", {epoch, token, result})` | `done` gets only the id; no epoch, token or result; board refuses with `claim_lost` after expiry |
| (none, failed order) | fail or release | `settleTask(..., "fail"|"release", ...)` | Noodle runs no adapter command when an order fails, so a claimed task would sit until `hold` blocks it |
| `in_progress` (constant, never set) | work started | state `claimed` | Noodle never writes it back |
| adapter `add` (unused) | create item | `createTask` / `createTasks` (client `id` or `request` for idempotent create) | never called |
| adapter `edit` (unused) | update | `edit` message, `assignTask`, `blockTask` | never called |
| `needs`/dependencies | n/a | task `needs` (state `waiting` until satisfied) | Noodle has plan phases, not task dependencies from the tracker; passes `needs` through only as extra data |
| loop event `stage.*`, `order.*` | lifecycle | board messages or labels on the task thread (`POST /messages`) | no emitter exists; would be a new injector calling the board |
| `noodle event emit <type>` (external) | inject | board `/events?after=<cursor>&wait=<s>` as the source, a translator calling `emit` | translator not written; board events carry cursors, Noodle's carry `seq` |
| `recent_events` watermark | digest | `wait`/`after` cursor | covered by the board |
| `stage_yield` / `stage_message` | agent-declared done, review verdict | task `complete` with `result`; `block` with `kind` for a human gate | claim proof required again |
| `tickets` | advisory claims by target | task claim | Noodle's tickets are advisory and per-file; the board's are fenced and per-task |
| idempotent `done` | n/a | complete on a completed task | `settleTask` runs `fenced`, which requires `state === "claimed"` (`board.ts:975`): a repeated `done` fails with `claim_lost`, so `done` is not idempotent unless the adapter swallows it |

### Event types and payloads

Loop events: `event/loop_event.go:16-31`, payload structs `loop/event_payloads.go:25-96`. Record: `{"seq":N,"type":"...","at":"RFC3339","payload":{...}}`.

| Type | Payload fields | Emitted at |
| --- | --- | --- |
| `stage.completed` | `order_id`, `stage_index`, `task_key`, `session_id?`, `message?` | `loop/cook_completion.go:301` |
| `stage.failed` | `order_id`, `stage_index`, `reason`, `session_id?`, `agent_mistake?`, `failure?` | `loop/cook_failure.go:29` |
| `order.completed` | `order_id` | `loop/cook_completion.go:310` |
| `order.failed` | `order_id`, `reason`, `agent_mistake?`, `failure?` | `loop/cook_failure.go:30` |
| `order.dropped` | `order_id`, `reason` | `loop/order_audit.go:82` |
| `order.requeued` | `order_id` | `loop/control_orders.go:190` |
| `worktree.merged` | `order_id`, `stage_index`, `worktree_name` | `loop/cook_merge.go:34` |
| `merge.conflict` | `order_id`, `stage_index`, `worktree_name` | `loop/cook_merge.go:144` |
| `schedule.completed` | `session_id` | `loop/cook_completion.go:159` |
| `registry.rebuilt` | `added[]?`, `removed[]?` | `loop/loop.go:168` |
| `sync.degraded` | `reason`, `failure?` | `loop/loop_cycle_pipeline.go:372` |
| `bootstrap.completed` | none | `loop/cook_completion.go:104` |
| `bootstrap.exhausted` | `reason`, `failure?` | `loop/schedule.go:227` |
| `promotion.failed` | `reason`, `agent_mistake?`, `failure?` | `loop/loop_cycle_pipeline.go:188` |

Any other string is accepted from `noodle event emit` with any valid JSON payload (`cmd_event.go:69-80`).

Session events: `event/types.go:11-36`. Record: `{"type":"...","payload":{...},"timestamp":"RFC3339","session_id":"..."}`.

| Type | Written by | Payload |
| --- | --- | --- |
| `spawned`, `action`, `cost`, `state_change`, `exited`, `delta` | session capture (`eventFromCanonical`, `dispatcher/session_base.go`) | action: `{"tool","path","summary",...}`; prompt: `{"tool":"prompt","action":"prompt_injected","message":...}` |
| `cook_started`, `cook_completed` | loop | not traced |
| `stage_message` | agent via CLI | `{"message": string, "blocking": bool?}` (default blocking true) |
| `stage_yield` | agent via CLI | `{"message": string}` |
| `ticket_claim`, `ticket_progress`, `ticket_done`, `ticket_blocked`, `ticket_release` | agent via CLI | `{"target","target_type":"backlog_item|file|plan_phase","files?","summary?","outcome?","blocked_by?","reason?"}` |

Ingest (internal) types, `internal/ingest/types.go:22-41`: `control_received`, `schedule_promoted`, `dispatch_requested`, `dispatch_completed`, `stage_completed`, `stage_failed`, `stage_review_parked`, `stage_review_approved`, `stage_review_changes_requested`, `stage_review_rejected`, `order_completed`, `order_failed`, `mode_changed`, `session_adopted`, `merge_completed`, `merge_failed`; sources `control`, `scheduler`, `runtime`, `internal`.

### On-disk layout of the three event stores (and session files)

| Path under `.noodle/` | Store | Writer | Content |
| --- | --- | --- | --- |
| `loop-events.ndjson` | 1 loop events | loop, `noodle event emit` | loop events, rewritten to the last 200 lines after each append |
| `sessions/<id>/events.ndjson` | 2 session events | session capture, agent CLI | session events, append-only, no trimming |
| `tickets.json` | derived from 2 | ticket materialiser (atomic write) | active claims |
| ingest state | 3 ingest arbiter | loop | canonical state events and idempotency index; layout not traced |
| `mise.json` | n/a | mise builder | backlog, `recent_events`, `tickets`, routing, warnings |
| `sessions/<id>/prompt.txt` | n/a | dispatcher | prompt as sent |
| `sessions/<id>/raw.ndjson` | n/a | stamp processor | provider stdout with `_ts` added |
| `sessions/<id>/canonical.ndjson` | n/a | stamp processor | canonical events |
| `sessions/<id>/stderr.log` | n/a | dispatcher | child stderr |
| `sessions/<id>/process.json` | n/a | dispatcher | `{pid, session_id, started_at}` |
| `sessions/<id>/spawn.json` | n/a | dispatcher (atomic) | `{session_id, provider, model, runtime?, skill?, worktree_path?, created_at, dispatch_warning?, display_name?, title?, retry_count?}` |
| `sessions/<id>/meta.json` | n/a | monitor pass | session status (`running`, `exited`, ...) read by recovery |
| `sessions/<id>/heartbeat.json` | n/a | session | `{timestamp, ttl_seconds}`, at most one write per 5 s |

Session id: `<sanitised-name>-<UTC yyyymmdd-hhmmss>-<6 hex>` (`dispatcher/command.go:60-68`).

### The canonical session-event record

`parse/canonical.go:1-26`:

```go
type CanonicalEvent struct {
    Provider  string    `json:"provider,omitempty"`
    Type      EventType `json:"type"`      // init | action | result | error | complete | delta
    Message   string    `json:"message"`
    Timestamp time.Time `json:"timestamp"`
    CostUSD   float64   `json:"cost_usd,omitempty"`
    TokensIn  int       `json:"tokens_in,omitempty"`
    TokensOut int       `json:"tokens_out,omitempty"`
}
```

Provider detection by top-level `type` (`parse/registry.go:19-45,81-112`): Claude: `system`, `assistant`, `result`, `stream_event`, `user`, `rate_limit_event`, `controlresponse` (and `control_response`); Codex: `event_msg`, `response_item`, `session_meta`, `turn_context`, `thread.started`, `turn.started`, `turn.completed`, `item.started`, `item.completed`, `compacted`. Anything else yields an `error` event "canonical routing failed: ...". Claude `result` carries cost and usage (`parse/claude.go:114-123`); Codex cost and tokens come from `cost`, `tokens_in`, `tokens_out` (`parse/codex.go:35-37`).

### Launch command line per runtime

| Runtime | Command | Stdin | Notes |
| --- | --- | --- | --- |
| process, Claude | `claude --output-format stream-json --verbose --permission-mode bypassPermissions [--max-turns N] [--max-budget-usd X.XX] [--model M] [--effort E] [--append-system-prompt P] [extra args] --input-format stream-json` (`-p` replaced) | stream-json user message with the composed prompt; controller keeps stdin open for steering | binary: `agents.claude.path`/`claude`; `dispatcher/command.go:20-43`, `process_dispatcher.go:222-243` |
| process, Codex | `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check --json [--model M] [extra args]` | prompt written then stdin closed | skill loaded natively; only the preamble is appended to the prompt (`command.go:45-58,119-131`) |
| process, custom | `sh -c "<template>"` with `{{repo}}`, `{{prompt}}`, `{{skill}}`, `{{brief}}` | none set | unreachable from config (NADAPT-10) |
| Sprites | remote command through the `sprites-go` SDK in `/work/repo` | not traced | token and GitHub token from named env vars; `dispatcher/sprites_dispatcher.go` |
| Cursor | not wired | n/a | REST polling plan only (`brain/plans/69-cursor-dispatcher/`) |

Environment for every process: parent env minus `CLAUDECODE`; plus `NOODLE_WORKTREE`, `NOODLE_PROVIDER`, `NOODLE_MODEL`, `NOODLE_REASONING_LEVEL` (if set), request `EnvVars`, `NOODLE_SESSION_ID`. Config keys: `runtime.default`, `runtime.process.max_concurrent` (4), `runtime.sprites.{token_env,base_url,sprite_name,git_token_env,max_concurrent}` (cap 50), `runtime.cursor.{api_key_env,base_url,repository,max_concurrent}` (cap 10), `routing.defaults.{provider,model}`, `agents.{claude,codex}.{path,args}`, `concurrency.max_concurrency`.

### Three-column comparison: Noodle, Qara, csf

| Aspect | Noodle | Qara (pi/bsvc/herdr) | csf-build |
| --- | --- | --- | --- |
| How a run is launched | `claude`/`codex` child process in its own process group inside a linked worktree, via `ProcessDispatcher` (`dispatcher/process_dispatcher.go:57-111`) | `bun scripts/herdr-lane.ts launch ... -- bsvc run pi --file <brief> --visible --cwd <dir>`; bsvc provisions a worktree and `pi-run-<id>` branch; one launch at a time and under 0.75 x cores load (`.claude/skills/pi/SKILL.md:50-90`, `pi-subagents.md` launch gate) | `csf-drain dispatch` spawns `csf-advance` detached onto a log with a spawn-intent receipt (`src/runner/csf-stage-spawn.ts:1-40`); the stage itself runs a bsvc/pi Run in a lane checkout |
| How the model is chosen | `[routing.defaults]`, overridable per order stage; both required by `Validate`; passed as `--model` | `--provider`, `--model`, `--thinking` forwarded unchanged; "do not invent model routing" (`SKILL.md:50-60`) | not traced beyond the stage runner delegating to pi; no routing in `csf-stage-core.ts` read |
| How output is captured and parsed | stdout piped through `stamp` into `raw.ndjson` and `canonical.ndjson`; one canonical record for Claude and Codex | Run transcript and a ledger of events with sequence numbers read via `bsvc runs inspect`/`wait`; hooks log tool calls (`tool-usage.jsonl`); no common stream record | stage log file plus bsvc Run state; the checkout HEAD is read from git |
| How completion is detected | canonical `result`/`complete` beats exit code; `stage_yield` overrides a bad exit (`session_base.go:229-264`, `cook_completion.go:233`) | `bsvc runs wait <id> --after-seq <n>` exit; `ledger.lastEvent == agent_settled`; adjudicate accept/reject (`SKILL.md:120-146`) | LANDED (HEAD moved) > SETTLED (Run state) > CSF-EXIT; false-green override (`csf-stage-core.ts:123-180`) |
| Timeouts and kill | no wall-clock timeout, no stall detector; TERM/KILL to the process group; adopted sessions unkillable | `bsvc runs cancel`, `adjudicate` with verified teardown ladder; sync Runs have a bounded `Bun.spawnSync`, but the PID is not persisted (`pi-subagents.md:352-370`); `--timeout` on `wait` | 60-minute ceiling cancellation recognised by `isFalseGreen`; lane leases in `csf_leases` expire after one hour (`csf-pi-mechanics.md`, stale lock paragraph) |
| Cost and token capture | `cost_usd`, `tokens_in`, `tokens_out` on canonical events, summed per session (`session_base.go:343-346`); budget flag `--max-budget-usd` | hooks record `model` and `duration_ms` per tool call, not cost; pi usage is read by the sweep, not by a Qara tool | not traced |
| External event injection | `noodle event emit <type>` into `loop-events.ndjson`; `--session` into a session log | no injection point; peer messages through CC `SendMessage` (`delegation-guide.md:189-197`); hooks fire on harness events only | no injection; admission is a typed `csf-admit` act recorded in `.csf/records`; board events would be the route (BOARD-8) |

Cells marked "not traced" were not read.

### How a stage flows (condensed)

1. Scheduler writes an order (id = backlog item id) to `orders-next.json`; the loop promotes it.
2. Loop builds a `DispatchRequest` (provider, model, skill, runtime, worktree) and calls the factory; a failing non-process start falls back to process.
3. The dispatcher validates the worktree, writes the session directory, starts the CLI in its own process group, sends the prompt, drains stderr to `stderr.log`, writes `process.json` and `spawn.json`.
4. The stamp processor reads stdout; canonical events update cost, heartbeat, the live UI and the session log; the agent may run `noodle event emit --session $NOODLE_SESSION_ID ...`.
5. On exit the status resolves from canonical signals; the loop reads `stage_message` and `stage_yield`, merges or parks the worktree, advances the order and emits `stage.completed`/`order.completed`.
6. After the last stage of a non-failing order the loop runs adapter `done <order-id>`; the next mise build runs `sync` again and shows `recent_events` since the last `schedule.completed`.

### Embedded agent instructions found that bear on this feature

- `INSTALL.md` has an installing agent run `brew install poteto/tap/noodle`, fetch the noodle skill files and the four default adapter scripts from `raw.githubusercontent.com/poteto/noodle/main/defaults/adapters/...` (a moving branch, not a pinned commit), write them to `adapters/` and `chmod +x` them, append `.noodle/` to `.gitignore`, write schedule and execute skills, and offer to install brainmaxxing. Material only; not followed.
- `.agents/skills/schedule/SKILL.md:39` instructs `noodle adapter run backlog add`, a command absent at this SHA.
- The dispatch preamble (`dispatcher/preamble.go`) goes to every agent: work in the worktree, commit with conventional messages, verify, write learnings to `brain/`, do not read `.noodle` state files.
- The Claude and Codex launch flags disable permission prompts (NADAPT-11); the `execute`, `plan` and `quality` skills instruct agents to emit events through the CLI.
- None of it stores credentials, uses sudo or pushes. Sprites reads a token and a GitHub token from named environment variables (`config/types_defaults.go:77-83`); values were not read.

## Sources

- Noodle at `82d2921c52370f23f29086de81ccfb600939c037`: `docs/concepts/{adapters,events,runtimes}.md`; `adapter/*`; `adapters/{main.go,README.md}`; `defaults/adapters/*`; `defaults_adapters_test.go`; `event/*`; `cmd_event.go`, `cmd_event_test.go`; `runtime/*`; `dispatcher/{command,process_dispatcher,process,process_session,process_group_unix,session_base,factory,dispatch_metadata,claude_controller,preamble,types,sprites_dispatcher}.go` and their tests; `parse/*`; `stamp/*`; `mise/builder.go`, `mise/builder_test.go`; `monitor/{derive,fileio}.go`; `loop/{cook_completion,cook_steer,cook_failure,cook_merge,reconcile,adopted_helpers,defaults,event_payloads,util}.go`, `loop/reconcile_pid_test.go`, `loop/cook_steer_test.go`; `internal/{ingest,rtcap}/*`; `config/{types_defaults,parse,diagnostics}.go`; `.agents/skills/{schedule,execute,plan,quality,skill-creator}/SKILL.md`; `INSTALL.md`; `CHANGELOG.md`; `brain/codebase/{provider-routing-must-fail-loudly,runtime-routing-owned-by-orders,session-failure-classification-crash-only,backlog-sync-parse-errors-are-recoverable-warnings,claude-print-flag-gotchas,claude-code-ndjson-protocol,unix-process-liveness-eperm}.md`; `brain/plans/69-cursor-dispatcher/overview.md`.
- Published pages, fetched 2026-11-23: `https://poteto.github.io/noodle/concepts/adapters`, `/concepts/events`, `/concepts/runtimes`.
- Qara (`$HOME/qara`): `.claude/context/{csf-pi-mechanics,hooks-guide,delegation-guide}.md`; `.claude/skills/pi/{SKILL.md,references/pi-subagents.md}`; `.claude/skills/{herdr,hook-authoring,triage-issue,triage-resolution}/`; `~/.claude/sessions/*.json` (key names only) and `/run/user/<uid>/cc-socks/` (existence only).
- csf-build in cub `node_modules`: `src/runner/{csf-stage-core,csf-stage-spawn}.ts`, `docs/run-ledger.md`, `skills/orchestration/drain/SKILL.md`; cub `factory/_decisions.md`, `_findings.md`.
- tobogan: `board/vercel-board.md` (BOARD-5, 8, 16, 17, 18), `board/README.md`; `/media/ssdev/tg-pro/csf-board/src/{board,state,http}.ts`; `inference/sweep/{spawn,quota,parse,run,cells}.ts`.
- Other documents in this track, by prefix: NSCHED (orders, scheduler, mise), NSKILL (skills that emit events), NMODE (merge and review gating, worktrees), NVIEW (CLI, config, monitor, server, UI), NBRAIN (brain files).
