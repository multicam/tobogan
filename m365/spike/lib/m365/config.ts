import "server-only";

export { tenantIssuer } from "./tenant";
import { graphScope } from "./scopes";
import { libraryForYear } from "./libraries";

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
      // MATTER-10: "{year}" in the name selects one library per year.
      libraryName: libraryForYear(process.env.SHAREPOINT_LIBRARY_NAME || undefined, new Date().getUTCFullYear()),
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

/**
 * Groups granted edit access on every new matter: firm admins (POLICY-7) and
 * team leaders (POLICY-8). Both are required: without them a new matter would
 * silently break the policy, so creation refuses to start.
 */
export function firmWideGroupIds(): string[] {
  const admins = process.env.MATTER_ADMIN_GROUP_ID;
  const leaders = process.env.MATTER_LEADERS_GROUP_ID;
  if (!admins || !leaders) {
    throw new Error("MATTER_ADMIN_GROUP_ID and MATTER_LEADERS_GROUP_ID must be set: admins and team leaders see every matter (POLICY-7, POLICY-8).");
  }
  return [admins, leaders];
}

/** The firm's email domains; addresses elsewhere are external (POLICY-9). */
export function firmDomains(): string[] {
  return (process.env.FIRM_EMAIL_DOMAINS ?? "").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}
