import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { GRAPH_SCOPE } from "@/lib/m365/config";
import { getTokenManager } from "@/lib/m365/server";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Single tenant. Without an issuer the provider accepts any Microsoft account.
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      authorization: { params: { scope: GRAPH_SCOPE } },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
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
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
  events: {
    async signOut(message) {
      const uid = "token" in message ? message.token?.uid : undefined;
      if (typeof uid === "string") await getTokenManager().forget(uid);
    },
  },
});
