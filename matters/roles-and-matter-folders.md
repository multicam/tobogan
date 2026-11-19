# MATTER: Roles and matter folders

**Track:** matters · **Type:** research · **Date:** 2026-11-19

**Question:** how do admin, team leader and associate roles, and "a matter is a folder", map onto Entra ID and SharePoint so that a matter is visible only to its team?

## Doctrines

**MATTER-1. SharePoint permissions are the security boundary; the app's role policy can only narrow them.**
Folder permissions decide who can open a matter. The role policy (`policy.md`) decides which actions the app offers and accepts.
- Why: anyone with access can open SharePoint directly, bypassing the app.
- Basis: Decision

**MATTER-2. Roles come from Entra app roles, and no role means no access.**
App roles `Admin`, `TeamLeader` and `Associate` are read from the `roles` claim at sign-in; the highest one present applies.
- Why: roles are managed where the firm already manages identities, and arrive signed in the ID token.
- Evidence: app roles are defined on the app registration, assigned under Enterprise applications and emitted in the ID token's `roles` claim (`howto-add-app-roles-in-apps.md`). In Auth.js v5 the `jwt` callback's `profile` is the decoded ID token at sign-in, and `MicrosoftEntraIDProfile` declares `roles: string[]`.
- Consequences: assigning roles to groups needs Entra ID P1 or P2, and nested groups are not supported (`assign-user-or-group-access-portal.md`). A role change takes effect at the user's next sign-in.
- Basis: Verified, Tested
- Code: `roleFromClaims` in `m365/spike/lib/m365/roles.ts`; `m365/spike/auth.ts`

**MATTER-3. A matter is restricted when it is created, while it is empty, or it is not created at all.**
`createMatter` creates the folder, then makes the first team grant with `retainInheritedPermissions: false`. If any member's grant fails, the folder is deleted; if the delete also fails, the error says so loudly.
- Why: a new folder inherits the library's permissions, so until the grant succeeds it is visible to everyone who can see the library. Inheritance cannot be broken later on a folder holding more than 100,000 items.
- Evidence: `false` means "all existing permissions are removed when sharing for the first time" (`driveitem-invite.md`); the 100,000-item rule (`migration-perm-guidance.md`). There is no dedicated Graph call to break inheritance.
- Basis: Verified, Tested (behaviour on SharePoint folders Unverified, see Open)
- Code: `createMatter` in `m365/spike/lib/m365/matters.ts`

**MATTER-4. "My matters" is exactly what SharePoint returns to the user.**
List matters with the user's own token; SharePoint trims the result to folders they can open. The app adds no filter that could widen it.
- Basis: Decision
- Code: `listMatters`

**MATTER-5. No library holds more than about 5,000 matters.**
Use one library per year (recommended) or per practice area. Use one site per matter only if the firm needs formal ethical walls.
- Why: a library can hold at most 50,000 uniquely permissioned items, and Microsoft recommends fewer than 5,000. Each restricted matter folder counts as one.
- Evidence: `migration-perm-guidance.md`. Microsoft Purview Information Barriers apply at site level only (search summary).

| Layout | Fits | Trade-off |
| --- | --- | --- |
| One library per year or practice area | Most firms | A rule decides which library a matter goes to; "all my matters" spans libraries |
| One site per matter | Firms needing formal ethical walls | Heavier provisioning |
| One library for everything | Under about 5,000 matters including closed ones | Hits the limit with no clean way out |

- Basis: Verified (limits), Decision (layout)
- Code: the spike takes the library and `mattersFolderId` as configuration.

**MATTER-6. The creator is always in the first grant, with write access.**
- Why: the documentation does not say whether the caller keeps access after `retainInheritedPermissions: false`. If the creator lost access, the rollback delete in MATTER-3 would fail.
- Basis: Decision, Tested
- Code: `createMatter` requires `creatorEmail` and adds the creator to the write group, which is granted first, upgrading them if listed as read. `createMatterAction` takes it from the signed-in session. Unverified: that the session email always matches what `invite` accepts (it may be a UPN rather than the mail address).

**MATTER-7. Matter creation and team changes run as the app; everything else runs as the user.**
The app holds `Sites.Selected` with a `fullcontrol` role on the matters site and performs these actions after checking the role policy. Users then need no permission-management rights in SharePoint.
- Why: restricting a folder requires the right to manage its permissions. The alternative is giving team leaders that right on the whole library.
- Evidence: `Sites.Selected` with `fullcontrol` or `owner` can manage list item and file permissions (`permissions-selected-overview.md`). Graph app-only accepts a client secret; the certificate requirement applies to SharePoint REST and CSOM, not Graph (`auth-v2-service.md`, `security-apponly-azuread.md`).
- Consequence: the app credential becomes high-value, and the role policy becomes a real security control for these two actions.
- Basis: Decision (recommended), Tested; behaviour on a tenant Unverified (see Open)
- Code: `createAppTokenProvider` in `m365/spike/lib/m365/tokens.ts` (client credentials, cached, one request at a time); `getAppGraph` in `server.ts`; `provisioningGraph` and `authorizeItemAction` in `authorize.ts`. `MATTER_PROVISIONING=app` is the default, `delegated` keeps the old behaviour. The policy check always runs with the user's identity before the app's client is used, and the item's matter is found with the user's own token, so a user cannot act on an item they cannot see.

**MATTER-8. Each matter records its number, lead and status in indexed library columns.**
Columns `MatterNumber`, `MatterLead` and `MatterStatus` (Open or Closed) are created once per library and written when the matter is created; if writing them fails, the matter is deleted. The lead is always read from the column, never from the request.
- Why: POLICY-4 needs to know who leads a matter, and the record must survive outside the app. Indexed columns allow filtering in libraries beyond the 5,000-item view threshold.
- Evidence: list item fields are updated with `PATCH /sites/{site}/lists/{list}/items/{item}/fields`; filtering works on one indexed column at a time (`listitem-update.md`, `listitem-list.md`).
- Basis: Verified, Tested
- Code: `ensureMatterColumns`, `setMatterFields`, `getMatterFields`, `isMatterLead` in `m365/spike/lib/m365/matters.ts`. Unverified: reaching the list item through `GET /drives/{id}/items/{id}/listItem` (common, not on the pages read).

**MATTER-9. Closing a matter leaves its team with read access only.**
Write grants become read, sharing links are removed, inherited and owner entries are left alone, the status becomes Closed and, if configured, a retention label is applied to the folder and everything in it.
- Why: a closed file must stay readable for the firm's records but must not change.
- Evidence: `PATCH .../permissions/{id}` changes roles but not for sharing links, which are therefore removed (`permission-update.md`); folder retention labels apply to all contents (`driveitem-setretentionlabel.md`).
- Basis: Decision, Tested
- Code: `closeMatter`; the close button in the sharing panel for admins and the lead. Label name from `MATTER_CLOSED_RETENTION_LABEL`.

## Open

Test on a tenant first (PLAN-1 items 2 and 3):
1. What `retainInheritedPermissions: false` leaves behind: do the caller and site owners keep access?
2. Whether it works at all on SharePoint folders. One community report mentions `invalidRequest`. Fallback: SharePoint REST `breakroleinheritance`, which for app-only access needs a certificate.
3. App-only `invite` with `Sites.Selected`: the overview page supports it, the `invite` reference table does not list it.
4. App-only invite of internal users: the docs only say new guests cannot be invited.
5. The SharePoint permission level a delegated user needs to restrict a folder.

Decisions owed by the firm: see `policy.md`.

Not built: listing and filtering matters by column, a client column, choosing the library by year (MATTER-5), filing email into a matter from the UI. Built since the first draft: app-only provisioning, the lead and status columns, the optional admins group (`MATTER_ADMIN_GROUP_ID`), closing a matter.

## Reference

- At most 5,000 role assignments per uniquely permissioned item.
- Recipients of `invite` can be groups: `email`, `alias` (security groups without mail) or `objectId` (`driverecipient.md`).
- App roles: up to 700 permission definitions per app. The `groups` claim is dropped above 200 groups in a JWT.
- Retention labels can be set on a folder (`.../retentionLabel`) and apply to everything in it.
- Folder columns: `PATCH /sites/{site}/lists/{list}/items/{item}/fields`; filtering works on one indexed column at a time.
- Unverified: 30 million items per library; the 5,000-item list view threshold (search summaries).

## Sources

- `SharePoint/sp-dev-docs`: `docs/apis/migration-perm-guidance.md`, `docs/solution-guidance/security-apponly-azuread.md`
- `microsoftgraph/microsoft-graph-docs-contrib`: `api-reference/v1.0/api/driveitem-invite.md`, `driveitem-createlink.md`, `permission-delete.md`, `listitem-update.md`, `listitem-list.md`, `driveitem-setretentionlabel.md`; `resources/driverecipient.md`; `concepts/permissions-selected-overview.md`, `auth-v2-service.md`
- `MicrosoftDocs/entra-docs`: `docs/identity-platform/howto-add-app-roles-in-apps.md`, `id-token-claims-reference.md`; `docs/identity/enterprise-apps/assign-user-or-group-access-portal.md`
- `nextauthjs/next-auth`: `packages/core/src/providers/microsoft-entra-id.ts`, `docs/pages/guides/role-based-access-control.mdx`
