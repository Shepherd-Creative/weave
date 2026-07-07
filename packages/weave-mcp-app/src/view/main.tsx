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

function renderSpec(spec: unknown): void {
  root.render(<Weave spec={spec} />);
  status("");
}

// Surface any runtime failure in-view — inside a host there is no devtools.
window.addEventListener("error", (ev) => status(`weave view error: ${ev.message}`));
window.addEventListener("unhandledrejection", (ev) =>
  status(`weave view rejection: ${String(ev.reason)}`),
);

// Dev/test harness: ?spec=<base64 json> renders without a host connection.
const params = new URLSearchParams(window.location.search);
const devSpec = params.get("spec");
if (devSpec) {
  try {
    renderSpec(JSON.parse(atob(devSpec)));
  } catch (err) {
    rootEl.textContent = `weave dev harness: failed to parse spec: ${(err as Error).message}`;
  }
} else {
  status("weave view loaded; connecting to host…");
  const app = new App({ name: "Weave", version: "0.1.0" }, {});
  app.onerror = (err) => {
    console.error(err);
    status(`weave host error: ${err.message}`);
  };
  app.onteardown = async () => ({});
  app.ontoolresult = (result) => {
    const spec = (result.structuredContent as { spec?: unknown })?.spec;
    if (spec) {
      try {
        renderSpec(spec);
      } catch (err) {
        status(`weave render failed: ${(err as Error).message}`);
      }
    } else {
      status("weave: tool result received but no structuredContent.spec attached");
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
