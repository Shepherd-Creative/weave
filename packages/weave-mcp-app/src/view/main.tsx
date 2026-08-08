import { App } from "@modelcontextprotocol/ext-apps";
import { Weave } from "@shepherd-creative/weave-primitives";
import { createRoot } from "react-dom/client";
import "@shepherd-creative/weave-tokens/tokens.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("weave view: #root missing");
const root = createRoot(rootEl);

// Lifecycle status line, outside #root so React never unmounts it. Doubles as
// the view's loading/error state AND guarantees nonzero content height at
// mount (a zero-height view is collapsed to invisible by the host's
// auto-resize, which makes failures indistinguishable from "nothing rendered").
const statusEl = document.createElement("div");
statusEl.id = "weave-status";
statusEl.style.cssText =
  "padding:0.75rem 1rem;font-family:var(--font-mono);font-size:0.75rem;color:var(--muted-foreground);";
document.body.prepend(statusEl);
function status(msg: string): void {
  statusEl.textContent = msg;
  statusEl.style.display = msg ? "block" : "none";
}

function renderDocument(document: unknown): void {
  root.render(<Weave document={document} />);
  status("");
}

// Surface any runtime failure in-view — inside a host there is no devtools.
window.addEventListener("error", (ev) => status(`weave view error: ${ev.message}`));
window.addEventListener("unhandledrejection", (ev) =>
  status(`weave view rejection: ${String(ev.reason)}`),
);

// Dev/test harness: ?document=<base64 json> renders without a host connection.
const params = new URLSearchParams(window.location.search);
const devDocument = params.get("document");
if (devDocument) {
  try {
    renderDocument(JSON.parse(atob(devDocument)));
  } catch (err) {
    rootEl.textContent = `weave dev harness: failed to parse document: ${(err as Error).message}`;
  }
} else {
  status("weave view loaded; connecting to host…");
  const app = new App({ name: "Weave", version: "0.1.0" }, {});
  app.onerror = (err) => {
    console.error(err);
    status(`weave host error: ${err.message}`);
  };
  app.onteardown = async () => ({});
  // The server ships the document on three channels because hosts differ in
  // what reaches the view (Claude Desktop strips structuredContent, observed
  // 2026-07-07). Try each in order; the fenced json block in content is the
  // last resort and matches the server's content format exactly.
  type ToolResultLike = {
    structuredContent?: { document?: unknown };
    _meta?: Record<string, unknown>;
    content?: Array<{ type?: string; text?: string }>;
  };
  function documentFromResult(result: ToolResultLike): unknown {
    if (result.structuredContent?.document) return result.structuredContent.document;
    if (result._meta?.["weave/document"]) return result._meta["weave/document"];
    for (const block of result.content ?? []) {
      if (block?.type !== "text" || typeof block.text !== "string") continue;
      const fenced = block.text.match(/```json\s*\n([\s\S]*?)\n```/);
      if (!fenced?.[1]) continue;
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // fall through to the next block
      }
    }
    return undefined;
  }
  app.ontoolresult = (result) => {
    const document = documentFromResult(result as ToolResultLike);
    if (document) {
      try {
        renderDocument(document);
      } catch (err) {
        status(`weave render failed: ${(err as Error).message}`);
      }
    } else {
      // Diagnostic dump: say what DID arrive so the widget itself tells us
      // which channels the host stripped.
      const r = result as ToolResultLike;
      const shape = [
        `keys: ${Object.keys(r).join(",") || "none"}`,
        `content: ${(r.content ?? []).map((b) => b?.type).join(",") || "empty"}`,
      ].join("; ");
      status(`weave: tool result had no document on any channel (${shape})`);
    }
  };
  // Handlers registered BEFORE connect — mandatory ordering.
  app
    .connect()
    .then(() => {
      status("weave: connected to host; waiting for tool result…");
      // Also log through the host so failures show up in its log files.
      app.sendLog({ level: "info", data: "weave view connected" }).catch(() => {});
    })
    .catch((err) => {
      console.error(err);
      status(`weave: host connection failed: ${(err as Error).message}`);
    });
}
