import "server-only";

export { tenantIssuer } from "./tenant";

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

/**
 * Least privilege for the features in this spike. Mail.ReadWrite is only
 * needed for mark-as-read; drop to Mail.Read if that is not used.
 * Swap Sites.ReadWrite.All for Sites.Selected once an admin has granted the
 * app a role on the one target site.
 */
export const GRAPH_SCOPE = ["openid", "profile", "email", "offline_access", "Sites.ReadWrite.All", "Mail.ReadWrite", "Mail.Send"].join(" ");
