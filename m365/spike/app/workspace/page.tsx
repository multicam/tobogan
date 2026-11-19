import Link from "next/link";
import { auth, signIn } from "@/auth";
import { getPreviewUrl, listChildren } from "@/lib/m365/drive";
import { buildEmailDocument, EMAIL_IFRAME_SANDBOX } from "@/lib/m365/email-html";
import { getMessage, listInbox } from "@/lib/m365/mail";
import { getDriveContext } from "@/lib/m365/server";
import { ReauthRequiredError } from "@/lib/m365/tokens";
import { authorizeItemAction } from "@/lib/m365/authorize";
import { getMatterFields } from "@/lib/m365/matters";
import { GraphError } from "@/lib/m365/graph-client";
import { can, ForbiddenError } from "@/lib/m365/roles";
import { listPermissions, type PermissionSummary } from "@/lib/m365/sharing";
import { closeMatterFormAction, createLinkFormAction, createMatterFormAction, inviteFormAction, revokeFormAction } from "./actions";
import { UploadForm } from "./upload-form";

type Params = { folderId?: string; previewId?: string; messageId?: string; shareId?: string; msg?: string; err?: string };

function SignIn() {
  return (
    <form
      action={async () => {
        "use server";
        await signIn("microsoft-entra-id", { redirectTo: "/workspace" });
      }}
    >
      <button type="submit">Sign in with Microsoft 365</button>
    </form>
  );
}

/**
 * Sharing panel data, loaded only when asked for (SHARE-6) and only for users
 * the policy lets manage it; others get a reason instead of a list.
 */
async function loadSharing(itemId: string): Promise<
  { permissions: PermissionSummary[]; isMatter: boolean; status?: string } | { denied: string }
> {
  try {
    const { admin, driveId, matterId } = await authorizeItemAction("share.external", itemId);
    const [permissions, fields] = await Promise.all([
      listPermissions(admin, driveId, itemId),
      matterId === itemId ? getMatterFields(admin, driveId, itemId) : undefined,
    ]);
    return { permissions, isMatter: matterId === itemId, status: fields?.status };
  } catch (error) {
    if (error instanceof ForbiddenError) return { denied: "Only an admin or the matter's lead can manage sharing here." };
    if (error instanceof GraphError && (error.isForbidden || error.isNotFound)) return { denied: "You do not have access to this item." };
    throw error;
  }
}

async function load({ folderId = "root", previewId, messageId }: Params) {
  const { graph, driveId } = await getDriveContext();
  // At most three of these calls go to Outlook, which allows four at once per mailbox.
  const [files, inbox, previewUrl, message] = await Promise.all([
    listChildren(graph, driveId, folderId),
    listInbox(graph, { pageSize: 10 }),
    previewId ? getPreviewUrl(graph, driveId, previewId) : undefined,
    messageId ? getMessage(graph, messageId) : undefined,
  ]);
  return { files, inbox, previewUrl, message };
}

export default async function WorkspacePage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  if (!(await auth())) return <SignIn />;

  let data: Awaited<ReturnType<typeof load>>;
  let sharing: Awaited<ReturnType<typeof loadSharing>> | undefined;
  try {
    data = await load(params);
    if (params.shareId) sharing = await loadSharing(params.shareId);
  } catch (error) {
    // Stored tokens are gone or were revoked: ask for a fresh sign-in.
    if (error instanceof ReauthRequiredError) return <SignIn />;
    throw error;
  }
  const { files, inbox, previewUrl, message } = data;
  const folderId = params.folderId ?? "root";
  const role = (await auth())?.user?.role;
  const href = (next: Params) => `/workspace?${new URLSearchParams({ folderId, ...next } as Record<string, string>)}`;

  return (
    <main style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24, padding: 24 }}>
      <section>
        <p>
          Role: <strong>{role ?? "none (no access)"}</strong>
        </p>
        {params.msg && <p role="status">{params.msg}</p>}
        {params.err && <p role="alert" style={{ color: "crimson" }}>{params.err}</p>}
        {folderId === "root" && can(role, "matter.create") && (
          <details>
            <summary>New matter</summary>
            <form action={createMatterFormAction}>
              <input name="number" placeholder="Matter number, e.g. 2026-0042" required />{" "}
              <input name="title" placeholder="Title" required />{" "}
              <input name="writers" placeholder="Team (edit), emails" />{" "}
              <input name="readers" placeholder="Team (read only), emails" />{" "}
              {role === "admin" && <input name="lead" placeholder="Lead email (default: you)" />}{" "}
              <button type="submit">Create</button>
            </form>
          </details>
        )}
        <h2>Documents {folderId !== "root" && <Link href="/workspace">(back to root)</Link>}</h2>
        <UploadForm folderId={folderId} />
        <ul>
          {files.items.map((item) => (
            <li key={item.id}>
              {item.isFolder ? (
                <>
                  <Link href={`/workspace?folderId=${encodeURIComponent(item.id)}`}>
                    {item.name}/ ({item.childCount ?? 0})
                  </Link>{" "}
                  <Link href={href({ shareId: item.id })}>Sharing</Link>
                </>
              ) : (
                <>
                  {item.name} <Link href={href({ previewId: item.id })}>Preview</Link>{" "}
                  <a href={item.webUrl} target="_blank" rel="noopener noreferrer">
                    Open in Office
                  </a>{" "}
                  <Link href={href({ shareId: item.id })}>Sharing</Link>
                </>
              )}
            </li>
          ))}
        </ul>
        {files.nextLink && <p>More items exist; add cursor paging with files.nextLink.</p>}
        {params.shareId && sharing && (
          <aside style={{ border: "1px solid #ccc", padding: 12, margin: "12px 0" }}>
            <h3>Sharing</h3>
            {"denied" in sharing ? (
              <p>{sharing.denied}</p>
            ) : (
              <>
                <ul>
                  {sharing.permissions.map((p) => (
                    <li key={p.id}>
                      {p.link ? `Link (${p.link.type}, ${p.link.scope})` : p.grantedTo.join(", ") || "Unknown"}: {p.roles.join(", ")}
                      {p.inherited ? " (inherited)" : ""}{" "}
                      {!p.inherited && !p.roles.includes("owner") && (
                        <form action={revokeFormAction} style={{ display: "inline" }}>
                          <input type="hidden" name="folderId" value={folderId} />
                          <input type="hidden" name="shareId" value={params.shareId} />
                          <input type="hidden" name="permissionId" value={p.id} />
                          <button type="submit">Remove</button>
                        </form>
                      )}
                    </li>
                  ))}
                </ul>
                <form action={inviteFormAction}>
                  <input type="hidden" name="folderId" value={folderId} />
                  <input type="hidden" name="shareId" value={params.shareId} />
                  <input name="email" type="email" placeholder="Email" required />{" "}
                  <select name="role" defaultValue="read">
                    <option value="read">Can view</option>
                    <option value="write">Can edit</option>
                  </select>{" "}
                  <button type="submit">Invite</button>
                </form>
                <form action={createLinkFormAction}>
                  <input type="hidden" name="folderId" value={folderId} />
                  <input type="hidden" name="shareId" value={params.shareId} />
                  <select name="type" defaultValue="view">
                    <option value="view">View link</option>
                    <option value="edit">Edit link</option>
                  </select>{" "}
                  <select name="scope" defaultValue="users">
                    <option value="users">Specific people</option>
                    <option value="organization">Anyone in the firm</option>
                  </select>{" "}
                  <button type="submit">Create link</button>
                </form>
                {sharing.isMatter && sharing.status !== "Closed" && (
                  <form action={closeMatterFormAction}>
                    <input type="hidden" name="folderId" value={folderId} />
                    <input type="hidden" name="shareId" value={params.shareId} />
                    <button type="submit">Close matter</button>
                  </form>
                )}
              </>
            )}
          </aside>
        )}
        {previewUrl && (
          // Preview URLs act with the user's permissions: never cache or log them.
          <iframe src={previewUrl} title="Document preview" style={{ width: "100%", height: 500 }} referrerPolicy="no-referrer" />
        )}
      </section>

      <section>
        <h2>Inbox</h2>
        <ul>
          {inbox.items.map((m) => (
            <li key={m.id}>
              <Link href={href({ messageId: m.id })}>
                {m.isRead ? m.subject : <strong>{m.subject}</strong>}
              </Link>{" "}
              <small>{m.fromName ?? m.fromAddress}</small>
            </li>
          ))}
        </ul>
        {message && (
          <article>
            <h3>{message.subject}</h3>
            <iframe
              sandbox={EMAIL_IFRAME_SANDBOX}
              srcDoc={buildEmailDocument(message.body)}
              title="Email body"
              style={{ width: "100%", height: 400 }}
              referrerPolicy="no-referrer"
            />
            <ul>
              {message.attachments.filter((a) => !a.isInline).map((a) => (
                <li key={a.id}>
                  {a.name} ({a.kind}, {a.size} bytes)
                </li>
              ))}
            </ul>
          </article>
        )}
      </section>
    </main>
  );
}
