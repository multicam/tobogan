# LADDER: Harness, loops, graphs

**Track:** factory · **Type:** research · **Date:** 2026-11-19

**Question:** what does the "Harness, Loops, Graphs" article say about running coding agents with less human supervision, and what should this repository and the cub project adopt from it?

**Source note.** The source is an X Article: "Harness, Loops, Graphs: What Each Layer Fixes and What It Breaks" by @m4lkxx, dated 2026-10-25 (https://x.com/m4lkxx/status/2114338456750997922). x.com is blocked from this environment, so the article was not read. Its content here comes from public summaries that quote it, chiefly a long Korean summary and critique (`ahastudio/til`, `agentic-coding/harness-loop-graph.md`) and `ThePurpleMan16/agentprobe` `docs/RESEARCH.md`. Every statement about the article is therefore **Unverified**: secondary, possibly paraphrased. The doctrines below are this repository's decisions and stand on their own reasoning.

## The article, as summarised

**Claim.** Most "autonomous" agent setups are a human acting as the agent's loop: the human provides somewhere to work, says whether the result is right, and decides what happens next. Each of those jobs can be moved into a layer:

| Layer | Answers | In agentprobe's words |
| --- | --- | --- |
| Harness | What can the agent do? | "what the agent can do (environment)" |
| Loop | What is actually true? | "what is actually true (evidence)" |
| Graph | What happens next, and who may approve it? | "what happens next (authority)" |

**The ladder**, illustrated throughout with one hypothetical bug fix that ends in a pull request:

| Level | Layer | Adds |
| --- | --- | --- |
| 0 | Chat | Nothing: the human does everything |
| 1 | Harness | Hands: shell, files, test runner, git |
| 2 | Harness | Memory and walls: a progress file, commits as checkpoints, least privilege, sandbox or worktree, command allowlist, hard budgets. A permission the agent lacks is a wall; "don't touch migrations" is only a wish |
| 3 | Loop | A check that can fail. Evidence ranks: deterministic checks, then traces, then an independent reviewer, then the model's own report. Watch a new test fail first |
| 4 | Loop | Converging feedback recorded as EXPECTED / SAW / FENCE / DEAD ENDS. Stop when green; stop and escalate when the same SAW appears twice; stop when the budget runs out |
| 5 | Graph | Nodes, edges, state. An "early-start test" separates real dependencies from habit, so independent work runs in parallel |
| 6 | Graph | Gates priced by the cost of undo, not by the model's confidence: reversible ships on green; needs-cleanup needs green plus a trace plus a second opinion; irreversible (migrations, deletions, sent email, money) needs a human sign-off |
| 7 | Learning | Each failure is pushed into the layer that owns it, as a constraint, not a note in chat |

Advice attributed to it: start design at Level 3 by writing down what "green" means; most work stops at Level 4.

## Where this repository stands

| Level | Status here | Evidence |
| --- | --- | --- |
| 1 | Yes | Agents work with shell, files, tests and git |
| 2 | Partly | Commits are checkpoints and `DOCTRINES.md` is the memory. Walls: the session may push only to its working branch. Gaps: no wall stops a push to `master` or a committed secret beyond `.gitignore` |
| 3 | Yes, for code and documents | `m365/spike`: 106 tests, strict typecheck, build. Documents: `factory/checks` (LADDER-1). Not for tenant behaviour, which nothing can check yet (PLAN-1) |
| 4 | No | Iterations are not recorded in a converging format |
| 5 | Ad hoc | Independent research ran in parallel agents; no written graph |
| 6 | Implicit | Pull requests, merges and real-tenant actions already wait for the owner, but the rule is not written down |
| 7 | Yes | Doctrines are failures and decisions pushed into the layer that owns them; code gaps were closed with tests |

## Doctrines

**LADDER-1. Every track defines "green" as a command that can fail.**
- Code tracks: their test, typecheck and build commands (`m365/spike`: `npm test`, `npm run typecheck`, `npm run build`).
- Documents: `node factory/checks/check-repo.mjs .` fails on a dangling doctrine reference, a duplicate or unregistered doctrine, a doctrine without a Basis line, a document missing from its track's lookup table, or a tracked secret file.
- Why: without a check that can fail, "done" is the agent's own report, the weakest evidence. The repository check replaces the hand-run reference scan used until now.
- Basis: Decision, Tested (`factory/checks/check-repo.test.mjs`, 6 tests; green on this repository: 78 doctrines, 5 tracks before this document)

**LADDER-2. Prefer walls to wishes.**
A rule an agent can break by mistake is a wish; enforce the ones that matter with permissions, branch protection or a failing check.
- Why: prose rules are followed only as reliably as they are read.
- Consequences:
  - R-5 (no secrets in git) is now also a failing check (LADDER-1).
  - "Never push to `master` without the owner" should be branch protection on `master`, set by the owner in GitHub. Until then it is a wish backed only by the session's branch restriction.
  - The CI workflow in `.github/workflows/checks.yml` runs every check on each push, so a red result does not depend on an agent remembering to run it.
- Basis: Decision

**LADDER-3. Rank evidence: a deterministic check, then a trace, then an independent reviewer, then the model's own report.**
The Basis levels in `DOCTRINES.md` follow this order: Tenant-tested and Tested are deterministic checks; Verified is documentation; Unverified is everything weaker. A claim never moves up a level on an agent's say-so.
- Why: an agent's account of its own work is the evidence most likely to be wrong and least likely to say so.
- Basis: Decision

**LADDER-4. Watch a new test fail before trusting it.**
- Why: a test that has never failed may not test anything. This repository already caught one real bug this way (the team-grouping test in `matters` failed first and exposed wrong grant order).
- Basis: Decision

**LADDER-5. Gate each action by the cost of undoing it, not by how sure the agent is.**

| Cost of undo | Examples here | Gate |
| --- | --- | --- |
| Reversible | Editing files, commits and pushes to the working branch, publishing a private artifact | Green checks |
| Needs cleanup | Opening a pull request, posting a comment, creating a scheduled task, creating test data in a tenant | Green checks plus the owner's go-ahead for that kind of action |
| Irreversible | Merging to `master`, force-pushing, sending email from a real mailbox, sharing a document outside the firm, deleting or closing a real matter, changing permissions on a real site | The owner's sign-off, each time |

The same table governs the cub app itself: sending mail (MAIL-6), external sharing (POLICY-4, POLICY-6) and closing a matter (MATTER-9) are irreversible for the firm and stay behind a person's explicit action.
- Why: confidence is cheap to state and says nothing about damage; the cost of undo is a property of the action.
- Basis: Decision

**LADDER-6. Run long fix-and-check work as a converging loop, written down as EXPECTED / SAW / FENCE / DEAD ENDS.**
- EXPECTED: what green looks like for this step. SAW: what actually happened. FENCE: what the next attempt must not change. DEAD ENDS: what was tried and failed.
- Stop when green. Stop and escalate to the owner when the same SAW appears twice. Stop when the agreed budget (attempts or time) runs out.
- First use: the PLAN-1 tenant tests, one record per test.
- Why: a loop without a record repeats its mistakes; a loop without a stop condition burns budget on a problem it cannot solve.
- Basis: Decision

**LADDER-7. Run work in parallel only when it passes the early-start test.**
Two pieces of work are independent when neither needs the other's result or touches the other's files; only then run them at the same time (for example, separate research agents).
- Why: false parallelism produces conflicting edits and duplicated work.
- Basis: Decision

**LADDER-8. Push every failure into the layer that owns it.**
A mistake becomes a doctrine, a check or a test, not a remark in a conversation.
- Why: conversations end; the repository is what the next session reads.
- Basis: Decision

## Open

- **Verbatim source.** Paste the article's text to replace the secondary summary; the doctrines would then be checked against it and its statements marked Verified.
- **Branch protection on `master`** is the owner's action in GitHub (LADDER-2).
- **Budgets** for LADDER-6 (attempts per tenant test, time per session) are the owner's call.
- **"Factory".** This article and HUMANS.md together suggest the track is about the agent working setup: who the agents work for (HUMANS) and how they work (LADDER).

## Sources

- https://x.com/m4lkxx/status/2114338456750997922 (not reachable from here)
- https://github.com/ahastudio/til/blob/e14a8e75ac3908ea22795408136c244cb2c3bb01/agentic-coding/harness-loop-graph.md (secondary, Korean)
- https://github.com/ThePurpleMan16/agentprobe/blob/682316b5d45281a87790e6c0d9a76d3f78c0818a/docs/RESEARCH.md (secondary)
- https://github.com/djh00t/agentskills/blob/c0cd27afe4dc11a8f55ee7dd47bd6093b3cfe36b/RELEASE-LANES.md (secondary: "gate on the price of undo")
