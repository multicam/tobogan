# tobogan

Research workspace for the **cub** project: a Next.js app for a legal firm, integrated with SharePoint and other Microsoft 365 services.

## Tracks

Each track is a top-level directory. Use the short name to refer to it.

| Track | Directory | Scope | Status |
| --- | --- | --- | --- |
| `m365` | `m365/` | Plumbing for Microsoft 365: sign-in and tokens, the Graph client, SharePoint files and sharing, Exchange mail, Next.js specifics | Six research documents and a tested spike; not yet run against a tenant |
| `matters` | `matters/` | The firm's model: admin, team leader and associate roles; a matter as a SharePoint folder limited to its team | Note, draft policy and tested code; firm decisions and tenant tests outstanding |
| `prompt` | `prompt/` | Analysis and discussion of a prompt shared on X | Blocked: source image not readable from here |
| `archive` | `archive/` | Frozen earlier work, not a live track | Closed |

## Layout inside a track

| Path | Purpose |
| --- | --- |
| `README.md` | The lookup table for the track: every planning and research document with its type, the question it answers and its date, followed by the code directories |
| `*.md` | Planning, research and reference documents, flat in the track directory |
| subdirectories | Code only. Each has its own `package.json` and a README saying what it tests and what was found |

## Conventions

- Secrets stay out of git: put them in `.env.local` and commit only an `.env.example` with empty values.
- A new track gets a short lowercase name, a directory of that name, and a row in the table above.
- A new document gets a row in its track's `README.md` in the same commit.
- Code shared between tracks lives in one track's subdirectory; the other track's README points to it.

## Archive

`archive/tobogan-2020-eleventy-site.zip` holds the previous content of this repo: the TGDS 2020 static site (Eleventy, Nunjucks, Sass, Parcel). It contains source only, with no `node_modules` or build output. The full history is also still in git before the reorganisation commit.
