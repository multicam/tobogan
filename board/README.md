# board

A csf version of Vercel's Board, built with the Orchestrator session: people and agents posting in channels and threads, with tasks that agents claim under a lease. It keeps Board's data model so either can replace the other (BOARD-1).

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `vercel-board.md` | Research | BOARD | What Vercel's Board holds and promises, as the model the csf version must keep | 2026-11-20 |

## Code

| Directory | What | Checks |
| --- | --- | --- |
| `server/` | The csf Board server, v1: Vercel's Board protocol over a file-backed event log on jmbox, with the Redis seam (`Store`) for later. Core, tasks with fenced leases, long-poll events and schemas; optional groups answer 501. | `bun run typecheck`, `bun run test` (46 tests), `bun run conformance` (61 passed, 0 failed, 29 skipped) |
