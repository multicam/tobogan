import "server-only";
import { auth } from "@/auth";
import { config, GRAPH_SCOPE } from "./config";
import { resolveDrive } from "./drive";
import { createGraphClient, type GraphClient } from "./graph-client";
import type { Role } from "./roles";
import { createTokenManager, MemoryTokenStore, ReauthRequiredError, type TokenManager, type TokenStore } from "./tokens";

// Survive dev hot reloads. Replace MemoryTokenStore with a shared, encrypted
// store (Redis, database) before running more than one instance.
const globals = globalThis as unknown as { __m365TokenStore?: TokenStore; __m365Tokens?: TokenManager };

export function getTokenManager(): TokenManager {
  if (!globals.__m365Tokens) {
    globals.__m365TokenStore ??= new MemoryTokenStore();
    globals.__m365Tokens = createTokenManager({
      store: globals.__m365TokenStore,
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      scope: GRAPH_SCOPE,
    });
  }
  return globals.__m365Tokens;
}

/** Graph client acting as the signed-in user. Throws ReauthRequiredError if there is none. */
export async function getGraph(): Promise<GraphClient> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new ReauthRequiredError();
  const tokens = getTokenManager();
  return createGraphClient({
    getAccessToken: () => tokens.getAccessToken(userId),
    userAgent: "NONISV|Cub|NextM365Spike/0.1",
  });
}

export async function getDriveContext() {
  const graph = await getGraph();
  const { driveId, siteId } = await resolveDrive(graph, config.sharePoint);
  return { graph, driveId, siteId };
}

/** The signed-in user's firm role, or undefined (which every policy check denies). */
export async function getRole(): Promise<Role | undefined> {
  return (await auth())?.user?.role;
}
