# POLICY: Role policy

**Track:** matters · **Type:** planning · **Date:** 2026-11-19

**Question:** what may admins, team leaders and associates do in the app?

**Status:** draft. Every doctrine here is a decision owned by the firm and awaiting its confirmation. "Lead" means the team leader responsible for that matter.

## Doctrines

**POLICY-1. A user with no role can do nothing.**
- Basis: Decision
- Code: `can(undefined, ...)` is always false (`m365/spike/lib/m365/roles.ts`).

**POLICY-2. Everyone on a matter's team may open it, add and edit its documents, and file email into it.**
- Basis: Decision

**POLICY-3. Only admins and team leaders create matters.**
- Basis: Decision
- Code: `createMatterAction` checks `matter.create`.

**POLICY-4. Only admins and the matter's lead change its team, close it, or share it outside the firm.**
- Basis: Decision
- Code: `can()` takes `isMatterLead`, which `authorizeItemAction` reads from the matter's `MatterLead` column (MATTER-8). Only an admin may name someone else as lead; a team leader leads the matters they create.

**POLICY-5. The policy is checked on the server for every action, and never replaces folder permissions.**
- Why: see MATTER-1.
- Basis: Decision, Tested
- Code: `assertCan` and `authorizeItemAction` in every Server Action.

**POLICY-6. Until the firm answers question 3, any sharing beyond a matter's team follows the "share outside the firm" rule.**
Inviting someone or creating a link on a matter or anything in it is for admins and the matter's lead. Items outside any matter can be shared by admins only.
- Why: sharing a single document with someone outside the team breaches the matter's wall as much as adding them to the team. This is the conservative reading of the draft.
- Basis: Decision
- Code: the sharing actions check `share.external`; removing access checks `matter.manageTeam`.

| Action | Admin | Team leader | Associate |
| --- | --- | --- | --- |
| Create a matter | Yes | Yes | No |
| Open a matter they are on | Yes | Yes | Yes |
| Add or edit documents | Yes | Yes | Yes |
| File an email into a matter | Yes | Yes | Yes |
| Change the matter's team | Yes | Lead only | No |
| Close a matter | Yes | Lead only | No |
| Share outside the firm | Yes | Lead only | No |

## Open

Decisions owed by the firm:
1. Do admins see every matter's documents, or only manage matters without opening them? If they see them, a firm-admins group is granted on every matter at creation. MATTER-7 allows the other choice.
2. Can team leaders see matters they do not lead?
3. Can associates share inside the firm? The draft says no: adding someone is a team change, made by the lead.
4. ~~How is a matter's lead recorded?~~ Settled as a column on the matter folder (MATTER-8), unless the firm prefers otherwise.
