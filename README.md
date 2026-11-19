# tobogan

Research workspace for the **cub** project: a Next.js app for a legal firm, integrated with SharePoint and other Microsoft 365 services.

## Tracks

Each track is a top-level directory. Use the short name to refer to it.

| Track | Directory | Scope | Status |
| --- | --- | --- | --- |
| `m365` | `m365/` | Plumbing for Microsoft 365: sign-in and tokens, the Graph client, SharePoint files and sharing, Exchange mail, Next.js specifics | Seven documents; spike closes every recorded gap (112 tests). Not yet run against a tenant |
| `matters` | `matters/` | The firm's model: admin, team leader and associate roles; a matter as a SharePoint folder limited to its team | Two documents; policy decided 2026-11-19 and built (112 tests). Needs the two Entra groups, a site sharing setting (POLICY-10) and tenant tests |
| `factory` | `factory/` | How agents work with the owner and the repository: HUMANS.md, the harness/loops/graphs ladder, repository checks and CI | Three research documents and a repository checker; HUMANS.md read from its source repositories, the articles from pasted text |
| `prompt` | `prompt/` | Analysis of the "AI team architect" prompt shared on X | One research document with a revised prompt; owner's purpose for it being asked |
| `archive` | `archive/` | Frozen earlier work, not a live track | Closed |

## How this repository works

The rules are in `DOCTRINES.md`: one question at a time through the question UI, documents written as numbered doctrines, and each track's `README.md` as its lookup table with code in subdirectories. Doctrine prefixes such as AUTH or MATTER let you cite a single rule, for example "MATTER-3".

## Archive

`archive/tobogan-2020-eleventy-site.zip` holds the previous content of this repo: the TGDS 2020 static site (Eleventy, Nunjucks, Sass, Parcel). It contains source only, with no `node_modules` or build output. The full history is also still in git before the reorganisation commit.
