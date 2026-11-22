# tobogan

Research workspace for the **cub** project: a Next.js app for a legal firm, integrated with SharePoint and other Microsoft 365 services.

## Tracks

Each track is a top-level directory. Use the short name to refer to it.

| Track | Directory | Scope | Status |
| --- | --- | --- | --- |
| `m365` | `m365/` | Plumbing for Microsoft 365: sign-in and tokens, the Graph client, SharePoint files and sharing, Exchange mail, Next.js specifics | Seven documents; spike closes every recorded gap (522 tests). Not yet run against a tenant |
| `matters` | `matters/` | The firm's model: admin, team leader and associate roles; a matter as a SharePoint folder limited to its team | Two documents; policy decided 2026-11-19 and built (522 tests). Needs the two Entra groups, a site sharing setting (POLICY-10) and tenant tests |
| `factory` | `factory/` | How agents work with the owner and the repository: HUMANS.md, the harness/loops/graphs ladder, repository checks and CI | Three research documents and a repository checker; HUMANS.md read from its source repositories, the articles from pasted text |
| `prompt` | `prompt/` | Analysis of the "AI team architect" prompt shared on X | Critique done, with a revised prompt kept for later; closed unless reopened |
| `board` | `board/` | A csf version of Vercel's Board, built with the Orchestrator session: channels, threads and tasks agents claim under a lease, keeping Board's data model for drop-in replacement | One research document on the reference model, updated 2026-11-21 with the captured protocol and owner decisions. Server v1 in its own repository, `wove-design/csf-board`: file-backed, passes Vercel's conformance suite (optional groups skipped) |
| `inference` | `inference/` | What the inference-optimisation skill teaches, and what carries over to running many lighter hosted models in parallel across our subscriptions | One research document plus a sweep harness (`inference/sweep/`), 2026-11-22. Adoption decided: adapt the method into a Qara reference. GLM and Codex measured; Claude wave pending JM approval after the 26 Nov quota reset |
| `noodle` | `noodle/` | Noodle (`poteto/noodle`) and brainmaxxing, feature by feature: skills, scheduling and the loop, brain, modes and review, adapters and runtimes, CLI and observability; what to borrow for Qara and csf | Six research documents, 2026-11-23, read from source without running anything. Borrow decisions pending the owner |
| `pstack` | `pstack/` | pstack (`cursor/plugins`), feature by feature: the mode skill and playbooks, principles, parallel and unattended work, verification, learning, writing and code craft, packaging; what to borrow and which Qara or csf code a written workflow could replace | Seven research documents, 2026-11-23, read from source without running anything. Borrow and removal decisions pending the owner |
| `archive` | `archive/` | Frozen earlier work, not a live track | Closed |

## How this repository works

The rules are in `DOCTRINES.md`: one question at a time through the question UI, documents written as numbered doctrines, and each track's `README.md` as its lookup table with code in subdirectories. Doctrine prefixes such as AUTH or MATTER let you cite a single rule, for example "MATTER-3".

## Archive

`archive/tobogan-2020-eleventy-site.zip` holds the previous content of this repo: the TGDS 2020 static site (Eleventy, Nunjucks, Sass, Parcel). It contains source only, with no `node_modules` or build output. The full history is also still in git before the reorganisation commit.
