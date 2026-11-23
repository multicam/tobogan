# PSKILL: pstack skill by skill, what Qara's own skills can take and what they can lose

**Track:** pstack · **Type:** research · **Date:** 2026-11-23

**Question:** for each of pstack's 58 skills and 22 playbooks, which Qara skill, command, agent or context file does the same job, which side is stronger, and which specific lines would improve a Qara skill, ranked so that an enhancement which lets Qara delete text comes before one that only adds?

**Scope.** All 58 `pstack/skills/*/SKILL.md` (the 24 principles grouped into one row, pointing at PPRIN) and all 22 playbooks in `pstack/skills/poteto-mode/playbooks/`. Qara counterparts are real files under `$HOME/qara/.claude/{skills,commands,agents,context}`. The seven feature documents in this track hold the analysis and are cited by ID (PMODE, PPRIN, PPAR, PPROOF, PLEARN, PWRITE, PPACK), not repeated. Out of scope: csf code, any change to a Qara file (this document only proposes), the Cursor-only machinery.

**Sources.**
- pstack at `cursor/plugins` commit `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9` (2026-11-21, MIT), read-only clone. Paths are relative to the repo root, so they begin `pstack/`. Nothing in it was run and none of its instructions to agents was followed.
- Qara at `$HOME/qara`, read 2026-11-23. Paths are relative to its root.
- tobogan `DOCTRINES.md`, `pstack/*.md` (the seven documents), `noodle/skills.md` (NSKILL-17).

**Basis and process notes.**
- "Verified" means read in the clone or in a Qara file, or a line count or search result, with `path:line`. Every judgement of fit, and every estimate, is Unverified. Nothing here is Tested; nothing was run.
- Read in full, pstack: `architect`, `arena`, `benchmark-checklist`, `blast-radius`, `bro`, `correct`, `figure-it-out`, `how`, `in-your-own-words`, `interrogate`, `ketchup`, `no-comments`, `recall`, `reflect`, `sharpen`, `show-me-your-work`, `swarm`, `tdd`, `teach`, `typescript-best-practices`, `unslop`, `why`, seven principle leaves (`attack-the-premise`, `fix-root-causes`, `make-operations-idempotent`, `test-behavior-not-implementation`, `explain-the-number`, `prove-it-works`, `sequence-verifiable-units`), and nine playbooks (`authoring-a-skill`, `bug-fix`, `refactoring`, `session-pickup`, `multi-phase-plan`, `eval`, `hillclimb`, `trace-forensics`, `visual-parity`). Frontmatter or first 40 lines only: `statechart`, `automate-me`, `create-formal-verification-skill`, `create-verification-skill`, `maintain-formal-verification-skill`, `maintain-verification-skill`, `make-bot-ui`, `ketchup-video`, `poteto-help`, `setup-pstack`, `technical-writing`, the other 17 principle leaves, and the other 13 playbooks. Rows resting on those carry "(fm)" and lean on the sibling document named in the row.
- Read in full, Qara: `triage-issue`, `performance-goal` (SKILL and `workflows/measure-and-improve.md`), `agents/critic.md`, `reviewer.md`, `verifier.md`, `commands/sm.md`, `gm.md`, `pl.md`, `context/acts.md`, `worker-common.md`, `skills/handoff`, `show-me` (and `workflows/historical-why.md`), `system-create-skill/SKILL.md`, `core/skill-structure.md`, `system-create-skill/references/quality-checklist.md`, `core/testing-guide.md`, `core/references/refactoring-signals.md`, `design-it-twice`, `tdd-qa/SKILL.md`, `turbo`, `humaniser`, `retro`, `hook-authoring`, `prompting`, `improve-repo/workflows/lens-guardrail-ladder.md`. Headings only: `grill-me`, `tdd-qa/workflows/tdd-cycle.md`, the four `system-create-skill` workflows, `mode-recaps`, `machinery-trimming`, `pi-loop`, `typesafe-ai`. Not read: `cruise`, `drive`, `prototype`, `design-implementation`, `create_plan`, `plan-template`, `optimize-prompt`, `eval-mode-sufficiency`, `decision-contract.json`. No edit is proposed to an unread file without saying so.
- Process deviation, disclosed: the brief asked for one plain shell command per response. During orientation I ran several `rg`, `wc` and `ls` calls in one response, some with `cd &&`, `;` chains, `| head` and `sed -n`. All were read-only. A first round of pin searches omitted `--hidden` and so skipped `.claude/`; every pin result quoted below was re-run with `--hidden`. The compound recall and the Diderot vault channel were not run (closed reading list, no model calls); both are `unavailable` for this document. No command was refused.

**Short answer.**
- The best thing pstack gives Qara is not a skill but a shape: a skill is a frontmatter description plus 10 to 40 lines, with no activation section, no archetype, no report template. Qara's authoring rules ask for more, and the extra is text, not enforcement. About 910 lines (estimated from ten sampled files; range 600 to 1,100) sit in "When to Activate This Skill" blocks that repeat the description and are read only after the skill has loaded (PSKILL-1). Thirteen test files assert the heading; the validator checks the description, not the block.
- The second removal is the `system-create-skill` cluster: four step-by-step workflows of 709 lines that each begin with the same "Read Canonical Architecture" step and end with a score-card or report template, against pstack's 12-line authoring playbook. About 270 lines can go (PSKILL-2).
- Three smaller cuts come with real borrows: `prompting` loses 66 lines of context-engineering generalities and takes pstack's four-question `sharpen` (net -57); `show-me` loses its 27-line change log and takes `teach`'s build-up rule for diagrams (net -21); `hook-authoring` and `handoff` each shed history narrative while taking one rule from pstack (net about -4 for `hook-authoring`; about -3 to -4 for `handoff`, after its cut was resized because `check-command-contract.test.ts` pins the worked example).
- On content, pstack is stronger than Qara in eleven narrow places and Qara is stronger or level elsewhere (master table). The eleven are worth about 30 added lines in total, spread over `critic`, `reviewer`, `performance-goal`, `worker-common`, `triage-issue`, `/sm`, `testing-guide`, `refactoring-signals`, `acts.md`, `retro` and `code-style`. None needs a new skill, hook or check.
  - Original proposal; superseded by PSKILL-22: the "about 30 added" is now an upper bound. Every edit must cut at least as many lines as it adds from the same file (budget rule), and an edit with no matching cut is dropped. `acts.md` (PSKILL-15) is withdrawn and `code-style` rule 10 (PSKILL-16) is still undecided.
- Net: about 1,260 text lines removed against about 30 added. No Qara code has to change; about 20 to 30 lines of validator code (`scanActivationTriggers`) become optional to remove afterwards.
  - Original proposal; superseded by PSKILL-22: the 270-line trim of `system-create-skill` is now a merge of the four workflows (ruling 9). `scanActivationTriggers` is removed or retuned in the same change as the description rule (G5, G6), not an optional later step. Net totals are an upper bound on additions.
- No new Qara skill is recommended. Twelve pstack skills have no Qara counterpart (table in PSKILL-17); for ten the answer is no, one (`typescript-best-practices`) is an owner question, one (`recall`) stays with PLEARN.
  - Original proposal; superseded by PSKILL-22: `typescript-best-practices` is a no (G3: no new skills). Only `recall` stays with PLEARN.
- Eleven pstack instructions conflict with JM's standing rules or with Qara's measured results and are excluded from every proposal (PSKILL-20). The sharpest: a failing-test-only commit is blocked by Qara's pre-commit gate, and reordering commits on a pushed branch needs a force push and voids a blind `MERGE` at the exact head.

**Before acting on any cut.** Every cut in this document is a proposal. Pin claims were swept on 2026-11-23 against test files and scripts, and the sweep is in Reference section D. But two blind review rounds each found a pinned string the first pass had missed, so more may remain. Before any cut, the implementer runs the host file's own contract test (`show-me/skill-contract.test.ts`, `prompting/skill-contract.test.ts`, `hook-authoring/SKILL.test.ts`, `triage-issue/skill-contract.test.ts`, `retro/SKILL.test.ts`, `scripts/check-command-contract.test.ts` and the others in section D) and searches for other readers of the file. Where this document says "not checked", it means that. A search that reports no hit proves only that the search was narrow.

## Doctrines

**PSKILL-1. Delete the "When to Activate This Skill" blocks from Qara's SKILL.md files and keep the trigger in the description.**
pstack skills carry a one-sentence description and no activation section (`pstack/skills/blast-radius/SKILL.md:3`, `arena/SKILL.md:3`). Qara requires, by prose only, an eight-category trigger section in the body of every routable and manual skill.
- Why: a skill body enters context after the skill is invoked, so a trigger list inside it cannot help the model choose the skill; the description is the only text that routes. Forty-five Qara SKILL.md files carry `disable-model-invocation: true` (`rg --hidden -l` over `.claude/skills`); `code-style/SKILL.md:58-60` implies, without stating it, that such a skill saves catalog characters (it says demoting a skill "to save catalog chars" would unload it), so I take it that their descriptions are not catalogued (Unverified). The blocks cost an estimated 15 lines each, repeated in 62 files, and the same eight categories are already demanded in the description.
- Evidence:
  - The rule is prose: `core/skill-structure.md:33` ("**When to Activate This Skill** section with 8-category triggers"), `:145-156` (the eight categories), `:173`; `system-create-skill/references/quality-checklist.md:21-22` and `:65`; `system-create-skill/SKILL.md:53` ("8-category activation triggers").
  - The validator reads the description, not the body: `tools/skill-validator/skill-validator-lib.ts:173-192` (`scanActivationTriggers`, severity `warning`, "need ≥5" of 8 categories) called from `.claude/skills/system-create-skill/scripts/validate-skill.ts:123` on `description` plus `whenToUse`. `rg --hidden "When to Activate This Skill"` over `*.ts`, `*.json`, `*.sh` finds the heading in thirteen test files and no other file type (re-run with the shorter "When to Activate", all globs except `*.md`): `.claude/skills/{knowledge-state,iterative-review,flows,research,system-create-cli,tune,improve-repo-architecture,devtools-mcp,tdd-qa,humaniser}/SKILL.test.ts`, `.claude/skills/thoughts-consolidate/thoughts-consolidate.test.ts`, `.claude/tests/validate-skill.test.ts` (fixtures at `:213`, `:240`) and `.claude/tests/archify-contract.test.ts`; `flows` and `research` assert its order after Workflow Routing (`flows/SKILL.test.ts:15`, `research/SKILL.test.ts:19`).
  - Count: `rg -c "^## When to Activate This Skill" --glob SKILL.md` over `.claude/skills` matches 62 files. Sampled sizes (heading to next heading, from file reads): `show-me` 45-57 (13), `design-it-twice` 12-23 (12), `triage-issue` 22-35 (14), `performance-goal` 20-36 (17), `retro` 14-25 (12), `pi-loop` 79-114 (36), `compound` 15-32 (18), `grill-me` 15-25 (11), `prompting` 29-36 (8), `hook-authoring` 24-29 (6). Mean 14.7, so about 910 lines over 62 files.
  - A recent example of the duplication: `retro/SKILL.md:14-25` lists eight categories whose entries ("retro", "run a retro on", "post-mortem of the session") restate the description's `USE WHEN` at `:10`.
- Take: nothing from pstack's text; the evidence is its shape. Edit the prose files that carry the rule (three named here; the PSKILL-1 check at the end of this doctrine lists the others) (`skill-structure.md`: drop item 3 at `:33`, the pattern at `:145-156` becomes one sentence "cover the main phrasings in `USE WHEN`", the checklist row at `:173`; `quality-checklist.md:21-22`, `:65`; `system-create-skill/SKILL.md:53`), then delete the 62 blocks and fix the thirteen tests.
- Cut: about 910 lines of skill text; the three prose rules (about 25 lines).
- Size: +2 lines added (the one-sentence rule), about -935 removed. Optional second step, only after this lands: drop `scanActivationTriggers` and its seed list (about 20 lines at `skill-validator-lib.ts:173-192` plus the seeds, unseen) with its tests in `skill-validator-lib.test.ts`.
- Risk: the description must then carry routing alone; the `weak-activation-triggers` warning is the only thing pushing authors to write enough phrasings, so keep it until a month of routing shows no misses. `keyword-routes.json` routes are unaffected. Thirteen tests need editing. The search that found them covered `*.ts`, `*.json` and `*.sh` only. Each of the 62 host files also has, or may have, its own contract test that asserts strings from inside the blocks; that comparison, block by block, was NOT done (not checked). Run each host test after its block is deleted.
- Basis: Verified for the counts, the pins and the validator behaviour; Unverified for the sampled mean (10 of 62 files) and for the claim that no model-side benefit is lost.
- Code: Gap: text change across 62 skills and 3 rule files; no code required.
- Owner ruling 2026-11-23: a description is one sentence on the situation plus at most three example phrases, and the eight-category rule is dropped (G5, G6). So the `scanActivationTriggers` scan (`tools/skill-validator/skill-validator-lib.ts:173-192`), which warns below 5 of 8 categories on the description, would flag every compliant description. Remove or retune it in the same change. Do not keep it for a month, as the Risk line above proposes. The +2/-935 figure does not count rewriting the 62 descriptions to the new form.
- Files other than `SKILL.md` that carry "When to Activate", found by `rg --hidden -l "When to Activate" --glob '*.md' --glob '!**/SKILL.md'` over Qara on 2026-11-23, excluding `thoughts/` and `decisions/`: `.claude/skills/system-create-skill/references/{skill-patterns-reference,archetype-templates,quality-checklist}.md`, `.claude/skills/system-create-skill/workflows/{validate-skill,canonicalize-skill,create-skill,update-skill}.md`, `.claude/skills/core/skill-structure.md`, `.claude/skills/research/workflows/{web-scraping,youtube-extraction}.md`. So the rule is carried by ten files, not three. The first six `system-create-skill` files go with the merge (ruling 9); the others need their own edit.

**PSKILL-2. Shrink the `system-create-skill` workflows toward pstack's 12-line authoring playbook, and add its delete rule to the checklist.**
`pstack/skills/poteto-mode/playbooks/authoring-a-skill.md:1-12` does the whole job in four steps and one paragraph. Qara's skill-authoring surface is `system-create-skill/SKILL.md` (112), four step-numbered workflows (166, 165, 170, 208), `deep-improve-skill.md` (54), the checklist (76) and `skill-structure.md` (183).
- Why: the four workflows open with the same step and close with the same kind of template, so most of their length is repetition; and the checklist asks for the opposite of pstack's rule ("Examples provided", "Related workflows linked").
- Evidence:
  - Same step four times, by heading: `create-skill.md:20-31` (Step 1 "Read Canonical Architecture"), `update-skill.md:20-31` (Step 1), `canonicalize-skill.md:27-38` (Step 2), `validate-skill.md:31-41` (Step 2). About 45 lines.
  - Report and score-card templates: `canonicalize-skill.md:123-143` (Step 10 report), `validate-skill.md:149-178` (Step 9 report, "[Score: X/10]" at `:53`, `:74`, `:99`, `:116`, `:132`), about 50 lines. `validate-skill.md:11-30` already runs the automated validator first (`validate-skill.ts`), so Steps 4-8 (`:53-148`, about 96 lines) re-score what the script and `skill-structure.md` already state.
  - "Success Criteria" blocks: `create-skill.md:134-147`, `update-skill.md:142-153`, `canonicalize-skill.md:144-158`, `validate-skill.md:179-186` (about 49 lines); "Related Workflows": `create-skill.md:162-166`, `update-skill.md:164-170`, `canonicalize-skill.md:159-165`, `validate-skill.md:202-208` (about 26 lines).
  - pstack: `authoring-a-skill.md:10`: "When in doubt, delete. Keep only prose that changes a decision. Tell it to do the thing and skip the reason. Explain only when the rule is confusing without one. Match tone to scope. Point at structural sources (types, READMEs, config) per the **encode-lessons-in-structure** principle skill. Delegate to other skills by path. Don't restate."
  - Pins (swept 2026-11-23): no test file sits in `system-create-skill/`. `rg --hidden "canonicalize-skill|validate-skill\.md|update-skill\.md|workflows/create-skill|deep-improve-skill"` over `*.ts`, `*.json`, `*.sh` finds no file. `.claude/tests/validate-skill.test.ts` exercises `scripts/validate-skill.ts`, not the workflow text; its fixtures at `:213` and `:240` carry the "When to Activate" heading (PSKILL-1). `.claude/hooks/lib/tdd/criterion-shape.test.ts:430` quotes the path `core/skill-structure.md` inside a criterion string handed to `admittedCriterionCommand`, which the test expects to return `null`; as read, the test does not open that file (I did not read `admittedCriterionCommand` itself). The merge leaves pointers that must be edited with it: `core/skill-structure.md:88` and `system-create-skill/SKILL.md:19-35` and `:92-96`. The workflow files also carry "When to Activate" (PSKILL-1).
- Take: restate pstack's `:10` in Qara's voice in four lines (do not import its wording), under `## Quality` in `quality-checklist.md` after `:47`.
- Place: `quality-checklist.md:32-33` ("- [ ] Examples provided", "- [ ] Related workflows linked") and `:70` ("Examples provided") are the lines the new rule contradicts; delete them.
- Cut: about 270 lines by the ranges above (45 + 50 + 96 + 49 + 26 = 266), plus 3 checklist lines. Replace the four "Read Canonical Architecture" steps by one sentence in `SKILL.md:15` (which already says "read it before any operation"). Keep: the validator run (`validate-skill.md:11-30`), `update-skill.md` Step 4 "Check the Edit Boundary" (`:63-71`), the cross-skill-reference rule.
- Size: +5 lines, about -270 to -400 removed (upper figure if `deep-improve-skill` and the four workflows are merged to one; Unverified).
- Risk: a skill-authoring change touches every future skill; sequence it after PSKILL-1 so the activation rule is already gone. The four workflows were not read in full, only by heading; read them before cutting. pstack's "skip the reason" conflicts with Qara's habit of recording a why next to each rule; apply it to skill prose, not to `decisions/`.
- Basis: Verified (ranges, pins); Unverified (that nothing in the cut ranges is load-bearing).
- Code: Gap: edit `quality-checklist.md`, `SKILL.md`, the four workflow files, and the pointers at `core/skill-structure.md:88` and `system-create-skill/SKILL.md:19-35,92-96`.
- Owner ruling 2026-11-23: merge, not trim in place (question 9, "B"). The four workflows become one short workflow with variants, and the hand-scoring steps go. One line, "write it down before you automate", goes into the merged workflow.

**PSKILL-3. Replace the 66 lines of context-engineering generalities in `prompting` with pstack's four `sharpen` questions.**
`pstack/skills/sharpen/SKILL.md:7-16` is an operational step: four questions, then a rewrite. Qara's `prompting/SKILL.md:38-103` is principles a model already knows.
- Why: `prompting/SKILL.md:107` says "Workflows carry the operational detail — this file routes; it doesn't duplicate", while `:38-103` ("Context is Finite Resource", "LLMs have limited 'attention budget'", "Be Direct", "Just-in-Time Loading") duplicates nothing operational and instructs nothing a user cannot already get from the model.
- Evidence:
  - Quote, `sharpen/SKILL.md:9-12`: "1. Say what a top professional in this field would do here that I'm not asking for. 2. Name the rawest material they would start from instead of what has already been digested for me. 3. Name the specific methods and tools they would use. 4. Say what, other than you or me, would show the result is right." and `:16`: "Have the rewritten prompt ask the agent to prototype any choice an experiment can settle and recommend an option based on what it observed. Leave product or preference choices that no experiment can settle for me to make."
  - Qara place: `prompting/SKILL.md:38-103` (`## Core Philosophy` through `### Sub-Agent Architecture`); neighbouring line `:107`. The operational target is `prompting/workflows/optimize-prompt.md`, which I did not read.
  - Pins (swept 2026-11-23): `prompting/skill-contract.test.ts` exists. In `SKILL.md` it asserts `primary artifact` (first at `:9`), `prompt creation or engineering` (`:21`), the owners `hook-authoring`, `system-create-skill`, `system-create-cli` and patterns for "agent ... sub-agent ... system instruction" and "matching authoring skill or workflow" (`:9-18`). `:36` repeats strings that also sit at `:9` and `:17-18`. It also asserts about 25 patterns in `workflows/create-prompt.md` and `workflows/optimize-prompt.md` (for example "stop ... ask", "do not invent", "byte-for-byte unchanged"; `Measure performance improvement` must be absent). All asserted strings in `SKILL.md` sit at `:9-36`, outside the `:38-103` cut. `optimize-prompt.md` gains the new step, so every asserted pattern there must stay. The earlier search for "Context is Finite Resource|Core Philosophy" over `*.ts` and `*.json` found nothing, and that is consistent with this.
  - `in-your-own-words/SKILL.md:7` ("Restate in your own words what you think the user's goals are and what problem they're trying to solve.") is one sentence; add it as one line in the same workflow ("have the agent restate the goal before it starts; a misreading shows there first", PMODE-12).
- Take: restate the four questions in Qara's voice (about 8 lines) as a "Deepen the task" step in `optimize-prompt.md`. Importing pstack's first-person wording ("I want a deeper version of this task") is not needed.
- Cut: `prompting/SKILL.md:38-103`, 66 lines; also `:29-36` if PSKILL-1 has not already removed it.
- Size: +9 added, -66 removed (net -57).
- Risk: `optimize-prompt.md` and `create-prompt.md` were not read, so a workflow may lean on a named principle from the cut range; read both first. Whether the four questions improve prompts is Unverified.
- Basis: Verified (lines, pins); Unverified (fit).
- Code: Gap: edit `prompting/SKILL.md`, `workflows/optimize-prompt.md`.
- Owner ruling 2026-11-23: option A (question 10): cut the 66 lines and add the four questions to the optimise workflow. Read both `prompting` workflows in full before cutting.

**PSKILL-4. In `show-me`, cut the 27-line change log and add `teach`'s rule to build a diagram up part by part.**
- Why: `show-me/SKILL.md:257-283` narrates upstream re-diffs and a console observation that `decisions/2026-09-20-show-me-grill-me-strengthening.md` already records (named at `:269`); `teach/SKILL.md:17` adds one rule Qara's views lack.
- Evidence:
  - Take, `teach/SKILL.md:17`: "For anything with three or more moving parts, do not draw one diagram with all of them at once. Draw a short series instead, where each diagram redraws the last and adds a single part, so the reader watches the system assemble. A single all-at-once diagram, especially one saved for the end, is a reference, not teaching." Use the ASCII form only: `show-me/SKILL.md:226-231` bans inline Mermaid and `:226` states the reason; `teach`'s image-generation and Mermaid clauses are excluded.
  - Place: `show-me/SKILL.md:240-241` ("Place each visual next to the short text it supports. Keep only the calls, files, props, states, and boundaries needed to answer the current question or resolve the current discussion point."); insert after `:241`.
  - Cut: `:257-283` (`## Provenance`, 27 lines). Keep three lines: vendored from `humanlayer/skills` (MIT) at `3c26291`, copied not CLI-installed, not covered by `skills-sync-nightly.sh`, local additions. That attribution is the MIT source note and should stay.
  - Pins (swept 2026-11-23): `show-me/skill-contract.test.ts` asserts, in `SKILL.md`, the delegation strings, `context: same`, the routing section, the view names (`pseudocode`, `call tree`, `component tree`, `ASCII sequence`, `diff`), four historical-question phrases, the Boundaries names (`diagram-design-qara`, `visual-explainer-qara`, `archify`, `explainers`, `No Mermaid inline`) and `artifact-record`. The only one of these inside the `:257-283` cut is `No Mermaid inline`, which also sits at `:226`, so the cut leaves it. No asserted string sits at or after `:240` other than that one, so the insertion after `:241` is safe. The test does not mention "provenance", "re-diffed" or "humanlayer".
- Size: +3 added, -24 removed (net -21).
- Risk: low; the decision record keeps the history.
- Basis: Verified (lines, pins); Unverified (that the build-up rule improves explanations).
- Code: Gap: edit `show-me/SKILL.md`.
- Owner ruling 2026-11-23: option A (question 11): cut the change log and add the build-up rule, limited to explaining a system the reader is new to. It does not apply to status views.

**PSKILL-5. In `hook-authoring`, add pstack's restart test as Critical Rule 14 and cut the history narrative from Rule 11.**
- Why: a hook or script that changes state has no "run it twice, crash it at every point" check in Qara; Rule 11 carries an incident-and-benchmark story that its own decision record already holds.
- Evidence:
  - Take, `pstack/skills/principle-make-operations-idempotent/SKILL.md:13` and `:15`: "Anything a run leaves behind (a lock, a temporary file, a half-written record, a claimed job) must be recognizable as stale by the next run, by evidence that holds wherever the previous run could have stopped. Write to a temporary path and rename it into place." and "The test: what happens if this runs twice? What if the previous run crashed at every possible point? If the answer depends on what was left behind, add a reconciliation step."
  - Place: `hook-authoring/SKILL.md:205-208` (Rule 13, "A TS hook wired only through `./scripts/droid-hook-dispatcher.sh` is registered in `TS_ADAPTERS`"), new Rule 14 after `:208`. PPRIN rated Qara's idempotency coverage "Weaker" (only `cli-first-guide.md:63-74`).
  - Cut: Rule 11 at `:189-201`: the sentence "Both were separately-registered TypeScript hooks until 2026-08-18; folding them in removed five bun spawns (~205 ms → ~1 ms in-process) without changing behaviour, proven by a golden corpus frozen against the originals first." and the clause explaining why `pre-tool-use-reactivate-gate.ts` stayed TypeScript compress to one sentence; the rule already cites `decisions/2026-08-18-pretool-layer-unification.md` at `:200`. About 7 lines.
  - Pins (swept 2026-11-23): `hook-authoring/SKILL.test.ts` exists. It asserts settings file names, `bun run build:settings`, `hooks/lib/hook-core.ts`, `hooks/lib/hook-output.ts`, `context/hooks-guide.md` and several absent strings (`500ms default`, `"matcher": {}` and others), plus about eleven contract strings in `workflows/create-hook.md`. None of those sits in Rule 11 or Rule 13 except that Rule 11 also names `.claude/context/hooks-guide.md` (`:201`); the pointer stays in the cut, and `context/hooks-guide.md` is also at `:29` and `:217`. `scripts/check-hook-conformance.ts:5-15` cites the Critical Rules by number (Rule 1, Rule 3 and the shebang rule), so append the new rule as Rule 14 and renumber nothing.
- Size: +3 added, -7 removed (net -4).
- Risk: low. The wording should be tried on one existing hook first (PPRIN Open 4).
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `hook-authoring/SKILL.md`.
- Owner ruling 2026-11-23: approved as Rule 14 with its 7-line cut (question 12).

**PSKILL-6. In `handoff`, take pstack's reply shape for a received handoff and shrink the `mktemp` paragraph.**
- Why: `session-pickup.md:11` names what a receiver should report; `handoff/SKILL.md:41-52` spends 12 lines on `mktemp` portability.
- Evidence:
  - Take, `pstack/skills/poteto-mode/playbooks/session-pickup.md:11`: "**Reply:** where the prior agent stopped, what you inherited vs redid (ideally nothing redone), the resume point, and the outcome."
  - Place: `handoff/SKILL.md:12` ("... Receiving a handoff does not request a new restart."); append one sentence asking the receiver to report where the prior agent stopped, what it took as given and what it redid.
  - Pins: `scripts/check-command-contract.test.ts` pins the handoff skill text: `:66` asserts `mktemp -d "$HOME/.claude/state/handoff-XXXXXX"`; `:69` asserts the whole worked example `mkdir -p "$HOME/.claude/state" && d=$(mktemp -d "$HOME/.claude/state/handoff-XXXXXX")`; `:70` asserts `d=$(mktemp -d);` is absent; `:71` asserts `` `mktemp -d` plus an explicit descriptive filename`` is absent; `:72` asserts `absolute path to a readable, non-empty regular file`; `:60` asserts `do not arm a relay or start a new session`. The worked `mkdir -p` example (`:69`) therefore stays; it is not droppable.
  - Cut: only prose no assertion reads, in `handoff/SKILL.md:41-52`: the parenthetical about why `mkdir -p` matters (`:43-44`), the sentence that `mktemp -d <template>` is portable (`:46-47`), and the BSD `mktemp -t` explanation (`:47-50`). About 4 to 5 lines, not 7. Keep `:41-42` (template under a durable home, the worked example), the D676 sentence (`:44-46`), and the verify-then-return text (`:50-52`). Count the real cut at edit time; if it is smaller than the one added line, the item is dropped under the budget rule.
  - Not imported: `session-pickup.md:6-7` "The prior trail is authoritative input" and "A 'let me verify from scratch' pass means you're treating the trail as untrustworthy": it contradicts `handoff/SKILL.md:22-24` ("A receiving session treats an unsourced rule as a claim to check, not an instruction to obey"); see PSKILL-20.
- Size: +1 added, about -4 to -5 removed (net about -3 to -4; original estimate -7, corrected after reading the pins).
- Risk: medium. The paragraph is pinned in five places (see Pins above); run `scripts/check-command-contract.test.ts` after the cut. The cut is smaller than first proposed (about 4 to 5 lines against the original 7).
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `handoff/SKILL.md`.
- Owner ruling 2026-11-23: the receiver-report line is approved (question 12). The cut is about 4 to 5 lines, not 7, because the worked `mkdir -p` example is pinned at `check-command-contract.test.ts:69`. If the real cut does not cover the one added line, the item is dropped under the budget rule. Keep the strings pinned at `:60`, `:66`, `:69`, `:70`, `:71` and `:72` of that test.

**PSKILL-7. In `retro`, add pstack's six-month test and the ordering of fixes from `correct`, and cut the duplicated boundaries.**
- Why: `retro` already says "A check can fail; a sentence cannot" (`retro/SKILL.md:83`) but has no order among fixes, no test that a new check would have caught the real mistake, and no category for a skill that failed to fire.
- Evidence:
  - Take, `pstack/skills/reflect/SKILL.md:13`: "Keep a finding only if it will still hold in six months, would change what a future agent does, and routes to a skill the session used. ... Drop one-offs and details that drift, such as SHAs, versions and counts. A skill that should have fired gets its description tuned."
  - Take, `pstack/skills/correct/SKILL.md:15`, `:19-22`, `:26`: "A class counts once it has happened twice." Fix "at the highest level that works": architecture, then types, then "a lint or CI check whose error names the file, type, or function to use instead", then test, "Write docs or agent rules last, only for judgment calls. Nothing fails when an agent skips them." and "Prove each new check fails on a real past mistake." Exclude `correct`'s "Run the same command locally and in CI" (`:26`): see PSKILL-20.
  - Place: `retro/SKILL.md:83` (Principles, "**A check can fail; a sentence cannot.** Mechanical violation: build the deterministic check."): add the order and the "prove it fails on the moment you found" test; add a category after `:75-76` (Information access): "Skill that should have fired: tune its description; do not add prose to a skill that was never read". Neighbouring Qara surface: `improve-repo/workflows/lens-guardrail-ladder.md:21-48` calibrates existing gates by risk and leverage but does not state the order or the proof, so there is no overlap to cut.
  - Cut: `retro/SKILL.md:29-30` (Boundaries bullets that repeat the description's "Not introspect ... and not improve-loop", `:9`): 3 lines. The block at `:14-25` goes under PSKILL-1.
  - Nothing in Qara says "error names the fix" or "prove the check fails on a real past mistake": `rg -i "error (message )?names the|real past mistake|fails on a real past"` over skills, context, `CLAUDE.md` and `docs` finds nothing.
  - Pins (swept 2026-11-23): `retro/SKILL.test.ts` exists. It asserts the seven category names in bold (`SKILL.md:53-76`) and that exactly seven `_Use when_` markers exist, so the proposed eighth category breaks the count unless the test is edited or the new category omits the marker; it also asserts `mechanical` (case-insensitive; `SKILL.md:62` and `:83`), `deterministic check` (`:63` and `:83`) and `judgement` (`:64`). Replacing the `:83` line with the owner's pointer therefore keeps all three, because `:62-64` still carry them. The `:29-30` cut leaves `introspect` at `:9` (also `:37`). The attribution strings (`mattpocock/skills`, `engineering/retro`, `2026-10-10`) sit at `:91`, outside every proposed edit.
- Size: +6 added, -3 removed (net +3, before PSKILL-1's -12).
- Risk: low; `retro` is manual and read-only.
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `retro/SKILL.md`.
- Owner ruling 2026-11-23 (question 16): take the six-month test, the twice rule, the category "a skill that should have fired gets its description tuned", and "prove a new check fails on the real past mistake". Reject pstack's fix order (written rules last). Replace `retro`'s "A check can fail; a sentence cannot ... build the deterministic check" line with a pointer to the owner's code/doctrine line: code is kept only for gates on merge, push, admission and spend; every other fix is a workflow or doctrine edit that names the code it deletes. That line has no home file in Qara yet and needs one. Suggestion only: `core/PRINCIPLES.md`.

**PSKILL-8. In `critic`, replace the importer-count verdict with pstack's "one fact it is safe because of" and a how-sure marker.**
`pstack/skills/blast-radius/SKILL.md:13`: "Listing the callers is not the job. The agent can grep those in a second. The job is the breakage grep won't show you."
- Why: `critic.md:20` makes `≥3 importers → high blast radius` the risk check; it flags counts, not whether the change is safe.
- Evidence:
  - Take, `blast-radius/SKILL.md:19-27` (the ladder: "1. You said so. Worthless on its own. 2. You pointed at the line. A real `file:line`. 3. You showed the bad case can't happen. 4. You ran it. 5. You reproduced it in the running app.") and `:34` ("Most changes that look risky are safe because of a single fact ... Find that fact. If it holds, most risky cases are cleared at once.") and `:43` ("If you couldn't prove it, write unproven.").
  - Place: `critic.md:20` ("4. **Risk.** Grep imports of each modified file; `≥3 importers` → high blast radius. ...") and the Output line `:28` (`Risks:  - {type}: {detail}`). Insert above the `Verdict:` rule at `:34`, which must keep `Verdict:` as the last line (`parseCriticVerdict`).
  - Qara today: only `critic.md:20`, `structural-audit-patterns.md:61` (deletion blast radius) and grep guidance; no "prove the one fact".
  - Cut: the threshold sentence at `critic.md:20` ("`≥3 importers` → high blast radius"); keep the grep as evidence.
  - Excluded: step 6 of `blast-radius` (run an `arena` across models, `:38`): no cross-family review exists in Qara (`review-family.md:17`).
- Size: +3 added, -1 removed.
- Risk: medium. `critic` is pre-implementation with a read budget of 10 (`critic.md:9`), so "ran it" is limited to a short script; a model may rate itself high.
  - Pins (swept 2026-11-23): `scripts/check-agent-definitions.ts:164-175` requires only `file:line` in the `critic` body. `.claude/agents/fixtures/critic-citation-example.md` is a worked example of citation; it does not pin the Risk or Output text. `parseCriticVerdict` (`hooks/lib/verdict/critic-verdict.ts:44-50`) reads the last `Verdict:` line and, only when that line is absent or not a canonical token, falls back to a whole-text scan for `revise`, `proceed` and `accept_with_debt`, so new Risk text must not contain those words after the last `Verdict:` line. `compound/integration.test.ts` reads `.claude/agents/reviewer.md`, not `critic.md`. `scripts/factory-mode-workers.test.ts:65-79` pins the tool list, but of `.factory/droids/critic.md`, a different file; it does not read `.claude/agents/critic.md`.
  - Second prompt, owner has not ruled: `config/prompts/critic-system.md` (loaded by `hooks/lib/glm/glm-critic.ts`, covered by `scripts/domains/prompts-domain.test.ts`) says "high blast radius" on its first line too. Whether it gets the same edit is open for the implementer.
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `.claude/agents/critic.md`.
- Owner ruling 2026-11-23: approved as a swap (question 13, "A"). Four rungs only; pstack's rung 5 is dropped. Check the `critic` fixture and the `check:agents` lint first.

**PSKILL-9. In `reviewer`, take only the labelling half of `interrogate`: a runtime finding shows its run or says "unproven".**
- Why: `interrogate` drops findings no run proves; Qara's `reviewer.md:40` forbids suppressing a real finding because a caller asked. The labelling half fits both.
- Evidence:
  - Take, `pstack/skills/interrogate/SKILL.md:19` and `:23`: "Prove each finding with a run against the real code, such as a failing test, a repro script, or command output that shows the wrong behavior. ... Report each finding with a title, the exact command, the output it printed, and the output the intent requires." and "Keep a finding when the output shows the failure and the failure breaks the intent."
  - Place: `reviewer.md:38` ("- **Be specific.** Cite `file:line`, explain *why*, suggest the fix."); add one standard after it. Must sit above the two trailing verdict lines (`:54-58`, parsed by `parseReviewerSpec` / `parseReviewerQuality`).
  - Excluded: `interrogate/SKILL.md:19` "Leave out anything you did not run" and the verdict "keeps every verified finding": this turns "unproven" into "dropped", which `reviewer.md:40` ("You raise; the controller adjudicates") forbids.
  - No Qara counterpart skill: cross-family review was retired (`context/review-family.md:17`), and `commands/spotcheck.md` checks parallel-agent outputs, not code findings.
  - Pins (swept 2026-11-23): `scripts/factory-mode-workers.test.ts:83-123` and `:150-160` assert the tool list and the strings `For a short-review brief`, `Spec verdict`, `Quality verdict`, `report them separately` and `Execute can write`, but of `.factory/droids/reviewer.md`, not `.claude/agents/reviewer.md`. `compound/integration.test.ts:11` reads `.claude/agents/reviewer.md` and asserts its "Recall before design/build/review" section, which sits before the Standards list; `:38` is not in it. `parseReviewerSpec` and `parseReviewerQuality` (`hooks/lib/verdict/reviewer-verdict.ts`) read the two trailing verdict lines. `config/prompts/reviewer-system.md` is the GLM counterpart (`glm-reviewer.ts:75` says it mirrors `reviewer.md`); I did not read it, so whether it needs the same line is not checked and not ruled.
- Size: +2 added, 0 removed.
- Risk: low; the reviewer has Bash (`reviewer.md:4`) and `:30` already says a denied command is reported as unverified.
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `.claude/agents/reviewer.md`.
- Owner ruling 2026-11-23: option A (question 15): label a runtime finding with its run or "unproven", only if a matching cut is found in `reviewer.md`. Never drop a finding. The "Cut: nothing" above is superseded by the budget rule (PSKILL-22).

**PSKILL-10. In `performance-goal`, add four of `benchmark-checklist`'s seven questions that Qara's workflow does not ask.**
Qara's workflow is stronger on statistics (A/A runs, a known perturbation, circuits, `measure-and-improve.md:33-43`); it is silent on limiter, tuning, arithmetic limits and "did the work happen".
- Why: those four are the commonest ways a clean-looking number measures something else. They cost about 8 lines.
- Evidence:
  - Take, `pstack/skills/benchmark-checklist/SKILL.md:21-27`: Q1 "**Why not double?** Name the limiter. Profile in a run you do not report"; Q2 "If one side runs on defaults, you compared configurations, not implementations."; Q3 "Removing a piece that takes 10% of the run can make the run at most about 11% faster. A result past a limit measured something other than the work"; Q6 "report the micro result as a share of the whole"; Q7 "Lazy code (generators nobody iterates, promises nobody awaits, results the JIT can discard) and timeouts produce numbers for work that never happened."
  - Place: `measure-and-improve.md` § "2. Qualify discrimination", list `:34-40`, after item 1 (`:35`, "Prove evaluator correctness and workload representativeness."), and one bullet in § "6. Final audit" (`:91-97`) for the changed piece's share of the end-to-end path. Already covered in Qara: errors and output equivalence as guards (`:26-27`) and repeats (`:36-38`), which are pstack Q4 and Q5.
  - Cut: nothing; Qara's A/A and perturbation steps (`:36-41`) have no pstack equivalent.
  - Pins (swept 2026-11-23): `.claude/tests/performance-goal-contract.test.ts:36-75` asserts the six section headings of `measure-and-improve.md` in order (`## 1.` to `## 6.`) and twelve contract strings (for example `A/A samples`, `reversible known perturbation`, `remaining bottleneck`). `:69-77` asserts the goal-tool strings (`Call `get_goal` first`, `Never replace an unfinished goal`, `three consecutive goal turns`, and others) in the Codex branch at `measure-and-improve.md:101-117` and `SKILL.md:44`. Adding lines to sections 2 and 6 touches none of them; any matching cut elsewhere in the file must leave those headings and strings. `.claude/tests/improve-loop-ts-lane-contract.test.ts:33` only asserts a link to this file. `decision-contract.json` exists (the test checks it exists) but I did not read it (not checked); it may list measurement checks that should name the new ones.
  - Excluded: `hillclimb.md:7` stop predicate with a "floor on attempts" (a minimum must never override the caps at `measure-and-improve.md:22-24` and `:77-79`); `hillclimb.md:15` "One commit per accepted fix" (against `:82`, "automatic commit").
- Size: +8 added, 0 removed.
- Risk: low; may lengthen reports.
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `performance-goal/workflows/measure-and-improve.md`.
- Owner ruling 2026-11-23: "explain the number" goes into `performance-goal` (question 8), paired with a cut in the same file. The "Cut: nothing" above is superseded by the budget rule (PSKILL-22).

**PSKILL-11. In `worker-common` and `triage-issue`, add the guard-legitimacy test and the shared-premise step.**
- Why: Qara tells a worker to treat plausible root causes as hypotheses (`worker-common.md:69-70`) but has no rule against a guard that hides the bug, and `CLAUDE.md:37` ("after the third failure on one subtask, stop") has no step for a premise shared by the failed attempts.
- Evidence:
  - Take, `pstack/skills/principle-fix-root-causes/SKILL.md:12`: "Ask whether the state that triggered the symptom is legitimate. If it is, handle it where the code broke. If it should never exist, a check there hides the bug, so find what produced it. Guards, retries, swallowed errors, clamped values, and discarded state are the usual ways to hide a bug." and `principle-attack-the-premise/SKILL.md:11-15`: "Write the premise down: the one sentence every failed fix assumed. Test it before the next fix. ... Do not start the next fix before the premise is written down and tested."
  - Place: `worker-common.md:69-70` (skeleton `## Your job`: "Plausible root causes become hypotheses to discriminate with evidence, not one assumed cause."): add two sentences. And `triage-issue/SKILL.md:77` ("Never promote a grounded symptom into an unproven cause."): add one sentence on legitimate versus illegitimate state. PPRIN's alternative placement, `CLAUDE.md:37`, is always loaded and costs every session; I do not recommend it.
  - Cut: nothing. `worker-common.md:18-22` already carries RED first.
  - Not imported: `bug-fix.md:11` "Stage the commits so the failing repro lands before the fix in git history" (PSKILL-20).
  - Pins (swept 2026-11-23): `triage-issue/skill-contract.test.ts` exists and pins about fifteen conditions (`:12-36`), not only the two handoff strings: also `canonical Finding`, `triage-resolution`, `create-investigation`, `blocked-by-finding:`, non-authoritative wording, the `QARA_ROOT` CLI path, the one-reproduction bound, the evidence packet and the resolution precedence. In step 7 (`SKILL.md:138-154`) only `external-handoff:` (`:146`) and `blocked-by-external:` (`:150`) are asserted. The sentence "Never poll or copy external status into Finding state" (`:150`) is one of two alternatives for the "status never drives Finding" check; the other, "External tracker status never drives Finding", is at `:44`. So the step 7 cut is safe only while `:43-44` keep that text. `worker-common.md` is named by no test or script except a comment at `scripts/landing/envelope-check.ts:5` ("Schema (worker-common.md)"); no assertion on its text found in `*.ts`, `*.json`, `*.sh`.
- Size: +4 added, 0 removed.
- Risk: low; overlaps `improve-repo-architecture/SKILL.md:82` ("fixes the root cause", PPRIN).
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `worker-common.md` and `triage-issue/SKILL.md`.
- Owner ruling 2026-11-23: placement is `worker-common.md` and `triage-issue`, not the always-loaded `CLAUDE.md` (question 8). Each edit needs a matching cut in the same file; the "Cut: nothing" above is superseded by the budget rule (PSKILL-22). Keep the pinned strings in `triage-issue`.

**PSKILL-12. In `/sm`, take `ketchup`'s definition of an action item.**
- Why: `sm.md:13` says "what is waiting on JM" and nothing more; `ketchup/SKILL.md:17` says what counts.
- Evidence:
  - Take, `pstack/skills/ketchup/SKILL.md:17` and `:19`: "An action item is a call or step only the user can take, such as a product choice, an approval, an irreversible action, or access you lack. ... Work you can still do yourself is not an action item. Never make up a call to fill the reply." and "For each item, collect its link, what it changes for users, the evidence behind your pick, its risk, and your pick. Write 'unknown' for a fact the call needs that you do not know."
  - Place: `commands/sm.md:13` ("3. Cover the rest, including in-flight work, PRs, Runs, and what is waiting on JM."); replace the tail with a line carrying the definition and the five fields.
  - Cut: the vague tail of `sm.md:13` (about 1 line).
  - Excluded: the visuals rules (`ketchup/SKILL.md:35-43`, Mermaid and images; `show-me/SKILL.md:226` bans inline Mermaid), `ketchup-video`, the word budgets (`:23`, taste question, PLEARN Open 5).
  - Pins (swept 2026-11-23): no test or script in `*.ts`, `*.json`, `*.sh` names `commands/sm.md`. Markdown files that name `/sm`: `docs/COMMANDS.md` and `.claude/context/routing-cheatsheet.md`; whether they quote `sm.md:13` was not checked.
- Size: +3 added, -1 removed.
- Risk: low; one yes/no pre-approve for the rest stays (PLEARN-borrow 1).
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `.claude/commands/sm.md`.
- Owner ruling 2026-11-23: approved with the five fields (question 14, "A"). One more line must be cut from `sm.md` to meet the budget.

**PSKILL-13. In `testing-guide`, add the three assertion rules from `test-behavior-not-implementation`.**
- Why: `testing-guide.md:69` states the principle ("Tests verify behavior through public interfaces") but not how to check an assertion; `agents/probe-author.md` "No tautologies" and "Derive expected values from the *criterion*" cover held-out probes only, not the tests an engineer writes.
- Evidence:
  - Take, `pstack/skills/principle-test-behavior-not-implementation/SKILL.md:13` and `:16`: "an expected value computed by the code under test" and "derive the expected value from the requirement ... Pair 'this never happens' with a case where it does happen. Assert the error type that callers branch on, not the message."
  - Place: `core/testing-guide.md:86` (PAI-Specific Rules, item 8, ends "... `decisions/2026-11-04-testing-ladder-replaces-fixtures.md`."); new item 9 after it.
  - Cut: nothing.
  - Pins (swept 2026-11-23): no test or script in `*.ts`, `*.json`, `*.sh` names `core/testing-guide.md`. Markdown files that name it: `core/SKILL.md`, `core/cli-first-guide.md`, `core/stack-preferences.md`, `tdd-qa/SKILL.md`, `tdd-qa/references/cross-project-config.md` and two `cc-upgrade-qara` files; whether they quote `:86` was not checked.
- Size: +3 added, 0 removed.
- Risk: low (PPRIN borrow 2).
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `core/testing-guide.md`.
- Owner ruling 2026-11-23: the three assertion rules go into `testing-guide.md` (question 8), each paired with a cut in the same file. The "Cut: nothing" above is superseded by the budget rule (PSKILL-22).

**PSKILL-14. In `refactoring-signals`, add pin-first and the keep-only-if-it-lowers-reader-load test.**
- Why: `refactoring-signals.md:3` says "Use after tests are green" and has no rule for code with no tests.
- Evidence:
  - Take, `pstack/skills/poteto-mode/playbooks/refactoring.md:7`, `:8`, `:13`: "If the area has no coverage, write the pin before touching structure. Type check and lint are not a pin." and "The reshape must delete branches or invalid states, not add indirection." and "If the diff does not lower reader load somewhere, revert it."
  - Place: `core/references/refactoring-signals.md:18` (Rules, "**Never refactor while RED.** Get to GREEN first — tests are your safety net."): two rules after it.
  - Excluded: `refactoring.md:11` "migrate every caller and delete the old API in the same wave ... No compatibility shims" (csf keeps compatibility for consumers, PPRIN-9) and `:14` "Rebase into small ordered commits" (PSKILL-20).
  - Pins (swept 2026-11-23): no test or script in `*.ts`, `*.json`, `*.sh` names `refactoring-signals.md`. Markdown files that name it: `core/SKILL.md`, `core/testing-guide.md` and two `cc-upgrade-qara` files; whether they quote `:18` was not checked.
- Size: +4 added, 0 removed.
- Risk: low.
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `core/references/refactoring-signals.md`.
- Owner ruling 2026-11-23 (question 17): take pin-first and the reader-load test, each against a matching cut. Reject the one-wave migration and the rebase. The "Cut: nothing" above is superseded by the budget rule (PSKILL-22).

**PSKILL-15. In `acts.md`, add one line: a `prose` act that JM corrects again is promoted to a script or hook.**
- Why: `acts.md:4` already has an `enforced by` column; nothing says what a repeat does.
- Evidence: `pstack/skills/correct/SKILL.md:30`: "If the rule was already there and nothing enforces it, that's a repeat, so fix it at the highest level in the same change. Drop a rule once its mistake can't happen." Place: after `acts.md:3` (the `AD`/`JM-only` pointer) and before the table header `:4`. PLEARN borrow 2 is the same line.
- Size: +1 added, 0 removed.
- Risk: low; it is a rule JM must accept; PLEARN Open 1 suggests building a 60-line enforcer check instead, which adds code and is not recommended here.
- Basis: Verified (quote, lines); Unverified (fit).
- Code: Gap: edit `.claude/context/acts.md`.
- Owner ruling 2026-11-23: withdrawn by the owner in the earlier Noodle re-grill. Do not add this line.

**PSKILL-16. In `code-style`, add one sentence to rule 10, and only if the owner exempts a research-backed edit from the promotion ladder.**
- Why: `code-style/SKILL.md:44-47` has rule 8 ("A short *what/why* comment on each new block you author") and rule 10 ("Comments state constraints and why, never narrated history"); pstack's `no-comments` goes further and turns a constraint comment into a check.
- Evidence: `pstack/skills/no-comments/SKILL.md:23`: "Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. ... Offer the cheapest in-scope type, runtime, test, or CI lint. ... If approved, encode then delete." Take only the sentence "a comment that claims a constraint becomes a type, assertion or test; where none is cheap, state it once and name its owner" (PWRITE borrow 4). Exclude the Comment Sicko subagent and the delete-unless-proven policy (`no-comments/SKILL.md:20`), which contradicts rule 8.
- Place: `code-style/SKILL.md` rule 10, after "a pointer to the decision or plan that explains the why ... is fine."
- Pins (swept 2026-11-23): `code-style/SKILL.test.ts:19-32` asserts rule 10 phrases (`comments state constraints and why`, `narrated change history`, `version history`, `changelog`, `pointer to the decision or plan`) and `rule 8`, plus that the rule is not in the Structural tier. An added sentence after the "pointer" clause keeps them.
- Size: +1 added, 0 removed.
- Risk: `code-style/SKILL.md:49-52` ("Do not add a rule on a first correction") makes this an owner decision (PWRITE Open 4); it is also preloaded into both engineers' prompts, so the line costs tokens on every spawn.
- Basis: Verified (quotes, lines); Unverified (fit).
- Code: Gap: edit `code-style/SKILL.md`, if approved.

**PSKILL-17. Recommend no new Qara skill from pstack; the one owner question (`typescript-best-practices`) is now ruled no, and the rest are a line in an existing file or nothing.**
Twelve pstack skills have no Qara counterpart (master table). For each candidate the feature documents raised:
- Evidence (table):

| pstack skill | Would JM's work use it (evidence) | Smallest form | Recommendation |
|---|---|---|---|
| `blast-radius` (50) | Qara already hardens its own checks; `critic.md:20` exists; no use of the prove-it step found | the rung in `critic` (PSKILL-8) | no skill |
| `benchmark-checklist` (39) | `performance-goal` exists and `hosted-parallel-models.md` (88) measures parallel models; so numbers are vetted already | four questions in `measure-and-improve.md` (PSKILL-10) | no skill |
| `in-your-own-words` (7), `bro` (7) | one-line prompts; JM's `/gm` and `grill-me` ask instead | one line in `optimize-prompt` (PSKILL-3) | no skill |
| `sharpen` (16) | `prompting` exists with generic text | replaces text (PSKILL-3) | no skill; do PSKILL-3 |
| `ketchup` item contract | `/sm` is used for status (`sm.md`) | two lines (PSKILL-12) | no skill |
| `figure-it-out` (52) | `/create_plan` (151) and `cruise` (214) cover it | none | no |
| runtime and trace forensics (11, 14) | no capture-artifact work found: the only Qara hits for "heapsnapshot, cpuprofile, CDP" are browser debugging (PMODE-17) | a 15-line recipe in `performance-goal/references/` only if a real trace appears | no |
| `eval` playbook (25) | `eval-mode-sufficiency.md` (61, not read) and `probe-author` cover blind scoring; the sweep in `inference/` uses hidden tests; the banned-word list is brittle (PPROOF-14) | one reference file next to `eval-mode-sufficiency` at the next skill A/B | no now |
| `statechart` (82) | needs TLC, Java and a network install on first run (`statechart/SKILL.md:21`); outside the owner's no-install frame; Qara has a 13-line external `state-machine` command (`skills-external/visual-explainer/commands/state-machine.md`) | none | no |
| `typescript-best-practices` (31) | JM's code is TypeScript (qara scripts and hooks, tobogan checks); the engineers preload only `code-style` and `rust-style`, so no TypeScript-specific rule loads | PWRITE-borrow 2, about 25 lines as a sibling like `rust-style` | owner question; no unless a reviewer miss is on record |
| `recall` (35) | no chat-history recall exists; `compound` § Recall (`compound/SKILL.md:53-94`) recalls learnings only | none | PLEARN-9: no for now |
| `interrogate`, `arena`, `swarm` | `turbo`, `design-it-twice` cover them; cross-family review retired (`review-family.md:17`) | PSKILL-9 label only | no skill |
| `automate-me`, `make-bot-ui`, `ketchup-video`, `setup-pstack`, create/maintain verification skills | Cursor-specific, publish inferred preferences or run a listener (PPACK, PLEARN) | none | no |

- Basis: Verified for the existence checks (searches by job, not by pstack's names); Unverified for "would use".
- Code: none.
- Owner ruling 2026-11-23: no new skills (G3, option B). The `typescript-best-practices` skill is a no. pstack ideas land as steps in existing skills.

**PSKILL-18. Ten Qara surfaces are much longer than the pstack skill doing the same job; the first two carry nearly all of the removable text.**
Ratio is Qara lines over pstack lines for the same job. "Earning keep" is a judgement: enforcement, safety text or incident evidence. Pins are `rg --hidden` over `*.ts`, `*.json`, `*.sh` or `*.test.ts`.

| # | Qara surface | pstack equivalent | Ratio | What could go (line numbers) | Earning keep? | Pins and read status |
|---|---|---|---|---|---|---|
| 1 | "When to Activate This Skill" blocks in 62 SKILL.md | none (description only) | about 15 lines each | the blocks, about 910 lines (PSKILL-1) | no: body read after activation | 13 test files (heading asserted); read: 10 sampled |
| 2 | `system-create-skill` workflows (709) + SKILL (112) + checklist (76) + `skill-structure.md` (183) | `authoring-a-skill.md` (12) | about 94 (1,134 over 12; pstack leans on Cursor's built-in `create-skill`) | `create-skill.md:20-31,134-147,162-166`; `update-skill.md:20-31,142-153,164-170`; `canonicalize-skill.md:27-38,123-143,144-158,159-165`; `validate-skill.md:31-41,53-148,149-178,179-186,202-208`; about 270 (now a merge of the four workflows, ruling 9) | mostly no; the validator script and the edit-boundary step do | no test file in `system-create-skill/`; no `*.ts`, `*.json`, `*.sh` names the workflow files; pointers at `core/skill-structure.md:88` and `SKILL.md:19-35,92-96` must be edited with the merge; headings only read (PSKILL-2) |
| 3 | `prompting/SKILL.md` (112) | `sharpen` (16) | 7 | `:38-103`, 66 lines (PSKILL-3) | no | `prompting/skill-contract.test.ts` exists; its asserted strings sit at `SKILL.md:9-36` and in the two workflows, outside the cut; read in full |
| 4 | `show-me/SKILL.md` (283) | `how` 21 + `why` 9 + `teach` 21 + `bro` 7 = 58 | 4.9 | `:257-283`, 24 lines kept 3 (PSKILL-4); the four diff variants `:148-197` (50) are a Qara-chosen menu (PR Summary, `:146`), keep | the views earn it; the log does not | `show-me/skill-contract.test.ts` asserts no string in the cut except `No Mermaid inline`, which also sits at `:226`; none at or after `:240`; read in full |
| 5 | `historical-why.md` (138) | `why` (9) | 15 | the report template `:110-133` (24 lines) holds three asserted strings; cut only what no test reads, about 14 lines, net about -10 after the replacement sentence, or edit the test | mostly yes: its evidence-status vocabulary (`:76-83`) matches `research`; the template duplicates `:99-104` | PINNED: `show-me/skill-contract.test.ts:66-71` asserts `Only use the full report` (`:110`), `Competing Hypotheses` (`:125`) and `Sources Consulted` (`:131`), all inside the cut, plus `concise by default` (`:101`) and `No forced visual` (`:104`), outside it. Keep the three strings or edit the test. The other asserted strings (`:46-60` of the test) sit outside the cut; read in full |
| 6 | `tdd-qa/SKILL.md` (129) | `tdd` (42) | 3.1 (7.7 with `tdd-cycle.md` 193) | `:107-120` "Composing Workflows" (14 lines) repeats `:66-73` Usage Modes and `:79-85` Minimum Complete Cycle | the routing and the "advisory, not proof authority" note earn it | `tdd-qa/SKILL.test.ts` and `.claude/tests/tdd-qa.test.ts` exist. The latter asserts `Boundary:`, `Usage Modes` (heading at `:66`, outside the cut), `blueprint-pattern.md` and that every workflow file name appears in `SKILL.md`. A search of both files for every string they assert against lines 107-120 found no match; `tdd-cycle.md` unread |
| 7 | `triage-issue/SKILL.md` (162) | `bug-fix` 15 + `fix-root-causes` 14 + `tdd` 42 = 71 | 2.3 | Step 7 `:138-154` (17 lines) restates `:43-45`; shrink to about 9 | the CLI contract earns most of it | `triage-issue/skill-contract.test.ts:12-36` pins about 15 conditions; in step 7 only `external-handoff:` (`:146`) and `blocked-by-external:` (`:150`) are asserted; the cut is safe only while `:43-44` keep "External tracker status never drives Finding" |
| 8 | `handoff/SKILL.md` (56) | `session-pickup` 11 + `pause-safely` 10 = 21 | 2.7 | about 4 to 5 unpinned lines in `:41-52` (PSKILL-6; was 7) | durable-adapter and FACT/THEORY text earn it | pinned at `scripts/check-command-contract.test.ts:60,66,69,70,71,72`, including the worked `mkdir -p` example; read in full |
| 9 | `hook-authoring/SKILL.md` (219) | none | n/a | Rule 11 narrative `:193-198` (PSKILL-5); about 7 lines | the other twelve rules are incident-driven | `hook-authoring/SKILL.test.ts` exists; none of its asserted strings is in Rule 11 or Rule 13 (Rule 11's `hooks-guide.md` pointer stays); `scripts/check-hook-conformance.ts:5-15` cites rules by number, so append Rule 14 and renumber nothing; read in full |
| 10 | `performance-goal` goal-tool branch | none | n/a | `measure-and-improve.md:101-117` (17) and `SKILL.md:44-45,49-51` (5): Codex-only, "Normal performance work makes zero goal-tool calls" | unclear (Codex-only) | pinned: `performance-goal-contract.test.ts:69-77` asserts goal-tool strings in both files (for example `Normal use makes zero goal-tool calls`, `Call `get_goal` first`, `three consecutive goal turns`), all inside the proposed cut; not pstack-driven; owner question |

Also checked and left alone: `turbo/SKILL.md` (187) against `swarm` (41), ratio 4.6: its extra text is enforcement (handoff schema, authority envelope, worktree isolation `:84,:104`) and the GLM sniff line `:167` carries a `<!-- model-id-citation -->` marker read by `scripts/domains/models-domain.ts`, so cut nothing there. `humaniser` (79) against `unslop` (40): the extra is a fidelity gate (`:37-41`) that `unslop` lacks and the protected-regions rule (`:43-47`); keep. `performance-goal` against `benchmark-checklist` and the hillclimb and perf playbooks: Qara is ahead on statistics; keep.
- Why: the owner wants Qara simpler; these are the places pstack's shape argues for deletion.
- Basis: Verified (line numbers, ratios from `wc -l`, pins); Unverified (the earning-keep judgements and the 270 estimate).
- Code: Gap: edits as listed; none is code.

**PSKILL-19. Adopt four of pstack's skill-writing habits; reject five that conflict with Qara's measured results or rules.**
Compared against `core/skill-structure.md`, `system-create-skill` and the checklist, and NSKILL-17 (`noodle/skills.md:138-143`: "describe when, not how", "one skill, one job: can you say when it runs in one sentence?", "write it down before you automate", not yet in the checklist: `quality-checklist.md:25` has only the trigger-names-not-workflow rule).

| Habit in pstack | Where | Qara today | Verdict |
|---|---|---|---|
| Description only, no activation section; short (one or two sentences plus "Use for /x, 'phrase'") | `blast-radius/SKILL.md:3`, `arena/SKILL.md:3` | eight-category block in body and description (PSKILL-1) | adopt |
| Typical length 10 to 40 lines (median about 20 across 34 non-principle skills: 7 to 162, `wc -l`); the long ones (`poteto-help` 162, `make-bot-ui` 115, `poteto-mode` 110, `automate-me` 104) are help and setup text | `wc -l` of 58 skills | Qara skills run 30 to 300 (see ratios, PSKILL-18); `check-doc-line-cap` caps SKILL.md at 300 | adopt as an authoring target, not a check |
| `**Reply:**` final line states the exit contract and what a valid empty result is ("No findings is a valid result", `interrogate/SKILL.md:19`; "Never make up a call to fill the reply", `ketchup/SKILL.md:17`; "If a candidate produces no output, proceed with N-1", `arena/SKILL.md:24`) | all playbooks (PMODE-4) | "Output" sections; "An empty batch is a valid no-op" (`triage-issue/SKILL.md:89`) | adopt for new short skills: state the valid null result |
| Imperative, one idea per step; "Tell it to do the thing and skip the reason" | `authoring-a-skill.md:10` | rationale beside rules, e.g. `hook-authoring` Critical Rules | adopt in skill prose, not in `decisions/` |
| `disable-model-invocation: true` on all but one or two skills (57 of 58, PPACK) | frontmatter | 45 SKILL.md files carry it (`rg -l`); default is model-invocable on purpose for preloaded skills (`code-style/SKILL.md:54-58`: CC cannot preload a skill carrying the flag) | do not change the default; keep using it per skill for manual ones |
| Descriptions that summarize the steps ("Spawn N parallel candidates at the same task, pick a base, graft the strongest parts", `arena/SKILL.md:3`) | many | `quality-checklist.md:25`: a description naming the workflow makes agents follow the summary (`description-leak` detector) | reject; pstack breaks NSKILL-17 itself |
| Hand-off by name: "Delegate to other skills by path. Don't restate." (`authoring-a-skill.md:10`); "Reference it by name and let it own the format" (`show-me-your-work/SKILL.md:82`); principle leaves read only because a sentence says so | passim | `READ:` pointers; `code-style/SKILL.md:54-58` measured a prose "read this file" pointer at 0 of 4 loads across placements and models (2026-09-06) | reject for agent prompts (use `skills:` preload); keep for skill-to-skill pointers inside an invoked skill, which that probe did not test (Unverified) |
| Named stop conditions as a verdict vocabulary (`VERIFIED / NOT VERIFIED / INCONCLUSIVE`, `figure-it-out/SKILL.md:42`; "`PASS`, `ISSUES`, or `BLOCKED`", `swarm/SKILL.md:31`) | few skills | `PASS | FAIL | UNRESOLVED` (`verifier.md:65,77`), `ANSWERED/PARTIAL/BLOCKED/CHALLENGED/DEFERRED` (`worker-common.md:88-94`) | level; nothing |
| Stable rule numbers other skills cite; "A removed rule leaves a gap." | `unslop/SKILL.md:11` | numbered rules in `code-style`, `rust-style`, `hook-authoring` | level |
| Lists of banned phrases in a skill (`teach/SKILL.md:16,19`, `unslop/SKILL.md:15,33`) | several | `humaniser/SKILL.md:51` treats em dashes and rule-of-three as weak signals; Qara's own skill files use " — " | reject |
| "Pick each subagent's reasoning level for the job, per the Subagents section" repeated in 17 places (PMODE-20) | passim | one generated roster (`delegation-roster-and-tiers.md`) | reject |

- Why: only the first four change what a skill author writes, and the first removes text.
- Basis: Verified (quotes; counts by `rg`/`wc`); Unverified (that the habits improve skills; the 0 of 4 figure is quoted from `code-style/SKILL.md:54-58`, not re-run).
- Code: none.

**PSKILL-20. Exclude eleven imported instructions because they conflict with JM's standing rules or with Qara's gates.**
JM requires confirmation before outward-facing or hard-to-reverse acts, one question at a time, a blind review of the exact head before merge, and no force push (`~/.claude/CLAUDE.md`, `.claude/context/acts.md`, `git-update-repo.md`). None of these lines appears in a proposal above.

| pstack line | Instruction | Conflicts with |
|---|---|---|
| `poteto-mode/worker.md:7`; `SKILL.md:76,80` | "Never call a tool that shows a person a question"; "Just do it. Use any MCP tool. Reversible work and external actions (team chat, ticket updates) proceed without asking"; "'Don't stop' ... → keep going" | W-1 and the confirmation rule; external messages are not reversible (PMODE-19) |
| `bug-fix.md:11`; `refactoring.md:14`; `opening-a-pr.md` | "Stage the commits so the failing repro lands before the fix in git history"; "Rebase into small ordered commits" | A failing-test-only commit is blocked by the pre-commit gate (the engineer prompt says the pre-commit hook's impacted selection is the run that gates the commit); rebasing a pushed branch needs a force push; a new head voids a blind `MERGE` at the exact head (`acts.md:7`). Import only as the order of new commits. |
| `hillclimb.md:15`; `:7` | "One commit per accepted fix"; a stop predicate with a floor on attempts | `measure-and-improve.md:82` bans automatic commit; a floor must not override the caps at `:22-24`, `:77-79` |
| `shipping.md:8`; `autopilot-full.md` (PPAR) | `gh pr merge <pr> --squash`, `git push --force-with-lease`, merge when the swarm verdict clears | no force push, blind `MERGE` at the exact head with `--match-head-commit` (`acts.md:7`) |
| `session-pickup.md:6-7` | "The prior trail is authoritative input. Resist the bias to re-derive it." | `handoff/SKILL.md:22-24`: a received rule is a claim to check |
| `interrogate/SKILL.md:19` | "Leave out anything you did not run" | `reviewer.md:40`: raise at true severity; the controller adjudicates |
| `correct/SKILL.md:26` | "Run the same command locally and in CI" | `~/.claude/CLAUDE.md`: CI is local unless JM says otherwise |
| `worktree-cleanup.md:7-8` | `git worktree remove --force`, `rm -rf`, `xcrun simctl delete`, clearing caches | `acts.md:16-17` allow only a clean, merged, plain `git worktree remove` (PMODE-19) |
| `statechart/SKILL.md:21`; `poteto-mode/scripts/bootstrap.ts` | install TLC and Java with mise on first run; `bun install` on first use | the 2026-11-23 no-install decision; package-manager integrity rule |
| `recall/SKILL.md:15,19-21`; `show-me-your-work/SKILL.md:57,67` | read private chat transcripts; run a cross-vendor reviewer over the trail | privacy; no cross-family review in Qara (`review-family.md:17`) |
| `no-comments/SKILL.md:20`; `unslop/SKILL.md:21,27` | delete a comment unless proven; no dashes; straight quotes only | `code-style` rule 8; `humaniser/SKILL.md:51` ("Curly quotation marks are ordinary typography") |

- Why: a proposal that imports one of these changes a gate by accident.
- Basis: Verified for the Qara rules quoted; the pstack lines in `shipping`, `worktree-cleanup`, `opening-a-pr`, `worker.md`, `autopilot-full` and `bootstrap.ts` were NOT read directly: they come via PMODE-19, PPAR and PPACK (Unverified here); the pre-commit-gate claim rests on the engineer agent prompt, not a Qara `path:line` (Unverified); severity is Unverified.
- Code: none.

**PSKILL-21. Judge that about 1,260 lines of Qara text can be deleted for about 30 added, no Qara code must change, and nothing enforced should be replaced by a paragraph.**
- Why: the owner asked for fewer lines; pstack's useful content is small and its main lesson is brevity. Prose is a request, not a guarantee: `pstack/skills/principle-encode-lessons-in-structure` and `correct` themselves say a structural fix beats a sentence, and the Noodle research found prose gates with nothing behind them.
- Evidence: net lines from PSKILL-1 to 16: removed about 910 + 268 + 57 + 21 + 4 + 6 = 1,266, plus 3 from `retro`; added about 30 across PSKILL-7 to 16. Optional code: about 20 lines of `scanActivationTriggers` plus its seeds and test after PSKILL-1. Must stay as code: every gate in the master table's "ours stronger" rows, the `critic` and `reviewer` verdict parsers, the `# contract:verifier` block (`verifier.md:25-51`), the model-id citation marker (`turbo/SKILL.md:167`), the `skill-contract` tests. The sibling documents' larger removals (TDD state about 2,715 lines, `dream` about 6,400) are PPROOF's and PLEARN's, not repeated here.
- Basis: Unverified. The sum mixes gross removals (PSKILL-1, 2) with net figures (PSKILL-3 to 6), and two inputs (910, 270) are estimates. It also includes the withdrawn PSKILL-15 line and the PSKILL-6 figure before it was corrected. Treat it as an order of magnitude only.
- Original proposal; superseded by PSKILL-22: "about 30 added, 0 removed" is replaced by the budget rule (each edit cuts at least what it adds in the same file); the `scanActivationTriggers` removal is part of PSKILL-1, not optional; the `acts.md` line (PSKILL-15) is withdrawn.
- Code: none; Gap: the edits above.

**PSKILL-22. Follow the owner's rulings of 2026-11-23 where they differ from the proposals above.**
The owner answered the open questions of this document and of its sibling documents on 2026-11-23. Where a ruling and an earlier doctrine disagree, the ruling wins. Each affected doctrine carries a line `Owner ruling 2026-11-23` that says what changed. The original research text stays.

| # | Question | Owner's answer |
| --- | --- | --- |
| G1 | Cut text is deleted outright; references only for handed material (option C) | "yes C" |
| G2 | Skill shape: triggers, numbered steps with evidence, one done-when line | "yes" |
| G3 | pstack ideas land as steps in existing skills; no new skills (option B) | "yes B" |
| G4 | Cut restating sections, keep write guards | "yes" |
| G5 | The description's USE WHEN is the only statement of when a skill runs | "yes" |
| G6 | Description is one sentence on the situation plus at most three example phrases; eight-category rule dropped; overlap check kept for now | "yes" |
| G7 | Skills sharing a subject merge into one skill with playbooks (improve-loop, improve-repo, improve-repo-architecture, nune, machinery-trimming into `improve`; triage-issue and triage-resolution into `triage`; pi and pi-loop into `pi`; plan-grounding and the plan commands into `plan`); modes and wrappers excluded | "yes" |
| 8 | Take four principle ideas (attack the premise; three assertion rules into `testing-guide.md`; guard legitimacy into the worker rules; explain the number into `performance-goal`), each paired with a cut in the same file; reject "never block on the human" and "intermediate breakage is acceptable" | "yes" |
| 9 | `system-create-skill`: A trim in place, or B merge four workflows into one | "B" |
| 10 | `prompting`: A cut 66 lines and add the four questions to the optimise workflow, or B cut only | "A" |
| 11 | `show-me`: A cut the change log and add the build-up rule, limited to explaining a system the reader is new to (not status views) | "A" |
| 12 | `handoff` receiver-report line and `hook-authoring` restart test as Rule 14, each with its 7-line cut | "yes" |
| 13 | `critic`: A replace the importer threshold with the one-fact rule and a four-rung marker | "A" |
| 14 | `/sm`: A action-item definition plus five fields, with one more line cut | "A" |
| 15 | `reviewer`: A label a runtime finding with its run or "unproven", conditional on a matching cut; never drop a finding | "A" |
| 16 | `retro`: four filters, reject the fix order, pointer to the code/doctrine line | "yes" |
| 17 | `refactoring-signals.md`: pin-first and reader-load test against a matching cut; reject one-wave migration and rebase | "yes" |
| 18 | Five items carried from the Noodle grill: resume brief into `pi-subagents.md` with a cut (take); restart-bug line into `triage-issue` paired with shrinking step 7 (take); of three authoring rules, two already covered and one line taken; non-blocking review outcome (drop); measured-evidence section in `model-policy.md` (wait for the Claude wave) | "yes" |
| 19 | `dream` producer: A retire the producer (about 6,400 lines, estimate), keep the write guards (about 850), `retro` and `compound` become the source | "A" |
| 20 | TDD machinery: A shrink to `tdd-state.ts`, arm and clear commands and a run log; verdict ladder becomes a paragraph | "A" |
| 21 | Standing-audits runner: A registration and adapters become a dated table read by a small core; prune chores nobody acts on | "A" |
| 22 | Remaining rows: shrink skill-sufficiency scoring (keep the precheck), shrink turbo graph files, remove `harness-topology.ts` with the registry change, remove `check-typescript-exports-shape.ts` if no gate reads it, all after a caller trace; keep `check-skill-trigger-overlap.ts`; leave `model-policy-index.ts`, `router-nudge-state.ts` and `keyword-routes.json` | "yes" |
| 23 | Order: A contract first (description-only shape and the merged skill-creation skill), then family merges and the small swaps, with code removal alongside as one PR per row | "A" |

The budget rule: every skill or guide edit must cut at least as many lines as it adds from the same file. Authority corrections are exempt. If no matching cut is found in the host file at edit time, the item is dropped, not waived. This replaces every "Cut: nothing" above.

Inside wave 2, the `triage`, `pi` and `improve` merges go before the swaps that touch those files. All line figures are estimates.

Preconditions before any Qara edit:
- Run the five-step caller trace in `pstack/README.md` before any deletion.
- Read in full the four skill-creation workflows and the two `prompting` workflows before cutting.
- Run the host file's own contract test before and after each cut: `show-me/skill-contract.test.ts` (it pins `Only use the full report`, `Competing Hypotheses` and `Sources Consulted` in `historical-why.md`), `prompting/skill-contract.test.ts`, `hook-authoring/SKILL.test.ts` (and keep the rule numbers that `scripts/check-hook-conformance.ts` cites), `triage-issue/skill-contract.test.ts`, `retro/SKILL.test.ts`, `.claude/tests/performance-goal-contract.test.ts`, `tdd-qa/SKILL.test.ts` and `scripts/check-command-contract.test.ts`.
- Check the `critic` side: `scripts/check-agent-definitions.ts:164-175`, the fixture and `parseCriticVerdict` need only `file:line` and a final `Verdict:` line; decide whether `config/prompts/critic-system.md` gets the same edit.
- Keep the pinned strings: in `handoff`, those asserted at `scripts/check-command-contract.test.ts:60,66,69,70,71,72` (including the worked `mkdir -p ... && d=$(mktemp -d "$HOME/.claude/state/handoff-XXXXXX")` example); in `triage-issue`, `external-handoff:` (`:146`) and `blocked-by-external:` (`:150`) of `SKILL.md`, and the "status never drives Finding" text at `:43-44`.

Rulings 19 to 22 concern rows in other documents of this track: `pstack/learning-and-explaining.md`, `pstack/verification.md`, `pstack/parallel-and-autonomous.md`, `pstack/packaging-and-automations.md` and `pstack/principles.md`. Go there for the rows.
- Why: the owner decides what changes in Qara and csf. A research document that keeps proposing what the owner has refused would mislead the next reader.
- Evidence: the owner's answers, quoted in the table, given on 2026-11-23.
- Basis: Decision (owner: JM).
- Code: Gap: nothing is applied yet in Qara or csf.

## Reference

### A. Master table: every pstack skill

Lines are `wc -l` of the pstack SKILL.md and of the Qara file (Verified). Verdicts are judgements (Unverified). "(fm)" means frontmatter only. Action codes point to the doctrines above.

| # | pstack skill (lines) | What it does | Qara counterpart (path, lines) | Verdict | Action |
|---|---|---|---|---|---|
| 1 | `architect` (11) | Sketch two shapes before code; pick the one where each state has one owner | `.claude/agents/architect.md` (64), `skills/design-it-twice` (91) | ours stronger | nothing |
| 2 | `arena` (48) | N candidates, rubric hidden, cross-vendor judge, pick a base, graft | `skills/design-it-twice` (91) | level | nothing (PPAR) |
| 3 | `automate-me` (104, fm) | Draft or refresh a personal "-mode" skill from preferences and transcripts | none by job (nearest: memory `feedback` files; `skills/compound` 170) | no counterpart | nothing |
| 4 | `benchmark-checklist` (39) | Seven questions to vet a performance number | `skills/performance-goal/workflows/measure-and-improve.md` (117) | theirs stronger on 4 of 7; ours stronger on statistics | enhance ours: PSKILL-10 |
| 5 | `blast-radius` (50) | Find the one fact a change is safe because of; prove it by running; rate how sure | `agents/critic.md` (59), check 4 | theirs stronger | enhance ours: PSKILL-8 |
| 6 | `bro` (7) | Restate the last message plainly | none | no counterpart | nothing |
| 7 | `correct` (32) | Group repeated mistakes; fix at the highest level; prove the check; keep a rule table | `skills/retro` (93), `improve-repo/workflows/lens-guardrail-ladder.md` (68), `context/acts.md` (32) | level; theirs stronger on order and proof | enhance ours: PSKILL-7 (four filters only; PSKILL-15 withdrawn; fix order rejected) |
| 8 | `create-formal-verification-skill` (43, fm) | Generate a project-local formal-verification skill | none | no counterpart | nothing (PPROOF) |
| 9 | `create-verification-skill` (44, fm) | Generate a project-local skill that drives the app | `skills/devtools-mcp` (68), `tdd-qa/workflows/e2e-verify.md` (112) | level | nothing |
| 10 | `figure-it-out` (52) | Design a playbook when none fits: frame, design, loop, trail, verify | `commands/create_plan.md` (151), `skills/cruise` (214, unread) | ours stronger (gates) | nothing |
| 11 | `how` (21) | Spawn a read-only subagent to explain how code works | `skills/show-me` (283, quick path), `agents/codebase-analyzer` | level | nothing |
| 12 | `interrogate` (31) | Adversaries prove findings by a run; unproven findings drop | none (nearest `commands/spotcheck.md` 52) | theirs stronger | enhance ours: PSKILL-9 (label only) |
| 13 | `in-your-own-words` (7) | Restate the user's goals | none (`grill-me` asks instead, PMODE-12) | no counterpart | one line, PSKILL-3 |
| 14 | `ketchup` (43) | Catch-up with an action-item contract | `commands/sm.md` (15) | theirs stronger on the item contract | enhance ours: PSKILL-12 |
| 15 | `ketchup-video` (29) | Ketchup as a subtitled video | none | no counterpart | nothing |
| 16 | `maintain-formal-verification-skill` (58, fm) | Refresh the formal model against the code | none | no counterpart | nothing |
| 17 | `maintain-verification-skill` (39) | Periodic audit of a verification skill | none (`standing-audits` 93 registers chores, not this) | no counterpart | nothing |
| 18 | `make-bot-ui` (115, fm) | Build a bot UI (HTTP listener, key in a file; PPACK) | none | no counterpart | nothing |
| 19 | `no-comments` (24) | Spawn a subagent to delete comments, offer encodings | `skills/code-style` (60) rules 8 and 10, `skills/code-quality-review` (30) | level; policy conflict | PSKILL-16 (one sentence, owner decision) |
| 20 | `poteto-help` (162, fm) | Help map and a 35-row pick-a-skill table | `commands/skills.md` (73), `context/routing-cheatsheet.md` (350) | level | nothing |
| 21 | `poteto-mode` (110) | Entry router, triggers, 24-principle index | `skills/core/SKILL.md` (128), `routing-cheatsheet.md` (350), keyword router | ours stronger as a router; theirs holds task-shaped steps (PMODE-16) | nothing |
| 22 | 24 `principle-*` (337 in total, 9 to 21 each) | One-rule leaf skills | `skills/core/MISSION.md` (77), `core/PRINCIPLES.md` (110) | ours stronger (PPRIN: 14 of 24 held, enforced) | enhance ours: PSKILL-5, 11, 13 take four clauses |
| 23 | `recall` (35) | Rebuild context from chats and the shared record | `skills/compound` (170), § Recall `:53-94` (learnings only) | no counterpart for chat recall | nothing (PLEARN-9) |
| 24 | `reflect` (17) | Mine a transcript for durable learnings, approval-gated | `skills/retro` (93) | level; theirs stronger on the six-month test | enhance ours: PSKILL-7 |
| 25 | `setup-pstack` (80, fm) | Per-role model rule file | `context/model-policy.md` (184) | ours stronger | nothing |
| 26 | `sharpen` (16) | Four questions, then rewrite the prompt deeper | `skills/prompting` (112) | theirs stronger (operational) | enhance ours and cut: PSKILL-3 |
| 27 | `show-me-your-work` (82) | TSV decision log, audit against the transcript, cross-vendor review | none as a skill (typed logs: `scripts/orch-state.ts`, `DEBT:` sections) | no counterpart | nothing (PLEARN-14) |
| 28 | `statechart` (82, first 40 lines) | TLA+ model check, Mermaid chart | `.claude/skills-external/visual-explainer/commands/state-machine.md` (13, external) | no counterpart for model checking | nothing |
| 29 | `swarm` (41) | Fan out N workers, drain, report | `skills/turbo` (187) | ours stronger | nothing |
| 30 | `tdd` (42) | Failing test first for a bug with a cheap test path | `skills/tdd-qa` (129), `tdd-qa/workflows/tdd-cycle.md` (193) | ours stronger | nothing; trim PSKILL-18 row 6 |
| 31 | `teach` (21) | Explain what, how and why plainly; diagram series | `skills/show-me` (283) | level; theirs has the build-up rule | enhance ours and cut: PSKILL-4 |
| 32 | `technical-writing` (70, fm) | Diátaxis, Google style, STE rules | `skills/edit-article` (115), `skills/humaniser` (79) | level | nothing (PWRITE) |
| 33 | `typescript-best-practices` (31) | 16-row TypeScript rule table; `paths:` glob | none (`code-style` is language-neutral; `rust-style` 64 for Rust) | no counterpart | no (owner ruling, G3: no new skills) |
| 34 | `unslop` (40) | 33 numbered AI-tell rules | `skills/humaniser` (79) | level; ours adds a fidelity gate | nothing |
| 35 | `why` (9) | Answer from the commit and PR record, label inference | `skills/show-me/workflows/historical-why.md` (138) | ours stronger | trim, but the three template strings pinned by `show-me/skill-contract.test.ts:66-71` stay or the test is edited: PSKILL-18 row 5 |

### B. Master table: every playbook (`pstack/skills/poteto-mode/playbooks/`)

| # | Playbook (lines) | What it does | Qara counterpart (path, lines) | Verdict | Action |
|---|---|---|---|---|---|
| 1 | `authoring-a-skill` (12) | Create, validate, test, then "When in doubt, delete" | `skills/system-create-skill` (112 plus workflows 709) | ours stronger on validation, 94 times longer | shorten: PSKILL-2 |
| 2 | `autonomous-run` (13) | Wake via `/loop`, smallest change per iteration, stop on predicate | `skills/pi-loop` (180), `ticket-round-loop` (90) | level | nothing (PPAR) |
| 3 | `autopilot-full` (25) | Parallel owners, swarm verify, merge when cleared | `commands/land.md` (202), `skills/address-all-in-subs` | ours stronger on merge safety | nothing (PPAR); lines excluded (PSKILL-20) |
| 4 | `autopilot-stack` (8) | Autopilot, stop at verified | same | ours stronger | nothing |
| 5 | `babysit` (10) | Watch a PR: conflicts, threads, CI | `commands/land.md` (202), `scripts/landing/` | level | nothing (PPAR) |
| 6 | `bug-fix` (15) | Reproduce, binary-search, fix, verify, evidence | `skills/triage-issue` (162), `tdd-qa`, `worker-common.md:18-22` | level; theirs stronger on root-cause and premise lines | enhance ours: PSKILL-11 |
| 7 | `eval` (25) | Blind A/B of a skill variant | `commands/eval-mode-sufficiency.md` (61, unread), `agents/probe-author.md` (39) | level | nothing now (PSKILL-17) |
| 8 | `feature` (21) | Trace, architect, delegate, verify, small commits | `commands/create_plan.md` (151), `skills/cruise` (214), `agents/architect.md` | ours stronger | nothing |
| 9 | `hillclimb` (21) | One change, one measure, keep or revert | `performance-goal/workflows/measure-and-improve.md` (117), `skills/improve-loop` (268) | ours stronger | nothing; two lines excluded (PSKILL-20) |
| 10 | `investigation` (14) | Read-only trace and report | `skills/research` (137), `show-me`, `diderot` (39) | level | nothing |
| 11 | `multi-phase-plan` (11) | PR ids, dependency graph, unit/live/perf boxes | `commands/create_plan.md` (151), `core/workflows/plan-template.md` (283, unread) | ours stronger on structure; theirs has the three boxes | defer to PPROOF; plan-template unread |
| 12 | `opening-a-pr` (9) | Branch, small commits, title, body under 40 lines | `core/workflows/git-update-repo.md` (177), `commands/push.md` (37) | level | nothing (PWRITE borrow 5) |
| 13 | `pause-safely` (10) | Stop at a safe boundary, one `wip:` commit, resume note | `ticket-round-loop` PAUSE sentinel, `skills/restart` (30) | level | nothing |
| 14 | `perf-issue` (25) | Baseline, seven mantras, compare artifacts | `skills/performance-goal` (64) | ours stronger | PSKILL-10 |
| 15 | `prototype` (14) | Throwaway variants behind a switcher, recommend | `skills/prototype` (71, unread) | level (PMODE-17) | nothing |
| 16 | `refactoring` (16) | Pin first, subtract, small steps, keep if reader load drops | `core/references/refactoring-signals.md` (25), `skills/improve-repo-architecture` (110) | theirs stronger | enhance ours: PSKILL-14 |
| 17 | `runtime-forensics` (11) | Capture a live signal, instrument by CDP, map to source | none | no counterpart | nothing (PSKILL-17) |
| 18 | `session-pickup` (11) | Locate the trail, reconstruct, resume | `skills/handoff` (56) incoming, `skills/restart` (30) | level, opposite trust stance | enhance ours: PSKILL-6 (reply shape only) |
| 19 | `shipping` (12) | Land a verified stack bottom-up | `commands/land.md` (202) | ours stronger | nothing |
| 20 | `trace-forensics` (14) | Artifact to sqlite, query, attribute, paired diff | none | no counterpart | nothing (PSKILL-17) |
| 21 | `visual-parity` (11) | Baseline is the spec; image diff per component | `skills/design-implementation` (101, unread) | partial | nothing now; the two anti-tamper clauses (`:6`) await a read of that skill |
| 22 | `worktree-cleanup` (12) | Audit script, then `--force` and `rm -rf` | `scripts/closeout/remove-finished-worktree.ts` (162), `acts.md:16-17` | ours stronger and safer | nothing; lines excluded (PSKILL-20) |

### C. Enhancements ranked by net lines (text lines; negative removes)

| Rank | Doctrine | pstack source | Qara file | Added | Removed | Net |
|---|---|---|---|---|---|---|
| 1 | PSKILL-1 | description-only shape | 62 SKILL.md plus `skill-structure.md`, `quality-checklist.md` | 2 | about 935 | about -933 |
| 2 | PSKILL-2 | `authoring-a-skill.md:10` | `system-create-skill` workflows, `quality-checklist.md` | 5 | about 270 to 400 | about -265 to -395 |
| 3 | PSKILL-3 | `sharpen/SKILL.md:9-16` | `prompting/SKILL.md`, `optimize-prompt.md` | 9 | 66 | -57 |
| 4 | PSKILL-4 | `teach/SKILL.md:17` | `show-me/SKILL.md` | 3 | 24 | -21 |
| 5 | PSKILL-6 | `session-pickup.md:11` | `handoff/SKILL.md` | 1 | about 4 to 5 (was 7) | about -3 to -4 (was -6) |
| 6 | PSKILL-5 | `principle-make-operations-idempotent:13,15` | `hook-authoring/SKILL.md` | 3 | 7 | -4 |
| 7 | PSKILL-12 | `ketchup/SKILL.md:17,19` | `commands/sm.md` | 3 | 1 | +2 |
| 8 | PSKILL-8 | `blast-radius/SKILL.md:19-27,34,43` | `agents/critic.md` | 3 | 1 | +2 |
| 9 | PSKILL-7 | `reflect:13`, `correct:15` (the twice rule; `correct:19-22` fix order rejected) | `skills/retro` | 6 | 3 | +3 |
| 10 | PSKILL-9 | `interrogate:19,23` | `agents/reviewer.md` | 2 | 0 | +2 |
| 11 | PSKILL-13 | `principle-test-behavior-not-implementation:13,16` | `core/testing-guide.md` | 3 | 0 | +3 |
| 12 | PSKILL-14 | `refactoring.md:7,8,13` | `refactoring-signals.md` | 4 | 0 | +4 |
| 13 | PSKILL-11 | `principle-fix-root-causes:12`, `principle-attack-the-premise:11-15` | `worker-common.md`, `triage-issue` | 4 | 0 | +4 |
| 14 | PSKILL-10 | `benchmark-checklist:21-27` | `measure-and-improve.md` | 8 | 0 | +8 |
| 15 | PSKILL-15 | `correct:30` | `context/acts.md` | 1 | 0 | +1 (withdrawn by the owner; do not apply) |
| 16 | PSKILL-16 | `no-comments:23` | `code-style/SKILL.md` | 1 | 0 | +1 (owner decision) |

Ranking rule: edits that delete text first (ranks 1 to 9; 7 to 9 delete 1 to 3 lines but add more), then add-only edits by value, not by size. The table above is in that order, so the first twelve rows are PSKILL-1, 2, 3, 4, 6, 5, 12, 8, 7, 9, 13, 14. Rows 13 and 14 (PSKILL-11, PSKILL-10) carry the most value among the add-only edits but sit below the size order. Rank 15 (PSKILL-15) is withdrawn.

Order caveat: with PSKILL-6 now at about -3 to -4 and PSKILL-5 at -4, the order of ranks 5 and 6 is not reliable. PSKILL-6 may also be dropped under the budget rule if its real cut is under one line.

Original proposal; superseded by PSKILL-22: the Added and Removed columns predate the budget rule and the PSKILL-2 merge. Under the budget rule every "0 removed" row needs a matching cut in its file, or the item is dropped. PSKILL-2 is a merge of four workflows, so its figures are rough.

### D. Pin sweep, 2026-11-23

Every Qara file where this document proposes a cut or an edit, the test files and scripts found for it, and whether an asserted string falls inside a proposed cut. Readers were searched with `rg --hidden` over `*.ts`, `*.json`, `*.sh` under `/home/jean-marc/qara`, then the test files were read. A search that reports no hit proves only that the search was narrow. Asserted strings were compared with each cut's line range by search; "not checked" means that comparison was not done.

| Qara file | Readers found | Asserted string inside a cut? |
|---|---|---|
| 62 `SKILL.md` "When to Activate" blocks (PSKILL-1) | thirteen test files assert the heading; each host skill may also have its own contract test | not checked block by block; run each host test |
| `core/skill-structure.md`, `quality-checklist.md` | `validate-skill.test.ts` (script only); `criterion-shape.test.ts:430` quotes the path of the former in a criterion string | not checked beyond that; the test does not open the file as read |
| `system-create-skill/SKILL.md` and four workflows | no test file in the directory; no code names the workflows | no assertion found; pointers at `skill-structure.md:88` and `SKILL.md:19-35,92-96` must be edited with the merge |
| `prompting/SKILL.md` and workflows | `prompting/skill-contract.test.ts` | no: asserted strings at `SKILL.md:9-36` and in the workflows; keep every pattern in `optimize-prompt.md` |
| `show-me/SKILL.md` | `show-me/skill-contract.test.ts` | no, except `No Mermaid inline`, which also sits at `:226`; insertion after `:241` is safe |
| `show-me/workflows/historical-why.md` | same test, `:46-71` | YES: `Only use the full report` (`:110`), `Competing Hypotheses` (`:125`), `Sources Consulted` (`:131`); keep them or edit the test |
| `hook-authoring/SKILL.md` | `hook-authoring/SKILL.test.ts`; `scripts/check-hook-conformance.ts:5-15` | no; add Rule 14, renumber nothing |
| `handoff/SKILL.md` | `scripts/check-command-contract.test.ts:56-73` | YES for the worked example (`:69`) and the strings at `:60,66,70,71,72`; the cut avoids them |
| `retro/SKILL.md` | `retro/SKILL.test.ts` | no for the `:29-30` cut (`introspect` at `:9`) and for the `:83` pointer if `mechanical`, `deterministic check`, `judgement` stay (also at `:62-64`); the new category adds an eighth `_Use when_` marker, which the test counts at seven; the `:14-25` block (PSKILL-1) not checked (the test asserts `current session` and `.claude/projects/`) |
| `agents/critic.md` | `scripts/check-agent-definitions.ts:164-175`; `critic-verdict.ts`; fixture; `factory-mode-workers.test.ts` reads `.factory/droids/critic.md`, a different file | no; `config/prompts/critic-system.md` is a second prompt, also "high blast radius", not ruled |
| `agents/reviewer.md` | `compound/integration.test.ts:11` (Recall section `:11-20`); `reviewer-verdict.ts`; `factory-mode-workers.test.ts` reads `.factory/droids/reviewer.md` | no; `config/prompts/reviewer-system.md` not read |
| `performance-goal/workflows/measure-and-improve.md` | `performance-goal-contract.test.ts:36-77`; `improve-loop-ts-lane-contract.test.ts:33` (link only) | no for additions; YES for the Codex branch `:101-117` (open question 16); `decision-contract.json` not read |
| `triage-issue/SKILL.md` | `triage-issue/skill-contract.test.ts:12-36` | YES in step 7: `external-handoff:` (`:146`), `blocked-by-external:` (`:150`); the status clause is saved by `:43-44` |
| `worker-common.md` | only a comment at `scripts/landing/envelope-check.ts:5` | none found |
| `commands/sm.md` | no code; named in `docs/COMMANDS.md` and `routing-cheatsheet.md` | none found in code; docs not checked |
| `core/testing-guide.md` | no code; named by seven markdown files | none found in code; markdown not checked |
| `core/references/refactoring-signals.md` | no code; named by four markdown files | none found in code; markdown not checked |
| `tdd-qa/SKILL.md` | `tdd-qa/SKILL.test.ts`, `.claude/tests/tdd-qa.test.ts` | no: `Usage Modes` is at `:66`, and no asserted string matches lines 107-120; `tdd-cycle.md` unread |
| `code-style/SKILL.md` | `code-style/SKILL.test.ts:19-32` | no; the added sentence follows the "pointer" clause |
| `tools/skill-validator/skill-validator-lib.ts` | `skill-validator-lib.test.ts`, `validate-skill.test.ts` | to be edited with the scan removal; not compared |

## Open

Each question can be asked alone. Removals first; each names the Qara skill it changes.

1. Delete the "When to Activate This Skill" blocks from the 62 SKILL.md files (about 910 lines, estimated) and the three prose rules that require them (`skill-structure.md`, `quality-checklist.md`, `system-create-skill/SKILL.md`), editing the thirteen tests that assert the heading? Recommendation: yes, in one pull request, keeping `USE WHEN` in each description and the `weak-activation-triggers` warning for now. Changes: every skill, headed by `system-create-skill`.
   - SETTLED 2026-11-23. Settled by G5, G6 and ruling 23 (contract first). The `weak-activation-triggers` scan is removed or retuned in the same change, not kept for a month.
2. Cut the four `system-create-skill` workflows by about 270 lines (the repeated "Read Canonical Architecture" step, the score cards, the report templates, the success-criteria and related-workflow tails) and add the four-line delete rule to the checklist? Recommendation: yes, after question 1, and after reading the four workflows in full. Changes: `system-create-skill`.
   - SETTLED 2026-11-23. Settled by ruling 9 ("B"): a merge of the four workflows, not a 270-line trim.
3. Replace `prompting/SKILL.md:38-103` (66 lines) with the four `sharpen` questions placed in `optimize-prompt.md` (net -57)? Recommendation: yes, after reading both workflows. Changes: `prompting`.
   - SETTLED 2026-11-23. Settled by ruling 10 ("A").
4. Cut `show-me/SKILL.md:257-283` to three lines and add the build-up rule for diagrams (net -21)? Recommendation: yes. Changes: `show-me`.
   - SETTLED 2026-11-23. Settled by ruling 11 ("A"), limited to explaining a system the reader is new to.
5. Add the restart test as Critical Rule 14 and cut Rule 11's history narrative (net -4)? Recommendation: yes. Changes: `hook-authoring`.
   - SETTLED 2026-11-23. Settled by ruling 12, with its 7-line cut.
6. Shrink the `mktemp` paragraph and add the reply shape for a received handoff (net -6)? Recommendation: yes. Changes: `handoff`.
   - SETTLED 2026-11-23. Settled by ruling 12, with a smaller cut (about 4 to 5 lines) because the worked example is pinned; dropped if the cut does not cover the added line.
7. Add the "one fact it is safe because of" and a how-sure marker to `critic`, replacing the importer-count verdict (+3, -1)? Recommendation: yes, after checking `.claude/agents/fixtures/critic-citation-example.md` and the `check:agents` lint. Changes: `critic`.
   - SETTLED 2026-11-23. Settled by ruling 13 ("A"): four rungs only.
8. Add "show the run, or say unproven" to `reviewer` (+2)? Recommendation: yes. Changes: `reviewer`.
   - SETTLED 2026-11-23. Settled by ruling 15 ("A"), only if a matching cut is found in `reviewer.md`.
9. Add four benchmark questions to `performance-goal` (+8)? Recommendation: yes. Changes: `performance-goal`.
   - SETTLED 2026-11-23. Settled by ruling 8 (explain the number), against a matching cut in the same file.
10. Add the guard-legitimacy test and shared-premise step to `worker-common` and `triage-issue` (+4)? Recommendation: yes, in those two files and not in `CLAUDE.md`. Changes: `worker-common`, `triage-issue`.
   - SETTLED 2026-11-23. Settled by ruling 8, in `worker-common.md` and `triage-issue`, each with a matching cut.
11. Take `ketchup`'s action-item definition into `/sm` (+3, -1)? Recommendation: yes. Changes: `/sm`.
   - SETTLED 2026-11-23. Settled by ruling 14 ("A"), with one more line cut from `sm.md`.
12. Add the assertion rules to `testing-guide` (+3), pin-first to `refactoring-signals` (+4), the repeat line to `acts.md` (+1), and the six-month test and fix order to `retro` (+3 net)? Recommendation: yes to each, as four small edits that can be asked separately.
   - SETTLED 2026-11-23. Settled: assertion rules by ruling 8 and pin-first by ruling 17 (each against a matching cut); the `acts.md` line is withdrawn; `retro` by ruling 16 (four filters, fix order rejected).
13. Add one sentence to `code-style` rule 10 (a constraint comment becomes a check), exempting it from the promotion ladder? Recommendation: ask; low value and it costs tokens on every engineer spawn. Changes: `code-style`.
   - STILL OPEN: no ruling covers `code-style` rule 10.
14. Add a 25-line `typescript-style` skill for the engineers to preload? Recommendation: no, unless a reviewer miss of a TypeScript-specific kind is on record. Changes: `engineer`, `engineer-high` preload.
   - SETTLED 2026-11-23. Settled: no (G3, no new skills).
15. After question 1 lands and a month of routing shows no miss, remove `scanActivationTriggers` and its seed list (about 20 lines plus a test)? Recommendation: decide then. Changes: `system-create-skill/scripts/validate-skill.ts`.
   - SETTLED 2026-11-23. Settled: the scan is removed or retuned in the same change as the description rule (G5, G6), not decided later.
16. Remove the Codex goal-tool branch from `performance-goal` (22 lines)? Recommendation: ask whether Codex goal tracking is used; it is pinned by `performance-goal-contract.test.ts:69-77`, and pstack gives no reason either way.
   - STILL OPEN: no ruling covers the Codex goal-tool branch.

Facts still unknown:
- The real size of the 62 "When to Activate" blocks (10 sampled, not counted) and whether any non-`.ts` check reads them.
- Whether the four `system-create-skill` workflows hold load-bearing text in the ranges proposed for cutting; read by heading only.
- What `optimize-prompt.md`, `create-prompt.md`, `eval-mode-sufficiency.md`, `plan-template.md`, `decision-contract.json`, `cruise`, `drive`, `prototype`, `design-implementation` and `tdd-cycle.md` say; no edit to those is proposed.
- Whether `config/prompts/critic-system.md` and `config/prompts/reviewer-system.md` (the GLM prompts) should get the same edits as `critic.md` and `reviewer.md`; the owner has not ruled. (Checked and settled in the 2026-11-23 sweep: the `check:agents` lint and the critic fixture do not pin the `critic` Output block.)
- Whether a prose pointer between invoked skills is followed; Qara's 0 of 4 probe covered agent-prompt pointers.
- The bodies of 11 pstack skills and 13 playbooks listed under Basis (frontmatter or sibling-document level only), and whether their lines alter any verdict above.
- Whether `.claude/hooks`-level or `scripts/` code other than `skill-validator-lib.ts` reads the body of a SKILL.md for a "When to Activate" heading (the `rg --hidden` search covered `*.ts`, `*.json`, `*.sh` only). Section D lists what the 2026-11-23 sweep did and did not compare.

## Sources

pstack, `cursor/plugins` at `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9` (read-only clone), paths under `pstack/`: `skills/*/SKILL.md` (58, `wc -l` for all; bodies as listed under Basis), `skills/poteto-mode/playbooks/*.md` (22, `wc -l` for all; nine in full).

Qara, `$HOME/qara`, 2026-11-23: `CLAUDE.md:25-60`; `.claude/skills/{triage-issue,performance-goal,handoff,show-me,system-create-skill,design-it-twice,tdd-qa,turbo,humaniser,retro,hook-authoring,prompting,code-style,rust-style,core}/SKILL.md`; `core/{skill-structure,testing-guide}.md`; `core/references/refactoring-signals.md`; `performance-goal/workflows/measure-and-improve.md`; `show-me/workflows/historical-why.md`; `system-create-skill/references/quality-checklist.md`; `system-create-skill/workflows/*` (headings); `improve-repo/workflows/lens-guardrail-ladder.md`; `.claude/agents/{critic,reviewer,verifier,probe-author}.md`; `.claude/commands/{sm,gm,pl,spotcheck}.md`; `.claude/context/{acts,worker-common,review-family}.md`; `tools/skill-validator/skill-validator-lib.ts:173-192`; `.claude/skills/system-create-skill/scripts/validate-skill.ts:102-123`; pin searches (`rg --hidden`) over `*.ts`, `*.json`, `*.sh` for the strings named in each doctrine.

tobogan: `DOCTRINES.md`; `pstack/{README,poteto-mode,principles,parallel-and-autonomous,verification,learning-and-explaining,writing-and-code-craft,packaging-and-automations}.md`; `noodle/skills.md:138-143` (NSKILL-17).
