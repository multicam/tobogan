# Next.js + SharePoint & Microsoft 365 Full-Stack Integration Guide

> Superseded in part, 2026-11-24: PLAN-5 in `integration-plan.md` adopts no auth library and no Graph SDK — cub keeps its own OIDC code with its certificate; the Auth.js/next-auth guidance below, including the claim that it avoids X.509 certificates, now describes the spike's test harness only.

This document provides a complete, production-ready blueprint for integrating **SharePoint Document Libraries**, **Office Online (Word/Excel/PowerPoint) editing**, **Folder Sharing & Permissions**, and **Exchange Email views** into a **Next.js (App Router)** application.

By using **Microsoft Graph** paired with **Auth.js (NextAuth v5) Delegated Authentication**, you avoid X.509 certificate requirements and automatically enforce each signed-in user's native SharePoint and Exchange permissions.

---

## 1. Architecture & Open-Source Stack

| Layer | Open-Source Package | Role |
| :--- | :--- | :--- |
| **Authentication** | `next-auth` (Auth.js v5) | Handles Microsoft Entra ID sign-in, OAuth scopes, and automatic access token refresh. |
| **M365 Unified SDK** | `@microsoft/microsoft-graph-client` | Connects to SharePoint Drives, Office Online preview/edit URLs, Permissions, and Exchange Mail. |
| **UI Sanitization** | `isomorphic-dompurify` | Safely renders HTML email bodies inside your Next.js Email View without XSS risks. |

### Installation
```bash
bun add next-auth@beta @microsoft/microsoft-graph-client isomorphic-dompurify
```

---

## 2. Microsoft Entra ID (Azure AD) App Registration

1. Open the **Microsoft Entra admin center** > **App registrations** > **New registration**.
2. Set the Redirect URI (Web) to: `http://localhost:3000/api/auth/callback/microsoft-entra-id`.
3. Under **Certificates & secrets**, create a new **Client secret**.
4. Under **API permissions** > **Add a permission** > **Microsoft Graph** > **Delegated permissions**, add:
   * `openid`, `profile`, `email`, `offline_access` *(required for token refresh)*
   * `Sites.ReadWrite.All` *(browse, upload, edit, and share SharePoint documents & folders)*
   * `Mail.ReadWrite` *(read inbox messages, view threads, download email attachments)*
   * `Mail.Send` *(send emails and share documents as the signed-in user)*

### Environment Variables (`.env.local`)
```env
AUTH_SECRET=your-generated-nextauth-secret
AUTH_MICROSOFT_ENTRA_ID_ID=your-client-id
AUTH_MICROSOFT_ENTRA_ID_SECRET=your-client-secret
AUTH_MICROSOFT_ENTRA_ID_TENANT_ID=your-tenant-id

# Target SharePoint Site & Document Library
SHAREPOINT_HOSTNAME=contoso.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/Operations
```

---

## 3. Auth.js Token Wiring (`auth.ts`)

This configuration captures the Microsoft Graph `access_token` and `refresh_token` during login and refreshes expired tokens automatically so SharePoint and Email API calls never fail mid-session.

```typescript
// auth.ts
import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

const GRAPH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "Sites.ReadWrite.All",
  "Mail.ReadWrite",
  "Mail.Send",
].join(" ");

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/v2.0`,
      authorization: {
        params: { scope: GRAPH_SCOPES },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at! * 1000,
        };
      }

      // Return previous token if still valid (with 60s buffer)
      if (Date.now() < (token.expiresAt as number) - 60_000) {
        return token;
      }

      // Refresh expired access token
      try {
        const response = await fetch(
          `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_ENTRA_ID_TENANT_ID}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
              client_secret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
              grant_type: "refresh_token",
              refresh_token: token.refreshToken as string,
              scope: GRAPH_SCOPES,
            }),
          }
        );

        const refreshed = await response.json();
        if (!response.ok) throw refreshed;

        return {
          ...token,
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token ?? token.refreshToken,
          expiresAt: Date.now() + refreshed.expires_in * 1000,
        };
      } catch (error) {
        return { ...token, error: "RefreshTokenError" };
      }
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string | undefined;
      return session;
    },
  },
});
```

Create the Auth.js route handler at `app/api/auth/[...nextauth]/route.ts`:
```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

---

## 4. Delegated Microsoft Graph Client (`lib/graph.ts`)

This server-only helper creates an authenticated Graph client using the current user's session token and resolves your SharePoint site's default Document Library (`driveId`).

```typescript
// lib/graph.ts
import "server-only";
import { Client } from "@microsoft/microsoft-graph-client";
import { auth } from "@/auth";

export async function getUserGraphClient() {
  const session = await auth();
  if (!session?.accessToken) {
    throw new Error("Unauthorized: No active Microsoft 365 session.");
  }

  return Client.init({
    authProvider: (done) => {
      done(null, session.accessToken);
    },
  });
}

export async function getSharePointDriveContext() {
  const graph = await getUserGraphClient();
  const site = await graph
    .api(`/sites/${process.env.SHAREPOINT_HOSTNAME}:${process.env.SHAREPOINT_SITE_PATH}`)
    .get();

  const drive = await graph.api(`/sites/${site.id}/drive`).get();

  return { graph, siteId: site.id, driveId: drive.id };
}
```

---

## 5. SharePoint Browsing, Uploads & Office Online Integration

### How Office Online Editing & Embedding Works
* **Full Co-Authoring in Office Online:** Every DriveItem returned by Microsoft Graph includes a `webUrl` property. Navigating to `webUrl` opens Word, Excel, or PowerPoint directly in the browser with full real-time co-authoring and auto-save back to SharePoint.
* **Embedded Interactive Viewer (`<iframe>`):** Calling `POST /drives/{driveId}/items/{itemId}/preview` generates a short-lived `getUrl` that you can embed directly inside your Next.js UI.

### Document Service (`lib/sharepoint-docs.ts`)
```typescript
// lib/sharepoint-docs.ts
import "server-only";
import { getSharePointDriveContext } from "./graph";

export interface DriveItemSummary {
  id: string;
  name: string;
  size: number;
  webUrl: string;
  isFolder: boolean;
  childCount?: number;
  mimeType?: string;
  lastModifiedDateTime: string;
  lastModifiedBy?: string;
}

// 1. Browse folders and files
export async function listFolderContents(folderId: string = "root"): Promise<DriveItemSummary[]> {
  const { graph, driveId } = await getSharePointDriveContext();
  const endpoint =
    folderId === "root"
      ? `/drives/${driveId}/root/children`
      : `/drives/${driveId}/items/${folderId}/children`;

  const res = await graph
    .api(endpoint)
    .select("id,name,size,webUrl,folder,file,lastModifiedDateTime,lastModifiedBy")
    .orderby("name asc")
    .get();

  return res.value.map((item: any) => ({
    id: item.id,
    name: item.name,
    size: item.size,
    webUrl: item.webUrl,
    isFolder: Boolean(item.folder),
    childCount: item.folder?.childCount,
    mimeType: item.file?.mimeType,
    lastModifiedDateTime: item.lastModifiedDateTime,
    lastModifiedBy: item.lastModifiedBy?.user?.displayName,
  }));
}

// 2. Generate embeddable Office Online preview URL
export async function getOfficeEmbedUrl(itemId: string): Promise<string> {
  const { graph, driveId } = await getSharePointDriveContext();
  const preview = await graph
    .api(`/drives/${driveId}/items/${itemId}/preview`)
    .post({});

  return preview.getUrl;
}

// 3. Create a new blank Office file (Word, Excel, or PowerPoint) and return its edit URL
export async function createBlankOfficeDocument(
  parentFolderId: string,
  fileName: string // e.g., "Project-Plan.docx" or "Budget.xlsx"
) {
  const { graph, driveId } = await getSharePointDriveContext();
  const endpoint =
    parentFolderId === "root"
      ? `/drives/${driveId}/root:/${encodeURIComponent(fileName)}:/content`
      : `/drives/${driveId}/items/${parentFolderId}:/${encodeURIComponent(fileName)}:/content`;

  // Uploading an empty buffer with the proper extension initializes an editable Office Online file
  const createdItem = await graph
    .api(endpoint)
    .header("Content-Type", "application/octet-stream")
    .put(Buffer.alloc(0));

  return {
    id: createdItem.id,
    name: createdItem.name,
    editUrl: createdItem.webUrl, // Opens directly in Word/Excel/PowerPoint Online
  };
}

// 4. Upload a binary file (up to 250 MB via Graph simple upload)
export async function uploadFileToFolder(
  parentFolderId: string,
  fileName: string,
  fileBuffer: ArrayBuffer
) {
  const { graph, driveId } = await getSharePointDriveContext();
  const endpoint =
    parentFolderId === "root"
      ? `/drives/${driveId}/root:/${encodeURIComponent(fileName)}:/content`
      : `/drives/${driveId}/items/${parentFolderId}:/${encodeURIComponent(fileName)}:/content`;

  return await graph
    .api(endpoint)
    .header("Content-Type", "application/octet-stream")
    .put(Buffer.from(fileBuffer));
}
```

---

## 6. Folder Sharing & Permissions (`lib/sharepoint-sharing.ts`)

Manage folder and file access directly from Next.js—list existing permissions, invite specific people with `read` or `write` roles, generate shareable links, and revoke access.

```typescript
// lib/sharepoint-sharing.ts
import "server-only";
import { getSharePointDriveContext } from "./graph";

// 1. List all permissions on a folder or document
export async function getItemPermissions(itemId: string) {
  const { graph, driveId } = await getSharePointDriveContext();
  const res = await graph.api(`/drives/${driveId}/items/${itemId}/permissions`).get();
  return res.value;
}

// 2. Invite specific users or external guests to a folder/file
export async function inviteUsersToItem({
  itemId,
  emails,
  role = "read", // "read" | "write"
  message = "Here is access to our shared SharePoint folder.",
  sendInvitation = true,
}: {
  itemId: string;
  emails: string[];
  role?: "read" | "write";
  message?: string;
  sendInvitation?: boolean;
}) {
  const { graph, driveId } = await getSharePointDriveContext();

  return await graph.api(`/drives/${driveId}/items/${itemId}/invite`).post({
    recipients: emails.map((email) => ({ email })),
    message,
    requireSignIn: true,
    sendInvitation,
    roles: [role],
  });
}

// 3. Create a copyable sharing link (organization-wide or anyone)
export async function createSharingLink({
  itemId,
  type = "view", // "view" | "edit"
  scope = "organization", // "anonymous" | "organization"
}: {
  itemId: string;
  type?: "view" | "edit";
  scope?: "anonymous" | "organization";
}) {
  const { graph, driveId } = await getSharePointDriveContext();

  const res = await graph
    .api(`/drives/${driveId}/items/${itemId}/createLink`)
    .post({ type, scope });

  return res.link.webUrl as string;
}

// 4. Revoke a specific permission
export async function revokeItemPermission(itemId: string, permissionId: string) {
  const { graph, driveId } = await getSharePointDriveContext();
  await graph
    .api(`/drives/${driveId}/items/${itemId}/permissions/${permissionId}`)
    .delete();
}
```

---

## 7. Email View & Attachment-to-SharePoint Sync (`lib/mail.ts`)

Fetch the signed-in user's inbox, read full HTML emails, save incoming email attachments straight into a SharePoint folder, and send new emails.

```typescript
// lib/mail.ts
import "server-only";
import { getUserGraphClient, getSharePointDriveContext } from "./graph";

// 1. Fetch Inbox messages
export async function listInboxMessages(top: number = 20) {
  const graph = await getUserGraphClient();
  const res = await graph
    .api("/me/mailFolders/inbox/messages")
    .select("id,subject,from,receivedDateTime,bodyPreview,isRead,hasAttachments")
    .orderby("receivedDateTime desc")
    .top(top)
    .get();

  return res.value;
}

// 2. Fetch a single email's full HTML body + attachment metadata
export async function getMessageDetails(messageId: string) {
  const graph = await getUserGraphClient();
  const message = await graph
    .api(`/me/messages/${messageId}`)
    .select("id,subject,from,toRecipients,receivedDateTime,body,hasAttachments")
    .expand("attachments($select=id,name,contentType,size)")
    .get();

  return message;
}

// 3. Save an email attachment directly into a SharePoint folder
export async function saveEmailAttachmentToSharePoint({
  messageId,
  attachmentId,
  targetFolderId = "root",
}: {
  messageId: string;
  attachmentId: string;
  targetFolderId?: string;
}) {
  const graph = await getUserGraphClient();
  const { driveId } = await getSharePointDriveContext();

  // Retrieve full attachment (includes base64 contentBytes for fileAttachment)
  const attachment = await graph
    .api(`/me/messages/${messageId}/attachments/${attachmentId}`)
    .get();

  if (!attachment.contentBytes) {
    throw new Error("Attachment does not contain binary file content.");
  }

  const buffer = Buffer.from(attachment.contentBytes, "base64");
  const endpoint =
    targetFolderId === "root"
      ? `/drives/${driveId}/root:/${encodeURIComponent(attachment.name)}:/content`
      : `/drives/${driveId}/items/${targetFolderId}:/${encodeURIComponent(attachment.name)}:/content`;

  return await graph
    .api(endpoint)
    .header("Content-Type", attachment.contentType || "application/octet-stream")
    .put(buffer);
}

// 4. Send an email (optionally including a SharePoint sharing link)
export async function sendUserEmail({
  to,
  subject,
  htmlBody,
}: {
  to: string[];
  subject: string;
  htmlBody: string;
}) {
  const graph = await getUserGraphClient();

  await graph.api("/me/sendMail").post({
    message: {
      subject,
      body: { contentType: "HTML", content: htmlBody },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: true,
  });
}
```

---

## 8. Server Actions & Workspace UI (`app/workspace/page.tsx`)

Below is a clean Next.js App Router workspace page combining your **SharePoint Document Browser** (with Office Online links, folder drill-down, and sharing) alongside your **Email Inbox View**.

### Server Actions (`app/workspace/actions.ts`)
```typescript
// app/workspace/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createBlankOfficeDocument, uploadFileToFolder } from "@/lib/sharepoint-docs";
import { inviteUsersToItem, createSharingLink } from "@/lib/sharepoint-sharing";
import { saveEmailAttachmentToSharePoint } from "@/lib/mail";

export async function createOfficeDocAction(folderId: string, fileName: string) {
  const doc = await createBlankOfficeDocument(folderId, fileName);
  revalidatePath("/workspace");
  return doc;
}

export async function uploadDocumentAction(formData: FormData) {
  const file = formData.get("file") as File;
  const folderId = (formData.get("folderId") as string) || "root";
  if (!file) throw new Error("No file selected");

  await uploadFileToFolder(folderId, file.name, await file.arrayBuffer());
  revalidatePath("/workspace");
}

export async function shareItemAction(itemId: string, email: string, role: "read" | "write") {
  await inviteUsersToItem({ itemId, emails: [email], role });
  const link = await createSharingLink({
    itemId,
    type: role === "write" ? "edit" : "view",
  });
  revalidatePath("/workspace");
  return link;
}

export async function archiveAttachmentAction(
  messageId: string,
  attachmentId: string,
  folderId: string
) {
  await saveEmailAttachmentToSharePoint({
    messageId,
    attachmentId,
    targetFolderId: folderId,
  });
  revalidatePath("/workspace");
}
```

### Combined Workspace Page (`app/workspace/page.tsx`)
```tsx
// app/workspace/page.tsx
import Link from "next/link";
import { auth, signIn } from "@/auth";
import { listFolderContents, getOfficeEmbedUrl } from "@/lib/sharepoint-docs";
import { listInboxMessages } from "@/lib/mail";
import { uploadDocumentAction } from "./actions";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ folderId?: string; previewId?: string }>;
}) {
  const session = await auth();
  if (!session) {
    return (
      <form
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id");
        }}
        className="p-8"
      >
        <button className="rounded bg-blue-600 px-4 py-2 text-white">
          Sign in with Microsoft 365
        </button>
      </form>
    );
  }

  const { folderId = "root", previewId } = await searchParams;
  const [items, messages, embedUrl] = await Promise.all([
    listFolderContents(folderId),
    listInboxMessages(10),
    previewId ? getOfficeEmbedUrl(previewId) : Promise.resolve(null),
  ]);

  return (
    <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-12">
      {/* LEFT PANEL: SharePoint Documents & Office Online */}
      <section className="space-y-4 rounded-lg border p-4 lg:col-span-7">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">SharePoint Documents</h2>
          {folderId !== "root" && (
            <Link href="/workspace" className="text-sm text-blue-600 underline">
              Back to Root
            </Link>
          )}
        </div>

        {/* Upload Form */}
        <form action={uploadDocumentAction} className="flex gap-2">
          <input type="hidden" name="folderId" value={folderId} />
          <input type="file" name="file" required className="text-sm" />
          <button
            type="submit"
            className="rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
          >
            Upload
          </button>
        </form>

        {/* Document & Folder List */}
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between py-2.5">
              <div>
                {item.isFolder ? (
                  <Link
                    href={`/workspace?folderId=${item.id}`}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    📁 {item.name} ({item.childCount ?? 0})
                  </Link>
                ) : (
                  <span className="font-medium">📄 {item.name}</span>
                )}
                <p className="text-xs text-gray-500">
                  Modified {new Date(item.lastModifiedDateTime).toLocaleDateString()} by{" "}
                  {item.lastModifiedBy ?? "Unknown"}
                </p>
              </div>

              <div className="flex gap-2 text-xs">
                {!item.isFolder && (
                  <>
                    <Link
                      href={`/workspace?folderId=${folderId}&previewId=${item.id}`}
                      className="rounded border px-2 py-1 hover:bg-gray-50"
                    >
                      Preview
                    </Link>
                    <a
                      href={item.webUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded bg-blue-600 px-2 py-1 text-white hover:bg-blue-700"
                    >
                      Edit in Office
                    </a>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        {/* Embedded Office Online Previewer */}
        {embedUrl && (
          <div className="mt-4 overflow-hidden rounded border">
            <iframe
              src={embedUrl}
              className="h-[500px] w-full"
              title="Office Online Document Preview"
            />
          </div>
        )}
      </section>

      {/* RIGHT PANEL: Exchange Inbox View */}
      <section className="space-y-4 rounded-lg border p-4 lg:col-span-5">
        <h2 className="text-lg font-semibold">Inbox</h2>
        <ul className="divide-y">
          {messages.map((msg: any) => (
            <li key={msg.id} className="py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {msg.from?.emailAddress?.name || msg.from?.emailAddress?.address}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(msg.receivedDateTime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-800">
                {msg.hasAttachments ? "📎 " : ""}
                {msg.subject || "(No Subject)"}
              </p>
              <p className="line-clamp-2 text-xs text-gray-500">{msg.bodyPreview}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```
