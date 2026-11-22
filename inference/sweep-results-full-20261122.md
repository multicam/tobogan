# Model sweep full-20261122

Tokens are provider usage summed over the run (input + output + cache read + cache write). $ is pi's or Claude Code's list-price estimate, not plan credits. Spreads are median [p25–p75]; task pass rate is median [min–max] over tasks.

- Tests mode: hidden. The model never saw the PR tests; this differs from Qara's 2026-11-12 sweep, which handed them over.
- Profile: effort/thinking medium everywhere; Claude with no settings sources (no hooks), pi on its defaults. Claude cost here runs lower than a real Claude Code subagent carrying Qara's hooks.

**Re-scored 2026-11-23 with the hardened escape scan.** The saved transcripts were replayed offline through the stricter scan (`bun sweep.ts rejudge`, no model call). Three of 125 rows changed; every other row kept its outcome:

| run | old | new | flagged call and why |
| --- | --- | --- | --- |
| q1508__glm__r3 | pass | invalid_escape | `/bin/cat /home/jean-marc/.agents/skills/code-style/SKILL.md`: a real out-of-tree read of a skill file that was not the answer |
| q1543__glm__r3 | pass | invalid_escape | `cd / && rm -rf "$d"` after `cd /tmp`: `cd /` is flagged by rule (like `find /`, `ls /`) even though the command only deleted its own temp dir; a false positive by intent, listed under Known limits in `sweep/README.md` |
| q1862__sonnet__r0 | invalid_escape | escape_attempt | `Read` of a mangled path (`full-20261122-q1862--sonnet--r0-tree/…`) that failed, so every flagged call failed; still excluded from pass counts |

GLM therefore has 23 counted runs, not 25, and its figures below are recomputed. Codex is unchanged at 25 of 25. The previous version of this file counted GLM 25/25 (1,221k tokens, $0.053 per pass).

**Ceiling:** every counted run in every cell passed (3 runs are excluded as escapes: q1508__glm__r3, q1543__glm__r3, q1862__sonnet__r0), so pass rate does not discriminate between models here; compare cost, startup and wall time instead.
For a discriminating wave, use harder tasks: larger multi-file PRs, cross-module refactors, specs that need a design decision, or tasks whose tests check behaviour the brief only implies. Add gate checks (typecheck, lint, the repo's line cap) to the oracle.

Deferred (parked by the Claude quota guard, resumed by a later run): 70 (sonnet 23, opus 24, haiku 23).

| cell | pass | pass rate (95% CI) | task pass rate | k tokens / pass | notional $ / pass | k tokens / run | startup s | wall s | cache hit | excluded (rate-limited) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| haiku | 2/2 | 1.00 (0.34–1.00) | 1.00 [1.00–1.00] | 574 | 0.019 | 574 [464–684] | 1.3 [1.2–1.3] | 69 [55–83] | 0.92 [0.91–0.93] | 23 (0) |
| sonnet | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 72 | 0.056 | 72 [72–72] | 1.9 [1.9–1.9] | 8 [8–8] | 0.84 [0.84–0.84] | 24 (0) |
| opus | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 286 | 0.291 | 286 [286–286] | 1.7 [1.7–1.7] | 77 [77–77] | 0.93 [0.93–0.93] | 24 (0) |
| glm | 23/23 | 1.00 (0.86–1.00) | 1.00 [1.00–1.00] | 1168 | 0.051 | 695 [386–1104] | 5.1 [2.3–5.6] | 248 [183–351] | 0.93 [0.86–0.95] | 2 (0) |
| codex | 25/25 | 1.00 (0.87–1.00) | 1.00 [1.00–1.00] | 266 | 0.128 | 289 [160–329] | 2.3 [2.1–2.5] | 68 [36–87] | 0.83 [0.78–0.89] | 0 (0) |

Notional $ / pass and k tokens / pass divide the cost of every counted attempt, failed attempts included, by the number of passes; a cell with failures looks dearer per pass than per run.

## Suspicious wins (check the output before counting)

None.

## Failure log

- q1508__glm__r3: invalid_escape — rejudged offline, still an escape: bash {"command":"/bin/cat /home/jean-marc/.agents/skills/code-style/SKILL.md 2>/dev/null | head -60","timeout":60000}
- q1862__sonnet__r0: escape_attempt — rejudged offline, all flagged calls failed: Read {"file_path":"/home/jean-marc/.cache/tobogan-model-sweep/full-20261122-q1862--sonnet--r0-tree/scripts/closeout/delete-merged-branch.ts"}
- q1543__glm__r3: invalid_escape — rejudged offline, still an escape: bash {"command":"cd /tmp && /usr/bin/sed -n '1' /dev/null; d=$(mktemp -d) && cd \"$d\" && /usr/bin/git init -q . && /usr/bin/git -c user.name=t -c user.email=t@t commit -q --allow-empty -m x && sha=$(/usr/bin/git rev-parse HEAD) && bun -e '\nconst { execFileSync } = require(\"node:child_process\");\

## Additional figures from raw data

Read from `results/full-20261122/runs.jsonl` and `manifest.json` (gitignored; not committed). Total tokens (input + output + cache read + cache write) per run, passing runs only, one row per run id with the latest winning. Codex passed all 25 runs; GLM passed 23 (two excluded, see the re-score note); the Claude cells have 4 passing runs in total, and 70 Claude runs were deferred.

| task | cell | n | min | median | max |
| --- | --- | --- | --- | --- | --- |
| q1468 | haiku | 1 | 353,765 | 353,765 | 353,765 |
| q1468 | glm | 5 | 628,590 | 994,412 | 1,550,409 |
| q1468 | codex | 5 | 266,014 | 309,802 | 325,517 |
| q1508 | sonnet | 1 | 71,521 | 71,521 | 71,521 |
| q1508 | glm | 4 | 383,158 | 417,564 | 467,765 |
| q1508 | codex | 5 | 137,386 | 159,517 | 189,847 |
| q1543 | haiku | 1 | 794,030 | 794,030 | 794,030 |
| q1543 | glm | 4 | 2,321,835 | 3,793,168 | 5,613,223 |
| q1543 | codex | 5 | 305,367 | 396,127 | 568,748 |
| q1862 | opus | 1 | 285,731 | 285,731 | 285,731 |
| q1862 | glm | 5 | 525,203 | 696,182 | 975,366 |
| q1862 | codex | 5 | 233,805 | 329,253 | 396,622 |
| q1928 | glm | 5 | 85,994 | 87,633 | 163,188 |
| q1928 | codex | 5 | 88,366 | 103,767 | 166,850 |

q1543 is the largest task. The GLM-to-Codex ratio of medians on q1543 is 9.6 (about 10x; GLM n=4 after the re-score, Codex n=5). The ratio of means across all five tasks is 4.4 (1,168k against 266k tokens per pass). The ratio of median wall time is 3.6 (248 s against 68 s).

Binding events (`bindingEvents` in `manifest.json`), the only one of the sweep:

- park claude at 2026-11-21T23:49:40.791Z, concurrency 3: five_hour 0.98 >= 0.98
- Time: 2026-11-21T23:49:40Z (sweep started 23:35:55Z).
- Window: Claude `five_hour`. Windows at sweep start were five_hour 0.96 and seven_day 0.76.
- Reading: five_hour 0.98, the guard's park threshold (`parkFiveHourAt` 0.98; seven_day threshold 0.95). Last logged readings: 0.96, 0.96, 0.96, 0.97, 0.98 across the five Claude runs.
- Concurrency at the park: 3 (ramp 2 to 5).
- Effect: 70 Claude runs recorded as `deferred`. GLM and Codex ran on to 25 runs each with no rate-limit exclusions.
