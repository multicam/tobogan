# factory

How agents work with the owner and on this repository: who they work for (HUMANS.md) and how far they can run on their own (harness, loops, graphs). Sources: HUMANS.md (https://humansmd.dev) and the article "Harness, Loops, Graphs" (https://x.com/m4lkxx/status/2114338456750997922). Neither page is reachable from this environment: HUMANS.md was read through its source repositories, and the article from the text the owner pasted.

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `harness-loops-graphs.md` | Research | LADDER | What the "Harness, Loops, Graphs" ladder says, where this repository stands on it, and the rules adopted from it: defined green, walls, evidence ranking, gates by cost of undo, frozen results, code for deterministic steps | 2026-11-19 |
| `humans-md.md` | Research | HUMANS | What HUMANS.md is, whether it is sound, how it fits with `DOCTRINES.md`, and a proposed profile from what the owner has stated | 2026-11-19 |

## Code

| Directory | What | Checks |
| --- | --- | --- |
| `checks/` | Repository checker: doctrine references and definitions, track lookup tables, tracked secrets (LADDER-1) | `node --test` (7 tests); run with `node factory/checks/check-repo.mjs .` |

CI: `.github/workflows/checks.yml` runs the checker and the `m365` spike's typecheck, tests and build on every push (LADDER-2).
