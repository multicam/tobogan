// Sharing-tier live probe as Agent.Smith on cub-staging: links and permissions on a scratch file
// that this script creates and deletes. No invitation email is sent (no recipient is named).
// Run from m365/spike: bun probe/live-sharing.ts
import { createFolder, deleteItem, upload } from "../lib/m365/drive";
import { createLink, listPermissions, revokePermission } from "../lib/m365/sharing";
import { agentGraph, agentToken } from "./delegated-session";
import { need } from "./app-token";

const { token } = await agentToken();
const graph = agentGraph(token);
const driveId = need("SP_DRIVE_ID");
const results: { step: string; ok: boolean; detail: string }[] = [];
async function step(name: string, fn: () => Promise<string>) {
  try {
    results.push({ step: name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ step: name, ok: false, detail: String((e as Error).message).slice(0, 300) });
  }
}

let scratchId: string | undefined;
let fileId = "";
try {
  await step("1 scratch folder and file", async () => {
    const f = await createFolder(graph, driveId, "root", `tobogan-probe-sharing-${Date.now()}`, "fail");
    scratchId = f.id;
    fileId = (await upload(graph, driveId, f.id, "share-me.txt", new TextEncoder().encode("probe"))).id;
    return "created";
  });
  if (fileId) {
    await step("2 permissions on a new file", async () => {
      const p = await listPermissions(graph, driveId, fileId);
      return `${p.length} permission entries; inherited: ${p.filter((x) => x.inherited).length}; links: ${p.filter((x) => x.link).length}`;
    });
    let orgLink = "";
    await step("3 organization view link", async () => {
      const l = await createLink(graph, driveId, fileId, { type: "view", scope: "organization" });
      orgLink = l.permissionId;
      return `created; link host ${new URL(l.webUrl).host}`;
    });
    await step("4 link appears in the permission list with scope organization", async () => {
      const p = (await listPermissions(graph, driveId, fileId)).find((x) => x.id === orgLink);
      if (p?.link?.scope !== "organization") throw new Error(`scope seen: ${p?.link?.scope}`);
      return `scope ${p.link.scope}, type ${p.link.type}`;
    });
    await step("5 anonymous link (tenant policy)", async () => {
      try {
        const l = await createLink(graph, driveId, fileId, { type: "view", scope: "anonymous" });
        await revokePermission(graph, driveId, fileId, l.permissionId);
        return "ALLOWED by the tenant; created and revoked at once";
      } catch (e) {
        return `refused by the tenant or app: ${String((e as Error).message).slice(0, 120)}`;
      }
    });
    await step("6 revoke the organization link", async () => {
      await revokePermission(graph, driveId, fileId, orgLink);
      const left = (await listPermissions(graph, driveId, fileId)).filter((x) => x.link).length;
      if (left !== 0) throw new Error(`${left} links still present`);
      return "revoked; no links remain";
    });
    results.push({ step: "7 invite named people by email", ok: true, detail: "NOT RUN: needs a recipient address named by JM" });
  }
} finally {
  if (scratchId) await step("8 cleanup: scratch folder", async () => (await deleteItem(graph, driveId, scratchId!), "deleted"));
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}\n      ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
