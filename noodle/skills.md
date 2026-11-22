# NSKILL: Noodle's skills, "skills that run themselves", and what Qara could take from them

**Track:** noodle · **Type:** research · **Date:** 2026-11-23

**Question:** How do Noodle skills work (format, discovery, loading, turning a skill into a schedulable task type, composition, validation, the skills Noodle ships), how does that compare with Qara's skill system and csf-build's stages, and which parts of "skills that run themselves" are worth borrowing?

**Scope:** The skill feature only. Skill file format and frontmatter; discovery, resolution and loading; how a skill becomes a task type and a stage; composition; `skill-creator`; the `noodle skills` and `noodle schema` commands; validation; the docs and examples; every skill the Noodle repo ships; Qara's and csf-build's skill systems for comparison. The scheduler's own behaviour, the loop, brain, modes, adapters and the CLI/UI belong to the sibling documents (NSCHED, NBRAIN, NMODE, NADAPT, NVIEW) and are touched only where a skill depends on them.

**Sources:** Noodle `poteto/noodle` at commit `82d2921c52370f23f29086de81ccfb600939c037` (v0.1.5, MIT, Go, last pushed 2026-03-19), read from a local clone, nothing built or run. brainmaxxing at `ec4d8e43dee639d6f5d94aed3ca16af7b298ecfc` (not read in depth here; see NBRAIN). Qara at `$HOME/qara` as of 2026-11-23. csf-build as installed in `/media/ssdev/tg-pro/cub/node_modules/csf-build` (read only). Paths without a prefix are relative to the Noodle repo root. Full list under Sources.

## Summary

Noodle's whole skill mechanism is small. A skill is a directory with a `SKILL.md`. The only Noodle-specific frontmatter key that does anything is `schedule:`, a free-text sentence. A skill with a non-empty `schedule:` is a "task type"; the loop collects every task type into a list and hands that list to an LLM "scheduler" skill, which writes orders (pipelines of stages), and each stage names a skill that the loop then loads into an agent session. "Skills that run themselves" therefore means: the trigger is prose, read by a model, not a cron expression or a typed rule. There is no code that evaluates a `schedule:` string.

The code is about 400 lines of Go (`skill/` plus `internal/taskreg/` plus `dispatcher/skill_bundle.go`). The "composition" is not a feature of the skill format: skills do not declare dependencies, and nothing resolves one skill from another. Composition is the scheduler model placing task types into stage lists, plus prose such as "use `Skill(debugging)`".

Findings that matter for Qara:

- Noodle has no embedded default skills. `defaults/` holds only four backlog adapter scripts. The repo's `.agents/skills/` is a catalogue to copy from, and `INSTALL.md` tells an agent to fetch one skill (`noodle`) verbatim from GitHub and write the rest itself.
- The `model:` frontmatter key is parsed and never read anywhere in the Go code.
- The `skill-creator` copy under `skills/` validates frontmatter against Anthropic's open-standard key list, which does not contain `schedule`. It would reject Noodle's own task-type skills.
- Qara is ahead on structure, validation, drift checks and typed recurring-work registries (`standing-audits`, the dream loop). The one gap I first saw (a skill cannot declare its own run condition) did not survive a close reading: the typed `standing-audits` registry already holds cadence, probe and owner and is tested against the skills on disk (NSKILL-15, withdrawn). What is left to borrow is small: three authoring rules and one review-skill convention (Borrow list). At startup, one broken skill ends the loop after three cycles; during a run the old registry is kept (NSKILL-13).

## Doctrines

**NSKILL-1. Treat a Noodle skill as a markdown prompt directory with one active extension key, `schedule`; do not assume a richer skill schema.**
The parsed frontmatter struct has four fields: `name`, `description`, `model`, `schedule`. Unknown keys (for example `license:` in `frontend-design`) are ignored by the YAML decoder, not rejected. There is no permissions, tools, allowed-tools, trigger or dependency key. The brief's "permissions metadata" does not exist as a skill key: a 2026 changelog line "Restructure noodle skill with permissions docs (phase 7)" refers to documentation text, and the word "permission" appears in the configuration reference, not in `skill/`. History explains the name: plan 89 shows task-type metadata used to sit in a `noodle:` block with `schedule`, `permissions.merge` and `domain_skill`; the plan removed the last two (merge detection moved to a runtime worktree check, domain skills became a plain `Skill(backlog)` call) and promoted `schedule` to the top level, deleting `NoodleMeta`. The Go code matches the end state.
- Why: designing Qara changes around a skill schema Noodle does not have would borrow nothing.
- Evidence: `skill/frontmatter.go:10-16` (struct), `:19` (`IsTaskType`); `brain/archive/plans/89-simplify-task-type-frontmatter/overview.md` (its own header still says `status: active`; the code shows it done); `rg "permission"` over `skill/`, `internal/taskreg/` and `.agents/skills/*/SKILL.md` finds no skill key.
- Basis: Verified
- Code: `skill/frontmatter.go`

**NSKILL-2. Discovery is a plain directory scan over an ordered path list; first match wins, and there are no embedded or built-in skills.**
`[skills] paths` in `.noodle.toml` defaults to `[".agents/skills"]`. For each path, in order, a directory counts only if it contains `SKILL.md`. `Resolve(name)` returns the first path that has `<path>/<name>/SKILL.md`; `List()` returns each name once, from the first path that has it. Paths may use `~`. A missing path is skipped silently. Relative paths resolve against the process working directory, and the root command changes into the project directory (`--project-dir`, else `NOODLE_PROJECT_DIR`, else cwd) before loading config, so for CLI use they resolve against the project. A stat error other than "not exist" is returned, not swallowed. Project skills override anything lower in the list by being earlier in the list. `.claude/skills` is not searched by default; in the Noodle repo it is a symlink to `.agents/skills`, which is how Claude Code sees the same files.
- Why: the "defaults under `defaults/` and `skills/`" the brief expected are not skills: `defaults/` is adapters only, and `skills/skill-creator` at the repo root is a copy of Anthropic's skill that is not on the default search path and not embedded (`embed.go` embeds only `ui/dist/client`).
- Evidence: `skill/resolver.go:36-72` (`Resolve`), `:75-118` (`List`), `:121-135` (`resolveSearchPath`); `config/types_defaults.go:214-215`; `config/parse.go:64-71` (empty `paths` falls back to the default with a warning); `root.go:41-47,83-100` (`resolveProjectDir`, `os.Chdir`); `embed.go:8`; `docs/concepts/skills.md`; `.claude/skills` is a symlink (`ls -la .claude`).
- Basis: Verified
- Code: `skill/resolver.go`, `config/types_defaults.go`

**NSKILL-3. A skill becomes a task type if and only if its `schedule` string is non-empty; the registry is rebuilt from disk, and the loop treats a stale registry as a recoverable condition.**
`DiscoverTaskTypes` lists every skill with metadata and keeps those where `IsTaskType()` is true. `taskreg.NewFromSkills` indexes them by a normalised skill name (`Key`), carrying the `schedule` string and the skill's absolute path. The registry is rebuilt (a) when an fsnotify watcher over the skill paths fires (200 ms debounce, sets an atomic "stale" flag checked at the next cycle), (b) once as a retry when order validation fails, (c) once before dispatching a stage whose skill is not in the registry ("in case fsnotify missed an event"), and (d) after the bootstrap session finishes. A malformed frontmatter in any skill makes `ListWithMeta` return an error for the whole listing, so one broken skill fails discovery for all (see NSKILL-13).
- Why: this is the entire "skills that run themselves" mechanism in code. The runtime consequence is that adding a skill directory with a `schedule:` line is enough to make the scheduler aware of it on the next cycle, with no registration step.
- Evidence: `skill/frontmatter.go:19`; `skill/resolver.go:179-190` (`DiscoverTaskTypes`), `:139-176` (`ListWithMeta` returns the first error); `internal/taskreg/registry.go:30-50`; `loop/loop.go:139-146` (`discoverRegistry`), `:342-350` (watcher sets `registryStale`), `:454-459` (rebuild at cycle start); `loop/cook_spawn.go:20-27`, `:51-54`; `loop/cook_completion.go:102-104`; `skill/watcher.go:30-60,65-117`; `skill/watcher_test.go` (add, debounce, chmod ignored, new subdir, remove subdir, cancel, sibling events).
- Basis: Verified
- Code: `skill/`, `internal/taskreg/`, `loop/loop.go`

**NSKILL-4. The `schedule:` string is prose for a model; no code parses, matches or evaluates it.**
`buildOrderTaskTypesPrompt` renders each task type as `- <key>: <schedule>` under "Task types you may schedule:" and that text goes into the scheduler agent's prompt. The same data goes into `mise.json` as `task_types[] {key, schedule}`. The docs say so directly: "The scheduler does not parse these strings mechanically. It reads them as prose and uses judgment." There is no cron grammar, no event match, no condition engine. Event-driven reactions happen because the scheduler also sees `recent_events` in `mise.json` and is told to use judgment (`.agents/skills/schedule/SKILL.md`, "Using Events for Scheduling").
- Why: this is the key difference from Qara's `standing-audits` registry, where cadence and evidence probes are typed and checked by code (NSKILL-12). Noodle trades determinism for zero configuration.
- Evidence: `loop/schedule.go:342-358` (`buildOrderTaskTypesPrompt`); `mise/types.go:42-46,66` (`TaskTypeSummary`, `task_types`); `docs/concepts/skills.md` ("The scheduler does not parse these strings mechanically"); `docs/thinking-in-noodle.md` ("Describe when, not how to trigger", cron example marked "not this").
- Basis: Verified
- Code: `loop/schedule.go`, `mise/`

**NSKILL-5. A stage reaches a skill through a name match, and a stage naming a non-task-type skill is silently dropped at validation.**
The scheduler writes the compact wire format (`do`, `with`, `model`, `runtime`, `prompt`, `extra_prompt`, `extra`, `group`). `ExpandCompactOrders` sets both `TaskKey` and `Skill` to the `do` value; `with` becomes the provider. Validation (`NormalizeAndValidateOrders`) keeps a stage only if it has no task key but a prompt, or if `ResolveStage` finds a registered task type (order of lookup: `task_key`, then `skill`, then stage id). An order whose stages are all invalid is dropped, and stage-level drops are not errors: the function sets `changed` and returns the pruned file. So `do: commit` (a general skill with no `schedule`) is removed from the pipeline without a hard error; the scheduler is told about this only through the later "PREVIOUS ORDERS ISSUE" text if the whole file was rejected or repaired.
- Why: it means a skill without `schedule:` can never be a stage. General skills are reachable only by an agent calling `Skill(name)` inside a session. That is a coherent design, but it is enforced by silent pruning, not by a message to the author.
- Evidence: `internal/orderx/compact.go:11-20,75-96`; `internal/orderx/orders.go:164-232` (drop logic at the stage filter), `:236-246` (`isValidStageTaskType`); `internal/taskreg/registry.go:66-90`; `loop/schedule.go:284-295,296-300` (prompt text); `brain/codebase/schedule-order-normalized-away-when-skill-missing.md` (the one exception: order id `schedule` with task key `schedule` survives so bootstrap can run).
- Basis: Verified
- Code: `internal/orderx/`, `internal/taskreg/`

**NSKILL-6. Loading a skill into a session means pasting the body and every file under `references/` into the system prompt (Claude) or deferring to the provider's native skill loader (Codex); `scripts/` and `assets/` are never read by Noodle.**
For Claude, `loadSkillBundle` builds `# Skill: <name>`, `## SKILL.md` (frontmatter stripped), then each file under `references/` sorted by path, each under `## references/<path>`. For Codex, `composePrompts` returns no system prompt; the stage prompt tells the agent `Use Skill(<name>) for methodology.` and Codex loads the skill itself. A 50 KB reference budget for Codex is coded in `loadSkillBundle` and tested, but both dispatchers pass the bundle through `composePrompts`, which returns an empty system prompt for any provider other than Claude (Codex gets only the preamble appended to the prompt); so the Codex budget affects nothing the agent sees. Its only live effect is the truncation warning stored in the session metadata. `architecture.md:206` says Codex skills are "inlined via stdin", which the code does not do. A skill that is not found at dispatch is a warning ("proceeding without methodology"), not a failure.
- Why: the "three-level progressive loading" the authoring guide describes (metadata, body, references on demand) is not what the dispatcher does for Claude: every reference file is always inlined. A skill with 47 reference files would paste all of them. The shipped `react-best-practices` skill has 47 reference files and is a general skill, so it is only ever loaded by an agent calling `Skill(...)`, not by the dispatcher.
- Evidence: `dispatcher/skill_bundle.go:19-111`; `dispatcher/command.go:16` (limit), `:119-131` (`composePrompts`); `dispatcher/process_dispatcher.go:148-154` and `dispatcher/sprites_dispatcher.go:165-171` (both call `composePrompts`, `.Warnings` kept at `:105` and `:122`); `brain/architecture.md:206`; `dispatcher/dispatch_helpers.go:11-17`; `loop/util.go:25-27` (`Use Skill(%s) for methodology.`); CHANGELOG "Stop inlining skill content for Codex sessions" and "Non-fatal skill resolution at dispatch".
- Basis: Verified
- Code: `dispatcher/skill_bundle.go`, `dispatcher/command.go`

**NSKILL-7. "Composition" is the scheduler placing task types into an ordered or grouped stage list, plus prose references between skills; there is no declared dependency or include mechanism.**
An order is `{id, title, plan[], rationale, stages[]}`. Stages run sequentially; stages sharing a `group` number run concurrently and groups run in ascending order. A follow-up relationship ("quality after execute", "reflect after quality") lives in the follower's `schedule:` sentence and in the scheduler skill's instructions, never in a field. Skill-to-skill calls are prose (`Use Skill(skill-creator)`, `Skill(backlog)`). The docs admit the weakest point: "`Skill(name)` seems to work best as a way to reliably get skills invoked." The `schedule` skill also tells the model what to do when a stage has no `do` (a "prompt-only" stage), and forbids `do: execute` for plan-first work because the execute skill's text would conflict with the plan skill's text.
- Why: adding a skill needs no edit to existing ones ("Let the scheduler compose" in `thinking-in-noodle.md`), which is the attractive property. The cost is that ordering rules are scattered through prose in several files and enforced by model judgement, so a regression shows up as a bad schedule, not a failing test.
- Evidence: `docs/concepts/skills.md` "Composition"; `docs/thinking-in-noodle.md` "Let the scheduler compose"; `.agents/skills/schedule/SKILL.md` "Orders Model", "Items without plans"; `.agents/skills/noodle/references/skill-authoring.md` "Stage Composition"; `internal/orderx/types.go:31-52`; `internal/schemadoc/specs.go:84-101`.
- Basis: Verified
- Code: `internal/orderx/`, `.agents/skills/schedule/SKILL.md`

**NSKILL-8. Noodle self-heals a missing scheduler skill by dispatching an agent to write one; the only skill Noodle can create for itself is `schedule`.**
If the registry has no `schedule` task type, the loop dispatches a `bootstrap-schedule` session with a built-in system prompt (`loop/builtin_bootstrap.go`). The prompt tells the agent to read `todos.md`, conversation history under `.claude/` or `.codex/`, `.noodle.toml` and the directory layout, write `.agents/skills/schedule/SKILL.md` from an inline example, `git add` and commit it (`feat: bootstrap schedule skill`), and exit. It is limited to three attempts; the third failure sets `bootstrapExhausted` and the loop only logs. A parallel path creates an `oops-bootstrap-schedule` order for the `oops` skill when `oops` exists. The agent is told to use `Skill(skill-creator)`, which only exists if the user installed it.
- Why: this is the closest thing in Noodle to a skill that creates a skill, and it is a narrow, bounded bootstrap, not a general "write skills from experience" loop. The `reflect` and `meditate` skills do route learnings into skill files, but through prose (NSKILL-9, NBRAIN).
- Evidence: `loop/builtin_bootstrap.go:10-83`; `loop/schedule.go:88-137,139-215,217-282` (bootstrap dispatch, attempt cap at `:258`); `loop/cook_completion.go:95-114`; `brain/codebase/schedule-order-normalized-away-when-skill-missing.md`.
- Basis: Verified
- Code: `loop/builtin_bootstrap.go`, `loop/schedule.go`

**NSKILL-9. Noodle ships 29 skills in `.agents/skills/` (8 task types, 21 general), plus Anthropic's `skill-creator` in `skills/`; only the task types are schedulable, and most of them lean on `brain/` and on `noodle` CLI commands.**
The full catalogue is in the Reference section. Task types (non-empty `schedule`): `adversarial-review`, `execute`, `meditate`, `oops`, `plan`, `quality`, `reflect`, `schedule`. Everything else is a general skill, including `review`, `debugging`, `commit`, `testing`, `worktree`, `brain`, `todo`, `refine`, `ruminate`, `unslop` and the language and design skills. The repository's `.claude/skills` is a symlink to `.agents/skills`, and `.claude/agents` and `.claude/hooks` are symlinks into `.agents/`, so one directory serves both Claude Code and Noodle.
- Why: the useful reading is that only a handful of skills need a `schedule:` line, and every one of them is a process skill (plan, execute, check, learn, fix) rather than a knowledge skill.
- Evidence: frontmatter of each `SKILL.md` (table in Reference); `ls -la .claude`.
- Basis: Verified
- Code: `.agents/skills/*/SKILL.md`

**NSKILL-10. Skills can emit structured machine-readable results through the CLI, not just prose; this is the one place a skill's output is consumed by code.**
`quality` ends by running `noodle event emit --session $NOODLE_SESSION_ID stage_message --payload '{"message": ..., "blocking": true|false}'`; `execute` ends with `stage_yield`, and says "without this, the stage only completes on clean process exit — interrupted work is lost to the pipeline". The scheduler sees the result on its next cycle in `recent_events` and decides to retry, add an `oops` stage or abort. The verdict is therefore a typed event with a boolean, but what happens after a blocking verdict is again model judgement ("The scheduler reads findings and decides").
- Why: this is a small, copyable contract (skill ends by emitting a verdict record) that does not require the rest of Noodle. Event types and the event log are NADAPT's subject; here only the skill side matters.
- Evidence: `.agents/skills/quality/SKILL.md` "Verdict"; `.agents/skills/quality/references/stage-message-schema.md`; `.agents/skills/execute/SKILL.md` "6. Yield"; `cmd_event.go`.
- Basis: Verified
- Code: `cmd_event.go`, `.agents/skills/quality/`

**NSKILL-11. `noodle schema` documents the JSON contracts agents must write; it is generated from Go types plus a hand-kept field table, and `noodle skills list` is a bare four-column dump.**
`noodle schema list` prints the targets (`mise`, `orders`, `status`); `noodle schema <target>` prints markdown generated by reflecting over the Go type and joining a `FieldDocs` map keyed by dotted path (`orders[].stages[].do`). The scheduler's prompt embeds the same `orders` schema as JSON. `noodle skills list` prints tab-separated `name`, search path, `true`, skill directory. There is no validation command, no `--json`, no display of `schedule` or task-type status. `cmdmeta` is a static table of command names, short descriptions and flags used by the cobra wiring and by `generate/skill_noodle.go`; the generated `noodle` skill text is a static string and the generator "exists so CI can verify the checked-in snapshot matches" (a CI check, which JM's CI rule makes out of scope for adoption). The `parse/` directory is not about skills: it parses Claude and Codex session logs into a canonical event stream (NADAPT).
- Why: the schema command is the part worth studying for Qara: the agent is told "`noodle schema orders` is the source of truth" instead of a prose copy in the skill that can drift.
- Evidence: `cmd_schema.go`; `cmd_skills.go:34-50`; `internal/schemadoc/specs.go:36-101`; `cmdmeta/cmdmeta.go`; `generate/skill_noodle.go:1-15`; `internal/schemadoc/render_test.go`.
- Basis: Verified
- Code: `cmd_schema.go`, `internal/schemadoc/`, `cmd_skills.go`

**NSKILL-12. Noodle's skill validation is thin: syntax errors and name resolution are checked; semantics (does `schedule` parse, does a stage's skill exist, is the frontmatter well-formed for the target agent) are not.**
`ParseFrontmatter` returns an error only for invalid YAML in a block that has both fences. A missing closing fence, no fence, or an empty name is silently treated as "no frontmatter" (so a file with a typo in its closing `---` becomes a general skill with no `schedule`, invisibly). Nothing checks that `name` equals the directory name, the 500-line body size the authoring guide recommends, that references exist, or that `description` has trigger text. The repo's own tests cover: complete, no-schedule, schedule-only, no frontmatter, invalid YAML, strip; resolver precedence, empty and missing paths, `ErrNotFound` versus stat errors, directories without `SKILL.md`; and the watcher. The only real validator is Python (`quick_validate.py` in the shipped `skill-creator`), which enforces the Anthropic open-standard key list `name, description, license, allowed-tools, metadata, compatibility`, kebab-case names up to 64 characters, descriptions up to 1024 characters with no angle brackets. That list excludes `schedule`, so running it on any of Noodle's own task-type skills would fail with "Unexpected key(s) in SKILL.md frontmatter: schedule".
- Why: Noodle's extension key sits outside the standard's allowed set and its validator disagrees with its runtime. Qara avoided this class of conflict by putting its extensions under `metadata:` (NSKILL-14).
- Evidence: `skill/frontmatter.go:26-62`; `skill/frontmatter_test.go` (test names at lines 8, 39, 66, 85, 100, 117, 130, 149, 157); `skill/resolver_test.go`; `skills/skill-creator/scripts/quick_validate.py:42-55`.
- Basis: Verified (what the code and the Python script do); Unverified (that no other validator exists outside the files read: no `skills validate` command is registered in `cmdmeta`)
- Code: `skill/frontmatter.go`, `skills/skill-creator/scripts/quick_validate.py`

**NSKILL-13. A malformed skill makes task-type discovery fail as a whole; at startup that ends the loop after three cycles, during a run the previous registry is kept.**
`ListWithMeta` returns on the first `readSkillFrontmatter` error, and `DiscoverTaskTypes` depends on it, so one skill with invalid YAML makes `discoverRegistry` return an empty registry and an error. At startup the error is stored (`registryErr`); `runCycleMaintenance` skips the first two cycles with a stderr line ("skill registry error (attempt n/3, skipping cycle)") and returns the error on the third, which ends the loop. During a run, `rebuildRegistry` on error only prints `skill.rebuild-registry: ...` to stderr and returns, so the last good registry stays in force; the next successful rebuild resets `registryErr` and the failure count. `architecture.md` states the same ("bail if the skill registry has failed 3+ consecutive times"). `ResolveWithMeta` for a single named skill is not affected by other skills.
- Why: an agent that writes a skill with broken frontmatter (bootstrap, reflect and meditate all edit skills) can stop a fresh start, though not a running loop. Qara's `check:skills` isolates one finding per file instead (NSKILL-14).
- Evidence: `skill/resolver.go:139-176`; `loop/loop.go:76-79` (startup discovery), `:148-157` (`rebuildRegistry` keeps old registry on error), `:566-575` (three-strike rule); `brain/architecture.md:31`.
- Basis: Verified
- Code: `skill/resolver.go`, `loop/loop.go`

**NSKILL-14. Qara has stricter structure, validation, drift checks and typed recurring-work registries than Noodle, and keeps its extensions under `metadata:`; nothing in Noodle's skill format needs copying.**
Qara's commit gate `check:skills` runs four scripts (see the contract table in Reference): `check-skill-definitions.ts` (required `name` and `description`, kebab-case name equal to the directory name, the `metadata.class` membership clause, a 500-line limit per skill markdown file, hard-coded path lint, and local `.md` reference existence), `check-skill-route-conflicts.ts` (a `USE WHEN` phrase must not be shadowed by a keyword route to another skill), `check-skill-trigger-overlap.ts` (lexical overlap between two skills' phrases), and `check-wrapper-externals.ts`. The fuller `system-create-skill/scripts/validate-skill.ts` is an authoring linter, deliberately not commit-blocking. The `context: same|fork` requirement is enforced by `.claude/tests/skills-validation.test.ts`, not by `check:skills`. Recurring unattended work is a typed registry (`standing-audits/tools/registry.ts`: id, owner class, cadence `each-pass` or `days`, probe, action) whose `skill` actions are pinned to real skills on disk by `registry.test.ts:88-95`. csf's skill frontmatter is a JSON schema with a 500-character description cap, and csf's stage contracts live in stage briefs, not SKILL.md.
- Why: this fixes the scope of any borrow. The file format, validator and loader are already ahead; the remaining question is only what Qara could take from the idea that skills carry their own trigger (NSKILL-15, withdrawn).
- Evidence: `$HOME/qara/scripts/check-skill-definitions.ts:29-30,57-82,172-180,235,258-290`; `$HOME/qara/scripts/check-skill-route-conflicts.ts:1-15`; `$HOME/qara/scripts/check-skill-trigger-overlap.ts:1-20`; `$HOME/qara/package.json:57`; `$HOME/qara/.claude/skills/system-create-skill/scripts/validate-skill.ts:1-30` ("Two-validator contract"); `$HOME/qara/.claude/tests/skills-validation.test.ts:42,186`; `$HOME/qara/.claude/skills/standing-audits/tools/registry.ts:16-44`; csf-build `src/stages/shared/schemas/skill-frontmatter.schema.json`.
- Basis: Verified (what each system contains and enforces); Unverified (the judgement that Qara is "ahead")
- Code: n/a (comparison)

**NSKILL-15. Withdrawn: a `metadata.runs-when` frontmatter field for Qara skills.**
The earlier recommendation (put a one-line run condition in unattended skills' frontmatter, validate it in `check:skills`, print a catalogue) is withdrawn. Reading the registry shows the cadence and its evidence probe are already one typed row per audit, and `registry.test.ts:88-95` already fails when a row names a skill that does not exist. Moving the cadence into SKILL.md would duplicate it and lose the probe (`days` rows need durable temporal evidence, `registry.md`), which Noodle's prose has no equivalent of.
- Why: the borrow would add a third place for cadence facts to a system that has been deleting machinery.
- Evidence: `$HOME/qara/.claude/skills/standing-audits/tools/registry.ts:16-44`; `$HOME/qara/.claude/skills/standing-audits/tools/registry.test.ts:85-96`; `$HOME/qara/.claude/skills/standing-audits/references/registry.md`; `$HOME/qara/docs/scheduled-job-ceilings.md`.
- Basis: Verified (what the registry and its test do); Decision (withdrawal, for the owner to confirm)
- Code: n/a

**NSKILL-16. csf's Validator already has a typed, mechanically checked verdict that is stronger than Noodle's `stage_message`; the only open gap is Qara's own review skills, and csf needs no change.**
Noodle's `quality` ends with `{message, blocking}`; what happens after a blocking verdict is scheduler judgement. csf's Validator brief requires a report with `schema: validation-v2` in its frontmatter and, per acceptance criterion, filled slots `Criterion`, `Fresh evidence`, `Control` (or `NO CONTROL: why`), `Derivation`, and a verdict token `MET`, `NOT_MET` or `DEGRADED_PASS`, plus a `Parked` and a `Substrate attestation` section. "The gate checks that each slot is FILLED; it never judges what you put in one", and a report without the schema key "is skipped, not passed". csf's QA brief is plainer: one entry per gate, pass or fail, raw error output, no schema. The Reviewer reports two axes, Spec and Standards, never merged. What Qara could still take from Noodle is the small rule in `quality`: an explicit non-blocking "green" outcome, and non-blocking nits go to the backlog instead of rejecting. Whether Qara's `code-quality-review` and `iterative-review` already say so was not read.
- Why: it narrows the borrow to prose in two Qara skills and closes the question of changing csf stage briefs (answer: no change from Noodle).
- Evidence: `/media/ssdev/tg-pro/cub/node_modules/csf-validate/shared/templates/stage-briefs/validator.md` (report schema, slots, verdict tokens); `/media/ssdev/tg-pro/cub/node_modules/csf-build/shared/templates/stage-briefs/qa.md`, `reviewer.md`; Noodle `.agents/skills/quality/SKILL.md`, `quality/references/stage-message-schema.md`.
- Basis: Verified (csf and Noodle contracts); Unverified (any gap in Qara's review skills)
- Code: Gap: none confirmed; check the two Qara skills before writing anything.

**NSKILL-17. Adopt the authoring rules from `thinking-in-noodle.md` that Qara's `system-create-skill` does not yet state: "describe when, not how", "one skill, one job: can you say when it runs in one sentence?", and "write it down before you automate".**
These are three short rules about skill design, not mechanisms. The one-sentence test is a usable gate in `system-create-skill/references/quality-checklist.md`. "Write it down before you automate" says to ship the knowledge as a general skill first and add the trigger later, which matches Qara's practice but is not written down in `skill-structure.md` or the checklist (both read in full: the checklist has a trigger-names-not-workflow rule but no one-sentence-when test, no "describe when, not how", no write-before-automate).
- Why: they cost one paragraph each and match Qara's habit of deleting machinery.
- Evidence: `docs/thinking-in-noodle.md`; `$HOME/qara/.claude/skills/system-create-skill/references/quality-checklist.md` (read in full); `/qara/.claude/skills/core/skill-structure.md` (read in full).
- Basis: Verified (the rules are absent from the two files); Unverified (that they would improve skills)
- Code: Gap: add three bullets to `system-create-skill/references/quality-checklist.md`, nothing else.

**NSKILL-18. Do not borrow Noodle's `skill-creator` copy, its validator, its prose schedule field, its fsnotify hot reload, or its `schedule` bootstrap loop.**
`skills/skill-creator` is Anthropic's skill (Apache 2.0, `skills/skill-creator/LICENSE.txt`) with a Python eval harness (`run_eval.py`, `run_loop.py`, `improve_description.py`, `aggregate_benchmark.py`, an HTML viewer, grader, comparator and analyzer agent prompts); Qara has `system-create-skill`, its own validator and `deep-improve-skill`, plus the research skill's "run the changed skill on one real question" rule. The `.agents/skills/skill-creator` in the Noodle repo is a 371-line trimmed variant. The hot reload exists because a long-running loop must notice agent-written skills; Qara has no such loop reading a skills directory continuously.
- Why: each is machinery Qara either already has in better form, or has no use for; Qara has been deleting machinery.
- Evidence: file lists under `skills/skill-creator/`; `$HOME/qara/.claude/skills/system-create-skill/`.
- Basis: Unverified (fit judgement); Verified (what exists in Noodle)
- Code: n/a

**NSKILL-19. Qara skills reach Pi and Droid children by name, through symlinks the wiring script creates under a typed per-harness capability policy; nothing pastes skill text into a prompt, and a blind run gets no skills.**
`scripts/wire-pi-ssot.ts` links entries of `.claude/skills` into the shared harness catalogue (`~/.agents/skills`) and a Droid catalogue, after `skill-harness-compatibility.ts` decides, per skill, whether it needs capabilities (`mode-state`, `hook-event-ledger`, `claude-transcripts`, and so on) that Pi or Droid lack. `bsvc run pi --blind` is defined as "no tools, context files, extensions, skills, or prompt templates", so the brief must carry the task and evidence itself; the Pi reference tells the orchestrator to "verify configured context/extension/skill loading and actual capabilities; do not assume them". This answers the earlier open question: it is by name, via the harness's own skill loader. Noodle's Claude-side pasting of `SKILL.md` plus all `references/` into a system prompt (NSKILL-6) has no counterpart in Qara and is not worth adding: it would remove the progressive loading that Qara's `references/` layout relies on.
- Why: it removes a candidate borrow (an inlining dispatcher with a size budget) and records a Qara strength Noodle lacks: skill portability is checked per harness, in typed code.
- Evidence: `$HOME/qara/scripts/wire-pi-ssot.ts:1-50`; `$HOME/qara/scripts/lib/skill-harness-compatibility.ts:1-50`; `$HOME/qara/.claude/skills/pi/references/pi-subagents.md:43,66-78`.
- Basis: Verified (the wiring and the blind-run definition); Unverified (how Pi's loader treats a linked skill at run time, which needs a run)
- Code: n/a

**NSKILL-20. No hand-copied JSON schema in a Qara or csf skill is shown to have drifted, but three Qara documents describe a machine format with no test that reads the document; a `noodle schema`-style command is not yet justified.**
Candidates found: `improve-loop/executor-pi/references/punch-list-contract.md` (required item keys, `path:line` shape); `cruise/workflows/plan-entry-replan.md` (a `plan-cache.json` example; no `.ts` file in the repo mentions `plan-cache`, so the format is kept by the model, not by code); `nune/references/config.md` (a jsonc sample of `config/nune.json`; the committed file is validated by `scripts/nune-config.ts check` and `nune-config.test.ts`, the sample is not). No test file referencing the first or third document was found. I did not diff any of them against code, so drift is neither shown nor excluded. csf's own frontmatter schema is a real JSON schema file read by `validate-frontmatter-core.ts`, which is the shape Noodle's `schemadoc` approximates.
- Why: the borrow only pays where a skill carries a schema copy that drifts; none is shown.
- Evidence: the three paths above; `rg "plan-cache" --glob "*.ts"` finds nothing; `rg -l "punch-list-contract|references/config.md" --glob "*.test.ts"` finds nothing.
- Basis: Verified (absence of readers and tests); Unverified (drift)
- Code: Gap: if the owner wants this pursued, diff `punch-list-contract.md` against `scripts/punch-lists-index.ts` first.

**NSKILL-21. Noodle's own plans show what was planned for skills and what shipped: the metadata shrank to one key, hardcoded roles became skills, repair was deleted, and the "optimize skills by measured hill-climbing" idea is still only a plan.**
Plan 1 (done, 2026-02) set the principle "skills are the only extension point" with "no per-skill Noodle metadata", all wiring in `noodle.toml`, session types with default skills (Cook, Sous Chef, Taster, Oops, Repair, Reflect, Meditate, Debate), and named a `debate` skill that no longer ships. Plan 23 (done) made task types dynamic from a `noodle:` frontmatter block and created the task-type suite. Plan 38 (done) made missing skills non-fatal, added the fsnotify hot reload, the registry rebuild with order audit, the dispatch-time rescan and the bootstrap agent, and rejected "improve runtime repair" (0% success), config-driven fallbacks and "virtual skills in the resolver". Plan 89 collapsed `noodle:{schedule, permissions, domain_skill}` into top-level `schedule` (NSKILL-1). Plan 108 introduced the compact `do`/`with` wire format (NSKILL-5); its header still reads `status: active`. Plan 119 (open, todo 119) proposes a curator gate in `meditate`, structured findings in `reflect`, and measured skill refinement (GEPA-inspired); it was moved into the brainmaxxing repo and nothing in `.agents/skills/meditate` implements the refinement loop yet. `brain/architecture.md` and `vision.md` describe the same design and agree with the code except the Codex inlining line (NSKILL-6).
- Why: the repeated direction (delete a layer, keep one string) supports not adding fields to Qara's frontmatter without a consumer, and the open plan marks where Noodle itself has not yet got "skills that improve themselves".
- Evidence: `brain/archive/plans/{01-noodle-extensible-skill-layering,23-task-type-skill-suite,38-resilient-skill-resolution,89-simplify-task-type-frontmatter,108-orders-dsl}/overview.md`; `brain/plans/119-brainmaxxing-autoresearch/overview.md`; `brain/todos.md:59`; `brain/architecture.md:13-15,206-214`; `brain/vision.md:17-29`.
- Basis: Verified
- Code: n/a

## Reference

### 1. Skill file layout and frontmatter

Directory (from `.agents/skills/noodle/references/skill-authoring.md`, "Skill Anatomy"):

```
skill-name/
├── SKILL.md          required: YAML frontmatter + markdown body
├── references/       optional; every file is pasted into the Claude system prompt at dispatch
├── scripts/          optional; never read by Noodle (the agent may run them)
└── assets/           optional; never read by Noodle
```

Frontmatter keys the Go code reads (`skill/frontmatter.go`):

| Key | Type | Required | Effect |
|---|---|---|---|
| `name` | string | by convention | Display only. The skill key is the directory name, not this value (`Resolve` joins the path with the requested name). |
| `description` | string | by convention | Not read by Noodle code. Used by Claude Code and Codex for their own skill triggering. |
| `model` | string | no | Parsed, never read (no reader in `dispatcher/`, `loop/` or `internal/`). |
| `schedule` | string | no | Non-empty makes the skill a task type; the text is shown to the scheduler model. |

Other keys seen in shipped skills but ignored by Noodle: `license` (`frontend-design`). The Anthropic open standard (and `quick_validate.py`) allows `name`, `description`, `license`, `allowed-tools`, `metadata`, `compatibility` only.

Parsing rules (`ParseFrontmatter`): leading whitespace trimmed; must start with `---`; the closing `---` is the first `---` found after the opening line (so a `---` inside a YAML block scalar would end it early); on any structural problem the whole content is returned as body with empty frontmatter and no error; only invalid YAML is an error.

### 2. Search paths and precedence

```toml
[skills]
paths = [".agents/skills"]        # default; first match wins; ~ is expanded
```

Resolution is relative to the process working directory (`filepath.Abs`), not to a project root read from config; how `--project-dir` interacts was not traced here (see NVIEW). `noodle skills list` output, one line per skill: `name<TAB>search-path<TAB>true<TAB>skill-dir`.

### 3. How a skill flows from file to running agent

```
.agents/skills/<name>/SKILL.md  (schedule: "...")
   │ skill.Resolver.DiscoverTaskTypes()           skill/resolver.go
   ▼
taskreg.Registry {key → TaskType{Key, Schedule, SkillPath}}   internal/taskreg
   │ registryToTaskTypeSummaries()                 loop/task_types.go
   ▼
.noodle/mise.json  task_types[] {key, schedule}   + prompt "Task types you may schedule:"
   │ schedule skill (an LLM session) reads mise
   ▼
.noodle/orders-next.json  orders[].stages[] {do, with, model, runtime, prompt, extra_prompt, group}
   │ loop promotes; ExpandCompactOrders: do → task_key AND skill      internal/orderx/compact.go
   │ NormalizeAndValidateOrders drops stages whose do is not a task type
   ▼
spawnCook: worktree per stage; prompt = header + "Use Skill(<name>) for methodology." + stage.prompt + context + extra_prompt
   │ dispatcher.loadSkillBundle (Claude: body + references/ into system prompt; Codex: native Skill(name))
   ▼
agent session runs in the worktree; may emit stage_message / stage_yield events
```

Stage naming of worktrees: `<order>-<stageIndex>-<taskKey>` (`loop/util.go` `cookBaseName`).

### 4. Compact stage wire format (what the scheduler writes) versus internal stage

| Wire (`CompactStage`) | Internal (`Stage`) | Note |
|---|---|---|
| `do` | `task_key` and `skill` | both set to the same value |
| `with` | `provider` | |
| `model`, `runtime`, `prompt`, `extra`, `group` | same | `runtime` names `process` (default) or `sprites` |
| `extra_prompt` | `extra_prompt` | truncated to 1000 runes at a word boundary |
| (none) | `status` | forced to `pending` |

Parsing uses `DisallowUnknownFields`; a stage needs `do` or `prompt`. Source: `internal/orderx/compact.go`, `internal/schemadoc/specs.go:84-101`. Note a drift: the in-repo guide `skill-authoring.md` and the cookbook `multi-stage-pipeline.md` show stage JSON with `task_key` and `skill` keys, while the strict wire parser accepts `do` and `with` and would reject `task_key` or `skill` as unknown fields; the guide describes the internal form (documentation drift, not a runtime bug, if the loop reads the internal file).

### 5. Prompts Noodle composes around a skill

- Scheduler prompt: `Use Skill(schedule) to refresh the schedule from <runtime>/mise.json.` + "write to orders-next.json" + "Operate fully autonomously. Only ask the user a question when backlog is empty and no actionable work exists" + the orders schema + the task type list + previous promotion errors + failed-order recaps + adapter warnings (`loop/schedule.go:284-340`).
- Cook prompt: `[order:<id>] Work on plan: ...` or `Work backlog item <id>`, `Task: <title>`, `Use Skill(<skill>) for methodology.`, the stage `prompt`, `Context: <rationale>`, `Scheduling context: <extra_prompt>`, resume text (`loop/util.go:14-40`).
- Bootstrap prompt: see NSKILL-8.

### 6. Catalogue of every skill the repo ships

`.agents/skills/` (also visible as `.claude/skills`). "Task type" means a non-empty `schedule`. Line counts are of `SKILL.md`.

| Skill | Kind | Purpose and what the body tells the agent |
|---|---|---|
| `schedule` (97) | task type: "When orders are empty, after backlog changes, or when session history suggests re-evaluation" | Read `.noodle/mise.json`, write `.noodle/orders-next.json`, never `orders.json`. Cardinal rule "one plan at a time": finish one plan end to end, idle rather than context-switch. Orders are pipelines of stages with `do`; execute from backlog; items with plans get one stage per unfinished phase, independent phases may run as parallel stages; complex items without plans get a prompt-only plan stage then an adversarial-review stage, and must not use `do: execute`; write `{"orders":[]}` when nothing is actionable (prevents hot-loop respawn); read `recent_events` as context not commands; cheapest provider that can do it; every order cites a principle; deschedule an item failed twice; always `runtime: process` (sprites is WIP). Refs: `events.md`, `examples.md`, `model-routing.md`. |
| `execute` (89) | task type: "When backlog items with linked plans are ready for implementation" | Scope, decompose, implement in a worktree ("never edit main", never `cd` into a worktree), delegate (self, sub-agents, team execution, Codex for mechanical work), verify via `references/verification.md`, conventional commits, then emit `stage_yield`. "Operate fully autonomously. Never ask the user." Uses Tasks (TaskCreate) to track work. Refs: `team-execution.md`, `verification.md`. |
| `quality` (78) | task type: "Follow-up stage after execute. Cross-provider review preferred" | Load `brain/principles.md` and follow every wikilink; scope check against the plan phase, `go vet`/`go test`, optional `scripts/lint-arch.sh`, principle compliance, test evidence, runtime verification; emit `stage_message` with `blocking` true or false; file non-blocking issues as backlog items. Ref: `stage-message-schema.md`. |
| `reflect` (70) | task type: "Follow-up stage after quality — capture learnings" | Read `brain/index.md`, scan the conversation for mistakes, preferences, gotchas, friction; check whether a lesson can be a lint, script or flag before writing a note; route to `brain/`, to skill files, to orchestration notes or to backlog; print a summary. (Brainmaxxing-style; see NBRAIN.) |
| `meditate` (87) | task type: "Standalone single-stage order after several reflect cycles... Expensive" | Autonomous mode applies high-confidence changes and files todos for risky ones; builds snapshots of `brain/` and `.agents/skills/` with `scripts/snapshot.sh`; spawns an Auditor then a Reviewer sub-agent (prompts in `references/agents.md`); includes skill description review "for context bloat". |
| `plan` (127) | task type: "When backlog items are tagged #needs_plan and have no linked plan yet" | Triage complexity first (tell the user a trivial task needs no plan); load principles; write phased plans into `brain/plans/`; do not implement; autonomous mode skips questions and "installs skills autonomously without confirmation" (find-skills). Refs: `domain-skills.md`, `templates.md`. |
| `oops` (57) | task type: "When infrastructure failures are detected (build breaks, test failures, stale Noodle state)" | Reproduce, diagnose (suspect state before code: `.noodle/`, environment, config, persistent files, then code), fix, verify, commit. Principles `fix-root-causes`, `prove-it-works`. Also the target of the schedule-skill bootstrap order. |
| `adversarial-review` (96) | task type: "After cook sessions that produce large diffs (200+ lines), implement plan phases, or complete a planning session" | Spawn reviewers on the opposite model's CLI (`codex exec` or `claude -p`), explicitly not sub-agents; 1 to 3 reviewers scaled by diff size (Skeptic, Architect, Minimalist); synthesise a verdict; make no changes. Refs: `reviewer-lenses.md`, `reviewer-prompt.md`, `verdict-format.md`. |
| `noodle` (120) | general | Operate the CLI, write `.noodle.toml`, write skills; mirrors the static string in `generate/skill_noodle.go`. Refs: `skill-authoring.md`, `configuration.md`. The one skill `INSTALL.md` tells an agent to copy verbatim. |
| `skill-creator` (371) | general | Guide for writing skills (anatomy, progressive disclosure, context budget, frontmatter, iteration). Trimmed variant of Anthropic's skill. |
| `review` (110) | general | Interactive review of plans and code: Architecture, Code Quality, Tests, Performance; numbered issues with tradeoff options; "do not make changes". |
| `debugging` (64) | general | Root-cause method: reproduce, trace, hypothesis, verify; reads principle `fix-root-causes`. |
| `commit` (37) | general | Conventional commits and branching rules for the project. |
| `testing` (89) | general | TDD ("bug first"): prove the problem with a failing test, fixtures. Noodle-specific. |
| `worktree` (144) | general | Default to linked-worktree isolation; valid workspace definition; `noodle worktree` commands. |
| `brain` (76) | general | Read and write the Obsidian-style `brain/` vault; "ask: does this genuinely improve how the system operates?" before adding. |
| `todo` (56) | general | Add, complete and view items in `brain/todos.md` (the default backlog file format). |
| `refine` (24) | general | Sharpen todo items into precise prompts by targeted questioning. |
| `ruminate` (110) | general | Mine past Claude Code and Codex conversations for uncaptured patterns; `scripts/extract-conversations.py`. Reads session history. |
| `codex` (75) | general | Run Codex CLI (`exec`, `resume`); profiles: default read-only, `--profile edit` (workspace-write, full-auto), `--profile full` (`danger-full-access`, full-auto). |
| `find-skills` (39) | general | Search and install skills from the open ecosystem with `pnpx skills find` and `pnpx skills add <owner/repo@skill> -y`, project-local only. |
| `ast-grep` (83) | general | Structural code search guidance with a rule reference. |
| `go-best-practices` (60) | general | Go lifecycle, concurrency, config, testing patterns; `references/patterns.md`. |
| `ts-best-practices` (27) | general | TypeScript type-safety policy. |
| `react-best-practices` (124) | general | 47 React performance rules in 47 reference files, adapted from Vercel guidance for client-only React with Vite. |
| `frontend-design` (42) | general | Distinctive production frontends; has `license:` key; `LICENSE.txt`. |
| `interaction-design` (43) | general | Microinteractions and motion; three reference files. |
| `make-interfaces-feel-better` (115) | general | UI polish details; four reference files. |
| `unslop` (71) | general | Remove AI writing patterns from prose. |

Counts: 29 skill directories under `.agents/skills/` (counted from the directory listing): 8 task types and 21 general skills. The table has one row per skill.

`skills/skill-creator/` (repo root, Anthropic, Apache 2.0, 479-line SKILL.md): create, iterate, run evals with-skill versus baseline, grade, aggregate benchmarks with variance, blind comparison, description-trigger optimisation loop (`run_loop.py`, `improve_description.py`); `quick_validate.py` and `package_skill.py`; sub-agent prompts `agents/analyzer.md`, `grader.md`, `comparator.md`; an HTML eval viewer. Has Claude.ai-specific and Cowork-specific sections.

`defaults/adapters/`: `backlog-add`, `backlog-done`, `backlog-edit`, `backlog-sync` (scripts, not skills; NADAPT).

### 7. Examples and cookbook

- `examples/minimal/` and `examples/multi-skill/`: each has `.noodle.toml`, a `brain/` and `.agents/skills/` with `schedule` and `execute` (minimal) plus `test` and `deploy` (multi-skill). `test` has `schedule: "After execute stages complete, to verify changes"`; `deploy` has `schedule: "After test stages pass, to ship verified changes"`. Both are copy-paste starting points; they are the evidence for "add a skill without touching others".
- `docs/cookbook/`: `minimal-noodle-loop.md`, `multi-stage-pipeline.md`, `model-routing.md`, `self-learning.md` (brainmaxxing: reflect, meditate, ruminate). The multi-stage page's order JSON uses `skill:` without `task_key`, which is the internal form (see section 4).
- `docs/thinking-in-noodle.md`: start from what you repeat; write a general skill first; one skill one job; describe when not how (cron string shown as the wrong way); let the scheduler compose; start with two skills; write bodies as prompts for a smart coworker on day one; install Anthropic's skill-creator with `npx skills add`.

### 8. The skill contract side by side

Citations are in each cell; a dash means the system has nothing for that row. "Not read" means a file exists but I did not read its body.

| Aspect | Noodle | Qara | csf-build / csf-validate |
|---|---|---|---|
| Frontmatter keys | `name`, `description`, `model` (parsed, never read), `schedule` (`skill/frontmatter.go:10-16`). Other keys ignored by the YAML decoder. | `name`, `description` required by the gate (`scripts/check-skill-definitions.ts:29`); `context: same\|fork` required by `.claude/tests/skills-validation.test.ts:42,186`; extensions under `metadata:` (`category`, `class`); `user-invocable`, `disable-model-invocation`, `argument-hint`, `model` seen in `.claude/skills/{flows,system-create-skill}/SKILL.md`; `USE WHEN` inside `description` (`core/skill-structure.md`) | `name` (pattern allows capitals and spaces), `description` (10-500 chars), `context`, `model` (opus, sonnet, haiku), `model_fallback`, `model_rationale`, `version`, `author`, `tags` (`csf-build/src/stages/shared/schemas/skill-frontmatter.schema.json`). Required fallback if the schema file is unreadable: `name`, `description` (`validate-frontmatter-core.ts:20-26`) |
| Discovery paths and precedence | `[skills] paths`, default `[".agents/skills"]`, first match wins, `~` expanded, relative to the project dir after `os.Chdir` (`skill/resolver.go:36-118`; `config/types_defaults.go:214`; `root.go:41-47`) | `.claude/skills/<name>/SKILL.md`; a symlink entry is class `external`; dot and underscore dirs skipped (`check-skill-definitions.ts:258-290`; `core/skill-structure.md`). Harness catalogues are symlinked by `scripts/wire-pi-ssot.ts` with a per-harness capability policy (`scripts/lib/skill-harness-compatibility.ts`). Precedence between catalogues is the harness's own, not defined here | csf-build ships `skills/{code-engineering,core,orchestration,meta,utilities,csf-onboard,csf-update,csf-upgrade}` (`skills/README.md`); `csf-onboard` attaches hooks and skill links to a project (`README.md`, "Minimal project onboarding"). Stage text is not a skill: `shared/templates/stage-briefs/*.md`, assembled by `src/stages/shared/stage-brief-assembly.ts` |
| Validation | YAML syntax only; missing fence silently means "no frontmatter" (`skill/frontmatter.go:26-62`). Python `quick_validate.py` (not wired into the Go build) rejects `schedule` (`skills/skill-creator/scripts/quick_validate.py:42-55`). Startup registry error: 3 strikes then fatal (`loop/loop.go:566-575`) | `check:skills` = definitions, route conflicts, trigger overlap, wrapper externals (`package.json:57`); authoring linter `system-create-skill/scripts/validate-skill.ts`; class clause; 500-line cap per skill markdown file (`check-skill-definitions.ts:30,235`) | `validate-frontmatter-core.ts`, run by a Claude Code PostToolUse hook and the pi extension; stage reports gated mechanically (`validation-v2`, `qa-validation-shape`, `csf-validate/shared/templates/stage-briefs/validator.md`) |
| Injection into a session | Claude: body (frontmatter stripped) plus every `references/` file in the system prompt; Codex: native `Skill(name)` plus the preamble; prompt line `Use Skill(<name>) for methodology.` (`dispatcher/skill_bundle.go:19-111`; `dispatcher/command.go:119-131`; `loop/util.go:25-27`) | Claude Code loads by its own skill mechanism; mode keywords handled by the `UserPromptSubmit` router with `keyword-routes.json` (`.claude/hooks/keyword-router.ts`, `.claude/hooks/lib/keyword-routes.json`); Pi and Droid by name via symlinks; blind Pi runs get no skills (`pi-subagents.md:73`) | Stage workers receive an assembled stage brief with tokens such as `$PARKED_WORK_ORDERS`; skills under `skills/` are agent pattern documents; Concierge has no SKILL.md (`skills/README.md` stage table) |
| How it becomes schedulable | Non-empty `schedule:` makes a task type; an LLM scheduler reads the list and writes stages (`internal/taskreg/registry.go:30-50`; `loop/schedule.go:342-358`) | A typed `AuditDefinition` row with `cadence`, `probe`, `owner`, `action: {kind: 'skill', skill}` in `standing-audits/tools/registry.ts`; cron and launchd blocks for dream, hygiene, host-sync (`docs/scheduled-job-ceilings.md`) | Not at skill level: a fixed pipeline `Concierge, Planner, Assembler, Reviewer, Validator, optional QA` generated from the FSM (`skills/README.md`) |
| How it is tested | 9 frontmatter, 12 resolver and 7 watcher tests in `skill/`; 7 `taskreg` tests; 5 loader tests in `dispatcher/skill_bundle_test.go`; registry-error and rescan tests in `loop/order_audit_test.go`; 1 command test (`cmd_skills_test.go`); none for scheduler decision quality | `check-skill-definitions.test.ts` (424 lines), `check-skill-route-conflicts.test.ts`, `check-skill-trigger-overlap.test.ts`, `registry.test.ts:88-95` (skill actions exist), `skill-path-contract.test.ts`, `system-create-skill/scripts/validate-skill-class-alignment.test.ts`; pass state not run | Source comments cite `stage-brief` tests (`stage-briefs-dir-override`, `stage-dispatch-p1`); not read |

### 9. Which test pins which doctrine

Names are test functions in the Noodle repo (paths relative to the repo root). "None" means no test found by name search and reading the listed files. I ran no tests.

| Doctrine | Pinned by | Not pinned |
|---|---|---|
| NSKILL-1 | `skill/frontmatter_test.go`: `TestParseFrontmatterComplete`, `...WithoutSchedule`, `...ScheduleOnly`, `...NoScheduleDoesNotError` (the `schedule`, `name`, `description` fields) | `model` being unused; absence of any permissions key (none) |
| NSKILL-2 | `skill/resolver_test.go`: `TestResolveFirstMatchWins`, `TestListReturnsResolvedSkillsWithPrecedence`, `TestResolveSkipsMissingSearchPathDirectories`, `TestResolveHandlesEmptySearchPaths`, `TestResolveIgnoresDirectoryWithoutSkillFile`, `TestListIgnoresDirectoryWithoutSkillFile`, `TestResolveStatErrorIsNotErrNotFound`; `cmd_skills_test.go`: `TestSkillsListRespectsPrecedence`; `loop/discover_registry_test.go`: `TestDiscoverRegistryExpandsHomeSkillPath`; `root_test.go` registers `--project-dir` and the cwd default | `os.Chdir` into the project dir and the resulting relative resolution (none); the empty-`paths` fallback warning (none found) |
| NSKILL-3 | `TestDiscoverTaskTypesFiltersCorrectly`, `TestResolveWithMetaParsesScheduleFrontmatter`, `TestListWithMetaIncludesAllSkills` (resolver); `internal/taskreg/registry_test.go`: `TestNewFromSkillsExcludesUtilitySkills`, `TestByKey`; `skill/watcher_test.go`: add, debounce, chmod-ignored, new and removed subdir, cancel, sibling events; `loop/order_audit_test.go`: `TestEnsureSkillFreshExistingSkill`, `...MissingSkill`, `TestDiffRegistryKeys`, `TestPrepareOrdersRescanRecoversMissingSkill` | The loop actually setting `registryStale` from the watcher and rebuilding on the next cycle (none found end to end) |
| NSKILL-4 | `loop/sous_chef_test.go`: `TestBuildOrderTaskTypesPromptIncludesKeyAndSchedule`, `...Empty` | Anything about how the scheduler model uses the text (none; cannot be tested without a model) |
| NSKILL-5 | `internal/taskreg/registry_test.go`: `TestResolveStageByTaskKey`, `...BySkill`, `...ByExactID`, `...ByIDPrefixNoLongerMatches`, `...Unknown`; `internal/orderx/compact_test.go` (unknown field rejected, `do` and `with` expansion); `loop/order_audit_test.go`: `TestPrepareOrdersRescanDropsGenuinelyUnknown`; `loop/orders_test.go`: `TestNormalizeAndValidateOrdersPreservesScheduleOrderWithoutTaskType` | That a pruned stage is reported to the scheduler or the user (none) |
| NSKILL-6 | `dispatcher/skill_bundle_test.go`: `TestLoadSkillBundleClaudeIncludesReferences`, `...CodexTruncatesReferences`, `...StripsFrontmatter`, `...MissingSkillIsWarning`, `...FilesystemErrorIsHardFail`; `loop/util_test.go` (`buildCookPrompt` text) | `composePrompts` (none: no test names it), so nothing pins that Codex gets no skill text; `scripts/` and `assets/` being ignored (none) |
| NSKILL-7 | `internal/orderx/compact_test.go` (stage list shapes, `group`) | Ordering and follow-up rules in `schedule` and `quality` prose (none) |
| NSKILL-8 | `loop/bootstrap_test.go`; `loop/integration_scale_test.go`: `TestReconcileAndCycleDispatchBootstrapWhenNoScheduleOrOopsTaskType`; `loop/order_audit_test.go`: `TestAuditOrdersPreservesScheduleOrderWhenScheduleTaskTypeMissing`; `loop/orders_test.go` | Bodies of `bootstrap_test.go` not read; the 3-attempt cap at `loop/schedule.go:258` not confirmed to be tested |
| NSKILL-9 | None (the catalogue is data; no test checks skill frontmatter against anything) | |
| NSKILL-10 | `cmd_event_test.go` exists (not read); `.agents/skills/quality/references/stage-message-schema.md` is prose | That `blocking` omitted means `true` in loop code (not traced) |
| NSKILL-11 | `cmd_schema_test.go`: `TestRunSchemaListOutputsTargets`, `TestRunSchemaOrdersOutputsMarkdown`, `TestRunSchemaUnknownTarget`; `internal/schemadoc/render_test.go`; `generate/skill_noodle_test.go`: `TestGenerateSkillContent`, `TestGeneratedSkillContainsAllCommands` | `noodle schema mise` and `status` output (only list membership for `mise` and `orders`); `noodle skills list` for the `schedule` column (it has none) |
| NSKILL-12 | `skill/frontmatter_test.go`: `TestParseFrontmatterNoFrontmatter`, `...InvalidYAML`, `TestStripFrontmatter*` | Missing closing fence, empty name, directory-name mismatch (none); `quick_validate.py` (no test file found next to it) |
| NSKILL-13 | `loop/order_audit_test.go`: `TestRegistryErrorResilience` (skip, skip, fatal), `TestRegistryErrorResetOnRebuild` | `ListWithMeta` failing on one bad skill among good ones (none found) |
| NSKILL-14 to NSKILL-21 | Not Noodle behaviour. Qara side: `registry.test.ts:88-95`, `check-skill-definitions.test.ts`, the route and overlap tests exist | Not run |

### 10. What each of the 29 skills writes, and what is risky in it

Read in full for this section: every `SKILL.md` in `.agents/skills/` and the `reflect` and `meditate` references (`meditate/references/agents.md`, `scripts/snapshot.sh`). For the large reference sets (`react-best-practices`, `make-interfaces-feel-better`, `interaction-design`, `go-best-practices`, `ts-best-practices`, `ast-grep`, `frontend-design/LICENSE.txt`) only the `SKILL.md` and file lists were read; the references are rule texts.

| Skill | What the prompt tells the agent to do | What it writes | Risk or notable instruction |
|---|---|---|---|
| `schedule` | Read mise; one plan at a time; stages with `do`; read events as context; empty `orders` when nothing is actionable | `.noodle/orders-next.json` only | "Never ask the user to choose"; may create backlog items through `noodle adapter run backlog add` (adapter scripts, see NADAPT); `runtime: process` forced because sprites is WIP |
| `execute` | Scope, decompose, worktree, verify, commit, `stage_yield` | Code, commits in a worktree, `stage_yield` event | "Never ask the user. Don't stop until the work is fully complete"; Codex delegation for mechanical edits |
| `quality` | Load principles, scope check, `go vet` and `go test`, `scripts/lint-arch.sh`, test evidence | `stage_message` event; backlog items for nits | Runs repo commands and a script if present |
| `reflect` | Scan conversation, check structural enforcement first, route to brain, skills, orchestration notes, backlog | `brain/*`, may edit `.agents/skills/<skill>/`, `brain/todos.md`, `brain/index.md` | Edits skill files unattended; "use the `skill-creator` skill" |
| `meditate` | Snapshot brain and skills, spawn Auditor then Reviewer sub-agents (read-only), apply changes, merge principles, tighten skill descriptions, clean `.noodle/` | Deletes and merges brain notes, edits skills, `CLAUDE.md`, auto-memory entries, `/tmp` snapshots, commits | Highest blast radius: rewrites or deletes `CLAUDE.md`, memory files and notes; "Apply all changes directly. The user reviews the diff"; `snapshot.sh` concatenates all brain markdown into one `/tmp` file |
| `plan` | Triage, load principles, ask scope (unless autonomous), explore with `Explore` sub-agents, match domain skills, write phased plans, self-check (2 principles cited, phases small, no code), yield | `brain/plans/NN-slug/overview.md` and phases, `brain/plans/index.md`, `brain/todos.md` | Autonomous mode installs skills without confirmation (via `find-skills`); `plan` text conflicts with `execute` (the schedule skill forbids chaining them) |
| `oops` | Reproduce, diagnose state before code, fix, verify, commit | Fixes, commit | Touches `.noodle/` state and config |
| `adversarial-review` | Spawn reviewers on the opposite model's CLI with lens prompts, verify output files exist, synthesise, add lead judgment | Reviewer output under `mktemp -d /tmp/adversarial-review.XXXXXX`, a verdict | Runs `codex exec` or `claude -p`; `--profile edit` only if reviewers must run tests; verdict only, no code changes |
| `noodle` | Operate the CLI, edit `.noodle.toml`, write skills | Config and skill files | The one skill `INSTALL.md` has agents fetch from GitHub |
| `skill-creator` (agents) | Guide to anatomy, context budget, frontmatter, iteration | Skill files | None; refers to `.agents/skills/` layout |
| `review` | Principles, scope, four sections, numbered issues with options | In autonomous mode `brain/audits/review-<date>-<subject>.md`, todos for high severity, a commit | Uses `AskUserQuestion` interactively, else decides |
| `debugging` | Reproduce, read the error, suspect state before code, isolate, root cause, verify, check for pattern | None directly; may write a brain note or todo | Reads `.noodle/orders.json`, `.noodle/sessions/`; names `tmux` sessions as state to check |
| `commit` | One logical change per commit, always a body, only your own files, `merge` type, no bare branches | Commits | Forbids `git checkout -b`; overlaps with the worktree skill |
| `testing` | Bug first: failing test, commit it, fix, commit; fixtures with `scripts/scaffold-fixture.sh`; `pnpm` commands | Test files, fixtures, hash sync | Project-specific; commit instruction creates a deliberately failing commit |
| `worktree` | Use `noodle worktree create/exec/merge/prune/cleanup`; never `cd` into `.worktrees/`; merge lock | Worktrees, branches, merges | `cleanup --force` discards commits; teammates use `acceptEdits` mode |
| `brain` | Read index, one topic per file, wikilinks, durability test, update indexes | `brain/**`, indexes | Deletes outdated notes and "random-named files in `brain/plans/`" |
| `todo` | Edit `brain/todos.md` with ids and `next-id`; move done items to `brain/archive/todos.md` | `brain/todos.md`, `brain/archive/todos.md` | None |
| `refine` | Ask clarifying questions, rewrite items in place, remove done items | `brain/todos.md` | Removes items the user says are done |
| `ruminate` | Snapshot brain, extract Claude and Codex conversations with `scripts/extract-conversations.py`, spawn one `opus` analysis agent per batch, filter by frequency and impact, apply approved changes | `/tmp/ruminate-<ts>/`, then brain and skill edits after approval; `rm -rf "$OUT_DIR"` at the end | Reads `~/.claude/projects/...` and `~/.codex/sessions/` transcripts (private data), writes extracted text to `/tmp`; spawns up to 10 opus agents |
| `codex` | Run `codex exec` with profiles, verify output with `git diff --stat`, never trust self-reports | Output file under `mktemp /tmp/codex-out.XXXXXX` | `--profile full` is `danger-full-access`; `--profile edit` is workspace-write full-auto; warns Codex "may delete files, revert code" |
| `find-skills` | `pnpx skills find`, present, install with `pnpx skills add <owner/repo@skill> -y` project-local | Third-party skill directories | Unpinned remote code installed with `-y`; the `plan` skill lifts the confirmation in autonomous sessions |
| `ast-grep` | Test snippet, write rule, test with `--stdin`, then search; gotchas (`stopBy: end`, shell escaping) | None | None |
| `go-best-practices` | Ten Go rules (minimal main, one bootstrap, ordered shutdown, non-blocking sends, concurrency tests, layered config, platform paths, secret redaction, golden tests, focused linters) | None | None |
| `ts-best-practices` | Type-safety table (no `as`, `unknown`, discriminated unions, exhaustiveness, `satisfies`) | None | None |
| `react-best-practices` | 47 prioritised React performance rules in 47 reference files | None | The largest file set in the repo; general skill, loaded only on demand |
| `frontend-design` | Pick a bold aesthetic, avoid generic fonts and palettes, implement working code | Frontend code | Carries a `license:` frontmatter key that Noodle ignores; has a `LICENSE.txt` (terms not read) |
| `interaction-design` | Motion and feedback conventions (Framer Motion, transform and opacity only, timing scale, reduced motion) | Frontend code | None |
| `make-interfaces-feel-better` | Ten UI detail rules (concentric radius, shadows over borders, tabular numbers, text-wrap) with four reference files | Frontend code | None |
| `unslop` | 25 AI-writing patterns to detect and fix, add voice, self-audit | Edited prose | Style rules only (bans em dashes, curly quotes, bold overuse) |

### 11. Remaining items that would need running something

Not run because nothing from the external repos may be run, and no model calls were allowed: whether the scheduler model follows `schedule:` hints and the "one plan at a time" rule; whether Codex really loads a skill natively through `Skill(name)` as the prompt assumes; whether `quick_validate.py` rejects `schedule` in practice (read, not executed); whether Noodle's tests pass at this commit; whether `bun run check:skills` passes in Qara; how Pi's loader treats a linked Qara skill at run time; whether a pruned stage surfaces in the Noodle UI.

## Borrow list

Revised after reading Qara's gate, registry, Pi wiring, csf's Validator and QA briefs, and Noodle's tests and plans. Rows undermined by that reading are listed after the table, not kept. All fit judgements are Unverified until tried.

| Rank | What | Target | Size | Risk | Depends on |
|---|---|---|---|---|---|
| 1 | Three authoring rules: "can you say in one sentence when it runs", "describe when, not how", "write the knowledge as a general skill before adding a trigger" (NSKILL-17) | `$HOME/qara/.claude/skills/system-create-skill/references/quality-checklist.md`: three bullets under `## Activation` (the file already holds the rule that a description names the trigger, not the workflow); one pointer line under `## Quality Gates` in `$HOME/qara/.claude/skills/core/skill-structure.md` | Under 15 lines of markdown | None; `check:skills` does not read these files | Owner approval (Open 2) |
| 2 | In Qara's own review skills, state an explicit non-blocking "green" outcome and send non-blocking nits to a triage Finding or backlog instead of rejecting; blocking is the default when unstated (as in Noodle's `quality` and `stage-message-schema.md`) (NSKILL-16) | `$HOME/qara/.claude/skills/code-quality-review/SKILL.md` and `$HOME/qara/.claude/skills/iterative-review/SKILL.md`, only where they do not already say it | At most 20 lines each | Low; first read both files, since if they already say it the row is void | Reading those two files (not done here) |
| 3 | If the owner wants it: pin the punch-list contract to its parser with one test that reads `punch-list-contract.md` and the required-key list in code (NSKILL-20) | A test beside `$HOME/qara/scripts/punch-lists-index.ts`; no change to the skill | Small test; zero if the diff shows no drift | Low | A diff of the document against the parser first (Open 3) |

Dropped after the deeper reading, with the doctrine that records why:

- A `metadata.runs-when` field, its check and its generated catalogue: the typed `standing-audits` registry already holds cadence, probe and owner, and `registry.test.ts:88-95` already pins `skill` actions to real skills (NSKILL-15, withdrawn).
- A `noodle schema`-style command for Qara or csf: no drifting schema copy shown (NSKILL-20); csf already has a real frontmatter JSON schema.
- An inlining dispatcher with a size budget for Pi or Droid: skills reach those harnesses by name through symlinks with a typed capability policy (NSKILL-19).
- A change to csf stage briefs: the Validator already has a mechanically checked verdict schema stronger than `stage_message`, and the QA brief's plain pass/fail per gate with raw output needs nothing from Noodle (NSKILL-16).
- Per-skill error isolation in discovery: Qara's checks are per file already (NSKILL-14).
- Not to borrow, unchanged: the prose-only `schedule` evaluated by an LLM each cycle (NSKILL-4), Noodle's lenient frontmatter parser (NSKILL-12), the fsnotify watcher and rebuild retries (NSKILL-3), the schedule-skill bootstrap (NSKILL-8), Anthropic's `skill-creator` harness and Noodle's copy (NSKILL-18), the CI snapshot check of the generated `noodle` skill (CI is out of scope), autonomous `find-skills -y` installs, and the `reflect` and `meditate` skill-editing loops (NBRAIN decides).

## Open

Only decisions that need the owner, each with a recommendation:

1. Confirm the withdrawal of the `runs-when` idea (NSKILL-15)? Recommendation: confirm; the registry already does its job and has a test.
2. Add the three authoring rules of borrow 1 to `quality-checklist.md`? Recommendation: yes, it is the cheapest change in this document and touches no gate.
3. Should the punch-list contract be diffed against its parser and, if it has drifted, pinned by a test (borrow 3)? Recommendation: only if a drift has already cost something; otherwise leave it.

Answered by reading, no longer open: how Pi and bsvc load skills (by name, NSKILL-19); whether a hand-copied schema has drifted (none shown, NSKILL-20); whether csf stage briefs need a verdict rule (no, NSKILL-16); what the loop does after a registry error (NSKILL-13); whether the Codex reference budget is live (no, NSKILL-6); how `--project-dir` affects skill paths (NSKILL-2).

Facts still unknown, because settling them needs a run or a model: see section 11 above.

## Embedded agent instructions found (material studied, not followed)

- `INSTALL.md`: tells an agent to `brew install poteto/tap/noodle` or download a release binary, fetch three raw GitHub files and write them into `.agents/skills/noodle/`, ask the user questions, write `.noodle.toml`, `todos.md` and skills, and install brainmaxxing from its repository on request. Risky parts: fetch-and-write of remote content into the skills directory, and binary install.
- `loop/builtin_bootstrap.go` prompt: write a skill file, `git add`, commit, exit.
- `.agents/skills/find-skills/SKILL.md`: `pnpx skills add <owner/repo@skill> -y` installs third-party skills without a confirmation prompt; `plan` autonomous mode says to install skills "autonomously without confirmation".
- `.agents/skills/codex/SKILL.md`: `--profile full` runs Codex with `danger-full-access`, full-auto.
- `execute`, `quality`, `schedule`, `plan`, `oops`: "Operate fully autonomously. Never ask the user." Autonomy is the design, not an accident.
- `meditate` autonomous mode applies changes and commits them without review; `reflect` may edit skill files directly.
- `.claude/settings.json` in the repo registers hooks that run `$CLAUDE_PROJECT_DIR/bin/noodle worktree hook` (a binary built from this repo) before Bash calls, `block-sleep.sh`, `inject-brain.sh` at session start, and `auto-index-brain.sh` after writes under `brain/`. Not run here.
- `scripts/sandbox.sh` copies `schedule`, `execute`, `quality` into a seeded sandbox repo and commits (a test fixture).
- Nothing here asks for credentials or sudo; no skill reads `.env` files (not exhaustively searched in the 21 general skills).

## Sources

Noodle (commit `82d2921c52370f23f29086de81ccfb600939c037`): `skill/frontmatter.go`, `skill/resolver.go`, `skill/watcher.go`, `skill/*_test.go`; `internal/taskreg/registry.go`; `internal/orderx/{types,compact,orders}.go`; `internal/schemadoc/specs.go`; `dispatcher/{skill_bundle,command,dispatch_helpers}.go`; `loop/{loop,schedule,util,cook_spawn,cook_completion,builtin_bootstrap}.go`; `mise/types.go`; `config/{types_defaults,parse}.go`; `cmd_skills.go`, `cmd_schema.go`, `cmdmeta/cmdmeta.go`, `generate/skill_noodle.go`, `embed.go`; `docs/concepts/skills.md`, `docs/thinking-in-noodle.md`, `docs/cookbook/*`; `examples/`; `INSTALL.md`; `CHANGELOG.md`; `.agents/skills/*/SKILL.md` and references; `skills/skill-creator/` (including `scripts/quick_validate.py`); `.claude/settings.json`; `brain/codebase/schedule-order-normalized-away-when-skill-missing.md`, `brain/codebase/skill-path-normalization-boundary.md`; `scripts/sandbox.sh`.

Qara (`$HOME/qara`): `.claude/skills/core/skill-structure.md`; `.claude/skills/system-create-skill/`; `.claude/skills/standing-audits/{SKILL.md,references/registry.md}`; `.claude/skills/{dream,hygiene,retro,improve-loop,flows,ticket-round-loop}/SKILL.md`; `scripts/check-skill-definitions.ts`; `package.json` (`check:skills`); `docs/scheduled-job-ceilings.md`.

csf-build (`/media/ssdev/tg-pro/cub/node_modules/csf-build`, read only): `README.md`, `skills/README.md`, `skills/core/assembler-agent/SKILL.md`, `src/stages/shared/schemas/skill-frontmatter.schema.json`, `shared/templates/stage-briefs/reviewer.md`.

Qara, read for the second pass: `scripts/check-skill-definitions.ts` (whole), `scripts/check-skill-route-conflicts.ts` and `check-skill-trigger-overlap.ts` (headers), `scripts/wire-pi-ssot.ts` and `scripts/lib/skill-harness-compatibility.ts` (heads), `.claude/hooks/lib/keyword-routes.json` (head), `.claude/skills/system-create-skill/references/quality-checklist.md` and `SKILL.md`, `.claude/skills/standing-audits/tools/registry.ts` (head) and `registry.test.ts`, `.claude/skills/pi/references/pi-subagents.md` (lines 36-78), `.claude/skills/improve-loop/executor-pi/references/punch-list-contract.md`, `.claude/skills/nune/references/config.md`, `.claude/skills/cruise/workflows/plan-entry-replan.md`, `.claude/tests/skills-validation.test.ts` (grep).

csf, second pass: `/media/ssdev/tg-pro/cub/node_modules/csf-validate/shared/templates/stage-briefs/validator.md`, `csf-build/shared/templates/stage-briefs/qa.md` and `reviewer.md`, `csf-build/src/stages/shared/validate-frontmatter-core.ts` (head).

Noodle, second pass: all `.agents/skills/*/SKILL.md`, `meditate/references/agents.md`, `meditate/scripts/snapshot.sh`, `ruminate/scripts/extract-conversations.py` (head), `quality/references/stage-message-schema.md`, `schedule/references/{events,model-routing}.md`, `execute/references/verification.md`, `cmd_skills_test.go`, `cmd_schema_test.go`, test names across `skill/`, `internal/taskreg/`, `dispatcher/skill_bundle_test.go`, `loop/{order_audit,discover_registry,util}_test.go`, `root.go`, `loop/loop.go`, `brain/architecture.md`, `brain/vision.md`, `brain/todos.md`, and the plans named in NSKILL-21.

Related documents in this track: NSCHED (the scheduler skill and loop), NBRAIN (reflect, meditate, ruminate, brain), NMODE (modes, review, worktrees), NADAPT (adapters, events, `parse/`), NVIEW (CLI, config, monitor, UI).
