import { App } from "@modelcontextprotocol/ext-apps";
import { Weave } from "@shepherd-creative/weave-primitives";
import { createRoot } from "react-dom/client";
import "@shepherd-creative/weave-tokens/tokens.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("weave view: #root missing");
const root = createRoot(rootEl);

function renderSpec(spec: unknown): void {
  root.render(<Weave spec={spec as never} />);
}

// Dev/test harness: ?spec=<base64 json> renders without a host connection.
const params = new URLSearchParams(window.location.search);
const devSpec = params.get("spec");
if (devSpec) {
  renderSpec(JSON.parse(atob(devSpec)));
} else {
  const app = new App({ name: "Weave", version: "0.1.0" }, {});
  app.onerror = console.error;
  app.onteardown = async () => ({});
  app.ontoolresult = (result) => {
    const spec = (result.structuredContent as { spec?: unknown })?.spec;
    if (spec) renderSpec(spec);
  };
  // Handlers registered BEFORE connect — mandatory ordering.
  app.connect().catch(console.error);
}
