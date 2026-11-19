/**
 * One-off admin step for Sites.Selected (AUTH-5, MATTER-7): grant this app a
 * role on one site. Must be called with a token that holds
 * Sites.FullControl.All, as a SharePoint Administrator who is a site member.
 */
import { seg, type GraphClient } from "./graph-client";
import { assertId } from "./names";

export type SiteRole = "read" | "write" | "owner" | "fullcontrol";

export interface SiteGrant {
  id: string;
  roles: string[];
  appId?: string;
}

export async function grantAppSiteAccess(
  graph: GraphClient,
  siteId: string,
  app: { clientId: string; displayName: string },
  role: SiteRole,
): Promise<SiteGrant> {
  if (!["read", "write", "owner", "fullcontrol"].includes(role)) throw new Error("Invalid site role.");
  const created = await graph.request<{ id: string; roles?: string[] }>("POST", `/sites/${seg(assertId(siteId, "site id"))}/permissions`, {
    json: { roles: [role], grantedToIdentities: [{ application: { id: assertId(app.clientId, "client id"), displayName: app.displayName } }] },
  });
  return { id: created.id, roles: created.roles ?? [role], appId: app.clientId };
}

export async function listAppSiteGrants(graph: GraphClient, siteId: string): Promise<SiteGrant[]> {
  const raw = await graph.getAll<{ id: string; roles?: string[]; grantedToIdentitiesV2?: { application?: { id?: string } }[] }>(
    `/sites/${seg(assertId(siteId, "site id"))}/permissions`,
  );
  return raw.map((p) => ({ id: p.id, roles: p.roles ?? [], appId: p.grantedToIdentitiesV2?.[0]?.application?.id }));
}
