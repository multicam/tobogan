# FLEET: Loops and graphs, approving only the last step

**Track:** factory · **Type:** research · **Date:** 2026-11-19

**Question:** how do loops and graphs fit together so that agents run without step-by-step supervision, and what does that add to LADDER?

**Source.** X Article "Loops and Graphs: how to stop babysitting agents and only approve the last step (full course)", dated 23 Aug, text pasted by the owner on 2026-11-19. It is the companion to "Harness, Loops, Graphs" (`harness-loops-graphs.md`) and ends by promoting a paid course whose content was not seen. Quotations are verbatim.

## The article

- **A loop is a check that can fail.** "Without something that can fail the work while you are out of the room, you do not have a loop. You have a scheduler." Write the check first, "so a program could evaluate it". Not checks: "the output looks good", "the model says it is confident", "no errors were raised" ("Absence of an error is not evidence of correctness").
- **The ceiling of a loop.** It makes one unit better but "cannot decide which units exist, or their order".
- **The graph.** Nodes (one bounded job) and edges (a dependency). "The mistake behind every unnecessary wait is treating 'and then' as an edge." Test every arrow: "If you cannot name the variable that crosses, there is no edge."
- **Four kinds of node.** Splitter (cuts the work, "decides more than any other node"; cut by blast radius, not by folder), worker (one unit, one lens, its own context), code node ("If you can describe the transformation without using the words judge, decide, assess or summarize, it is code"), gate.
- **Where the loop lives.** "The loop lives inside a node. The graph lives between them."
- **Two return paths.** The correction edge (short: a gate sends one unit back) and the learning edge (long: an accepted result returns to the splitter "as a constraint"). "Almost everyone builds the first and skips the second."
- **Return the unit, not the batch.** Sending a batch back rewrites correct work: "You converted one failure into four uncertain outcomes." A return carries UNIT, VERDICT, REASON, EVIDENCE, SCOPE. "Cap it at three attempts. If a unit fails three corrections the problem is in the plan that produced it."
- **Gate on blast radius, not confidence.** Confidence "is the only one the model can influence". Three lanes: reversible and contained (opens first); reversible but wide (deterministic checks plus a clean trajectory); hard to reverse: "This lane does not open, regardless of score", because "thresholds get adjusted and closed lanes do not". Evidence order inside a lane: deterministic results, this run's trajectory, the node's rollback history, the model's own assessment last.
- **Build order.** Gate first, then lanes, then the learning edge. "Put the human on one step, at the point of highest consequence and lowest reversibility."
- **Closing lines.** "Measure the path, not only the answer it landed on." "A verdict that does not change what runs next is a report." "Any failure you do not turn into a permanent constraint, you will meet again."

## What it adds to LADDER

LADDER already covers the check (LADDER-1, LADDER-3, LADDER-4), gates by cost of undo (LADDER-5), the converging loop and its 3-attempt budget (LADDER-6), early start (LADDER-7), learning (LADDER-8), code for deterministic steps (LADDER-9) and frozen results (LADDER-10). The doctrines below are only what is new.

## Doctrines

**FLEET-1. A check must be evaluable by a program; "no errors" is not a check.**
Every GREEN condition is written so code could decide it: an exit code, a schema, a diff limited to listed files, a source line per claim.
- Why: a loop built on the absence of errors "confidently repeats a mistake until the budget runs out, with a clean log the whole way".
- Basis: Decision
- Applies to: PLAN-1 tenant tests (each states its GREEN before it runs).

**FLEET-2. An edge exists only if you can name the value that crosses it.**
Before making one step wait for another, name the output the second step reads. If there is none, run them in parallel.
- Why: chains typed in the order someone thought of them hide most of the available speed-up. This sharpens LADDER-7.
- Basis: Decision

**FLEET-3. Split work by blast radius, and give each worker its own context.**
Cut work where its mistakes would differ (auth, sharing, mail, docs), not by folder; each worker starts fresh and does not read the others' findings.
- Why: workers sharing a context converge on the first opinion written: "four times for one opinion with three echoes."
- Basis: Decision
- Example here: the research for this repository ran as separate agents per area (auth, files and sharing, mail) with no shared context.

**FLEET-4. Return the failed unit, never the batch, with a return packet.**
A return names UNIT, VERDICT, REASON, EVIDENCE and SCOPE ("fix this file only"). After 3 failed corrections the unit stops and the plan that produced it goes to the owner.
- Why: re-running correct work produces different, not better, results and can stop the run from converging. SCOPE keeps a one-file fix from becoming an unreviewed four-file diff.
- Basis: Decision (the budget of 3 matches LADDER-6)

**FLEET-5. The learning edge writes a constraint into the brief that cuts the work.**
An accepted result that taught something becomes a rule where future work is planned (a doctrine, a split rule, a required check), recorded as ACCEPTED / DERIVED / LANDS IN.
- Why: a system with only correction edges "is fast and never gets smarter". This is LADDER-8 made specific: the lesson lands at the splitter, not in one worker's instructions.
- Basis: Decision

**FLEET-6. The hard-to-reverse lane is closed to agents; it is not a high threshold.**
No score, confidence or prior success lets an agent send real email, delete, migrate, move money, change permissions on real matters or merge to `master`. A person does it or approves it, each time.
- Why: "thresholds get adjusted and closed lanes do not". This sharpens LADDER-5's irreversible row.
- Basis: Decision

**FLEET-7. Put the owner on one step: the most consequential, least reversible one.**
The owner approves the merge and chooses which fixes ship; the owner does not review intermediate output or confirm each step.
- Why: "A human in the middle of a graph becomes the slowest node in it." It matches the owner's profile: decide and report reversible choices, interrupt only when blocked or before risk (HUMANS-6).
- Basis: Decision

**FLEET-8. A verdict must change what runs next.**
Every check feeds a decision in code: CI red blocks the merge (through branch protection, LADDER-2), a failed tenant test stops its loop, a rejected unit returns.
- Why: "A verdict that does not change what runs next is a report."
- Basis: Decision

## Open

- The paid course behind the article was not seen and is not a source.

## Sources

- X Article by @m4lkxx (assumed from the companion article; the pasted text has no byline), "Loops and Graphs: how to stop babysitting agents and only approve the last step (full course)", 23 Aug: text pasted by the owner, 2026-11-19 (primary)
