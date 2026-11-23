// Write-tier live probe: everything happens inside ONE scratch folder this script creates and then
// deletes (by its own id, never the root). Run from m365/spike: bun probe/live-writes.ts
// Prints statuses and the scratch names this script made; no secret, token or existing file name.
import { createGraphClient } from "../lib/m365/graph-client";
import { createFolder, deleteItem, getItem, getPreviewUrl, listChildren, upload } from "../lib/m365/drive";
import { appToken, need } from "./app-token";

const results: { step: string; ok: boolean; detail: string }[] = [];
async function step(name: string, fn: () => Promise<string>) {
  try {
    results.push({ step: name, ok: true, detail: await fn() });
  } catch (e) {
    results.push({ step: name, ok: false, detail: String((e as Error).message).slice(0, 300) });
  }
}
async function expectFail(name: string, fn: () => Promise<unknown>, want: RegExp) {
  try {
    await fn();
    results.push({ step: name, ok: false, detail: "expected a failure, got success" });
  } catch (e) {
    const m = String((e as Error).message);
    results.push({ step: name, ok: want.test(m), detail: `failed as ${want.test(m) ? "expected" : "UNEXPECTEDLY"}: ${m.slice(0, 160)}` });
  }
}

const token = await appToken();
const graph = createGraphClient({ getAccessToken: async () => token, userAgent: "tobogan-m365-spike-probe/0.1" });
const driveId = need("SP_DRIVE_ID");
const scratchName = `tobogan-probe-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let scratchId: string | undefined;
const made: string[] = [];

try {
  await step("1 create scratch folder at the drive root", async () => {
    const f = await createFolder(graph, driveId, "root", scratchName, "fail");
    scratchId = f.id;
    made.push(scratchName + "/");
    return `created ${scratchName}`;
  });
  if (scratchId) {
    const parent = scratchId;
    await step("2 small upload (1 KiB)", async () => {
      const it = await upload(graph, driveId, parent, "small.txt", new TextEncoder().encode("x".repeat(1024)));
      made.push("small.txt");
      return `uploaded, size ${it.size}`;
    });
    await step("3 large upload (9 MiB, chunked session)", async () => {
      const bytes = new Uint8Array(9 * 1024 * 1024).fill(97);
      const it = await upload(graph, driveId, parent, "large.bin", bytes);
      made.push("large.bin");
      return `uploaded, size ${it.size}, expected ${bytes.byteLength}`;
    });
    await expectFail("4 conflict: same name with fail behaviour", () => upload(graph, driveId, parent, "small.txt", new TextEncoder().encode("y")), /409|nameAlreadyExists|already exists|conflict/i);
    await step("5 conflict: rename behaviour keeps both", async () => {
      const it = await upload(graph, driveId, parent, "small.txt", new TextEncoder().encode("y"), { conflictBehavior: "rename" });
      made.push("renamed copy");
      return `second file stored under a different name: ${it.name !== "small.txt"}`;
    });
    await step("6 subfolder, then list scratch folder", async () => {
      await createFolder(graph, driveId, parent, "sub", "fail");
      made.push("sub/");
      const p = await listChildren(graph, driveId, parent, { pageSize: 20 });
      return `${p.items.length} items listed (expected 4)`;
    });
    await step("7 get item metadata", async () => {
      const p = await listChildren(graph, driveId, parent, { pageSize: 20 });
      const f = p.items.find((i) => i.name === "small.txt");
      const it = await getItem(graph, driveId, f!.id);
      return `item read back, size ${it.size}`;
    });
    await step("8 preview URL (app-only)", async () => {
      const p = await listChildren(graph, driveId, parent, { pageSize: 20 });
      const f = p.items.find((i) => i.name === "small.txt");
      const url = await getPreviewUrl(graph, driveId, f!.id);
      return `preview URL returned, host ${new URL(url).host}`;
    });
    await expectFail("9 invalid file name is refused before any request", () => upload(graph, driveId, parent, "bad:name?.txt", new TextEncoder().encode("z")), /invalid|name/i);
  }
} finally {
  if (scratchId) {
    await step("10 cleanup: delete only the scratch folder by id", async () => {
      await deleteItem(graph, driveId, scratchId!);
      return `deleted ${scratchName} (created: ${made.join(", ")})`;
    });
  }
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}\n      ${r.detail}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
