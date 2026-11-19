# SharePoint sharing and permissions

**Question:** how do we share files and folders from the app without granting more access than the user intended?

Implemented in `m365/spike/lib/m365/sharing.ts` and `app/workspace/actions.ts`.

## Decisions

1. **Inviting a person and creating a link are separate actions.** The guide's `shareItemAction` invites one person and then also creates an organization-wide link, which gives everyone in the tenant who has the link the same access. The spike never does both in one call.
2. **Link scope is always explicit.** If `scope` is omitted Graph applies the tenant default, which may be wider than intended. The spike's action rejects `anonymous`.
3. **Report partial failures.** `invite` can return 207 with an error per recipient; the spike returns `granted` and `failed` lists.
4. **Do not try to remove inherited access.** `revokePermission` checks `inheritedFrom` first and explains that the access must be removed on the parent.
5. **Validate recipients and roles on the server.** Server Action arguments are not type-checked at runtime.

## Verified facts

**Invite** (`POST .../invite`)

- Fields: `recipients`, `message` (max 2,000 characters), `requireSignIn`, `sendInvitation`, `roles` (`read` or `write`), `expirationDateTime`, `retainInheritedPermissions` (default true). `password` is OneDrive personal only.
- Returns 200, or 207 with per-recipient errors.

**Links** (`POST .../createLink`)

- `type`: `view`, `edit` (`embed` is OneDrive personal only). `scope`: `anonymous`, `organization`, `users`.
- Returns 201 for a new link and 200 when an equivalent link already exists, so calling it twice is safe.
- Anonymous links can be disabled by an administrator; the call then fails.
- `scope: "users"` creates a link that works only for people granted on it (`POST /shares/{encoded-link}/permission/grant`).

**Listing and removing**

- `GET .../permissions` returns effective permissions, including inherited ones (`inheritedFrom` names the ancestor). Use `grantedToV2` and `grantedToIdentitiesV2`; `grantedTo` is deprecated.
- Owners see all permissions; other users see only those that apply to them. `link.webUrl` is returned only to callers who could create that link.
- `DELETE .../permissions/{id}` returns 204 and works only for permissions that are not inherited.
- `PATCH .../permissions/{id}` can change `roles` only, and is not supported for organization or people sharing links.

**Cost**

- Every permission operation costs 5 SharePoint resource units, so a permissions panel should load on demand, not for every row in a file list.

## Tenant policy decides what works

External sharing level, default link type and scope, link expiry, and whether guests may be invited are all tenant and site settings. The same request can succeed on one tenant and return 403 on another. Record the target tenant's settings and show Graph's error message to the user instead of a generic failure.

## Not yet in the spike

- UI for the sharing actions (the functions and Server Actions exist and are tested).
- Changing a role (`PATCH`), link expiry dates, and `users`-scoped links.
- Sending the link by email (use `sendMail` from the mail module; keep it a separate, explicit step).

## Unverified

- Exact required scopes per sharing call (the permission tables are include files that were not fetched). `Sites.ReadWrite.All` covered these calls in the guide; confirm when moving to `Sites.Selected`.
- Rules on combining `requireSignIn` and `sendInvitation`. The spike always sends `requireSignIn: true`.
- The exact error code when tenant policy refuses a link scope.

## Sources

`microsoftgraph/microsoft-graph-docs-contrib`, `api-reference/v1.0/api/`: `driveitem-invite.md`, `driveitem-createlink.md`, `driveitem-list-permissions.md`, `permission-delete.md`, `permission-update.md`, `permission-grant.md`.
