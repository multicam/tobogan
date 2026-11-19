import { createFolder, deleteItem, listChildren, type DriveItemSummary } from "./drive";
import { GraphError, type GraphClient, type GraphPage } from "./graph-client";
import { InvalidInputError } from "./names";
import { invite, listPermissions, revokePermission, type PermissionSummary, type ShareRole } from "./sharing";

/** A matter is a folder whose access is limited to its team. */
export interface Matter {
  id: string;
  number: string;
  title: string;
  webUrl: string;
}

export interface MatterMember {
  email: string;
  role: ShareRole;
}

const MATTER_NUMBER = /^[A-Z0-9][A-Z0-9-]{1,30}$/;
const SEPARATOR = " - ";

export function matterFolderName(number: string, title: string): string {
  if (!MATTER_NUMBER.test(number)) throw new InvalidInputError("Matter number must be 2-31 characters: A-Z, 0-9 and hyphens.");
  const clean = title.trim();
  if (!clean) throw new InvalidInputError("Matter title is required.");
  return `${number}${SEPARATOR}${clean}`;
}

function toMatter(item: DriveItemSummary): Matter {
  const cut = item.name.indexOf(SEPARATOR);
  return {
    id: item.id,
    number: cut > 0 ? item.name.slice(0, cut) : item.name,
    title: cut > 0 ? item.name.slice(cut + SEPARATOR.length) : "",
    webUrl: item.webUrl,
  };
}

/**
 * Matters the signed-in user can open. With delegated access SharePoint only
 * returns folders the user has permission on, so no extra filtering is needed
 * and none must be added that widens it.
 */
export async function listMatters(
  graph: GraphClient,
  driveId: string,
  mattersFolderId = "root",
  options: { cursor?: string } = {},
): Promise<GraphPage<Matter>> {
  const page = await listChildren(graph, driveId, mattersFolderId, options);
  return { items: page.items.filter((i) => i.isFolder).map(toMatter), nextLink: page.nextLink };
}

/**
 * Create a matter folder restricted to its team.
 *
 * A new folder inherits the library's permissions, so until the team grant
 * succeeds it is visible to everyone who can see the library. If restricting
 * it fails, the empty folder is deleted so no matter is ever left open.
 */
export async function createMatter(
  graph: GraphClient,
  driveId: string,
  input: { number: string; title: string; team: MatterMember[]; mattersFolderId?: string },
): Promise<Matter> {
  const name = matterFolderName(input.number, input.title);
  if (input.team.length === 0) throw new InvalidInputError("A matter needs at least one team member.");
  const byRole = groupByRole(input.team);

  const folder = await createFolder(graph, driveId, input.mattersFolderId ?? "root", name, "fail");
  try {
    let first = true;
    for (const [role, emails] of byRole) {
      const result = await invite(graph, driveId, folder.id, {
        emails,
        role,
        sendInvitation: false,
        // Only the first call cuts inheritance; later calls add to the unique set.
        retainInheritedPermissions: first ? false : undefined,
      });
      if (result.failed.length > 0) {
        throw new GraphError(424, "teamGrantFailed", `Could not grant access to every team member: ${result.failed[0]!.message}`);
      }
      first = false;
    }
  } catch (error) {
    await deleteItem(graph, driveId, folder.id).catch(() => {
      throw new GraphError(500, "matterLeftOpen", `Matter folder ${folder.id} was created but could not be restricted or removed. Fix it in SharePoint now.`);
    });
    throw error;
  }
  return toMatter(folder);
}

export async function listMatterTeam(graph: GraphClient, driveId: string, matterId: string): Promise<PermissionSummary[]> {
  return listPermissions(graph, driveId, matterId);
}

export async function addMatterMembers(graph: GraphClient, driveId: string, matterId: string, members: MatterMember[]) {
  const failed: { code: string; message: string }[] = [];
  for (const [role, emails] of groupByRole(members)) {
    failed.push(...(await invite(graph, driveId, matterId, { emails, role, sendInvitation: false })).failed);
  }
  return { failed };
}

export async function removeMatterMember(graph: GraphClient, driveId: string, matterId: string, permissionId: string) {
  await revokePermission(graph, driveId, matterId, permissionId);
}

/** One entry per person (the higher role wins), write grants first. */
function groupByRole(members: MatterMember[]): Map<ShareRole, string[]> {
  const roleByEmail = new Map<string, ShareRole>();
  for (const member of members) {
    const key = member.email.toLowerCase();
    if (member.role === "write" || !roleByEmail.has(key)) roleByEmail.set(key, member.role);
  }
  const map = new Map<ShareRole, string[]>();
  for (const role of ["write", "read"] as const) {
    const emails = [...roleByEmail].filter(([, r]) => r === role).map(([email]) => email);
    if (emails.length > 0) map.set(role, emails);
  }
  return map;
}
