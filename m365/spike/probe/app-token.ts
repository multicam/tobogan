// Shared by the live probes: an app-only Graph token from cub's certificate identity.
// No error here may carry any part of a secret value.
import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";

export const need = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
};
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// The value is PEM text, PEM with literal \n, base64 of the PEM, or a file path.
function loadKey(raw: string) {
  let text: string;
  if (raw.includes("BEGIN")) text = raw.replace(/\\n/g, "\n");
  else if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && raw.length > 200) text = Buffer.from(raw, "base64").toString("utf8");
  else {
    try {
      text = readFileSync(raw, "utf8");
    } catch {
      throw new Error("SP_APP_CERT_KEY is neither PEM, base64 PEM nor a readable path");
    }
  }
  try {
    return createPrivateKey(text);
  } catch {
    throw new Error("SP_APP_CERT_KEY could not be parsed as a private key");
  }
}

export const tokenUrl = () => `https://login.microsoftonline.com/${need("SP_TENANT_ID")}/oauth2/v2.0/token`;

export function clientAssertion(): Record<string, string> {
  const clientId = need("SP_APP_CLIENT_ID");
  const thumb = need("SP_APP_CERT_THUMBPRINT").replace(/[^0-9a-fA-F]/g, "");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", x5t: b64u(Buffer.from(thumb, "hex")) };
  const claims = { aud: tokenUrl(), iss: clientId, sub: clientId, jti: crypto.randomUUID(), nbf: now, exp: now + 600 };
  const unsigned = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claims))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(loadKey(need("SP_APP_CERT_KEY")));
  return {
    client_id: clientId,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: `${unsigned}.${b64u(signature)}`,
  };
}

export async function appToken(): Promise<string> {
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
      ...clientAssertion(),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`token request failed: ${res.status} ${body.error ?? ""} ${(body.error_description ?? "").split("\r")[0]}`);
  }
  return body.access_token;
}

export function tokenRoles(token: string): string[] {
  return JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString()).roles ?? [];
}
