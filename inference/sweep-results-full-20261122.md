# Model sweep full-20261122

Tokens are provider usage summed over the run (input + output + cache read + cache write). $ is pi's or Claude Code's list-price estimate, not plan credits. Spreads are median [p25–p75]; task pass rate is median [min–max] over tasks.

- Tests mode: hidden. The model never saw the PR tests; this differs from Qara's 2026-11-12 sweep, which handed them over.
- Profile: effort/thinking medium everywhere; Claude with no settings sources (no hooks), pi on its defaults. Claude cost here runs lower than a real Claude Code subagent carrying Qara's hooks.

**Ceiling:** every attempted run in every cell passed, so pass rate does not discriminate between models here; compare cost, startup and wall time instead.
For a discriminating wave, use harder tasks: larger multi-file PRs, cross-module refactors, specs that need a design decision, or tasks whose tests check behaviour the brief only implies. Add gate checks (typecheck, lint, the repo's line cap) to the oracle.

Deferred (parked by the Claude quota guard, resumed by a later run): 70 (sonnet 23, opus 24, haiku 23).

| cell | pass | pass rate (95% CI) | task pass rate | k tokens / pass | notional $ / pass | k tokens / run | startup s | wall s | cache hit | excluded (rate-limited) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| haiku | 2/2 | 1.00 (0.34–1.00) | 1.00 [1.00–1.00] | 574 | 0.019 | 574 [464–684] | 1.3 [1.2–1.3] | 69 [55–83] | 0.92 [0.91–0.93] | 23 (0) |
| sonnet | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 72 | 0.056 | 72 [72–72] | 1.9 [1.9–1.9] | 8 [8–8] | 0.84 [0.84–0.84] | 24 (0) |
| opus | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 286 | 0.291 | 286 [286–286] | 1.7 [1.7–1.7] | 77 [77–77] | 0.93 [0.93–0.93] | 24 (0) |
| glm | 25/25 | 1.00 (0.87–1.00) | 1.00 [1.00–1.00] | 1221 | 0.053 | 695 [390–1214] | 5.1 [2.3–5.6] | 249 [217–361] | 0.93 [0.88–0.96] | 0 (0) |
| codex | 25/25 | 1.00 (0.87–1.00) | 1.00 [1.00–1.00] | 266 | 0.128 | 289 [160–329] | 2.3 [2.1–2.5] | 68 [36–87] | 0.83 [0.78–0.89] | 0 (0) |

## Suspicious wins (check the output before counting)

None.

## Failure log

- q1862__sonnet__r0: invalid_escape — rejudged offline, still an escape: Read {"file_path":"~/.cache/tobogan-model-sweep/full-20261122-q1862--sonnet--r0-tree/scripts/closeout/delete-merged-branch.ts"}

## Additional figures from raw data

Read from `results/full-20261122/runs.jsonl` and `manifest.json` (gitignored; not committed). Tokens are input + output + cache read + cache write, one value per run, passing runs only (all 5 per cell passed).

q1543 (the largest task), total tokens per run, n=5 each:

| cell | min | median | max |
| --- | --- | --- | --- |
| glm | 2,321,835 | 3,668,198 | 5,613,223 |
| codex | 305,367 | 396,127 | 568,748 |

The GLM-to-Codex ratio of medians on q1543 is 9.3 (about 10x). The ratio of means across all five tasks is 4.6 (1,221k against 266k tokens per pass).

Claude park event (`bindingEvents` in `manifest.json`), the only binding event of the sweep:

- Time: 2026-11-21T23:49:40Z (sweep started 23:35:55Z).
- Window: Claude `five_hour`. Windows at sweep start were five_hour 0.96 and seven_day 0.76.
- Reading: five_hour 0.98, the guard's park threshold (`parkFiveHourAt` 0.98; seven_day threshold 0.95). Last logged readings: 0.96, 0.96, 0.96, 0.97, 0.98 across the five Claude runs.
- Concurrency at the park: 3 (ramp 2 to 5).
- Effect: 70 Claude runs recorded as `deferred`. GLM and Codex ran on to 25/25 each with no rate-limit exclusions.
