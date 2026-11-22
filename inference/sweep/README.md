# sweep

A one-off measurement harness: how often each lighter hosted model's first attempt is accepted, and what each accepted result costs. It serves INFER-3 to INFER-8 and the Open items "Subscription limits", "Spawn overhead" and "Draft acceptance per rung" in `../inference-optimisation-skill.md`. The owner approved the design on 2026-11-22.

## Design

- **Cells, five routes** (`cells.ts`):
  - `haiku`, `sonnet` and `opus` run through `claude -p` on the subscription. The child environment is an allowlist: `PATH`, `HOME`, `USER`, `LOGNAME`, `SHELL`, `TERM`, `TMPDIR`, `TZ`, `LANG`, `LC_*`, `XDG_*`, proxy and CA-bundle variables, and the subscription `CLAUDE_CODE_OAUTH_TOKEN`. Everything else is dropped (`ANTHROPIC_*` including model overrides, `AWS_*`, `GOOGLE_APPLICATION_CREDENTIALS`, other providers' keys). pi cells keep a denylist instead, because they need their own provider credentials. `--bare` is never used, because it forces API-key auth. Every run checks that the init event reports `apiKeySource: none`; a run that does not is killed as soon as that event arrives and recorded as a `route_error`. The check fails closed: only the exact string `none` passes, so an init event with a missing or non-string `apiKeySource` is killed too. It applies to Claude cells only.
  - `glm` runs through `pi -p --provider zai --model glm-5.3-flash`, on the Z.AI Coding Plan endpoint. This is the route Qara's pi skill approves.
  - `codex` runs through `pi -p` with no provider or model flag, which takes pi's default route (`openai-codex`).
  - The resolved provider and model are read from the stream, never from the flags. Effort or thinking is `medium` in every cell.
- **Harness profile "lean":**
  - Claude runs with `--setting-sources ''` and `--strict-mcp-config`, permission mode `dontAsk`, and only the Bash, Read, Edit, Write, Glob and Grep tools. It loads no user or project hooks.
  - pi runs on its defaults.
  - Both read the run tree's own `CLAUDE.md` and `AGENTS.md`. Claude also reads the global `~/.claude/CLAUDE.md`, which cannot be turned off without `--bare`.
- **Tasks, five merged qara PRs** (`tasks.ts`), each of a different kind. Three are reused from Qara's 2026-11-12 sweep.
- **Run tree:**
  - Each run starts from `git archive <parent>`, unpacked into a fresh one-commit repo outside any checkout. No history is present, so the merged fix cannot be reached through git.
  - The source repo's `node_modules` is symlinked in.
  - Trees live under `--work-dir`, by default `~/.cache/tobogan-model-sweep`, and are deleted after judging.
- **Tests visible or hidden** (`--tests visible|hidden`):
  - `visible`: the PR's test file is already in the tree, and the brief names it. This is the default, as in the 2026-11-12 sweep.
  - `hidden`: the brief only says that unseen tests will judge the change.
- **Per run:**
  - **Sanity gate:** the diff must be non-empty and must apply.
  - **Escape scan:** checks only where each tool call goes, never what it writes. That means file-tool path fields and the shell command.
    - Flagged: paths in the source repo or its worktrees, `~/.claude/projects`, the results dir, or another run's tree; `gh`, `git fetch/pull/clone`, `curl` or `wget` in command position; web tools; and any path that resolves outside the run's tree.
    - Path check: file-tool paths and Glob patterns resolve against the tree root (`../x` and `~` count); in shell commands, tokens that walk up (`..`, `../x`), start with `~`, or are absolute under a system root (`/home`, `/etc`, `/var`, …) are resolved, tracking `cd` within one command. Allowed besides the tree: the read-only deps copy, `/usr`, `/bin`, `/lib`, `/tmp` and `/dev/null`. The run's own work dir is not allowed: `../x` from the tree lands in it.
    - Attempt versus leak: each flagged call is paired with its tool result (Claude `tool_result` by `tool_use_id`; pi `turn_end.toolResults` by `toolCallId`). If every flagged call failed, the run is `escape_attempt`; if any succeeded, or has no result, it is `invalid_escape` (fails closed). A failed shell call counts as an attempt only when it is one simple command, since a compound command can read and then fail. Both outcomes are excluded from pass counts, and the failure log names which one.
    - The scan is a denylist plus a path check. It does not prove confinement: a path built at run time (`$HOME`, a variable, a glob) passes.
    - Not flagged: `git log` and `git show` inside the tree, because the tree holds a single commit and has no history to leak.
  - **Oracle:** the model's diff, minus the test files, is applied to a second clean parent export that holds the pristine PR tests. `bun test` then decides; no model judges.
  - **Recorded:** tokens (input, output, cache read, cache write) from the usage fields, time to first streamed output (spawn overhead), wall time, cache-hit rate, the list-price estimate the CLI reports, and quota-window readings where visible.
- **Schedule:**
  - The run order is shuffled with a seed and interleaved, so cells alternate.
  - Concurrency starts at `--concurrency-start` and rises by one after every `--raise-every` clean runs, up to `--concurrency-max`, with at least `--min-gap-s` between launches.
  - A rate limit halves concurrency, pauses launches for `--cooldown-min`, and is logged in `manifest.json` under `bindingEvents`. The first entry there is the limit that bound first.
- **Outcomes** (`record.ts`):
  - Counted toward pass rate: `pass`, `fail`, `sanity_fail` and `timeout`.
  - Excluded and logged: `rate_limited`, `run_error`, `route_error`, `invalid_escape` (a call that left the tree succeeded) and `escape_attempt` (every such call failed).
  - `deferred` runs were parked by the Claude quota guard and are resumed by a later `run`.
  - `--retry-excluded` re-runs the excluded runs on resume.

## Run

All commands run from this directory.

```bash
bun test                              # unit tests
bun run typecheck                     # tsc --noEmit, strict (typescript and @types/bun are dev dependencies)
bun probe.ts <haiku|sonnet|opus|glm|codex>   # one trivial prompt: proves auth and usage capture
bun sweep.ts prove                    # RED/GREEN proof of every oracle (results/prove/)
bun sweep.ts run --sweep full-YYYYMMDD --reps 5 \
  --concurrency-start 2 --concurrency-max 5 --raise-every 5 --min-gap-s 120
bun sweep.ts rejudge --sweep full-YYYYMMDD     # offline, no model call: re-scan + re-judge invalid_escape and escape_attempt runs
bun sweep.ts summarize --sweep full-YYYYMMDD
```

To resume after an interruption, re-run the same `run` command. Runs already in `results/<sweep>/runs.jsonl` are skipped.

## Outputs

`results/` is gitignored. It holds:
- `runs.jsonl`, one row per run;
- `manifest.json`, with the argv, CLI versions, profile, task SHAs, ramp settings and binding events;
- `runs/<runId>/`, with the transcript, stderr, diff and oracle log of each run;
- `summary.md` and `summary.json`.

Each cell gets the median and spread of the pass rate (over tasks), tokens and list-price dollars per pass, startup time, wall time and cache-hit rate. The summary also has a suspicious-win list, a failure log and an "Additional figures from raw data" section (per task and cell, min, median and max tokens of passing runs, one row per run id with the latest winning, plus the park and rate-limit events from `manifest.json`). Cost per pass divides every counted attempt's cost, failed ones included, by the passes. Commit the summary into the track, not the raw results.

## Known limits

- Effort is recorded as requested (`medium`), not as resolved: neither CLI reports the effort it actually used.
- Per-run quota share is not observable. Claude reports threshold-level plan-window readings in `rate_limit_event`; pi relays no quota fields.
- The dependency snapshot is Qara's current `node_modules`, not each task parent's lockfile.
- The escape scan reads only where a call goes. A forbidden path inside a shell heredoc body (`cat <<EOF … ../x … EOF`) is part of the command string and can be flagged falsely. The working directory carries across calls only within one command string, so an honest `cd sub` in one call followed by `cat ../file` in the next resolves from the tree root and is flagged.
- Pi bash results carry `isError` only as the tool reports it; a shell call that failed is an `escape_attempt` only when it is a single simple command.
- The Claude environment allowlist could not be exercised against a live `claude -p` in this change; the first `probe.ts` run of a Claude cell is the check.
