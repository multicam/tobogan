# matters: roles and matter folders

How the firm's structure maps onto Microsoft 365.

- **Roles:** admin, team leader, associate.
- **Matter:** a folder in a SharePoint document library, visible only to its team.

## Where things are

| What | Where |
| --- | --- |
| Role policy (who may do what in the app) | `m365/spike/lib/m365/roles.ts` |
| Matter folders (create restricted, list, team changes) | `m365/spike/lib/m365/matters.ts` |
| Tests | `m365/spike/test/matters-roles.test.ts` |
| Research note | `research/2026-11-19-roles-and-matter-folders.md` |

The code lives in the `m365` spike because it builds on that track's Graph, drive and sharing modules.

## Draft policy

To be confirmed by the firm. "Lead" means the team leader responsible for that matter.

| Action | Admin | Team leader | Associate |
| --- | --- | --- | --- |
| Create a matter | Yes | Yes | No |
| Open a matter they are on | Yes | Yes | Yes |
| Add or edit documents | Yes | Yes | Yes |
| File an email into a matter | Yes | Yes | Yes |
| Change the matter's team | Yes | Lead only | No |
| Close a matter | Yes | Lead only | No |
| Share outside the firm | Yes | Lead only | No |

A user with no role can do nothing.

This policy controls what the app offers. Access to documents is enforced by the permissions on each matter's SharePoint folder, because users can open SharePoint directly.
