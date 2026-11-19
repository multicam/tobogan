# POLICY: Role policy

**Track:** matters · **Type:** planning · **Date:** 2026-11-19

**Question:** what may admins, team leaders and associates do in the app?

**Status:** decided by the owner on 2026-11-19 (questions 1 to 3 of the first draft). "Lead" means the team leader responsible for that matter, recorded in its `MatterLead` column (MATTER-8).

## Doctrines

**POLICY-1. A user with no role can do nothing.**
- Basis: Decision, Tested
- Code: `can(undefined, ...)` is always false (`m365/spike/lib/m365/roles.ts`).

**POLICY-2. Everyone who can open a matter may add and edit its documents and file email into it.**
- Basis: Decision

**POLICY-3. Only admins and team leaders create matters.**
- Basis: Decision, Tested
- Code: `createMatterFormAction` checks `matter.create`.

**POLICY-4. Only admins and the matter's lead change its team, close it, or share it outside the firm.**
- Basis: Decision, Tested
- Code: `authorizeItemAction` reads the lead from the matter's column; only an admin may name someone else as lead.

**POLICY-5. The policy is checked on the server for every action, and never replaces folder permissions.**
- Why: see MATTER-1.
- Basis: Decision, Tested
- Code: `assertCan` and `authorizeItemAction` in every Server Action.

**POLICY-6. Withdrawn.**
Interim rule ("any sharing beyond the team follows the outside-the-firm rule") replaced on 2026-11-19 by POLICY-9 once the owner decided internal sharing.

**POLICY-7. Admins can open and edit every matter.**
A firm-admins group (`MATTER_ADMIN_GROUP_ID`) is granted edit access on every matter in its first, inheritance-cutting grant.
- Why: owner decision (question 1): admins need to support and oversee every matter.
- Consequence: every admin sees every client's documents. Membership of that group is now as sensitive as the matters themselves.
- Basis: Decision, Tested
- Code: `firmWideGroupIds()` in `config.ts` refuses to create matters when the group is not configured; `createMatter` grants it.

**POLICY-8. Team leaders can open and edit every matter, but manage only the matters they lead.**
A team-leaders group (`MATTER_LEADERS_GROUP_ID`) is granted edit access on every matter. Team changes, closing and external sharing still need the lead (POLICY-4).
- Why: owner decision (question 2).
- Consequence: matter walls hold only between associates. If the firm later needs ethical walls between leaders (conflicts), this doctrine must change and existing matters must be re-permissioned.
- Basis: Decision, Tested
- Code: as POLICY-7.

**POLICY-9. Anyone who can open a matter may share its documents inside the firm, with view or edit access.**
Inside the firm means an address in `FIRM_EMAIL_DOMAINS`, or a link scoped to the organization or to specific people. Anonymous links are never offered (SHARE-2).
- Why: owner decision (question 3).
- Basis: Decision, Tested
- Code: the invite action uses `share.internal` when `isFirmEmail` matches and `share.external` otherwise; with no domains configured, every invite counts as external.

**POLICY-10. All sharing goes through the app; SharePoint's own share button is turned off for members.**
On the matters site, turn off "Allow members to share the site and individual files and folders", so only owners (the app's credential and site owners) can share.
- Why: the policy (POLICY-4, POLICY-9) binds only paths through the app. With members allowed to share in SharePoint, anyone with edit access could share a matter outside the firm directly. This turns a wish into a wall (LADDER-2).
- Basis: Decision (recommended), needs a site setting by a SharePoint admin
- Code: none; a site setting.

| Action | Admin | Team leader | Associate |
| --- | --- | --- | --- |
| Open and edit any matter | Yes (POLICY-7) | Yes (POLICY-8) | Only matters they are on |
| Create a matter | Yes | Yes | No |
| File an email into a matter | Yes | Yes | On their matters |
| Share inside the firm | Yes | Yes | On their matters (POLICY-9) |
| Change the matter's team | Yes | Lead only | No |
| Close a matter | Yes | Lead only | No |
| Share outside the firm | Yes | Lead only | No |

## Open

- POLICY-10 needs the site setting changed by a SharePoint admin.
- The two Entra groups (admins, team leaders) must exist and be maintained; group membership is now the main access control for senior staff.
