# NSCHED: Scheduling and the loop in Noodle, and what csf and Qara should take from it

**Track:** noodle · **Type:** research · **Date:** 2026-11-23

**Question:** How does Noodle schedule work (an agent-written order queue, per-stage model routing, a serialised loop with crash recovery), and should an agent-run scheduler with model routing replace or inform csf's drain order and Qara's delegation tiers?

**Scope:** the main loop (`loop/`), the scheduler skill and prompt, orders and their on-disk format, the dispatch planner (`internal/dispatch`), model routing and config, concurrency, stages and groups, failure and retry, reset, start and stop, crash recovery, and cost accounting. Out of scope, covered by sibling documents: the skill system (NSKILL), the brain (NBRAIN), run modes, review and worktrees (NMODE), adapters, events and runtimes (NADAPT), the CLI, config loader, monitor and UI (NVIEW). Where those touch scheduling this document points at them by prefix and does not restate them.

**Sources** (full list at the end):
- Noodle, `poteto/noodle` v0.1.5, commit `82d2921c52370f23f29086de81ccfb600939c037` (last pushed 2026-03-19), read in a local read-only clone. Paths below are relative to its root unless marked otherwise. Nothing from it was built or run. The clone has a single commit, so file history is not available.
- csf-build as installed under `/media/ssdev/tg-pro/cub/node_modules/csf-build` (paths marked `csf:` are relative to its root), and cub's `factory/work-orders/queue.md`. Read only; nothing run in cub.
- Qara under `$HOME/qara/.claude` (paths marked `qara:` are relative to it).
- Tobogan: `inference/sweep-results-full-20261122.md`, `factory/harness-loops-graphs.md` (LADDER), `factory/loops-and-graphs.md` (FLEET).

**Short answer.** Noodle's scheduler is one agent run that rewrites a JSON queue, inside a deterministic loop that validates the queue and does all dispatch. That split is sound. Three things in it are worth copying, all small: a reject-and-repair prompt for agent-written files, a file-footprint-aware ordering proposal for csf's queue (advisory only), and the discipline of writing the sweep's cost data where routing decisions read it. The rest does not transfer. Noodle's model routing is a four-row prose table with no measurement or enforcement. Its parallel `group` stages are marked done in its plan index but are not implemented in the dispatch code, and a test pins one stage per order. Its stuck detection and retry are described in its architecture note and absent from the code. csf's `scheduleNext` and Qara's tier ladder are both better specified than what Noodle has. Recommendation: keep both, borrow the repair handshake, and do not build a scheduler agent in front of either.

## Doctrines

**NSCHED-1. Treat Noodle's scheduler as a queue-writing agent inside a deterministic loop; the agent never dispatches.**
The loop builds a snapshot (`mise.json`), dispatches the `schedule` skill as an ordinary agent session in the primary checkout, and the agent's only output is `orders-next.json`. The loop validates that file, promotes it to `orders.json`, and plans and spawns every stage itself. The agent chooses what and with which model; code chooses when and how many. The architecture note states the principle: "Go handles everything deterministic ... LLMs handle everything that requires judgment" (`brain/architecture.md`, "LLM judgment / Go mechanics split").
- Why: this is the choice that makes an agent scheduler safe to run unattended. A bad schedule becomes a rejected file, not a bad spawn. It is the property csf has in another form (a pure `scheduleNext`), so it is where the two systems compare directly.
- Evidence: `loop/schedule.go:133-217` (`spawnSchedule` builds a `DispatchRequest` with `WorktreePath: l.projectDir` and `AllowPrimaryCheckout: true`); `loop/schedule.go:284-340` (the prompt says "Write to `orders-next.json` (not orders.json). The loop promotes it atomically." and "Do not modify mise.json"); `docs/concepts/scheduling.md` steps 1 to 6.
- Basis: Verified (mechanism). That it is safer than an unconstrained agent is Unverified.
- Code: `loop/loop_cycle_pipeline.go` (`mergeOrdersNext`, `handlePromotionResult`, `prepareOrdersForCycle`).

**NSCHED-2. Make the scheduler a one-shot order the loop injects, and let a changed snapshot be the trigger.**
The schedule is itself an order with id `schedule` and one stage. The loop appends it when the mise content changed and none is running, and bootstraps one when the queue is empty and the backlog is not. After an empty promotion it waits 5 minutes, unless the backlog changes first. There is no timer-driven re-plan.
- Why: scheduling reuses dispatch, session, completion and crash-recovery machinery, and scheduler spend is bounded: no change in the backlog, no scheduler run.
- Evidence: `loop/loop_cycle_pipeline.go:204-244` (`ensureScheduleIfNeeded`: `if miseChanged && !l.hasActiveScheduleCook() && !hasScheduleOrder(*orders)` appends `scheduleOrder`; an empty queue with an empty backlog, or an active cooldown, sets state `idle`); `:58-60` (cooldown set on empty promotion); `:263-266` (cooldown reset when the mise changed); `loop/reconcile.go:151` (`ensureScheduleOrderPresent` on startup).
- Tests: the idle transition is pinned by `TestCycleEntersIdleWhenNoPlansRemain` and `TestCycleIdleWakesWhenPlansAppear` (`loop/loop_test.go:635,673`). **No test pins the 5-minute cooldown or its reset**: a search of `loop/*_test.go` for "cooldown", `scheduleNothingUntil` and `EmptyPromotion` finds no test that exercises them.
- Basis: Verified.
- Code: the above.

**NSCHED-3. Validate the agent's queue in code, and feed rejections back into the next scheduler prompt.**
A rejected `orders-next.json` is not fatal. The parser rejects unknown fields and deletes the bad file; the loop records the reason in `lastPromotionError`, marks the schedule order promoted so it can finish, and the next scheduler prompt carries "PREVIOUS ORDERS ISSUE: ... Fix the following issue in your next orders-next.json output". If `orders.json` itself fails validation, the loop archives it as `orders.json.bad.<nanos>`, replaces it with a fresh schedule order, and puts the error and archive path in the repair prompt.
- Why: an agent that writes structured output will sometimes write bad output. Without a repair channel the choices are a hard stop or silent acceptance. This handshake (reject, record, re-prompt with the exact error) is the most reusable piece of the system.
- Evidence: `loop/loop_cycle_pipeline.go:162-193` (`handlePromotionError`; its comment: "Without this, the schedule order stays active forever and the loop deadlocks"); `:328-363` (`recoverFromOrdersValidationError`); `loop/schedule.go:298-300`; `internal/orderx/compact.go` (`ParseCompactOrders`, "strict unknown-field handling"); failures are classed `degrade-continue` and tagged as scheduler mistakes (`loop/failure_envelope.go:12-18`).
- Tests (bodies read): `TestConsumeOrdersNextInvalidNextJSON` (`loop/orders_test.go:487`: invalid JSON gives a descriptive error, `Promoted` false, and the file is removed); `TestBuildSchedulePromptIncludesPromotionError` (`loop/schedule_test.go:139`: the header and the exact error text appear, and not when there is no error); `TestRecoverFromOrdersValidationErrorSchedulesRepair` (`loop/failure_envelope_test.go:236`: an order with `status: "bogus"` yields a single schedule repair order and a `degrade-continue` envelope owned by the scheduler agent); `TestCycleClassifiesOrdersNextPromotionFailureAsDegrade` (`:19`). Not pinned: that a scheduler which repeatedly writes bad output converges; the tests exercise one repair.
- Basis: Verified (mechanism, and single-step behaviour by test). Convergence is Unverified.
- Code: `loop/loop_cycle_pipeline.go`, `loop/orders.go`, `internal/orderx/`.

**NSCHED-4. Keep the on-disk queue small and agent-writable: compact in, canonical out, lifecycle owned by code.**
The scheduler writes a compact wire format (`do`, `with`, `model`, `runtime`, `prompt`, `extra_prompt`, `group`, plus order-level `id`, `title`, `plan`, `rationale`). The loop expands it to the full schema and fills default status and routing. The agent never writes status; the loop owns every lifecycle transition.
- Why: fewer fields means fewer invalid files, and an agent cannot move a stage to `completed` by editing the queue. Lifecycle ownership in code is LADDER-2 (walls over wishes).
- Evidence: `internal/orderx/compact.go:11-33` (full compact types, quoted in Reference); `internal/orderx/types.go:31-59`; `internal/orderx/orders.go:63-99` (empty provider and model take `[routing.defaults]`); CHANGELOG 0.1.4 ("wire compact orders format into promotion flow", "make provider/model optional").
- Tests: `TestConsumeOrdersNextNoExistingOrders` (`loop/orders_test.go`, bodies read) promotes a compact `{do: execute, with: claude, model: ...}` stage to a stored order.
- Basis: Verified.
- Code: `internal/orderx/`. The prose docs still show an older shape (NSCHED-9).

**NSCHED-5. Do not copy the `group` field: Noodle documents parallel stage groups, records the plan as done, and its dispatch code runs one stage per order.**
The concept doc says "Stages with the same `group` number run in parallel." Plan 81 ("Parallel Stage Groups") is marked `[x]` in `brain/plans/index.md:5` and "done" in `brain/archive/completed_todos.md:107`. Its design is specific: dispatch all pending stages of the current group, track cooks under a composite `orderID:stageIndex` key, fail the whole order on any group failure (`brain/archive/plans/81-stage-groups/overview.md`, `phase-03-dispatch.md`). The code on disk does not do this. Production dispatch is `internal/dispatch.PlanDispatches`, which returns at most one candidate per order and treats an order with any busy stage as busy. The older helper `dispatchableStages` (`loop/orders.go:193-235`) also returns "the first pending stage per order", and `activeCooksByOrder` is still keyed by order id alone (`loop/cook_spawn.go:144`, `loop/schedule.go:204`). `CurrentGroup()` and `StagesInGroup()` (`internal/orderx/types.go:61-80`) have no caller outside tests. Plan 115 (canonical state convergence, `status: active`) made the dispatch planner the authority, with the stated aim of "the same blocked/candidate behavior as before" (`brain/plans/115-canonical-state-convergence/phase-03-dispatch-planner-cutover.md`). So parallel groups were planned and recorded as shipped, and the current planner does not run them. Whether they ever ran, and whether the 115 cutover dropped them, cannot be told from this clone (single commit).
- Why: a borrow built from the docs or the plan index would copy something that does not run. The multi-stage cookbook says what the code does ("sequential within an order but concurrent across orders") and contradicts the concept page. The schedule skill still tells the agent to emit parallel stages (`.agents/skills/schedule/SKILL.md`, "Parallelizing phases"), so a scheduler following it asks for behaviour the loop does not provide.
- Evidence: the files above, and `internal/dispatch/dispatch_test.go:585-607` (test "empty stages and grouped stages", body read): an order with stage 0 completed (group 1) and stages 1 and 2 pending (both group 2) yields exactly one candidate, `{OrderID: "grouped", StageIndex: 1}`. That test pins one stage per order, group included.
- Basis: Verified (code, test body, plan text). Settled: planned, recorded done, not present in the dispatch path, pinned off by a test.
- Code: Gap upstream. Do not copy `group` into csf or Qara's order shape; csf's co-train groups (`csf:src/drain/drain-schedule/drain-schedule-holds.ts` `coTrainGroups`) are a different, working mechanism.

**NSCHED-6. Dispatch order is queue order; priority lives in the scheduler's judgement, not in code.**
`PlanDispatches` walks orders by arrival `Sequence`, then order id, and takes the first pending stage of each until free capacity runs out. There is no priority field, ageing or inter-order dependency. What the agent wants first, it writes first. External blockers (a ticket held by a human, a pending review) arrive as a blocked-orders map; a merge queue deeper than 128 stops all dispatch.
- Why: this is the honest answer to "how does the scheduler decide what runs next". The decision is the agent's, taken once per snapshot, expressed as list order plus one skill rule ("One Plan at a Time": finish one plan end to end, idle rather than spread across plans).
- Evidence: `internal/dispatch/dispatch.go` (`PlanDispatches`, `sortedOrderIDs` at `:264-283`, blocked reasons busy, capacity, failed, ticketed, pending_review, no pending stage); `loop/loop_cycle_pipeline.go:14` (`mergeBackpressureLimit = 128`), `:378-424`; `.agents/skills/schedule/SKILL.md` ("This is the cardinal scheduling rule").
- Tests: `internal/dispatch/dispatch_test.go` `TestPlanDispatches` (table at `:13-263`); `TestPlanCycleSpawnsSkipsPendingReviewTargets` (`loop/pending_review_test.go:178`, MaxConcurrency 2). No test of the 128 backpressure limit.
- Basis: Verified.
- Code: `internal/dispatch/dispatch.go`, `loop/loop_cycle_pipeline.go`.

**NSCHED-7. Concurrency is a global count plus optional per-runtime caps, enforced at spawn; there is no cost or token budget.**
`[concurrency] max_concurrency` (default 4) is the global ceiling, changeable at run time by the `set-max-concurrency` control command. `[runtime.process|sprites|cursor] max_concurrent` caps one runtime (defaults 4, 50, 10). Session cost is recorded (`TotalCostUSD` in session meta) but nothing in the loop, config or planner compares it to a limit. The only token figure acted on is a fixed 200,000-token context budget that turns a session's health yellow at 80%.
- Why: for the routing question, Noodle can say "prefer the cheapest model" in a skill but the loop never sees spend, so the instruction cannot be checked.
- Evidence: `config/types_defaults.go:171-196` (`DefaultConfig`); `loop/loop_cycle_pipeline.go:432-434` (`atMaxConcurrency` break); `monitor/types.go:11` (`contextTokenBudget = 200000.0`), `monitor/derive.go:45-62`; no budget, spend or quota key in `config/` or `docs/reference/configuration.md`.
- Tests: the cap is exercised only incidentally. `TestCycleRemovesStaleAdoptedSlotsBeforeScheduling` (`loop/loop_test.go:1111`) sets `MaxConcurrency = 1` with one order and asserts one spawn; `integration_scale_test.go` and `bench_test.go` set the cap equal to the order count. **No test dispatches more orders than the cap and checks that the surplus waits.** Per-runtime caps (`MaxConcurrentFor`) have no test I found.
- Basis: Verified (absence by search, not by running).
- Code: Gap upstream; and a place where our work is ahead (NSCHED-15: the sweep's quota guard parks a provider on a measured window).

**NSCHED-8. Model routing in Noodle is a default plus a per-stage override written by the scheduler agent from a prose table; nothing measures or checks it.**
Two inputs. `[routing.defaults] provider, model` (default `claude`, `claude-opus-4-6`) fills any empty stage. The schedule skill's `references/model-routing.md` has four rows: tiny tasks to codex `gpt-5.3-codex-spark` or claude `claude-sonnet-4-6`; implementation to codex `gpt-5.4`; judgement, strategy, planning and review to claude `claude-opus-4-6`; and "When uncertain, codex for implementation, opus for judgment." The skill separately says "Prefer the lowest-cost provider/model that can handle the task". Nothing links a failure to a model change; the agent may pick another model on re-queue. The mise's `routing` section gives the agent the defaults and available runtimes, not prices, speeds or pass rates.
- Why: the mechanism (a `provider` and `model` field per stage in a queue file) is reusable and Qara's Agent-tool `model` parameter already is that mechanism. The content is one author's priors and cannot be borrowed as knowledge.
- Evidence: `.agents/skills/schedule/references/model-routing.md`; `.agents/skills/schedule/SKILL.md` ("Scheduling Heuristics", "Model Routing"); `internal/orderx/orders.go:81-99`; `docs/cookbook/model-routing.md` ("This is the only runtime routing override path today"); `mise/types.go:30-39` (`RoutingSnapshot` has defaults and runtimes only).
- Tests: defaulting is covered by the orders tests (`loop/orders_test.go`); **routing quality is untested because it is prose.**
- Basis: Verified.
- Code: `internal/orderx/orders.go`; Gap upstream: no feedback from outcomes to routing.

**NSCHED-9. Read the Noodle docs for intent and the source for fact; docs, schema and architecture note disagree in several places.**
(a) The routing and multi-stage cookbooks show stages as `{"skill": "...", "status": "pending", "provider": "..."}`; the concept page and the real compact format use `do` and `with`. (b) `group`: NSCHED-5. (c) `brain/architecture.md` ("Cost and Runaway Protection") lists "Stuck detection (>120s idle)"; the code never sets `Stuck` true and has no 120 s threshold (NSCHED-11). (d) The same note says failure is "forwarded to the active scheduler session via `controller.SendMessage`", which is real but best-effort (`loop/cook_completion.go:363-395`: dropped if no scheduler session is alive or it is not steerable). (e) The architecture note says "only `active` orders are dispatchable"; the canonical planner also treats `pending` as dispatchable (`internal/dispatch/dispatch.go`). (f) The docs list the sprites runtime as a routing target; the schedule skill tells the agent "Always set `"runtime": "process"` ... The `sprites` runtime is still WIP".
- Why: any borrow list built from the docs alone would copy stale or unbuilt features.
- Evidence: the files named; `docs/thinking-in-noodle.md` is guidance on writing skills, not a specification, and makes no scheduling claim that conflicts with the code.
- Basis: Verified.
- Code: n/a.

**NSCHED-10. Recovery is startup reconciliation: reset stale in-flight stages to pending, archive failed orders into the next scheduler prompt, and rebuild merge state from git.**
On start, `Run` loads orders, loads or bootstraps the canonical checkpoint, then reconciles: recover live sessions from the runtimes and index them as adopted; ensure a schedule order exists; set every `dispatching` or `running` stage with no adopted session back to `pending`, marking its last attempt cancelled with "restart cleared stale dispatch"; remove failed non-schedule orders from `orders.json` and summarise them for the next scheduler prompt; recover stages left in `merging` by checking whether the branch is already merged, still exists (requeue the merge) or is gone (fail the stage). Stage status is persisted as `active` before spawning, "so restart + adoption reconciles orphaned stages" (`brain/architecture.md`, "Crash Safety"). A file lock refuses a second instance and `statever.CheckCompatibility` refuses a newer state version. Shutdown terminates, waits 10 s, force kills, waits 10 s.
- Why: the loop can be killed at any point and restart with no human. Failed work is neither lost nor blindly retried: the scheduler agent decides, with the reason in front of it.
- Evidence: `loop/loop.go:318-339` (`Run`), `:176-217` (`Shutdown`, `shutdownDeadline = 10 * time.Second`); `loop/reconcile.go:20-96`, `:198-266`, `:268-323`, `:357-566`; `cmd_start.go`; `loop/schedule.go:304-320`.
- Tests (bodies read): `TestReconcileFailedOrdersArchivesAndSummarizes` (`loop/reconcile_test.go:14`: the failed order is removed from `orders.json`, the schedule and active orders remain, one reconciled failure carries order id, title and failed task key); `TestReconcileResetsStaleActiveScheduleStageAndCycleDispatches` (`loop/integration_scale_test.go:569`: a stale `active` schedule stage returns to `pending` and the next cycle dispatches it) and its non-schedule twin (`:702`); the neighbouring test at `:~640` pins that a stage with a live adopted session stays `active`; `TestShutdownEscalatesToForceKillWhenSessionStaysAlive` and `TestShutdownSkipsForceKillWhenTerminateCompletesSession` (`loop/loop_shutdown_test.go:55,82`: one terminate call, force kill only when the session stays alive); `TestRunStartRefusesFutureStateVersion` (`cmd_start_test.go:83`: a future `schema_version` refuses start and the loop is never created); `TestRefreshAdoptedTargetsPrunesDeadPIDs` (`loop/reconcile_pid_test.go:15`). Merge-state recovery lives in `loop/loop_merge_reconcile_test.go` (799 lines); I read test names only for that file. **No test kills a real process mid-cycle**: recovery is tested with mocked runtimes and hand-written `orders.json` fixtures. The lock-refusal path of `start` has no test I found; `reset`'s lock check is not exercised either (NSCHED-12).
- Basis: Verified (mechanism; tested against fixtures). Behaviour under a real kill is Unverified.
- Code: `loop/reconcile.go`, `loop/loop.go`.

**NSCHED-11. There is no automatic retry and no stuck-run kill; a failed stage fails the order, and a human or the scheduler agent decides what happens next.**
`recordStageFailure` emits `stage.failed` and `order.failed`. A failed order stays in `orders.json` with `status: failed` until the next start or a `requeue` control command; dispatch skips it (blocked reason `failed`). The loop best-effort forwards the failure text to the live scheduler session. Automatic retries exist only for the schedule-skill bootstrap (three dispatch failures, then `bootstrapExhausted`) and the stale-dispatch reset on restart. `IdleSeconds` is computed and shown in the snapshot, but `Stuck` is never set true (`monitor/derive.go:112` sets `false`; `monitor/monitor.go:75` sets `false`; no other writer in `monitor/`, `loop/`, `internal/` or `server/`). The only health rules are failed (red), context use at or above 80% of 200,000 tokens (yellow), and non-running states (yellow). The schedule skill's guidance ("failed 2+ times in `recent_history`: deschedule or split") is prose.
- Why: a gap relative to Qara (a written ladder, NSCHED-13) and csf (a coded cap on refused retries, NSCHED-14). Noodle trusts the agent to count failures from history, and its architecture note describes a stuck detector that the code does not contain.
- Evidence: `loop/cook_failure.go:11-31`; `loop/cook_completion.go:363-395` (`forwardToScheduler`); `internal/dispatch/dispatch.go` (blocked reason `failed`); `loop/schedule.go:238-262`; `monitor/derive.go:45-62,112`; `loop/control.go:239-282`; `brain/architecture.md` ("Scheduler-driven recovery: No automatic retry"); `.agents/skills/schedule/SKILL.md` ("Timebox failures").
- Tests: `TestFailedOrderRequiresRequeueBeforeDispatch` (`loop/control_test.go:876`, body read: a failed order yields no candidates; after `controlRequeue` it yields one) pins the manual-requeue path; `TestBootstrapExhaustedAfterThreeFailures` (`loop/bootstrap_test.go:214`) pins the bootstrap cap; `TestCycleMergeConflictMarksFailedAndSkips` (`loop/loop_merge_reconcile_test.go:100`) pins merge failure; `TestCycleDispatchFailureMarksStageFailed` (`loop/loop_test.go:415`). Nothing tests stuck detection, since it does not exist.
- Basis: Verified (by search of `monitor/`, `loop/`, `internal/`, `server/` for `Stuck` and idle handling).
- Code: Gap upstream.

**NSCHED-12. Start and reset are small; reset is a blunt delete and its safety check is untested.**
`noodle start` takes the lock, checks the state version, builds the loop, optionally starts the UI server, then runs; `--once` runs one `Cycle` and exits. `noodle reset` tries the lock, refuses if another process holds it, then `os.RemoveAll(.noodle)` and recreates the directory. It archives nothing and does not touch worktrees or branches left by killed stages. `start_boundary.go` classifies startup problems as abort, prompt-repair (missing adapter scripts, fixed by spawning an agent) or warning-only. `startup/firstrun.go` creates the project structure on first run (`brain/` and `.noodle/`), writing only files that do not exist.
- Why: the useful ideas are the lock and `--once` (one decision on demand), not reset.
- Evidence: `cmd_start.go`; `cmd_reset.go`; `start_boundary.go:1-80`; `startup/firstrun.go:13-86`.
- Tests (bodies read): `TestRunStartOnceUsesLoopCycle` (`cmd_start_test.go:45`: one `Cycle`, zero `Run` calls, a logger injected); `TestResetRemovesRuntimeState` (`cmd_reset_test.go:9`: `.noodle` exists and is empty afterward; it writes a `noodle.lock` file but does not hold the lock, so **the "refuse while running" branch is not tested**); `TestResetToleratesMissingDir` (`:55`).
- Basis: Verified.
- Code: `cmd_start.go`, `cmd_reset.go`, `start_boundary.go`, `startup/firstrun.go`.

**NSCHED-13. Qara's delegation tiers and escalation ladder are a stronger routing policy than Noodle's table, and should stay a policy for an orchestrator rather than become a scheduler agent.**
Qara fixes the tier in agent frontmatter, mirrors it in a generated roster with a drift gate, and has a written ladder: self-check, then haiku, sonnet, opus, then JM (`qara:context/delegation-roster-and-tiers.md`, "Model Tier Escalation"); critic, verifier and reviewer get three attempts, the third at opus with an `[ESCALATED]` marker. Turbo adds a dispatch matrix ("start at the lowest tier that plausibly covers the subtask"), a failure classifier that chooses the retry (`cap-hit`, `oom`, `tool-error` go up a tier or shrink scope; `context-drop` retries once), and "Max 2 re-dispatches per subtask" (`qara:skills/turbo/SKILL.md:82-146`). The orchestrator is forbidden from doing work itself and ventilates engineer levels "by difficulty" (`qara:context/delegation-guide.md:35-48`). The pi skill states the other side of the same policy: "Forward requested `--provider`, `--model`, and `--thinking` unchanged ... do not invent model routing", and a GLM route only on request, with a failing approved route "a block reported to JM ... never a silent switch" (`qara:skills/pi/SKILL.md:69-70,97-105`). Against this, Noodle has four prose rows, no ladder, no failure classifier, no re-dispatch cap, no drift check and no escalation record. Where Noodle is ahead: its routing is expressed per stage in a file, so a plan can be read and diffed before it runs; Qara's routing is chosen at spawn time in the orchestrator's head.
- Why: the owner's question was replace or inform. Replacement would move enforced rules (frontmatter, a hook that corrects invalid models, a caps-and-ladder written in the mode skills) into a prompt the scheduler may or may not follow, which is a step back on LADDER-2 and LADDER-9. Inform is limited to the per-stage-file idea and the reject-and-repair handshake.
- Evidence: the Qara paths above; `qara:context/model-policy.md` (generated roster, `scripts/model-policy-index.ts check`); `factory/harness-loops-graphs.md` LADDER-2, LADDER-9.
- Basis: Verified for what each system contains; the comparative judgement is Unverified.
- Code: Qara side exists. No change recommended.

**NSCHED-14. csf's drain already is a scheduler, a better-specified one; the difference is who decides, not whether there is a loop.**
`scheduleNext` is a pure function over one `DrainGraph` snapshot (`csf:src/drain/drain-schedule/drain-schedule-next.ts:1-50`: "no fs, no git, no process, no clock"). It tracks two resources apart: slots (at most 5 pi panes; a node uses one only while a dispatch is in flight) and lanes (5 persistent checkouts, held while a node is `building`, `reviewing`, `fixing` or `solving`, `csf:src/drain/drain-config/drain-paths.ts:72-100`). Dispatches are staggered at least `staggerMs` (60,000 ms) apart from a cursor of `max(now, lastDispatchAt + staggerMs)` (`drain-schedule-next.ts:130-190`). Node order is `byRankDescThenId`; a `fixing` node refused `REFUSED_RETRY_CAP = 3` times in a row is held, not retried (`drain-schedule-holds.ts:24,52-54`); fix rounds are capped (`fixRoundCap: 2`) before escalating to a solver; admission holds gate entry; trains of up to 3 land together. State lives in a SQLite pipeline store read through read-only views (`csf:src/drain/csf-drain-views.ts`: `status`, `next`, `reconcile`, each with `--json`, opened fail-closed). No model is asked what to run next. The cost shows in cub's `factory/work-orders/queue.md`: the Depends-on column carries hand-written notes such as "ordering only: edits tracked spec input `qa/drive.ts`, so fix rounds hold on BRIEF-HOLD; run alone or last".
- Why: an agent could inform csf by proposing those ordering notes from the work orders' file footprints. It should not replace the pure function: that function is deterministic, testable, and carries invariants Noodle lacks (lane and slot accounting, stagger, retry and fix-round caps, admission).
- Evidence: the csf files above; `/media/ssdev/tg-pro/cub/factory/work-orders/queue.md` (rows WO-199, 201, 204, 207 for the notes).
- Basis: Verified for csf's mechanism; "an agent could propose the order well" is Unverified.
- Code: csf side exists. A proposal step would be new (Borrow rank 3).

**NSCHED-15. The sweep supports routing by measured cost per finished task, and says Noodle's "implementation to codex" row is plausible on cost and speed while its small-model row is untested.**
In the 2026-11-22 full sweep (five small-to-medium tasks, hidden tests, medium effort), GLM and Codex each passed 25 of 25 runs. Per pass: Codex 266k tokens, about $0.128 notional, median wall 68 s; GLM 1,221k tokens, about $0.053, median wall 249 s. On the largest task GLM used about 9.3 times Codex's tokens by median. The Claude cells had 4 passing runs; 70 Claude runs were deferred when the five-hour quota window reached the guard's 0.98 park threshold. Pass rate did not separate any model, so the figures speak to cost and time, not to quality on hard work; a router that chose by difficulty needs a harder task set first.
- Why: this answers how the data bears on routing. GLM is cheaper per pass, Codex faster, and on Claude the binding constraint was quota, not price. A scheduler that read this table could route sensibly; Noodle's has no such table to read, and the loop does not read spend.
- Evidence: `inference/sweep-results-full-20261122.md` lines 11-20 (cell table) and 31-48 (token ratios, the park event); its line 8: "pass rate does not discriminate between models here".
- Basis: Verified (a reading of our committed results). The routing implication is Unverified.
- Code: Gap: nothing consumes these results (Borrow rank 2).

**NSCHED-16. Inform csf and Qara with Noodle's handshakes rather than importing its loop.**
Noodle is a single-project Go loop with its own state model (a canonical reducer, effect ledger, snapshots and projection, `brain/architecture.md` "Key Go Packages"). `loop/` is 20,521 lines including tests and `internal/` has 20 subpackages. csf and Qara have the corresponding machinery already: csf's ledger, lanes and recovery (`csf:src/drain`, `src/lanes`, `src/recovery`), Qara's mode state and Stop-hook controls (`qara:skills/core/LOOP-CONTROL.md`: promise scan, stall detection, max iterations, in that precedence; defaults cruise 20, turbo 30, drive 50). What transfers is narrow. A scheduler agent adds a model call per cycle and a new failure surface (a bad queue) in exchange for ordering that csf computes for free.
- Why: each borrow must earn its keep, and Qara has been deleting machinery.
- Evidence: the files above; the Borrow list.
- Basis: Unverified (judgement).
- Code: see Borrow list.

**NSCHED-17. csf cannot name a model per stage today, by explicit ruling, and already has a richer snapshot than Noodle's mise.**
csf passes no `--model` at any dispatch site; "the route in force is pi's default", and the id `routing-policy-2026-08-25` is threaded through pi-run's `--routing-policy` flag as a recording label only. The rulings RT-21 (assembler) and RT-22 (reviewer) are "no change"; RT-23 (validator) and RT-24 (planner) are "insufficient evidence to change". The pre-launch login check reads pi's `settings.json` default provider because csf leaves the model to pi (`csf:src/engine/routing-policy.ts:1-14`, `csf:src/engine/stage-dispatch-pane.ts:179-219`, `csf:src/runner/pi-login-preflight.ts:89-125`). For the snapshot question: `csf-drain status`, `next` and `reconcile` are read-only JSON views over the store (`csf:src/drain/csf-drain-views.ts:1-50,86-131`), so a mise-equivalent already exists and needs no new artefact.
- Why: this answers both questions I had open. A per-stage model field in csf would reverse a recorded ruling and needs evidence the sweep does not yet give (NSCHED-15); a snapshot file is not needed.
- Evidence: the csf paths above.
- Basis: Verified.
- Code: csf side; no change recommended until a ruling changes.

**NSCHED-18. Qara's two loops stop on a drained or converged test and are re-armed by a human or a handoff, so a Noodle-style idle cooldown has nothing to attach to.**
`ticket-round-loop` runs exactly one round per fresh session and ends with a drained check against the RUNBOOK's predicate, a `PAUSE` sentinel file for JM, and stop conditions (same step fails 3 times, dirty tree not yours, and others); selection is by ticket `Class` and `Area` fields with at most 3 tickets per round (`qara:skills/ticket-round-loop/SKILL.md`, "The round", "Stop conditions"). `improve-loop` stops when "stages 0b and 1 created no new Finding and no deferred retry candidate survived the grill", even with budget left (`qara:skills/improve-loop/SKILL.md:216-220`). Neither polls or re-plans on a timer, so neither re-plans when nothing changed. The drain skill that wraps csf's `scheduleNext` is outside this reading.
- Why: this answers my earlier open question 3. The empty-schedule cooldown solves a continuous-loop problem Qara's round-based loops do not have, so it is dropped from the borrow list.
- Evidence: the two skill files.
- Basis: Verified.
- Code: none.

## Reference

### One loop cycle, step by step (`loop/loop.go`, `loop/loop_cycle_pipeline.go`, `brain/architecture.md`)

```
Run (loop/loop.go:318):
  loadOrdersState -> loadOrBootstrapCanonical -> reconcile -> hydrateProcessedCommands -> Cycle
  then: skill watcher (hot reload) + fsnotify on .noodle/ + a poll ticker -> cycleTrigger -> runOnce

Cycle, maintenance phase:
  1. fail fast if the skill registry failed 3+ times in a row
  2. drain completions (live and adopted sessions)
  3. drain merge results
  4. process control.ndjson commands
  5. drain completions again; 6. drain merge results again
Cycle, main pipeline:
  7. rebuild the skill registry if the watcher marked it stale
  8. buildCycleBrief: refreshAdoptedTargets; mise.Build(active summary, recent history) -> mise.json
     (the loop leaves idle state if it was idle; returns miseChanged)
  9. prepareOrdersForCycle:
       a. mergeOrdersNext: read orders-next.json, parse compact (strict), validate, merge into orders
       b. handlePromotionResult: on success write orders, remove orders-next.json, cancel active
          cooks the new orders supersede, persist the canonical checkpoint; empty result starts the
          5-minute cooldown; on error record lastPromotionError (NSCHED-3)
       c. if miseChanged, reset the cooldown
       d. normalizeOrders (NormalizeAndValidateOrders; on failure rebuild registry, audit, else
          replace orders with a repair schedule order)
       e. ensureScheduleIfNeeded: bootstrap or inject the schedule order (NSCHED-2)
       f. applyRoutingDefaults: fill empty provider/model from [routing.defaults]
 10. planCycleSpawns: stop if merge queue > 128; block ticketed and pending-review orders;
     dispatch.PlanDispatches(canonical, capacity, blocked)
 11. spawnPlannedCandidates: spawnCook per candidate, break at atMaxConcurrency; stage status is
     persisted active before the session starts
 12. flush state; 13. publish the in-memory snapshot (web UI); 14. stamp status.json
After a stage completes: the result enters the completion buffer; in auto mode the cook's branch
enters the serialised merge queue (rebase on main, fast-forward), the stage becomes completed and
the next stage of the order becomes dispatchable; in supervised or manual mode it parks for review
(NMODE). A failed stage fails the order and is forwarded to the scheduler session if one is live.
```

### Files on disk (`.noodle/`)

| File | Writer | Meaning |
| --- | --- | --- |
| `mise.json` | loop | Scheduler snapshot (schema below) |
| `orders-next.json` | scheduler agent | Proposed queue, compact format; removed after promotion or on a parse error |
| `orders.json` | loop | Live queue; the canonical state projects to it (plan 115 is moving authority off this file) |
| `orders.json.bad.<ns>` | loop | Archive of an invalid queue before repair |
| `control.ndjson`, `control-ack.ndjson` | humans, UI, agents; loop | Append-only commands under `flock`, idempotent replay by id, acknowledgements |
| `loop-events.ndjson` | loop | Lifecycle events: `stage.failed`, `order.failed`, `registry.rebuilt`, promotion failed, bootstrap exhausted |
| `status.json`, `state.json` | loop | Status for the CLI; version marker checked at start |
| `noodle.lock` | `start` | Single-instance lock |
| `pending-review.json` | loop | Stages parked for human review |
| `sessions/<id>/` | runtimes | Per-session logs, `meta.json`, process info used for adoption |

### `mise.json` (`mise/types.go:11-68`, `adapter/types.go:17-23`)

```go
type Brief struct {
    GeneratedAt   time.Time             `json:"generated_at"`
    Backlog       []adapter.BacklogItem `json:"backlog"`
    ActiveSummary ActiveSummary         `json:"active_summary"`
    Tickets       []event.Ticket        `json:"tickets"`
    Resources     ResourceSnapshot      `json:"resources"`
    RecentHistory []HistoryItem         `json:"recent_history"`
    RecentEvents  []RecentEvent         `json:"recent_events"`
    Routing       RoutingSnapshot       `json:"routing"`
    TaskTypes     []TaskTypeSummary     `json:"task_types,omitempty"`
    Warnings      []string              `json:"warnings,omitempty"`
}
ActiveSummary    { total, by_task_key{}, by_status{}, by_runtime{} }
ResourceSnapshot { max_concurrency, active, available }
HistoryItem      { session_id, order_id, task_key, status, duration_s, completed_at }
RoutingSnapshot  { defaults{provider, model}, available_runtimes[] }
TaskTypeSummary  { key, schedule }
RecentEvent      { type, seq, at, summary }
BacklogItem      { id, title, status, plan, + adapter-defined extra fields }
```

### `orders.json`, stages and orders (`internal/orderx/types.go:11-59`)

```go
StageStatus: pending | active | merging | completed | failed | cancelled
OrderStatus: active | completed | failed
type Stage struct {
    TaskKey string; Prompt string; Skill string
    Provider string `json:"provider"`; Model string `json:"model"`
    Runtime string; Group int; Status StageStatus
    Extra map[string]json.RawMessage; ExtraPrompt string
}
type Order struct { ID, Title string; Plan []string; Rationale string; Stages []Stage; Status OrderStatus }
type OrdersFile struct { GeneratedAt time.Time; Orders []Order; ActionNeeded []string }
```
The canonical state (`internal/state/state.go`) also tracks order status `pending`, stage statuses `dispatching`, `running`, `merging`, `review` (the busy set, `:180-186`), per-stage `Attempts` (launching, running, cancelled and others), each order's arrival `Sequence`, and a run `Mode`.

### `orders-next.json`, the scheduler's wire format (`internal/orderx/compact.go:11-33`)

```go
type CompactStage struct {
    Do, With, Model, Runtime, Prompt, ExtraPrompt string
    Extra map[string]json.RawMessage; Group int
}
type CompactOrder struct { ID, Title string; Plan []string; Rationale string; Stages []CompactStage }
type CompactOrdersFile struct { Orders []CompactOrder; ActionNeeded []string }
```
Unknown fields are rejected; an empty `{"orders": []}` means "scheduling ran and found nothing" and starts the cooldown.

### Config keys that bear on scheduling (`config/types_defaults.go:15-110,171-196`)

| Key | Default | Meaning |
| --- | --- | --- |
| `mode` | `supervised` (since 0.1.4) | `auto`, `supervised`, `manual`; changeable at run time |
| `[routing.defaults] provider, model` | `claude`, `claude-opus-4-6` | Fill-in for stages that omit them |
| `[concurrency] max_concurrency` | 4 | Global ceiling |
| `[runtime] default` | `process` | Default runtime |
| `[runtime.process] max_concurrent` | 4 | Per-runtime cap (0 means none) |
| `[runtime.sprites] max_concurrent`, `token_env`, `base_url`, `sprite_name`, `git_token_env` | 50 | Remote VM runtime (NADAPT) |
| `[runtime.cursor] max_concurrent`, `api_key_env`, `base_url`, `repository` | 10 | Stub runtime |
| `[agents.claude\|codex] path, args` | | Provider binaries |
| `[skills] paths` | default skill paths | Where task types are found; hot-reloaded |
| `[adapters.<name>] skill, scripts` | | Backlog adapters (NADAPT) |
| `[server] port, enabled` | 3000, auto | Web UI (NVIEW) |

There is no key for retries, timeouts, stuck thresholds, budgets or per-provider limits.

### Control commands (`loop/control.go:239-282`)

pause, resume, drain, skip, kill, steer, merge, reject, request-changes, mode, enqueue, stop-all, requeue, edit-item, reorder, stop, set-max-concurrency, advance, add-stage, park-review. Anything else is "unsupported action".

### Scheduler prompt, assembled in code (`loop/schedule.go:284-340`)

Fixed lines: use the skill against `mise.json`; write to `orders-next.json`; do not modify the mise; operate autonomously and ask only when the backlog is empty; "Each order is a pipeline of stages"; failed orders are archived and described below. Then the rendered `orders` JSON schema, then "Task types you may schedule:" with each `schedule` hint, then, if present, the previous promotion error, chef guidance, archived failures, up to 20 adapter warnings and any resume prompt.

### Embedded agent instructions found (not followed)

- `loop/builtin_bootstrap.go` and `loop/schedule.go:121-127`: the bootstrap prompt tells an agent to create `.agents/skills/schedule/SKILL.md` and commit it in its worktree, naming a GitHub URL as the model. Risk: an agent writes and commits a skill file unprompted by a human when a skill is missing.
- `.agents/skills/schedule/SKILL.md`: "Operate fully autonomously. Never ask the user to choose or pause for confirmation"; its cited principle `never-block-on-the-human` (`brain/principles/never-block-on-the-human.md`, not read in full) pushes the same way. Bounded here by the `supervised` default and the merge gate (NMODE).
- `loop/schedule.go:289-291`: when the backlog is empty, "ask whether to schedule an order that creates a backlog adapter".
- `docs/thinking-in-noodle.md` recommends `npx skills add https://github.com/anthropics/skills --skill skill-creator` (installing a third-party skill). It is addressed to Noodle users, and I did not run it.
No instruction to store credentials, use sudo, push or disable checks was found in the scheduling files.

### Test coverage summary

Pinned by test bodies read: bad-JSON rejection and file removal; repair prompt content; repair order on invalid state; failed-order archive and summary; stale-stage reset and re-dispatch (schedule and non-schedule); manual requeue of a failed order; bootstrap cap of three; shutdown terminate-then-force-kill; start refused on a future state version; `--once` runs one cycle; reset empties `.noodle`; one candidate per order including grouped stages. Not pinned: the 5-minute cooldown; the merge backpressure limit of 128; a surplus of orders waiting at the concurrency cap; per-runtime caps; reset refusing while locked; start refusing on a held lock; any stuck detection; a real kill and restart; routing quality. Merge-recovery tests (`loop/loop_merge_reconcile_test.go`) were read by name only.

### Judgement: sound, weak, unfinished

Sound: agent writes a file, loop validates and dispatches; atomic promotion; repair prompt; lifecycle owned by code; reconcile on start; serialised merges; lock; `--once`. Weak: routing is prose; no cost budget; no retry policy; no stuck kill; reset deletes everything; the architecture note over-claims. Unfinished or dropped: parallel groups, sprites, plan 115 (still `active`: `orders.json` is mid-way from authority to projection). Release state: v0.1.5 on 2026-03-03, last push 2026-03-19; nothing in this clone shows these gaps being worked.

## Borrow list

Ranks changed from the first pass: the cooldown row is dropped (NSCHED-18), the snapshot and `--once` rows are dropped (NSCHED-17, csf already has views and a read-only `next`), and the per-stage model row is deferred behind a recorded ruling.

| Rank | What | Target file and change | Size | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | Reject-record-reprompt convention for any agent-written structured file | New short section in `qara:context/delegation-guide.md` (or a context file it links) stating: validate agent output in code, keep the bad file under a `.bad.<ts>` name, re-prompt with the exact validator error, and class it as the agent's mistake. First user: `qara:skills/ticket-round-loop/scripts/promote-tickets.ts` and the intake adapters (`references/intake-contract.md`), which already stage agent-authored tickets; today a malformed ticket "refuses the whole batch with exit 1 and leaves the plan untouched" (`intake-contract.md:40`), so the change is to keep the rejected batch under a `.bad.<ts>` name and hand the validator message back to the adapter run. | S | Low | None |
| 2 | Put the sweep's cost, time and quota figures where model choice reads them | `qara:context/model-policy.md`: add a section "Measured routing evidence" with the NSCHED-15 table (GLM, Codex, Claude cells, the park event) and its caveat that pass rate did not discriminate; link from `qara:context/delegation-roster-and-tiers.md` "Model Tier Escalation". No tier changes. | S | Low; one sweep on easy tasks | A harder task wave before any default moves |
| 3 | Advisory ordering proposal for csf's queue from file footprints | A cub-side step before admission (csf owner's call): an agent run reads the draft work orders, lists files each touches, and proposes the Depends-on "ordering only" notes in `factory/work-orders/queue.md` for the operator to accept. `scheduleNext`, admission and rank stay unchanged. | M | Medium: a wrong proposal serialises or collides work; keep advisory | Owner decision (Open 1); csf is read-only for me |
| 4 | Show the plan before it runs: per-stage `agent`/`model` written into a queue or ticket line | `qara:skills/ticket-round-loop/references/intake-contract.md:21` already has an `Agent` ticket field (`engineer` or `engineer-high`, used at dispatch); add an optional `Model` field there and in `scripts/intake-contract.ts` so a round's routing is visible in the plan file before dispatch. Qara's Agent call already accepts the `model` override. | S | Low | None |
| 5 | A failure-classifier-driven retry table for the drain | Compare `qara:skills/turbo/SKILL.md:118-146` (cap-hit, oom, tool-error, context-drop, unknown) with `csf:src/drain/drain-schedule/drain-schedule-holds.ts` (`REFUSED_RETRY_CAP`, fix-round cap). Only if the comparison shows csf lacks a class of retry that turbo has. This is a check, not a build. | S | Low | Reading `csf:src/drain` retry paths in full |

**Not worth borrowing**
- The `group` field and parallel-stage claim (NSCHED-5): not run by the dispatch code, and pinned off by a test.
- The four-row routing table and "prefer the cheapest model" instruction (NSCHED-8): unmeasured and unenforced; our data is better.
- A scheduler agent replacing `scheduleNext` or Qara's tiers (NSCHED-13, 14): it loses determinism, lane and slot accounting, stagger, caps and admission.
- The empty-schedule cooldown (NSCHED-18): Qara's loops are round-based and stop on a drained or converged test.
- A mise-style snapshot file (NSCHED-17): csf's `status`/`next`/`reconcile` views exist.
- The canonical reducer, effect ledger and projection machinery: large, and Noodle itself is mid-migration (plan 115).
- `reset` as `RemoveAll` (NSCHED-12); the sprites and cursor runtimes (NADAPT); the "never block on the human" line (Qara's escalation to JM is deliberate).

## Open

Only questions that need the owner. Each can be asked on its own.

1. Should csf's work-order ordering notes be proposed by an agent from file footprints, with admission and `scheduleNext` unchanged (Borrow 3)? Recommend yes, as an advisory step trialled on one drain, because the notes are hand-written today and a miss costs a BRIEF-HOLD round. It is the csf owner's step to take.
2. Should the sweep table go into `qara:context/model-policy.md` now (Borrow 2), or wait for a harder task wave? Recommend now, labelled as evidence with its caveat and with no tier change: it costs nothing and puts the numbers where a routing decision reads them.
3. Should csf ever name a model per stage? The recorded rulings RT-21 to RT-24 say no change. Recommend leaving it alone until a harder sweep shows a model difference worth a ruling; the owner owns that ruling.

**Facts still unknown**
- Whether Noodle's scheduler converges when it writes bad output repeatedly (no test).
- Whether parallel groups ever ran, and whether plan 115's planner cutover removed them (single-commit clone).
- Behaviour under a real process kill and restart (tests use mocks and fixtures).
- Merge-recovery behaviour in detail: I read `loop/reconcile.go` but only the test names in `loop/loop_merge_reconcile_test.go`.
- Real-world use of Noodle by anyone but its author, and how its routing performs there.
- Whether csf's drain skill (the in-session wrapper around `scheduleNext`) has its own ordering or retry rules beyond the code; not read.
- Cross-document points: skills and `schedule` hints (NSKILL); mode gating, worktrees and the merge queue (NMODE); adapters, sprites and the event stream (NADAPT); monitor, UI and CLI (NVIEW); `brain/` principles the schedule skill cites (NBRAIN).

## Sources

Noodle (commit `82d2921c52370f23f29086de81ccfb600939c037`), read: `loop/schedule.go`, `loop/loop.go` (to line 420), `loop/loop_cycle_pipeline.go`, `loop/reconcile.go`, `loop/control.go` (dispatch table), `loop/cook_failure.go`, `loop/cook_completion.go` (forwarding and adopted completion), `loop/failure_envelope.go`, `loop/orders.go` (dispatchableStages), `internal/dispatch/dispatch.go`, `internal/state/state.go` (busy index), `internal/orderx/{types,orders,compact}.go`, `config/types_defaults.go`, `mise/types.go`, `adapter/types.go`, `monitor/{derive,monitor,types}.go`, `cmd_start.go`, `cmd_reset.go`, `start_boundary.go`, `startup/firstrun.go`; `.agents/skills/schedule/SKILL.md` and `references/model-routing.md`; docs `docs/concepts/scheduling.md`, `docs/concepts/modes.md` (header), `docs/cookbook/{model-routing,multi-stage-pipeline,minimal-noodle-loop}.md`, `docs/thinking-in-noodle.md`; `brain/architecture.md` (whole), `brain/plans/index.md`, `brain/archive/completed_todos.md` (items 75, 81), `brain/archive/plans/81-stage-groups/{overview,phase-03-dispatch}.md`, `brain/plans/115-canonical-state-convergence/{overview,phase-03-dispatch-planner-cutover}.md`; `CHANGELOG.md` (0.1.2 to 0.1.5). Test bodies read: `internal/dispatch/dispatch_test.go` (grouped case), `loop/orders_test.go` (invalid JSON, no-existing-orders), `loop/schedule_test.go` (prompt tests), `loop/failure_envelope_test.go` (repair), `loop/reconcile_test.go`, `loop/integration_scale_test.go` (stale-stage tests), `loop/loop_shutdown_test.go`, `loop/loop_test.go` (stale adopted slots), `loop/control_test.go` (failed requeue), `cmd_start_test.go`, `cmd_reset_test.go`.

csf-build (read only): `src/drain/drain-schedule/drain-schedule-next.ts`, `drain-schedule-holds.ts`, `src/drain/drain-config/drain-paths.ts`, `src/drain/csf-drain-views.ts`, `src/engine/stage-dispatch-contract.ts`, `src/engine/stage-dispatch-pane.ts`, `src/engine/routing-policy.ts`, `src/runner/pi-login-preflight.ts`; cub `factory/work-orders/queue.md`.

Qara: `.claude/context/delegation-roster-and-tiers.md`, `.claude/context/model-policy.md`, `.claude/context/delegation-guide.md` (sections 35-60, headings), `.claude/skills/core/LOOP-CONTROL.md`, `.claude/skills/ticket-round-loop/SKILL.md`, `.claude/skills/improve-loop/SKILL.md` (stop and converge lines), `.claude/skills/turbo/SKILL.md:82-150`, `.claude/skills/pi/SKILL.md` (routing sections), `.claude/skills/pi/references/pi-subagents.md` (concurrency grep only).

Tobogan: `inference/sweep-results-full-20261122.md`, `factory/harness-loops-graphs.md`, `factory/loops-and-graphs.md`, `DOCTRINES.md`.

Still unread, with reason: Noodle `loop/` merge-recovery test bodies, `loop/merger.go`, `loop/cook_spawn.go` beyond the lines cited, `docs/concepts/modes.md` body and the rest of `brain/plans/` and `brain/archive/plans/` (modes and runtimes belong to NMODE and NADAPT; plans 69, 84, 86, 88, 90, 96-101, 119 do not concern the loop, scheduler, orders, groups, retries or recovery by their titles; archive plans 70, 83, 34, 43 and 108 concern scaling, error taxonomy, failed-target reset, self-healing and the orders DSL and were not read in full, so NSCHED-3 and NSCHED-11 rest on code and tests, not on those plans); Qara `bsvc` usage beyond the pi skill, the cruise and drive skills beyond their tier lines, `delegation-guide.md` beyond the orchestrator and escalation sections, and the `drain` skill that wraps csf's scheduler; csf's retry paths outside `drain-schedule-holds.ts`.
