# INFER: The inference-optimisation skill, and what carries over to parallel hosted models

**Track:** inference · **Type:** research · **Date:** 2026-11-22

**Question:** what does the inference-optimisation skill do, how good is it, and which of its findings carry over to running many lighter hosted models in parallel (Haiku- and Sonnet-class Claude subagents, the GLM Coding Plan, Codex/OpenAI and Gemini CLI, run as Qara subagents and pi Runs and as csf drain workers): adopt as is, adapt, or not at all?

**Scope.** The owner narrowed the scope on 2026-11-22, through the coordinator. Local models are low priority, so engine configuration gets one short doctrine (INFER-9). The rest asks what transfers to hosted lighter models.

**Sources.** There are four kinds:
- The external repository `sybil-solutions/inference-optimisation-skill`, read at commit `fda968e7fc1996aa23c67139c755fe541c9d4be0` (2026-11-16). Every file was read. No file in it was run. Paths below such as `SKILL.md:80` are relative to `skills/inference-optimisation/` unless they start with the repository root (`README.md`, `PROMPT.md`).
- Qara at `$HOME/qara` and csf-build as installed in `cub` (`node_modules/csf-build`), read on 2026-11-22.
- This host (jmbox), inspected read-only on 2026-11-22.
- Primary documentation pages, fetched on 2026-11-22 and listed under Sources.

"Verified" below means the claim was checked on a fetched primary page, or read in local source (the skill's repository, Qara, csf, this host). "Verified (paraphrase)" marks a claim that rests on a fetch tool's summary of a page, not on the page text. Each mapping from GPU serving to hosted agents is this document's reasoning, so it is Unverified until tested. The 2026-11-22 model sweep (`inference/sweep/`) is cited where it applies (INFER-4 to INFER-7). Its figures are labelled Verified because they are read from the committed results file, not Tested: the harness has its own tests, but the findings are measurements, not tested code.

## Doctrines

**INFER-1. Read the skill as a measurement discipline for one model server, not as a list of flags.**
The skill runs a six-step hill-climb on one machine and one server:
1. Measure the baseline.
2. Compute the theoretical ceiling.
3. Change one thing.
4. Measure it against controls.
5. Keep it or reject it, with a written reason.
6. Repeat until a plateau, then qualify and publish.

It optimises decode tok/s (one user and N users), speculative decoding, prefill tok/s, KV capacity, startup time and TTFT, under a memory cap. It names vLLM, SGLang, llama.cpp, ExLlama/TabbyAPI, MLX and TensorRT-LLM.
- Why: the value is in the method, the ceilings and the logged failures. Its flag advice is tied to particular engines, versions and cards.
- Evidence:
  - Loop: `SKILL.md:20-27`. Diagram: `SKILL.md:106-110`.
  - Setup before touching anything: `SKILL.md:38-58`. It inventories the machine, measures real bandwidth and GEMM throughput, and creates `PLAN.md`, `THEORY.md`, `ledger.jsonl`, `configs/` and `best-config.json`.
  - Ceilings first: `SKILL.md:60-76` and `references/ceilings.md:5-45`. Decode is bytes read per emitted token divided by measured bandwidth. Prefill is FLOPs per token divided by about 50% of measured peak. Speculative decoding divides the target's bytes by the accepted length and adds the draft's bytes.
  - Ground rules: `SKILL.md:78-102`. One change per experiment. At least six samples and the median. Control, candidate, control. Accept only if the candidate beats both controls and regresses nothing by more than about 3%. Fixed power profile. One GPU job at a time. A memory watchdog. Long-context needle and soak gates. Output checks. Log everything.
  - Lever order, cheapest first: `SKILL.md:112-134`. Caches, then decode graphs, then speculative decoding, then concurrency and KV, then prefill, then kernel tiles, then kernel work.
  - Plateau: three levers in a row inside noise (`SKILL.md:142-150`).
  - Publishing: pinned weights, image and kernels, a clean build, six acceptance gates, and an A/B of the clean build against the best (`SKILL.md:152-159`, `references/publishing.md:10-40`).
  - Harness: `scripts/bench.py` (any OpenAI-compatible server), `scripts/ceiling.py`, `scripts/queue.sh` (an flock-serialised queue) and `scripts/mem.sh` (container memory, including unified-memory GPU residency).
- Basis: Verified (read in the repository at the SHA)
- Code: Gap: none in Qara or csf. This is a description.

**INFER-2. Take the method; do not vendor the scripts.**
The prose is careful. The scripts enforce less than the prose requires.
- Why: an agent that runs the bundled harness would believe it has controls the code does not provide.
- Evidence:
  - The prompt panel is fixed across runs, as `references/methodology.md:21` asks (`scripts/bench.py:34-41`). But each run takes one sample per prompt (`scripts/bench.py:187-191`), at temperature 0.6 with no seed (`scripts/bench.py:68`), after one 16-token warm-up (`scripts/bench.py:183`). The median mixes content types, and sampling noise is not controlled.
  - `on_ac()` fails open: it returns true on any error (`scripts/bench.py:129-130`).
  - The prose requires a performance-profile guard, an idle-host check, a bootstrap 95% CI for engine comparisons and a greedy equivalence check (`SKILL.md:86-98`, `references/methodology.md:23`). None of these is in the scripts. Accept or reject is left to the agent.
  - The needle check is a substring test (`scripts/bench.py:221`), not the "found exactly" the prose asks for (`SKILL.md:96`).
  - The worked example's arithmetic is consistent. Recomputed by hand: 115 / 1.68 ≈ 68, and the 1-draft and 2-draft rows give about 83, 96 and 103 tok/s (`references/ceilings.md:62-69`). The example JSON uses an acceptance of 1.74 for one draft (`examples/ceiling-ornith-b390.json:3`), while the text uses 1.85 (`references/ceilings.md:67`).
  - The repository is one commit by one author (`0xSero`). The README's results (`README.md:28-36`) point to sibling repositories and cannot be checked from this one.
  - Two flag claims were checked against primary docs. vLLM's `--safetensors-load-strategy` has an `eager` value, and the default is memory-mapped lazy loading (`references/gotchas.md:20`). SGLang has `--max-mamba-cache-size` and the `NEXTN` speculative algorithm (`references/gotchas.md:26`, `examples/config-sglang-docker.json:13`). vLLM's `FULL_DECODE_ONLY` is not on the engine-arguments page. SGLang's `--num-continuous-decode-steps` was not in the part of its page that was read. The claim that vLLM disables prefix caching for hybrid models (`references/gotchas.md:17`) is not on the engine-arguments page.
- Basis: Verified (the code at the SHA; vLLM and SGLang flags as listed); Unverified (the README's results, the flags not seen)
- Code: Gap: no vendored copy exists, and none is recommended (INFER-10).

**INFER-3. Fold the skill's hill-climb rules into `performance-goal` when comparing hosted models, prompts or routings.**
`performance-goal` already does A/A dispersion, interleaved A/B, guards and stop circuits. Three things in the skill are missing from it and worth adding as a hosted-agent reference:
- **Ceiling first:** write down the budget before optimising (INFER-6).
- **Suspiciously fast means broken:** a run that is much cheaper or faster than its neighbours gets an output check before it counts.
- **Failure log:** every rejected lever goes in the log with its reason, and it is never retried without a new reason.
- Why: Qara's own sweep shows the gain comes from measuring per finished task, not per call. Single runs of an agent task are noisy, as single GPU runs are.
- Evidence:
  - The skill's rules: `SKILL.md:80-85`, `100-101`, `52`, `142-150`; `references/methodology.md:42` (a 117 tok/s "record" was a model looping).
  - `performance-goal`'s contract already names `aa-dispersion`, `interleaved-ab-calibration`, `derived-noise-margin` and `max-consecutive-no-progress` (`qara/.claude/skills/performance-goal/decision-contract.json`).
  - The 2026-11-12 qara sweep: 45/45 runs passed at every model and effort (5 small-to-medium tasks at n=5), and sonnet at low effort was the cheapest per finished task (`qara/.claude/context/delegation-roster-and-tiers.md:102`). "Price per token is not price per task" (`delegation-roster-and-tiers.md:54`).
- Basis: Unverified (the mapping); Verified (the Qara facts, read in source)
- Code: Gap: no hosted-agent reference in `performance-goal`.

**INFER-4. Judge draft-then-verify by cost per accepted result, and remember an agent verifier is not exact.**
Qara's tier ladder is already draft-then-verify: haiku, then sonnet, then opus. Cheap reviewers run before an opus rung. The skill's lessons on speculative decoding carry over as questions to measure:
- **Per-step cost beats acceptance rate:** a cheap draft that is often rejected costs more than starting at the stronger tier.
- **Draft depth varies by workload:** the best depth depends on the load and the context.
- **Speculation can lose:** on weak hardware or hard prompts it is slower than no speculation.

The analogy breaks in one place. Speculative decoding is lossless: the target model checks every token. An agent verifier samples and judges, so a wrong draft can pass.
- Why: without the cost-per-accepted-result view, a cheap first rung looks free. Without the exactness caveat, "verified by sonnet" reads stronger than it is.
- Evidence:
  - The skill's lessons: `references/levers.md:25-36`; `references/methodology.md:29-31` (a 7-token draft accepted 3.26 tokens against 2.85, yet ran 11–14% slower).
  - Exactness: the target "still verifies against the full vocabulary, so output is unchanged" (`references/levers.md:26`).
  - Qara's ladder: `self-check → haiku → sonnet → opus` (`qara/.claude/context/delegation-roster-and-tiers.md:93-111`). The first lever is a self-check the agent must pass, such as a test or build (`delegation-roster-and-tiers.md:97-100`). That is the nearest thing to an exact verifier.
  - Sweep, 2026-11-22 (`inference/sweep-results-full-20261122.md`; hidden tests, 5 tasks, n=5, effort/thinking medium): Codex (`gpt-6.2-sol` via pi) passed 25 of 25. GLM (`glm-5.3-flash`, Coding Plan) passed 23 of 23 counted runs: two of its 25 runs are excluded, because the hardened escape scan re-scored them on 2026-11-23 (q1508__glm__r3 read `~/.agents/skills/code-style/SKILL.md`, a real out-of-tree read of a skill file that was not the answer; q1543__glm__r3 ran `cd /` before deleting its own temp dir, flagged by rule). Pass rate is still at ceiling, so it does not separate the models; cost does. GLM used about 4.4x Codex's tokens per pass (1,168k against 266k, mean), and about 9.6x on the median of the larger task q1543 (2.32M to 5.61M tokens per run over its 4 counted runs against 0.31M to 0.57M). Its list-price cost per pass was lower ($0.051 against $0.128), and it was about 3.6x slower (median wall 248 s against 68 s). List-price dollars are pi's estimate, not plan credits. The Claude cells have 1 to 2 runs each (haiku 2, sonnet 1, opus 1) because the quota guard parked the rest, so no Claude claim is made.
- Basis: Verified (the sweep figures for GLM and Codex only, read in `inference/sweep-results-full-20261122.md`, re-scored 2026-11-23); Unverified (the mapping); Verified (the repository and Qara text)
- Code: `inference/sweep/` measures first-attempt acceptance once. Gap: acceptance rate per rung is not recorded permanently. The `[ESCALATED]` marker counts only opus rungs (`delegation-roster-and-tiers.md:86`).

**INFER-5. Keep one stable prompt prefix per worker kind, confirm cache hits from usage, and warm one request before a fan-out.**
- **Stable prefix:** a cached prefix must match exactly. Put the stable brief, tools and instructions first and the variable part last.
- **Confirm hits:** read the cache fields in the provider's usage stats, not a guess. This is the skill's "count tokens from usage, not from chunks" rule (`references/methodology.md:7`).
- **Warm first:** on Anthropic's API, a cache entry becomes usable only once the first response starts. Parallel requests sent at the same moment all miss.
- **Keep it warm:** Anthropic's default cache lives 5 minutes, refreshed on each hit. OpenAI keeps entries for at least 30 minutes on GPT-5.6 and later.
- Why: this is the hosted twin of the skill's first lever, persisting JIT and graph caches across restarts (`SKILL.md:116`, `references/levers.md:12-14`). It is cheap to try.
- Evidence (the caching pages were read through a fetch tool's summary, so the page claims below are paraphrases):
  - Sweep, 2026-11-22 (`inference/sweep-results-full-20261122.md`): median cache-read share of prompt-side tokens (input + cache read + cache write, not output) was 0.93 for GLM and 0.83 for Codex, both through pi. These are measured on those two routes only; Claude cells have 1 to 2 runs and are not claimed.
  - Anthropic prompt caching: a 5-minute default lifetime, refreshed free on each use. Segments must be 100% identical. For concurrent requests, a cache entry becomes available only after the first response starts. The minimum is 512 tokens on Haiku 5.5, Sonnet 5.5 and Opus 5.5.
  - Anthropic rate limits: cache reads do not count toward ITPM or ramp limits.
  - OpenAI prompt caching: on by default, and the whole rendered prefix must match. The page advises about 15 requests a minute per `prompt_cache_key`, above which traffic can overflow to other machines. On GPT-5.6 and later the key is optional.
  - Qara already measures this. The inlined core text is served from cache 96.6% of the time, and a weekly `cache_hit_rate` below about 0.85 is a watched signal (`qara/decisions/2026-10-21-core-inline-delivered-under-hook-output-cap.md:14`, `:84`).
  - csf staggers dispatches 60 s apart by default (`csf-build/src/drain/drain-config/drain-paths.ts:72-80`). That spacing would let a first worker warm a shared prefix, if workers shared one. Whether they do was not checked.
- Basis: Verified (paraphrase) (metered API pages only); Verified (cache hit on GLM and Codex via pi, read in `inference/sweep-results-full-20261122.md`, re-scored 2026-11-23); Unverified (whether the documented lifetimes hold on the subscription surfaces: Claude Code on a subscription, Codex through `openai-codex`, the GLM Coding Plan, Gemini CLI)
- Code: `inference/sweep/` records cache hit per run. Gap: no per-worker-kind cache-hit measurement for csf drain workers.

**INFER-6. Shrink the context before counting on caching.**
For an agent, "prefill" is the context it reloads on every turn, and "decode" is what it writes. Context reload dominates. Write the ceiling as an arithmetic budget first: tokens per task ≈ the sum over turns of context size, plus output. Then move the big term.
- Why: the skill's ceilings show that KV reads dominate decode at long context (`references/ceilings.md:13`). Qara's own Codex audit found the same shape. Caching only discounts the replay. Cutting the context is what shrinks it.
- Evidence:
  - The Codex audit: 2.35B tokens a week, 97.6% of input being cache re-reads, `tokens/week ≈ Σ_turns(context_size)`; "Prompt caching was already at 97.6%: discounting, not shrinking." The fix was the auto-compact limit, 900000 → 175000, estimated at 40–55% (`qara/decisions/2026-09-20-codex-token-burn-remediation.md:20-24`, `:33-35`).
  - The skill's "profile by stage first" rule (`references/levers.md:73`) maps onto measuring per turn and per context bucket, which `qara/scripts/codex-token-audit.ts` already does for Codex.
  - Sweep, 2026-11-22: GLM's token use per pass was 4.4x Codex's with the same ceiling pass rate (GLM 23 of 23 counted runs, two excluded by the 2026-11-23 re-score; Codex 25 of 25), and cache-read share was 0.93 and 0.83 (`inference/sweep-results-full-20261122.md`, re-scored 2026-11-23). Inference, Unverified: most of those tokens are probably replayed context, but the sweep recorded no per-turn data to show it.
- Basis: Verified (Qara's measured audit); Verified (token and cache figures, GLM and Codex only, read in `inference/sweep-results-full-20261122.md`, re-scored 2026-11-23); Unverified (the mapping, and whether the same shape holds for Claude subagents)
- Code: `qara/scripts/codex-token-audit.ts` (Codex only). Gap: no matching audit for Claude subagents, pi Runs or csf drain workers.

**INFER-7. Find the cap that actually binds before adding parallel workers, and ramp up rather than burst.**
The skill warns that the advertised capacity is often not the binding one: for hybrid models, state slots cap concurrency, not KV tokens. It also requires proof that N streams actually ran at once, and measures aggregate throughput by wall clock. The hosted twins are:
- **Caps that can bind:** Claude Code's 20 concurrent subagents and 16 concurrent Workflow agents. csf's 5 lanes, at most 5 pi panes, and 60 s stagger. Each plan's quota window.
- **Measure:** completed work orders per wall-clock hour, not the sum of per-lane rates.
- **Ramp:** Anthropic's API has ramp limits that answer a sudden burst with 429, even under the rate limit. Its advice is to start low, spread requests evenly, and go up one step a minute.
- Why: more lanes do not help when a plan quota or a shared resource binds first, and a burst can trip a limit that steady traffic would not.
- Evidence:
  - The skill: `references/levers.md:50-53`; `references/methodology.md:12`.
  - Claude Code caps: `qara/.claude/context/delegation-parallel-execution.md:33-35`.
  - csf: "SLOTS (d4, ≤5 pi panes, no load backoff since d40)" and "`drain.lanes` is the only slot cap" (`csf-build/src/drain/drain-schedule/drain-schedule-next.ts:11`, `:198`). The defaults are 5 lanes and a 60 s stagger (`drain-paths.ts:72-80`). Cub's `.csf/profile.json` sets no drain overrides. A drain can still pass its own lane count at init (`csf-build/src/drain/drain-lifecycle/drain-init.ts:96`).
  - Quotas: the GLM Coding Plan is metered in plan credits and quotas (`qara/decisions/2026-09-30-zai-coding-plan-subscription.md:16`). glm-5.3-flash costs 0.4× off-peak and 1.2× at peak (`qara/.claude/context/model-policy.md:69`). That makes bulk GLM work cheaper off-peak.
  - Rate-limit handling today is recovery, not prevention. Qara's StopFailure hook saves a checkpoint and logs the failure (`qara/hooks-rs/src/hooks/stop_failure.rs:1-3`; a `rate_limit` stop is tested in `stop_failure_tests.rs:20`, `:84`). csf's pi login preflight treats a 429 as a transit failure (`csf-build/src/runner/pi-login-preflight.ts:36`). Weekly Codex rate-limit peaks are reported by `codex-token-audit.ts`.
  - Anthropic ramp limits and cache-aware ITPM: the Rate limits page (metered API).
  - Sweep, 2026-11-22: the binding limit was the Claude five-hour window, which reached 0.98, not any provider rate limit; the quota guard parked Claude after one to two runs per cell (haiku 2, sonnet 2 with one run excluded as an escape, opus 1) and no pi run (GLM, Codex) was rate-limited (rate-limited count 0 in `inference/sweep-results-full-20261122.md`; GLM's 2 exclusions there are escapes, not rate limits).
- Basis: Verified (Qara and csf source); Verified (paraphrase) (Anthropic's metered API page); Verified (the Claude window as the binding cap, read in the committed results file's park event); Unverified (the subscription quota windows for Claude, Codex and Gemini)
- Code: Gap: no quota-aware scheduling in csf, and no measure of drain throughput per wall-clock hour.

**INFER-8. Measure spawn overhead as the hosted TTFT, before tuning it.**
The skill treats startup and TTFT as metrics with their own floors (`SKILL.md:72-73`, `references/levers.md:10-17`). Its first suspects for short-prompt TTFT are the tokenizer, the chat template and the sampler, before any kernel. The hosted twin is spawn overhead: the time and tokens an agent spends loading its system prompt, skills and brief before useful work begins.
- Why: with many short-lived workers, spawn overhead is paid on every task. It is not measured today, so it cannot be compared with the 60 s stagger or with the context work in INFER-6.
- Evidence: the skill's text as cited. In csf, dispatch spawns `bsvc run pi` in a pane (`csf-build/src/engine/stage-dispatch-pane.ts:178`). No spawn-time or first-turn-token measurement was found in Qara or csf.
- Basis: Unverified
- Code: Gap: no spawn-overhead metric.

**INFER-9. Treat local serving as interesting, not a priority.**
Qara does run local inference. csf does not. This host is jmbox: an RTX 3090 with 24 GiB, an i9-9900K, 125 GiB of RAM, and Ollama 0.40.16. Nine models are installed (seven chat models at Q4_K_M and two embedding models at F16). None was loaded at inspection. Qara calls Ollama, on localhost by default and on jmbox as the configured remote host, from these code paths:
- the shared client `ollama-client.ts`, which defaults to Gemma 4;
- the weekly TGDS code scan, on Gemma 4, through curl;
- audience docs, on `qwen3.6:35b`, through its own fetch;
- the dream judge, on `qwen2.5-coder:14b`;
- the risk-review fallback when GLM is down. Its `localval` binaries were recorded as absent on one workstation (`qara/docs/TESTING.md:515`), so this is a code path, not a known running job.

csf drain workers run pi on hosted providers. The subscription proxy on `127.0.0.1:8317` forwards to hosted models; it is not local serving.

The skill's levers target vLLM, SGLang and ExLlama. Ollama exposes few of them: a global KV cache type, parallel requests (default 1), context length (default 4096) and flash attention. `bench.py` would work against Ollama, because Ollama's OpenAI layer supports `stream_options.include_usage` and `/v1/models`.
- Why: the local jobs are side jobs (scans, judges, fallbacks). None sits on csf's critical path, so tuning them buys little now. That changes if a local model takes a drain role, or the owner wants a judge to run faster.
- Evidence:
  - Host facts: `nvidia-smi`, `lscpu`, `free -g`, and Ollama's `/api/tags` and `/api/version` on 2026-11-22.
  - Qara: `qara/.claude/hooks/lib/llm/ollama-client.ts:26-37`. It records the 3090 running gemma4 at 96.8 tok/s against 57.0 on an M1 Max, and prefill at about 5800 against 625 tok/s. Also `qara/scripts/tgds-code-scan.sh:2`, `:31`; `qara/scripts/audience-docs.ts:11`; `qara/config/models.json:54-56`; `qara/scripts/gate/risk-review.ts:60`.
  - csf: dispatch passes pi a routing label but "Never `--model`", so a drain worker takes pi's default route (`csf-build/src/engine/stage-dispatch-pane.ts:266-271`). pi's default provider is `openai-codex` (`qara/.pi/agent-settings.json:2-3`), and its only custom provider points at the proxy. Which pi settings a drain on jmbox loads was not traced, and no model IDs were found in cub's `.csf` run records or lane receipts.
  - Ollama docs: the FAQ (KV cache type, parallel requests, context length, flash attention) and the OpenAI-compatibility page.
- Basis: Verified (host, Qara source, Ollama docs); Unverified (that csf drains resolve to these pi settings)
- Code: Gap: none needed now.

**INFER-10. Adapt the ideas into Qara references; do not vendor or install the skill.**
The options, with the conditions for each:
- **Adopt as is (vendored):** reject. Qara has no target for its engine levers. Its scripts are Python, against Qara's "TypeScript over Python unless JM approves" rule. Its shape (no Workflow Routing, no `When to Activate` triggers, no `metadata.category`) fails Qara's skill structure. Reconsider only if a local model moves onto a critical path (INFER-9).
- **Adapt into Qara (recommended):** two small pieces.
  - A hosted-agent reference under `performance-goal`. It carries INFER-3 to INFER-8: ceiling first, the suspicious-win check, the failure log, cost per accepted result, prefix and cache checks, binding caps and ramp-up, and spawn overhead.
  - A note in `delegation-parallel-execution.md` pointing to INFER-7.

  Keep: the method, the ceiling arithmetic as a budget, the measurement traps in `references/methodology.md`, and the plateau rule. Cut: the engine levers, the gotchas, the GPU harness and publishing.
- **Reference only:** link this document and the repository at the pinned SHA from tobogan. This is the floor if the owner wants no Qara change.
- **Adopt the metrics in csf:** completed work orders per wall-clock hour, cache-hit share and spawn overhead per worker kind. These belong in csf-build once the owner wants drain tuning, not before.
- Why: the transferable part is a few pages of method. The rest targets hardware and engines that csf does not use.
- Evidence: INFER-2 to INFER-9; `qara/.claude/skills/core/SKILL.md:80`; `qara/.claude/skills/system-create-skill/SKILL.md:39-46`.
- Basis: Decision (owner, pending; see Open). The owner's reframing is itself a Decision (owner, 2026-11-22, relayed by the coordinator).
- Code: Gap: neither the reference nor the note exists.

**INFER-11. Treat the skill's text as instructions an agent would execute, and pin and review it before any use.**
- **Licence:** MIT, copyright 2026 Sybil Solutions contributors (`LICENSE`). Any copied text keeps the notice.
- **Supply chain:** the README installs by cloning `main` into `~/.claude/skills` (`README.md:104-110`). Pin `fda968e` instead, and review each update's diff before taking it.
- **Prompt-injection surface:** a skill's text runs as instructions. Nothing hidden was found, and there are no hooks or settings files. But the skill openly tells an agent to do the following:
  - Store a sudo password or token in a mode-600 file (`PROMPT.md:46`). That conflicts with the rule that passwords are never written down.
  - Run passwordless `sudo` for the memory probe (`scripts/mem.sh:6-7`; `examples/config-sglang-docker.json:21` uses `sudo -n`).
  - Detach long jobs with `setsid nohup … & disown` so they outlive the agent (`SKILL.md:92`, `scripts/queue.sh:6`).
  - Keep looping when told "don't stop" (`SKILL.md:150`, `PROMPT.md:47`).
  - Change and restore power profiles (`SKILL.md:86-89`).
  - Run `docker run`, `docker stop` and `docker rm -f` from config (`examples/config-sglang-docker.json:5-15`).
  - Open a PR to publish (`PROMPT.md:80-86`).
- **Arbitrary commands:** `bench.py` executes the `launch`, `stop` and memory-probe argv taken from any config file (`scripts/bench.py:142`, `158-166`). Whoever writes a config controls what runs.
- **Shared lock:** `queue.sh` takes a world-writable lock path in `/tmp` (`scripts/queue.sh:8-9`).
- Why: an adapted reference avoids every one of these, because it carries method text only.
- Evidence: as cited, at the SHA.
- Basis: Verified (read in the repository at the SHA)
- Code: Gap: nothing to implement if INFER-10's adaptation is chosen.

## Open

Rulings by the owner in the tobogan session, 2026-11-22, each Basis Decision:

- **Ruled: adoption option** (INFER-10, Q1). Adapt the method into a Qara reference under `performance-goal`, taking no files and installing nothing. Done in Qara PR #1960, merge head 2fdde680. Basis: Decision.
- **Ruled: timing** (Q2). Write it now. Basis: Decision.
- **Ruled: draft acceptance per rung** (INFER-4, Q3). Measure first-attempt acceptance once, with no permanent logging. Basis: Decision.
- **Ruled: sweep shape** (Q4). Five cells (Claude Haiku, Sonnet and Opus on subscription, GLM `glm-5.3-flash` on the Coding Plan, Codex `gpt-6.2-sol` via pi) on 5 tasks at n=5. Basis: Decision.
- **Ruled: drain metrics** (INFER-7, INFER-8, Q5). Suggest them to the Orchestrator. The Orchestrator adopted measure-first but deferred it to a low-priority csf-build debt row behind cub WO-212. Basis: Decision.
- **Ruled: run timing** (Q6). Run now. The Claude quota guard parked Claude after one to two runs per cell (haiku 2, sonnet 2 with one run excluded as an escape, opus 1). 70 runs (sonnet 23, opus 24, haiku 23) are deferred until JM approves after the Thu 26 Nov 11:00Z reset. Basis: Decision.

Answered, relayed:

- **What csf drains actually run on** (INFER-9). The Orchestrator reports that drain pi panes take their model from the global `~/.pi/agent/settings.json` (gpt-6.2-sol, medium thinking), since `bsvc run pi` passes no `--model`. Basis: Unverified (relayed by the Orchestrator, not checked here). Which file a pane actually loads stays in the Orchestrator's debt row.

Still open:

- **Claude wave** (INFER-4): the 70 deferred Claude runs, after JM's approval past the quota reset. Until then there are no Claude findings beyond 1 to 2 runs per cell. Owner: JM.
- **A discriminating wave** (INFER-4): pass rate was at ceiling, so harder tasks are needed before pass rate can rank models. Owner: the owner.
- **Subscription limits** (INFER-5, INFER-7): whether prompt caching, its lifetime and ramp behaviour hold on Claude Code subscriptions, Codex through `openai-codex`, the GLM Coding Plan and Gemini CLI, and what each quota window is. The fetched pages cover the metered APIs only. The sweep measured cache-read share on GLM and Codex but not lifetimes. Owner: the owner, or a measurement run.
- **Whether csf workers share a cacheable prefix** (INFER-5): if they do, the 60 s stagger already warms it. Test with cache fields from one drain.
- **Spawn overhead and wall-clock drain throughput** (INFER-7, INFER-8): neither is measured in csf. They sit in the Orchestrator's deferred csf-build debt row.

## Reference

How work is routed to models today, as read on 2026-11-22:
- **Claude Code subagents:** a tier per agent. Haiku for lookups, thoughts and researchers. Sonnet for engineers, reviewers, critics and verifiers. Opus for architects, designers and the last escalation rung (`qara/.claude/context/delegation-roster-and-tiers.md:11-29`, `:93-111`). Up to 20 run at once (`delegation-parallel-execution.md:33`).
- **pi Runs:** default provider `openai-codex`, model `gpt-6.2-sol` (`qara/.pi/agent-settings.json:2-3`). A proxy catalog on `127.0.0.1:8317` serves GPT and GLM models to pi and Droid (`qara/config/models.json`, `agentHarnesses.proxy`). Parallel pi Runs are not capped (`qara/.claude/skills/pi/references/pi-subagents.md:122`).
- **GLM:** `glm-5.3-flash` everywhere, on the Coding Plan (`qara/.claude/context/model-policy.md:61-65`, `:121-123`).
- **Gemini:** the `gemini-researcher` fallback, through `qara/.claude/hooks/lib/llm/gemini-call.ts`.
- **csf drain workers:** `bsvc run pi` in a pane, with pi's default route (`csf-build/src/engine/stage-dispatch-pane.ts:178`, `:266-271`). At most 5 at once, 60 s apart (INFER-7).
- **Local:** Ollama for scans, judges and fallbacks (INFER-9).

Other notes:

- The repository's history is one commit, `fda968e` on 2026-11-16, by one author. Stars and forks were not re-checked.
- Files read: `README.md`, `PROMPT.md`, `LICENSE`, `.gitignore`, and under `skills/inference-optimisation/`: `SKILL.md`, `references/{ceilings,gotchas,levers,methodology,publishing}.md`, `scripts/{bench.py,ceiling.py,mem.sh,queue.sh}`, `examples/{ceiling-ornith-b390,config-existing-server,config-sglang-docker}.json`. There are no hooks, settings or `.claude` files.
- Qara's tier costs per call (about 40k in, 8k out, vendor list price, November 2026): opus $0.32, sonnet $0.16, haiku $0.008 (`qara/.claude/context/delegation-roster-and-tiers.md:44-52`). Plan usage draws credits, not these dollars.

## Sources

- `sybil-solutions/inference-optimisation-skill` at `fda968e7fc1996aa23c67139c755fe541c9d4be0`, https://github.com/sybil-solutions/inference-optimisation-skill, cloned and read 2026-11-22. Nothing in it was run.
- vLLM, "Engine Arguments", https://docs.vllm.ai/en/latest/configuration/engine_args.html, fetched 2026-11-22 (long page, read in two parts).
- SGLang, "Server Arguments", https://docs.sglang.io/advanced_features/server_arguments.html, fetched 2026-11-22 (the first 100,000 characters only).
- Ollama, "OpenAI compatibility", https://docs.ollama.com/api/openai-compatibility, fetched 2026-11-22.
- Ollama, "FAQ", https://docs.ollama.com/faq, fetched 2026-11-22.
- Anthropic, "Prompt caching", https://platform.claude.com/docs/en/build-with-claude/prompt-caching, fetched 2026-11-22 (the first 100,000 characters only).
- Anthropic, "Rate limits", https://platform.claude.com/docs/en/api/rate-limits, fetched 2026-11-22.
- OpenAI, "Prompt caching", https://developers.openai.com/api/docs/guides/prompt-caching, fetched 2026-11-22.
- Qara at `$HOME/qara` and csf-build in `cub/node_modules/csf-build`, read 2026-11-22, at the paths cited above.
- jmbox host inspection (`nvidia-smi`, `lscpu`, `free -g`, Ollama `/api/tags`, `/api/version`), 2026-11-22.
