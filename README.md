# tobogan

Research workspace for the **cub** project: integrating a Next.js app with SharePoint and other Microsoft services.

## Layout

| Path | Purpose |
| --- | --- |
| `research/auth-entra-id/` | Sign-in and tokens: Entra ID app registrations, MSAL, delegated vs application permissions |
| `research/microsoft-graph/` | Graph API usage: SDK vs REST, throttling, change notifications |
| `research/sharepoint/` | Sites, lists, document libraries, search, SharePoint REST vs Graph |
| `research/other-microsoft-services/` | Exchange mail, Teams, OneDrive, Power Automate and anything else |
| `research/nextjs/` | Next.js behaviours that shape the integration |
| `spikes/` | Small runnable experiments, one folder per spike, each with its own `package.json` |
| `references/` | Links, vendor docs excerpts, diagrams |
| `archive/` | Frozen snapshots of earlier work |

Start at `research/README.md` for the index of notes, confidence levels and the checklist for fitting this into the existing app.

## Conventions

- One Markdown note per question, named `YYYY-MM-DD-short-title.md`, ending with a conclusion or open questions.
- Each spike folder has a short `README.md` saying what it tests and what was found.
- Secrets stay out of git: put them in `.env.local` and commit only an `.env.example` with empty values.

## Archive

`archive/tobogan-2020-eleventy-site.zip` holds the previous content of this repo: the TGDS 2020 static site (Eleventy, Nunjucks, Sass, Parcel). It contains source only, with no `node_modules` or build output. The full history is also still in git before the reorganisation commit.
