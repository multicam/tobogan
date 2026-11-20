# LADDER: Harness, loops, graphs

**Track:** factory · **Type:** research · **Date:** 2026-11-19

**Question:** what does the "Harness, Loops, Graphs" article say about running coding agents with less human supervision, and what should this repository and the cub project adopt from it?

**Source note.** The source is an X Article: "Harness, Loops, Graphs: What Each Layer Fixes and What It Breaks" by @m4lkxx, dated 2026-10-25 (https://x.com/m4lkxx/status/2114338456750997922). x.com is blocked from this environment; the owner pasted the article's text on 2026-11-19, and this document is checked against that text. The pasted text ends mid-sentence at its closing call to action ("If"), after the summary; nothing of substance is missing. Quotations below are verbatim. The doctrines are this repository's decisions and stand on their own reasoning.

## The article

**Claim.** "You are not using your agent. You are its loop." Almost every "autonomous" setup is a person doing three jobs the system was supposed to do: "giving the model a place to work, telling it whether it was right, deciding what happens next." The three are not a menu but a ladder: "Each layer exists because the one below it breaks in a specific, predictable way."

| Layer | The article's words |
| --- | --- |
| Harness | "what the agent CAN do -> environment" |
| Loop | "what is actually TRUE -> evidence" |
| Graph | "what happens NEXT -> authority" |

**The ladder**, illustrated throughout with one bug report (#482, a login redirect loop) that an agent must fix and turn into a pull request:

| Level | Name | Adds | What breaks next |
| --- | --- | --- | --- |
| 0 | Chat | Nothing: "you are everything" | You, the bottleneck on all three jobs |
| 1 | Harness: hands | Shell, files, test runner, git. "Remove the model from your architecture diagram. Everything still on the page is the harness." "Ten narrow, documented tools beat forty overlapping ones" | No memory and no walls |
| 2 | Harness: memory and walls | `PROGRESS.md` (goal, tried, known, next, never), commits as checkpoints, artifacts by reference; least privilege, worktree or sandbox, command allow-lists, hard token and time budgets. "'Please do not touch migrations' is a wish. A permission the agent does not have is a wall" | "Fixed! All tests should pass now" |
| 3 | Loop: the check | "A check is only as strong as the weakest thing it accepts as proof." Evidence from strongest: deterministic, observable trace, independent reviewer, self-report. Write GREEN before the code; the new test must fail first. "Writing the check is writing the spec" | Six identical failures: "red is not feedback, it is a verdict" |
| 4 | Loop: feedback | FAILED / EXPECTED / SAW / FENCE / DEAD ENDS. Exit when green, when "the same SAW comes back twice" (escalate), or when the budget is spent (escalate). "A loop can fix the work. A loop cannot fix the question" | Correct steps, but serial, slow and "one opinion" |
| 5 | Graph: shape | Node, edge, state. Early-start test: "What would break if B started before A finished?" Cut where things fail separately; give every worker its own context; "If the step should give the same output every time it sees the same input, it is code"; gate where work leaves a node | One failure reruns everything; every change gets the same treatment |
| 6 | Graph: gates and return paths | "Freeze what passed": only the failed node reruns. "Gate on the price of undo": one-click undo ships on green; cleanup undo needs green, trace and a second opinion; no undo means "a person signs", with no confidence score to beat. "The model labels the change. Code decides what the label unlocks" | No memory across runs: the same lesson paid twice |
| 7 | Learning | Every failure becomes a constraint on the layer that owns it. "Put a lesson on the wrong layer and it turns into advice." Test: "The same class of failure never costs you twice" | |

**How to climb.** "You cannot skip levels." "But you design from the middle": write the Level 3 check first, which tells you what the harness needs and where the graph needs gates. "Most tasks are done at Level 4. Climb only when the failure at your current level costs more than building the next one." Closing line: "It is a system that needs you once, at the right place."

## Where this repository stands

| Level | Status here | Evidence |
| --- | --- | --- |
| 1 | Yes | Agents work with shell, files, tests and git |
| 2 | Partly | Commits are checkpoints and `DOCTRINES.md` is the memory. Walls: the session may push only to its working branch. Gaps: no wall stops a push to `master` or a committed secret beyond `.gitignore` |
| 3 | Yes, for code and documents | `m365/spike`: 522 tests with coverage thresholds, strict typecheck, build. Documents: `factory/checks` (LADDER-1). Not for tenant behaviour, which nothing can check yet (PLAN-1) |
| 4 | No | Iterations are not recorded in a converging format; no budgets |
| 5 | Ad hoc | Independent research ran in parallel agents; no written graph |
| 6 | Written (LADDER-5), not coded | Pull requests, merges and real-tenant actions wait for the owner, but nothing in code maps a change's label to its gate, and passed work is not frozen |
| 7 | Yes | Doctrines are failures and decisions pushed into the layer that owns them; code gaps were closed with tests |

## Doctrines

**LADDER-1. Every track defines "green" as a command that can fail.**
- Code tracks: their test, typecheck and build commands (`m365/spike`: `bun run test`, `bun run typecheck`, `bun run build`).
- Documents: `node factory/checks/check-repo.mjs .` fails on a dangling doctrine reference, a duplicate or unregistered doctrine, a doctrine without a Basis line, a document missing from its track's lookup table, or a tracked secret file.
- Why: without a check that can fail, "done" is the agent's own report, the weakest evidence. The repository check replaces the hand-run reference scan used until now.
- Why, in the article's words: "If you cannot say what green means, no layer will save you."
- Basis: Decision, Tested (`factory/checks/check-repo.test.mjs`, 7 tests; seen failing on a deliberately broken copy of the repository, green on the real one)

**LADDER-2. Prefer walls to wishes.**
A rule an agent can break by mistake is a wish; enforce the ones that matter with permissions, branch protection or a failing check.
- Why: prose rules are followed only as reliably as they are read.
- Consequences:
  - R-5 (no secrets in git) is now also a failing check (LADDER-1).
  - "Never push to `master` without the owner" becomes branch protection on `master`: pull request and the `checks` CI required. The owner agreed to set it on 2026-11-19; until it is on, it is a wish backed only by the session's branch restriction.
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

The same table governs the cub app itself: sending mail (MAIL-6), external sharing (POLICY-4) and closing a matter (MATTER-9) are irreversible for the firm and stay behind a person's explicit action.
- Why: confidence is cheap to state and says nothing about damage; the cost of undo is a property of the action.
- Basis: Decision

**LADDER-6. Run long fix-and-check work as a converging loop, written down as EXPECTED / SAW / FENCE / DEAD ENDS.**
- EXPECTED: what green looks like for this step. SAW: what actually happened. FENCE: what the next attempt must not change. DEAD ENDS: what was tried and failed.
- Stop when green. Stop and escalate to the owner when the same SAW appears twice. Stop after 3 attempts (owner, 2026-11-19).
- First use: the PLAN-1 tenant tests, one record per test.
- Why: a loop without a record repeats its mistakes; a loop without a stop condition burns budget on a problem it cannot solve.
- Basis: Decision

**LADDER-7. Run work in parallel only when it passes the early-start test.**
Two pieces of work are independent when neither needs the other's result or touches the other's files; only then run them at the same time (for example, separate research agents).
- Why: false parallelism produces conflicting edits and duplicated work.
- Basis: Decision

**LADDER-8. Push every failure into the layer that owns it.**
A mistake becomes a doctrine, a check or a test, not a remark in a conversation.
- Why: conversations end; the repository is what the next session reads. "Put a lesson on the wrong layer and it turns into advice."
- Basis: Decision

**LADDER-9. If a step must give the same output for the same input, it is code, not a model.**
Checking references, merging, sorting, counting, validating and mapping a change to its gate are code. Models are for steps where a different answer could also be right.
- Why: a model doing a deterministic job adds variance and cost, and its result needs checking anyway. The repository check (LADDER-1) is an example: it replaced a reference scan an agent ran by hand.
- Basis: Decision

**LADDER-10. Freeze what passed.**
Once a piece of work passes its gate (a merged commit, a verified doctrine, a tenant test recorded green), later work does not reopen it; when something fails, only the failed piece is redone.
- Why: "Every rerun of good work is a fresh chance to break it, and you get nothing in return."
- Basis: Decision

**LADDER-11. Give the agent the smallest environment that can finish the job.**
Fewer, narrower tools and permissions per task; each added tool is "one more choice the model can get wrong".
- Why: least privilege is both a wall (LADDER-2) and a source of fewer mistakes.
- Basis: Decision

**LADDER-12. Climb only when the current level's failure costs more than the next level.**
Most work here should stop at Level 4. Level 5 graphs and Level 6 coded gates are built only when serial work or uniform review is measurably the bottleneck.
- Why: "Ten agents with no checks do not give you ten times the output. They give you ten times the cleanup."
- Basis: Decision

## Open

- **Branch protection on `master`**: the owner will set it (LADDER-2).
- **"Factory".** This article and HUMANS.md together suggest the track is about the agent working setup: who the agents work for (HUMANS) and how they work (LADDER).

## Sources

- https://x.com/m4lkxx/status/2114338456750997922: text pasted by the owner, 2026-11-19 (primary)
- Found first through secondary summaries: `ahastudio/til` `agentic-coding/harness-loop-graph.md`, `ThePurpleMan16/agentprobe` `docs/RESEARCH.md`
