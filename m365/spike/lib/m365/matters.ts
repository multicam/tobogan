import { createFolder, deleteItem, listChildren, type DriveItemSummary } from "./drive";
import { GraphError, seg, type GraphClient, type GraphPage } from "./graph-client";
import { assertEmail, assertGuid, assertId, InvalidInputError } from "./names";
import { invite, listPermissions, revokePermission, setPermissionRole, type PermissionSummary, type ShareRole } from "./sharing";

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

export type MatterStatus = "Open" | "Closed";

/** Columns kept on each matter folder (POLICY-4). */
export interface MatterFields {
  number: string;
  lead: string;
  status: MatterStatus;
}

/** Column names in the document library. */
export const MATTER_COLUMNS = { number: "MatterNumber", lead: "MatterLead", status: "MatterStatus" } as const;

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

// ---------------------------------------------------------------------------
// Library columns

const listCache = new Map<string, { siteId: string; listId: string }>();

/** The SharePoint list behind a drive. Cached per process. */
export async function getListRef(graph: GraphClient, driveId: string) {
  const cached = listCache.get(driveId);
  if (cached) return cached;
  const list = await graph.request<{ id: string; parentReference?: { siteId?: string } }>("GET", `/drives/${seg(driveId)}/list`, {
    query: { $select: "id,parentReference" },
  });
  if (!list.parentReference?.siteId) throw new GraphError(502, "noSite", "Drive list returned no site id.");
  const ref = { siteId: list.parentReference.siteId, listId: list.id };
  listCache.set(driveId, ref);
  return ref;
}

export function clearListCache() {
  listCache.clear();
}

/**
 * Create the matter columns if they are missing. Indexed, so matters can be
 * filtered by them in large libraries. Run once per library, as an admin or the app.
 */
export async function ensureMatterColumns(graph: GraphClient, driveId: string): Promise<string[]> {
  const { siteId, listId } = await getListRef(graph, driveId);
  const base = `/sites/${seg(siteId)}/lists/${seg(listId)}/columns`;
  const existing = new Set((await graph.getAll<{ name: string }>(base, { query: { $select: "name" } })).map((c) => c.name));
  const wanted = [
    { name: MATTER_COLUMNS.number, text: {}, indexed: true },
    { name: MATTER_COLUMNS.lead, text: {}, indexed: true },
    { name: MATTER_COLUMNS.status, choice: { choices: ["Open", "Closed"] }, indexed: true, defaultValue: { value: "Open" } },
  ];
  const created: string[] = [];
  for (const column of wanted) {
    if (existing.has(column.name)) continue;
    await graph.request("POST", base, { json: column });
    created.push(column.name);
  }
  return created;
}

async function listItemPath(graph: GraphClient, driveId: string, itemId: string): Promise<string> {
  const { siteId, listId } = await getListRef(graph, driveId);
  const listItem = await graph.request<{ id: string }>("GET", `/drives/${seg(driveId)}/items/${seg(assertId(itemId))}/listItem`, {
    query: { $select: "id" },
  });
  return `/sites/${seg(siteId)}/lists/${seg(listId)}/items/${seg(listItem.id)}`;
}

export async function setMatterFields(graph: GraphClient, driveId: string, matterId: string, fields: Partial<MatterFields>) {
  const body: Record<string, string> = {};
  if (fields.number !== undefined) body[MATTER_COLUMNS.number] = fields.number;
  if (fields.lead !== undefined) body[MATTER_COLUMNS.lead] = assertEmail(fields.lead).toLowerCase();
  if (fields.status !== undefined) body[MATTER_COLUMNS.status] = fields.status;
  await graph.request("PATCH", `${await listItemPath(graph, driveId, matterId)}/fields`, { json: body });
}

export async function getMatterFields(graph: GraphClient, driveId: string, matterId: string): Promise<Partial<MatterFields>> {
  const fields = await graph.request<Record<string, unknown>>("GET", `${await listItemPath(graph, driveId, matterId)}/fields`, {
    query: { $select: Object.values(MATTER_COLUMNS).join(",") },
  });
  const read = (key: string) => (typeof fields?.[key] === "string" ? (fields[key] as string) : undefined);
  const status = read(MATTER_COLUMNS.status);
  return {
    number: read(MATTER_COLUMNS.number),
    lead: read(MATTER_COLUMNS.lead)?.toLowerCase(),
    status: status === "Open" || status === "Closed" ? status : undefined,
  };
}

/** True when `email` is the recorded lead of the matter. */
export async function isMatterLead(graph: GraphClient, driveId: string, matterId: string, email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const { lead } = await getMatterFields(graph, driveId, matterId);
  return lead !== undefined && lead === email.toLowerCase();
}

// ---------------------------------------------------------------------------
// Matters

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
 * Create a matter folder restricted to its team, then record its number,
 * lead and status.
 *
 * A new folder inherits the library's permissions, so until the team grant
 * succeeds it is visible to everyone who can see the library. If any step
 * fails, the folder is deleted so no matter is left open or without a lead.
 */
export async function createMatter(
  graph: GraphClient,
  driveId: string,
  input: {
    number: string;
    title: string;
    /** The person creating the matter. Always granted write in the first grant (MATTER-6). */
    creatorEmail: string;
    /** Defaults to the creator. Always granted write. */
    leadEmail?: string;
    team: MatterMember[];
    /**
     * Entra groups granted write on every matter: firm admins (POLICY-7) and
     * team leaders (POLICY-8). Granted in the first, inheritance-cutting grant.
     */
    firmWideGroupIds?: string[];
    mattersFolderId?: string;
  },
): Promise<Matter> {
  const name = matterFolderName(input.number, input.title);
  const creator = assertEmail(input.creatorEmail).toLowerCase();
  const lead = assertEmail(input.leadEmail ?? creator).toLowerCase();
  const firmWide = (input.firmWideGroupIds ?? []).map((id) => assertGuid(id, "group id"));
  // The write group is granted first and cuts inheritance, so the creator
  // keeps access and the rollback delete can still run if a later step fails.
  const byRole = groupByRole([{ email: creator, role: "write" }, { email: lead, role: "write" }, ...input.team]);

  const folder = await createFolder(graph, driveId, input.mattersFolderId ?? "root", name, "fail");
  try {
    let first = true;
    for (const [role, emails] of byRole) {
      const result = await invite(graph, driveId, folder.id, {
        emails,
        groupIds: role === "write" && firmWide.length > 0 ? firmWide : undefined,
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
    await setMatterFields(graph, driveId, folder.id, { number: input.number, lead, status: "Open" });
  } catch (error) {
    await deleteItem(graph, driveId, folder.id).catch(() => {
      throw new GraphError(500, "matterLeftOpen", `Matter folder ${folder.id} was created but could not be finished or removed. Fix it in SharePoint now.`);
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

/**
 * Close a matter: everyone keeps read access, nobody keeps write, sharing
 * links are removed, the status column becomes Closed and, if given, a
 * retention label is applied to the folder and everything in it.
 */
export async function closeMatter(
  graph: GraphClient,
  driveId: string,
  matterId: string,
  options: { retentionLabel?: string } = {},
): Promise<{ downgraded: number; linksRemoved: number }> {
  let downgraded = 0;
  let linksRemoved = 0;
  for (const permission of await listPermissions(graph, driveId, matterId)) {
    if (permission.inherited || permission.roles.includes("owner")) continue;
    if (permission.link) {
      await revokePermission(graph, driveId, matterId, permission.id);
      linksRemoved++;
    } else if (permission.roles.includes("write")) {
      await setPermissionRole(graph, driveId, matterId, permission.id, "read");
      downgraded++;
    }
  }
  await setMatterFields(graph, driveId, matterId, { status: "Closed" });
  if (options.retentionLabel) {
    await graph.request("PATCH", `/drives/${seg(driveId)}/items/${seg(assertId(matterId))}/retentionLabel`, {
      json: { name: options.retentionLabel },
    });
  }
  return { downgraded, linksRemoved };
}

/**
 * The matter (top-level folder under the matters folder) an item belongs to,
 * or undefined for items outside any matter.
 */
export async function matterOfItem(graph: GraphClient, driveId: string, itemId: string, mattersFolderId = "root"): Promise<string | undefined> {
  let current = assertId(itemId);
  for (let depth = 0; depth < 64; depth++) {
    const item = await graph.request<{ id: string; parentReference?: { id?: string } }>(
      "GET",
      `/drives/${seg(driveId)}/items/${seg(current)}`,
      { query: { $select: "id,parentReference" } },
    );
    const parent = item.parentReference?.id;
    if (!parent) return undefined; // the drive root itself
    if (mattersFolderId === "root" ? await isRoot(graph, driveId, parent) : parent === mattersFolderId) return item.id;
    current = parent;
  }
  throw new GraphError(508, "tooDeep", "Folder nesting is deeper than 64 levels.");
}

const rootIds = new Map<string, string>();
async function isRoot(graph: GraphClient, driveId: string, id: string): Promise<boolean> {
  let rootId = rootIds.get(driveId);
  if (!rootId) {
    rootId = (await graph.request<{ id: string }>("GET", `/drives/${seg(driveId)}/root`, { query: { $select: "id" } })).id;
    rootIds.set(driveId, rootId);
  }
  return id === rootId;
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
