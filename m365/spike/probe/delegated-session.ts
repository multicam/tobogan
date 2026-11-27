// A delegated Graph token for the test user (Agent.Smith) on the cub-staging registration: PKCE
// authorization code with cub's certificate, redirect http://localhost:3000/callback. It starts the
// callback listener, then runs sign-in-agent.ts (a throwaway headless Chrome) to type the user's
// credentials, which that script reads from env and never prints.
import { createHash, randomBytes } from "node:crypto";
import { createGraphClient } from "../lib/m365/graph-client";
import { clientAssertion, need, tokenUrl } from "./app-token";

const REDIRECT = "http://localhost:3000/callback";
const b64u = (b: Buffer) => b.toString("base64url");

export async function agentToken(): Promise<{ token: string; scopes: string }> {
  const verifier = b64u(randomBytes(32));
  const state = b64u(randomBytes(16));
  const scope = "openid profile email offline_access Files.ReadWrite.All Mail.ReadWrite Mail.Send";
  const authorize =
    `https://login.microsoftonline.com/${need("SP_TENANT_ID")}/oauth2/v2.0/authorize?` +
    new URLSearchParams({
      client_id: need("SP_APP_CLIENT_ID"),
      response_type: "code",
      redirect_uri: REDIRECT,
      response_mode: "query",
      scope,
      state,
      code_challenge: b64u(createHash("sha256").update(verifier).digest()),
      code_challenge_method: "S256",
      prompt: "select_account",
    });

  const code = await new Promise<string>((resolve, reject) => {
    const server = Bun.serve({
      port: 3000,
      hostname: "127.0.0.1",
      fetch(req) {
        const u = new URL(req.url);
        if (u.pathname !== "/callback") return new Response("not found", { status: 404 });
        const err = u.searchParams.get("error");
        const ok = u.searchParams.get("state") === state && u.searchParams.get("code");
        setTimeout(() => server.stop(), 50);
        if (err || !ok) {
          reject(new Error(`sign-in failed: ${err ?? "state mismatch"} ${u.searchParams.get("error_description")?.split("\r")[0] ?? ""}`));
          return new Response("Sign-in failed.", { status: 400 });
        }
        resolve(u.searchParams.get("code")!);
        return new Response("Signed in. You can close this tab.");
      },
    });
    const driver = Bun.spawn(["bun", `${import.meta.dir}/sign-in-agent.ts`, authorize], { stdout: "ignore", stderr: "ignore" });
    setTimeout(() => {
      server.stop();
      driver.kill();
      reject(new Error("timed out waiting for sign-in (3 minutes)"));
    }, 180_000);
  });

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier, scope, ...clientAssertion() }),
  });
  const tok = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !tok.access_token) throw new Error(`token exchange failed: ${res.status} ${tok.error ?? ""} ${(tok.error_description ?? "").split("\r")[0]}`);
  const claims = JSON.parse(Buffer.from(tok.access_token.split(".")[1]!, "base64url").toString());
  return { token: tok.access_token, scopes: String(claims.scp) };
}

export const agentGraph = (token: string) => createGraphClient({ getAccessToken: async () => token, userAgent: "tobogan-m365-spike-probe/0.1" });
