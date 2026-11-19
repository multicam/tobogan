import "server-only";

export { tenantIssuer } from "./tenant";
import { graphScope } from "./scopes";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** Read lazily so `next build` works without secrets present. */
export const config = {
  get tenantId() {
    return required("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID");
  },
  get clientId() {
    return required("AUTH_MICROSOFT_ENTRA_ID_ID");
  },
  get clientSecret() {
    return required("AUTH_MICROSOFT_ENTRA_ID_SECRET");
  },
  get sharePoint() {
    return {
      hostname: required("SHAREPOINT_HOSTNAME"),
      sitePath: required("SHAREPOINT_SITE_PATH"),
      libraryName: process.env.SHAREPOINT_LIBRARY_NAME || undefined,
    };
  },
};

/** Delegated scopes for this deployment (AUTH-5). */
export function delegatedScope(): string {
  return graphScope(process.env.SHAREPOINT_SITE_ACCESS || undefined);
}

/**
 * Who performs matter creation and team changes (MATTER-7). "app" (default)
 * uses the app's own credential; "delegated" uses the signed-in user's token,
 * which then needs permission-management rights on the library.
 */
export function matterProvisioning(): "app" | "delegated" {
  const value = process.env.MATTER_PROVISIONING || "app";
  if (value !== "app" && value !== "delegated") throw new Error('MATTER_PROVISIONING must be "app" or "delegated".');
  return value;
}

/** Optional Entra group id granted write on every new matter (POLICY open question 1). */
export function matterAdminGroupId(): string | undefined {
  return process.env.MATTER_ADMIN_GROUP_ID || undefined;
}
