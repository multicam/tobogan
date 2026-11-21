# WALL: Per-matter folder walls and folder adoption in cub v2

**Track:** matters · **Type:** research · **Date:** 2026-11-22

**Question:** what would cub need to enforce per-matter (per-folder) access walls in SharePoint, and adopt existing folders, in v2, and what would cub v1's E45/E46 and trim R7 rulings have to change?

**Scope.** cub v1's rulings govern; this document describes v2 and changes no ruling (the owner changes rulings). It bridges MATTER (`roles-and-matter-folders.md`), POLICY (`policy.md`, the owner ruled it cub's v2 direction) and SHARE (`m365/sharing.md`) to cub, and cites them by ID. cub paths are read at master `9aee5f63` (`/media/ssdev/tg-pro/cub`, read-only). Where a v1 text says "trim R7" about walls, note that R7 rules adoption only; the walls restatement is trim R4 (`decisions/2026-10-20-v1-microsoft-access-and-trim-rulings.md`).

## Doctrines

**WALL-1. Treat E45, E46, R4, R7 and the site-wide decision as one set of rulings to amend together, and amend only their wording, not their reopen triggers.**
What v1 rules today, and the wording v2 would change:
- `E45` (`specs/v1/07_open_questions.md:207`): do walled matters need per-folder permissions in SharePoint? Status open, owner "F" (the firm); working default is "site-wide, Cub-only enforcement"; moved to v2 on 2026-11-11. v2 change: the working default becomes "SharePoint item permissions per walled matter, plus cub-side checks" (WALL-2), and the question becomes a decision rather than a firm ask.
- `E46` (`:258`): library layout and adopting pre-cub matter folders. Open; moved to v2. v2 change: the answer is a bounded, report-only adoption (WALL-8).
- Trim R7 (§4 R7 of the trim record; `specs/v1/09_deferred.md` §26, `#adoption-cut-v2`): adoption cut from v1, "rebuilt when E46 is answered". Code already removed in `d683ff1e` (WO-196); the pre-cut code is at `1632cc97` and `246b5683`. v2 change: the rebuild is no longer gated only on E46 (WALL-8).
- Trim R4 ("walls go to the firm", download gated only by cub's matter-access check): its own reopen trigger is that restricted folders exist. v2 change: download must consult the wall (WALL-3).
- `decisions/2026-09-18-sharepoint-access-is-site-wide-and-walls-go-to-the-firm.md` and its 2026-09-22 G6 amendment ("cub never breaks folder-permission inheritance programmatically"; cub "enforces nothing" from a walled flag) are reversed for walled matters only. `decisions/2026-10-14-information-barriers-off-in-v1.md` point 3 ("No change to the site-wide default") is untouched until WALL-11 applies.
- `09_deferred.md` §24 (production document serving with E45/E46) is where the serving revival trigger lives and must move with them.
- Why: these texts cross-refer; amending one leaves the others stating the opposite. The reopen triggers (the firm answers E45/E46) are the owner's to change; this document does not propose new ones.
- Evidence: the cited cub files above; WO-214 lists the same items as out of scope (`factory/work-orders/WO-214.md:171-173`).
- Basis: Verified against cub source at `9aee5f63` (a repository read, not Microsoft documentation, so no basis level above Unverified applies to the v2 reading); the v2 wording is Decision (owner).
- Code: Gap: none yet; spec and decision edits only.

**WALL-2. Enforce walls in SharePoint and in cub, because neither alone covers every path.**
SharePoint item permissions bind every path that runs as the user. cub's own check must bind every path that runs as the app.
- Why: cub v1 runs open and edit as the user, who is checked by SharePoint itself, but list, download and the documents mirror run app-only (trim R1, R3, R4; `src/lib/sharepoint/document-access.ts`, signed download minted under the app credential). SharePoint cannot refuse a request made with the app's identity, so a wall held only in SharePoint is invisible to those paths. A wall held only in cub is bypassed by anyone with direct SharePoint access (MATTER-1).
- Evidence: MATTER-1 (SharePoint is the boundary; the app can only narrow); POLICY-5; the v1 site-wide decision's "Accepted risk" section, which already names both gaps (a listing that shows a walled document exists, and a download SharePoint would refuse).
- Basis: Decision (MATTER-1, POLICY-5 are owner decisions); cub behaviour Verified against source only.
- Code: Gap: cub has no per-matter permission step on list or download. `authorizeItemAction` in `m365/spike/lib/m365/authorize.ts` is the tobogan model (policy check as the user before the app acts).

**WALL-3. Give cub its own per-matter access record before it gates anything.**
cub needs a stored list of who may open each walled matter, written in the same step as the SharePoint grant, and every app-only route (list, search, download, mirror reads) must filter on it.
- Why: MATTER-4 ("My matters is exactly what SharePoint returns to the user") assumes calls with the user's own token. cub ruled out a delegated Graph token in v1 (trim R1, R2), so it cannot use that rule today; it needs a record of its own. A search of `src/lib` and `src/app/v1` at `9aee5f63` for a matter-membership model found none; `src/lib/auth/roles.ts` states that data scope (own, team, firm) is "Phase 2's axis" and is not enforced. R4 refers to a "matter-access check" that this search did not locate as code.
- Evidence: `src/lib/auth/roles.ts` header comment; `specs/v1/03_api_auth_and_tenancy.md:265` (acting user header); trim R1/R3/R4.
- Basis: Unverified (absence of a symbol in a text search is not proof; confirm in the v2 design pass).
- Code: Gap: a membership table and a check in `with-auth` or the document routes. Role names differ (cub: associate, manager, admin; tobogan: Associate, TeamLeader, Admin), so POLICY-7 and POLICY-8 map to cub's tiers only by an owner decision.

**WALL-4. Cut inheritance on a matter folder once, at creation, while the folder is empty, and under the app's identity.**
Reuse the MATTER-3 order: create the folder, make the first grant with `retainInheritedPermissions: false`, record the team, roll back on any failure.
- Why: a folder created in cub inherits the library's permissions until the first grant. Microsoft's limits page says a list, library or folder with more than 100,000 items cannot have its inheritance broken or re-inherited, so a late wall on a large adopted folder may be impossible.
- Evidence: invite reference: `retainInheritedPermissions`: "If `false`, all existing permissions are removed when sharing for the first time" (page fetched). Limits page: "When a list, library, or folder contains more than 100,000 items, you can't break permissions inheritance... However, you can still break inheritance on the individual items within that list, library, or folder" (page fetched). Whether the first-grant flag works on an already-shared folder, or at all on SharePoint folders, is untested (MATTER Open 1 and 2).
- Basis: Verified (both quotes); Tested for the create-and-rollback sequence in the spike's fake Graph (`m365/spike/test/matters-roles.test.ts`, "creates the folder, cuts inheritance on the first grant and never emails", "deletes the folder if it cannot be restricted"); real SharePoint behaviour Unverified.
- Code: `createMatter` in `m365/spike/lib/m365/matters.ts`. cub: `provisionMatter` in `src/lib/sharepoint/provisioning.ts` creates the folder and never writes permissions today.

**WALL-5. Budget unique permission scopes per library, and note the year-folder layout does not split that budget.**
Count every walled matter folder against its library; alarm well before 5,000.
- Why: Microsoft states "The supported limit of unique permissions for items in a list or library is 50,000. However, the recommended general limit is 5,000." MATTER-5 and MATTER-10 avoid the problem with one library per year. cub's layout does the opposite: WO-215 provisions `<YYYY>/<matter_number> <title>` as year folders inside one library, with old roots still at the library root (`factory/work-orders/WO-215.md`). The year folder is a convenience for browsing; it is not a permission or limit boundary, so every walled matter in every year counts against one library.
- Interaction with the layout, beyond the count: a year folder is never itself restricted (only matter folders are), so it keeps the library's permissions and everyone with library access can see that matter folder names exist unless cub hides them in its own views. The tobogan spike also assumes matters sit directly under the drive root: `listMatters` lists root folders and `matterOfItem` walks up to the folder directly under the root (`m365/spike/lib/m365/matters.ts`). Under year folders, both would need a depth rule.
- Evidence: SharePoint limits page (fetched); WO-215; MATTER-5, MATTER-10.
- Basis: Verified (limits); Decision owed on layout (library per year versus year folder).
- Code: Gap: no scope counter or alarm in cub or the spike. `matterOfItem` and `listMatters` assume depth one.

**WALL-6. Give the app `fullcontrol` or `owner` on the matters site if it is to manage item permissions; `write` is not enough.**
cub's v1 grant is `write` on one site. That grant cannot change who may open a folder.
- Why: Microsoft's table of what is needed to manage permissions lists, for a list item or file, only `Sites.FullControl.All`, `Sites.Selected` with `FullControl` or `Owner`, or `Lists.SelectedOperations.Selected` with `FullControl` or `Owner`. `write` appears nowhere in that table. A `fullcontrol` grant is also broader than any other v1 credential, which raises the stakes of the certificate cub holds per firm.
- Evidence: Graph "Overview of Selected Permissions", section "What permissions do I need to manage permissions?" (page fetched). cub: the app-only decision grants `write` (`decisions/2026-09-18-sharepoint-access-is-app-only-with-sites-selected.md`, "granted `write`").
- What the page does not settle: that table is stated for the `/permissions` endpoints (granting access to apps). The driveItem invite reference lists only `Files.ReadWrite.All` and `Sites.ReadWrite.All` for application access and does not mention `Sites.Selected`. Whether app-only `invite` with `retainInheritedPermissions: false` works under `Sites.Selected` plus `fullcontrol` is therefore not documented (MATTER Open 3); do not assume it.
- Separately verified: assigning an application permission to a list, list item, folder or file "breaks inheritance on the assigned resource", so the granular `*.SelectedOperations.Selected` route would itself consume unique scopes. That is the risk the G6 amendment cites.
- Basis: Verified (the table, the invite permissions and the inheritance note); app-only invite under `Sites.Selected` Unverified.
- Code: Gap: the grant level in cub's onboarding runbook. `createAppTokenProvider` in `m365/spike/lib/m365/tokens.ts` is the spike's app-only client.

**WALL-7. Decide matter teams as direct grants or per-matter Entra groups before building; default to direct grants.**
POLICY-7 and POLICY-8 already use two firm-wide Entra groups. Whether each matter also gets its own group is a separate decision.
- Why: direct grants (what the spike's `createMatter` does) need no group-creation rights and add no tenant objects, but every team change is a SharePoint write per person. Per-matter groups make team changes one membership edit and survive staff turnover, but need cub to hold Entra group-write rights, create thousands of groups and keep them in step with cub's own record (WALL-3). The scope limit is per unique scope, not per recipient, so groups do not reduce WALL-5.
- Evidence: MATTER Reference (`invite` recipients can be groups by `email`, `alias` or `objectId`); POLICY-7 and POLICY-8; MATTER-2 (nested groups are not supported for app-role assignment, a different mechanism). Entra group-creation permissions and tenant group limits were not fetched.
- Basis: Decision (owner), recommended default only; Entra rights and limits Unverified.
- Code: `createMatter` and `addMatterMembers` in `m365/spike/lib/m365/matters.ts` do direct grants; Gap: no group provisioning.

**WALL-8. Adopt existing folders by inventory and report, and never move, rename or re-permission one without a per-folder owner approval.**
The adoption pass reads the library, proposes a binding of each root to a matter number, and writes a report for a human. Walls on an adopted folder are a separate, explicit step.
- Why: cub's disposability invariant (2026-09-21, not R7) makes every row derivable from SharePoint rebuildable, which only holds if cub never changes the folders it reads. Adoption pass v1 was already built that way: "Explicit operator invocation only", matching on a leading `matter_number`, unmatched or ambiguous roots go to a report (E46 context; trim R7 evidence). An adopted folder inherits the library's permissions, so adopting it tightens nothing; and cutting its inheritance later fails above 100,000 items (WALL-4).
- Layout interaction: after WO-215, a lookup for a root under `<YYYY>/` falls back to the library root so old roots are not duplicated (`factory/work-orders/WO-215.md`). Adoption must reuse that fallback and never move an old root into a year folder.
- Binding record: the invariant's explicit non-goal is cross-tenant or site migration, which reissues item IDs and orphans `sp_item_id`-keyed rows (`decisions/2026-09-21-sharepoint-disposability-invariant.md`, point 4). The bound root is the one cub-native fact adoption adds; whether a rebuild can recreate it from the folder name alone is an inference, not a documented fact.
- Evidence: cub files above; WO-196 removed the code (`d683ff1e`), restorable from `246b5683` and `1632cc97`; WO-215.
- Basis: Decision (owner) for the no-destructive-change rule; Verified against cub source for what v1 did; the rebuild inference Unverified.
- Code: Gap: restore from `246b5683` under v2 review. The tobogan spike has no adoption code.

**WALL-9. Report access drift between cub's record and SharePoint on a schedule, and never auto-repair it.**
Read each walled matter's permissions, compare to cub's per-matter record (WALL-3), and show differences to the matter's lead and admins.
- Why: access in SharePoint can be changed outside cub (a site owner, a link, a direct share), and the wall silently fails. POLICY-10 turns off member sharing but cannot cover owners. Auto-repair would let a cub bug rewrite who can see client files.
- Evidence: SHARE-4 (inherited permissions are removed where granted, and `inheritedFrom` identifies the source), SHARE-6 (permission reads cost 5 SharePoint resource units against 1 for a read, so read per matter on a schedule, not per page view); POLICY-10.
- Basis: Verified (SHARE-4, SHARE-6 as recorded there); using a permission read for drift detection is Unverified.
- Code: Gap: nothing compares the two. `listMatterTeam` in `m365/spike/lib/m365/matters.ts` reads one matter's grants and is the starting point.

**WALL-10. Make every search and index path respect the wall by filtering on cub's record, not on SharePoint results.**
cub's list, search and mirror reads must exclude a walled matter's documents, names and counts for users not on it.
- Why: cub's mirror is filled by an app-only poller (trim R3) and holds rows for every document, so any query over it returns walled documents unless filtered. v1 states this risk and accepts it ("a listing that... shows a walled document exists").
- Evidence: the v1 site-wide decision, "Accepted risk" section. For Microsoft's own search, the Information Barriers page says search results come from sites "when the user has existing access to the content or site" (page fetched), which supports that Microsoft search trims by the user's access; nothing fetched says what an app-only Graph search returns. The documentation for Graph search itself was not fetched.
- Basis: Unverified for cub's mirror queries (a design requirement, not a fact); Verified only for the Information Barriers search sentence quoted.
- Code: Gap: `src/lib/sharepoint/documents-read.ts` and the document list routes have no wall filter.

**WALL-11. Do not use Information Barriers to wall single matters; keep them a site-level control and revisit only on the owner's trigger.**
Microsoft Purview Information Barriers (IB) associate segments with a site, not a folder.
- Why: IB cannot wall one folder inside the matters site, so it is not the mechanism for WALL-2. If the firm turns IB on for the matters site, every app-only call fails unless the tenant sets `Set-SPOTenant -AppBypassInformationBarriers $true`, and that failure looks like a missing `Sites.Selected` grant (G21 amendment). v1 rules IB off and defers it to v2 (`decisions/2026-10-14-information-barriers-off-in-v1.md`, revival trigger: v2 scoping begins or the firm reports IB enabled).
- Evidence: "You associate the segments at the site level (previously called site collection level)"; "Users can share the site and its content only with users whose segment matches"; the app-only opt-in command (all from the IB-for-SharePoint page, fetched). MATTER-5 notes one site per matter as the only layout that could pair with IB, at the cost of heavier provisioning.
- Basis: Verified.
- Code: Gap: none; no IB handling exists in cub or the spike.

## Open

For the owner:
1. Does the firm in fact wall any matter folders today? E45 and E46 are still firm questions and this document does not answer them.
2. Walls between team leaders (conflicts) are not covered by POLICY-8, which gives every leader edit on every matter; POLICY-8 itself says it would have to change. Is a wall against leaders in scope for v2?
3. One library with year folders (WO-215) or one library per year (MATTER-10)? It decides the WALL-5 budget.
4. Direct grants or per-matter groups (WALL-7)?
5. Map POLICY roles to cub tiers (associate, manager, admin) and decide where a per-matter record lives (WALL-3).
6. Raise cub's `Sites.Selected` grant from `write` to `fullcontrol` (WALL-6)?

To test on a tenant before relying on this: app-only `invite` under `Sites.Selected` plus `fullcontrol` (MATTER Open 3); `retainInheritedPermissions: false` on an already-shared folder; what an app-only search returns; Entra rights to create and manage groups.

Not run: the Diderot and recall steps of the research skill (no vault search was run for this document); no live tenant calls were made.

## Reference

- At most 5,000 role assignments per uniquely permissioned item (MATTER Reference).
- Microsoft Teams-connected sites use IB "Implicit" mode; irrelevant to a dedicated matters site.

## Sources

- Graph: Overview of Selected Permissions in OneDrive and SharePoint: https://learn.microsoft.com/en-us/graph/permissions-selected-overview
- Graph: driveItem invite (v1.0): https://learn.microsoft.com/en-us/graph/api/driveitem-invite?view=graph-rest-1.0
- SharePoint limits (service description): https://learn.microsoft.com/en-us/office365/servicedescriptions/sharepoint-online-service-description/sharepoint-online-limits
- Purview: Use Information Barriers with SharePoint: https://learn.microsoft.com/en-us/purview/information-barriers-sharepoint
- cub at `9aee5f63`: `specs/v1/07_open_questions.md` (E45, E46); `specs/v1/09_deferred.md` §24, §26; `decisions/2026-10-20-v1-microsoft-access-and-trim-rulings.md` (R1 to R4, R7); `decisions/2026-09-18-sharepoint-access-is-site-wide-and-walls-go-to-the-firm.md` (with G6 and G21 amendments); `decisions/2026-09-18-sharepoint-access-is-app-only-with-sites-selected.md`; `decisions/2026-10-14-information-barriers-off-in-v1.md`; `decisions/2026-09-21-sharepoint-disposability-invariant.md`; `factory/work-orders/WO-196.md`, `WO-214.md`, `WO-215.md`; `src/lib/auth/roles.ts`; `src/lib/sharepoint/document-access.ts`, `provisioning.ts`
- tobogan: `matters/roles-and-matter-folders.md` (MATTER), `matters/policy.md` (POLICY), `m365/sharing.md` (SHARE); spike `m365/spike/lib/m365/matters.ts`, `authorize.ts`, `tokens.ts`, `roles.ts`; test `m365/spike/test/matters-roles.test.ts`
