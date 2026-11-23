// Delegated live probe as the TEST USER (Agent.Smith) on cub-staging. Run from m365/spike:
//   bun probe/live-delegated.ts      (signs in by itself; see delegated-session.ts)
// Everything written is tracked by id and removed at the end. Mail goes only to the signed-in user.
import { createFolder, deleteItem, listChildren, upload } from "../lib/m365/drive";
import { getMessage, listInbox, saveAttachmentToDrive } from "../lib/m365/mail";
import { agentGraph, agentToken } from "./delegated-session";
import { need } from "./app-token";

const { token, scopes } = await agentToken();
const graph = agentGraph(token);
const driveId = need("SP_DRIVE_ID");

const results: { step: string; ok: boolean; detail: string }[] = [{ step: "1 sign-in with certificate, PKCE, delegated", ok: true, detail: `scopes granted: ${scopes}` }];
async function step(name: string, fn: () => Promise<string>) {
  try {
    results.push({ step: name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ step: name, ok: false, detail: String((e as Error).message).slice(0, 300) });
  }
}

let me = "";
let scratchId: string | undefined;
const mine: string[] = [];
const subject = `tobogan m365 probe ${new Date().toISOString()}`;

await step("2 /me", async () => {
  const m = await graph.request<{ mail?: string; userPrincipalName?: string; displayName?: string }>("GET", "/me", { query: { $select: "mail,userPrincipalName,displayName" } });
  me = m.mail ?? m.userPrincipalName ?? "";
  return `signed in as ${m.displayName} <${me}>`;
});
await step("3 delegated: list drive root as this user", async () => `${(await listChildren(graph, driveId, "root", { pageSize: 5 })).items.length} items returned`);
await step("4 delegated: create scratch folder", async () => {
  const f = await createFolder(graph, driveId, "root", `tobogan-probe-delegated-${Date.now()}`, "fail");
  scratchId = f.id;
  await upload(graph, driveId, f.id, "small.txt", new TextEncoder().encode("x".repeat(512)));
  return "folder and 512-byte file created";
});
await step("5 mail: read inbox (counts only)", async () => `${(await listInbox(graph, { pageSize: 5 })).items.length} messages returned`);
await step("6 mail: send one message with a file attachment to self", async () => {
  await graph.request("POST", "/me/sendMail", {
    json: {
      message: {
        subject,
        body: { contentType: "HTML", content: "<p>Automated m365 spike probe. Safe to delete.</p>" },
        toRecipients: [{ emailAddress: { address: me } }],
        attachments: [{ "@odata.type": "#microsoft.graph.fileAttachment", name: "probe.txt", contentType: "text/plain", contentBytes: Buffer.from("probe attachment").toString("base64") }],
      },
      saveToSentItems: true,
    },
    responseType: "none",
  });
  return `sent to ${me}`;
});
let messageId: string | undefined;
await step("7 mail: message arrives, read it, list attachments", async () => {
  for (let i = 0; i < 12; i++) {
    const hit = (await listInbox(graph, { pageSize: 10 })).items.find((m) => m.subject === subject);
    if (hit) {
      messageId = hit.id;
      const d = await getMessage(graph, hit.id);
      return `arrived after ~${i * 5}s; attachments: ${d.attachments.map((a) => `${a.name} (${a.kind}, ${a.size} B reported)`).join(", ")}`;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("message did not arrive within 60 s");
});
await step("8 mail: save the attachment to the scratch folder", async () => {
  const d = await getMessage(graph, messageId!);
  const saved = await saveAttachmentToDrive(graph, { messageId: messageId!, attachmentId: d.attachments[0]!.id, driveId, folderId: scratchId });
  return `saved as ${saved.name}, ${saved.size} B`;
});
await step("9 cleanup: scratch folder, the received message, the sent copy", async () => {
  if (scratchId) await deleteItem(graph, driveId, scratchId);
  mine.push("scratch folder");
  if (messageId) {
    await graph.request("DELETE", `/me/messages/${encodeURIComponent(messageId)}`, { responseType: "none" });
    mine.push("received message");
  }
  const sent = await graph.getAll<{ id: string; subject?: string }>("/me/mailFolders/sentitems/messages", { query: { $select: "id,subject", $top: 10, $orderby: "sentDateTime desc" }, maxItems: 10 });
  const copy = sent.find((m) => m.subject === subject);
  if (copy) {
    await graph.request("DELETE", `/me/messages/${encodeURIComponent(copy.id)}`, { responseType: "none" });
    mine.push("sent copy");
  }
  return `removed: ${mine.join(", ")} (messages go to Deleted Items)`;
});

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}\n      ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
