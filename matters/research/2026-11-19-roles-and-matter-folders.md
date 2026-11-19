# Roles and matter folders

**Question:** how do admin, team leader and associate roles, and "a matter is a folder", map onto Entra ID and SharePoint so that a matter is visible only to its team?

Code: `m365/spike/lib/m365/roles.ts`, `matters.ts`, tested in `test/matters-roles.test.ts`. Nothing here has run against a tenant.

## Decisions

1. **Two layers, with different jobs.**
   - *SharePoint folder permissions* decide who can open a matter. This is the security boundary, because anyone can go to SharePoint directly.
   - *The app's role policy* decides which actions the app offers and accepts (create a matter, change a team, share externally). It can only narrow what SharePoint allows.
2. **Roles come from Entra app roles** (`Admin`, `TeamLeader`, `Associate`), read from the `roles` claim at sign-in. A user with no role is denied everything.
3. **A matter folder gets its own permissions at creation, while empty.** `createMatter` creates the folder, then makes the first team grant with `retainInheritedPermissions: false`. If that fails for any member, the folder is deleted.
4. **"My matters" is whatever SharePoint returns.** Listing with the user's own token is trimmed to folders they can open, so the app adds no filter of its own.
5. **Split matters across libraries** to stay inside SharePoint's limits (see below).

## Verified facts

**Roles**

- App roles are defined on the app registration, assigned under Enterprise applications, and emitted in the `roles` claim of the ID token.
- Assigning roles to individual users needs no premium licence. Assigning to **groups needs Entra ID P1 or P2**, and nested groups are not supported.
- In Auth.js v5 the `jwt` callback's `profile` argument is the decoded ID token at sign-in, and `MicrosoftEntraIDProfile` declares `roles: string[]`. The spike reads it there.
- Consequence: a role change takes effect at the user's next sign-in.

**SharePoint limits**

- A library can hold at most **50,000** uniquely permissioned items; Microsoft recommends **fewer than 5,000**. Each matter folder with its own permissions counts as one.
- At most 5,000 role assignments per uniquely permissioned item.
- Inheritance cannot be broken on a folder that already holds more than 100,000 items, so restrict a matter when it is created, not later.

**Restricting a folder through Graph**

- `invite` and `createLink` accept `retainInheritedPermissions`. Documented meaning of `false`: "all existing permissions are removed when sharing for the first time".
- Recipients can be groups: pass `email`, `alias` (for security groups without mail) or `objectId`.
- Only permissions that are not inherited can be deleted.
- There is no dedicated Graph call to break or reset inheritance.

**Other**

- Retention labels can be set on a folder through Graph (`.../retentionLabel`) and apply to everything in it.
- Folder columns are updated with `PATCH /sites/{site}/lists/{list}/items/{item}/fields`. Filtering works on one indexed column at a time.

## Sizing: one library is not enough for long

With a recommended ceiling of 5,000 restricted folders per library, a single "Matters" library fills up. Options:

| Layout | Fits | Trade-off |
| --- | --- | --- |
| One library per year or practice area, matter folders inside | Most firms | Needs a rule for which library a new matter goes to; "all my matters" spans libraries |
| One site per matter | Firms needing formal ethical walls | Heavier provisioning; Microsoft Purview Information Barriers work at site level only |
| One library, one folder per matter | Under roughly 5,000 matters in total, including closed ones | Simplest; hits the limit with no clean way out |

Recommended: one library per year unless the firm needs site-level walls. The spike takes the library as configuration and a `mattersFolderId`, so this needs no change to its design.

## Who performs matter creation

Restricting a folder requires the right to manage permissions on it. Two ways to provide that:

| Approach | How | Trade-off |
| --- | --- | --- |
| As the team leader (delegated) | Team leaders are given manage-permissions rights on the matters library | No extra credential. Leaders hold broad rights on the library. What the spike does today. |
| As the app (app-only) | The app holds `Sites.Selected` with a `fullcontrol` role on the site and performs creation and team changes after checking the role policy | Users need no elevated SharePoint rights. The app credential becomes high-value; the role policy becomes a real security control for these actions. |

Recommended: app-only for creation and team changes, delegated for everything else. Not built yet; `createMatter` takes any Graph client, so it works with either.

## Draft policy

In `matters/README.md`. Points the firm must decide:

- **Do admins see every matter's documents?** If yes, a firm-admins group must be granted on every matter at creation. If confidentiality rules say no, admins manage matters without opening them, which the app-only approach allows.
- **Can team leaders see matters they do not lead?**
- **Can associates share inside the firm?** The draft says no: adding someone is a team change, done by the lead.
- **Who is the lead of a matter?** The policy needs this per matter. It should be stored as a column on the folder; the spike currently expects the caller to supply it.

## Not yet built

- App-only provisioning client.
- Matter metadata columns (number, client, status, lead) and listing by them.
- Automatically adding the creator and any admins group to the team.
- Closing a matter (read-only permissions plus a retention label).
- Filing email into a matter from the UI (`saveAttachmentToDrive` already accepts the matter's folder id).
- Screens for any of this.

## Unverified, test on a tenant first

1. **What `retainInheritedPermissions: false` leaves behind.** The docs do not say whether the caller or site owners keep access. If the creator loses access, the spike's rollback delete would fail (it reports this loudly). Always include the creator in the first grant.
2. **Whether the flag works at all on SharePoint folders.** One community report mentions `invalidRequest`. Fallback: SharePoint REST `breakroleinheritance`, which for app-only access requires a certificate, not a secret.
3. **App-only `invite` with `Sites.Selected`.** The overview page says `Sites.Selected` with `fullcontrol` can manage permissions; the `invite` reference table does not list it.
4. **App-only invite of internal users.** Docs only say new guests cannot be invited.
5. **The SharePoint permission level a delegated caller needs** to restrict a folder.
6. Item limits per library (30 million) and the 5,000-item view threshold come from search summaries.

Items 1 to 3 decide the provisioning design and should be the first things run on a test tenant.

## Sources

- `SharePoint/sp-dev-docs`: `docs/apis/migration-perm-guidance.md`, `docs/solution-guidance/security-apponly-azuread.md`
- `microsoftgraph/microsoft-graph-docs-contrib`: `api-reference/v1.0/api/driveitem-invite.md`, `driveitem-createlink.md`, `permission-delete.md`, `listitem-update.md`, `listitem-list.md`, `driveitem-setretentionlabel.md`; `resources/driverecipient.md`; `concepts/permissions-selected-overview.md`, `auth-v2-service.md`
- `MicrosoftDocs/entra-docs`: `docs/identity-platform/howto-add-app-roles-in-apps.md`, `id-token-claims-reference.md`; `docs/identity/enterprise-apps/assign-user-or-group-access-portal.md`
- `nextauthjs/next-auth`: `packages/core/src/providers/microsoft-entra-id.ts`, `docs/pages/guides/role-based-access-control.mdx`
