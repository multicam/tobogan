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
