import "server-only";
import { matterProvisioning } from "./config";
import type { GraphClient } from "./graph-client";
import { isMatterLead, matterOfItem } from "./matters";
import { assertCan, type Action } from "./roles";
import { getAppGraph, getDriveContext } from "./server";

/**
 * The client that performs matter creation, team changes and sharing
 * (MATTER-7): the app itself, or the user when MATTER_PROVISIONING=delegated.
 */
export function provisioningGraph(userGraph: GraphClient): GraphClient {
  return matterProvisioning() === "app" ? getAppGraph() : userGraph;
}

/**
 * Check the role policy for an action on an item (POLICY-5) and return the
 * clients to carry it out. The lead is read from the matter's column, never
 * from the request. Items outside any matter only pass for admins.
 */
export async function authorizeItemAction(action: Action, itemId: string) {
  const ctx = await getDriveContext();
  const admin = provisioningGraph(ctx.graph);
  // Found with the user's own token: a user who cannot see the item cannot act on it.
  const matterId = await matterOfItem(ctx.graph, ctx.driveId, itemId);
  const lead = matterId ? await isMatterLead(admin, ctx.driveId, matterId, ctx.email) : false;
  assertCan(ctx.role, action, { isMatterLead: lead });
  return { ...ctx, admin, matterId };
}
