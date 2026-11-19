# SHARE: SharePoint sharing and permissions

**Track:** m365 · **Type:** research · **Date:** 2026-11-19

**Question:** how do we share files and folders from the app without granting more access than the user intended?

## Doctrines

**SHARE-1. Inviting a person and creating a link are separate, explicit actions.**
- Why: the guide's share action invites one person and then also creates an organization-wide link, giving everyone in the firm who obtains the link the same access.
- Basis: Tested
- Code: `invite` and `createLink` in `spike/lib/m365/sharing.ts`; separate Server Actions in `spike/app/workspace/actions.ts`

**SHARE-2. Every link states its scope, and anonymous links are off.**
- Why: an omitted `scope` takes the tenant default, which can be wider than intended. For a law firm, anonymous links to matter documents are never acceptable from the app.
- Evidence: scopes are `anonymous`, `organization`, `users`; `createLink` returns 200 when an equivalent link exists, so repeating it is safe; administrators can disable anonymous links (`driveitem-createlink.md`).
- Basis: Verified, Tested
- Code: `createLinkAction` rejects `anonymous`.

**SHARE-3. Report the outcome per recipient.**
- Why: `invite` can return 207 with an error for some recipients and success for others; the guide treats any response as success.
- Evidence: `driveitem-invite.md`
- Basis: Verified, Tested
- Code: `invite` returns `granted` and `failed` lists.

**SHARE-4. Remove inherited access where it was granted, not on the child.**
- Why: Graph deletes only permissions that are not inherited; trying on the child fails.
- Evidence: `permission-delete.md`; `inheritedFrom` names the ancestor (`driveitem-list-permissions.md`).
- Basis: Verified, Tested
- Code: `revokePermission` checks `inheritedFrom` first and explains where to remove the access.

**SHARE-5. Validate recipients and roles on the server.**
- Why: Server Action arguments are not type-checked at runtime; a comma-joined string would otherwise reach Graph as one recipient.
- Basis: Tested
- Code: `assertEmail`, role checks, 1 to 50 recipients, message under 2,000 characters.

**SHARE-6. Load permissions on demand, not for every row.**
- Why: every permission operation costs 5 SharePoint resource units, against 1 for a plain read.
- Evidence: SharePoint throttling guidance.
- Basis: Verified

**SHARE-7. Show tenant policy refusals to the user as Graph states them.**
- Why: external sharing, default link scope, link expiry and guest invitation are tenant and site settings; the same request succeeds on one tenant and returns 403 on another. A generic error hides the cause.
- Basis: Decision
- Code: Gap: no sharing UI yet.

## Open

- **Unverified:** exact scopes per sharing call (the permission tables were not fetched); confirm when moving to `Sites.Selected` (AUTH-5).
- **Unverified:** rules on combining `requireSignIn` and `sendInvitation`. The spike always sends `requireSignIn: true`.
- **Unverified:** the error code returned when tenant policy refuses a link scope.
- **Not built:** sharing UI, role changes (`PATCH`), link expiry, `users`-scoped links, emailing a link as a separate step.
- Record the target tenant's sharing settings.

## Reference

- `invite` fields: `recipients`, `message` (max 2,000 characters), `requireSignIn`, `sendInvitation`, `roles` (`read`, `write`), `expirationDateTime`, `retainInheritedPermissions` (default true). `password` is OneDrive personal only.
- `GET .../permissions` returns effective permissions including inherited ones. Use `grantedToV2` and `grantedToIdentitiesV2`; `grantedTo` is deprecated. Owners see all permissions, others only their own; `link.webUrl` is returned only to callers who could create the link.
- `PATCH .../permissions/{id}` changes `roles` only and does not apply to organization or people sharing links.
- `users`-scoped links work only for people granted on them (`POST /shares/{encoded-link}/permission/grant`).

## Sources

`microsoftgraph/microsoft-graph-docs-contrib`, `api-reference/v1.0/api/`: `driveitem-invite.md`, `driveitem-createlink.md`, `driveitem-list-permissions.md`, `permission-delete.md`, `permission-update.md`, `permission-grant.md`. `SharePoint/sp-dev-docs`: throttling guidance.
