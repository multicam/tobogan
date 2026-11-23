// Read-only live probe of the spike's Graph layer. Run from m365/spike: bun probe/live-readonly.ts
// App-only, certificate-authenticated (cub's identity). Reads only; prints statuses and counts,
// never a secret, a token, a file name or a mail subject.
import { createGraphClient } from "../lib/m365/graph-client";
import { listChildren } from "../lib/m365/drive";
import { appToken, need, tokenRoles } from "./app-token";

const results: { step: string; ok: boolean; detail: string }[] = [];
async function step(name: string, fn: () => Promise<string>) {
  try {
    results.push({ step: name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ step: name, ok: false, detail: String((e as Error).message).slice(0, 300) });
  }
}

let token: string | undefined;
await step("1 token (client credentials, certificate)", async () => {
  token = await appToken();
  const roles = tokenRoles(token);
  return `issued; app roles in token: ${roles.length ? roles.join(", ") : "none"}`;
});

if (token) {
  const graph = createGraphClient({ getAccessToken: async () => token!, userAgent: "tobogan-m365-spike-probe/0.1" });
  const siteId = need("SP_SITE_ID");
  const driveId = need("SP_DRIVE_ID");
  await step("2 site lookup", async () => {
    const s = await graph.request<{ id?: string }>("GET", `/sites/${encodeURIComponent(siteId)}`, { query: { $select: "id,webUrl" } });
    return `status ok; id returned: ${Boolean(s.id)}`;
  });
  await step("3 drive lookup", async () => {
    const d = await graph.request<{ driveType?: string }>("GET", `/drives/${encodeURIComponent(driveId)}`, { query: { $select: "id,driveType" } });
    return `status ok; driveType: ${d.driveType}`;
  });
  await step("4 list root (spike drive.listChildren, 5 items)", async () => {
    const p = await listChildren(graph, driveId, "root", { pageSize: 5 });
    return `${p.items.length} items returned (${p.items.filter((i) => i.isFolder).length} folders); more pages: ${Boolean(p.nextLink)}`;
  });
  await step("5 delta token (latest, no items read)", async () => {
    const r = await graph.request<{ "@odata.deltaLink"?: string }>("GET", `/drives/${encodeURIComponent(driveId)}/root/delta`, { query: { token: "latest" } });
    return `deltaLink returned: ${Boolean(r["@odata.deltaLink"])}`;
  });
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}\n      ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
