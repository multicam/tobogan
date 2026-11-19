import { describe, expect, it } from "vitest";
import { buildEmailDocument, EMAIL_IFRAME_SANDBOX, escapeHtml } from "../lib/m365/email-html";

const cspOf = (doc: string) => /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(doc)?.[1];

describe("buildEmailDocument", () => {
  it("blocks every network load by default, allowing only inline styles and data: images and fonts", () => {
    const doc = buildEmailDocument({ contentType: "html", content: "<p>Hi</p>" });
    expect(cspOf(doc)).toBe("default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:");
    expect(doc).toContain("<body><p>Hi</p></body>");
    expect(doc).toContain('<base target="_blank">');
    expect(doc.startsWith("<!doctype html>")).toBe(true);
  });

  it("allows remote https images only when opted in", () => {
    const doc = buildEmailDocument({ contentType: "html", content: "" }, { allowRemoteImages: true });
    expect(cspOf(doc)).toBe("default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src data:");
    expect(cspOf(buildEmailDocument({ contentType: "html", content: "" }, { allowRemoteImages: false }))).toContain("img-src data:;");
  });

  it("escapes plain-text bodies and keeps their line breaks", () => {
    const doc = buildEmailDocument({ contentType: "text", content: "<script>alert('x')</script>\nline 2 & more" });
    expect(doc).toContain(
      '<pre style="white-space:pre-wrap;font:inherit">&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;\nline 2 &amp; more</pre>',
    );
    expect(doc).not.toContain("<script>");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters and nothing else", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    expect(escapeHtml("plain é text")).toBe("plain é text");
    expect(escapeHtml("")).toBe("");
  });
});

describe("EMAIL_IFRAME_SANDBOX", () => {
  it("never grants scripts, same-origin or forms", () => {
    const tokens = EMAIL_IFRAME_SANDBOX.split(" ");
    expect(tokens).toEqual(["allow-popups", "allow-popups-to-escape-sandbox"]);
  });
});
