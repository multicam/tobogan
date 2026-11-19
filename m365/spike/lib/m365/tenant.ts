/** Directory (tenant) id: a GUID or a verified domain such as contoso.onmicrosoft.com. */
const TENANT_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9-]+(\.[a-z0-9-]+)+)$/i;

/**
 * Issuer for exactly one tenant (AUTH-4). Throws instead of producing
 * ".../undefined/v2.0", and refuses the multi-tenant endpoints.
 */
export function tenantIssuer(tenantId: string | undefined): string {
  if (!tenantId) throw new Error("Missing environment variable AUTH_MICROSOFT_ENTRA_ID_TENANT_ID");
  if (/^(common|organizations|consumers)$/i.test(tenantId) || !TENANT_ID.test(tenantId)) {
    throw new Error("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID must be one tenant's id or domain.");
  }
  return `https://login.microsoftonline.com/${tenantId}/v2.0`;
}
