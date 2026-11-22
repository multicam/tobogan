# PPROOF: Proving that work is right, as pstack does it and what Qara and csf should take from it

**Track:** pstack · **Type:** research · **Date:** 2026-11-23

**Question:** how do pstack's verification skills, formal verification skills, statechart tool, benchmark checklist, blast-radius skill, blinded eval playbook and evidence principles work, how much of each is enforced by code, and what is worth adding to Qara and csf?

**Scope.** In pstack (`pstack/` in the clone): `skills/create-verification-skill` and its `references/feature-map-example/`, `skills/maintain-verification-skill`, `skills/create-formal-verification-skill`, `skills/maintain-formal-verification-skill`, `skills/statechart` (SKILL.md, `references/render.md`, and the scripts), `skills/tdd`, `skills/blast-radius`, `skills/benchmark-checklist`, the principle skills `prove-it-works`, `explain-the-number`, `test-behavior-not-implementation`, `sequence-verifiable-units`, `fix-root-causes`, `attack-the-premise`, the playbooks `bug-fix`, `perf-issue`, `hillclimb`, `runtime-forensics`, `trace-forensics`, `visual-parity`, `eval`, `prototype` under `skills/poteto-mode/playbooks/`, and `docs/guide/06-verify-and-ship.md`. In the sibling plugin `cursor-team-kit`: `control-cli`, `control-ui`, `verify-this`, read where the pstack skills lean on them. Routing and the wrapper agent belong to PMODE, the principles in general to PPRIN, parallel and multi-model work to PPAR, memory and explanation to PLEARN, writing to PWRITE, packaging to PPACK. They appear here only where verification touches them.

**Sources.**
- pstack, in the `cursor/plugins` repo at commit `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9` (2026-11-21), shallow clone. Paths below are relative to the repo root. Read only; nothing was run, installed or fetched.
- Qara at `$HOME/qara`, read 2026-11-23: `.claude/skills/core/testing-guide.md`, `.claude/agents/{verifier,critic,reviewer,probe-author}.md`, `.claude/commands/{mutation-round,eval-mode-sufficiency,validate_plan,nightly-standing-audits}.md`, `.claude/skills/standing-audits/SKILL.md`, `.claude/skills/performance-goal/` (SKILL.md, `workflows/measure-and-improve.md`, `references/hosted-parallel-models.md`), `.claude/hooks/lib/tdd/` (file list and `tdd-green-decision.ts` header), `.claude/skills/tdd-qa/workflows/tdd-cycle.md` (headings), `.claude/skills-external/visual-explainer/commands/state-machine.md`, `.claude/context/routing-cheatsheet.md` (the `devtools-mcp` row), `.claude/skills/show-me/SKILL.md`.
- csf-build as installed in `/media/ssdev/tg-pro/cub/node_modules/csf-build`, read only, nothing run in cub: `shared/conventions/spec-coverage.md`, `shared/templates/drift-judge-brief.md`, `shared/templates/stage-briefs/qa.md`, `src/validator/`, `src/lanes/drain-lane-operation-types.ts`.
- tobogan: `inference/sweep/README.md`, `inference/sweep-results-full-20261122.md`, `inference/inference-optimisation-skill.md`, `matters/roles-and-matter-folders.md`, `matters/policy.md`, `matters/v2-folder-walls.md`. Related: NMODE and NSKILL in `noodle/` for the same author's earlier project.

"Verified" means read in the clone or in the Qara, csf or tobogan files, with `path:line`. Every judgement about fit, and every analogy, is Unverified until tested. Nothing is Tested: nothing was run. The pstack skills are prompts, so "what the skill does" means "what it tells an agent to do". The only executable code in this feature is the statechart scripts.

**Summary.**
- Removals first (owner's steer, 2026-11-23: replace code with workflows and doctrine). In this area about 4,100 lines of Qara code could shrink: roughly 2,000 of the TDD state machinery (`.claude/hooks/lib/tdd/`, about 2,715 lines, advisory by its own contract), about 1,500 of the standing-audits runner (about 2,030 lines) and about 570 of the skill-sufficiency scoring scripts (874 lines). What must stay code: the mutation-lane merge path check (94 lines), the verifier's baseline comparison, csf's spec-coverage check (122) and the drain validator's lane and landing code (1,371). pstack's own verification prose has no enforcement at all except `statechart`, so a replacement moves a guarantee into a request; see "What this could replace".
- Verification in pstack is almost all prose. The one real program is `statechart`: it runs a TLA+ model checker (TLC 1.7.4, checksum-pinned) and turns the result into a Mermaid chart and a report. Every other skill, including the formal-verification ones, is an instruction to an agent with no script or check behind it.
- The generated "verify skill" is a project-local skill with Launch, Doctor, Drive, Evidence, Cleanup and Helpers sections, plus a feature map, one file per user feature with four fixed headings. The generator must run it once before handover. The maintain skill detects drift by reading source one feature at a time and then driving every feature live; it keeps no commit pointer or hash. The formal-verification pair does keep a sync commit and diffs against it.
- The formal skills name TLA+ as the default model checker and otherwise stay generic ("a proof assistant, an SMT-backed verifier, or another tool", generated inputs when no verifier exists). Their rule for telling drift from a bug is the best text in the stack: replay the counterexample against the real code; a step that cannot happen means the model is wrong.
- The benchmark checklist has seven questions, and four of them (name the limiter, check the physical limit with arithmetic, measure the end-to-end path, confirm the work happened in the timed region) are missing from Qara's `performance-goal`. `performance-goal` is stronger on everything else: it qualifies the measuring device with A/A runs and a known perturbation and has stop circuits. A small borrow fits.
- The blinded eval playbook is a conventions list plus a judge on another model family. Qara has no equivalent for skill and prompt changes; its closest are the sufficiency eval and `probe-author`. tobogan's own sweep is stronger than the playbook where it can be, because it uses hidden tests as an oracle instead of a judge.
- A per-project generated verify skill is not worth building for cub now: csf already has a spec-to-gated-test mapping (`covers:` lines, scenario triplets). Two small conventions from the feature-map contract are worth copying. Formal verification is not worth running on the drain lane machine or the matters permission model as a standing practice. One trial is a decision for the owner, and the matters policy is better served by a plain exhaustive table test.

## Doctrines

**PPROOF-1. Treat the generated verify skill as a prose contract with one proof step, not as tooling.**
`/create-verification-skill` interviews the repository (not the user), writes `.cursor/skills/verify-<app>/SKILL.md` with named sections, seeds a feature map, and must run the result once before handover. Nothing checks the output afterwards.
- Why: copying it as machinery would import a guarantee that exists only as an instruction to the generating agent. A draft that was never run is called a draft by the skill itself.
- Evidence:
  - Frontmatter: `name: create-verification-skill`, `disable-model-invocation: true`, trigger text "Use for /create-verification-skill, 'make a control skill for this repo', or when a project has no scripted way to prove UI/CLI/service behavior" (`pstack/skills/create-verification-skill/SKILL.md:2-4`).
  - Step 1 interviews five things from the code: Surface, Run, Drive, Observe, Isolate (`:11-19`). Existing harnesses come before generic recipes (`:17`). If the checkout does not build, fix that first; an irrelevant missing asset may be created as marked scaffolding and removed in cleanup (`:21`).
  - Step 2 writes six sections: Launch (reach a usable state from an empty data dir; "Ready means usable, not just that a process answers"), Doctor (one read-only check), Drive (real selectors; stable handles over coordinates), Evidence, Cleanup ("Never kill by process name"; cleanup removes instances, never the evidence), Helpers ("A helper the reader has to reverse-engineer is not a helper") (`:27-32`).
  - Evidence standard in the skill: exercise the real user path, not internal setters; capture action and result; verify side effects; mocks only at an existing production boundary; check what a dry-run really skips "by observing (files, network, git refs) rather than trusting its name" (`:30`).
  - Step 4: run launch, doctor, drive ONE feature, capture evidence, clean up, then confirm the evidence still exists. "A generated skill that was never executed is a draft, not a deliverable." If proved in a stand-in, list every setup step the stand-in did that the target will not (`:38-40`).
  - What is enforced: nothing. No script, schema or check validates the generated skill. The Qara-side parallel would be a lint; pstack has none.
  - Depends on Cursor: the output path `.cursor/skills/`; the guide shows `/poteto-mode ... use /verify-<app>` (`pstack/docs/guide/06-verify-and-ship.md:63-71`). The feature-map example drives a made-up CLI `control-notes` (`pstack/skills/create-verification-skill/references/feature-map-example/create-note.md:18-32`), so the "control" skill is itself something the generator is meant to create per project, on top of `cursor-team-kit`'s generic `control-ui` and `control-cli`.
- Basis: Verified
- Code: none (prose only). Gap: no lint of a generated skill.

**PPROOF-2. The feature map is a four-heading user-point-of-view recipe file per feature, and its drift check is a procedure, not a mechanism.**
Each feature file has an H1, one paragraph, then exactly four H2s in order: Sub-features, How to get to it (user POV), Driving it with `<harness>`, Gotchas. The README index carries baseline preconditions, driving conventions and proof and skip reporting rules.
- Why: the contract makes a feature file readable cold by an agent, and the skip rule keeps "verified" honest. The drift check relies on re-reading and re-driving, so it costs a full live pass every time and catches only what the pass happens to exercise.
- Evidence:
  - Contract text: "Each feature file starts with an H1 title and one paragraph... exactly four H2 sections in this order"; "Keep implementation details out of the map" (`pstack/skills/create-verification-skill/references/feature-map-example/README.md:32-39`; the README is the second file in the example directory).
  - Real example, `search.md`: sub-feature IDs (`search-open`, `search-match`, ...), entry points (toolbar button, `/` key, CLI), and steps that pair an action with an exact command and an observable result, such as `control-notes browser fill --role searchbox --name "Search notes" --value "volcano"` giving "A status named `No matching notes` appears after search completes" (`.../search.md:14-23`). Gotchas include "Pressing `/` while the editor or searchbox has focus inserts text instead of opening search" and "Wait for the results list or empty status, not a fixed sleep".
  - Proof rules in the index: "Capture the user action and the resulting state, not only the final screen"; mutation proof includes "a read-only second view of the stored value"; "Do not report a skipped entry point as verified through a different path" (`.../README.md:22-30`).
  - Seeding: "aim for the top 3-5 to start, from routes, commands, menus, or docs". If seed data lacks a precondition, the journey reports a failure and the reason goes in Gotchas: "Never weaken the journey to make it pass" (`pstack/skills/create-verification-skill/SKILL.md:36`).
  - How the maintain skill detects drift: index hygiene (missing, extra, duplicate or dead entries); a source wave of one read-only subagent per feature file, each returning "feature summary / source entry points / likely drift or none / one recipe"; a reconcile step that "spot-check[s] cited drift; don't re-prove clean claims" and sweeps recent churn for unmapped surfaces ("require a concrete source path before calling one missing"); then a live pass, "Required even when source looks clean", that exercises every feature at least once (`pstack/skills/maintain-verification-skill/SKILL.md:24-32`, steps 0-4 of the Pass section).
  - What it does not have: no recorded commit, content hash or file list per feature, so "what changed since the last pass" is found by "recent churn" judgement. The formal pair does have one (PPROOF-6).
- Basis: Verified
- Code: none (prose). Gap: no machine check that a feature file has the four headings.

**PPROOF-3. Keep the maintain skill's three outcomes and its edit boundary, and note that triage depends on the agent's judgement.**
The pass ends as `clean`, `changed` (one PR of proven corrections) or `blocked`. It may edit only the verification skill's own directory and never product code. Triage separates doc drift, harness gap and product gap.
- Why: this prevents the usual failure of a maintenance agent quietly editing the docs to match a broken app. The split depends on the agent deciding which of three causes applies, with no tool support.
- Evidence:
  - Outcomes and "Edit scope": "a behavior the map describes that the app no longer does is either doc drift (fix the map) or a product regression (report it, don't paper over it in docs)" (`pstack/skills/maintain-verification-skill/SKILL.md:10-19`).
  - Three live-pass invariants: never drive an instance not health-checked since it last did something surprising; evidence survives every cleanup, "checked at its named location, not assumed"; nothing a drive started outlives it. A doctor failure caused by skill drift is fixed and retried once before `blocked`. A feature is `verified-unreachable` only with the concrete prerequisite and the route attempted; "if the map omits that prerequisite, that's drift" (`:32`).
  - Triage rule: wrong user-POV description is doc drift; working behavior the harness cannot drive is a harness gap; "App behavior that's actually broken → product gap; record it for the user, keep it out of this PR" (`:34`).
  - Cadence: the guide says run it "at least once a day, ideally from a scheduled automation" (`pstack/docs/guide/06-verify-and-ship.md:88`). The skill itself says to suggest a cadence "only if they ask" (`pstack/skills/create-verification-skill/SKILL.md:44`), a small contradiction.
  - Run notes are "scratch ... don't commit them" (`pstack/skills/maintain-verification-skill/SKILL.md:39`), so there is no ledger of past passes.
- Basis: Verified
- Code: none. Qara parallel: `.claude/skills/standing-audits/SKILL.md:46-48` decides overdue audits with deterministic code and "fails closed when a probe breaks"; the pstack maintain skill has the opposite design (an agent decides).

**PPROOF-4. Do not generate a per-project verify skill with a feature map for cub now; copy two conventions from it into csf's existing spec-coverage and scenario rules.**
csf already maps spec'd cells to gated tests with `covers:` lines and a scenario triplet (`intent.md`, `probe.js`, `oracle.yaml`). The feature map answers a different question (what a user can do and how to drive it), and its value depends on a running, drivable product surface, which cub's current state may or may not offer.
- Why: a second mapping layer beside csf's would have to be kept in step by a daily maintain pass that costs a full live drive. The two conventions, the skip rule and the fixed-shape entry, cost one paragraph each.
- Evidence:
  - csf's mapping: "The surface comes from the specs. Tests are derived from what the specs require, never from the code"; a cell counts as covered only when the file exists, something runs it, it declares `covers: <cell-id>`, and for a scenario an oracle key carries `cell:` (`csf-build/shared/conventions/spec-coverage.md:9,29-42`). It is a parallel track and "never gates the pipeline" (`:12-17`). The conservative selection rule, "when in doubt, the ref does not count" (`:56`), is the same stance as pstack's skip rule.
  - csf's drift detector is a blind judge with no tools, fed spec, build and ruling hints, classifying each divergence as `spec-stale`, `build-gap`, `ruled`, `spec-conflict`, `unverifiable` or `dismiss`, with a `ruled` verdict required to cite a given `file:line` (`csf-build/shared/templates/drift-judge-brief.md:1-30`). That is a stricter, checkable analogue of the maintain skill's source wave.
  - The drain-end validator already runs the spec-coverage command among its tools (`csf-build/src/validator/validator-pack.ts:42-48`, the `validatorToolCommands` block).
  - What I could not establish: whether cub has a UI or CLI surface that a drive harness would target. I did not read cub's product code and ran nothing there. The judgement that the surface does not justify a verify skill is Unverified.
  - Convention 1 (adopt): a skipped entry point is reported as unreached with the attempted command and unmet precondition, never as "verified through a different path" (`.../feature-map-example/README.md:28-30`). csf's `scenario-missing` verdict says the same thing in its own words, so this is a wording check on csf's QA stage brief (`csf-build/shared/templates/stage-briefs/qa.md`, "do not skip a configured gate silently"), not a new rule.
  - Convention 2 (adopt for new scenarios only): one-paragraph user-visible behaviour, then a fixed set of headings, so a scenario can be read cold. csf's triplet already has `intent.md`; the gain is small.
- Basis: Verified (csf and pstack text); Unverified (the fit judgement and cub's surface)
- Code: Gap: none needed beyond a wording check in csf's QA brief.

**PPROOF-5. Take the formal skills' rule for choosing a property, and note they name one tool and stay generic about the rest.**
The property is "a promise the code makes, where a break harms users and tests rarely reach the case that breaks it", chosen as the strongest such target, "not the one that is easiest to verify". The tool is chosen by the question.
- Why: the choice rule is cheap to apply and keeps the exercise away from easy, low-value targets. The tool guidance is thin: only TLA+ is named, and "a proof assistant, an SMT-backed verifier" stay unnamed, so an agent must supply the tools itself.
- Evidence:
  - Target rule: `pstack/skills/create-formal-verification-skill/SKILL.md:12-14` ("A good target is a promise the code makes..."). Triggers: "concurrency, retries, state machines, parsers, or unsafe code" (`:3`).
  - Tool rule: "Whether events can happen in a bad order usually suits a model checker over a small model of the design, and TLA+ is the default for that in any language. Whether the code itself behaves for every input, as with memory safety, overflow, or a data-structure invariant, usually suits a verifier that runs on the code. If no verifier runs on this language, say so, and test the real code with generated inputs, not a hand model of the function. A property that must hold at every size... can need a proof." (`:18`). So the named options are: model checker (TLA+), a verifier that runs on the code (unnamed), generated-input tests (that is, property-based testing, unnamed), proof assistants and SMT-backed verifiers (named as classes only). "Prefer a tool that the repo's developers can install and run, and tell the user why you chose it."
  - The only concrete tools anywhere in the stack are in `statechart`: TLC 1.7.4 and Java Temurin 25 through `mise`, and Pele 1.9.0 for rendering (PPROOF-8).
  - Guide examples: "the job lease and retry logic. a job must never run twice at once" and "the retry queue. a message must never be delivered twice" (`pstack/docs/guide/06-verify-and-ship.md:107`, `pstack/docs/guide/10-recipes-and-pitfalls.md:90`).
  - No script picks, scores or runs a target. Whether an agent can reliably judge "tests rarely reach the case" is untested.
- Basis: Verified (text); Unverified (that an agent applies it well)
- Code: none.

**PPROOF-6. Adopt the formal skill's quality bar for any check we generate: show it failing, keep findings as findings, record the covered code and a sync commit.**
Six properties of a good verification: true to the code, able to fail, findings stay findings, honest about scope, readable without the tool, cheap to rerun, plus a recorded coverage list and sync commit.
- Why: it targets the specific failure of a check that passes while describing code that no longer exists. The sync commit is the only drift detector in the stack that does not need a full re-read.
- Evidence:
  - "A check that you have never seen fail proves nothing. Show each property failing on a broken variant of the code it guards, such as a removed check or a reordered step." "Do not weaken the property or the model until it passes, and do not change product code unless the user asks." (`pstack/skills/create-formal-verification-skill/SKILL.md:22-24`).
  - "Record which files and functions each check covers, and the commit at which you last confirmed that the verification describes them... tell the next agent to move the sync commit forward only after it confirms that the verification describes the code at the new commit" (`:28,30`).
  - The generator proves the generated skill "on a scratch change that breaks the property in the real code. It must catch the break. Then drop the scratch change and confirm that the check is back where it started" (`:36`).
  - Reference to statechart by name only: "Its commands, options, and file paths change between releases and machines, so copy none of them into the generated skill" (`:34`). This is a good rule against copied command lines going stale.
  - The Qara parallel is the `verifier` agent's mutation drills ("A gate never observed to fail is not a gate", `.claude/agents/verifier.md:81-86`), which also carry a recovery protocol (copy before mutating, verify the diff line count after restore, never `git checkout --`; `:91-102`). The pstack text says "drop the scratch change" with no such protocol; Qara is ahead there.
- Basis: Verified
- Code: none in pstack. Qara: `.claude/agents/verifier.md:81-114`.

**PPROOF-7. Copy the drift-versus-bug procedure of `/maintain-formal-verification-skill` as the rule for any check that describes code.**
Run the check unchanged first. Classify each change to covered code into four kinds. Update the model from the code, never from the result. On failure, replay the counterexample against the real code: a step that cannot happen means the verification is wrong; if every step can happen it is a bug.
- Why: it gives an agent a decision it can make from evidence for the question we asked. It also names the dangerous case: a stale check that keeps passing "looks like a proof".
- Evidence:
  - Opening premise: "A formal check proves a property of what it describes. When the code changes and the verification does not, the check can keep passing while it describes code that no longer exists. That pass is the dangerous case" (`pstack/skills/maintain-formal-verification-skill/SKILL.md:7`).
  - Outcomes per check: in sync, updated, bug, blocked. "A check can be both updated and bug" (`:11-18`). Edit scope: only the verification; never product code; never weaken property or model (`:22`).
  - Step 1 find checks by what they do ("A verify skill has no fixed name"); if no sync commit is recorded, use the last commit that changed the verification files, and say so (`:28`). Step 2 run as is ("A failure here can be drift or a bug. Do not decide which until step 5", `:30`).
  - Step 3 reads every change from the sync commit and also looks for moved code and new code writing the guarded state. Four classes: no effect (check against the model, "not against the commit message"); the verification no longer describes the code; the promise changed on purpose (cite evidence: doc comment, tests, changelog, commit message); the promise may be broken (`:32-36`).
  - Step 4: "Write the update from the code before you rerun, and do not shape it by what makes the check pass"; property changes only for an on-purpose promise change, with old wording, new wording and evidence recorded; any reduced bound is reported (`:38`).
  - Step 5: after a pass, break the new code the way the property guards against and confirm the check catches it. After a fail, replay the counterexample step by step against the real code; "If a step cannot happen in the code, the verification is wrong"; if all can, "Name the commit that introduced it" and tell the counterexample "as a sequence of steps in the code's own words" with the harm in one sentence (`:40-42`).
  - Report: "For a check that passed before you updated it and fails after, say that the old pass was on a stale description" (`:56-58`). Verification updates go in a change separate from any product fix.
  - Weakness: the classification of a change as "no effect" or "promise changed on purpose" is judgement. A reduced bound or a new unmodelled path can be missed without any tool noticing.
- Basis: Verified (text); Unverified (reliability)
- Code: none. Qara has no formal-verification skill (`rg` for TLA+, Alloy and model-checking terms over `.claude`, `decisions`, `docs` finds only one example string in `skills/show-me/SKILL.md:137` and one unrelated external-skill reference).

**PPROOF-8. Statechart is the only executable part of the stack: it runs TLC under a pinned toolchain and writes a report and a Mermaid chart, and it needs a network and a JVM on first run.**
`statechart SPEC.tla [--config FILE] [--view FILE] [--out DIR]` checks a TLA+ spec, draws the state graph, and reports the shortest path to each broken rule.
- Why: it explains what the one concrete artifact does and where the risk is. Adopting it means installing Java and a downloaded jar, which the owner's 2026-11-23 frame excludes.
- Evidence:
  - Entry: `scripts/statechart` is a POSIX shell script that picks Node 22.18 to 22.x or 23.6+, then Bun 1.1.5+, then Deno 2+, and otherwise exits 127 (`pstack/skills/statechart/scripts/statechart`, whole file). `statechart.ts` parses arguments, refuses a non-empty `--out`, spawns a detached worker and a detached janitor, and writes the output only if the worker exits 0 or 1 and a `done` marker exists (`statechart.ts:35-165`). Exit codes: 0 every rule holds, 1 a rule breaks, 2 error, 130 and 143 on SIGINT and SIGTERM (`:10-24`).
  - Cleanup design: the worker runs in its own process group and the janitor kills the group and removes staging and temp folders when the parent dies (`statechart.ts:101-133`, `janitor.ts:1-13`, `kill.ts:1-15`). Output is staged in a hidden folder and renamed into place, so a killed run writes nothing ("so the command wrote nothing").
  - Toolchain: `TLC_TOOL = "http:tla2tools[url=https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar,checksum=sha256:936a2620...e050e88]@1.7.4"` and `JAVA_TOOL = "java@temurin-25"`, installed through `mise` if absent, or taken from `TLA2TOOLS` and `JAVA` environment variables (`run.ts:67-69,186-206`). SKILL.md says "The first run installs TLC and Java with mise and needs the network" (`pstack/skills/statechart/SKILL.md:15`).
  - TLC flags pinned: `-workers 1 -fp 0 -lncheck final` (`run.ts:70`), `-tool`, `-dump`, `-deadlock` (`:359-361,435-439`). Exit class mapping: TLC status 11, 12 or 13 means a rule broke (`:208-209`).
  - Pipeline: `pipeline.ts` builds a state graph, finds bugs and shortest paths, labels states through the view module, draws regions, writes `chart.mmd`, `report.md`, `tlc.out` and `tlc-RULE.out` (`pipeline.ts:222-241`). Passes include `reach`, `label`, `lift`, `loop-check`, `region-check`, `regions` (file list of `scripts/passes/`).
  - Limits stated: chart budget 500 states, above which only bug paths are drawn and, with no bug, no `chart.mmd` (`ir.ts:139`, SKILL.md:72); after the first break each rerun stops at 100,000 distinct states (`ir.ts:137`, SKILL.md:69); "TLC goes past a state that breaks a rule, so the chart shows the states after a bug" (SKILL.md:63).
  - The view module is a user-written TypeScript file loaded with a dynamic `import()` (`worker.ts:7-12`), so it executes with the caller's rights. SKILL.md says to work "in a scratch folder outside the repo" (`:11`), so the module is the agent's own file.
  - Rendering uses npm `pele@1.9.0`, installed "once, outside the repo", options `{ limit: 1_000_000, outputLimit: 8_000_000, maxEdges: 10_000 }` (`pstack/skills/statechart/references/render.md:3`); "Do not use a different renderer unless the user asks".
  - Tests: `scripts/test/` holds `cli.test.ts` (1344 lines), `pipeline.test.ts`, `render.test.ts`, a corpus of small `.tla` models, and a `fast-check` dev dependency (`package.json`). I did not read the tests in full.
  - Writing rules are prose: invariants for each rule the reader agrees; `Next` as a disjunction so steps get names; a state with no step out breaks `NoDeadlock` and needs an explicit `Done` action; labels in the reader's words; a hand-off that lists which steps the chart hides (SKILL.md:23-26,49-55,78-82).
- Basis: Verified
- Code: `pstack/skills/statechart/scripts/` (about 1,400 lines of source excluding tests: `ir.ts` 547, `run.ts` 500, `statechart.ts` 165, `pipeline.ts` 76, `worker.ts` 35 plus backends, frontends and passes). Not run.

**PPROOF-9. Do not port statechart; Qara's `state-machine` command already covers the useful half and checks the real code instead of a copy.**
Qara's `/state-machine` imports the repo's own reducer or step function, rules are agreed in chat, each broken rule is replayed against the real code, and a path that does not reproduce is a model bug. pstack models in TLA+ and replays afterwards.
- Why: the model-versus-code gap is the main weakness of any hand model, and statechart's own text knows it ("think that the model is wrong until you show that it is not"). Qara's command avoids the gap where a pure step function exists, at the price of less reach (no unbounded concurrency, no interleavings the code does not itself generate).
- Evidence:
  - Qara: "Model: import the step from the repo. Copy a step as a hand model... only when it does I/O, and say which steps are copied." "Prove each broken rule against the real code: replay its path... A path that does not reproduce is a bug in the model: fix the model, never the rule." (`.claude/skills-external/visual-explainer/commands/state-machine.md:9-12`, the 13-line file).
  - pstack: "When the model describes code, replay each bug path against the real code, as a test or a live repro, one step for each action. If a bug does not occur, think that the model is wrong until you show that it is not." (`pstack/skills/statechart/SKILL.md:81`, hand-off section).
  - The tools differ in kind: pstack's checker explores all interleavings of the model's actions; Qara's walks the transitions of real code with the events the code accepts. The first finds races that the real step function never sees as separate events; the second cannot.
  - The guide's reason for the chart is an audience one: "The PM or designer who owns the behavior needs to see it in their terms" (`pstack/docs/guide/06-verify-and-ship.md:120`). That is the part not covered by Qara's command, which draws from code for the maintainer.
- Basis: Verified (both texts); Unverified (the conclusion on fit)
- Code: Qara `.claude/skills-external/visual-explainer/commands/state-machine.md`.

**PPROOF-10. Keep the TDD skill's reporting rule and its permission to skip, and treat pstack's tdd as far behind Qara's `tdd-qa` machinery.**
`/tdd` is explicit-ask only, writes the failing test first, runs it to confirm the failure is for the intended reason, then fixes. It prefers no new test over a bad one. The final reply must name the failing-before evidence.
- Why: the skill adds one useful cheap rule and one tension. The rule: a failing-before run named in the reply. The tension: the bug-fix playbook wants the repro to land before the fix in git history, while `/tdd` lets the agent skip the test when it is expensive.
- Evidence:
  - Frontmatter: "Use only when the user explicitly asks for TDD, a failing test, or a regression test, OR when the bug has an obvious cheap local test target. Skip when the test path is unclear, expensive, integration-heavy, or not requested." `disable-model-invocation: true` (`pstack/skills/tdd/SKILL.md:3-4`).
  - Steps 1-6: understand, narrowest executable check, failing test first, run before fixing ("Confirm it fails for the intended reason"), minimal fix, rerun (`:15-20`). "Prefer no new test over a bad test. A bad test is one that mostly tests mocks, encodes current implementation details, depends on timing or unrelated global state..." (`:26`).
  - Final response: "Name the failing-before test or executable check and the failure it produced. Name the passing-after test run... If failing-before evidence could not be demonstrated, state why and describe the closest regression check used instead" (`:38-42`).
  - Bug-fix playbook step 5: "Stage the commits so the failing repro lands before the fix in git history. See the tdd skill... Skip it when the test would be expensive" and "This is the canonical sequence-verifiable-units principle skill" (`pstack/skills/poteto-mode/playbooks/bug-fix.md:11-12`).
  - Qara: `tdd-state.ts` arms RED, tracks phase, records runs, and a green guard decides on logged evidence (`.claude/hooks/lib/tdd/tdd-green-decision.ts`, `tdd-red-run-verdict.ts`, `phase-determinism.ts`, about 65 files with tests). The spec says the phase logging is advisory and does not assert a test result (the `engineer` agent's TDD contract in the task prompt). `tdd-cycle.md` adds a mutation bonus (`.claude/skills/tdd-qa/workflows/tdd-cycle.md:94`). `testing-guide.md:82` says "A new behavior starts with a failing test" with a ladder of stand-in-free test forms. `mutation-round` runs mutation-fix rounds with a hard path refusal (`.claude/commands/mutation-round.md:22-39`).
  - Nothing in pstack records or checks that the failing run happened. Qara records it and still treats it as advisory.
- Basis: Verified
- Code: pstack none. Qara `.claude/hooks/lib/tdd/`. Nothing to borrow.

**PPROOF-11. Take blast-radius's five-rung certainty ladder and its "one fact it is safe because of" as an output field for Qara's `critic` and `reviewer`.**
The skill finds the one fact on which the whole safety judgement rests, rates it on a ladder from "You said so" to "You reproduced it in the running app", and proves it by running real code. A fact that could not be proven is written `unproven`.
- Why: Qara's `critic` flags "≥3 importers" as high blast radius by grep, which is the check blast-radius says is trivial ("The agent can grep those in a second. The job is the breakage grep won't show you"). The ladder makes a claim's strength visible at a glance.
- Evidence:
  - "A blast-radius writeup that sounds right is worthless. It reads as convincing whether or not it's true. So don't hand back the writeup. Find the one or two facts the whole thing depends on and prove them by running code." (`pstack/skills/blast-radius/SKILL.md:15`).
  - The ladder, "get it as far down this list as is cheap, and say where it stopped": 1 You said so (worthless); 2 You pointed at the line (a real `file:line`, or the library's own source); 3 You showed the bad case can't happen (walked step by step); 4 You ran it (a script or test that calls the real code and fails loud if you're wrong); 5 You reproduced it in the running app (`:21-27`).
  - Steps: read the change including "the part the diff doesn't spell out"; find the one fact ("Most changes that look risky are safe because of a single fact, like 'this call only drops already-dead cache entries'"); look where grep stops (library source, pinned version and local patch, "microtasks, unmount and teardown", JSON an API returns, a DB column, wire format, a feature flag, code three hops downstream); give each risk a chance and a cost, list the cleared ones separately, "never make up a caller or an API"; prove the fact with a script and "paste what happened"; for a wide change run an `arena` (several models, merged) (`:31-38`).
  - Hand-back: What it does, The one fact, Risks, Cleared, Before you merge (`:40-43`).
  - Qara: `critic` Risk check: "Grep imports of each modified file; `≥3 importers` → high blast radius" (`.claude/agents/critic.md:19-22` region, check 4); `reviewer` is a general reviewer with severity levels (`.claude/agents/reviewer.md`). Neither has a "how sure" field. The `verifier` does require evidence per criterion, max 500 characters (`.claude/agents/verifier.md:17`).
  - One weakness: step 6's "arena" and `unslop` are pstack skills (PMODE, PWRITE), and the 5th rung assumes a drivable app (PPROOF-1).
- Basis: Verified (text); Unverified (the borrow)
- Code: Gap: `critic`/`reviewer` output has no certainty field. A borrow would add one line to each agent's Output block.

**PPROOF-12. Use the benchmark checklist's seven questions as written, and add four of them to `performance-goal`.**
Before reporting a perf number: write the claim; read the measurement script; check load average and cores; then answer seven questions with evidence from a run.
- Why: four questions guard against failures that `performance-goal` does not mention at all: an unnamed limiter, a result past a physical limit, a micro result that does not matter end to end, and work that never ran inside the timed region.
- Evidence: the items, in full (`pstack/skills/benchmark-checklist/SKILL.md:19-27`):
  1. **Why not double?** Name the limiter from CPU per process, a runtime profiler (`node --cpu-prof`, `py-spy`, `perf`), I/O wait, syscall counts. Profile "in a run you do not report, because profilers and tracers slow the work down". Watch the load generator: if it saturates first you measured the generator. "If a change did not move the number, the limiter explains why."
  2. **Was it tuned?** Every side as production runs it: release builds, flags, batching, pools, warm or cold caches, same versions and data. "If one side runs on defaults, you compared configurations, not implementations." If you cannot tune it, do not pick a winner. Narrowing the claim does not fix this when a user is choosing what to adopt.
  3. **Did it break limits?** Arithmetic against disk and network bandwidth and core count. "Removing a piece that takes 10% of the run can make the run at most about 11% faster." A result past a limit measured a cache, a no-op or a bug.
  4. **Did it error?** Count failures and non-success responses, check outputs are correct, "Rejections are often fast, and timeouts and retries are slow."
  5. **Does it reproduce?** At least 5 runs per side, alternating A, B, A, B; median and range; "A gap smaller than the run-to-run variation is no measurable difference"; a rank-sum test or the harness's own statistics when close.
  6. **Does it matter?** Measure the end-to-end path a user waits on with realistic sizes and concurrency; report the micro result as a share of the whole.
  7. **Did it even happen?** The request reached the server, the rows were written, the bytes were read, and the code used the result; "Lazy code (generators nobody iterates, promises nobody awaits, results the JIT can discard) and timeouts produce numbers for work that never happened."
  - Before and after: a ballpark the user asked for needs one run plus questions 4 and 7, labelled as one run (`:11`); "A choice between options is never a ballpark."
  - Report: lead with the verdict (faster, slower, no measurable difference, inconclusive), number with unit, run count, range and limiter; inconclusive when no limiter can be named, a side ran untuned, or questions 4 and 7 could not be checked; "Keep a PR body to one primary number" (`:29-34`).
  - Wiring: perf-issue and hillclimb playbooks call it ("Vet the baseline, and each later number", "Vet the harness with the benchmark-checklist skill before you freeze it, and make it print its error count and a count of the work done") (`pstack/skills/poteto-mode/playbooks/perf-issue.md:5`, `hillclimb.md:8`). `explain-the-number` sends perf numbers here (`pstack/skills/principle-explain-the-number/SKILL.md:12`).
  - Qara's `performance-goal` has none of the limiter, limits arithmetic, end-to-end, or did-it-happen language: a search of the skill for "limiter", "Amdahl", "timed region", "end-to-end", "bandwidth" finds only the word "bottleneck" in the hypothesis step (`.claude/skills/performance-goal/workflows/measure-and-improve.md:57,94`). It does have a "suspiciously cheap or fast run gets an output check" guard for hosted fan-outs (`references/hosted-parallel-models.md:22-26`), which is question 7 in one narrow case, and "Correctness runs first" with mandatory guards (`workflows/measure-and-improve.md:26-27`), which is question 4.
  - Weak spots in the checklist: "at least 5 runs" is a floor with no method for choosing N from the variance; "a rank-sum test" is named without a significance rule; question 2 can make a result unobtainable ("do not pick a winner from that run"), which is a sound result but forces rework.
- Basis: Verified (text); Unverified (the borrow)
- Code: Gap: add questions 1, 3, 6, 7 to `.claude/skills/performance-goal/workflows/measure-and-improve.md` (about 10 lines, under "Qualify discrimination" or "Compare the checkpoint").

**PPROOF-13. Keep `performance-goal` as the measurement standard; the checklist is weaker on qualifying the instrument.**
pstack asks "does it reproduce" by 5 alternating runs. Qara qualifies the device itself first.
- Why: a benchmark that cannot see a known effect gives a clean-looking number with no meaning. Only Qara tests for that.
- Evidence:
  - Qara: A/A runs establish natural dispersion, cache effects and drift; a "reversible known perturbation's direction and minimum magnitude" is predeclared and must exceed "the frozen decision threshold and derived noise margin"; the perturbation is then removed and return to baseline confirmed; "Stop if the evaluator is constant, unstable, drifting, cache-sensitive beyond the contract, directionally wrong, or unable to distinguish the known effect" (`.claude/skills/performance-goal/workflows/measure-and-improve.md:33-43`).
  - Stop circuits: maximum hypotheses, retries, consecutive non-improving hypotheses, identical failures, run, wall-time and spend caps; "Never reset a circuit merely to produce another brief" (`:22-24,77-79`).
  - Rollback discipline: reverse only optimization-owned edits, no `git reset`, `git checkout`, broad clean (`:81-83`).
  - pstack equivalent: hillclimb says "Build the measurement harness, prove its sensitivity, then freeze it", "Run contrasting realistic workloads and confirm the target case reproduces the symptom while easier cases separate as expected" (`pstack/skills/poteto-mode/playbooks/hillclimb.md:8`). That is a sensitivity check by contrasting workloads, weaker than a known perturbation.
  - One pstack idea Qara lacks: a stop predicate that "pairs a target with a floor on attempts so a lucky early win can't end the run (the example 'at least 50% better than baseline and at least 10 iterations')" (`hillclimb.md:8`). Qara's circuits only stop work early; none requires a minimum number of attempts.
  - Another: a gitignored `decision.tsv` with one row per attempt (id, hypothesis, change, before, after, delta, tests, verdict, note), read before each attempt (`hillclimb.md:9`). Qara's `hosted-parallel-models.md:28-32` has a failure log in prose; the tsv is the structured form.
  - tobogan's sweep also has the pieces `performance-goal` lacks for agent runs (PPROOF-14).
- Basis: Verified
- Code: nothing to change except the borrows in PPROOF-12 and the optional attempt floor.

**PPROOF-14. Use the eval playbook's blinding rules only where there is no hidden-test oracle, and add them to Qara as a short reference, because Qara has no blinded eval for skill or prompt changes.**
The playbook frames a variant and a rubric, builds sanitized environments, spawns N candidates on different models with one organic prompt, runs one blinded judge from another model family, checks which files each candidate really opened, and reads every output itself.
- Why: a model told it is being tested behaves differently, and a judge who knows which model wrote an output favours some. The rules cost nothing to apply. They do not give a pass rate or a confidence figure, so they are weaker than an oracle where one exists.
- Evidence:
  - Non-negotiables: no `eval`, `test`, `judge`, `experiment`, `rubric`, `score`, `compare`, `benchmark`, `candidate`, `arena` in any directory, file or prompt the candidate sees; the prompt "looks like an organic user request. State the goal, not the meta"; no chain-eliciting cues ("Don't ask the candidate to list which skills, principles, or files they applied"); sanitized slug names; do not tell candidates that others exist; the judge sees outputs "by sanitized label only, never by model name"; two variants are scored by one judge in one pass on one scale (`pstack/skills/poteto-mode/playbooks/eval.md:5-11`).
  - Steps: 1 Frame (rubric of 3-6 criteria "for the judge only"); 2 sanitized environments with planted organic context; 3 one organic prompt; 4 N parallel candidates on different models "per the arena skill's Phase B"; 5 one blinded judge on a different family (arena Phase C); 6 "Verify the chain from transcripts, not self-report": read each candidate's local transcript under the workspace's `agent-transcripts/` directory, "Do not glob across `~/.cursor/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects"; 7 read every output yourself and compare to the judge ("Disagreement means a model is biased or the rubric is ambiguous") (`:15-23`).
  - Reply: variant, rubric, per-candidate notes, judge's verdict, synthesis, and "a recommendation for whether to promote the variant" (`:25`).
  - Arena Phase C says the judge "is never from the parent's vendor" (`pstack/skills/arena/SKILL.md`, Phase C).
  - Weaknesses: banned-word lists cannot be fully honoured when the task is itself about tests or evaluation; N is "N parallel candidates" with no minimum and no variance estimate, so one run per variant is the default; the judge is a model; the transcript check depends on a Cursor path; there is no regression baseline (an old variant run alongside); and the rules rest on the author's experience, not on a measured effect of blinding. The sentence "an agent that only dispatches, polls, or packs results runs on `claude-opus-5-5-medium-fast`" (`:20`) shows a model-slug dependence of the same kind PMODE covers.
  - Qara today: `eval-mode-sufficiency` measures whether a mode skill's top-level body answers a question without the reference tier. The judge subagent has Read, Grep and Glob denied and sees only the prompt; verdicts are a forced ternary over two tiers (opus and sonnet) with an `extract-pressure` signal; it is on demand, not a gate; about 96 subagent calls per skill (`.claude/commands/eval-mode-sufficiency.md:7-16,23-35`). That tests the split of a skill, not whether a changed skill changes behaviour. `probe-author` is blind by tool grant (Write only; "A future edit that re-adds a read tool to this agent silently defeats blindness and is rejected by the `check:agents` drift-lint", `.claude/agents/probe-author.md:13`), but it grades code against criteria. A search of `.claude/skills`, `context` and `commands` for "blinded", "blind judge" and "held-out" finds `probe-author`, the sufficiency eval references and a few hooks-guide mentions. I found no skill-change eval that runs a changed skill against an organic prompt and compares outputs.
  - tobogan's sweep as a comparison: the oracle is "the model's diff, minus the test files, is applied to a second clean parent export that holds the pristine PR tests. `bun test` then decides; no model judges." Tests can be hidden ("`hidden`: the brief only says that unseen tests will judge the change"). Each run has a sanity gate ("the diff must be non-empty and must apply"), an escape scan that is code ("checks only where each tool call goes", a denylist plus path check, with `KNOWN LIMITS` pinned in tests), outcome classes with exclusions logged, an interleaved seeded schedule, and an offline `rejudge` (`inference/sweep/README.md:14-44,59,83`). The blinding is by construction (fresh `git archive` tree with no history), not by a word list. Where a task has an automatic test, the sweep's design is stronger than the eval playbook and costs about the same to write.
  - The control, candidate, control rule in the brief belongs to the external inference skill the INFER track studied (`inference/inference-optimisation-skill.md:34`: "Control, candidate, control. Accept only if the candidate beats both controls"), not to the sweep code. The sweep interleaves and shuffles cells instead. I did not find a control/candidate/control step in `inference/sweep/` and did not read all its source.
- Basis: Verified (texts); Unverified (that Qara needs it, and the word-list's effect)
- Code: pstack none. Gap in Qara: a short reference for judging a skill or prompt change by organic-prompt A/B, naming the oracle-first rule. The reading of `agent-transcripts/` is Cursor-specific; the Qara equivalent would read the run's own session log, with the same warning about other sessions.

**PPROOF-15. Copy three one-line rules from the other playbooks, and ignore the rest of them for verification purposes.**
The playbooks give each kind of work its own evidence. Three rules are portable and cheap: "inconclusive or wrong-surface is not a pass", the visual-parity anti-shortcut clauses, and the attempt floor in the hillclimb stop predicate.
- Why: they close loopholes an agent takes under pressure, and each fits a line in an existing Qara file. The remaining content is routing (PMODE) or a Cursor feature.
- Evidence (what counts as evidence in each, also in the Reference table):
  - Bug fix: reproduce on the matching surface yourself, "even when a debug or instrumentation protocol says to ask the user to reproduce"; binary-search the cause with runtime evidence; "Belt-and-suspenders that 'might help' is a hypothesis, not a fix. It does not ship."; verify on the same surface: "'Inconclusive' or wrong-surface is not a pass... Unit tests show branch behavior, not bug absence"; reply must "Paste failing-then-passing repro output verbatim" (`pstack/skills/poteto-mode/playbooks/bug-fix.md:5-15`).
  - Perf issue: baseline trace, vet each number, performance mantras in order ("Don't do it. Do it, but don't do it again. Do it less. Do it later. Do it when they're not looking. Do it concurrently. Do it cheaper."), post-fix trace, artifacts parsed and compared, "cite the measurement in the PR" (`perf-issue.md:1-26`).
  - Hillclimb: one change, one measurement, keep or revert; metric, direction, stop predicate with attempt floor; frozen harness that prints error and work counts; `decision.tsv`; accept only when the metric moves past noise and the regression gate stays green; "Don't relax the predicate to meet it"; reply includes iterations (kept versus reverted) (`hillclimb.md:1-21`).
  - Runtime forensics: capture the live signal (CPU profile, heap snapshot, CDP trace), reduce it, "Prove the mechanism before believing it" by injecting instrumentation through CDP eval or hotfixing live code without reload, map to source; deliverable is a cited diagnosis, no fix (`runtime-forensics.md:5-11`).
  - Trace forensics: the artifact is a fixed dataset, load it into sqlite ("Reach the queryable shape before you read"), narrow, attribute to source ("A frame with no source mapping is not yet a diagnosis"); without a paired capture, "mark the finding as the strongest hypothesis the artifact supports, not a confirmed cause" (`trace-forensics.md:5-14`).
  - Visual parity: "The baseline is the spec. You do not touch it." Baseline harness first ("No baseline, no parity claim"); "no harness modifications, no baseline tampering, no component restructuring to make a diff pass. If the baseline looks wrong, stop and ask"; image diff per component, "A nonzero diff is a fail" (`visual-parity.md:5-9`).
  - Prototype: the one playbook where verification inverts: no tests, throwaway code, "The observation is the test here, not an assertion"; the output is a decision plus a throwaway artifact (`prototype.md:5-14`).
  - Eval: PPROOF-14.
  - Qara: `verifier` says "Do NOT approve on 'looks right.' Run the commands" and has an `UNRESOLVED` verdict for evidence that could not be obtained, "never PASS" (`.claude/agents/verifier.md:111,114` and the UNRESOLVED verdict rule in its Output section). `validate_plan` runs the plan's own Automated items with fresh evidence and lists Manual items as "listed, not approved" (`.claude/commands/validate_plan.md:63-86,163`). `UNRESOLVED` and "Manual items listed, none approved" are the equivalents of "inconclusive is not a pass". Qara is level there. The three portable lines: (a) wrong-surface is not a pass, (b) baseline tampering clauses for any image-diff or snapshot work, (c) an attempt floor.
  - Risky instructions in this group are in PPROOF-20.
- Basis: Verified (text); Unverified (the borrow)
- Code: Gap: three sentences, in `.claude/agents/verifier.md` or `testing-guide.md` and in `performance-goal`'s workflow. No new file.

**PPROOF-16. The verification principles are mostly already in Qara; the two that add something are `test-behavior-not-implementation`'s two imagined edits and `attack-the-premise`.**
PPRIN covers the 24 principles in general. This doctrine only maps the six that concern proof.
- Why: it keeps the borrow list short by saying where each is already covered.
- Evidence:
  - `prove-it-works`: verify the real artifact; "When a check fails, suspect the observation method before the system"; "Script the check when you can" (`pstack/skills/principle-prove-it-works/SKILL.md:7-11`). Qara: the `verifier` agent and `validate_plan` (PPROOF-15). Level.
  - `explain-the-number`: write the decision before you run, name the result that would change it and the noise floor, ask "why not double", list what else the number could measure, keep run count, spread and limiter with the number (`principle-explain-the-number/SKILL.md:7-12`). Qara: partly in `performance-goal` (PPROOF-13), weaker on limiter and alternate explanations (PPROOF-12). Behind by four questions. The "decision before you run, with the result that would change it" line is good and absent: `performance-goal` records thresholds, not the decision they inform.
  - `test-behavior-not-implementation`: judge each test against two imagined edits: break the behaviour (does the test fail?) and change the internals (does it still pass?). "Pair 'this never happens' with a case where it does happen. Assert the error type that callers branch on, not the message." (`principle-test-behavior-not-implementation/SKILL.md:7-12`). Qara: `testing-guide.md:69` ("Tests verify behavior through public interfaces, not implementation"), `:85-86` (stand-in-free tests), mutation checks in `tdd-cycle.md:94`. The two-edit test is a compact review rule Qara states less sharply; the "this never happens" pairing is a useful reviewer check.
  - `sequence-verifiable-units`: bracket each unit as known-good state, one change, check, proceed (`principle-sequence-verifiable-units/SKILL.md:7-12`). Qara: phase-by-phase gates in cruise and drive. Level.
  - `fix-root-causes`: "Guards, retries, swallowed errors, clamped values, and discarded state are the usual ways to hide a bug"; "If the deciding fact took a deep dig, propose the cheap, always-on signal that would have shown it at first look" (`principle-fix-root-causes/SKILL.md:7-12`). Qara: PPRIN covers it; I did not search.
  - `attack-the-premise`: after two failed fixes with one shared premise, write the premise down and test it before another fix; "Look at how the failures are distributed, not only at how large they are" (`principle-attack-the-premise/SKILL.md:7-12`). A search of `.claude/context` and `.claude/skills` for "premise" finds `routing-cheatsheet.md` and the plan-grounding workflows, not a debugging rule. Not found elsewhere; treat as a gap, with the caveat that the search was by one word.
- Basis: Verified (texts); Unverified (the coverage claim for `fix-root-causes`)
- Code: Gap: none by file; decisions go to PPRIN.

**PPROOF-17. Do not make formal verification a standing practice for csf's drain lane state machine; if the owner wants evidence, run one trial model outside the repo and judge it.**
The lane-operation lifecycle is small, written down, and a classic target (an exclusive claim with crash recovery). The cost is a JVM, a downloaded jar, a TLA+ model to keep in step, and none of the csf team knows the language.
- Why: the formal skill's own rule says to pick the strongest target and not the easiest, and a new tool only earns its place after it finds something. The sample here is one data type file; I did not read the drain code.
- Evidence:
  - The machine as documented: phases `reserved`, `preparing`, `launching`, `active`, `recovery-required`, `cleanup-pending`; "available → reserved → preparing → launching → active"; uncertainty from any of the middle states goes to `recovery-required`; `active → cleanup-pending → (complete) → available` (`csf-build/src/lanes/drain-lane-operation-types.ts:3-15,36-47`). Transitions: `reserve`, `begin`, `advance`, `cancel`, `complete` (`:50`). Refusals include `lane-occupied`, `lane-held`, `wo-reserved` (`:150`). A decision note exists: `decisions/2026-11-05-lane-ownership-through-a-published-port.md`.
  - A natural property in the formal skill's sense: "a lane checkout is never held by two operations at once, including across a crash between `reserve` and `begin`". The shape fits the skill's list ("concurrency, retries, state machines"). Whether the SQLite-backed store already makes this impossible by a constraint is the first question; the file header says `kind` is a `CHECK` vocabulary and one row is "the exclusive, phase-tracked claim" (`:3-4`), which suggests a uniqueness rule in the store, not in prose. If so, the property is a database fact and a test on the store is cheaper than a model.
  - csf has no property-testing library: a search of `csf-build/src` for `fast-check` finds nothing. Its tests are example-based.
  - Cost against the owner's frame (2026-11-23: nothing installed or run): statechart's first run installs Java and a jar over the network (PPROOF-8). A trial would need an explicit exception.
  - Cheapest honest alternative: a table-driven test that enumerates every (phase, transition) pair and asserts the documented transition table, written in Bun against the real store. That is exhaustive over a finite table, in the repo's own language, and needs no new tool.
  - My assessment of the value is Unverified: I did not read how the drain recovers after a crash, which is where an ordering bug would live.
- Basis: Verified (the type file); Unverified (the value judgement)
- Code: Gap: none today; candidate is a transition-table test next to `drain-lane-operation-types.ts`, size about 50 lines, in csf, not in cub.

**PPROOF-18. Do not model-check the matters permission policy; write an exhaustive table test for the policy, and revisit a model of folder provisioning only when `provisionMatter` writes permissions.**
The policy is a pure function over a finite set of roles, actions and matter relations. The ordering risk (create the folder, cut inheritance, add the team) is the part a model checker suits, and it is not yet built in cub.
- Why: model checking earns its cost on interleavings; the policy has none. The provisioning order has them, but today cub "creates the folder and never writes permissions" and the order is covered by a sequence test in the m365 spike.
- Evidence:
  - Policy rules: no role means nothing (POLICY-1); everyone who can open a matter may add and edit its documents (POLICY-2); only admins and team leaders create matters (POLICY-3); only admins and the lead change team, close or share outside the firm (POLICY-4); "checked on the server for every action, and never replaces folder permissions" (POLICY-5); admins and leaders can open and edit every matter, leaders manage only those they lead (POLICY-7, POLICY-8) (`matters/policy.md:11-48`). SharePoint permissions are the boundary and the policy can only narrow them (MATTER-1, `matters/roles-and-matter-folders.md:9`).
  - The invariant "the policy never grants beyond SharePoint" is a property over (role × action × matter relation × SharePoint grant) with perhaps a few hundred combinations. An exhaustive loop in a bun test checks it with no tool, and this is "every input up to a bound" in the formal skill's terms, here complete because the domain is finite.
  - The ordering property is MATTER-3 and WALL-4: "A matter is restricted when it is created, while it is empty, or it is not created at all"; create, first grant with `retainInheritedPermissions: false`, record the team, roll back on any failure (`matters/roles-and-matter-folders.md:22-24`, `matters/v2-folder-walls.md:38-43`). Already tested in the spike's fake Graph: "creates the folder, cuts inheritance on the first grant and never emails", "deletes the folder if it cannot be restricted" (WALL-4 Basis line). Real SharePoint behaviour is Unverified there, and a model of the app cannot settle that. A TLA+ model would encode the same order against a fake, with the same blind spot.
  - WALL-9 (report drift between cub's record and SharePoint on a schedule, never auto-repair) matches the maintain-formal skill's stance (report, never edit product) as a design echo; no action.
  - The formal skill's "Able to fail" rule does apply to a table test: show the test failing on a broken variant, such as a policy that grants write to a closed matter (MATTER-9).
- Basis: Verified (the policy and ordering text); Unverified (the recommendation)
- Code: Gap: an exhaustive role × action × relation test in the `matters` code when it exists; the spike's `m365/spike/test/matters-roles.test.ts` holds the sequence tests today.

**PPROOF-19. Know that nothing in pstack's verification stack is enforced except `statechart`, and keep Qara's mechanical checks as the baseline.**
Every skill here is advice to a model: no check confirms that a generated verify skill has its sections, that a feature file has its headings, that evidence exists, or that a PR body carries a number.
- Why: it limits what we can claim from adopting any of it. The gains are in wording and discipline; the guarantees come from our hooks and checks.
- Evidence:
  - All files read, the skills carry `disable-model-invocation: true` and no script except `statechart/scripts/`. The generated skill lives in a project directory under no schema.
  - The guide itself places the weight on human judgement: "A confident reply without evidence is a warning sign" and "An artifact beats a plausible explanation, because you can challenge it without replaying the whole run" (`pstack/docs/guide/06-verify-and-ship.md:17,27`).
  - Shipping, mentioned in the guide, relies on independence: "One fresh agent per PR proves the behavior live, and the agent that judges a change is never the one that wrote it" (`:160`). That is a convention. Qara enforces blindness by tool grant for `probe-author` and by lint (`check:agents`), and the `verifier` has read-only tools plus an explicit mutation-drill protocol.
  - Qara mechanical items to keep: green-guard decision on logged evidence (`.claude/hooks/lib/tdd/tdd-green-decision.ts`), the verifier's `report` baseline comparison (`.claude/agents/verifier.md:34-52`), `validate_plan`'s identity capture at start and end (`.claude/commands/validate_plan.md:25-31`), `standing-audits`' deterministic freshness probes (`.claude/skills/standing-audits/SKILL.md:46-48`), `mutation-round`'s path allowlist and head-SHA binding (`.claude/commands/mutation-round.md:22-39`).
  - Where Qara is behind in kind, not degree: nothing here runs a user-path drive against a built app. `devtools-mcp` is "local UI" inspection and is listed "DO NOT USE WHEN... autonomous end-to-end validation" (`.claude/context/routing-cheatsheet.md:99`). That gap is real for any web product, but not for csf or Qara themselves, whose surfaces are CLIs and files.
- Basis: Verified
- Code: none.

**PPROOF-20. List the risky embedded instructions before anyone reads these skills as policy.**
Text addressed to an agent in this feature is material to study. These are the instructions that conflict with Qara's rules or with the safety of a host:
- Why: the owner asked for them to be listed, and the skills are loaded cold into agents.
- Evidence:
  - Runs unreviewed, networked installs: the statechart tool installs Java and a jar through `mise` on first run ("needs the network", SKILL.md:15; `run.ts:186-206`); the render reference installs an npm package ("Install Pele once, outside the repo", `render.md:3`). The jar and the Java toolchain are pinned (checksum, version), Pele is pinned to 1.9.0 without a checksum I could see.
  - Reads other chats: the eval playbook sends the agent to read candidates' local transcripts under `agent-transcripts/`; it warns against globbing across projects (`eval.md:22`). Reading transcripts at all is the instruction.
  - Live code changes: runtime-forensics tells the agent to "Inject instrumentation via CDP eval on the running process, or hotfix the live code without reloading" (`runtime-forensics.md:7`). On a user's own dev instance that is fine; on a shared or production process it would be dangerous, and the text states no limit.
  - Never asking the human: bug-fix tells the agent to reproduce itself "even when a debug or instrumentation protocol says to ask the user to reproduce"; "Ask the user only with a stated, specific reason the control surface cannot reach the target" (`bug-fix.md:7`). The create skill asks the user only "what you cannot observe" (`create-verification-skill/SKILL.md:13`).
  - Creating files in the repo under test: the generated skill "may create" a missing asset as "verification scaffolding" (`:21`); the maintain skill may open a PR (`maintain-verification-skill/SKILL.md:37`) and the guide suggests running it daily "from a scheduled automation" (guide `:88`). That is an unattended agent that opens PRs; PPAR and PPACK cover the automation itself.
  - A skill that tells an agent to copy nothing about another skill's commands (`create-formal-verification-skill/SKILL.md:34`) is safe. No instruction in this feature mentions force pushes, auto-merge or credentials; those live in Babysit and Shipping (PPAR). The hillclimb playbook says "staging only the files you changed (`git add <files>`, never `-A`)" (`hillclimb.md:15`), which matches Qara's rule.
  - The `control-ui` and `control-cli` skills tell the agent not to send credentials or destructive commands into a controlled session, to keep test data local, and to not store screenshots of privacy-sensitive workspaces without agreement (`cursor-team-kit/skills/control-cli/SKILL.md:103-109`, `control-ui/SKILL.md:211-218`). That is a safe set, and better than the generated-skill text, which has no privacy line.
- Basis: Verified
- Code: none.

**PPROOF-21. Shrink the advisory verification code, keep the gates that guard a merge, admission or a baseline, and expect to remove about 4,100 lines in this area.**
Candidates: the TDD state machinery (about 2,000 of 2,715 lines), the standing-audits runner (about 1,500 of 2,030), the skill-sufficiency scoring scripts (about 570 of 874). Kept: `scripts/mutation-lane-scope.ts` (94), the verifier's baseline comparison, csf `qa-spec-coverage.ts` (122), csf `src/validator/` (1,371), and the sufficiency `precheck` (150).
- Why: the first three track or remind for the agent's own benefit and decide nothing irreversible; the kept ones guard a merge, a landing or a regression. pstack shows that prose alone (tdd, benchmark checklist, eval playbook) can carry the same instructions, but with no refusal behind them.
- Evidence: line counts are `wc -l` of non-test files on 2026-11-23. The TDD contract says phase logging is advisory and never blocks (engineer task prompt); `eval-mode-sufficiency.md:16` says it is not a CI gate; `standing-audits/SKILL.md:46-48` says code decides freshness and fails closed; `mutation-round.md:22-39` makes the path refusal a merge condition.
- Basis: Verified (line counts, the quoted texts); Unverified (every judgement that a paragraph can replace the code, and the consumers of the TDD state, which I did not trace)
- Code: Gap: nothing is removed; this is a proposal. Trace the callers of `tdd-state.ts` and the pre-commit path before cutting.

## Reference

### Skills and what each produces

| Skill (`pstack/skills/...`) | Trigger | Writes | Needs | Enforced by code |
|---|---|---|---|---|
| `create-verification-skill` | `/create-verification-skill`, "make a control skill for this repo" | `.cursor/skills/verify-<app>/SKILL.md` plus `features/README.md` and one file per feature | a runnable app, a drive harness | no |
| `maintain-verification-skill` | `/maintain-verification-skill`, "audit the verify skill" | at most one PR of corrections inside the verify skill directory | the verify skill, a live app | no |
| `create-formal-verification-skill` | `/create-formal-verification-skill`, "model-check this race" | a project-local skill, model or harness, coverage record, sync commit | a verifier tool | no |
| `maintain-formal-verification-skill` | `/maintain-formal-verification-skill`, "is the model still true to the code" | updated model, harness, properties, sync commit, report; changes separate from any product fix | the verify skill, git history | no |
| `statechart` | `/statechart`, "show a bug as a path through states" | `report.md`, `chart.mmd`, `tlc.out`, `tlc-RULE.out` in a new folder | Node 22.18+ or Bun or Deno, `mise`, network once, Java Temurin 25, TLC 1.7.4 | yes (scripts) |
| `tdd` | explicit ask or an obvious cheap test | a failing test, then the fix | a test runner | no |
| `blast-radius` | "blast radius of X", "what could this break" | a five-part writeup and a proof script | ability to run the real code | no |
| `benchmark-checklist` | a perf number to report | a verdict with runs, range, limiter | a measurement script | no |

### Statechart files

| File | Role |
|---|---|
| `scripts/statechart` | POSIX launcher; picks Node, Bun or Deno; exit 127 if none |
| `scripts/statechart.ts` | CLI; argument parsing; staging; spawns worker and janitor; moves `done` into `--out` |
| `scripts/worker.ts` | loads the view module, calls `check` then `compile`, writes the files |
| `scripts/janitor.ts`, `kill.ts` | kill the process group and remove staging when the parent exits |
| `scripts/run.ts` | finds or installs TLC, runs SANY and TLC, reads dumps, reruns without each broken rule |
| `scripts/pipeline.ts` | graph to chart: walk, bugs, labels, regions, lift, report |
| `scripts/ir.ts` | types and constants (`CHART_STATES` 500, `RERUN_STATES` 100,000, `PART` 16 MiB) |
| `scripts/frontends/*` | parsers: config, dot, marks, messages, spec, trace, value, verdict, view |
| `scripts/passes/*` | annotate, label, lift, loop-check, paths, reach, region-check, regions |
| `scripts/backends/*` | cfg, mermaid, plain-text, report |
| `scripts/test/*` | CLI, pipeline, render tests; sample `.tla` corpus; `fast-check` dev dependency |
| `references/render.md` | Pele 1.9.0 rendering, CSS colour classes for `breaks`, `mayBreak`, `bugPath`, `repeats` |

### The view module

| Export | Meaning |
|---|---|
| `state(vars)` | string gives a flat chart; array gives parent states; object gives parallel regions |
| `step(action, from, to)` | label of an arrow in the reader's words; `null` hides the step; brackets name a condition |
| `group(vars)`, `colors`, `title` | phase colour class (blue, orange, purple, yellow, teal, tan, pink), title |

### Benchmark checklist, item to Qara mapping

| # | Question | Qara today |
|---|---|---|
| 1 | Why not double (limiter) | not present |
| 2 | Was it tuned | partly: fixture identity and environment match in `performance-goal` (`measure-and-improve.md:18,72`) |
| 3 | Did it break limits | not present |
| 4 | Did it error | present: correctness first, mandatory guards (`:26-27`) |
| 5 | Does it reproduce | stronger: A/A, interleaved A/B, noise margin, paired analysis (`:19-20,33-43`) |
| 6 | Does it matter end to end | partly: "workload representativeness" (`:35`) |
| 7 | Did it happen | one narrow case: suspicious fast runs in hosted fan-outs (`hosted-parallel-models.md:22-26`) |

### Evidence by kind of work

| Work | What counts as evidence (pstack) | What does not |
|---|---|---|
| Any change | The real artifact: run the feature, read the value, inspect the diff | "it compiles", self-report, mtimes, cached output |
| CLI change | The real command output | a unit test of a branch |
| UI change | The changed flow in the running app; ARIA snapshot plus screenshot with app identity | the final screen alone |
| Parser or migration | A replay of a saved input | none stated |
| Storage change | Reading the written value back through a second view | the "saved" status alone |
| Perf change | Before and after profiles; seven questions answered from a run | a read of the source |
| Bug fix | Same-surface repro, failing then passing, pasted verbatim | "inconclusive" or wrong surface |
| Visual parity | Image diff of zero against a frozen baseline | judging by eye |
| Skill or prompt change (eval) | Blinded outputs, one judge, a transcript check of files actually read | a candidate's self-report |
| Safety of a diff | The one fact, rung 4 or 5, with the script output pasted | a convincing writeup |
| Formal check | A counterexample replayed against real code, or a pass that is shown failing on a broken variant | a pass on a stale description |
| Prototype | An observation (screenshot, logged timing) | an assertion |

### Qara and csf analogues, one line each

| pstack | Qara or csf | Comparison |
|---|---|---|
| verify skill and feature map | csf spec coverage (`covers:` cells), scenario triplets, `qa` stage | csf ahead on mechanical mapping; no user-path drive harness in either |
| maintain verification skill | csf drift judge (blind, tool-less); `standing-audits` | csf drift judge stricter; no per-feature live pass |
| formal skills | none; `visual-explainer:state-machine` for code-derived machines | Qara behind in kind; judged not needed (PPROOF-17, 18) |
| statechart | `visual-explainer:state-machine` | level on code-derived charts; pstack adds interleavings and audience |
| tdd | `tdd-qa`, `.claude/hooks/lib/tdd`, `mutation-round` | Qara far ahead |
| blast-radius | `critic` check 4, `reviewer` | pstack ahead on certainty ladder |
| benchmark-checklist | `performance-goal` | each ahead in different places (PPROOF-12, 13) |
| eval playbook | `eval-mode-sufficiency`, `probe-author`, tobogan sweep | Qara has no organic-prompt A/B for a skill change; the sweep is ahead where an oracle exists |
| control-cli, control-ui | `devtools-mcp`, tmux and pi harnesses | level on CLI; Qara thin on a drivable UI |
| verify-this (`cursor-team-kit`) | `verifier`, `validate_plan` | `verify-this` returns one of VERIFIED, NOT VERIFIED, INCONCLUSIVE after a baseline and a treatment; Qara's verdicts PASS, FAIL, UNRESOLVED match |

## What this could replace

The owner's steer of 2026-11-23: remove code and replace it with workflows and doctrine. The test for each row: does the code guard an irreversible or outward-facing act (merge, push, delete, admission, spending quota)? Then it stays code. Does it only track state for the agent's own benefit, remind, route or format? Then a paragraph can carry it. Line counts are `wc -l` of non-test files, 2026-11-23. I read headers and the decision ladders, not every consumer, so "who calls this" is not traced; that is the main risk on every row.

| Code (path, lines) | Job | pstack prose that does the same job | What the code guarantees that prose cannot | Verdict | Risk |
|---|---|---|---|---|---|
| `.claude/hooks/lib/tdd/` non-test files, 21 files, about 2,715 lines (`tdd-red-log.ts` 297, `tdd-caller-context.ts` 296, `criterion-shape.ts` 262, `tdd-state-store.ts` 206, `tdd-state.ts` 204) | Arms RED, logs test runs, refuses a GREEN transition with no real assertion failure on record (`tdd-red-run-verdict.ts:20-60`, verdict strings such as "RED must be an assertion failure: your only failing run was an import/load error") | `pstack/skills/tdd/SKILL.md:15-20` and `:38-42`: failing test first, "Confirm it fails for the intended reason", name the failing-before run in the reply | A recorded, per-agent run history and a refusal text the agent cannot talk past. But the TDD contract in the engineer prompt calls the phase logging advisory and says it "never blocks phase transitions", so the refusals guard nothing irreversible | Shrink. Keep the arm and clear commands and a small run log (about 500 lines at most); replace the verdict ladder, caller-context, shell parsing and criterion heuristics with the tdd paragraph plus the final-reply rule | Medium. Consumers (hooks, the pre-commit path, `check:*` entries) not traced; if one blocks a commit on this state, it is a gate and the row changes |
| `.claude/skills/standing-audits/tools/` non-test files, about 2,030 lines (`probes.ts` 300, `registry.ts` 261, `adapters.ts` 248, `runner.ts` 224, `standing-audits.ts` 191) | Decides which recurring chores are overdue from on-disk evidence, runs them, records the pass (`SKILL.md:46-48`: "Deterministic code decides freshness and fails closed") | No pstack counterpart; the guide only says run maintain "at least once a day, ideally from a scheduled automation" (`pstack/docs/guide/06-verify-and-ship.md:88`). A doctrine list of chores with a date column is the prose form | Fail-closed freshness from evidence, unattended (nightly) execution of allowlisted argv, no hand-kept dates. A paragraph relies on someone reading it | Shrink. Keep `status` and the probe core; replace registration and adapter machinery with a dated table in a doctrine and a workflow step | Medium: the nightly op needs something executable; losing it turns reminders into memory |
| `.claude/skills/cc-upgrade/scripts/skill-sufficiency-*.ts` non-test, 874 lines (`score` 243, `precheck` 150, `assemble` 148, `types` 120, `fold` 105, `gate` 72) | On-demand eval of whether a mode skill's top-level body answers a question (`eval-mode-sufficiency.md:16`: "NOT a CI gate") | `pstack/skills/poteto-mode/playbooks/eval.md:15-23`: frame, organic prompt, blinded judge, read every output yourself | Mechanical scoring with calibrated thresholds and a "judge not sensitive" halt (`eval-mode-sufficiency.md:45-47`). A playbook has no thresholds | Shrink. Keep `precheck` (150, a no-model dangling-anchor check); replace assemble, fold, score and gate (about 570 lines) with a playbook step and the paragraph in PPROOF-14 | Medium: loses the sensitivity control, which is what stops a false "clean" |
| `scripts/mutation-lane-scope.ts`, 94 lines | Checks every changed path of a mutation PR is a test path before merge (`mutation-round.md:22-39`) | none; pstack has no merge authority check | A path allowlist that makes a refusal checkable at the head SHA. It guards a merge | Keep as code | Removing it turns a hard refusal into a request |
| `.claude/agents/verifier.md` gate commands (`report capture`, `report compare`, `report publish`, lines 34-57); line count of the `report` tool not measured | Runs the test suite and compares against a stored baseline | `pstack/skills/principle-prove-it-works/SKILL.md:7-11` ("Script the check when you can") | Baseline delta that blocks a decrease; a regression is caught without a person reading output | Keep as code (not measured, not judged for shrink) | Low if kept |
| csf `src/qa/qa-spec-coverage.ts`, 122 lines | Computes which spec cells have a gated test (`spec-coverage.md:29-42`) | `pstack/skills/create-verification-skill/references/feature-map-example/README.md:32-39`: a feature map read by an agent | Checks that a ref's file exists, that a gate command selects it, and that it declares `covers:`. It never gates the pipeline (`spec-coverage.md:12-17`) | Keep as code: small, and "something runs it" cannot be judged from a paragraph | Low |
| csf `src/validator/` non-test, 1,371 lines (`csf-drain-validator-dispatch.ts` 368, `drain-validator-land.ts` 290, `drain-validator-lane.ts` 216, `csf-drain-validator-land.ts` 206, `validate-work-order.ts` 154) | Drain-end validator: lane reservation, dispatch, record landing | none; pstack has no drain | Lane ownership, receipts and landing are admission and record writes (`drain-validator-lane.ts:1-15`) | Keep as code | Removing it removes admission control |

**What stays code, and why.** A path allowlist for a merge, a baseline comparison that blocks, lane admission and landing, and the no-model anchor precheck guard something that cannot be undone or that a model cannot see; a paragraph there is a request. The TDD state and the standing-audit registry mostly track state for the agent's own benefit.

**Limit of the pstack side.** The pstack prose these rows would lean on is unenforced; the only script in pstack's verification stack is `statechart` (PPROOF-19). Replacing a Qara check with a pstack-style paragraph moves the guarantee from a refusal to a hope. Where the row says shrink, the shrink keeps the artefact that makes a claim checkable later (a run log, a dated table).

**Tests are not machinery.** The transition-table test (rank 7 below) and the matters policy test (rank 8) test product behaviour. They are kept and do not count as added tooling. Nothing in the borrow list adds a script, check or CLI feature.

## Borrow list

Order after the steer: text-only borrows first (ranks 1 to 6, 9, 10); ranks 7 and 8 are tests of product behaviour; no rank adds tooling. Treat 9 and 10 as ahead of 7 and 8 in effort.

| Rank | What | Target | Size | Risk | Depends on |
|---|---|---|---|---|---|
| 1 | Add benchmark questions 1, 3, 6, 7 (limiter, limits arithmetic, end-to-end share, work happened) as a short checklist under "Compare the checkpoint" | Qara: `.claude/skills/performance-goal/workflows/measure-and-improve.md` (and mention in `decision-contract.json` if it lists checks) | about 10 lines | Low; may lengthen reports | none |
| 2 | Add a "how sure" rung (1 to 5 from blast-radius) and an `unproven` marker to the output of `critic` and `reviewer` | Qara: `.claude/agents/critic.md`, `.claude/agents/reviewer.md` Output blocks | about 6 lines each | Low; a model may rate itself high; the `agents/` drift-lint may need a fixture | none |
| 3 | Replace the importer-count heuristic in `critic` check 4 with "find the one fact it is safe because of" and ask for it to be proven when cheap | Qara: `.claude/agents/critic.md` | about 5 lines | Low to medium: broadens a mechanical check into judgement | rank 2 |
| 4 | A short reference for judging a skill or prompt change: oracle first (hidden tests as in the sweep), otherwise organic prompt, one blinded judge, transcript check, N stated; cite PPROOF-14 | Qara: new reference under `.claude/skills/cc-upgrade/references/` or a note next to `eval-mode-sufficiency` | about 40 lines | Medium: untested rules; word-list blinding is brittle | decision on PPROOF-14 open question |
| 5 | Three one-liners: "wrong-surface or inconclusive is not a pass"; baseline-tamper clauses for image-diff or snapshot work; an attempt floor in a hillclimb stop predicate | Qara: `.claude/agents/verifier.md`, `.claude/skills/core/testing-guide.md`, `performance-goal` workflow | 3 sentences | Low | none |
| 6 | Copy the drift-versus-bug procedure (four change classes, replay the counterexample) as a rule for any model-like check, including the state-machine command | Qara: `.claude/skills-external/visual-explainer/commands/state-machine.md` is external; better a note in `testing-guide.md` | about 10 lines | Low | none |
| 7 | Exhaustive transition-table test for the drain lane lifecycle | csf: next to `src/lanes/drain-lane-operation-types.ts` (csf repo, not cub) | about 50 lines | Low; needs csf-side change control | owner decision on PPROOF-17 |
| 8 | Exhaustive role × action × relation test for the matters policy, once the policy code exists | tobogan `matters/` code or cub, when built | about 80 lines | Low | policy code existing |
| 9 | A wording check in csf's QA stage brief: a skipped gate is reported unreached, never verified by another path | csf: `shared/templates/stage-briefs/qa.md` | 1 sentence | Low; the brief already says "do not skip a configured gate silently" | none |
| 10 | `decision.tsv` structure for attempt logs in `performance-goal` runs | Qara: `performance-goal/references/hosted-parallel-models.md` section 3 | about 10 lines | Low | none |

**Not to borrow, and why.**
- The generated per-project verify skill and its daily maintain pass: csf's spec coverage and drift judge already map spec to tests and detect divergence mechanically; a second layer needs a drivable surface and a full live pass each time (PPROOF-4). Revisit if cub gains a UI or CLI the owner wants driven.
- `statechart` and TLA+ tooling: installs a JVM and a downloaded jar, outside the 2026-11-23 frame; Qara's `state-machine` command covers code-derived machines (PPROOF-8, 9).
- The `tdd` skill: Qara's machinery is far ahead (PPROOF-10).
- The eval playbook's banned-word list as a rule: brittle, and unproven; take the oracle-first idea and the transcript check instead (PPROOF-14).
- `control-ui` and `control-cli` as skills: Qara has tmux, pi and `devtools-mcp`; they are generic and level.
- The Pele renderer and its CSS: Cursor-style presentation, unrelated to proof.

## Open

Each question can be asked alone. Removal questions first.

- **Replace about 2,000 lines of TDD verdict, caller-context and criterion code (`.claude/hooks/lib/tdd/`) with the `tdd` paragraph and the final-reply rule, keeping arm, clear and a small run log?** Recommendation: yes, after tracing who calls `tdd-state.ts`; if a commit hook blocks on it, keep that part.
- **Replace about 1,500 lines of standing-audits registration and adapters with a dated chore table in a doctrine, keeping `status` and the probe core?** Recommendation: yes if the nightly op can run from the kept core; otherwise shrink less.
- **Replace about 570 lines of skill-sufficiency assemble, fold, score and gate with the PPROOF-14 paragraph, keeping `precheck`?** Recommendation: only when the owner accepts losing the "judge not sensitive" halt; otherwise keep the scoring.

Additions (all text, or tests of product behaviour):

1. **Add a "how sure" rung to `critic` and `reviewer` (borrow rank 2)?** Recommendation: yes, one line in each Output block, without changing verdict logic.
2. **Add the four benchmark questions to `performance-goal` (rank 1)?** Recommendation: yes; they cover failures the skill is silent on, and the change is local.
3. **Run one trial TLA+ model of the lane lifecycle, outside the repo, as a one-off exception to "install nothing"?** Recommendation: no for now. First check whether the store already enforces exclusivity by constraint; if it does, a store-level test is the cheaper evidence (PPROOF-17).
4. **Write a skill-change eval reference (rank 4), or leave Qara without one?** Recommendation: write the short reference, oracle-first, and do not adopt the word list. Ask when the next skill change needs a before-and-after comparison.
5. **Should cub get a verify skill later?** Recommendation: decide only when cub has a surface a user touches (UI or CLI) that csf's scenarios cannot drive. Until then keep the two conventions in rank 9.
6. **Will the matters policy get its exhaustive table test when the policy code is written?** Recommendation: yes, make it a line in the matters track's definition of done, not a new rule here.

**Facts still unknown.**
- Whether `statechart`'s test suite passes and whether TLC output parses as the scripts expect: nothing was run.
- Whether the pinned jar checksum matches the release: not fetched, not checked.
- How csf recovers lane operations after a crash, and whether the store enforces one claim per checkout by constraint: I read only the type file header.
- Whether cub has a UI or CLI surface for a verify skill: cub's product code was not read.
- Whether Qara has a debugging rule equivalent to `attack-the-premise` outside the files searched.
- The effect of the blinding rules on a model's behaviour: no measurement in the pstack repo that I found.
- Whether `verify-this` and the pstack skills disagree about verdict names: `verify-this` uses VERIFIED, NOT VERIFIED, INCONCLUSIVE; I did not read its later sections.

## Sources

pstack (cursor/plugins at `7a583913eb1b8d1a0ee76753d1a2cf072e7b54f9`, read only):
- `pstack/skills/create-verification-skill/SKILL.md`, `references/feature-map-example/{README,create-note,search}.md`
- `pstack/skills/maintain-verification-skill/SKILL.md`
- `pstack/skills/create-formal-verification-skill/SKILL.md`, `pstack/skills/maintain-formal-verification-skill/SKILL.md`
- `pstack/skills/statechart/SKILL.md`, `references/render.md`, `scripts/{statechart,statechart.ts,worker.ts,janitor.ts,kill.ts,pipeline.ts,run.ts,ir.ts,package.json}` and the directory listing of `scripts/{passes,frontends,backends,test}`
- `pstack/skills/{tdd,blast-radius,benchmark-checklist}/SKILL.md`
- `pstack/skills/principle-{prove-it-works,explain-the-number,test-behavior-not-implementation,sequence-verifiable-units,fix-root-causes,attack-the-premise}/SKILL.md`
- `pstack/skills/poteto-mode/playbooks/{bug-fix,perf-issue,hillclimb,runtime-forensics,trace-forensics,visual-parity,eval,prototype}.md`
- `pstack/skills/poteto-mode/SKILL.md` (Non-negotiables), `pstack/skills/arena/SKILL.md`
- `pstack/docs/guide/06-verify-and-ship.md`, `pstack/docs/guide/10-recipes-and-pitfalls.md` (search hits)
- `cursor-team-kit/skills/{control-cli,control-ui,verify-this}/SKILL.md`

Qara (`$HOME/qara`):
- `.claude/skills/core/testing-guide.md`; `.claude/agents/{verifier,critic,reviewer,probe-author}.md`
- `.claude/commands/{mutation-round,eval-mode-sufficiency,validate_plan,nightly-standing-audits}.md`
- `.claude/skills/standing-audits/SKILL.md`; `.claude/skills/performance-goal/{SKILL.md,workflows/measure-and-improve.md,references/hosted-parallel-models.md}`
- `.claude/hooks/lib/tdd/` (listing, `tdd-green-decision.ts`); `.claude/skills/tdd-qa/workflows/tdd-cycle.md`
- `.claude/skills-external/visual-explainer/commands/state-machine.md`; `.claude/context/routing-cheatsheet.md`; `.claude/skills/show-me/SKILL.md`

csf-build (`/media/ssdev/tg-pro/cub/node_modules/csf-build`, read only):
- `shared/conventions/spec-coverage.md`, `shared/templates/drift-judge-brief.md`, `shared/templates/stage-briefs/qa.md`
- `src/validator/validator-pack.ts`, `src/validator/validator-checks.ts`, `src/validator/drain-validator-lane.ts`, `src/lanes/drain-lane-operation-types.ts`

tobogan: `inference/inference-optimisation-skill.md`, `inference/sweep/README.md`, `inference/sweep-results-full-20261122.md`, `matters/roles-and-matter-folders.md`, `matters/policy.md`, `matters/v2-folder-walls.md`, `DOCTRINES.md`, `noodle/modes.md` (format model).
