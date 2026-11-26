# Measured results of the live probes

Run on 2026-11-23 against the `cub-staging` registration in the dev tenant, site `cub-staging`. No secret or token value is recorded here.

| Probe | Identity | Result |
|---|---|---|
| `live-readonly.ts` | app (certificate) | 5 of 5 steps passed |
| `live-writes.ts` | app (certificate) | 9 of 10 passed. The passing steps include the small upload, the 9 MiB upload and the preview URL. The tenth failed on a test-pattern bug (the conflict message says "already exists"); the pattern is fixed and the step was not rerun |
| `live-delegated.ts` | Agent.Smith (PKCE, certificate, headless sign-in with TOTP) | 9 of 9 passed: sign-in, `/me`, list drive, scratch folder, inbox read, send one mail with an attachment to self, arrival, save the attachment to the drive, cleanup |
| `live-sharing.ts` | Agent.Smith | Passed: organization view link created, listed with scope organization, revoked. The anonymous link was refused by the tenant ("sharing has been disabled on this site"). Invite by email was not run: it needs a recipient named by the owner |

## Prerequisites found (what the E50 account needed)

- Two delegated mail permissions on the registration (`Mail.ReadWrite`, `Mail.Send`).
- An Exchange license on the test user (it had no mailbox).
- Membership of the SharePoint site for the test user.
- The registration also holds broad delegated SharePoint permissions (`Sites.FullControl.All`, `Sites.ReadWrite.All`, `AllSites.FullControl`), wider than the plan's `Sites.Selected`. Removal is decided after the runs.

## Notes

- The attachment size Graph reports includes encoding overhead.
- Nothing was run for matter restriction, change subscriptions (needs a public HTTPS endpoint), calendar, the Redis token store or the preview iframe.
- Run from `m365/spike`: `bun probe/<name>.ts`. Variable names used: `SP_TENANT_ID`, `SP_APP_CLIENT_ID`, `SP_APP_CERT_THUMBPRINT`, `SP_APP_CERT_KEY`, `SP_SITE_ID`, `SP_DRIVE_ID`, `QA_AGENT_SMITH_UPN`, `QA_AGENT_SMITH_PASSWORD`, `QA_AGENT_SMITH_TOTP_SECRET`, `PROBE_SCRATCH`.

## Alignment with cub

From the research in `m365/` read against csf-research's cub evidence (not from a probe run): cub is aligned with the spike only on SharePoint sync. Graph mail, calendar, per-user tokens, change notifications and sharing are absent in cub; mail exists only as indexing of `.msg` and `.eml` files filed in SharePoint (cub `src/lib/sharepoint/email-indexer.ts`).
