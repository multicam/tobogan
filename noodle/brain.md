# NBRAIN: Brain and brainmaxxing, persistent memory and the self-learning loop

**Track:** noodle · **Type:** research · **Date:** 2026-11-23

**Question:** What is Noodle's "brain" feature and the brainmaxxing skill pack behind it, how much of it is enforced by code and how much is only prose, and what would a brain plus self-learning loop add to Qara and csf beyond the memory and knowledge machinery they already have, and what would it replace?

**Scope:** Noodle's brain convention (the repo's own `brain/` vault, the `brain` skill, the hooks, the preamble line, the docs pages), the whole brainmaxxing repository (every file), and plan 119 (brainmaxxing "autoresearch" upgrade). Compared against Qara's memory, decision, dream, retro, introspect, hygiene, compound, diderot and knowledge-state machinery, Qara's `MISSION.md` and `PRINCIPLES.md`, and csf's work-order state (`_decisions.md`, `_findings.md`, records). Out of scope: skills authoring in general (NSKILL), the scheduler that decides when a `reflect` stage runs (NSCHED), modes and worktrees (NMODE), adapters and runtimes (NADAPT), CLI, config and UI (NVIEW).

**Sources:** Noodle `poteto/noodle` at `82d2921c52370f23f29086de81ccfb600939c037` (v0.1.5; paths below are relative to its root unless marked). brainmaxxing `poteto/brainmaxxing` at `ec4d8e43dee639d6f5d94aed3ca16af7b298ecfc` (paths marked `bm:`). Qara at `$HOME/qara`, csf as installed in the cub checkout (`/media/ssdev/tg-pro/cub`, read only). Nothing was run: no build, no test, no script, no model call. Full list under Sources.

## Summary of findings

1. The brain is a convention, not a Noodle feature. No Go code reads, writes, indexes or validates `brain/`. Core touches it in three places only: one sentence in the session preamble, the default backlog path (now `todos.md`, formerly `brain/todos.md`), and an installer question. Everything else is a markdown skill pack (brainmaxxing) plus two shell hooks. There are no tests for any of it, and its index-rebuild hook is registered with a matcher that cannot fire (NBRAIN-5, checked against the Claude Code hook docs).
2. brainmaxxing is small: 6 skills, 2 hooks, 1 settings fragment, 1 Python extraction script, 1 shell snapshot script, 16 principle files, a `CLAUDE.md` stanza. "Self-learning" means: an agent is told, in prose, to write notes after sessions (`reflect`), to audit and prune them periodically (`meditate`), and to mine old transcripts (`ruminate`). No evaluator measures whether the brain helps. Noodle's own plan 119 says so.
3. Qara built and then retired the same loop. A nightly reflection cron plus an 8.8k-line adaptation ledger were removed on 2026-09-14 because they read too little and rotted. What Qara kept is stricter: dream (nightly, proposes byte-exact ledger rows, a human adjudicates), a memory trust ledger that reorders `MEMORY.md`, `compound` (explicit capture and bounded recall of verified fixes), `retro` (environment fixes from one session) and `hygiene`.
4. Recommendation: do not install brainmaxxing and do not build a reflect-after-every-session stage. Adopt at most three small text borrows (below). The one real gap a brain fills, a committed, harness-neutral, per-repo gotcha store, is already half covered by `compound`'s `docs/solutions` and csf's `_findings.md`, and is an owner decision (NBRAIN-12).

## Doctrines

**NBRAIN-1. Treat the brain as a convention that lives in prompts, hooks and a skill pack, because Noodle's code does not implement it.**
Noodle core never opens a file under `brain/`. The brain exists because (a) the repo's `CLAUDE.md` tells agents to use it, (b) brainmaxxing's skills and hooks are copied into `.agents/` and `.claude/`, and (c) one preamble sentence tells cook sessions to write to it. The marketing framing ("Noodle has a brain") over-states what is built.
- Why: a borrow decision should be priced against what exists. There is no brain engine to take; there are about 10 markdown prompts and 2 shell scripts.
- Evidence: `dispatcher/preamble.go:20` is the only runtime mention: "Write learnings to brain/ files when you discover something notable". It is written unconditionally, including when no `brain/` exists. A Go search for `brain` finds only that line, the backlog adapter's default path (`adapters/main.go:67`, `:113`), test scaffolding (`e2e/smoke_test.go:175`, `e2e/helpers_test.go:139`), and a comment (`monitor/pid_observer.go:13`). `startup/firstrun_test.go:30-31` asserts `brain/` is NOT created by first-run setup; `CHANGELOG.md:19` records "remove brain/ scaffolding"; `CHANGELOG.md:5` moves the default backlog from `brain/todos.md` to `todos.md`. `docs/reference/faq.md:19` and `INSTALL.md:155-159` call it optional and separate.
- Basis: Verified
- Code: none in Noodle core; see doctrines 2 to 6 for the pack.

**NBRAIN-2. Read the brain layout as three tiers of different stability: indexes, durable notes, and working files.**
The shipped starter vault is `index.md`, `principles.md`, `principles/*.md` (16) and `plans/index.md`. Noodle's own vault adds `vision.md`, `architecture.md`, `todos.md`, `codebase/` (34 gotcha notes), `plans/<id>-slug/` (8 live plan directories, 64 files) and `archive/` (`completed_todos.md` plus `archive/plans/`, 351 files). Conventions are prose rules in `bm:.agents/skills/brain/SKILL.md`: one topic per file, lowercase hyphenated names, `[[section/file]]` wikilinks, no frontmatter, notes under about 50 lines, every file reachable from `index.md`, index files hold links only.
- Why: the conventions are what make notes retrievable by an agent that has only an index in context. They are also the only enforcement: nothing checks line counts, reachability or naming.
- Evidence: `bm:.agents/skills/brain/SKILL.md` ("Rules", "Wikilinks", "Writing Style"). Noodle's variant of the same skill (`.agents/skills/brain/SKILL.md`) adds `todos.md`, `vision.md`, `architecture.md`, `audits/` and plan directories "prefixed with the todo ID". Counts from `brain/` at the pinned commit: `codebase/` 34 files, `plans/` 64, `archive/` 351. Note shape, for example `brain/codebase/schedule-order-normalized-away-when-skill-missing.md`: Symptom, Root cause, Fix, Fallback, then a "See also" wikilink line.
- Basis: Verified
- Code: Gap: no check for reachability, size, naming or broken wikilinks in either repo. The "reachable from index" rule is only enforced by the index-rebuild hook's drift test (NBRAIN-5), and only for the files it regenerates.

**NBRAIN-3. Inject only the index, and only for Claude Code; rely on the agent to read the rest.**
`inject-brain.sh` runs at SessionStart (`startup|resume`) and prints the text "Brain vault index - read the relevant files before acting:" followed by `brain/index.md`. Nothing else is injected: no principles, no notes. Codex gets no hook: `.codex/config.toml` configures sandbox, model and `project_doc_fallback_filenames = ["CLAUDE.md"]`, so a Codex session sees the brain only through the `CLAUDE.md` "Brain" stanza and the preamble sentence.
- Why: an index in context plus "read what is relevant" is cheap (it honours the context-window principle) but depends on the agent choosing to read. There is no measurement of how often it does. In Noodle's own vault the index is 65 lines of bare wikilinks with no descriptions, so relevance must be guessed from file names.
- Evidence: `.agents/hooks/inject-brain.sh` (9 lines); `.claude/settings.json` (SessionStart matcher `startup|resume`); `.claude/hooks` is a symlink to `../.agents/hooks` (same for `skills`, `agents`); `.codex/config.toml` has no hooks section; `CLAUDE.md:5-12` Brain stanza. brainmaxxing ships the same script at `bm:.claude/hooks/inject-brain.sh`. The brainmaxxing README states "reads at session start and writes to when it learns something".
- Basis: Verified
- Code: `.agents/hooks/inject-brain.sh`; the Codex side is a Gap (no injection).

**NBRAIN-4. Know the four skills that maintain the brain, what each reads and writes, and how little of that is code.**
All are prompts (`.agents/skills/<name>/SKILL.md`), plus one shell script and one Python script. See Reference: skill table. In short: `brain` is the writing convention; `reflect` scans the current conversation and routes each learning to brain notes, skill files, a structural fix, or a todo; `meditate` snapshots the vault and the skills, spawns an auditor then a reviewer subagent, presents a report and then "Apply all changes directly"; `ruminate` extracts old transcript JSONL with a Python script, spawns an agent team (model `opus`) to find uncaptured corrections and preferences, filters by frequency and impact, and applies only what the user approves. `plan` and `review` are not memory skills but read `principles.md` and every linked principle fresh on each run ("Do NOT use memorized principle content").
- Why: the loop's quality is the quality of these prompts. The strongest pieces are the filters (meditate's quality bar, ruminate's "discard aggressively", reflect's structural-enforcement check before writing a note). The weakest is that meditate's apply step has no verification and no rollback beyond git.
- Evidence: `bm:.agents/skills/{brain,reflect,meditate,ruminate,plan,review}/SKILL.md`, `bm:.agents/skills/meditate/references/agents.md`, `bm:.agents/skills/meditate/scripts/snapshot.sh`, `bm:.agents/skills/ruminate/scripts/extract-conversations.py`. Noodle's copies differ (NBRAIN-9).
- Basis: Verified
- Code: the two scripts only. `snapshot.sh` concatenates `*.md` files under a directory with `=== path ===` headers into one file so subagents read one file. `extract-conversations.py` reads `~/.claude/projects/<cwd>/*.jsonl`, keeps user messages (first 3000 characters) and assistant messages (first 800), skips tiny files and system-reminder-only messages, and splits the result into batch manifests. It does no redaction.

**NBRAIN-5. Do not rely on the auto-index hook: its PostToolUse matcher `brain/` can never fire.**
Both repos register `auto-index-brain.sh` under `PostToolUse` with `"matcher": "brain/"`. For `PostToolUse` the matcher is tested against the tool name. A value containing a character outside letters, digits, `_`, `-`, space, `,` and `|` is a JavaScript regex tested unanchored against the tool name; `brain/` appears in no tool name (`Write`, `Edit`, `Bash`, `mcp__...`). File-path filtering belongs to the handler's `if` field (for example `Edit(*.ts)`), not to `matcher`. So the hook never runs, and `index.md` is only updated when the agent follows the prose rule "After Writing: update `brain/index.md`". The skills also contradict each other: the `brain` skill says update the index after writing, the `plan` skill (Step 7) says "Do NOT edit `brain/index.md`, the auto-index hook maintains it".
- Why: a drifting index silently breaks the "everything reachable from index" invariant that retrieval depends on. The hook is also drifted between the two repos: Noodle's copy rebuilds only the sections `vision principles delegation codebase audits`, a Backlog link, a Plans link and an Archived Plans link, and excludes plan subdirectories. It has no section for `architecture`, so a rebuild would drop the `architecture` link that Noodle's own `brain/index.md` carries.
- Evidence: `bm:.claude/settings.json` and `.claude/settings.json` (matcher `brain/`); `bm:.claude/hooks/auto-index-brain.sh` versus `.agents/hooks/auto-index-brain.sh` (section lists); `bm:.agents/skills/plan/SKILL.md` Step 7 versus `bm:.agents/skills/brain/SKILL.md` "After Writing". Matcher semantics: fetched Claude Code hooks documentation (https://code.claude.com/docs/en/hooks, 2026-11-23): "`PreToolUse`, `PostToolUse` ... | tool name | `Bash`, `Edit|Write`, `mcp__.*`"; "Any other character: JavaScript regular expression, unanchored". Qara's own `.claude/context/hooks-guide.md:59` and `:338` agree ("CC matchers are unanchored regexes", PostToolUse uses tool-name matchers). Corollary: the starter vault's `index.md` is hand-maintained by agents in practice, and the brainmaxxing README's "rebuilding it when files change" is not true as shipped. Whether the same hook ever worked under an older Claude Code version is unknown.
- Basis: Verified
- Code: `.agents/hooks/auto-index-brain.sh`. Gap: no test; the script emits bare wikilinks only, by design ("no LLM-generated descriptions").

**NBRAIN-6. Conflict handling between parallel agents is whatever the worktree merge gives you; the brain adds none.**
Cook sessions run in git worktrees and merge back; reflect writes into the stage's worktree branch. Nothing in either repo locks or partitions brain files. The protection is Noodle's generic merge lock (`.worktrees/.merge-lock`, PID stale detection) and rebase, plus the written principle "serialize shared-state mutations". `index.md` is a regenerated file that every brain-writing session may touch, which makes it the natural conflict hot spot. Plan 119 proposes conflict detection but only inside one meditate run (overlapping `file_path` and `merge_sources` across proposals), with `base_hash` checks before apply.
- Why: with one human and few parallel agents the risk is small; with many parallel cooks all running reflect, simultaneous edits to `index.md`, `principles.md` and the same gotcha note are likely, and the principle that says "instructions are insufficient for concurrency safety" is not applied to the brain itself.
- Evidence: `brain/codebase/worktree-gotchas.md` ("Concurrent merges cause double-work": the worktree CLI acquires `.worktrees/.merge-lock`); `brain/principles/serialize-shared-state-mutations.md`; `brain/plans/119-brainmaxxing-autoresearch/phase-1-curator-gate.md` ("Conflict detection", `base_hash`, `source_hashes`). A search of both repos finds no brain-specific lock, merge driver or conflict test.
- Basis: Verified (absence in the pinned trees); Unverified (how often it bites in practice)
- Code: Gap.

**NBRAIN-7. Pruning is a prompted audit, and "archive" is a directory of old plans, not a rule.**
Pruning happens in `meditate` only: an auditor flags notes as outdated, redundant, low-value, verbose or orphaned (judged against the live codebase with Grep/Glob), then deletes, merges, condenses or rewrites, with the bar "high-signal, high-frequency or high-impact". There is no age rule, no size cap, no schedule enforced by code. Noodle's `meditate` adds an Autonomous Session Mode: "Apply all high-confidence changes autonomously. For ambiguous or risky changes (brain file deletions, principle rewrites), file a todo instead", then commit via the `commit` skill. Completed todos go to `brain/archive/completed_todos.md` and finished plan directories to `brain/archive/plans/` (351 files at the pin), kept in the tree. The reviewer is told never to propose merging principles in brainmaxxing's spec ("they are intentionally independent") while meditate's apply step says to merge principles that are subsets of others: an internal contradiction.
- Why: this is where a self-writing store either stays lean or rots. The mechanism is only as good as one model pass reading a snapshot, and meditate also audits the user's auto-memory directory (`~/.claude/projects/<project>/memory/`) and may "Delete or rewrite" entries there, which reaches outside the repo.
- Evidence: `bm:.agents/skills/meditate/SKILL.md` steps 2 and 6; `bm:.agents/skills/meditate/references/agents.md` (Auditor, Reviewer: "Do NOT propose merging principles"); `.agents/skills/meditate/SKILL.md` "Autonomous Session Mode" and "Merge principles"; `brain/todos.md` header comments ("completed todos live in archive/completed_todos.md").
- Basis: Verified
- Code: Gap: nothing but `snapshot.sh` is mechanical. Compare Qara's retire-by-`git rm` rule (NBRAIN-10).

**NBRAIN-8. Judge "self-learning" as capture plus curation without an evaluator, and take plan 119's own admission at face value.**
Concretely, self-learning is: reflect writes notes after a session; meditate periodically deletes and merges notes and promotes patterns to `principles/`; meditate also edits skills ("encode lessons in structure") so skills "get better over time"; ruminate back-fills. The loop has no outcome signal. Plan 119 states the gap: "Brainmaxxing has the loop (reflect, meditate, ruminate) but lacks the evaluator and the search", "Meditate can silently degrade the brain", "Bad brain edits compound silently because every session reads the brain". Its remedy (typed edit proposals, risk triage, a curator subagent, base-hash staleness checks, and a binary-eval hill-climbing loop for skill prompts, default 5 experiments, accept at 5 percent relative gain) is a plan, listed as todo 119, targeting `~/code/brainmaxxing`, and none of it is in the brainmaxxing commit studied.
- Why: this settles the value claim. The upstream author does not claim the loop measurably helps; the worked example in `docs/cookbook/self-learning.md` is a narrative (seed-file requirement noted twice, consolidated by meditate, read by session 4), not a measurement. The plan's own scope note says measuring whether brain edits improve downstream outcomes "requires longitudinal tracking and is future work".
- Evidence: `brain/plans/119-brainmaxxing-autoresearch/overview.md` (Motivation, Design Decisions, Scope limitation); `phase-1-curator-gate.md`; `phase-2-structured-findings.md` (tagged `## Structured Findings` envelope, last block wins); `brain/todos.md` item 119; absence of `references/eval-guide.md` or `findings-schema.md` in the brainmaxxing tree at `ec4d8e4`; `docs/cookbook/self-learning.md` "What this looks like in practice".
- Basis: Verified
- Code: plan only; no implementation in either repo.

**NBRAIN-9. Expect drift between the pack and Noodle's own copy; the pack is a snapshot, not a dependency.**
The skills in Noodle's `.agents/skills/` are edited forks of the brainmaxxing ones: `reflect` gains a `schedule:` frontmatter line ("Follow-up stage after quality") and routes to `brain/delegation/`; `meditate` gains Autonomous Session Mode, `commit`, and "Clean stale `.noodle/` state"; `ruminate`'s extractor gains Codex JSONL support (`--claude-dir`, `--codex-dir`, `--cwd`); the `brain` skill gains `todos.md`, `vision.md`, `architecture.md`, `audits/`. The installed pack therefore differs from both the upstream pack and the docs page, which shows `reflect` frontmatter with `schedule: "After an agent session completes"`.
- Why: install steps are "tell your agent to copy these files", so there is no version, no update path and no way to take upstream fixes except by repeating the copy. Any Qara adoption would inherit the same fork-by-copy problem (Qara already has this problem with csf's vendored `compound-learning`, which carries a provenance comment and "re-sync by hand").
- Evidence: diffs of `.agents/skills/{reflect,meditate,ruminate,brain}` against `bm:.agents/skills/...`; `bm:README.md` "Installation" (four copy steps); `docs/cookbook/self-learning.md` (frontmatter example); `docs/concepts/brain.md` (instructions to "add `schedule:` fields to reflect and meditate").
- Basis: Verified
- Code: none; install is agent-executed prose.

**NBRAIN-10. Qara already has every function of the loop in a more constrained form, and deliberately retired the unconstrained version.**
Mapping (details in Reference: comparison table). Capture after a session: Qara has no automatic reflect; it retired the nightly reflect cron, pattern library and adaptation ledger on 2026-09-14 ("no nightly LLM reflection"), keeps `retro` (manual, one session, proposes environment changes, edits nothing until approved), explicit-only `compound` (verified fixes into `docs/solutions/`, with bounded recall: at most 3 matches, 1,200 characters each, 200 files scanned) and the file-based auto-memory. Curate and prune: `dream` mines 24 hours of transcripts nightly and files proposals as byte-exact ledger rows (`before`/`after` content) that JM applies, rejects or undoes by row id, so approval binds to bytes; `hygiene` and `/nightly-compact-records` apply retention rules (cited records stay, terminal ones are `git rm`'d with history recoverable); `knowledge-state` reports bounded metrics without editing prose. Evaluator: the memory-trust ledger (`ledger-judge.ts`, 23:30 and 23:35 cron) attributes outcomes to recalled memories and reorders `MEMORY.md`, which is the measurement plan 119 says brainmaxxing lacks. Principles: `MISSION.md` and `PRINCIPLES.md` are 77 and 110 lines (3 architectural and 6 operational principles), not 16 files read fresh by every plan.
- Why the reflect loop was retired, exactly: the record says a 2026-09-10 "introspection telemetry existence review" audited the introspect subsystem and the adaptation ledger against the July doctrine `decisions/2026-07-19-telemetry-informed-direction.md`, which had ratified a solo/trusted, judgment-driven stance and dropped the "measurement platform" as rot-prone, sanctioning only one-shot log mining. The review found that July's 57-commit run "grew a nightly reflection loop, a pattern library, and an 8.8k-LOC ledger, all contra that doctrine" and measured what each piece actually read; JM accepted its three recommendations on 2026-09-14 and the retirement landed 2026-09-23 (reflect cron, heartbeat machinery, SessionStart freshness nag, the whole `.claude/hooks/lib/adaptation/` tree; `introspect` kept as an on-demand miner). The evidence is therefore a doctrine mismatch plus the review's readership measurements. The review file itself is no longer in the tree (a search for it finds nothing), so its numbers cannot be re-checked here; only the decision record's summary is available. Two follow-ups: the replacement standing audit `introspect-reconcile` was never created (amendment 2026-11-16), and the revisit triggers are narrow (a new SessionStart staleness nag), which brainmaxxing does not meet.
- Why dream is not the same thing as meditate: `decisions/2026-08-14-dream-authority-split.md`: the unattended loop writes only staged rows; applying needs a human path; the ban sits in `appendRow` ("a new writer cannot forget the rule"), with the stated trade-off that throughput is capped by adjudication cadence. `scripts/dream/apply.ts` header and `apply-ops.ts:92` show apply "verifies drift (target bytes must still equal the row's `before`)", refuses with "target ... drifted from stored before", snapshots prior bytes to `undo/<id>.bak`, and archives rather than unlinks. That is stronger than plan 119's proposed `base_hash`.
- Why the trust ledger is the evaluator: `decisions/2026-06-18-outcome-trust-memory-ledger.md`: the session-end hook queues context, an offline judge (`ledger-judge.ts`) attests `worked` / `worked_with_changes` / `did_not_work` per memory, and session start reorders `MEMORY.md` entries within sections so trusted ones sit above Claude Code's positional truncation cut (200 lines or 25 KB). It scores recall use, not whether a note is true; `docs/MEMORY_DECISIONS_STATE.md` warns positive-only evidence is not proof of no negative outcomes.
- Mechanical checks: `bun scripts/memory-index.ts check` (part of `check:indexes`, `package.json:114`) finds index-block drift, gist length over a cap, dead links to member files, and text outside the generated block (`scripts/memory-index.ts:58-125`). The index block is compared section by section with one rebuilt from the member files, so a member missing from the index shows as drift.
- Transcript reach: the introspect miner's transcript library reads Claude Code `projects/*.jsonl` only (`miner-transcript-lib.ts:102`, `:140`); its hook-state logs read per-harness state roots for Claude Code, Droid, Codex and Cline (`miner-jsonl-source.ts:116-130`). Pi is hookless and contributes no state root (`knowledge-state/SKILL.md`). So Codex and Pi transcripts are not mined; Noodle's `ruminate` extractor, which parses Codex `session_meta` and `response_item` records, is ahead on that one point.
- Evidence: `$HOME/qara/decisions/2026-09-14-retire-reflect-loop-and-adaptation-ledger.md` (Decision, "What This Closes", Consequences); `.claude/skills/introspect/SKILL.md` ("pipeline was retired 2026-09-23"); `.claude/skills/dream/SKILL.md`; `.claude/skills/retro/SKILL.md`; `.claude/skills/compound/SKILL.md` ("Recall before design/build/review"); `docs/MEMORY_DECISIONS_STATE.md` (Memory, Decisions, State); `.claude/commands/nightly-compact-records.md` (Invariants); `.claude/skills/core/MISSION.md`, `.claude/skills/core/PRINCIPLES.md`.
- Basis: Verified (the files and code named above; the fetched review is absent so its measurements are second-hand); Unverified (fit judgements)
- Code: the files above.

**NBRAIN-11. Judge the 16 principles one by one: most are sound but already held; none justify adopting the pack.**
Assessment (full table in Reference). Sound, generic, and already in Qara in some form: `encode-lessons-in-structure` (Qara PRINCIPLES "Deterministic Code First", the promotion ladder, retro's "automated checks"), `prove-it-works` (including "trust artifacts, not self-reports"; Qara's verifier agent and evidence rule), `serialize-shared-state-mutations` (`.claude/context/shared-tree-discipline.md`), `subtract-before-you-add` (MISSION "Simplify Ruthlessly", `machinery-trimming`), `fix-root-causes`, `guard-the-context-window`, `cost-aware-delegation` (`delegation-guide.md`), `make-operations-idempotent`, `boundary-discipline`. One sentence earns a separate look: `fix-root-causes`' "Restart bugs: suspect state before code" (stale persistent state, then code). Conditional: `never-block-on-the-human` ("proceed, then present") fits Qara's autonomy rules for reversible work but conflicts with csf's human-gated admission and tobogan W-1, so it cannot be adopted as a blanket rule; `migrate-callers-then-delete-legacy-apis` fits Qara's deletion habit but is stated for projects with no external users. Risky or product-specific: `outcome-oriented-execution` ("intermediate breakage is acceptable") conflicts with green-at-every-commit gates; `redesign-from-first-principles` ("propagate through every reference") conflicts with Qara's code-style rule 5 ("touch only what the feature needs"); `experience-first` is product-design advice, not an agent principle; `exhaust-the-design-space` overlaps Qara's `design-it-twice`. `foundational-thinking` (data structures first, scaffold first) is sound but generic.
- Why: the principles are valuable as a reading list but the value is in the principles, not the machinery. They are short (10 to 26 lines), each with Why, Pattern and a test question, which is a good shape.
- Evidence: `bm:brain/principles/*.md` (all 16 read in full); `.claude/skills/core/PRINCIPLES.md`; code-style rule 5 as preloaded for the engineer agent.
- Basis: Verified (principle text); Unverified (judgements of fit)
- Code: Gap: none needed.

**NBRAIN-12. The one thing a brain adds is a committed, harness-neutral, per-repo store; decide whether that gap is real before building anything.**
Qara's auto-memory lives under `~/.claude/projects/<cwd>/memory/`: per user, per machine, read by Claude Code, not committed, not visible to a Codex or Pi session unless Qara routes it. A `brain/codebase/` tier is committed with the repo and read by any harness that sees the index. Qara covers this partly: `compound` writes committed `docs/solutions/{category}/{date}-{slug}.md` (manual capture only), csf repos carry `factory/_findings.md` (34 lines at cub, one-line debts with evidence), `factory/_decisions.md` (321 lines of rulings) and `.csf/records`. What is missing is only the automatic trigger after a work order, which is exactly the part Qara retired. The costs are poisoning (everything in the brain is injected as trusted context), secret leakage (ruminate copies transcripts into notes with no redaction), and the maintenance burden NBRAIN-7 describes.
- Why: what it would add: shared per-repo gotchas for every agent and harness, and a place for principles that plan and review read fresh. What it would replace: nothing in Qara; at most it would overlap `compound`'s corpus and the auto-memory's project facts. It would not replace dream, retro, hygiene or the trust ledger, which do different jobs.
- Evidence: `docs/MEMORY_DECISIONS_STATE.md` ("Memory"); `.claude/skills/compound/SKILL.md`; `/media/ssdev/tg-pro/cub/factory/_decisions.md`, `_findings.md`, `_state.md`; csf-build `skills/utilities/compound-learning/SKILL.md` (vendored copy of Qara's `compound`, provenance noted) and `skills/utilities/postmortem-improvement/SKILL.md` ("This produces plans, not fixes").
- Basis: Unverified (a judgement; no experiment run)
- Code: Gap, deliberately.

**NBRAIN-13. For csf, do not add an automatic reflect stage; csf already records learning in typed, human-reviewed places.**
csf persists run knowledge as admission and drain records (`.csf/records/...jsonl`), `factory/_decisions.md` (a work-order table with status, ruling date and a record link, then dated rulings), `factory/_findings.md` (one line per debt, severity, evidence, and a routing tag such as "routed → AD D962"), work-order and implementation files, and research documents under `research/` and `decisions/`. Learnings are rulings by named people with citations. How they are written and closed, from the files: `_decisions.md` is a ruling table (WO, status, ruled date, record link) with dated entries; in its post-split form (marker `<!-- csf:decisions-index v1 -->`) it holds exactly one ruling table as the sole status authority and per-WO history sits in `_decisions/WO-NNN.md`. `_findings.md` rows are one line each ("debt", "LOW", "MED", evidence with `path:line`, and a `routed → AD D9xx` tag when handed to a research doc); csf-build's `shared/conventions/statuses.md:124` defines them as "a human-authored record of known debt in a built project". The `csf-drift` skill (spec-to-code drift) is the one place with a full lifecycle: `audit` writes findings, `promote` writes a record plus a ledger pointer row, `address` (always after `--dry-run`) writes a dated intake note or a parked cleanup work order and flips the marker `open` to `routed:<ref>`, `status` is read-only, and `discharge` flips it to `discharged:<ref>` only for keys `status` reports ready (and a judge-originated finding needs `--confirm-judge` after JM confirms the fix). Every write verb runs "only on the keys/anchors JM names in the conversation". `compound-learning` in csf-build is a vendored copy of Qara's `compound` (provenance comment: commit `9bc610ec`, 2026-10-08, "Re-sync by hand"). `postmortem-improvement` is `status: partial`: Phases 0, A, B, C and the grill are measured; D and E refuse to run. A free-form reflect would write unreviewed prose into a system whose doctrine is that admission and rulings are the owner's typed act, and whose `postmortem-improvement` skill explicitly bans fixes during a harvest.
- Why: csf's strength is that every durable statement has an author and a source; a brain note has neither by default. The overlap that is worth keeping is smaller: `_findings.md` entries are the same shape as brain gotchas, and could be promoted into a per-repo note when a debt is closed.
- Evidence: `/media/ssdev/tg-pro/cub/factory/_decisions.md` (header, table and rulings), `_findings.md`, `/media/ssdev/tg-pro/cub/factory/work-orders/` (26 files); csf-build `skills/utilities/postmortem-improvement/SKILL.md`; tobogan `DOCTRINES.md` W-2 and R-2.
- Basis: Unverified (judgement), Verified (the record shapes)
- Code: Gap, deliberately.

**NBRAIN-14. Take two one-line text borrows and, if wanted, one dry run; do not install the pack.**
(1) The durability test (would I include this in a prompt for a different task: yes to the store, no to the plan doc, a skill issue to the skill, follow-up work to a todo) as one sentence in dream adjudication; it is the weak borrow because Qara's keep rules already say much the same. (2) `fix-root-causes`' restart-bug line in `triage-issue`. Optional: a read-only dry run of transcript mining on a scratch copy, compared against dream's rows for the same days; write nothing into any vault. Exact targets are in the Borrow list.
- Why: each borrow is a sentence, not machinery, which matches Qara's trimming direction. The experiment prices the one open claim (does mining history find things dream misses) without adding a standing loop.
- Evidence: see doctrines 4, 8, 10, 11; `.claude/skills/dream/SKILL.md` for what dream already mines.
- Basis: Unverified
- Code: Gap (nothing built).

**NBRAIN-15. Read Noodle's brain history as a feature that moved from built-in to optional, with only the skills surviving.**
Every plan under `brain/plans/` and `brain/archive/plans/` that concerns the brain, reflect, meditate, ruminate or self-learning, and whether the code at the pin shows it shipped (table in Reference). The pattern: the brain started as a first-class part of the product (a TUI Brain tab, a loop watcher on `brain/plans/`, first-run scaffolding of `brain/`), and each of those was then removed (`CHANGELOG.md:292` "Remove Brain tab"; `CHANGELOG.md:19` "remove brain/ scaffolding"), leaving a skill pack and a convention. The only open brain work is plan 119, and it is parked in the backlog behind 115, 84, 88, 90.
- Why: it shows the maintainer's own direction is to shrink the brain's footprint in the product, which supports not building brain machinery in Qara.
- Evidence: see the plan table; `brain/todos.md` priority list (119 is not among the priority ids `[115, 84, 88, 90, 118, 116, 117, 110, 96, 101, 100, 86, 111, 85, 69]`).
- Basis: Verified
- Code: none; history only.

## Borrow list

| Rank | What | Target | Size | Risk | Depends on |
|---|---|---|---|---|---|
| 1 | Add one sentence to the dream adjudication step: before applying a `memory` row, ask "would this go in a prompt for a different task?"; if no, route to the plan doc, the skill, or a todo instead. Weak borrow: `nightly-compact-records` already says "keep an entry when it changes future behavior" | Qara `.claude/skills/dream/workflows/adjudicate.md` (the per-row re-read step) | XS (2 lines) | Low; may duplicate existing keep rules | none |
| 2 | Add one line to the root-cause step: for "fails after restart" bugs, suspect persisted state (config, caches, locks, serialized state) before code | Qara `.claude/skills/triage-issue/SKILL.md` | XS (1 line) | Low | none |
| 3 | One read-only transcript-mining dry run on a scratch copy, compared with dream's rows for the same days, to test whether mining history finds what dream misses | Scratchpad only; no vault or memory write | S (one session) | Low if nothing is written; transcripts may hold secrets, so output stays in the scratchpad | Open 1 answered yes |
| 4 | Extend the introspect miner's transcript reader to Codex `session_meta` / `response_item` JSONL, copying Noodle's extractor logic (`.agents/skills/ruminate/scripts/extract-conversations.py`) | Qara `.claude/skills/introspect/tools/miner-transcript-lib.ts` | M (parser plus tests) | Medium: only worth it if Codex sessions are a large share of JM's work, which is not measured | a Codex share measurement |
| 5 | Closed-debt promotion: when a `_findings.md` row is discharged, optionally write a one-paragraph gotcha note | csf cub `factory/` (csf-build `csf-drift` discharge step) | M | Medium: adds an agent-written store to a human-ruled system | Open 2 |
| not | Install brainmaxxing or copy its six skills | | | Duplicates dream, retro, compound, hygiene; reintroduces the retired reflect loop | |
| not | Reflect after every session or work order | Qara, csf | | Retired 2026-09-14 for rot; csf gates learning on named rulings | |
| not | `meditate`'s apply-directly step, or any step that rewrites `~/.claude` memory from a repo skill | | | Edits outside the repo, no verification; Qara's dream binds approval to bytes | |
| not | The 16 principle files as a second doctrine set | | | Duplicates `MISSION.md` and `PRINCIPLES.md`; three conflict with Qara rules (NBRAIN-11) | |
| not | The auto-index hook as written | | | Matcher never fires (NBRAIN-5, verified), section list drifted; Qara has `scripts/memory-index.ts check` and `index-gen.ts` | |
| not | Plan 119's skill hill-climbing loop | | | Out of scope here; see NSKILL; needs eval cost and noise data that does not exist | NSKILL |

## Open

Decisions for the owner, one at a time, each with a recommendation:

1. Is there a real gap in "committed, per-repo, harness-neutral gotchas" for tobogan, csf or Qara-managed repos that `compound`'s `docs/solutions` and csf `_findings.md` do not cover? Recommendation: no; revisit after a month of noting each time an agent rediscovers something already known (NBRAIN-12).
2. Should csf's `csf-drift` discharge step (or `_findings.md` close-out) offer to write a durable gotcha note? Recommendation: no; csf already routes findings to notes and work orders under a human-named-keys rule. Decide only if question 1 is yes.
3. Should the two one-line text borrows (rows 1 and 2) go ahead? Recommendation: row 2 yes, row 1 only if you see dream rows routed to the wrong place; it is the weak one.
4. Is Codex a large enough share of your sessions to justify teaching the introspect miner Codex transcripts (row 4)? Recommendation: no until a share is measured.

Facts that cannot be known without running something:

- Whether reflect, meditate or ruminate measurably improve agent outcomes (no benchmark in either repo; plan 119 defers measurement).
- How often an agent actually reads brain notes after seeing the index (needs session logs from a Noodle run with brainmaxxing installed).
- Whether parallel reflect stages collide on `index.md` or the same note in practice (needs a multi-agent run).
- Whether the dream and trust-ledger loop finds what a transcript-mining pass misses (row 3 dry run).
- The 2026-09-10 existence review's measurements: its file is gone from the Qara tree, so only the decision record's summary can be read.

## Reference

### Brain layout in Noodle's own vault (pinned commit)

```
brain/
  index.md             # 65 lines, bare [[wikilinks]], sections Architecture, Principles, Codebase, Backlog, Plans
  vision.md  architecture.md   # elevator pitch; technical reference (214 lines)
  principles.md        # index of the 16 principle files, grouped Core/Architecture/Verification/Delegation/Meta
  principles/*.md      # 16 files, 10 to 26 lines each
  codebase/*.md        # 34 gotcha notes: Symptom / Root cause / Fix / See also
  todos.md             # backlog; frontmatter `priority: [ids]`, `<!-- next-id: 120 -->`, numbered items with #needs_plan tags
  plans/index.md       # + <id>-slug/overview.md and phase-N-*.md (8 live plan dirs)
  archive/completed_todos.md   # struck-through done items with the plan link
  archive/plans/       # finished plan directories (351 files)
```

Starter vault shipped by brainmaxxing: `brain/index.md`, `brain/principles.md`, `brain/principles/` (16 files), `brain/plans/index.md` (a one-line "# Plans"). No `todos.md`, `codebase/` or `archive/`; Noodle's docs say the starter creates "index.md, principles.md, and todos.md", which does not match the repository contents.

### brainmaxxing: every file

| File | What it is |
|---|---|
| `bm:README.md` (55 lines) | Pitch, mermaid loop, usage per skill, 4-step install ("Tell Claude Code: Install brainmaxxing ... into this project"), MIT |
| `bm:CLAUDE.md` (8 lines) | The "Brain" stanza the installer appends to a project's `CLAUDE.md`: read first, write after mistakes, one topic per file with wikilink indexes, delete outdated notes |
| `bm:.claude/settings.json` | SessionStart `startup|resume` -> `inject-brain.sh`; PostToolUse matcher `brain/` -> `auto-index-brain.sh` |
| `bm:.claude/hooks/inject-brain.sh` | Prints a header and `brain/index.md` |
| `bm:.claude/hooks/auto-index-brain.sh` | Rebuilds `index.md` as bare wikilinks grouped by top-level directory when disk files differ from linked files |
| `bm:.agents/skills/brain/SKILL.md` | Writing conventions, structure, durability test |
| `bm:.agents/skills/reflect/SKILL.md` | Scan conversation, route to brain / skills / structural fix / backlog |
| `bm:.agents/skills/meditate/SKILL.md`, `references/agents.md`, `scripts/snapshot.sh` | Audit loop, auditor and reviewer prompt specs, report template, snapshot script |
| `bm:.agents/skills/ruminate/SKILL.md`, `scripts/extract-conversations.py` | Transcript mining via agent team; JSONL extractor with `--batches`, `--from`, `--to`, `--min-size` |
| `bm:.agents/skills/plan/SKILL.md` | Phased plans into `brain/plans/NN-slug/`; reads all principles first; max 2-3 files per phase; 8-10 small phases |
| `bm:.agents/skills/review/SKILL.md` | Principle-grounded review, numbered issues with lettered options, severity, verdict Accept / Accept with notes / Revise |
| `bm:brain/index.md`, `principles.md`, `plans/index.md`, `principles/*.md` | Starter vault |
| `bm:.gitignore`, `.obsidian/*`, `LICENSE`, `brainmaxxing.png` | Housekeeping (the clone lists two Obsidian workspace files and `.DS_Store` as ignored or stray) |

No tests, no CI, no version file.

### The loop, as it flows

1. Session start (Claude Code only): `inject-brain.sh` prints `brain/index.md`. The agent is told to read relevant files.
2. During work: the agent may write notes (preamble and `CLAUDE.md` say so); `brain` skill rules apply.
3. After a session: `reflect` (by hand, or as a scheduled stage after `quality` in a Noodle order) scans the conversation, applies the structural-enforcement check, writes notes or skill edits or todos, updates the index. It ends with a summary (Brain / Skills / Structural / Todos).
4. Periodically: `meditate` builds two snapshots, runs the auditor (early exit if fewer than 3 actionable items), then the reviewer (synthesis, distillation of new principles with three tests: independent, evidenced by 2+ notes, actionable; skill review), reports, routes skill-specific findings to skills, applies, and refreshes the index.
5. Occasionally: `ruminate` mines `~/.claude/projects/<cwd>/` transcripts, 1 batch per about 20 conversations (min 2, max 10), agents on `opus`, filters by frequency and impact, applies what the user approves, then `rm -rf` of the temporary directory.
6. `plan` and `review` read all principles fresh on every run.

### Skill and hook table

| Name | Trigger in Noodle | Reads | Writes | Mechanical part |
|---|---|---|---|---|
| `brain` | on brain edits | `index.md`, entrypoints | notes, indexes | none |
| `reflect` | `schedule:` prose, after quality | conversation, `index.md` | brain, skills, todos | none |
| `meditate` | `schedule:` prose, standalone order | brain and skill snapshots, `~/.claude/projects/<p>/memory/`, `CLAUDE.md` | brain, skills, `CLAUDE.md`, memory, `.noodle/` stale state | `snapshot.sh` |
| `ruminate` | by hand | transcript JSONL | brain, skills | `extract-conversations.py` |
| `plan`, `review` | by hand or scheduled | principles | `brain/plans/` (plan only) | none |
| `inject-brain.sh` | SessionStart | `index.md` | stdout | the script |
| `auto-index-brain.sh` | PostToolUse (matcher in doubt) | `brain/**/*.md` | `brain/index.md` | the script |

### Qara and csf comparison

| Job | brainmaxxing / Noodle | Qara | csf | Position |
|---|---|---|---|---|
| Per-session capture | `reflect`, scheduled | Retired loop; manual `retro` (environment fixes only), explicit `compound` | Implementation records, `_findings.md` lines | Qara deliberately behind on automation, ahead on gates |
| Periodic curation | `meditate` applies directly | `dream` nightly, byte-exact ledger rows, human `apply/reject/undo`; `hygiene`; `/nightly-compact-records` as a reviewed PR | `csf-drift` promote step, `postmortem-improvement` (plans only) | Qara ahead |
| History mining | `ruminate` | `introspect` miner (daily, weekly); dream windows | `postmortem-improvement` Phase 0/A/B/C | Level; transcript formats differ |
| Evaluator | none; plan 119 proposes one | memory-trust ledger reorders `MEMORY.md`; `knowledge-state` freshness | closure and gate evidence | Qara ahead |
| Store | `brain/` committed, wikilinks, Obsidian | auto-memory (per user, frontmatter members plus `MEMORY.md` index), `docs/solutions`, `decisions/` with generated `DECISIONS.md`, `thoughts/`, Diderot vault retrieval | `factory/_decisions.md`, `_findings.md`, `.csf/records`, `research/`, `decisions/` | Brain behind on provenance, ahead only on committed per-repo gotchas tier |
| Injection | SessionStart prints index (Claude only) | CC loads `MEMORY.md`; `compound` recall bounded (3 matches, 1,200 chars, 200 files) | `CLAUDE.md` map, skills | Level; Qara bounded and cited |
| Principles | 16 files read fresh by plan and review | `MISSION.md` (77 lines), `PRINCIPLES.md` (110 lines, 3 + 6 principles), decisions | `DOCTRINES.md` style docs | Qara more compact |
| Retirement | prompted prune; `archive/` stays in tree | `git rm` terminal records, history recoverable; cited records kept | records immutable | Qara cleaner |
| Improvement ledger | none | `improve-repo` per-repo ledger, live head capped at 60 lines | n/a | Qara ahead |

### The 16 principles, assessed

All 16 files exist in both `bm:brain/principles/` and Noodle's `brain/principles/` under the same names, but the texts differ: Noodle's are longer originals (sections "Principle", "Why", "Pattern", "Boundaries"; 446 lines in total) and brainmaxxing's are condensed generic versions (bold "Why:" lines). The table summarises the brainmaxxing text; the rules do not change between versions in the two I diffed (`never-block-on-the-human`, `fix-root-causes`), and I did not diff the other 14. Verdict key: ADOPT = take it; HELD = already in Qara, file named; CONFLICT = clashes with the named rule; SKIP = not generic. The "held in" paths are from `.claude/skills/core/` and `.claude/context/` in Qara; whether each Qara file states it as strongly was judged from headings, not line by line.

| # | File | The rule in one sentence | Verdict |
|---|---|---|---|
| 1 | encode-lessons-in-structure | When you write the same instruction twice, make it a lint rule, flag, check or script and delete the instruction; route one-offs to a note, recurring fixes to a skill or rule, systemic issues to a principle. | HELD: `core/PRINCIPLES.md` "Deterministic Code First"; `retro` category "Automated checks"; the memory-feedback promotion ladder in Qara `CLAUDE.md` |
| 2 | prove-it-works | Verify the real thing directly, not a proxy or a delegate's self-report; inspect the artifact (diff, file, runtime). | HELD: `verifier` agent contract; `core/PRINCIPLES.md` "Quality Sniff Test" |
| 3 | serialize-shared-state-mutations | Enforce serialization of shared mutable state structurally (locks, phases, exclusive ownership) or remove the sharing (worktrees, separate files). | HELD: `.claude/context/shared-tree-discipline.md`; `file-lock.ts` (`MEMORY_DECISIONS_STATE.md` table) |
| 4 | subtract-before-you-add | Remove complexity first, then build; delete rather than leave a stub. | HELD: `core/MISSION.md` "Simplify Ruthlessly"; `machinery-trimming` skill |
| 5 | fix-root-causes | Reproduce, ask why to bedrock, do not add guards that silence symptoms, grep for the pattern not the instance; for "fails after restart", suspect stale persistent state before code. | HELD for the rule (`triage-issue`, `core/PRINCIPLES.md` "Solve the Real Problem"); ADOPT the restart-bug line only |
| 6 | guard-the-context-window | Route verbose output to subagents, read selectively, keep per-invocation templates inline in the skill. | HELD: `delegation-guide.md`; "Progressive Disclosure" in `core/PRINCIPLES.md` |
| 7 | cost-aware-delegation | Budget turns before delegating, front-load context, hard-cap scope per unit, exit early with passing work. | HELD: `delegation-guide.md`, `model-policy.md` |
| 8 | make-operations-idempotent | Every state-mutating operation must converge if run twice or after a crash at any point (reconcile, stale-lock detection). | HELD in practice: drain and dream locks (`scripts/dream/lock.ts`), `MEMORY_DECISIONS_STATE.md` "State"; not stated as a principle |
| 9 | boundary-discipline | Validate once at system boundaries; trust typed data inside; keep logic pure and the shell thin. | HELD: code-style rules and `hook-authoring`; generic and sound |
| 10 | foundational-thinking | Data structures first; scaffold (CI, lint, tests, shared types) before features; DRY at the type level, three similar lines beats premature abstraction. | HELD in part (YAGNI, TDD in `core/PRINCIPLES.md`); the "concurrency corollary" ("what if another actor modifies this?") is a good sentence; low priority |
| 11 | migrate-callers-then-delete-legacy-apis | When a new API is chosen, migrate callers and delete the old API in the same wave; no long-lived compatibility layers. | HELD in habit (Qara deletes machinery); conditional on no external users; csf has external contract surfaces, so not blanket |
| 12 | never-block-on-the-human | Proceed on reversible work and present results; ask only on real ambiguity; irreversible actions still need confirmation. | CONFLICT with csf admission (JM's typed `csf-admit`) and tobogan W-1 for questions; HELD for reversible work in `delegation-guide.md` § Autonomy and escalation |
| 13 | outcome-oriented-execution | Optimize for the verified end state; intermediate breakage is acceptable if planned, scoped and reversible. | CONFLICT with green-at-every-commit gates (tobogan R-6, Qara commit gates) |
| 14 | redesign-from-first-principles | Integrate a change by redesigning as if it had been a day-one assumption, propagating through every reference. | CONFLICT with `code-style` rule 5 "touch only what the feature needs"; HELD as "Reason from First Principles" in `core/PRINCIPLES.md` |
| 15 | exhaust-the-design-space | For novel, non-obvious decisions build 2 to 3 competing prototypes before committing. | HELD: `design-it-twice` skill |
| 16 | experience-first | The user experience is the product; prefer delight over implementation convenience; say no to a thousand things. | SKIP: product-design advice; no home in an operating layer |

Tally: 10 HELD, 1 HELD plus one adoptable line (5), 1 conditional (11), 3 CONFLICT (12, 13, 14), 1 SKIP (16). The rules are well written: each has a Why, a Pattern and a test question.

### Per-skill reference (brainmaxxing text; Noodle fork differences marked)

**`brain`** (`bm:.agents/skills/brain/SKILL.md`)
- Trigger: any task that persists knowledge; "brain/ modifications", "add to brain". Model-invoked, not scheduled.
- Inputs: `brain/index.md`, then the relevant entrypoint (`brain/principles.md` for principle changes); for directories without an index, scan nearby files and edit an existing note.
- Writes: notes under `brain/` (one topic per file, `[[wikilinks]]`, plain markdown with `# Title`, no frontmatter, about 50 lines max, bullets over prose), then `brain/index.md` and the relevant entrypoint.
- May delete: "outdated or subsumed notes"; merges overlapping notes before adding. Noodle's fork adds "delete random-named files in `brain/plans/`" (stale plan-mode artifacts).
- Commits: nothing. Test it applies before writing: "Would I include this in a prompt for a different task?" (yes: brain; plan-specific: plan docs; skill issue: the skill; needs follow-up: a todo).

**`reflect`** (`bm:.agents/skills/reflect/SKILL.md`)
- Trigger: end of session, after a mistake or correction, or after significant codebase learning; "reflect", "remember this". In Noodle, a `schedule:` prose line runs it as a stage after `quality` in an order.
- Inputs: `brain/index.md` and the conversation (mistakes and corrections, preferences, codebase knowledge, tool quirks, decisions, friction in skills or delegation, repeated manual steps). Skips the trivial and what is already captured.
- Writes: brain notes (default); skill files under `.agents/skills/<skill>/` for skill-specific learnings; structural fixes (a lint rule, script, flag or check) instead of a note when possible; todos for follow-up. Then updates `brain/index.md`. Ends with a "Reflect Summary" (Brain / Skills / Structural / Todos).
- May delete: nothing stated. Noodle's fork routes delegation heuristics to `brain/delegation/` and files todos through a `todo` skill.
- Commits: nothing in the pack; in Noodle the stage's worktree is merged by the loop.

**`meditate`** (`bm:.agents/skills/meditate/SKILL.md`, `references/agents.md`, `scripts/snapshot.sh`)
- Trigger: after the brain has accumulated content; "meditate", "audit the brain". Noodle: `schedule:` "Standalone single-stage order after several reflect cycles have accumulated. Expensive, don't over-schedule."
- Inputs: snapshots of `brain/` and `.agents/skills/` (written to `/tmp/brain-snapshot.md`, `/tmp/skills-snapshot.md`), the auto-memory directory `~/.claude/projects/<project>/memory/`, and `CLAUDE.md`. Spawns a read-only `general-purpose` auditor, then (unless it found fewer than 3 actionable items) one reviewer for synthesis, distillation and skill review.
- Writes: "Apply all changes directly. The user reviews the diff": update or delete outdated notes, merge redundant ones, delete low-value ones, condense verbose ones, add wikilinks, reword tensions, add new principles (only from distillation: independent, evidenced by 2 or more notes, actionable), merge principles, rewrite or delete `CLAUDE.md` content, delete or rewrite stale memories, update skills directly, refresh `brain/index.md`. Noodle's fork also tightens skill `description` frontmatter and cleans stale `.noodle/` state.
- May delete: brain notes, principles (by merge), `CLAUDE.md` sections, auto-memory files (outside the repo).
- Commits: the pack says the user reviews the diff; Noodle's "Autonomous Session Mode" applies high-confidence changes, files todos for risky ones, and commits with the `commit` skill.

**`ruminate`** (`bm:.agents/skills/ruminate/SKILL.md`, `scripts/extract-conversations.py`)
- Trigger: occasional, by hand ("ruminate", "mine my history"); never scheduled.
- Inputs: a brain snapshot (via meditate's `snapshot.sh`), then `~/.claude/projects/-<cwd-with-dashes>/*.jsonl` transcripts, extracted to text in a temporary directory and split into batches (1 per about 20 conversations, 2 to 10). Agents run on `opus` in parallel and look for corrections, recurring preferences, technical learnings, workflow patterns, frustrations and wished-for skills.
- Writes: findings files in the temp directory; then, only what the user approves from a findings table (finding, frequency or evidence, proposed action): brain notes (default to updating existing), skill edits. Updates `brain/index.md`.
- May delete: removes the temporary extraction directory (`rm -rf "$OUT_DIR"`); no brain deletions.
- Commits: nothing. Noodle's fork parses Codex transcripts too (`--claude-dir`, `--codex-dir`, `--cwd`).

**`plan`** (`bm:.agents/skills/plan/SKILL.md`)
- Trigger: medium-to-large tasks; "plan this". Planning only: it must not implement.
- Inputs: all of `brain/principles.md` and every linked principle, read fresh; user answers to scope questions; Explore subagents; installed skills for the domain.
- Writes: `brain/plans/NN-slug/overview.md` and `phase-N-*.md` (each phase: goal, changes, data structures, static and runtime verification; 1 function or type plus tests, at most 2 to 3 files, 8 to 10 small phases), and a link in `brain/plans/index.md`.
- May delete: one-off skills it installed for the plan ("delete any one-off skills that won't be needed again").
- Commits: nothing. Step 4 may install a third-party skill project-locally via `find-skills`.

**`review`** (`bm:.agents/skills/review/SKILL.md`)
- Trigger: "review", "code review". No changes made.
- Inputs: principles read fresh, the diff or plan (BIG CHANGE: 50 or more lines, 3 or more files, or new architecture: up to 4 issues per section; SMALL: one), plan phase scope.
- Writes: nothing; numbered issues with severity (high / medium / low), lettered options, and a verdict (Accept / Accept with notes / Revise).
- Commits: nothing.

### Plans about the brain in Noodle's `brain/`, and whether the code shows them shipped

| Plan | What it proposed | Shipped at the pin? |
|---|---|---|
| `archive/plans/23-task-type-skill-suite` (phase-07 reflect, phase-08 meditate) | Rewrite `reflect` for cook sessions (narrow scope: mistakes and corrections; structural-enforcement check before a note; one topic per file) and `meditate` (brain cleanup and principle extraction), grounded in `encode-lessons-in-structure` and `subtract-before-you-add` | Yes: both skills exist in `.agents/skills/`; the planned `noodle:` frontmatter key is gone and the skills now carry `schedule:` prose |
| `archive/plans/25-tui-revamp` (phase-06) | A TUI "Brain" tab: recent brain activity grouped by agent, glamour markdown preview | Built then removed: `CHANGELOG.md:273` adds it, `:292` removes it; the Go TUI was deleted by plan 47 (`archive/plans/47-delete-go-tui`, phase-05 cleans brain references) |
| `archive/plans/20-onboarding` (phase-06) | Concept pages for the brain and modes | Yes: `docs/concepts/brain.md` exists (its first heading reads "Self-Learning", a doc slip) |
| `archive/plans/47-delete-go-tui` phase-05 | Remove brain references left by the TUI | Yes (the tab is gone) |
| `CHANGELOG.md:19`, `:5` (no plan file read) | Remove `brain/` first-run scaffolding; move default backlog from `brain/todos.md` to `todos.md` | Yes: `startup/firstrun_test.go:30-31` asserts no `brain/` is created |
| `archive/plans/28`, `74`, `89` | Documentation and brain updates after renames and cleanups (phase files named "update docs, skills and brain") | Housekeeping; not about the learning loop |
| `plans/119-brainmaxxing-autoresearch` | Curator gate and typed edit proposals for meditate, skill hill-climbing with binary evals, structured findings consumed by reflect | No: the target repo (`~/code/brainmaxxing`) at the studied commit lacks `eval-guide.md`, `findings-schema.md` and the curator spec; todo 119 is open and not in the priority list |

### Brain function side by side: Qara and csf mechanisms

| Function | brainmaxxing / Noodle | Qara mechanism (paths in `$HOME/qara`) | csf mechanism (cub checkout / csf-build) |
|---|---|---|---|
| Capture | `reflect` after a session; direct writes during work (preamble) | Explicit only: `.claude/skills/compound/SKILL.md` (verified fixes into `docs/solutions/`); `.claude/skills/retro/SKILL.md` (proposals about the environment); auto-memory writes by the agent under `~/.claude/projects/<cwd>/memory/`; the DEBT: section on every return (`decisions/2026-11-18-debt-capture-doctrine.md`) | `factory/_findings.md` one-line debts; `factory/implementation/WO-*-IMPLEMENTATION.md`; `.csf/records/*.jsonl`; csf-build `skills/utilities/compound-learning` (vendored from Qara) |
| Recall | agent reads `brain/` files named in the index | `compound.ts` `recallSolutions` (3 matches, 1,200 chars, scan caps); `.claude/skills/diderot/SKILL.md` for the vault; `MEMORY.md` loaded by Claude Code | `factory/_decisions.md` ruling table, `factory/_state.md`, `factory/_findings.md`; `compound-learning` recall (who reads them at run time was not traced) |
| Consolidation | `meditate` merge and distillation; `ruminate` back-fill | `dream` staged rows (`scripts/dream/`, adjudicate in `.claude/skills/dream/workflows/adjudicate.md`); `memory-index.ts` rebuild and archive; `/nightly-compact-records` (`.claude/commands/nightly-compact-records.md`) | `csf-drift` promote, address, discharge (`skills/utilities/csf-drift/workflows/`); `postmortem-improvement` plans |
| Pruning | `meditate` deletes directly; `archive/` stays in the tree | Retire by `git rm` once uncited (`DECISIONS.md` header; `decisions/2026-10-25-repo-keeps-fresh-history-in-git.md`); `hygiene` workflows; `knowledge-state` reports only | Records immutable; `_decisions/WO-NNN.md` split; `discharge` closes debt on evidence |
| Evaluation | none (plan 119 proposes) | Memory-trust ledger `.claude/skills/introspect/tools/ledger-judge.ts` and `decisions/2026-06-18-outcome-trust-memory-ledger.md`; `knowledge-state:check-age`; dream doctor gauges (`bun run dream:doctor`) | Gates and closure evidence per WO; `csf-drift status` (`ready`, `reproduces`) |
| Injection at session start | `inject-brain.sh` prints `index.md` (Claude only; auto-index hook inert) | Claude Code loads `MEMORY.md`; Qara's session-start hook reorders entries by trust (decision 2026-06-18) and warns at 70 percent of the truncation budget (decision 2026-04-19); `CLAUDE.md` map | `CLAUDE.md` / `AGENTS.md` and the skills' own workflows; no brain injection |
| Cross-harness reach | Claude via hooks; Codex via `CLAUDE.md` fallback only (`.codex/config.toml`) | Memory and hooks are Claude-centred; Codex, Droid and Pi parity is in `docs/HARNESS-PARITY.md`; Pi is hookless (`knowledge-state/SKILL.md`); miner transcripts are Claude-only | Repository files, so any harness that reads the repo sees them |

### Embedded agent instructions found (material, not followed)

- `bm:README.md` Installation and Noodle `INSTALL.md:155-159`: an agent is told to copy `brain/`, `.agents/skills/`, `.claude/hooks/`, merge hook config into `.claude/settings.json`, and append to the project's `CLAUDE.md`. Installs executable hooks that run at every session start.
- `bm:CLAUDE.md` / Noodle `CLAUDE.md:5-12`: standing instruction to read and write the brain.
- `dispatcher/preamble.go:20`: injected into every cook session, even with no brain.
- Noodle `meditate` "Autonomous Session Mode": apply high-confidence changes without review and commit.
- `bm:meditate` steps 2 and 6: audit and rewrite or delete the user's auto-memory directory and `CLAUDE.md` (writes outside the brain).
- `bm:plan` Step 4 and `bm:review` Step 4: if no installed skill matches, "use `find-skills` to search ... install it (project-local)": fetches and installs third-party skills during a run.
- `bm:ruminate` Step 4: spawn a team of agents on `opus`; Step 7: `rm -rf "$OUT_DIR"`.
- `bm:plan`/`review`: "Do NOT skip this. Do NOT use memorized principle content": a prompt-injection-shaped instruction, benign here.
- Credentials: none found. `extract-conversations.py` copies transcript text and has no redaction, so notes derived from it can carry secrets into a committed repository.

## Sources

- Noodle `82d2921c52370f23f29086de81ccfb600939c037`: `docs/concepts/brain.md`, `docs/cookbook/self-learning.md`, `docs/reference/faq.md`, `docs/concepts/{scheduling,skills,runtimes}.md`, `docs/thinking-in-noodle.md`, `INSTALL.md`, `CLAUDE.md`, `CHANGELOG.md`, `dispatcher/preamble.go`, `adapters/main.go`, `startup/firstrun_test.go`, `e2e/smoke_test.go`, `loop/builtin_bootstrap.go`, `.agents/hooks/*`, `.agents/skills/{brain,reflect,meditate,ruminate,plan,review,schedule}/`, `.claude/settings.json`, `.codex/config.toml`, `brain/` (index, principles, vision, architecture, todos, codebase, plans/119-brainmaxxing-autoresearch, archive).
- brainmaxxing `ec4d8e43dee639d6f5d94aed3ca16af7b298ecfc`: all files listed in the Reference table.
- Qara: `decisions/2026-09-14-retire-reflect-loop-and-adaptation-ledger.md`, `docs/MEMORY_DECISIONS_STATE.md`, `.claude/skills/{knowledge-state,dream,retro,introspect,hygiene,compound,diderot,learn,improve-repo}/SKILL.md`, `.claude/commands/nightly-compact-records.md`, `.claude/skills/core/{MISSION,PRINCIPLES}.md`, `CLAUDE.md`.
- csf and cub (read only): `/media/ssdev/tg-pro/cub/factory/{_decisions,_findings,_state}.md`, `factory/work-orders/`, csf-build `skills/utilities/{compound-learning,postmortem-improvement}/SKILL.md`.
- Cross-references: NSKILL (skills authoring, plan 119's skill refinement), NSCHED (when reflect and meditate stages run), NMODE (worktrees and merge flow the brain relies on), NADAPT (Codex and Claude session formats the extractor reads), NVIEW (monitor and UI brain tab history).
