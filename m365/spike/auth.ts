import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { config, delegatedScope, tenantIssuer } from "@/lib/m365/config";
import { isRole, roleFromClaims, type Role } from "@/lib/m365/roles";
import { getTokenManager } from "@/lib/m365/server";

declare module "next-auth" {
  interface Session {
    user: { id: string; role?: Role; name?: string | null; email?: string | null; image?: string | null };
  }
}

// Lazy config: evaluated per request, so a missing setting fails the request
// loudly (AUTH-4) without breaking `next build`, which has no secrets.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  session: { strategy: "jwt" },
  providers: [
    MicrosoftEntraID({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      // Single tenant. Without an issuer the provider accepts any Microsoft account.
      issuer: tenantIssuer(process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID),
      authorization: { params: { scope: delegatedScope() } },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Sign-in only: move the Graph tokens to the server-side store. The
      // cookie keeps just the user key, so it stays small and holds no token.
      if (account) {
        if (!account.access_token || !account.refresh_token) {
          throw new Error("Entra ID returned no refresh token; check the offline_access scope.");
        }
        await getTokenManager().save(account.providerAccountId, {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: (account.expires_at ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
        });
        token.uid = account.providerAccountId;
        // Entra app roles arrive in the ID token. Read once at sign-in, so a
        // role change takes effect at the next sign-in.
        token.role = roleFromClaims(profile?.roles);
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      session.user.role = isRole(token.role) ? token.role : undefined;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const uid = "token" in message ? message.token?.uid : undefined;
      if (typeof uid === "string") await getTokenManager().forget(uid);
    },
  },
}));
