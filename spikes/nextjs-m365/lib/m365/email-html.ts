/**
 * Build the document for showing an untrusted email body.
 *
 * The body is never injected into the app's own DOM. It goes into an
 * <iframe sandbox srcDoc> (no allow-scripts, no allow-same-origin), which
 * gives it a unique origin with scripts, forms and plugins disabled. The CSP
 * below additionally blocks every network load, so remote images and CSS
 * cannot be used as read-tracking beacons unless the user opts in.
 */
export function buildEmailDocument(
  body: { contentType: "html" | "text"; content: string },
  options: { allowRemoteImages?: boolean } = {},
): string {
  const img = options.allowRemoteImages ? "img-src https: data:" : "img-src data:";
  const csp = `default-src 'none'; ${img}; style-src 'unsafe-inline'; font-src data:`;
  const content =
    body.contentType === "html" ? body.content : `<pre style="white-space:pre-wrap;font:inherit">${escapeHtml(body.content)}</pre>`;
  return (
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<base target="_blank">` +
    `<style>body{font:14px/1.5 system-ui,sans-serif;margin:12px;word-break:break-word}img{max-width:100%;height:auto}</style>` +
    `</head><body>${content}</body></html>`
  );
}

/** Sandbox tokens for the viewer iframe: links may open a new tab, nothing else. */
export const EMAIL_IFRAME_SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
