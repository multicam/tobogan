# Role policy (draft)

**Status:** draft, to be confirmed by the firm. Implemented in `m365/spike/lib/m365/roles.ts`.

"Lead" means the team leader responsible for that matter.

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

## To decide

1. Do admins see every matter's documents, or only manage matters without opening them?
2. Can team leaders see matters they do not lead?
3. Can associates share inside the firm? The draft says no: adding someone is a team change, done by the lead.
4. How is the lead of a matter recorded?

Background for each is in `roles-and-matter-folders.md`.
