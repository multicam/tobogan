# tobogan

Research workspace for the **cub** project: a Next.js app for a legal firm, integrated with SharePoint and other Microsoft 365 services.

## Tracks

Each track is a top-level directory. Use the short name to refer to it.

| Track | Directory | Scope | Status |
| --- | --- | --- | --- |
| `m365` | `m365/` | Plumbing for Microsoft 365: sign-in and tokens, the Graph client, SharePoint files and sharing, Exchange mail, Next.js specifics | Six notes and a tested spike; not yet run against a tenant |
| `matters` | `matters/` | The firm's model: admin, team leader and associate roles; a matter as a SharePoint folder limited to its team | Note, draft policy and tested code; firm decisions and tenant tests outstanding |
| `prompt` | `prompt/` | Analysis and discussion of a prompt shared on X | Blocked: source image not readable from here |
| `archive` | `archive/` | Frozen earlier work, not a live track | Closed |

## Layout inside a track

| Path | Purpose |
| --- | --- |
| `README.md` | Index for the track: notes, confidence, open decisions |
| `research/` | One Markdown note per question, named `YYYY-MM-DD-short-title.md`, ending with a conclusion or open questions |
| `spike/` | Runnable experiment with its own `package.json` and a README saying what it tests and what was found |
| `references/` | Source material, links, vendor documentation excerpts |

A track only has the folders it needs. Code shared between tracks lives in one spike; other tracks point to it.

## Conventions

- Secrets stay out of git: put them in `.env.local` and commit only an `.env.example` with empty values.
- A new track gets a short lowercase name, a directory of that name, and a row in the table above.

## Archive

`archive/tobogan-2020-eleventy-site.zip` holds the previous content of this repo: the TGDS 2020 static site (Eleventy, Nunjucks, Sass, Parcel). It contains source only, with no `node_modules` or build output. The full history is also still in git before the reorganisation commit.
