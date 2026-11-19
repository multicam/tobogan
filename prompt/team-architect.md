# PROMPT: The "AI team architect" prompt

**Track:** prompt · **Type:** research · **Date:** 2026-11-19

**Question:** is the shared "AI team architect" prompt sound, and what should a version for this owner change?

**Source.** A prompt shared as an image by @datachaz on X (https://x.com/datachaz/status/2122988229964222670/photo/1). x.com is blocked here; the owner pasted its text on 2026-11-19. The pasted text has transcription artefacts (`‹prompt>`, `</workflow›`, `</launch_plan»`), probably from reading the image, which are not counted against the prompt.

## What it does

A single prompt that turns the model into a "team architect" for a beginner's first team of AI agents. It is organised in labelled blocks:

| Block | Asks for |
| --- | --- |
| `role`, `goal` | A blueprint for one real use case, 3 to 5 agents, a prompt each, handoffs, tools, a 7-day launch plan |
| `intake` | Up to 5 questions first: what I do, goals, skills, hours per week, what to take off my plate |
| `use_case` | Compare six common first jobs and recommend the one that saves most time this month |
| `team`, `agent_design` | Per agent: the one job it owns, what it never does, input, output, next agent; one team lead as the only contact |
| `agent_prompts` | A short prompt per agent with job, limits, tool use and approval moments |
| `workflow` | The flow from request to result, review points, what loops back |
| `tool_stack` | Model, docs or knowledge base, spreadsheet or database, task manager, channel, light automation |
| `qa_plan` | Review checkpoints, likely failures, manual tests, one number that proves the team helps |
| `rules` | Narrow scope, evidence before big decisions, approval before publishing, sending, deleting, spending or anything permanent; never ask for secrets |
| `launch_plan`, `output`, `start` | One task per day for 7 days; end with "START HERE FIRST"; ask the questions, then wait for "go" |

## Assessment

Strong for a first team:
- It asks before it plans, and waits for a go.
- One owner per job, explicit "never does", one team lead as the single contact: clean lanes.
- The `rules` block closes the irreversible lane (publish, send, delete, spend, permanent) and never asks for secrets. That matches FLEET-6 and LADDER-5.
- It asks for one number that shows the team helps: a measurable outcome.

Weak against this repository's doctrines:

| Gap | Doctrine it misses |
| --- | --- |
| "What done well looks like" is prose; review is by the team lead, another model: "two optimists agreeing" | LADDER-1, FLEET-1 (a check a program can evaluate) |
| Handoffs are a chain ("who it hands work to next"); nothing asks which steps can run in parallel | FLEET-2 (name the value that crosses each edge) |
| Every node is an agent; no code nodes for merging, sorting, deduplicating | LADDER-9 |
| "What loops back for fixes" has no return packet, no attempt cap, no escalation | FLEET-4, LADDER-6 |
| No learning edge: nothing makes run two smarter than run one | FLEET-5, LADDER-8 |
| Approval is listed per action, but the owner is also the team lead's only contact for everything: the human sits in the middle of the graph | FLEET-7 |
| Up to 5 questions at once | The owner's profile: one question per message, with a recommended answer (W-1, HUMANS-6) |
| A generic tool stack; it does not ask what the owner already runs | This owner already has Microsoft 365 (SharePoint, Outlook, Teams, Lists) and AWS |
| Hard-codes a model name, which will age | Keep the model a placeholder |

## Doctrines

**PROMPT-1. A team-design prompt must demand a machine-checkable GREEN for every agent.**
- Why: without it the "QA plan" is a list of things to look at, and the team lead's review is self-report.
- Basis: Decision

**PROMPT-2. It must ask for the graph, not just the chain: parallel steps, code steps, gates and return paths.**
- Why: a team of agents handing work down a line is the "very good agent running the wrong three steps, in the wrong order, one at a time".
- Basis: Decision

**PROMPT-3. It must design the learning edge from day one, even if built last.**
- Basis: Decision

**PROMPT-4. Intake follows the reader's profile.**
For this owner: one question per message, multiple choice, a recommended answer each time.
- Basis: Decision (from HUMANS-6)

**PROMPT-5. The tool stack starts from what the owner already runs.**
- Why: a new docs tool, task manager and channel each add setup and a place for work to get lost; this owner already has Microsoft 365 and AWS.
- Basis: Decision

## Revised prompt

The original's structure is kept; changes are marked in the doctrines above. Placeholders are in square brackets.

```xml
<prompt>
<role>You are my AI team architect. Help me design and launch my first real team of AI agents. Think like an operator and a systems designer: small team, real work, clear lanes, me in control at one point only.</role>

<goal>A blueprint I can set up this week: one use case, [3 to 5] agents, a prompt for each, the graph of the work, the checks, the tools and a [7]-day launch plan.</goal>

<intake>Before planning, ask me up to 5 questions, one per message, each as multiple choice with your recommended answer marked. Cover: what I do, the goal, my skills, hours per week, what to take off my plate first, and which tools I already pay for. Wait for each answer.</intake>

<use_case>Compare realistic first jobs (research and writing, lead generation, support, inbox and follow-ups, research assistance, personal productivity, or one I name). Recommend the one that saves the most time this month and that has an outcome a program can check. Say why the others wait.</use_case>

<graph>Design the work as a graph, not a chain:
- Splitter: how the work is cut, and why that cut (by risk, not by convenience).
- Workers: one job each, one lens, own context; what each never does.
- Code steps: every step with one correct answer (merge, sort, dedupe, compare, count) is code, not an agent.
- Edges: for each, name the output that crosses it; steps with no crossing output run in parallel.
- Team lead: assembles the result and is my only contact.</graph>

<checks>For every agent and for the final result, write GREEN as conditions a program could evaluate (exit codes, schemas, required fields, a source line per claim, files touched). "Looks good", "confident" and "no errors" are not checks.</checks>

<returns>On a red check, return only the failed unit with: UNIT, VERDICT, REASON, EVIDENCE, SCOPE. Stop after 3 failed corrections and bring me the plan, not the work. After each accepted run, write what was learned as a rule for the splitter: ACCEPTED, DERIVED, LANDS IN.</returns>

<lanes>Sort every action by the cost of undoing it:
- Reversible and contained: runs on green.
- Reversible but wide: green plus a clean trace of the run.
- Hard to reverse (publish, send, delete, spend, change permissions, anything permanent): never automatic. I approve each one.
Put me on that last lane only; do not ask me to review intermediate work.</lanes>

<agent_prompts>For each agent: a short prompt with labelled blocks JOB, NEVER, INPUT, OUTPUT, GREEN, TOOLS, STOP_AND_ASK.</agent_prompts>

<tool_stack>Start from the tools I already use; add a tool only when the plan cannot work without it, and say why.</tool_stack>

<qa_plan>The likely failures, the checks that catch them, what I test by hand before launch, and one number that shows the team saves time.</qa_plan>

<rules>Narrow scope. Evidence before big decisions. Never ask for passwords or secrets in chat.</rules>

<launch_plan>[7] days, one task per day: build the checks first, then the lanes, then switch agents on one at a time, then the learning rule.</launch_plan>

<output>One blueprint: use case, graph, checks, agent prompts, return and learning rules, lanes, tools, QA plan, launch plan. End with "START HERE FIRST": the first thing to do today.</output>

<start>Ask your first question. Wait for my answer before the next.</start>
</prompt>
```

## Open

- What the owner wants this prompt for: their own first team, the firm's, or a feature of cub. The answer decides the use case and tool stack (being asked).

## Sources

- https://x.com/datachaz/status/2122988229964222670/photo/1: text pasted by the owner, 2026-11-19 (primary)
