# Model sweep smoke-20261122

Tokens are provider usage summed over the run (input + output + cache read + cache write). $ is pi's or Claude Code's list-price estimate, not plan credits. Spreads are median [p25–p75]; task pass rate is median [min–max] over tasks.

| cell | pass | pass rate (95% CI) | task pass rate | k tokens / pass | notional $ / pass | k tokens / run | startup s | wall s | cache hit | excluded (rate-limited) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| haiku | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 122 | 0.006 | 122 [122–122] | 1.5 [1.5–1.5] | 8 [8–8] | 0.84 [0.84–0.84] | 0 (0) |
| sonnet | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 72 | 0.058 | 72 [72–72] | 2.6 [2.6–2.6] | 9 [9–9] | 0.84 [0.84–0.84] | 0 (0) |
| opus | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 83 | 0.165 | 83 [83–83] | 2.4 [2.4–2.4] | 12 [12–12] | 0.79 [0.79–0.79] | 0 (0) |
| glm | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 53 | 0.005 | 53 [53–53] | 5.6 [5.6–5.6] | 51 [51–51] | 0.54 [0.54–0.54] | 0 (0) |
| codex | 1/1 | 1.00 (0.21–1.00) | 1.00 [1.00–1.00] | 270 | 0.132 | 270 [270–270] | 2.6 [2.6–2.6] | 47 [47–47] | 0.81 [0.81–0.81] | 0 (0) |

## Suspicious wins (check the output before counting)

None.

## Failure log

None.
