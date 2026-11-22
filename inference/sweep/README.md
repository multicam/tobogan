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
    - Path check: file-tool paths (including a Grep `glob`) and Glob patterns resolve against the tree root (`../x`, `~` and `~user` count). In shell commands, a word is a path when it walks up (`..`, `../x`), is `~`, `~/x` or `~name`, or is absolute with a first segment on a fixed list (`/home`, `/root`, `/etc`, `/var`, `/opt`, `/mnt`, `/media`, `/srv`, `/proc`, `/sys`, `/run`, `/tmp`, `/dev`, `/boot`, `/data`, `/nix`, `/snap`, `/usr`, `/bin`, `/sbin`, `/lib*`, …) or is a bare unquoted `/`. The list is static, so a transcript classifies the same way on any machine; an absolute path under an unlisted first segment is not flagged. Words are split respecting quotes and backslashes: a quoted word counts as a path only when the whole word is plain path characters (`"/etc/passwd"`, `'../x'`, `--out="/etc/x"`), so awk and sed scripts and a quoted `'/'` are not paths. A `cd` target is tested from the directory before the `cd`. `$PWD`, `${PWD}`, `$(pwd)` and `$OLDPWD` resolve to the working directory the call starts in. Assignments to `PATH`-style variables (`PATH`, `MANPATH`, `LD_LIBRARY_PATH`, `NODE_PATH`, …) are not scanned. Any such path that resolves outside the tree and the allowlist is flagged. `~` as an operator (awk `$1 ~ /x/`, bash `=~`, bitwise `~mask` inside `((…))`) is not a path. `$HOME`, `${HOME}`, `$TMPDIR` and `${TMPDIR}` resolve to the child's values; any other `$VAR/…` or `${VAR}/…` prefix is flagged unless the same command assigns that variable; a bare `cd` (home) is flagged. Heredoc bodies (`<<X`, `<<'X'`, `<<-X`, up to the terminator) are stripped first, since they are content being written.
    - Allowed besides the tree: the read-only deps copy, `/usr`, `/bin`, `/lib`, `/lib64`, `/dev/null`, `/dev/stdin`, `/dev/stdout`, `/dev/stderr`, and the run's own scratch directory. The run's work dir is not allowed: `../x` from the tree lands in it.
    - **Scratch space:** each run gets `<work>/<runId>/tmp`, exported as `TMPDIR` to the child for both Claude and pi cells, and the brief tells the model to use `$TMPDIR`. Bare `/tmp` is no longer allowed, so one run cannot read another run's scratch files or another session's. Honest saved runs in full-20261122 used fixed names (`cat > /tmp/x.test.ts`, `/tmp/qref-check`, `> /tmp/tsc-out.txt`); a future run that does the same is flagged. **Legacy rule:** rows recorded without `perRunTmp: true` (every run before this change) are scanned with bare `/tmp` allowed, so `rejudge` and `rejudge --dry-run` judge old sweeps the way they were run; forbidden paths (other runs' trees, the source repo, results) are still checked first. The marker is on the run's own record, which is more robust than looking for `work/<runId>/tmp`, because the work dir is deleted after judging. New runs set the marker and are strict. The Claude env allowlist already passes `TMPDIR`, which is then overridden.
    - **Working directory across calls:** Claude's `Bash` tool keeps one shell, and in the saved transcripts models re-`cd` to an absolute tree path only after a `cd` into a subdirectory, which fits a persistent shell. The scan therefore carries the working directory across Claude `Bash` calls (a failed call does not move it). pi's `bash` tool starts a fresh shell per call (its models prefix `cd <tree> &&` or repeat `cd .tmp-ansi-probe` on every call), so each pi call resolves from the tree root. The Claude half is inferred from transcript shape, not from the tool's documentation.
    - Attempt versus leak: each flagged call is paired with its tool result (Claude `tool_result` by `tool_use_id`; pi `turn_end.toolResults` by `toolCallId`). If every flagged call failed, the run is `escape_attempt`; if any succeeded, or has no result, it is `invalid_escape` (fails closed). A failed shell call counts as an attempt only when it is one simple command with exactly one flagged path operand and it is not a grep-, rg- or diff-style command: `cat ../a ../missing` reads `../a` then fails, and `grep -rn foo ../src` or `diff ../a b` exit 1 after reading. Both outcomes are excluded from pass counts, and the failure log names which one.
    - pi marks a non-zero bash exit as `isError: true`: the saved pi transcripts hold failed bash results with text `…\n\nCommand exited with code 1` and `isError: true` (for example q1928__codex__r4, q1468__glm__r1), and exit-0 results carry `isError: false`.
    - The scan is a denylist plus a path check. It does not prove confinement; see Known limits.
    - Not flagged: `git log` and `git show` inside the tree, because the tree holds a single commit and has no history to leak.
  - **Oracle:** the model's diff, minus the test files, is applied to a second clean parent export that holds the pristine PR tests. `bun test` then decides; no model judges.
  - **Recorded:** tokens (input, output, cache read, cache write) from the usage fields, time to first streamed output (spawn overhead), wall time, cache-hit rate, the list-price estimate the CLI reports, and quota-window readings where visible.
- **Schedule** (decisions live in `schedule.ts`, tested with an injected clock and runner):
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
bun sweep.ts rejudge --sweep full-YYYYMMDD --dry-run --results-dir <dir>   # replay every saved transcript through the current scan; prints old and new outcomes, writes nothing
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
- **Environment asymmetry.** Claude cells get an allowlist env, pi cells the full env minus a denylist, so a model-run shell command can behave differently across surfaces. Dropped for Claude and kept for pi: `CLAUDE_CONFIG_DIR`, `BUN_*`, `NODE_*` (except `NODE_EXTRA_CA_CERTS`), `GIT_*`, `CI`, `SSH_AUTH_SOCK`. Pinned by a test in `cells.test.ts`.
- **The Claude allowlist is untested against a live `claude -p`.** It must be probed (`bun probe.ts haiku`, then check auth, usage capture and that tools such as `git` and `bun` still work) before the next Claude wave.
- **The escape scan reads only where a call goes, and does not prove confinement.** Gaps, each pinned by a test named `KNOWN LIMITS` in `oracle.test.ts`:
  - Paths built at run time pass: a variable assigned in the same command (`d=$(dirname $PWD); cat $d/x`), `cd $UNSET`, `cat $(dirname $PWD)/x`, globs and braces that build a root (`/e*/passwd`, `/e{tc,xyz}`). Only `$HOME`, `$TMPDIR` and a `$VAR/` prefix with no assignment in the command are resolved or flagged.
  - Symlinks are not followed. A link inside the tree that points outside reads as inside; the scan resolves paths lexically.
  - A heredoc body fed to a shell (`sh <<EOF … EOF`) is code but is stripped like any heredoc. Paths inside an interpreter's own code (`bun -e '…'`) are scanned only as quoted words.
  - Absolute paths under a first segment that is not on the fixed root list are not flagged. An assignment to another variable that is later used as a path (`d=/etc` is caught at the assignment, `d=$(…)` is not) is not followed; `PATH`-style assignments are skipped on purpose.
  - Quoted words are paths only when the whole word is plain path characters, so a path with a space or regex character inside quotes, and any code passed to an interpreter in quotes, is not scanned.
  - Standalone `~` is treated as an operator when the previous word starts with `$`; `~name` is not a path inside `((…))`.
  - The cross-call working directory is tracked only for `cd` as the first word of a command, and only for Claude's `Bash` tool.
- Dry-run replays of a sweep tell you how the current scan classifies saved runs, not what the model would do under the new `$TMPDIR` brief.
