# Weave MCP App with Design-Source Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/weave-mcp-app` (inline generative UI via the MCP Apps standard) with env-configured design-source theming: a validated `weave-theme.css` injected into the View and `DESIGN.md` guidance appended to the Weave skill, then expand the token contract so themes reach typography, spacing, surfaces and charts.

**Architecture:** App-first, four stages (spec: `docs/superpowers/specs/2026-07-06-mcp-app-design-source-design.md`). One stdio MCP server (esbuild-bundled) + one singlefile View bundle (vite) importing `<Weave>` from `weave-primitives`. Theme pipeline reads two env vars once at startup, validates against a `tokens.json` manifest, injects into a `<style id="weave-brand-theme">` placeholder. Verification is fully autonomous: a scripted stdio MCP client (SDK `Client` + `StdioClientTransport`) plus Playwright rendering the built View HTML. **No Claude Desktop restarts during implementation** — manual Desktop verification is documented for Pierre at the end.

**Tech Stack:** TypeScript strict, React 19, `@modelcontextprotocol/ext-apps` ^1.7.0, `@modelcontextprotocol/sdk` ^1.29.0, zod ^3.23, vite + vite-plugin-singlefile + @vitejs/plugin-react, esbuild, vitest, playwright (library API, chromium).

**Conventions:** Biome formatting (`pnpm format`), Conventional Commits, British spelling, no em dashes anywhere. Run every command with absolute paths or explicit `cd` at the start of the call (Bash cwd persists between calls). WORKTREE below = `/Users/pierregallet/Documents/weave-wt/mcp-app-design-source`.

---

## Task 0: Worktree + branch

The main checkout may be shared with a live peer session. All implementation happens in an isolated worktree.

**Files:** none (git plumbing)

- [ ] **Step 0.1: Create worktree from the main clone**

```bash
git -C /Users/pierregallet/Documents/weave worktree add /Users/pierregallet/Documents/weave-wt/mcp-app-design-source -b feat/mcp-app-design-source
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm install
```

Expected: worktree created on new branch `feat/mcp-app-design-source`; `pnpm install` completes (workspace symlinks resolve inside the worktree).

- [ ] **Step 0.2: Baseline verification**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm typecheck && pnpm test
```

Expected: 8/8 typecheck tasks pass, 43 tests pass. Do not proceed on a red baseline.

---

## Stage 1: MCP App (spec phases 0-2)

### Task 1: Harness gate — scripted stdio client against the mermaid reference

Replaces the spec's "MCPJam Phase 0 gate" for autonomous execution: prove the scripted-client approach against the known-working reference before writing new code.

**Files:**
- Create: `packages/weave-mcp-server/harness-gate.mjs` in the WORKTREE (scratch; delete before committing — node ESM resolves bare specifiers by walking up from the importing FILE's directory, so the script must live inside a workspace package to find `@modelcontextprotocol/sdk`; a scratchpad path has no node_modules chain above it)

- [ ] **Step 1.1: Write the gate script**

```js
// harness-gate.mjs — proves SDK Client over stdio against mermaid-app-mcp
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "/usr/local/bin/node",
  args: ["/Users/pierregallet/Documents/mcp-servers/mermaid-app-mcp/dist/index.js", "--stdio"],
});
const client = new Client({ name: "harness-gate", version: "0.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("tools:", tools.tools.map((t) => t.name));

const call = await client.callTool({ name: "render_mermaid", arguments: { source: "graph TD; A-->B" } });
console.log("structuredContent ok:", !!call.structuredContent);

const res = await client.readResource({ uri: "ui://render-mermaid/mcp-app.html" });
console.log("resource html length:", res.contents[0].text.length);

await client.close();
```

- [ ] **Step 1.2: Run it**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source/packages/weave-mcp-server && node harness-gate.mjs && rm harness-gate.mjs
```

Expected output: `tools: [ 'render_mermaid' ]`, `structuredContent ok: true`, `resource html length: <large number>`. **Do not proceed past this gate until it passes.**

### Task 2: Export the tool registry from weave-mcp-server

The `TOOLS` registry (`packages/weave-mcp-server/src/tools.ts`) is not on the package surface. Add a subpath export so `weave-mcp-app` reuses descriptors instead of duplicating them.

**Files:**
- Modify: `packages/weave-mcp-server/package.json`
- Modify: `packages/weave-mcp-server/tsup.config.ts`
- Test: `packages/weave-mcp-server/src/__tests__/tools-export.test.ts`

- [ ] **Step 2.1: Write the failing test**

```ts
// packages/weave-mcp-server/src/__tests__/tools-export.test.ts
import { describe, expect, it } from "vitest";
import { TOOLS, TOOLS_BY_NAME, invokeTool } from "../tools.js";

describe("tools registry surface", () => {
  it("exposes exactly the five render tools", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "render_metric_band",
      "render_chart_card",
      "render_table_card",
      "render_note_card",
      "render_dashboard",
    ]);
    expect(Object.keys(TOOLS_BY_NAME)).toHaveLength(5);
    expect(typeof invokeTool).toBe("function");
  });
});
```

- [ ] **Step 2.2: Run it** — `cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm --filter @shepherd-creative/weave-mcp-server test` — Expected: PASS (registry already exists; this pins the surface).

- [ ] **Step 2.3: Add the subpath export.** In `packages/weave-mcp-server/package.json` add:

```json
  "exports": {
    ".": { "types": "./dist/server.d.ts", "import": "./dist/server.js" },
    "./tools": { "types": "./dist/tools.d.ts", "import": "./dist/tools.js" }
  },
```

`tsup.config.ts` ALREADY builds `src/tools.ts` as its own entry (check it — reviewer confirmed a `tools: "src/tools.ts"` entry exists). Only the package.json `exports` map is missing; do not duplicate the tsup entry.

- [ ] **Step 2.4: Build + verify the subpath resolves**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm --filter @shepherd-creative/weave-mcp-server build && node -e "import('@shepherd-creative/weave-mcp-server/tools').then(m => console.log(m.TOOLS.length))" --input-type=module
```

Run the `node -e` from inside `packages/weave-mcp-server` so the self-name resolves, or verify from the new app package in Task 3 instead. Expected: `5`.

- [ ] **Step 2.5: Full package tests + commit**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm --filter @shepherd-creative/weave-mcp-server test && pnpm typecheck
git add packages/weave-mcp-server && git commit -m "feat(mcp-server): export tool registry via ./tools subpath"
```

### Task 3: Scaffold `packages/weave-mcp-app`

**Files:**
- Create: `packages/weave-mcp-app/package.json`
- Create: `packages/weave-mcp-app/tsconfig.json`
- Create: `packages/weave-mcp-app/vite.config.ts`
- Create: `packages/weave-mcp-app/mcp-app.html`
- Create: `packages/weave-mcp-app/src/view/main.tsx`
- Create: `packages/weave-mcp-app/src/server.ts` (stub, real logic Task 4)
- Create: `packages/weave-mcp-app/src/main.ts`

- [ ] **Step 3.1: package.json**

```json
{
  "name": "@shepherd-creative/weave-mcp-app",
  "version": "0.1.0",
  "private": true,
  "description": "MCP App exposing Weave render tools with inline generative UI for Claude Desktop.",
  "type": "module",
  "main": "./dist/index.js",
  "scripts": {
    "build:view": "vite build",
    "build:server": "esbuild src/main.ts --bundle --platform=node --format=esm --target=node20 --outfile=dist/index.js --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\"",
    "build:assets": "cp ../weave-skill/SKILL.md dist/weave-skill.md",
    "build": "pnpm build:view && pnpm build:server && pnpm build:assets",
    "dev": "vite build --watch",
    "serve:stdio": "node dist/index.js --stdio",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist .turbo *.tsbuildinfo"
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "^1.7.0",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@shepherd-creative/weave-mcp-server": "workspace:*",
    "@shepherd-creative/weave-primitives": "workspace:*",
    "@shepherd-creative/weave-skill": "workspace:*",
    "@shepherd-creative/weave-tokens": "workspace:*",
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "esbuild": "^0.24.0",
    "lucide-react": "^0.460.0",
    "playwright": "^1.49.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.13.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vite-plugin-singlefile": "^2.3.0",
    "vitest": "^2.1.0"
  }
}
```

Note: react/recharts/lucide are devDependencies because they only exist inside the built View bundle; the node server bundle never imports them. Versions match `weave-primitives` devDeps. If pnpm's age gate (`minimumReleaseAge`) blocks a version, tell Pierre — do not silently override.

- [ ] **Step 3.2: tsconfig.json** — extend the repo base, `jsx: "react-jsx"`, include `src`, `vite.config.ts`. Mirror `weave-mcp-server/tsconfig.json` for compiler options; add `"jsx": "react-jsx"`, `"lib": ["ES2022", "DOM"]`.

Also create `packages/weave-mcp-app/turbo.json` so cached test runs cannot replay against a stale `dist/` (this package's e2e tests execute `dist/index.js`):

```json
{
  "extends": ["//"],
  "tasks": {
    "test": { "dependsOn": ["build"], "inputs": ["src/**", "dist/**", "mcp-app.html"] }
  }
}
```

- [ ] **Step 3.3: vite.config.ts**

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    rollupOptions: { input: "mcp-app.html" },
    outDir: "dist",
    emptyOutDir: false,
    minify: true,
    cssMinify: true,
  },
});
```

- [ ] **Step 3.4: mcp-app.html** — the theme placeholder is an ELEMENT at the end of `<body>` (after vite-inlined CSS in `<head>`, so brand `:root` declarations win the cascade by source order), never an HTML comment (minification strips comments):

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Weave</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/view/main.tsx"></script>
    <style id="weave-brand-theme"></style>
  </body>
</html>
```

- [ ] **Step 3.5: src/view/main.tsx**

```tsx
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
  const app = new App({ name: "Weave", version: "0.1.0" });
  app.onerror = console.error;
  app.onteardown = async () => ({});
  app.ontoolresult = (result) => {
    const spec = (result.structuredContent as { spec?: unknown })?.spec;
    if (spec) renderSpec(spec);
  };
  // Handlers registered BEFORE connect — mandatory ordering.
  app.connect().catch(console.error);
}
```

Check `<Weave>`'s actual prop name in `packages/weave-primitives/src/renderer/Weave.tsx` before writing this file (the renderer may take `spec` under a different prop). Adjust `renderSpec` accordingly. Also read `/tmp/mcp-ext-apps/src/spec.types.ts` if any `App` API doubt arises — never invent fields (HANDOFF lesson). If `/tmp/mcp-ext-apps` is missing, clone it: `git clone https://github.com/modelcontextprotocol/ext-apps /tmp/mcp-ext-apps`.

- [ ] **Step 3.6: src/main.ts** — stdio-only (do NOT copy mermaid's HTTP branch: it imports `express` and `cors`, which are not dependencies here and would break `esbuild --bundle`; everything downstream is stdio-only per the spec):

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

createServer()
  .connect(new StdioServerTransport())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

Stub `src/server.ts` with an empty `McpServer` for now.

- [ ] **Step 3.7: Build both targets, verify outputs exist**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm install && pnpm --filter @shepherd-creative/weave-mcp-app build
ls packages/weave-mcp-app/dist/   # expect mcp-app.html and index.js
grep -c "weave-brand-theme" packages/weave-mcp-app/dist/mcp-app.html   # expect 1 (placeholder survived the build)
```

- [ ] **Step 3.8: Commit** — `git add packages/weave-mcp-app pnpm-lock.yaml && git commit -m "feat(mcp-app): scaffold package with view and server build targets"`

### Task 4: Real server — five render tools + View resource

**Files:**
- Modify: `packages/weave-mcp-app/src/server.ts`
- Test: `packages/weave-mcp-app/src/__tests__/server.e2e.test.ts`

- [ ] **Step 4.1: Write the failing e2e test** (scripted stdio client, the Task 1 harness productised)

```ts
// packages/weave-mcp-app/src/__tests__/server.e2e.test.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DIST = path.resolve(__dirname, "../../dist/index.js");

function makeClient(env: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [DIST, "--stdio"],
    env: { ...process.env, ...env } as Record<string, string>,
  });
  const client = new Client({ name: "weave-e2e", version: "0.0.0" });
  return { client, transport };
}

describe("weave-mcp-app stdio server", () => {
  const { client, transport } = makeClient();
  beforeAll(async () => {
    await client.connect(transport);
  }, 20_000);
  afterAll(async () => {
    await client.close();
  });

  it("lists the five render tools linked to the view resource", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    for (const expected of [
      "render_metric_band",
      "render_chart_card",
      "render_table_card",
      "render_note_card",
      "render_dashboard",
    ]) {
      expect(names).toContain(expected);
    }
    const metricBand = tools.find((t) => t.name === "render_metric_band");
    // ext-apps flattens the nested config to a namespaced key on the wire:
    // _meta["ui/resourceUri"] (per the ext-apps d.ts). If this assertion fails,
    // log the actual _meta object and match the observed shape — do not guess.
    const meta = metricBand?._meta as Record<string, unknown> | undefined;
    expect(meta?.["ui/resourceUri"] ?? (meta?.ui as { resourceUri?: string })?.resourceUri).toBe(
      "ui://weave/mcp-app.html",
    );
  });

  it("serves the composition skill via get_skill", async () => {
    const result = await client.callTool({ name: "get_skill", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text.length).toBeGreaterThan(500); // real SKILL.md, not an ENOENT fallback
    expect(result.isError ?? false).toBe(false);
  });

  it("returns the validated spec as structuredContent", async () => {
    const result = await client.callTool({
      name: "render_metric_band",
      arguments: { metrics: [{ label: "Revenue", value: 10000, tone: "positive" }] },
    });
    const spec = (result.structuredContent as { spec: { type: string } }).spec;
    expect(spec.type).toBe("MetricBand");
  });

  it("serves the view HTML with an empty theme placeholder by default", async () => {
    const res = await client.readResource({ uri: "ui://weave/mcp-app.html" });
    const html = (res.contents[0] as { text: string }).text;
    expect(html).toContain('id="weave-brand-theme"');
    expect(html).toContain('<style id="weave-brand-theme"></style>');
  });
});
```

Before finalising the test, check the actual `MetricBandSchema` field names in `packages/weave-primitives/src/schemas/organisms.ts` (the `metrics` item shape above is a guess — use real required fields). Also confirm how `_meta` surfaces on `tools/list` entries via the ext-apps SDK; if it lands elsewhere adjust the assertion to the observed shape rather than inventing one.

- [ ] **Step 4.2: Run it** — `pnpm --filter @shepherd-creative/weave-mcp-app test` — Expected: FAIL (server is a stub).

- [ ] **Step 4.3: Implement src/server.ts**

```ts
import fs from "node:fs/promises";
import path from "node:path";
import {
  RESOURCE_MIME_TYPE,
  registerAppResource,
  registerAppTool,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { TOOLS, invokeTool } from "@shepherd-creative/weave-mcp-server/tools";
import { z } from "zod";

// Do NOT use weave-skill's loadSkill() here: it resolves SKILL.md relative to
// import.meta.url, which points at THIS bundle after esbuild inlines it
// (ENOENT at runtime). The build copies SKILL.md into dist/ instead
// (build:assets) and we read it from DIST_DIR, keeping the bundle
// self-contained per the HANDOFF stdio lesson.
async function readSkillText(): Promise<string> {
  return fs.readFile(path.join(DIST_DIR, "weave-skill.md"), "utf-8");
}

const DIST_DIR = import.meta.filename.endsWith(".ts")
  ? path.join(import.meta.dirname, "..", "dist")
  : import.meta.dirname;

const RESOURCE_URI = "ui://weave/mcp-app.html";

export function createServer(): McpServer {
  const server = new McpServer({ name: "Weave", version: "0.1.0" });

  for (const tool of TOOLS) {
    registerAppTool(
      server,
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        // registerAppTool takes a raw zod shape; TOOLS carries full schemas.
        // Pass through the schema's shape when it is an object schema.
        inputSchema: (tool.inputSchema as z.AnyZodObject).shape,
        _meta: { ui: { resourceUri: RESOURCE_URI } },
      },
      async (args: Record<string, unknown>): Promise<CallToolResult> => {
        const spec = invokeTool(tool.name, args);
        return {
          content: [
            { type: "text", text: `Weave ${tool.name} spec:\n\`\`\`json\n${JSON.stringify(spec, null, 2)}\n\`\`\`` },
          ],
          structuredContent: { spec },
        };
      },
    );
  }

  server.registerTool(
    "get_skill",
    {
      description:
        "Returns the Weave composition skill: how to choose and compose the render_* tools. Call before composing a dashboard.",
      inputSchema: {},
    },
    async () => ({ content: [{ type: "text", text: await readSkillText() }] }),
  );

  registerAppResource(
    server,
    RESOURCE_URI,
    RESOURCE_URI,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      const html = await fs.readFile(path.join(DIST_DIR, "mcp-app.html"), "utf-8");
      return {
        contents: [
          {
            uri: RESOURCE_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: html,
            _meta: { ui: { prefersBorder: true } },
          },
        ],
      };
    },
  );

  return server;
}
```

Two verification points while implementing: (a) `render_dashboard`'s `inputSchema` is a discriminated union, not an object — `(tool.inputSchema as z.AnyZodObject).shape` will not work for it. First check what `registerAppTool` accepts (read `/tmp/mcp-ext-apps/src/`): if it accepts a full Zod schema, pass `tool.inputSchema` directly for all five and delete the cast. If it only accepts a raw ZodRawShape, the sanctioned fallback for `render_dashboard` is a loose passthrough shape (`{ type: z.string(), children: z.unknown().optional() }` plus `.passthrough()` semantics via accepting extra args) whose handler ignores the shape's own parse and lets `invokeTool` perform the real discriminated-union validation and depth cap — the tool result is what matters, and `invokeTool` already rejects invalid specs. Resolve by reading, not guessing, and note which path was taken in the commit message. (b) `invokeTool` already applies the dashboard depth cap and Zod validation; surface thrown `ZodError`/`DepthLimitError` as MCP tool errors (`isError: true` with the message) rather than crashing the server:

```ts
        try {
          const spec = invokeTool(tool.name, args);
          return { content: [...], structuredContent: { spec } };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Invalid ${tool.name} input: ${(err as Error).message}` }],
            isError: true,
          };
        }
```

- [ ] **Step 4.4: Build + run the e2e test**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm --filter @shepherd-creative/weave-mcp-app build && pnpm --filter @shepherd-creative/weave-mcp-app test
```

Expected: PASS (4 tests). The test runs against `dist/index.js`, so build first, always.

- [ ] **Step 4.5: Commit** — `git commit -am "feat(mcp-app): register five render tools, get_skill and ui:// view resource"`

### Task 5: View render proof (Playwright)

**Files:**
- Create: `packages/weave-mcp-app/src/__tests__/view.e2e.test.ts`
- Create: `packages/weave-mcp-app/src/__tests__/fixtures/dashboard-spec.json`

- [ ] **Step 5.1: Install chromium** — `cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm --filter @shepherd-creative/weave-mcp-app exec playwright install chromium` (one-off, ~120MB).

- [ ] **Step 5.2: Fixture** — a saved dashboard spec exercising MetricBand + ChartCard + TableCard + NoteCard in a Grid. Copy a valid example from `packages/weave-skill/SKILL.md` or compose one and validate it with `SpecSchema.parse` in the test itself so drift fails loudly.

- [ ] **Step 5.3: Write the test** (vitest + playwright library; load `dist/mcp-app.html` via `file://` with the `?spec=` dev param):

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser } from "playwright";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const HTML = path.resolve(__dirname, "../../dist/mcp-app.html");
const spec = JSON.parse(readFileSync(path.resolve(__dirname, "fixtures/dashboard-spec.json"), "utf8"));

describe("view renders a weave spec standalone", () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser.close();
  });

  it("renders primitives and consumes token variables", async () => {
    const page = await browser.newPage();
    const b64 = Buffer.from(JSON.stringify(spec)).toString("base64");
    await page.goto(`file://${HTML}?spec=${encodeURIComponent(b64)}`);
    await page.waitForSelector("#root *", { timeout: 10_000 });
    // A KPI label from the fixture is visible
    await expect(page.getByText("Revenue").first()).toBeVisible();
    // Default token applied (dark background from tokens.css)
    const bg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--background").trim(),
    );
    expect(bg).toBe("#09090b");
    await page.close();
  });
});
```

Note: `expect(...).toBeVisible()` is @playwright/test syntax — with the library API assert via `await page.getByText("Revenue").first().isVisible()` and `expect(visible).toBe(true)`. Write it the library way from the start. If `file://` + query param proves flaky, serve `dist/` with a throwaway `node:http` static server inside the test instead.

- [ ] **Step 5.4: Run** — `pnpm --filter @shepherd-creative/weave-mcp-app test` — Expected: PASS. If recharts blows the singlefile bundle or crashes under `file://`, note it and fix before proceeding (spec risk item).

- [ ] **Step 5.5: Full verification + commit**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm typecheck && pnpm test && pnpm format
git add -A packages/weave-mcp-app && git commit -m "test(mcp-app): playwright proof that the view renders specs standalone"
```

**STAGE 1 GATE:** stdio e2e green, view render green, whole-repo typecheck + tests green.

---

## Stage 2: Theme pipeline

### Task 6: Token manifest in weave-tokens

**Files:**
- Create: `packages/weave-tokens/tokens.json`
- Modify: `packages/weave-tokens/package.json` (add `"./tokens.json": "./tokens.json"` to exports and `tokens.json` to files)
- Test: `packages/weave-mcp-app/src/__tests__/manifest.test.ts`

- [ ] **Step 6.1: Write the failing sync test** — parses `tokens.css` custom properties with a regex, asserts every one appears in `tokens.json` and vice versa:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const tokensDir = path.resolve(__dirname, "../../../weave-tokens");
const css = readFileSync(path.join(tokensDir, "tokens.css"), "utf8");
const manifest = JSON.parse(readFileSync(path.join(tokensDir, "tokens.json"), "utf8"));

describe("tokens.json manifest", () => {
  it("matches tokens.css exactly", () => {
    const cssVars = [...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]);
    const manifestVars = manifest.variables.map((v: { name: string }) => v.name);
    expect(new Set(manifestVars)).toEqual(new Set(cssVars));
  });
});
```

- [ ] **Step 6.2: Write tokens.json** — `{ "version": 1, "variables": [{ "name": "--background", "category": "structural" }, ...] }` covering every variable currently in `tokens.css` (structural, tones, chart, typography categories).

- [ ] **Step 6.3: Run test (PASS), commit** — `git add packages/weave-tokens packages/weave-mcp-app && git commit -m "feat(tokens): machine-readable tokens.json manifest"`

### Task 7: Theme validator (TDD)

**Files:**
- Create: `packages/weave-mcp-app/src/theme.ts`
- Test: `packages/weave-mcp-app/src/__tests__/theme.test.ts`

- [ ] **Step 7.1: Write the failing test matrix**

```ts
import { describe, expect, it } from "vitest";
import { validateThemeCss } from "../theme.js";

const KNOWN = new Set(["--background", "--foreground", "--tone-positive"]);

describe("validateThemeCss", () => {
  it("accepts a plain :root block of known variables", () => {
    const r = validateThemeCss(":root { --background: #fff; --foreground: #111; }", KNOWN);
    expect(r.ok).toBe(true);
    expect(r.css).toContain("--background: #fff");
    expect(r.stripped).toEqual([]);
  });
  it("strips unknown variables with a warning", () => {
    const r = validateThemeCss(":root { --background: #fff; --nope: red; }", KNOWN);
    expect(r.ok).toBe(true);
    expect(r.css).not.toContain("--nope");
    expect(r.stripped).toEqual(["--nope"]);
  });
  it("rejects @import, url() and non-:root blocks", () => {
    for (const bad of [
      "@import url(evil.css); :root { --background: #fff; }",
      ":root { --background: url(http://x/y.png); }",
      ".weave { color: red; }",
      ":root { --background: #fff; } body { margin: 0 }",
    ]) {
      expect(validateThemeCss(bad, KNOWN).ok).toBe(false);
    }
  });
  it("strips comments and tolerates whitespace", () => {
    const r = validateThemeCss("/* brand */\n:root {\n  --background: #fff; /* bg */\n}\n", KNOWN);
    expect(r.ok).toBe(true);
  });
  it("rejects dangerous values", () => {
    expect(validateThemeCss(":root { --background: expression(alert(1)); }", KNOWN).ok).toBe(false);
    expect(validateThemeCss(":root { --background: javascript:x; }", KNOWN).ok).toBe(false);
    expect(validateThemeCss(":root { --background: </style><script>; }", KNOWN).ok).toBe(false);
  });
});
```

- [ ] **Step 7.2: Run (FAIL: module missing)**

- [ ] **Step 7.3: Implement**

```ts
// packages/weave-mcp-app/src/theme.ts
export type ThemeValidation = {
  ok: boolean;
  css: string;          // sanitised CSS (empty when !ok)
  applied: string[];    // variable names kept
  stripped: string[];   // unknown variable names removed
  errors: string[];     // hard-reject reasons
};

const DECLARATION = /^(--[a-z0-9-]+)\s*:\s*([^;{}]+)$/i;
const FORBIDDEN_VALUE = /(url\s*\(|expression\s*\(|javascript:|<|>)/i;

/** Deterministic restricted-subset validator: comments + :root blocks of custom properties only. */
export function validateThemeCss(source: string, knownVars: ReadonlySet<string>): ThemeValidation {
  const errors: string[] = [];
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  // Everything must be zero or more `:root { ... }` blocks.
  const blockRe = /:root\s*\{([^{}]*)\}/g;
  const rest = noComments.replace(blockRe, " ").trim();
  if (rest.length > 0) errors.push(`unsupported content outside :root blocks: "${rest.slice(0, 80)}"`);

  const applied: string[] = [];
  const stripped: string[] = [];
  const kept: string[] = [];
  for (const block of noComments.matchAll(blockRe)) {
    for (const raw of block[1].split(";")) {
      const decl = raw.trim();
      if (!decl) continue;
      const m = decl.match(DECLARATION);
      if (!m) {
        errors.push(`not a custom-property declaration: "${decl.slice(0, 80)}"`);
        continue;
      }
      const [, name, value] = m;
      if (FORBIDDEN_VALUE.test(value)) {
        errors.push(`forbidden value for ${name}`);
        continue;
      }
      if (!knownVars.has(name)) {
        stripped.push(name);
        continue;
      }
      applied.push(name);
      kept.push(`  ${name}: ${value.trim()};`);
    }
  }
  if (errors.length > 0) return { ok: false, css: "", applied: [], stripped, errors };
  return { ok: true, css: kept.length ? `:root {\n${kept.join("\n")}\n}` : "", applied, stripped, errors };
}
```

- [ ] **Step 7.4: Run (PASS), commit** — `git commit -am "feat(mcp-app): deterministic theme CSS validator"`

### Task 8: Design-source loading + injection + guidance

**Files:**
- Modify: `packages/weave-mcp-app/src/theme.ts` (add `loadDesignSources`)
- Modify: `packages/weave-mcp-app/src/server.ts`
- Modify: `packages/weave-mcp-app/src/main.ts` (read sources at init, pass into `createServer`)
- Test: `packages/weave-mcp-app/src/__tests__/design-sources.test.ts`

- [ ] **Step 8.1: Failing tests** for `loadDesignSources(env)`: returns `{ themeCss, guidance, diagnostics }`; missing env → both null, no diagnostics; unreadable path → null + diagnostic naming file and rule; valid theme file → sanitised css; guidance over 16KB → null + diagnostic; valid guidance → text. Also `injectTheme(html, css)`: replaces `<style id="weave-brand-theme"></style>` content, idempotent for empty css.

```ts
export function injectTheme(html: string, themeCss: string | null): string {
  if (!themeCss) return html;
  return html.replace(
    '<style id="weave-brand-theme"></style>',
    `<style id="weave-brand-theme">\n${themeCss}\n</style>`,
  );
}
```

Guard: if the placeholder is missing from `dist/mcp-app.html` (build regression), `injectTheme` must throw so the e2e catches it, and the Task 3 `grep -c` check exists for the same reason.

- [ ] **Step 8.2: Implement `loadDesignSources`** — sync reads at startup (`node:fs readFileSync`), knownVars built from `tokens.json` (import the manifest; esbuild bundles JSON — requires `"resolveJsonModule": true` in the Step 3.2 tsconfig, or read it with `readFileSync` + a copied `dist/` asset like SKILL.md; pick one and be consistent). 16KB cap on guidance. Every failure appends a `diagnostics` entry `"<file>: <reason>; falling back to default"` and logs to stderr via `console.error` (stdout is the JSON-RPC channel — never write logs to stdout in a stdio server).

- [ ] **Step 8.3: Wire into `createServer`**:
  - read sources once at module init in `main.ts` and pass into `createServer({ themeCss, guidance })`;
  - resource handler returns `injectTheme(html, themeCss)`;
  - `get_skill` returns `await readSkillText()` + (guidance ? `\n\n---\n\n## Brand composition guidance (host-configured)\n\n${guidance}` : "") — NEVER `loadSkill()`, which ENOENTs after esbuild inlining (see Task 4 comment);
  - when guidance is configured, append one sentence to each render tool description: `" Brand composition guidance is configured for this host; call get_skill before composing."`

- [ ] **Step 8.4: E2E theme test** (extend `server.e2e.test.ts`): spawn a second client with `env: { WEAVE_THEME_CSS_PATH: fixturePath, WEAVE_DESIGN_GUIDANCE_PATH: guidancePath }` pointing at `src/__tests__/fixtures/brand/weave-theme.css` (light theme: `--background: #ffffff` etc) and `fixtures/brand/DESIGN.md`. Assert: `resources/read` HTML contains `--background: #ffffff` inside `#weave-brand-theme`; `get_skill` result contains the guidance heading; tool descriptions mention get_skill.

- [ ] **Step 8.5: Playwright override test** (extend `view.e2e.test.ts`): write a temp copy of `dist/mcp-app.html` with `injectTheme` applied, load with the same `?spec=`, assert `getComputedStyle(document.documentElement).getPropertyValue("--background")` is `#ffffff` — proves cascade order actually lets the brand win.

- [ ] **Step 8.6: Verify + commit**

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm --filter @shepherd-creative/weave-mcp-app build && pnpm typecheck && pnpm test
git add -A && git commit -m "feat(mcp-app): env-configured design sources with validated theme injection and skill guidance"
```

**STAGE 2 GATE:** default run unchanged; themed run provably overrides in a real browser; all diagnostics paths tested.

---

## Stage 3: Full contract expansion

### Task 9: Contract v2 variables in tokens.css + tokens.json

**Files:**
- Modify: `packages/weave-tokens/tokens.css`
- Modify: `packages/weave-tokens/tokens.json`

- [ ] **Step 9.1: Audit current literals** (ground truth for defaults):

```bash
grep -rnE "(#[0-9a-fA-F]{3,8}\b|[0-9.]+(px|rem|em|cqi)|fontWeight|boxShadow|letterSpacing)" /Users/pierregallet/Documents/weave-wt/mcp-app-design-source/packages/weave-primitives/src --include="*.tsx" --include="*.ts" | grep -v __tests__
```

- [ ] **Step 9.2: Add the v2 section.** New variables, defaults equal to current hard-coded values (from `utils/style.ts` and the audit). Committed scope:

```css
  /* --- Typography scale (v2) --- */
  --weave-font-size-xs: 0.75rem;
  --weave-font-size-sm: 0.875rem;
  --weave-font-size-md: 1rem;
  --weave-font-size-lg: 1.125rem;
  --weave-font-size-xl: 1.25rem;
  --weave-font-size-number-md: 1.5rem;
  --weave-font-size-number-lg: 2.25rem;
  --weave-font-size-number-xl: clamp(1.75rem, 8cqi, 3.25rem);
  --weave-font-size-display: clamp(1.5rem, 6cqi, 2.5rem);
  --weave-font-size-overline: 0.6875rem;
  --weave-font-weight-normal: 400;
  --weave-font-weight-medium: 500;
  --weave-font-weight-semibold: 600;
  --weave-font-weight-bold: 700;
  --weave-line-height-tight: 1.2;
  --weave-line-height-normal: 1.5;

  /* --- Spacing and density (v2) --- */
  --weave-space-xs: 0.125rem;
  --weave-space-sm: 0.5rem;
  --weave-space-md: 0.75rem;
  --weave-space-lg: 1rem;
  --weave-space-xl: 1.5rem;
  --weave-card-padding: 1rem;
  --weave-density-compact: 0.5rem;
  --weave-density-comfortable: 1rem;
  --weave-density-spacious: 1.5rem;

  /* --- Surfaces (v2) --- */
  --weave-card-border-width: 1px;
  --weave-card-shadow: none;
  --weave-radius-sm: calc(var(--radius) - 0.25rem);
  --weave-radius-md: var(--radius);
  --weave-radius-lg: calc(var(--radius) + 0.25rem);

  /* --- Chart treatment (v2) --- */
  --weave-chart-grid: var(--border);
  --weave-chart-axis: var(--muted-foreground);
  --weave-chart-label: var(--muted-foreground);
  --weave-chart-tooltip-bg: var(--card);
  --weave-chart-tooltip-fg: var(--card-foreground);
```

Adjust names/defaults to what the Step 9.1 audit actually shows (spec allows finalising the exact list here) — but keep the five categories and update `tokens.json` in the same commit so the Task 6 sync test stays green.

- [ ] **Step 9.3: Run manifest test, commit** — `git commit -am "feat(tokens): contract v2 — typography, spacing, surfaces, chart treatment"`

### Task 10: De-hardcode `utils/style.ts`

**Files:**
- Modify: `packages/weave-primitives/src/utils/style.ts`

- [ ] **Step 10.1:** Wrap every returned literal in `var(--weave-*, <old literal>)` (chained where an old token exists), e.g.:

```ts
export function numberFontSize(size: Size | undefined): string {
  switch (size) {
    case "xs": return "var(--weave-font-size-xs, 0.75rem)";
    case "sm": return "var(--weave-font-size-sm, 0.875rem)";
    case "md": return "var(--weave-font-size-number-md, 1.5rem)";
    case "lg": return "var(--weave-font-size-number-lg, 2.25rem)";
    case "xl": return "var(--weave-font-size-number-xl, clamp(1.75rem, 8cqi, 3.25rem))";
    default:   return "var(--weave-font-size-number-md, 1.5rem)";
  }
}
```

Same pattern for `labelFontSize`, `gapValue`, `densityPadding`. `labelRoleStyle` fontWeights become `var(--weave-font-weight-*, N)` strings — change the return type from `number` to `string` and fix call sites (React accepts string fontWeight). **`iconPixelSize` and `chartHeight` stay numeric** (consumed as numeric props by lucide/recharts) — document this exclusion in the tokens README (Task 13).

- [ ] **Step 10.2:** `pnpm --filter @shepherd-creative/weave-primitives test && pnpm typecheck` — Expected: existing tests pass (jsdom does not resolve `var()`, so tests asserting inline style strings may need updating to the new `var(...)` strings — update assertions to match, the visual default is unchanged by construction).

- [ ] **Step 10.3: Commit** — `git commit -am "feat(primitives): route style.ts scales through contract v2 variables"`

### Task 11: De-hardcode component inline literals + chart treatment

**Files:**
- Modify: all 13 component files (`atoms/{Icon,Label,Number}.tsx`, `layouts/{Grid,Stack}.tsx`, `molecules/{Chart,DataRow,KPI,Stat}.tsx`, `organisms/{ChartCard,MetricBand,NoteCard,TableCard}.tsx`)
- Modify: `packages/weave-primitives/src/utils/theme.ts`

- [ ] **Step 11.1: theme.ts chart helper** — add chained resolution for recharts (which cannot take `var()`):

```ts
/** Resolve the first defined CSS variable in the list, else the fallback. */
export function resolveFirstVar(varNames: string[], fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const rootStyle = getComputedStyle(document.documentElement);
  for (const name of varNames) {
    const v = rootStyle.getPropertyValue(name).trim();
    if (v.length > 0) return v;
  }
  return fallback;
}
```

In `Chart.tsx`: `gridColor = resolveFirstVar(["--weave-chart-grid", "--border"], "#27272a")`, same for axis/tick (`--weave-chart-axis`), tooltip bg/fg (`--weave-chart-tooltip-*`). Note the v2 defaults like `--weave-chart-grid: var(--border)` resolve through `getComputedStyle`, which returns the substituted value — verify one case in a playwright assertion (Task 12).

- [ ] **Step 11.2: Component sweep.** In each component file replace inline literals per this mapping (example from `ChartCard.tsx`):

| Before | After |
|---|---|
| `gap: "0.75rem"` | `gap: "var(--weave-space-md, 0.75rem)"` |
| `padding: "1rem"` | `padding: "var(--weave-card-padding, 1rem)"` |
| `border: "1px solid var(--border)"` | `border: "var(--weave-card-border-width, 1px) solid var(--border)"` |
| `borderRadius: "var(--radius)"` | `borderRadius: "var(--weave-radius-md, var(--radius))"` |
| `fontSize: "0.875rem"` | `fontSize: "var(--weave-font-size-sm, 0.875rem)"` |
| `fontWeight: 600` | `fontWeight: "var(--weave-font-weight-semibold, 600)"` |
| card roots also gain | `boxShadow: "var(--weave-card-shadow, none)"` |

Every replacement keeps the old literal as the fallback. Work file by file; run `pnpm --filter @shepherd-creative/weave-primitives test` after each file.

- [ ] **Step 11.3: Commit** — one commit per 3-4 files is fine; message pattern `feat(primitives): contract v2 variables in <files>`.

### Task 12: Orphan-literal lint test + browser sanity

**Files:**
- Create: `packages/weave-primitives/src/__tests__/no-orphan-literals.test.ts`
- Modify: `packages/weave-mcp-app/src/__tests__/view.e2e.test.ts`

- [ ] **Step 12.1:** Lint-style test: read all component sources, regex for `#hex`, `\d(px|rem|em)` and numeric `fontWeight` occurrences NOT inside a `var(` fallback and not in the allowlist (`iconPixelSize`/`chartHeight` numerics, test files, schema files). Implementation detail: strip all `var(...)` spans (balanced-paren scan, they nest) from each source first, then assert the remainder contains no literals. The allowlist must also cover string fallback ARGUMENTS passed to `resolveCSSVar(...)` and `resolveFirstVar(...)` (e.g. `resolveFirstVar([...], "#27272a")` in Chart.tsx is sanctioned — it IS a fallback); strip those call spans the same way as `var(...)` spans. Fail with file:line listing.

- [ ] **Step 12.2:** Extend the playwright themed test: brand fixture sets `--weave-card-padding: 2rem` and `--weave-chart-grid: #ff0000`; assert a card's computed `padding` is `32px`, proving end-to-end reach of v2 variables (and, with the chart fixture, that `resolveFirstVar` picks up the override).

- [ ] **Step 12.3:** Full verification + commit:

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm --filter @shepherd-creative/weave-mcp-app build && pnpm typecheck && pnpm test && pnpm format
git add -A && git commit -m "test(primitives,mcp-app): orphan-literal guard and themed computed-style proofs"
```

**STAGE 3 GATE:** orphan-literal test green over all 13 components, default rendering unchanged (fallbacks equal old literals), themed padding/chart assertions green.

---

## Stage 4: Demo themes, acceptance, docs, PR

### Task 13: Two demo brands

**Files:**
- Create: `examples/themes/corporate-light/weave-theme.css` + `DESIGN.md`
- Create: `examples/themes/terminal-dense/weave-theme.css` + `DESIGN.md`

- [ ] **Step 13.1:** `corporate-light`: white surfaces, navy primary, serif display font stack, generous spacing (`--weave-card-padding: 1.5rem`), soft shadow, muted pastel chart palette, radius 0.75rem. `DESIGN.md`: low density, lead with a single hero KPI, prefer line charts, restrained tone, no more than two charts per dashboard.
- [ ] **Step 13.2:** `terminal-dense`: near-black background, monospace everywhere (`--font-sans` set to the mono stack), zero radius, 1px hairline borders, compact spacing, saturated green/amber chart palette. `DESIGN.md`: high density, tables over charts, terse labels, uppercase overlines.
- [ ] **Step 13.3:** Both must pass the validator: add a test in `design-sources.test.ts` iterating `examples/themes/*/weave-theme.css` and asserting `validateThemeCss(...).ok === true` with zero stripped vars.
- [ ] **Step 13.4: Commit** — `git commit -am "feat(examples): corporate-light and terminal-dense demo brand themes"`

### Task 14: Three-theme acceptance test

**Files:**
- Create: `packages/weave-mcp-app/src/__tests__/acceptance.e2e.test.ts`

- [ ] **Step 14.1:** For each of [default, corporate-light, terminal-dense]: inject theme into built HTML, render the SAME `fixtures/dashboard-spec.json` in chromium, screenshot to `dist/acceptance/<name>.png`, and record computed styles (root `--background`, a card's `background-color`, `padding`, `font-family`).
- [ ] **Step 14.2:** Assert the three computed-style tuples are pairwise different (materially different looks, zero spec changes — the spec's success criterion, mechanically checked).
- [ ] **Step 14.3:** Run, eyeball the three PNGs (Read them — they are the taste check, not just the assertions), fix anything that looks broken, commit — `git commit -am "test(mcp-app): three-theme acceptance proof"`.

### Task 15: Docs + manual Claude Desktop verification guide

**Files:**
- Create: `packages/weave-mcp-app/README.md`
- Modify: `packages/weave-tokens/README.md` (contract v2 table: variable, category, default, consumed-by; note numeric exclusions)
- Modify: `README.md` (root: add weave-mcp-app to package list)
- Modify: `HANDOFF.md` (status update: phases 0-2 done via autonomous harness, theming shipped, Desktop verification pending)
- Modify: `docs/future-directions/design-source-integration.md` (status line: implemented by this work, link spec)

- [ ] **Step 15.1:** `weave-mcp-app/README.md` must include the Claude Desktop install block (node path + `dist/index.js --stdio` config JSON, per HANDOFF), the two env vars with an example pointing at `examples/themes/corporate-light/`, theme-authoring rules (restricted subset, contract link), diagnostics behaviour, and the **manual verification checklist for Pierre**: fresh chat, tool-direct prompt (never name the server), expect inline metric band, then flip `WEAVE_THEME_CSS_PATH` between demo brands and re-verify. Restart Claude Desktop between config changes.
- [ ] **Step 15.2: Commit** — `git commit -am "docs: mcp-app install guide, contract v2 reference, handoff update"`

### Task 16: Changesets, final verification, PR

- [ ] **Step 16.1:** Changesets: `minor` for `@shepherd-creative/weave-tokens` (contract v2) and `@shepherd-creative/weave-primitives` (var()-routing), `patch` for `@shepherd-creative/weave-mcp-server` (tools subpath export). None for the private app package. `pnpm changeset` non-interactively: write the markdown files directly into `.changeset/`.
- [ ] **Step 16.2:** Full verification, quote output:

```bash
cd /Users/pierregallet/Documents/weave-wt/mcp-app-design-source && pnpm build && pnpm typecheck && pnpm test
pnpm format
pnpm lint; echo "lint exit: $?"
```

Keep the lines separate — an `||` chain would let a build failure be masked by a green format run. `pnpm lint` has ~44 pre-existing errors in weave-primitives — compare against `main`'s count; only NEW errors block (run `pnpm format` first, hand-fix what it can't).

- [ ] **Step 16.3:** Push + PR (pre-authorised: feature branch created this session, non-destructive):

```bash
git -C /Users/pierregallet/Documents/weave-wt/mcp-app-design-source push -u origin feat/mcp-app-design-source
gh pr create --repo Shepherd-Creative/weave --base main --title "feat: MCP App with design-source theming" --body "<summary + spec link + verification evidence + manual Desktop checklist pointer>"
```

- [ ] **Step 16.4:** Do NOT merge. Do NOT tear down the worktree (Pierre reviews first; teardown happens from the main clone after merge).

---

## Explicitly Out of Scope

Runtime theme switching, multi-brand registries, format-adapter CLI, old MCP App phases 3-4 polish (spec inspector, fullscreen, recharts tree-shaking beyond keeping the bundle loadable), touching `weave-mcp-server` HTTP behaviour, Claude Desktop config edits or restarts during implementation, cloudflared cleanup.
