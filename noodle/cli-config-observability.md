# NVIEW: Noodle's CLI, configuration, monitor, server and UI, and how the project is engineered

**Track:** noodle · **Type:** research · **Date:** 2026-11-23

**Question:** what do Noodle's command line, its `.noodle.toml` and `.noodle/` state directory, its monitor, HTTP/WebSocket server and web UI, its install path and its own agent-facing engineering practice do, how good are they, and which of them are worth borrowing for Qara (its scripts, checks, statusline and cross-harness layout) and csf (`csf-drain`, `csf-advance`, anchor coverage) or for tobogan's `board/`, or worth running as they are?

**Scope.** One of six documents on the `noodle` track. This one covers the CLI (`root.go`, every `cmd_*.go`, `cmdmeta/`, `internal/schemadoc/`), configuration (`config/`, `startup/`, the `.noodle/` layout), observability (`monitor/`, `server/`, `internal/snapshot/`, `ui/`, `stamp/`), install and onboarding, the engineering of the repository itself (`CLAUDE.md`, `.agents/`, `.claude/`, `.codex/`, `e2e/`, fixtures, generated types, `CHANGELOG.md`), and project health. The scheduler loop is NSCHED, skills are NSKILL, the brain is NBRAIN, modes, review and worktrees are NMODE, adapters, events and runtimes are NADAPT. They are cross-referenced by prefix, not described.

**Sources.**
- Noodle (`poteto/noodle`, MIT, Go, v0.1.5) at commit `82d2921c52370f23f29086de81ccfb600939c037` (head of the clone, 2026-03-19), read from a local depth-one clone. Paths are relative to the Noodle repo root. Nothing in it was built, run or installed.
- Public GitHub metadata for `poteto/noodle`, read with `gh` on 2026-11-23 (repository, releases, issues, pull requests, commits, release assets). Read only; nothing private was sent.
- brainmaxxing at `ec4d8e43dee639d6f5d94aed3ca16af7b298ecfc` (only where it bears on engineering practice).
- Qara at `$HOME/qara` and csf-build as installed in `cub` (`node_modules/csf-build`), the csf-board server at `/media/ssdev/tg-pro/csf-board`: read only, nothing run, nothing run in `cub`.
- tobogan's own `board/`, `factory/` and `inference/`.

"Verified" means read in Noodle source or docs at the SHA above (`path:line`), or read in the Qara, csf or board file named, or fetched from GitHub on the date given. Every judgement about fit for Qara or csf, and every analogy, is "Unverified" until tried. Nothing is "Tested": nothing was run. The test that pins each doctrine, if any, is in the Reference table "Tests that pin each doctrine".

## Doctrines

**NVIEW-1. Treat the CLI as small and read-mostly: eight commands, and steering is not among them.**
The root command registers `start`, `version`, `skills`, `schema`, `status`, `worktree`, `event` and `reset` (`root.go:69-78`). `start` runs the loop; `status` prints one line; `skills list`, `schema [target]` and `version` are read-only; `worktree` (create, exec, merge, cleanup, list, prune, hook) wraps git; `event emit` appends to an NDJSON log; `reset` deletes `.noodle/`. There is no `pause`, `resume`, `steer`, `kill` or `enqueue` command. Those exist only as control actions sent to the web server (NVIEW-6).
- Why: a self-describing CLI has little to describe here, and an agent that wants to steer a running loop has no command for it, only an HTTP endpoint or a file.
- Evidence: `root.go:69-78`; `docs/reference/cli.md:1-176`; the action list in `server/ws_hub.go:354-361`.
- Basis: Verified
- Code: none to add; this is a description.

**NVIEW-2. The "self-describing" part of Noodle's CLI is a one-source `Short` table and a schema command that cannot drift from the structs; there is no machine-readable description of the CLI itself.**
`cmdmeta/cmdmeta.go` holds one Go value, `Commands()`: each command's name, short text and flags. The cobra commands take only their `Short` text from it (`cmdmeta.Short("worktree", "create")`); flags are declared again in cobra (`cmd_start.go:57`). The checked-in `noodle` skill is not generated from the table: `generate/skill_noodle.go` holds the skill as a static Go string ("The content is static", line 7); the generator writes it to `.agents/skills/noodle/SKILL.md` and CI fails if that file differs (`.github/workflows/test.yml`, "Check skill snapshot"). A unit test checks seven command names appear in the text (`generate/skill_noodle_test.go`). So the command table, the cobra flags, the skill's CLI tables and `docs/reference/cli.md` are four hand-kept copies. The strong mechanism is `noodle schema`: `schema list` prints `name<TAB>description`; `schema <target>` prints a markdown page with a JSON schema derived by reflection from the real Go struct (`mise.Brief`, `orderx.CompactOrdersFile`, `statusfile.Status`) plus field docs and constraints (`internal/schemadoc/specs.go:34-127`, `render.go:18-44`). `validateSpec` fails in both directions: a struct leaf with no doc entry, or a doc entry with no struct leaf (`render.go:89-118`), and a test runs it on every target. `RenderPromptJSON` (`render.go:47-68`) emits the same schema for injection into the scheduler prompt, so the contract the agent is told is the contract the code parses.
- Why: the reflect-from-struct schema with a two-way drift check is the part worth studying: the agent reads the schema from the binary, not from a doc that can go stale. Weak points: three targets only; no `--json` on any command and no command-tree dump; the skill's tables and the cobra tree can drift unseen beyond the seven-name test; and `schema list` still says the mise is "generated by `noodle mise`" (`specs.go:39`), a command that does not exist in `root.go:69-78`.
- Evidence: `cmdmeta/cmdmeta.go:24,63`; `cmd_schema.go:13-59`; `internal/schemadoc/specs.go:34-127`; `internal/schemadoc/render.go:18-118`; `generate/skill_noodle.go:1-12`; `.github/workflows/test.yml`; `generate/skill_noodle_test.go`.
- Basis: Verified
- Code: Qara and csf are not blank here (NVIEW-13).

**NVIEW-3. One state directory, `.noodle/`, holds every runtime file; files are plain JSON or NDJSON, one lock guards the loop, one marker versions the format, and the directory is deletable.**
`App.RuntimeDir()` is `<project>/.noodle` and nothing else (`app_helpers.go:23-29`). The files are listed in the layout table in the Reference. `noodle reset` takes the lock, deletes the directory and recreates it empty (`cmd_reset.go:25-57`); `noodle start` takes `noodle.lock` first and refuses to run twice on one project (`cmd_start.go:75-83`). `state.json` carries `schema_version` (currently 1); a binary that finds a newer version refuses to start (`internal/statever/statever.go:67-83`, `cmd_start.go:86`).
- Why: one directory with one lock and one version marker makes state inspectable with `cat`, resettable, and ignorable by git. The cost: about fifteen files with several writers (NVIEW-7 is one race), and a schema version of 1 shows no migration has yet been needed.
- Evidence: `app_helpers.go:23-29`; `cmd_start.go:75-86`; `cmd_reset.go:25-57`; `internal/statever/statever.go`; file names collected by `rg` over the Go sources.
- Basis: Verified
- Code: Qara and csf keep state elsewhere by design (NVIEW-14).

**NVIEW-4. Configuration is one TOML file with warn-and-default validation, and almost nothing is fatal.**
`.noodle.toml` is decoded with BurntSushi/toml. Absent keys take defaults by `metadata.IsDefined`; unknown keys become a `config_field_unknown` warning; removed keys a named `config_field_removed` warning (`recovery`, `monitor`, `routing.tags` and four `concurrency.*` keys); bad values are normalised with a `config_value_normalized` warning (`config/parse.go:49-323`). `Validate` then adds diagnostics of three severities: fatal (no provider or model, unknown provider, a configured `agents.*.path` that is not a directory), repairable (no backlog adapter, adapter without skill, empty or missing script path) and warning (unknown runtime default) (`config/diagnostics.go:16-140`). `start` aborts on any fatal diagnostic (`main.go:115-121`); other commands print them and carry on.
- Why: a typo in a key never stops the loop, which is friendly and silent: an agent that writes `max_concurency` gets the default of 4 and one stderr line. The shape is the useful part: each diagnostic carries a machine code, a field path, a message, a severity and a one-line fix.
- Evidence: `config/types_defaults.go:109-168`; `config/parse.go`; `config/diagnostics.go`; `main.go:54-124`.
- Basis: Verified
- Code: borrow the diagnostic shape only (NVIEW-15).

**NVIEW-5. A config problem can start a repair agent session, but only for one diagnostic and only interactively.**
When adapter script paths are missing, `noodle start` prints them, builds a repair prompt and, if stdin and stdout are terminals and no fatal diagnostic exists, asks "Run automatic repair now? 1) Claude 2) Codex 3) Skip". Choosing one creates a worktree `repair-config-<UTC timestamp>`, dispatches the provider with the repair skill and the configured model, and exits with a `prompt-repair` outcome telling the user to re-run `start` (`main.go:66-113,207-331`). The prompt tells the agent to create the script or edit `.noodle.toml`, keep the fix minimal, and run `go test ./...` if Go files changed.
- Why: the nearest thing in Noodle to "the CLI asks an agent to fix its own setup". It covers one diagnostic, is off in non-interactive runs, and launches an agent with whatever `agents.<provider>.args` hold (the docs example uses `--dangerously-skip-permissions`; NVIEW-16).
- Evidence: `main.go:66-113`, `207-331`; `docs/reference/configuration.md:89-113`.
- Basis: Verified
- Code: none; do not borrow (NVIEW-17).

**NVIEW-6. The server is a local control plane with no authentication: snapshot, session events, a control POST, a WebSocket, and a diff view for pending reviews.**
Routes (`server/server.go:92-98`): `GET /api/ws`, `GET /api/snapshot`, `GET /api/sessions/{id}/events` (optional `?after=` RFC 3339 timestamp), `POST /api/control`, `GET /api/config`, `GET /api/reviews/{id}/diff`, and `GET /` (the embedded single-page UI, falling back to `index.html` for client-side routes). It binds to `127.0.0.1` on `server.port` (default 3000), trying up to ten consecutive ports (`server.go:109-123`). A POST to `/api/control` is capped at 64 KB, must name one of 18 actions, and is appended to `.noodle/control.ndjson`; the loop reads, applies and acknowledges it into `control-ack.ndjson` (`loop/control.go:77-117`). The code checks that a browser `Origin`, when present, is a localhost origin (CORS headers and the WebSocket upgrader, `server.go:401-426`, `ws_hub.go:343-351`), but `handleControl` decodes the body without checking `Content-Type`, an absent `Origin` is allowed on the WebSocket, and there is no token or CSRF check.
- Why: it is the whole steering surface, so its trust model matters. A page on another site can send a "simple" POST (text/plain body, no preflight) to `http://127.0.0.1:3000/api/control`; CORS would stop that page reading the answer, not stop the command being queued. That the request would be accepted follows from the code; it was not run. The UI itself sends `Content-Type: application/json` (`ui/src/client/api.ts`), so a type check would not break it. Compare the csf-board server, which requires a bearer token on every request but discovery and sets no CORS headers (NVIEW-12).
- Evidence: `server/server.go:92-123,226-269,401-426`; `server/ws_hub.go:341-378`; `loop/control.go:77-117`; `ui/src/client/api.ts` (`sendControl`).
- Basis: Verified (routes; checks present or absent); Unverified (that a cross-site POST succeeds in a real browser)
- Code: none in Noodle; any Qara or board surface that accepts commands needs its own token (NVIEW-12).

**NVIEW-7. The control file has a lost-update window: the server appends without the lock the loop holds while it reads and truncates; ID replay dedupe does not cover this.**
`processControlCommands` takes `control.lock`, reads `control.ndjson`, applies each line, appends acks, then truncates the file with `os.WriteFile(controlPath, []byte{}, ...)` (`loop/control.go:77-117`, truncation at line 112). `appendControlCommand` in the server opens the same file with `O_APPEND` and no lock (`server/server.go:323-342`). A command appended between the loop's read and its truncate is erased and never acknowledged. The loop dedupes replays by command ID and persists a last-applied sequence (`hydrateProcessedCommands`, `loop/control.go:30-70`). The server's WebSocket `control_ack` is sent as soon as the line is appended (`server/ws_hub.go:125-135`), not when the loop applies it, so the UI sees success even if the line is later erased; the UI's 1.5 s timeout and HTTP re-send (`ui/src/client/ws.ts`, `hooks.tsx:125-138`) cover a missing ack, not a lost line.
- Why: the failure is silent: a `kill` or `pause` sent at the wrong instant does nothing. It is also a cautionary pattern for any file-as-queue design: append and truncate must share one lock.
- Evidence: `loop/control.go:30-70,77-117`; `server/server.go:323-342`; `ui/src/client/hooks.tsx:125-138`. The race is inferred from reading the two code paths; none of the control tests exercise concurrent append and truncate.
- Basis: Verified (the code paths); Unverified (that the loss occurs in practice)
- Code: none.

**NVIEW-8. Per-session observability is derived from files once a second, and "stuck detection" is not implemented: the test pins `stuck` to false.**
The monitor (`monitor/monitor.go`) lists `.noodle/sessions/*` and for each session combines an observer (is the process alive: PID file, heartbeat file, log mtime and size) with claims read from `canonical.ndjson` (cost, tokens in and out, first and last event time, last action, completed, failed) and the previous `meta.json`, and writes `meta.json` (`DeriveSessionMeta`, `monitor/derive.go:9-120`). Fields: status (`running`, `exited`, `failed`), health (`green`, `yellow`, `red`), `total_cost_usd`, `duration_seconds`, `idle_seconds`, `context_window_usage_pct`, `retry_count`, `alive`, `stuck`, `log_size`, `current_action`. Health is red on failure, yellow when a running session reaches 80% of a hard-coded 200,000-token budget (`monitor/types.go:11`) or a session has exited, green otherwise. `Stuck` is set false in `derive.go:112` and `monitor.go:75` and nowhere true. `TestDeriveSessionMetaRunningAndHealth` feeds a session idle for ten minutes and asserts `stuck=false` (`monitor/derive_test.go:38`). The monitor does act on one case: a process still alive after its stream says completed or failed is killed (`monitor.go:239-247`, `TerminateSessionByPID`). Cost, tokens and idle time are cheap here: file reads, fsnotify plus a 1 s ticker, 200 ms debounce.
- Why: cost, tokens and idle time per session are what an operator wants. The `stuck` field and the 200k budget are placeholders that look like features; a model with a larger window shows wrong percentages.
- Evidence: `monitor/types.go:9-72`; `monitor/derive.go:9-120`; `monitor/monitor.go:41-110,239-247`; `monitor/derive_test.go:8-47`; `rg "Stuck|stuck"` over non-test Go found only the writes of `false` and unrelated comments.
- Basis: Verified
- Code: none; Qara has no per-run cost (NVIEW-11).

**NVIEW-9. The UI gets one snapshot over WebSocket, diff-gated and debounced, and the snapshot is the operator's whole picture; TypeScript types for it are generated from the Go structs.**
`GET /api/ws` upgrades, sends an initial `Snapshot`, and then the hub watches `.noodle/` recursively with fsnotify, debounces 300 ms, rebuilds the snapshot, hashes it with volatile fields zeroed (clock-only drift does not count), and broadcasts only when the hash changed (`server/ws_hub.go:195-270`). The snapshot (`internal/snapshot/types.go:41-63`) holds sessions, active and recent sessions, orders with stages, `action_needed`, events per session, a feed timeline, total cost, pending reviews, mode, max concurrency and warnings. `tygo` generates `ui/src/client/generated-types.ts` from `internal/snapshot` and `generated-loop-types.ts` from `loop/pending_review.go` (`tygo.yaml:1-22`, `//go:generate` at `snapshot/types.go:3`). The UI is React 19, Vite and TanStack Router in `ui/`, built into `ui/dist/client` and embedded with `//go:embed all:ui/dist/client` (`embed.go:9-19`); if it was not built first the server serves a placeholder (`server/server.go:353-361`). The views are in the Reference.
- Why: a person sees loop state, cost, the trace of each agent and the diff awaiting review in one local page, with no hosted service, and can act on it from the same page. Weaknesses: it is read and steered through the unauthenticated channel of NVIEW-6; CI checks the skill snapshot but, in `test.yml`, no step regenerates the TypeScript types.
- Evidence: `server/server.go:92-98`; `server/ws_hub.go`; `internal/snapshot/types.go`; `tygo.yaml`; `embed.go`; `ui/package.json`; `ui/src/`; `.github/workflows/test.yml`.
- Basis: Verified (server, snapshot, generation config, views as read in source); Unverified (how the views look or behave; the UI was not run)
- Code: tobogan `board/` is the nearest analogue (NVIEW-12).

**NVIEW-10. Install is a skip-conditioned checklist that an agent executes, and the repository tests it with a real agent.**
`INSTALL.md` (171 lines) is addressed to the coding agent. Each of eight steps carries a "Skip if" check (binary on PATH, skill files present, `.noodle.toml` exists, `.gitignore` lists `.noodle/`, schedule and execute skills exist, `todos.md` exists), so an interrupted install can be re-run. The user is handed one prompt: "Install Noodle and set up this project. Follow the instructions at https://raw.githubusercontent.com/poteto/noodle/main/INSTALL.md" (`docs/getting-started.md:7-12`). Separately, `noodle start` scaffolds `.noodle/` and a minimal `.noodle.toml` and prints a welcome (`startup/firstrun.go:13-69`). The e2e test `TestSmokeInstallMd` makes a Codex run follow `INSTALL.md` in a fresh git repo with fixed answers, commits what it wrote, then runs `noodle start --once` and expects a populated `mise.json` (`e2e/smoke_test.go:650-720`; build tag `e2e`, 120 s timeout, `pnpm test:smoke`).
- Why: running the install document as an executable by an agent against a clean repo means it cannot silently rot. The cost: it needs a live model and is outside `pnpm check`.
- Evidence: `INSTALL.md`; `docs/getting-started.md:5-50`; `startup/firstrun.go`; `e2e/smoke_test.go:650-720`; `package.json` (`test:smoke`, `check`).
- Basis: Verified
- Code: Qara has `INSTALL.md` and `scripts/doctor-install.ts`; csf has `csf-onboard`, `csf-setup`, `csf-session-init` bins; whether either is tested by an agent run was not found.

**NVIEW-11. Qara and csf already show most of "what is the system doing"; neither shows money cost, and neither has one page for all live runs.**
Qara (read): the statusline reads Claude Code's input for session duration and token counts (`scripts/statusline/input.ts:44-59`), has no cost-in-dollars field (no match for `usd` or `total_cost` under `scripts/statusline/`), and renders a HUD of pi Runs with state glyphs, short ids and elapsed time (`render-hud.ts`, `types.ts`); `bsvc runs list|inspect|wait|cleanup|adjudicate|cancel|reap-panes|orphans|gc` manage Runs, where `wait` takes `--after-seq` and `--timeout` against a ledger sequence cursor (`.claude/context/csf-pi-mechanics.md:9`); `scripts/pi-lane-status.ts` sweeps lanes; `scripts/orch-state.ts table|write|log` joins `bsvc` run JSON, herdr panes, open PRs and a dispatch log with strict row validation and a 6 s total budget (`orch-state.ts:19-60,241-262`). csf (read): `csf-drain` has read-only `status`, `next`, `escalations`, `reconcile` and `watch [--until-idle] [--from-start] [--poll-ms]` ("one line per stage/ledger event, for a Monitor"), most with `--json` (`src/drain/csf-drain.ts:18-75`); no non-test file under `csf-build/src` mentions USD or cost. Noodle shows, in one page, every live session with USD cost, tokens, context percentage, duration and current action, plus pending reviews with a diff.
- Why: the real gap is narrow: money cost per run, and one view that joins runs from different tools. Qara's pi Runs and csf drains run on subscriptions or metered keys in ways that make a dollar figure partly notional; whether the owner wants it is a decision (Open 2). Sequence-cursor waiting (`--after-seq`) is a stronger pattern than Noodle's ack-by-ID.
- Evidence: the Qara and csf paths above; `internal/snapshot/types.go:41-86`; `monitor/types.go:44-64`.
- Basis: Verified (what each side contains); Unverified (that the gap matters)
- Code: Gap: none to add before Open 2 is answered.

**NVIEW-12. For `board/`, Noodle's read-side pattern is worth copying; its control channel is not, and csf-board already does better on auth.**
csf-board, the server behind `board/`, requires `Authorization: Bearer <token>` on every request except discovery, looks the token up as a SHA-256 hash in a tokens file kept outside the repo (`src/tokens.ts`, `tokens.example.json`), binds to `127.0.0.1` unless `CSF_BOARD_HOST` says otherwise (`src/main.ts:42`), sends no CORS headers (no match in `src/`), and narrows a caller's rights per channel with an `x-board-can` header (`src/access.ts`). Its one gap is stated in code: each token's principal has every permission everywhere until a second person or a confined agent token exists (`src/access.ts`, "ceiling: no grants yet", BOARD-7). A non-simple `Authorization` header forces a browser preflight that no CORS header answers, so the cross-site POST of NVIEW-6 does not apply. Noodle contributes the read side: one `Snapshot` JSON built from files, an initial push on connect, a file watcher that rebroadcasts only changes, generated TypeScript types, and an `Origin` check.
- Why: a sign-off page that another website can trigger is worse than none; the board already has the control model, so the only thing to take from Noodle is the read-side shape if the board gets a window onto the drain.
- Evidence: `/media/ssdev/tg-pro/csf-board/src/{tokens,access,http,main}.ts` (`http.ts:459-464` shows the 401 path); `board/README.md`; `board/vercel-board.md` BOARD-13; `server/ws_hub.go`; `tygo.yaml`.
- Basis: Verified (what each side does); Unverified (fit of Noodle's read side for the board)
- Code: Gap: csf-board has an API and no UI; nothing yet shows a drain.

**NVIEW-13. Qara and csf have pieces of a self-describing CLI but no table that covers their commands; the cheapest start is csf-drain's verb list, which is only a header comment today.**
csf: `csf-build-ownership --capabilities` prints a JSON capabilities object and `csf-build-ownership --request` takes JSON on stdin (`src/lanes/csf-build-ownership.ts:9-19`); `csf-advance` (a stage engine at `src/engine/csf-advance.ts`, reached through the `csf-stage` bridge, never invoked by hand) has a `--help` flag and a typed argument contract (`csf-advance-args.ts`: `--stage`, driver, `--run-checkout`, `--wo`, `--json`, `--timeout-ms`, `--detach`, `--resume`, `--lane-token`, `--lane-drain`); `csf-onboard --help`; gates share named exit codes (`src/qa/gate-codes.ts`: 0 pass, `GATE_SKIP_EXIT = 3`, any other fail) and `csf-anchor-coverage` states 0, 1, 3 and 64. `csf-drain` has about thirty verbs documented only in its header comment (`src/drain/csf-drain.ts:17-60`). Qara: `scripts/check-command-contract.ts` checks slash-command docs for dead paths and heading mismatches, not flags; `scripts/cheatsheet-index.ts` generates the routing cheatsheet's keyword, workflow, skill and hook-event blocks from sources with `check` and `rebuild`; scripts print one `USAGE` string each (for example `harness-links.ts`). None lists every command with flags and exit codes in parseable form.
- Why: an agent that must pick among 75 `check:*` scripts and 18 bins reads prose. A typed verb table that the parser, `--help`, `--describe` JSON and a two-way test all share would stop `csf-drain`'s header from drifting. Without the two-way test the table becomes one more copy, the failure NVIEW-2 found in Noodle.
- Evidence: the paths above; `package.json` (75 `check:*` lines).
- Basis: Verified (what exists); Unverified (that the table pays off)
- Code: Gap: no verb table in `csf-drain.ts`; no flag table for Qara scripts.

**NVIEW-14. Take two small things from `.noodle/`, the version marker and the lock-guarded `reset`, and leave the single-directory layout; Qara and csf already keep state elsewhere on purpose.**
Qara centralises state through `resolveStateDir` (`.claude/lib/qara-paths/state`), checked by `check:state-home` and `check:state-dir-capture`, and `orch-state.ts` keeps its table and dispatch log under it (`orchestrator/table.json`, `dispatch.jsonl`, written with `atomicWrite`). csf-drain writes through a `DrainStore` and `pipeline.db` (`csf-advance-args.ts`, the `csf-drain.ts` header). What Noodle has that these do not obviously have is `state.json` with `schema_version` and an upfront refusal on a newer version (`internal/statever/statever.go:67-83`), and a `reset` that refuses while the lock is held (`cmd_reset.go:25-57`).
- Why: a version marker turns "an older script misreads newer state" into a clear error. Only worth adding where a state file is read by more than one tool version, which this reading did not establish for any Qara or csf file.
- Evidence: `internal/statever/statever.go`; `cmd_reset.go`; `scripts/orch-state.ts:241-262`; the csf paths above.
- Basis: Verified (Noodle); Unverified (that Qara or csf lacks the equivalent)
- Code: Gap: unknown; check per state file before any change.

**NVIEW-15. Borrow the diagnostic shape (code, field path, severity, one-line fix) for agent-facing Qara checks; csf's gates already share exit codes.**
Config diagnostics carry `Code`, `FieldPath`, `Message`, `Severity` and `Fix` (`config/types_defaults.go:117-124`) and print as `config <severity>: <path>: <message> Fix: <fix>` (`main.go:67-77`). `scripts/lint-arch.sh` prints `[ARCH][ERROR] file:line`, then `Violation:`, `Fix:` and `See <principle file>` (`scripts/lint-arch.sh:12-22`). Both point the agent at the remedy and the governing document. In Qara, 7 of the 56 non-test `scripts/check-*.ts` files contain "Fix:", "fix:" or "remediation" text (an `rg` count, a floor not an audit); csf's gates standardise the exit code and a `CSF_BYPASS=csf:G51`-style bypass instead.
- Why: a check that names its fix and rule lets an agent repair without a second lookup.
- Evidence: `config/types_defaults.go:109-138`; `main.go:54-124`; `scripts/lint-arch.sh:1-70`; `brain/principles/encode-lessons-in-structure.md`; the Qara count above; `src/qa/gate-codes.ts`.
- Basis: Verified (Noodle; the count); Unverified (value for Qara)
- Code: Gap: no convention for a fix line in Qara checks.

**NVIEW-16. The install and engineering files contain agent instructions that deserve a risk list before anything is followed.**
Found while reading (all studied, none followed):
1. `INSTALL.md` steps 2 and 3 tell the agent to fetch `SKILL.md`, two reference files and four adapter scripts from `raw.githubusercontent.com/poteto/noodle/main/...` (an unpinned branch) and to `chmod +x` the scripts. Shell scripts the loop later runs come from a moving branch with no checksum.
2. Step 5 tells the agent to read the user's conversation history in `~/.claude/` and `~/.codex/` for the project and learn from the commands they run: private transcripts.
3. Step 1 installs a binary from a Homebrew tap or a GitHub release; `docs/getting-started.md` shows `sudo mv noodle /usr/local/bin/`.
4. `docs/reference/configuration.md:97-113` gives `agents.claude.args = ["--dangerously-skip-permissions", "--verbose"]` and `agents.codex.args = ["--full-auto"]` as the example configuration.
5. `.codex/config.toml` sets `approval_policy = "never"` under a comment "Fully autonomous — no approval prompts", with `sandbox_mode = "read-only"` and an `edit` profile at `danger-full-access`; the e2e install test runs `codex exec --dangerously-bypass-approvals-and-sandbox` (`e2e/smoke_test.go`, install test).
6. The repair flow (NVIEW-5) launches an agent in a worktree after one keystroke.
7. `CLAUDE.md` says "No backward compatibility by default" and tells sessions to use `Skill(worktree)` and `Skill(commit)`; benign but it shapes how agents edit.
8. `.claude/settings.json` runs `$CLAUDE_PROJECT_DIR/bin/noodle worktree hook` as a PreToolUse hook; `bin/noodle` exists only after `pnpm build`.
- Why: the install flow asks an agent to write and mark executable files from a moving branch, and to read private history. A follower should pin a commit and read the scripts first.
- Evidence: `INSTALL.md`; `docs/getting-started.md:15-35`; `docs/reference/configuration.md:97-113`; `.codex/config.toml`; `.claude/settings.json`; `main.go:263-331`.
- Basis: Verified
- Code: not applicable; this is a list for the decision session.

**NVIEW-17. Do not run Noodle as-is for the surfaces in this document; borrow the patterns.**
Reasons for the CLI, config, server and UI alone: the control plane has no authentication and a lost-update window (NVIEW-6, 7); `stuck` and the context budget are placeholders (NVIEW-8); the UI is wired to Noodle's own orders, stages and worktrees, so it cannot show a csf drain without an adapter; the docs have drifted from the code (the `noodle mise` text; the `ServerConfig.Enabled` comment says "nil = auto (enabled in interactive terminals)" while `shouldStartServer` returns true when unset and `TestShouldStartServer` pins that, `cmd_start.go:133-138`; the `[runtime.cursor]` block exists in config but not in `docs/reference/configuration.md`; the Linux and Windows download names in `docs/getting-started.md` do not match the real release assets, NVIEW-19); and the project is quiet (NVIEW-19). Whether to run the scheduler loop is for NSCHED and NMODE.
- Why: Qara has been deleting machinery; a second control plane with a different state model adds upkeep for little over what `board/` plans and csf-board already secures.
- Evidence: the doctrines cited; `config/types_defaults.go:103-107`; `cmd_start.go:133-138` and `cmd_start_test.go:126-148`; `docs/reference/configuration.md` (no `cursor` section).
- Basis: Verified (the drift items); Unverified (the decision, a judgement)
- Code: not applicable.

**NVIEW-18. The project is engineered for agents by structure more than prose, and its tests are broad but uneven in depth.**
- One agent directory: skills and hooks live in `.agents/`; `.claude/skills`, `.claude/hooks` and `.claude/agents` are symlinks into it; `.codex/config.toml` sets `project_doc_fallback_filenames = ["CLAUDE.md"]` so Codex reads the same instructions. `.agents/agents` does not exist, so the `.claude/agents` link dangles. `CLAUDE.md` is 28 lines: build with `pnpm build` not bare `go build`, check with `pnpm check`, error messages describe the failure state, no backward-compatibility shims.
- Hooks: `block-sleep.sh` (denies bare `sleep`; it extracts the command with `grep` over the JSON, which assumes no space after the colon), `inject-brain.sh` (cats `brain/index.md` at session start), `auto-index-brain.sh` (rebuilds the index when brain files change), plus `noodle worktree hook`, a Go PreToolUse handler that denies Bash commands (`worktree/hook.go:106-135`; its policy `CheckCommand` is NMODE's).
- Checks: `pnpm check` runs build, `go test`, `go vet`, `lint-arch.sh`, the loop fixture check and the fixture hash check (`package.json`). `lint-arch.sh` enforces production-file size limits (warn above 500 lines, error above 1000), test-file limits, no legacy fixture files, and boundary failure messages that describe the failure state. `fixtures_immutability_test.go` hashes every file under every `*/testdata` with SHA-256, runs the fixture packages' tests, and fails if any fixture changed, appeared or vanished (`fixtures_immutability_test.go:15-34`). `scripts/fixturehash` keeps `expected.md` fixtures in sync or checked.
- Generated types: `tygo.yaml` as in NVIEW-9; `ui/src/client/enums.ts` hand-narrows string constants tygo emits as `string`.
- Commit rules: `.githooks/commit-msg` requires a conventional-commit header, subject up to 70 characters, capitalised, no trailing period, body lines up to 100, and a non-empty body. `CHANGELOG.md` is generated (conventional-changelog): 714 lines, 664 entries.
- Tests: 125 Go test files of 323 Go files and 843 test functions (`rg` count); 32 UI test files of 64 TypeScript files; seven e2e smoke tests behind a build tag. Each CLI command has a test file; most test the function behind the command, not the cobra wiring, apart from `root_test.go`. The control-file race has no test.
- Why: the practice that transfers is the fixture-immutability test, because it turns "a test quietly rewrote its expected output" into a failing check. The dangling symlink and the hook that needs an unbuilt binary show the setup was not tested from a fresh clone.
- Evidence: `ls -la .claude`; `.codex/config.toml`; `CLAUDE.md`; `.agents/hooks/*`; `.githooks/commit-msg`; `scripts/lint-arch.sh`; `fixtures_immutability_test.go`; `scripts/fixturehash/main.go`; `package.json`.
- Basis: Verified
- Code: Qara already has generated-file checks (comparison table); a fixture-immutability check was not found in Qara (`scripts/__fixtures__` exists; searches for hash or immutability checks over `scripts`, `.claude/lib` and `docs` found none) or in csf-build (`fixtures/`, `fixtures/scenarios`; none found).

**NVIEW-19. Project health: one author, six releases in two days, one burst of work on 2026-03-19, and nothing since.**
Read on 2026-11-23 with `gh`:
- Repository: created 2026-02-22; 711 stars, 74 forks, 4 watchers; not archived; last push 2026-03-19T07:46:39Z.
- Releases: v0.1.0 on 2026-03-02T22:46Z, then v0.1.1 to v0.1.5 on 2026-03-03 (the last at 23:35Z). v0.1.5 is the latest; nothing was released in the eight and a half months since.
- Commits (the 30 most recent): all by `lauren`. Sixteen on 2026-03-19 (04:43 to 07:41 UTC: skill audits and the "canonical state convergence" series: checkpoint, dispatch planning, review flow, merge recovery, projection-only snapshots), then a gap to 2026-03-11, 2026-03-10 and 2026-03-05 (planning notes and fixes). No commit after 2026-03-19. The clone's head `82d2921` is that day's last commit.
- Issues: 5, all open (#14 harness config paths, #11, #8 and #7 scheduler changes, #4 a Korean IME bug in the UI). Pull requests: 12 in all (limit 30 was not reached, so the lists are complete): the owner's #1 and #2 are closed, #5 by an outside author is closed (whether it merged was not checked), and the nine open ones are all from outside authors: #3 and #15 (docs links), #6 (UI IME fix), #9, #10, #12 and #13 (scheduler changes, one author), #16 (a UI backlog page) and #17 (a Windows state-file fix). No outside PR has been answered by a merge among the open set.
- Licence: MIT, "Copyright (c) 2026 Lauren Tan" (`LICENSE`).
- Release assets for v0.1.5: `checksums.txt`, `noodle_{darwin,linux}_{amd64,arm64}.tar.gz`, `noodle_windows_{amd64,arm64}.zip`. The Linux download in `docs/getting-started.md` uses `noodle-linux-amd64` and the Windows one `noodle-windows-amd64.exe`; neither name is among the assets, so those documented URLs would not resolve (inferred from names; the URLs were not fetched).
- Direct Go dependencies (eight): BurntSushi/toml, charmbracelet/log, fsnotify, gorilla/websocket, spf13/cobra, superfly/sprites-go (a pseudo-version, `v0.0.0-20260226040941-951bb2e6b07d`), golang.org/x/sys, yaml.v3 (`go.mod:6-13`). The module graph also pulls in `hugo` and `air` as tool dependencies. UI: React 19, TanStack Router and Query, d3, Tailwind 4 (`ui/package.json`).
- Release pipeline: goreleaser builds darwin, linux and windows on amd64 and arm64 with `CGO_ENABLED=0`, writes `checksums.txt`, and publishes a Homebrew formula to a tap with a token from CI secrets; the config has no signing, SBOM or provenance stanza (`.goreleaser.yml`). INSTALL.md and getting-started do not tell the user to verify the checksum.
- Unfinished or abandoned: stuck detection and the context budget (NVIEW-8), the `noodle mise` text, the undocumented cursor runtime, the dangling `.claude/agents` link, an empty `Stop` hook list, a `prototype/` directory, `GET /api/config` (a client function and hook exist, no component calls them).
- Why: for "run it as-is", a single-author project with an unmerged outside queue, no release for eight and a half months, and config defaults pinned to `claude-opus-4-6` and `gpt-5.4` is a maintenance bet. Installing it means trusting an unsigned binary and agent-fetched scripts from a branch.
- Evidence: `gh repo view`, `gh release list`, `gh release view v0.1.5 --json assets`, `gh issue list`, `gh pr list`, `gh api repos/poteto/noodle/commits?per_page=30`, all on 2026-11-23; `CHANGELOG.md:1,11,41,51,61,81`; `LICENSE`; `go.mod`; `.goreleaser.yml`; `docs/getting-started.md:15-35`.
- Basis: Verified
- Code: not applicable.

**NVIEW-20. The UI shows less than the server computes and sends fewer commands than the server accepts; two UI command types the server rejects.**
Read from `ui/src`: the only control actions any component sends are `steer`, `stop`, `stop-all`, `advance`, `merge`, `reject` and `request-changes`. There is no button for `pause`, `resume`, `drain`, `mode`, `set-max-concurrency`, `skip`, `requeue`, `enqueue`, `edit-item` or `reorder`, although the server accepts all of them. The server computes `health`, `idle_seconds`, `retry_count`, `mode`, `max_concurrency`, `action_needed`, `dispatch_warning`, `remote_host` and `feed_events`, and the components read none of them except `remote_host` (the dashboard's host column); `health` and `idle_seconds` appear only in test fixtures. The UI's `ControlCommand` type lists `park-review` and `add-stage` (`ui/src/client/types.ts:79,85`); the loop handles both (`loop/control.go:277,279`) but the server's whitelist does not include them, so an HTTP or WebSocket request for either is answered "unknown action". A WebSocket control failure is sent as `control_error` (`server/ws_hub.go:131`), a type the client does not handle (its switch has `control_ack` and `error`), so a failed command is noticed only when the 1.5 s ack timeout fires and the UI re-sends over HTTP, which returns the 400 (`ui/src/client/ws.ts`, `hooks.tsx:133-137`). The sidebar's connection label reads "running" when the WebSocket is connected (`Sidebar.tsx`, `statusLabel`), which is not the loop's state.
- Why: so idle time and health, the numbers that would show a stuck agent, are never put in front of the person. Steering the loop's pace (pause, drain, mode) needs a hand-written POST.
- Evidence: `rg 'action: "'` over `ui/src`; `rg` for `idle_seconds|health|retry_count|action_needed|dispatch_warning|feed_events|max_concurrency|mode` over `ui/src` excluding tests; `ui/src/client/types.ts:65-85`; `server/ws_hub.go:125-135,353-361`.
- Basis: Verified
- Code: none.

## Reference

### CLI (every command and flag)

Global: `--project-dir <dir>` (also `NOODLE_PROJECT_DIR`; flag, then env, then cwd; must exist and be a directory) and the root-only `--version`. After resolving, `noodle` changes into that directory and loads `.noodle.toml` (`root.go:38-52`); `version` and `--version` skip config. Errors and usage are silenced and printed once by the caller. Arguments are trimmed and empty ones rejected (`exactTrimmedArgs`, `cmd_worktree.go:175-187`).

| Command | Arguments and flags | Reads | Writes or effect |
| --- | --- | --- | --- |
| `noodle` | none | none | prints help |
| `noodle start` | `--once` (bool): one scheduling cycle then exit | config; `state.json`; takes `noodle.lock` | scaffolds `.noodle/` and a minimal `.noodle.toml` first (`startup/firstrun.go`); runs the loop; starts the web server unless `server.enabled = false`; opens a browser unless `NOODLE_NO_BROWSER=1` (`NOODLE_BROWSER_URL` overrides the URL); SIGINT or SIGTERM shuts down |
| `noodle status` | none | `status.json`, `orders.json` | one line: `no active cooks` or `active cooks=N`, then `orders=N` and `loop=<running|paused|draining|idle>` |
| `noodle skills` and `noodle skills list` | none | the `skills.paths` directories | tab-separated rows: name, source path, has SKILL.md, path |
| `noodle schema [target]`, `noodle schema list` | optional target: `mise`, `orders`, `status` | none | markdown with a JSON schema and constraints; unknown target: error naming `schema list` |
| `noodle version`, `noodle --version` | none | embedded `VERSION` | prints the version |
| `noodle event emit <type>` | `--payload <json>` (validated as JSON); `--session <id>` | none | appends to `loop-events.ndjson`, or to `sessions/<id>/events.ndjson` with `--session` |
| `noodle reset` | none | the lock | deletes and recreates `.noodle/`; refuses if the lock is held |
| `noodle worktree create <name>` | `--from <ref>` (default HEAD) | git | linked worktree under `.worktrees/` |
| `noodle worktree exec <name> <command...>` | flag parsing off | git | runs the command inside the worktree |
| `noodle worktree merge <name>` | `--into <branch>` (default integration branch) | git | merges |
| `noodle worktree cleanup <name>` | `--force` | git | removes the worktree |
| `noodle worktree list`, `noodle worktree prune` | none | git | list with merge status; prune merged and patch-equivalent worktrees |
| `noodle worktree hook` | none | PreToolUse JSON on stdin | deny decision JSON on stdout |

Exit codes are not documented; errors return non-zero from `main`. Environment variables found: `NOODLE_PROJECT_DIR`, `NOODLE_NO_BROWSER`, `NOODLE_BROWSER_URL`, `NOODLE_DEV` (dev scripts), the sprites and cursor token variables named in config.

### Configuration keys (`.noodle.toml`)

Defaults apply when a key is absent (`config/parse.go:63-114`); "normalised" means an invalid value is replaced and a warning printed. With no file at all, `DefaultConfig()` applies (`config/types_defaults.go:171-198`).

| Key | Type | Default | Validation |
| --- | --- | --- | --- |
| `mode` | string | `supervised` | `auto`, `supervised`, `manual`; else normalised |
| `routing.defaults.provider` | string | `claude` | `claude` or `codex`; else normalised at parse; fatal at validate if empty or unknown |
| `routing.defaults.model` | string | `claude-opus-4-6` | empty normalised |
| `skills.paths` | string[] | `[".agents/skills"]` | empty list normalised |
| `concurrency.max_concurrency` | int | 4 | 0 or less normalised |
| `agents.claude.path`, `agents.codex.path` | string | empty | fatal if set and not a directory (`~` expanded) |
| `agents.claude.args`, `agents.codex.args` | string[] | empty | none |
| `runtime.default` | string | `process` | `process`, `sprites`, `cursor`; else normalised |
| `runtime.process.max_concurrent` | int | 4 | negative normalised |
| `runtime.sprites.token_env`, `base_url`, `sprite_name`, `git_token_env`, `max_concurrent` | strings, int | token env `SPRITES_TOKEN`, git token env `GITHUB_TOKEN`, 50 | sprites is "available" only if the table exists and the token variable is set |
| `runtime.cursor.api_key_env`, `base_url`, `repository`, `max_concurrent` | strings, int | key env `CURSOR_API_KEY`, 10 | as sprites; absent from the published reference |
| `server.port` | int | 3000 | outside 0 to 65535 normalised; the server tries ten ports upward |
| `server.enabled` | bool | unset, treated as true | none |
| `adapters.<name>.skill`, `adapters.<name>.scripts.<action>` | string, map | `backlog` adapter with `sync`, `add`, `done`, `edit` under `adapters/` | repairable if skill empty, script empty or script path missing |

Removed keys that only warn: `recovery`, `monitor`, `routing.tags`, `concurrency.max_cooks`, `concurrency.max_completion_overflow`, `concurrency.merge_backpressure_threshold`, `concurrency.shutdown_timeout` (`config/parse.go:179-198`). Diagnostic codes: `routing_defaults_missing`, `agent_dir_missing`, `adapter_skill_missing`, `adapter_script_empty`, `adapter_script_missing`, `provider_unknown`, `runtime_default_unknown`, `no_backlog_adapter`, `config_field_removed`, `config_field_unknown`, `config_value_normalized`. The scaffolded config omits a backlog adapter, so a first run prints a `no_backlog_adapter` repairable diagnostic; a test pins exactly that (`startup/integration_test.go:124-145`).

### `.noodle/` layout (file by file)

Names collected from the Go sources; the loop, adapters and events are NSCHED's and NADAPT's.

| Path | Holds | Written by |
| --- | --- | --- |
| `noodle.lock` | exclusive lock, holder PID | `start` (`cmd_start.go:75`) |
| `state.json` | `{"schema_version": 1, "generated_at": <time>}` | `internal/statever` |
| `state.snapshot.json` | loop checkpoint | `loop/canonical_checkpoint.go:24` |
| `mise.json` | the scheduler's project brief (`mise.Brief`) | `mise/builder.go:118` |
| `orders-next.json`, `orders.json` | scheduler output, promoted orders | scheduler; loop |
| `status.json` | `{active[], loop_state, mode, max_concurrency, warnings[]}`, all omitted when empty | loop (`internal/statusfile/statusfile.go:13-19`) |
| `tickets.json` | claims on targets | `event/tickets.go`, `mise/builder.go:145` |
| `loop-events.ndjson` | loop events; `event emit` appends here | loop, CLI |
| `control.ndjson`, `control-ack.ndjson`, `control.lock`, `last-applied-seq` | UI commands; acknowledgements; lock; dedupe sequence | server appends; loop applies (`loop/control.go:20-24`) |
| `pending-review.json` | orders awaiting sign-off | `loop/pending_review.go:40` |
| `quality/<session>.json` | per-session quality verdict | `runtime/runtime.go:83` |
| `sessions/<id>/meta.json` | derived status, health, cost, idle (`monitor.SessionMeta`) | monitor |
| `sessions/<id>/spawn.json` | provider, model, runtime, retry count | dispatcher |
| `sessions/<id>/process.json`, `heartbeat.json` | PID; liveness (process runtime; sprites runtime) | runtimes |
| `sessions/<id>/raw.ndjson`, `canonical.ndjson`, `stderr.log`, `input.txt`, `events.ndjson` | provider stream; normalised events; stderr; prompt; session events | dispatcher, `stamp` |

`.worktrees/` at the project root holds agent worktrees and a merge lock. The monitor's `meta.json` fields are listed in NVIEW-8.

### HTTP and WebSocket routes (request and response shapes)

All on `127.0.0.1:<port>`; errors are plain-text bodies with an HTTP status (`http.Error`), not JSON. Responses are JSON with HTML escaping off.

| Route | Request | Response |
| --- | --- | --- |
| `GET /api/snapshot` | none | `Snapshot` (see below); 500 on read failure |
| `GET /api/sessions/{id}/events` | optional `?after=<RFC3339Nano>` (an unparseable value is ignored) | `EventLine[]` (`{at, label, body, category}`; category `tools`, `think`, `ticket` or `all`); `[]` when none; 400 if the id is blank |
| `POST /api/control` | JSON `{id?, action, order_id?, name?, target?, prompt?, value?, task_key?, provider?, model?, skill?}`, at most 64 KB | `{id, action, status:"ok", at}` after the line is appended; 400 with a text body for bad JSON, a missing or unknown action; `id` defaults to `web-<unix nanos>` |
| `GET /api/config` | none | `{provider, model, mode, task_types[]}` |
| `GET /api/reviews/{id}/diff` | `{id}` is an order id | `{diff, stat}` from `git` against the base branch; 404 `review not found` or `worktree no longer available`; 500 `diff failed` |
| `GET /api/ws` | upgrade; `Origin` empty or localhost | WebSocket (below) |
| `GET /` and any unknown path | none | embedded `index.html` (SPA fallback), or a placeholder page if the UI was not built |
| `OPTIONS` anything | preflight | 204 with `Access-Control-Allow-Origin` echoing a localhost origin |

`Snapshot` (`internal/snapshot/types.go:41-63`): `updated_at`, `loop_state`, `sessions[]`, `active[]`, `recent[]`, `orders[]`, `active_order_ids[]`, `action_needed[]`, `events_by_session{}`, `feed_events[]`, `total_cost_usd`, `pending_reviews[]`, `pending_review_count`, `mode`, `max_concurrency`, `warnings[]`. `Session`: `id`, `display_name`, `status`, `runtime`, `provider`, `model`, `total_cost_usd`, `duration_seconds`, `last_activity`, `current_action`, `health`, `context_window_usage_pct`, `retry_count`, `idle_seconds`, `loop_state`, `remote_host`, `dispatch_warning`, `worktree_name`, `task_key`, `title`. `Order`: `id`, `title`, `plan[]`, `rationale`, `stages[]`, `status`. `Stage`: `task_key`, `prompt`, `skill`, `provider`, `model`, `runtime`, `group`, `status`, `extra{}`, `session_id`. Stage statuses the UI knows: `pending`, `active`, `merging`, `completed`, `failed`, `cancelled`; order statuses `active`, `completed`, `failed`, `failing`.

Control actions accepted by the server (18): `pause`, `resume`, `drain`, `skip`, `kill`, `steer`, `merge`, `reject`, `request-changes`, `mode`, `enqueue`, `stop-all`, `requeue`, `edit-item`, `reorder`, `stop`, `set-max-concurrency`, `advance`. The loop also handles `add-stage` and `park-review`, which the server rejects (NVIEW-20).

WebSocket messages. Client to server: `{type:"subscribe", session_id}`, `{type:"unsubscribe", session_id}`, `{type:"control", data:<control request>}`. Server to client: `{type:"snapshot", data}` (first on connect, then on change), `{type:"backfill", session_id, data:EventLine[]}`, `{type:"session_event", session_id, data}`, `{type:"session_delta", session_id, text, at}` (streaming text), `{type:"subscribed"|"unsubscribed", session_id}`, `{type:"control_ack", data:{id, action, status, at}}`, `{type:"control_error", error}` (not handled by the client), `{type:"error", message}`. A client whose send queue (256) fills is disconnected (`TestWSHubBroadcastDisconnectsSlowClients`). The client reconnects after 2 s.

### UI views (every route, what it shows, what it lets the person do, which call backs it)

Shell (`routes/__root.tsx`, `Sidebar.tsx`): every route except `/onboarding` sits in a sidebar plus content layout. One WebSocket connection is opened for the page (`connectWS`); the snapshot lives in a React Query cache that WebSocket pushes overwrite (`useSnapshot`, initial `GET /api/snapshot`). The sidebar shows the connection dot and label, links to the four main routes (with a pending-review count on Reviews), an "Agents" list with the Scheduler channel ("MONITORING THE SITUATION" or "IDLE"), a tree of orders and their stages (click a stage to open its session), and a footer with total session cost. Keyboard: `n` focuses the instruction box; up and down arrows move between the scheduler and agent channels (`FeedKeyboardHandler.tsx`).

| Route | Component | Shows | Person can | Backing call |
| --- | --- | --- | --- | --- |
| `/` | `AppLayout`: `FeedPanel` plus `ContextPanel` | the scheduler channel: its trace (streaming text while thinking), loop state badge, total cost, a bootstrap badge | send a steer prompt to the scheduler (`steer`, target `schedule`); `stop`; `stop-all` | snapshot push; session events by WebSocket subscribe plus `GET /api/sessions/{id}/events`; control by WebSocket, falling back to `POST /api/control` |
| `/actor/$id` | `AgentFeed` plus `ContextPanel` | one session: name, task key, model, status, cost, a filterable trace (all, tools, think, ticket) with grouped tool calls, a review banner when the session awaits review | steer prompt; `stop`; `stop-all`; "force complete" (`advance`); merge, reject or request changes from the banner | as above; `GET /api/reviews/{id}/diff` for the diff panel |
| `/dashboard` | `Dashboard` | counts (total, active, completed, cost) and a sortable table: id, title, status, host, model, duration, cost | sort columns | snapshot only |
| `/topology` | `TreeView` (d3) | a pan-and-zoom tree of orders and sessions with status dots, model and cost | click a node to open the session; zoom buttons | snapshot only |
| `/reviews` | `ReviewList` | pending reviews: session or order, task key, reason, skill, model, worktree, the diff and stat | merge; reject; request changes with feedback text (Enter submits, Escape cancels) | snapshot; `GET /api/reviews/{id}/diff`; control |
| `/onboarding` | `onboarding.tsx` | what Noodle is and the loop steps (Schedule, Execute, ...), links to the dashboard and feed | follow links | none |

Context panel (right, 300 px): for the scheduler, loop state, active count, orders, total cost, the active agents, a pipeline progress bar and warnings; for a session, cost, duration, context percentage and bar (red above 80, accent above 50), model, worktree name and the stage rail with progress; for a session awaiting review, the diff instead. The snapshot's `health`, `idle_seconds`, `retry_count`, `mode` and `max_concurrency` are not shown anywhere (NVIEW-20). `useConfig` (`GET /api/config`) is exported and unused by any component.

### How a person watches and steers one run

1. `noodle start` prints the address, opens the browser and logs to stderr.
2. The sidebar and dashboard show loop and session state and total cost; the context panel shows per-session cost, duration and context use.
3. Opening a session shows its trace and an input to send a steering prompt; `stop` and `stop-all` are always visible.
4. In `supervised` or `manual` mode, finished work waits on the Reviews page for merge, reject or request-changes.
5. Pause, drain, mode change and concurrency need a hand-written POST or a line in `control.ndjson`.
6. From a terminal there is `noodle status` and the files in `.noodle/`.

### Comparison: Noodle, Qara, csf

| Facet | Noodle | Qara | csf (csf-build in `cub`) |
| --- | --- | --- | --- |
| Command surface | one binary, 8 top-level commands, 7 of them worktree subcommands | 507 files in `scripts/`, 75 `check:*` scripts in `package.json`; the `bsvc` binary (`runs list|inspect|wait|cleanup|adjudicate|cancel|reap-panes|orphans|gc`); `orch-state table|write|log` | 18 bins in `package.json` (`csf-drain`, `csf-admit`, `csf-admission`, `csf-gate`, `csf-scenarios`, `csf-scenario-driver`, `csf-anchor-coverage`, `csf-base-health`, `csf-build-query`, `csf-build-ownership`, `csf-record-guard`, `csf-reap`, `csf-onboard`, `csf-session-init`, `csf-memory-inject`, `csf-validate-write`, `csf-validate-frontmatter`, `csf-setup`); `csf-drain` has about 30 verbs; `csf-advance` is an engine reached via the `csf-stage` bridge |
| Self-description | `schema` (reflected from structs, two-way drift check); `cmdmeta` for short texts; the skill and docs are hand-kept copies | one `USAGE` string per script; generated routing cheatsheet (`cheatsheet-index.ts check|rebuild`); `check-command-contract.ts` checks command docs for dead paths | `csf-advance --help`, `csf-onboard --help`, `csf-build-ownership --capabilities` (JSON); `csf-drain` verbs only in a header comment; shared gate exit codes (`gate-codes.ts`) |
| Config | one `.noodle.toml`; defaults; warn-and-normalise; severities and fix text | `config/harnesses.toml` (registry: cc, droid, codex, cline, acp, pi) generating `shared-ts/qara-paths/harnesses.generated.ts`; `.claude/settings-src/{base,linux,mac}.json` rendered to settings by `settings-render.ts`; `config/estate.json` | per-project `.csf/profile.json` (`specsDirs`, `checkoutsRoot`, timeouts) and per-bin flags |
| State on disk | `.noodle/`, about 15 files, one lock, one version marker | `resolveStateDir` state root; per-session and per-agent slots; `orchestrator/table.json`, `dispatch.jsonl`; hook state under `.claude/state` | drain `graph.json` through `DrainStore`, `pipeline.db` with an `inflight` row, run checkouts under `~/.csf/runs` by default |
| Live status | web UI over WebSocket plus `noodle status` | statusline (duration, tokens, pi Run HUD with state and elapsed time); `bsvc runs list`; `pi-lane-status.ts`; `orch-state table` | `csf-drain status`, `next`, `escalations`, `reconcile`, `watch --until-idle` with `--json`; `csf-advance --resume` polls an in-flight row |
| Cost visibility | per-session USD, tokens, context percentage in UI | tokens and duration only; no USD in the statusline | none found in `csf-build/src` |
| Install and onboarding | `INSTALL.md` checklist run by an agent, tested by an agent in e2e; first-run scaffold | `INSTALL.md`, `scripts/doctor-install.ts`, `install-bsvc.ts` with its `.doctor.ts` | `csf-onboard`, `csf-setup`, `csf-session-init` |
| Generated-artefact checks | CI regenerates the skill and `git diff --exit-code`; TypeScript types are generated but not checked in `test.yml` | `check:settings-render`, `check:harnesses`, `check:codex-sync`, `check:harness-links`, `check:indexes:generated` (decisions, cheatsheet, harness counts), `check:indexes`, `check:code-ledger`: already a family with `check` and `rebuild` | not surveyed beyond `check:test-inventory` and `csf-gate`; no `rebuild|check` pairs seen in the bins |
| Fixture discipline | SHA-256 immutability test over all `*/testdata`, `fixturehash` sync and check, loop fixture record and check modes | `scripts/__fixtures__`; no hash or immutability check found | `fixtures/`, `fixtures/scenarios`; no hash or immutability check found |

### Tests that pin each doctrine

| Doctrine | Test that pins it, or none |
| --- | --- |
| NVIEW-1 | `TestRootCommandRegistersAllSubcommands` (`root_test.go:11`) pins the eight names; `TestWorktreeCommandRegistersSubcommands` (`:31`). Nothing pins the absence of steering commands. |
| NVIEW-2 | `TestValidateSpecCoverage` (`internal/schemadoc/render_test.go:80`); `TestRunSchema*` (`cmd_schema_test.go:8,22,33`); `TestGeneratedSkillContainsAllCommands` (`generate/skill_noodle_test.go`, seven names). None checks `cmdmeta` flags against cobra flags, or the `noodle mise` text. |
| NVIEW-3 | statever suite (`internal/statever/statever_test.go`, for example `TestCheckCompatibilityFutureVersion`); `TestRunStartRefusesFutureStateVersion` (`cmd_start_test.go:83`); `TestResetRemovesRuntimeState` (`cmd_reset_test.go:9`) writes a `noodle.lock` file but no test holds the lock, so the refusal to reset a running loop and the refusal to start twice are unpinned. |
| NVIEW-4 | `TestParseInvalidValues` (`config/config_test.go:123`), `TestLoadWarnsOnRemovedFields` (`:190`), `TestValidationClassification` (`:230`), `TestParseMissingOptionalUsesDefaults` (`:105`), `TestDefaultConfigValues` (`:10`). |
| NVIEW-5 | `TestReportConfigDiagnosticsStartPromptsAndLaunchesRepair` (`main_test.go:134`), `...StartRepairLaunchFailure` (`:221`), `...NoBacklogNonInteractive` (`:333`). |
| NVIEW-6 | `TestPostControl` (`server_test.go:113`), `TestPostControlInvalidJSON` (`:217`), `TestCORSBlocksNonLocalhost` (`:262`, a GET only), `TestIsLocalhostOrigin` (`:603`), `TestWSControl` (`:533`). None sends a cross-site POST or a non-JSON content type; there is no authentication to test. |
| NVIEW-7 | `TestCommandSequence*` and `TestProcessControlLineDerivesDeterministicIDWhenMissing` (`loop/control_test.go:575-833`) pin replay and ID dedupe. None exercises concurrent append and truncate. |
| NVIEW-8 | `TestDeriveSessionMetaRunningAndHealth` (`monitor/derive_test.go:8`) pins `stuck=false` after ten idle minutes; observer tests (`monitor/observer_test.go`, `pid_observer_test.go`); `TestRunOnceDirectoryFixtures`. No test of stuck detection exists because none is implemented. |
| NVIEW-9 | `TestGetSnapshot` (`server_test.go:44`), `TestWSConnection` (`:276`), `TestWSHubDiffGating` (`:315`), `...IgnoresActiveSessionClockDrift` (`:360`), `TestGetIndex` (`:657`); UI Vitest: `Dashboard.test.tsx`, `Sidebar.test.tsx`, `ReviewList.test.tsx`, `TreeView*.test.tsx`, `SchedulerFeed.test.tsx`, `VirtualizedFeed.test.tsx`, `AppLayout.test.tsx`. Generated types: none. |
| NVIEW-10 | `TestSmokeInstallMd` (`e2e/smoke_test.go:653`, build tag `e2e`, needs `codex`); `TestEnsureProjectStructure*` (`startup/firstrun_test.go`); `TestCLIIntegrationStartScaffolds` and `TestScaffoldedConfigValidation` (`startup/integration_test.go:19,124`). |
| NVIEW-11, 12, 13, 14, 15, 17, 19 | none (comparisons, recommendations or project facts). |
| NVIEW-16 | none; the e2e test follows the install steps but asserts only that the result starts. |
| NVIEW-18 | `TestFixtureSuitesDoNotMutateFixtureFiles` (`fixtures_immutability_test.go:15`) is the fixture test itself; `lint-arch.sh` and the commit hook have no tests found. |
| NVIEW-20 | `TestShouldStartServer` is unrelated; UI control sending is covered in part by `ReviewList.test.tsx`; the server whitelist is covered by `TestPostControl*`; nothing asserts that UI action types match the server whitelist. |

## Borrow list

Targets name the file and the change. csf-build's real repository was not located; `node_modules/csf-build` in `cub` is an installed copy, so csf targets are the same paths in the csf-build repository.

| Rank | What | Target (file and change) | Size | Risk | Depends on |
| --- | --- | --- | --- | --- | --- |
| 1 | A typed verb table for `csf-drain` that its parser, `--help` and a `--describe` JSON output share, with a test that fails when the parser has a verb or flag the table lacks, or the reverse (NVIEW-13) | csf-build `src/drain/csf-drain.ts`: move the verb list now in the header comment (`:17-60`) into a const consumed by the dispatcher; add `csf-drain --describe`; add `src/drain/csf-drain-verbs.test.ts` doing the two-way check, modelled on `internal/schemadoc/render.go:89-118` | medium | `csf-drain` runs live drains; change only through a work order | Open 1 |
| 2 | A fixture-immutability test: hash fixture trees before and after the suite, fail on any change (NVIEW-18) | csf-build: new `src/qa/qa-fixture-immutability.ts` registered in `qa-run-all`, over `fixtures/`; Qara: new `scripts/check-fixture-immutability.ts` over `scripts/__fixtures__` and wired as `check:fixture-immutability` in `package.json` | small each | slow if fixtures are large; value depends on fixtures having been mutated before, which was not looked for | none |
| 3 | A fix-line convention for Qara checks: each failing check prints code, location, one-line fix and the governing doc (NVIEW-15) | Qara `scripts/check-*.ts` (only 7 of 56 mention a fix); start with the checks that fail most, add a shared `scripts/lib/finding-format.ts` if one does not exist (`scripts/lib/index-gen.ts` already has a `Finding` type to extend) | small per check | low | survey of which checks fail most |
| 4 | Dollar cost per session in the statusline, if wanted (NVIEW-11) | Qara `scripts/statusline/input.ts:44-59`: read `cost.total_cost_usd` beside the duration it reads now (field presence in Claude Code's statusline input was not verified), and render it in `render-status.ts` | small | USD is partly notional on subscriptions, so the figure may mislead | Open 2 |
| 5 | Version marker with refuse-on-newer for any state file read by several tool versions (NVIEW-14) | Qara: the dispatch log `dispatch.jsonl` read by `scripts/orch-state.ts` (`parseDispatch`) is the first candidate since it already validates strictly; add a version field or sidecar `schema_version` | small | adds a format change to a live log | check which files cross versions |
| 6 | Read-side snapshot shape for a board drain window (NVIEW-12) | `wove-design/csf-board`: a read-only `GET /drain` returning sessions, orders, stages, status and cost in the shape of `internal/snapshot/types.go`, fed by `csf-drain status --json`; types generated rather than hand-copied | medium to large | duplicates `csf-drain watch` unless the owner wants a page | Open 3 |
| 7 | Agent-run install test (NVIEW-10) | Qara `scripts/doctor-install.ts` companion: a sandboxed live-model run of `INSTALL.md`, outside the default gate | medium | cost per run; needs a sandbox | owner decision, not asked: defer |

Rows removed after the closer reading: the "regenerate and `git diff --exit-code` for every generated artefact" row, because Qara already has `check` and `rebuild` pairs for settings, harnesses, indexes, the cheatsheet and codex sync; the "write token and content-type check for board sign-off" row, because csf-board already requires a bearer token and sends no CORS headers (NVIEW-12).

Not to borrow: the unauthenticated control POST and its file-append queue (NVIEW-6, 7); the `stuck` and context-budget placeholders (NVIEW-8); the repair-session launcher (NVIEW-5, 16); the INSTALL.md pattern of fetching executable scripts from a moving branch and reading chat history (NVIEW-16); warn-and-default for unknown config keys, which hides typos (NVIEW-4); hand-kept copies of the command table (NVIEW-2); the single project-wide `.noodle/` layout (NVIEW-14); running the Go binary as-is for these surfaces (NVIEW-17).

## Open

Questions for the owner, to ask one at a time:
1. Pilot a typed verb table with `--describe` on `csf-drain` only (borrow 1)? Recommendation: yes, as one work order in csf-build; extend to Qara scripts only if the pilot is cheap.
2. Do you want dollar cost visible per run (statusline, board), given subscription billing makes it partly notional? Recommendation: no for now; show tokens and elapsed time, which Qara already has, and revisit if metered runs grow.
3. Should the board get a read-only drain window, and if so before or after `csf-drain watch` proves insufficient? Recommendation: after; `watch` and `status --json` already cover a person watching a drain.

Settled in this pass and moved into doctrines: Noodle's control channel needs auth and the board already has it (NVIEW-12); Qara and csf already have generated-file checks (comparison table); the Linux download name is wrong in the docs (NVIEW-19); the statusline has no USD (NVIEW-11).

Facts still unknown:
- The csf-board server's `POST` handlers were not read for write protection beyond the bearer check (per-channel narrowing exists; the default principal has every permission).
- Whether Claude Code's statusline input carries a dollar cost field (borrow 4 depends on it).
- How `bsvc runs list` formats its output, since `bsvc` was not run; only its subcommands and the JSON fields `orch-state.ts` reads were seen.
- Whether the cross-site POST (NVIEW-6) and the lost control line (NVIEW-7) happen in practice; neither was run, and whether the ack is sent before the loop applies a command was not read.
- The UI's visual behaviour; it was read, not run.
- The csf-build repository's own location, and csf's generated-file checks beyond `check:test-inventory` and `csf-gate`.
- Whether the downloads in getting-started 404; names were compared with the asset list, not fetched.

## Sources

Noodle at `82d2921c52370f23f29086de81ccfb600939c037` (local clone; nothing built or run): `root.go`, `main.go`, `app_helpers.go`, `cmd_*.go` and their tests, `start_boundary.go`, `cmdmeta/cmdmeta.go`, `internal/schemadoc/`, `internal/statever/`, `internal/statusfile/`, `internal/snapshot/types.go`, `config/` and tests, `startup/`, `monitor/` and tests, `server/` and tests, `loop/control.go`, `loop/control_test.go`, `worktree/hook.go`, `worktree/diff.go`, `embed.go`, `ui/` (routes, components, `client/{api,ws,hooks,types}`, `package.json`), `tygo.yaml`, `generate/`, `fixtures_immutability_test.go`, `scripts/lint-arch.sh`, `scripts/fixturehash`, `e2e/smoke_test.go`, `.agents/hooks/`, `.claude/settings.json`, `.codex/config.toml`, `.githooks/commit-msg`, `.github/workflows/`, `.goreleaser.yml`, `CHANGELOG.md`, `CLAUDE.md`, `INSTALL.md`, `docs/getting-started.md`, `docs/reference/`, `brain/principles/`, `package.json`, `go.mod`, `LICENSE`, `VERSION`.

GitHub, read 2026-11-23 with `gh` (public, read only): `poteto/noodle` repository metadata, `gh release list`, `gh release view v0.1.5 --json assets`, `gh issue list --state all --limit 30`, `gh pr list --state all --limit 30`, `gh api repos/poteto/noodle/commits?per_page=30`.

Qara at `$HOME/qara`: `package.json` (`check:*`), `scripts/orch-state.ts`, `scripts/pi-lane-status.ts`, `scripts/statusline/` (`input.ts`, `render-hud.ts`, `types.ts`), `scripts/check-command-contract.ts`, `scripts/cheatsheet-index.ts`, `scripts/settings-render.ts`, `scripts/harnesses-codegen.ts`, `scripts/harness-links.ts`, `scripts/harness-topology.ts`, `scripts/codex-sync.ts`, `config/harnesses.toml`, `.claude/settings-src/`, `.claude/context/csf-pi-mechanics.md`, `.claude/context/herdr-guide.md`.

csf-build in `cub` (`node_modules/csf-build`, read only): `package.json` (bins), `src/drain/csf-drain.ts`, `src/engine/csf-advance-args.ts`, `src/lanes/csf-build-ownership.ts`, `src/qa/qa-anchor-coverage.ts`, `src/qa/gate-codes.ts`, `src/admission/csf-admit.ts`, `src/admission/csf-admission.ts`, `src/distribution/csf-onboard.ts`; `factory/_decisions.md`.

csf-board at `/media/ssdev/tg-pro/csf-board` (read only): `src/tokens.ts`, `src/access.ts`, `src/main.ts`, `src/http.ts`, `tokens.example.json`.

tobogan: `DOCTRINES.md`, `board/README.md`, `board/vercel-board.md`, `inference/inference-optimisation-skill.md` (format model).

Related documents on this track: NSKILL, NSCHED, NBRAIN, NMODE, NADAPT.
