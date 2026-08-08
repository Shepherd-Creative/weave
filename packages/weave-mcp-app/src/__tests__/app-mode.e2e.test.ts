import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { type Browser, chromium } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// App-mode proof: drives the built view through the MCP Apps postMessage
// protocol the way a real host does (ui/initialize handshake, then a
// ui/notifications/tool-result), instead of the ?document= dev harness. This is
// the path Claude Desktop exercises — the dev harness never runs there.
//
// Hosts differ in what they forward: Claude Desktop was observed (2026-07-07)
// stripping structuredContent from the tool-result notification, which made
// the widget silently blank. Each case below delivers the document on a different
// channel; all three must render.

const HTML = path.resolve(__dirname, "../../dist/mcp-app.html");
const rawDocument = readFileSync(
  path.resolve(__dirname, "fixtures/dashboard-document.json"),
  "utf8",
);
const weaveDocument = JSON.parse(rawDocument);

const CONTENT_TEXT = `Weave render_dashboard document:\n\`\`\`json\n${JSON.stringify(weaveDocument, null, 2)}\n\`\`\``;

const CASES = [
  {
    name: "spec-compliant host: structuredContent.document",
    result: {
      content: [{ type: "text", text: "document attached" }],
      structuredContent: { document: weaveDocument },
    },
  },
  {
    name: "structuredContent-stripping host: _meta[weave/document]",
    result: {
      content: [{ type: "text", text: "document attached" }],
      _meta: { "weave/document": weaveDocument },
    },
  },
  {
    name: "meta-and-structuredContent-stripping host: fenced json in content",
    result: { content: [{ type: "text", text: CONTENT_TEXT }] },
  },
];

function hostPage(resultJson: string): string {
  return `<!doctype html>
<html><body style="margin:0">
<iframe id="app" src="./mcp-app.html" style="width:1200px;height:800px;border:0"></iframe>
<script>
  const iframe = document.getElementById("app");
  const send = (msg) => iframe.contentWindow.postMessage(msg, "*");
  window.addEventListener("message", (ev) => {
    if (ev.source !== iframe.contentWindow) return;
    const msg = ev.data;
    if (msg.method === "ui/initialize" && msg.id !== undefined) {
      send({ jsonrpc: "2.0", id: msg.id, result: {
        protocolVersion: msg.params.protocolVersion,
        hostInfo: { name: "host-emu", version: "0.0.0" },
        hostCapabilities: {},
        hostContext: { theme: "dark", displayMode: "inline", platform: "desktop" },
      }});
    }
    if (msg.method === "ui/notifications/initialized") {
      send({ jsonrpc: "2.0", method: "ui/notifications/tool-result", params: ${resultJson} });
    }
  });
</script>
</body></html>`;
}

describe("view renders through the MCP Apps host protocol", () => {
  let browser: Browser;
  let dir: string;

  beforeAll(async () => {
    browser = await chromium.launch();
    dir = mkdtempSync(path.join(tmpdir(), "weave-app-mode-"));
    writeFileSync(path.join(dir, "mcp-app.html"), readFileSync(HTML));
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it.each(CASES)("$name", async ({ name, result }) => {
    const hostPath = path.join(dir, `host-${CASES.findIndex((c) => c.name === name)}.html`);
    writeFileSync(hostPath, hostPage(JSON.stringify(result)));

    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));
    await page.goto(`file://${hostPath}`);

    const frame = page.frames().find((f) => f.url().includes("mcp-app.html"));
    expect(frame).toBeDefined();
    if (!frame) return;

    // The dashboard fixture's KPI label renders once the spec lands.
    await frame.waitForSelector("#root .recharts-surface", { timeout: 15_000 });
    const revenueVisible = await frame.getByText("Revenue", { exact: true }).isVisible();
    expect(revenueVisible).toBe(true);

    // The status line must clear on successful render.
    const statusText = await frame.evaluate(
      () => document.getElementById("weave-status")?.textContent ?? "",
    );
    expect(statusText).toBe("");
    expect(pageErrors).toEqual([]);

    await page.close();
  });
});
