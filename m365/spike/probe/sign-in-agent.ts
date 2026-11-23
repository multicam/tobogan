// Signs the test user (Agent.Smith) in through a throwaway headless Chrome, driven over the DevTools
// protocol. Usage: bun probe/sign-in-agent.ts <authorize-url>   (from live-delegated.ts)
// Reads QA_AGENT_SMITH_PASSWORD and QA_AGENT_SMITH_TOTP_SECRET from env; prints neither, nor the code.
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { need } from "./app-token";

const url = process.argv[2];
if (!url?.startsWith("https://login.microsoftonline.com/")) throw new Error("pass the authorize URL");
const USER = need("QA_AGENT_SMITH_UPN");

function totp(secretBase32: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.toUpperCase().replace(/[^A-Z2-7]/g, "")) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const n = ((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!;
  return String(n % 1_000_000).padStart(6, "0");
}

const profile = mkdtempSync(join(process.env.PROBE_SCRATCH ?? tmpdir(), "m365-probe-chrome-"));
const port = 9333;
const chrome = Bun.spawn(
  ["google-chrome", "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "about:blank"],
  { stdout: "ignore", stderr: "ignore" },
);
const cleanup = () => {
  chrome.kill();
  rmSync(profile, { recursive: true, force: true });
};

try {
  let wsUrl = "";
  for (let i = 0; i < 40 && !wsUrl; i++) {
    try {
      const tabs = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[];
      wsUrl = tabs.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? "";
    } catch {}
    if (!wsUrl) await Bun.sleep(250);
  }
  if (!wsUrl) throw new Error("Chrome did not expose a DevTools page");
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r as () => void));
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  ws.onmessage = (m) => {
    const d = JSON.parse(String(m.data));
    pending.get(d.id)?.(d);
  };
  const send = (method: string, params: object = {}) =>
    new Promise<any>((res) => {
      const n = ++id;
      pending.set(n, res);
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evalJs = async (expr: string) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.result?.value;
  await send("Page.enable");
  await send("Page.navigate", { url });

  const setAndClick = (inputSel: string, value: string, btnSel: string) =>
    evalJs(`(() => { const i = document.querySelector(${JSON.stringify(inputSel)}); const b = document.querySelector(${JSON.stringify(btnSel)});
      if (!i || !b || i.offsetParent === null) return false;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, ${JSON.stringify(value)});
      i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); b.click(); return true; })()`);
  const click = (btnSel: string) => evalJs(`(() => { const b = document.querySelector(${JSON.stringify(btnSel)}); if (!b || b.offsetParent === null) return false; b.click(); return true; })()`);

  const log: string[] = [];
  const done = (u: string) => u.startsWith("http://localhost:3000/callback");
  let lastAct = "";
  for (let t = 0; t < 120; t++) {
    const href: string = (await evalJs("location.href")) ?? "";
    if (done(href) || href.startsWith("chrome-error")) {
      log.push(done(href) ? "reached the callback" : "callback unreachable (probe not listening?)");
      break;
    }
    let act = "";
    if (await setAndClick('input[name="loginfmt"]', USER, "#idSIButton9")) act = "username";
    else if (await setAndClick('input[name="passwd"]', need("QA_AGENT_SMITH_PASSWORD"), "#idSIButton9")) act = "password";
    else if (await setAndClick('input[name="otc"]', totp(need("QA_AGENT_SMITH_TOTP_SECRET")), "#idSubmit_SAOTCC_Continue")) act = "one-time code";
    else if (
      await evalJs(`(() => { const e = [...document.querySelectorAll("a,button,input[type=button],input[type=submit]")].find((x) => /^(not now|skip for now)$/i.test((x.innerText || x.value || "").trim())); if (!e) return false; e.click(); return true; })()`)
    ) act = "security-info nudge: not now";
    else if (await click("#idBtnBack")) act = "stay-signed-in: no";
    else if (await click("#idSIButton9")) act = "accept/continue";
    if (act && act !== lastAct) console.log(`step: ${act}`);
    if (act) lastAct = act;
    else {
      if (t % 4 === 0) console.log(`waiting on: ${new URL(href || "about:blank").pathname.slice(0, 60)} | ${String(await evalJs("document.title")).slice(0, 60)} | ids: ${String(await evalJs("[...document.querySelectorAll('input,button')].filter(e=>e.offsetParent).map(e=>e.name||e.id).join(',')")).slice(0, 120)}`);
      const err = await evalJs(`document.querySelector("#usernameError,#passwordError,#idTD_Error,#idSpan_SAOTCC_Error_OTC")?.textContent?.trim() ?? ""`);
      if (err) {
        log.push(`page error: ${String(err).slice(0, 120)}`);
        break;
      }
    }
    await Bun.sleep(1500);
  }
  console.log(log.join("\n"));
} finally {
  cleanup();
}
