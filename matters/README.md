# matters

How the firm's structure maps onto Microsoft 365: admin, team leader and associate roles, and a matter as a SharePoint folder visible only to its team.

## Documents

| Document | Type | Prefix | Answers | Date |
| --- | --- | --- | --- | --- |
| `policy.md` | Planning | POLICY | What each role may do, as decided by the owner: admins and team leaders see every matter, everyone shares inside the firm, only admins and leads share outside | 2026-11-19 |
| `roles-and-matter-folders.md` | Research | MATTER | How roles map to Entra app roles, how a folder is restricted to a team, SharePoint limits, who performs matter creation, what to test first | 2026-11-19 |
| `v2-folder-walls.md` | Research | WALL | What cub would need for per-matter folder walls and folder adoption in v2, and what its v1 E45/E46, R4 and R7 rulings would have to change | 2026-11-22 |

## Code

This track has no code directory of its own. Its code builds on the `m365` modules and lives in that track's spike (R-4):

| Path | What |
| --- | --- |
| `m365/spike/lib/m365/roles.ts` | Roles from sign-in claims and the policy check |
| `m365/spike/lib/m365/matters.ts` | Create a restricted matter folder, list matters, change the team, close it |
| `m365/spike/lib/m365/libraries.ts` | One library per year (MATTER-10) |
| `m365/spike/lib/m365/authorize.ts` | Policy check per item before the app acts |
| `m365/spike/test/matters-roles.test.ts` | Tests for both |
