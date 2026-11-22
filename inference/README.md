# inference

Model inference speed and cost: what external work on serving optimisation teaches, and what carries over to running many lighter hosted models in parallel across our subscriptions (Qara subagents and pi Runs, csf drain workers).

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `inference-optimisation-skill.md` | Research | INFER | What `sybil-solutions/inference-optimisation-skill` does, how sound it is, which ideas transfer to parallel hosted lighter models, and whether to adopt, adapt, link or reject it | 2026-11-22 |
| `sweep-results-full-20261122.md` | Results | INFER | Summary of the full model sweep (5 cells, 5 tasks, n=5; Claude parked by the quota guard): cost, speed and cache hit per cell. Raw data is gitignored | 2026-11-22 |
| `sweep-results-smoke-20261122.md` | Results | INFER | Summary of the one-run-per-cell smoke sweep that preceded it | 2026-11-22 |

## Code

| Directory | What | Checks |
| --- | --- | --- |
| `sweep/` | One-off model sweep harness: first-attempt acceptance and cost per accepted result for haiku, sonnet, opus (Claude Code subscription), GLM (Coding Plan via pi) and Codex (pi default route), judged by merged PRs' own tests (INFER-3 to INFER-8) | `bun test` and `bun run typecheck` in `sweep/` |
