# Doctrines

The standing rules for this repository. They bind everyone who works here, people and agents alike. Change a rule by editing this file.

## Working

**W-1. Ask questions one at a time, through the question UI.**
Each question is its own prompt with options to choose from, never a list of questions in prose. Ask only what cannot be settled from the request, the repository or a sensible default.
- Why: instruction from the repository owner, 2026-11-19.

**W-2. Write documents as doctrines.**
Planning and research documents state numbered, binding principles, each with the reason for it and the evidence behind it, in the format below.
- Why: instruction from the repository owner, 2026-11-19. A doctrine can be cited, challenged and checked on its own.

**W-3. Refer to work by track name and doctrine ID.**
For example: "`m365`, FILES-4" or "MATTER-3".

## Repository

**R-1. Each track is a top-level directory with a short lowercase name,** listed in the root `README.md` with its scope and status.

**R-2. A track's `README.md` is the lookup table for that track.** It lists every document (type, doctrine prefix, the question it answers, date), then the code directories. Documents sit flat in the track directory. Subdirectories hold code only.

**R-3. A new document gets its lookup-table row in the same commit.**

**R-4. Code shared between tracks lives in one track's code directory;** the other track's README points to it.

**R-5. Secrets never enter git.** Commit an `.env.example` with empty values; real values go in `.env.local`.

## Document format

```markdown
# PREFIX: Title

**Track:** name · **Type:** planning | research | reference · **Date:** YYYY-MM-DD

**Question:** the one question this document answers.

## Doctrines

**PREFIX-1. One imperative sentence.**
What it requires, in a sentence or two.
- Why: the reason, including what goes wrong without it.
- Evidence: the facts it rests on, with their sources.
- Basis: Verified | Tested | Tenant-tested | Unverified | Decision
- Code: where it is implemented, or "Gap:" and what is missing.

## Open
Decisions still owed (and by whom) and claims still to test.

## Reference
Facts worth keeping that no doctrine depends on. Optional.

## Sources
```

## Basis levels

| Level | Meaning |
| --- | --- |
| Verified | Confirmed in primary documentation (or the source it is published from) |
| Tested | Implemented and covered by automated tests in a spike |
| Tenant-tested | Run successfully against a real Microsoft 365 tenant |
| Unverified | Rests on weaker sources or none. Test before relying on it |
| Decision | A choice, not a fact. The document names who owns it |

A doctrine can carry more than one level, for example "Verified, Tested".

## Doctrine IDs

| Prefix | Track | Document |
| --- | --- | --- |
| W, R | (repository) | `DOCTRINES.md` |
| PLAN | `m365` | `m365/integration-plan.md` |
| AUTH | `m365` | `m365/auth.md` |
| GRAPH | `m365` | `m365/graph-client.md` |
| FILES | `m365` | `m365/files.md` |
| SHARE | `m365` | `m365/sharing.md` |
| MAIL | `m365` | `m365/mail.md` |
| NEXT | `m365` | `m365/nextjs.md` |
| MATTER | `matters` | `matters/roles-and-matter-folders.md` |
| POLICY | `matters` | `matters/policy.md` |
| HUMANS | `factory` | `factory/humans-md.md` |

A new document registers its prefix here. Numbers are never reused: a withdrawn doctrine keeps its number and is marked **Withdrawn**, with the reason.
