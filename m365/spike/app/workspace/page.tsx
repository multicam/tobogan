import Link from "next/link";
import { auth, signIn } from "@/auth";
import { getPreviewUrl, listChildren } from "@/lib/m365/drive";
import { buildEmailDocument, EMAIL_IFRAME_SANDBOX } from "@/lib/m365/email-html";
import { getMessage, listInbox } from "@/lib/m365/mail";
import { getDriveContext } from "@/lib/m365/server";
import { ReauthRequiredError } from "@/lib/m365/tokens";
import { UploadForm } from "./upload-form";

type Params = { folderId?: string; previewId?: string; messageId?: string };

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
  try {
    data = await load(params);
  } catch (error) {
    // Stored tokens are gone or were revoked: ask for a fresh sign-in.
    if (error instanceof ReauthRequiredError) return <SignIn />;
    throw error;
  }
  const { files, inbox, previewUrl, message } = data;
  const folderId = params.folderId ?? "root";
  const href = (next: Params) => `/workspace?${new URLSearchParams({ folderId, ...next } as Record<string, string>)}`;

  return (
    <main style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 24, padding: 24 }}>
      <section>
        <h2>Documents {folderId !== "root" && <Link href="/workspace">(back to root)</Link>}</h2>
        <UploadForm folderId={folderId} />
        <ul>
          {files.items.map((item) => (
            <li key={item.id}>
              {item.isFolder ? (
                <Link href={`/workspace?folderId=${encodeURIComponent(item.id)}`}>
                  {item.name}/ ({item.childCount ?? 0})
                </Link>
              ) : (
                <>
                  {item.name} <Link href={href({ previewId: item.id })}>Preview</Link>{" "}
                  <a href={item.webUrl} target="_blank" rel="noopener noreferrer">
                    Open in Office
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
        {files.nextLink && <p>More items exist; add cursor paging with files.nextLink.</p>}
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
