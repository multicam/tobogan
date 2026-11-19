# matters

How the firm's structure maps onto Microsoft 365: admin, team leader and associate roles, and a matter as a SharePoint folder visible only to its team.

## Documents

| Document | Type | Answers | Date |
| --- | --- | --- | --- |
| `policy.md` | Planning | Draft table of what each role may do, and the four decisions the firm owes | 2026-11-19 |
| `roles-and-matter-folders.md` | Research | How roles map to Entra app roles, how a folder is restricted to a team, SharePoint limits, who performs matter creation, what to test on a tenant first | 2026-11-19 |

## Code

This track has no code directory of its own. Its code builds on the `m365` modules and lives in that track's spike:

| Path | What |
| --- | --- |
| `m365/spike/lib/m365/roles.ts` | Roles from sign-in claims and the policy check |
| `m365/spike/lib/m365/matters.ts` | Create a restricted matter folder, list matters, change the team |
| `m365/spike/test/matters-roles.test.ts` | Tests for both |
