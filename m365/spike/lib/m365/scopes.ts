/** Delegated scopes (AUTH-5). Separate from config.ts so it can be tested. */

export type SiteAccess = "selected" | "all";

/**
 * "selected" (default) limits the app to sites an admin has granted it
 * (Sites.Selected, see grantAppSiteAccess). "all" is for development tenants
 * where no grant has been made yet.
 */
export function graphScope(siteAccess: string | undefined): string {
  const access = siteAccess ?? "selected";
  if (access !== "selected" && access !== "all") throw new Error('SHAREPOINT_SITE_ACCESS must be "selected" or "all".');
  return [
    "openid",
    "profile",
    "email",
    "offline_access",
    access === "selected" ? "Sites.Selected" : "Sites.ReadWrite.All",
    // ReadWrite only because the app marks messages as read (MAIL-7).
    "Mail.ReadWrite",
    "Mail.Send",
  ].join(" ");
}
