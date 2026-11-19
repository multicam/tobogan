import { GraphError, seg, type GraphClient } from "./graph-client";
import { assertEmail, assertGuid, assertId, InvalidInputError } from "./names";

export type ShareRole = "read" | "write";
export type LinkScope = "organization" | "users" | "anonymous";

export interface PermissionSummary {
  id: string;
  roles: string[];
  /** Display names or emails of the people/groups this applies to. */
  grantedTo: string[];
  link?: { type?: string; scope?: string; webUrl?: string };
  /** Inherited permissions cannot be removed on this item. */
  inherited: boolean;
  expirationDateTime?: string;
}

interface RawIdentitySet {
  user?: { displayName?: string; email?: string };
  group?: { displayName?: string; email?: string };
  siteUser?: { displayName?: string; email?: string; loginName?: string };
  siteGroup?: { displayName?: string };
}

interface RawPermission {
  id: string;
  roles?: string[];
  grantedToV2?: RawIdentitySet;
  grantedToIdentitiesV2?: RawIdentitySet[];
  link?: { type?: string; scope?: string; webUrl?: string };
  inheritedFrom?: { id?: string } | null;
  expirationDateTime?: string;
  error?: { code?: string; message?: string };
}

const permissionsPath = (driveId: string, itemId: string) =>
  `/drives/${seg(driveId)}/items/${seg(assertId(itemId))}/permissions`;

function identityLabel(set: RawIdentitySet | undefined): string | undefined {
  const who: { displayName?: string; email?: string } | undefined = set?.user ?? set?.group ?? set?.siteUser ?? set?.siteGroup;
  return who?.displayName ?? who?.email;
}

function toPermission(raw: RawPermission): PermissionSummary {
  const identities = [raw.grantedToV2, ...(raw.grantedToIdentitiesV2 ?? [])];
  return {
    id: raw.id,
    roles: raw.roles ?? [],
    grantedTo: identities.map(identityLabel).filter((v): v is string => Boolean(v)),
    link: raw.link,
    inherited: Boolean(raw.inheritedFrom?.id),
    expirationDateTime: raw.expirationDateTime,
  };
}

export async function listPermissions(graph: GraphClient, driveId: string, itemId: string): Promise<PermissionSummary[]> {
  const raw = await graph.getAll<RawPermission>(permissionsPath(driveId, itemId));
  return raw.map(toPermission);
}

export interface InviteResult {
  granted: PermissionSummary[];
  /** Recipients Graph rejected (207 Multi-Status). */
  failed: { code: string; message: string }[];
}

/** Grant named people access. Does not create any link. */
export async function invite(
  graph: GraphClient,
  driveId: string,
  itemId: string,
  input: {
    emails: string[];
    /** Entra group object ids (security or Microsoft 365 groups). */
    groupIds?: string[];
    role?: ShareRole;
    message?: string;
    sendInvitation?: boolean;
    /** false stops the item inheriting access from its parent (unique permissions). */
    retainInheritedPermissions?: boolean;
  },
): Promise<InviteResult> {
  const groups = input.groupIds ?? [];
  const count = input.emails.length + groups.length;
  if (count === 0 || count > 50) throw new InvalidInputError("Provide 1 to 50 recipients.");
  const role = input.role ?? "read";
  if (role !== "read" && role !== "write") throw new InvalidInputError("Role must be read or write.");
  if (input.message && input.message.length > 2000) throw new InvalidInputError("Message is longer than 2000 characters.");

  const data = await graph.request<{ value?: RawPermission[] }>(
    "POST",
    `/drives/${seg(driveId)}/items/${seg(assertId(itemId))}/invite`,
    {
      json: {
        recipients: [
          ...input.emails.map((email) => ({ email: assertEmail(email) })),
          ...groups.map((objectId) => ({ objectId: assertGuid(objectId) })),
        ],
        message: input.message,
        requireSignIn: true,
        sendInvitation: input.sendInvitation ?? true,
        roles: [role],
        retainInheritedPermissions: input.retainInheritedPermissions,
      },
    },
  );

  const result: InviteResult = { granted: [], failed: [] };
  for (const entry of data?.value ?? []) {
    if (entry.error) result.failed.push({ code: entry.error.code ?? "unknown", message: entry.error.message ?? "" });
    else result.granted.push(toPermission(entry));
  }
  return result;
}

/**
 * Create (or fetch the existing) sharing link. Scope is always explicit so a
 * tenant default can never silently widen access; "anonymous" must be opted
 * into by the caller and may still be refused by tenant policy (403).
 */
export async function createLink(
  graph: GraphClient,
  driveId: string,
  itemId: string,
  input: { type: "view" | "edit"; scope: LinkScope; expirationDateTime?: string },
): Promise<{ permissionId: string; webUrl: string }> {
  const data = await graph.request<RawPermission>(
    "POST",
    `/drives/${seg(driveId)}/items/${seg(assertId(itemId))}/createLink`,
    { json: { type: input.type, scope: input.scope, expirationDateTime: input.expirationDateTime } },
  );
  if (!data?.link?.webUrl) throw new GraphError(502, "noLink", "Graph returned no sharing link.");
  return { permissionId: data.id, webUrl: data.link.webUrl };
}

export async function revokePermission(graph: GraphClient, driveId: string, itemId: string, permissionId: string): Promise<void> {
  const path = `${permissionsPath(driveId, itemId)}/${seg(assertId(permissionId, "permission id"))}`;
  const current = await graph.request<RawPermission>("GET", path);
  if (current?.inheritedFrom?.id) {
    throw new GraphError(409, "inheritedPermission", "This access is inherited from a parent folder and must be removed there.");
  }
  await graph.request("DELETE", path, { responseType: "none" });
}

/** Change a person's role on an item. Not supported for sharing links. */
export async function setPermissionRole(graph: GraphClient, driveId: string, itemId: string, permissionId: string, role: ShareRole) {
  if (role !== "read" && role !== "write") throw new InvalidInputError("Role must be read or write.");
  await graph.request("PATCH", `${permissionsPath(driveId, itemId)}/${seg(assertId(permissionId, "permission id"))}`, {
    json: { roles: [role] },
    responseType: "none",
  });
}
