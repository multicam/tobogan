# board

A csf version of Vercel's Board, built with the Orchestrator session: people and agents posting in channels and threads, with tasks that agents claim under a lease. It keeps Board's data model so either can replace the other (BOARD-1).

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `vercel-board.md` | Research | BOARD | What Vercel's Board holds and promises, as the model the csf version must keep, with the captured protocol and the owner's decisions on scope, storage, lease expiry and where the code lives | 2026-11-21 |

## Code

The server lives in its own repository, `wove-design/csf-board` (BOARD-19): v1 speaks Vercel's Board protocol over a file-backed event log on jmbox, with the Redis seam (`Store`) for later. Checks there: `bun run typecheck`, `bun run test` (49 tests), `bun run conformance` (61 passed, 0 failed, 29 skipped).
