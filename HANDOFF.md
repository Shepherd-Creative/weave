# Handoff: Wrap Weave as an MCP App for Claude Desktop

**Generated**: 2026-05-04 (updated 2026-05-05, 2026-07-06)
**Branch**: `main`
**Status**: MCP App wrap — Planned, not started (unchanged this update). Reference implementation (`mermaid-app-mcp`) is shipped and working. **Test harness decision made: MCPJam Inspector** (see Key Decisions). Separately: Claude Code / Codex project scaffolding — **done 2026-07-06** (see its own section below).

## Goal

Wrap weave as an MCP App with **inline generative UI** in Claude Desktop. Each `render_*` tool returns a Weave spec **and** an `ui://` resource that renders it interactively in the chat (instead of just text/JSON).

For a separate, unscheduled proposal covering `DESIGN.md` and brand-CSS integration, see [`docs/future-directions/design-source-integration.md`](docs/future-directions/design-source-integration.md). That proposal is not part of the MCP App phases below unless it is explicitly added to scope.

## Completed (preceding work this handoff builds on)

- [x] **Researched MCP-Apps spec** (Anthropic, Jan 2026, SEP-1865) — see `modelcontextprotocol/ext-apps` repo, `apps.extensions.modelcontextprotocol.io/api/`
- [x] **Installed the `mcp-apps` plugin** with 4 skills: `create-mcp-app`, `add-app-to-server`, `convert-web-app`, `migrate-oai-app`
- [x] **Built a reference MCP App** at `~/Documents/mcp-servers/mermaid-app-mcp/` — vanilla TS, vite-plugin-singlefile bundle, esbuild stdio bundle, full toolbar polish (Send-to-Claude, Copy SVG, Download PNG, Fullscreen, Pan/Zoom)
- [x] **Verified end-to-end in Claude Desktop** — `mermaid-app` registered via stdio in `claude_desktop_config.json`, tool fires, inline UI renders
- [x] **Set up cloudflared quick tunnel** for HTTP transport — **subsequently abandoned**, see Failed Approaches
- [x] **Analysed weave codebase** for MCP-App suitability (subagent report)
- [x] **Picked dev-test harness: MCPJam Inspector** (`@mcpjam/inspector` v2.4.3, published 2026-04-28) — replaces tunnel-based testing entirely
- [x] **Set up Claude Code / Codex project scaffolding** (2026-07-06) — unrelated tangent, see its own section below

## Not Yet Done (this handoff's actual work)

- [ ] **Phase 0 — Validate MCPJam against `mermaid-app-mcp`** (the proven-working reference). Install `@mcpjam/inspector`, point it at `node ~/Documents/mcp-servers/mermaid-app-mcp/dist/index.js --stdio`, render a Mermaid diagram. **Don't proceed past Phase 0 until MCPJam shows the inline view correctly** — confirms the harness works before introducing new code.
- [ ] **Phase 1 — Skeleton**: new workspace package `packages/weave-mcp-app`, mirror mermaid-app-mcp shape, stdio entry, empty View. Verify in MCPJam first, then in Claude Desktop.
- [ ] **Phase 2 — Real renderer**: View imports `<Weave>` from `weave-primitives` (workspace), loads `weave-tokens/tokens.css`, renders spec from `app.ontoolresult`
- [ ] **Phase 3 — Interactivity**: spec inspector (split-pane editor), chart variant switcher, theme toggle, send-back-to-Claude
- [ ] **Phase 4 — Polish**: `prefersBorder: true`, fullscreen via `app.requestDisplayMode`, `validate_spec` + `get_skill` tools, tree-shake recharts
- [ ] **Cleanup (open question for user)**: tear down stale cloudflared setup — kill leftover daemons, delete the named tunnel `mcp-app` from Cloudflare Zero Trust dashboard, remove `~/.cloudflared/config.yml.named-tunnel-bak` + creds JSON, delete dead CNAME `mcp-app.brandiron.co.za` from HostServ Zone Editor.

## Failed Approaches (Don't Repeat These)

### `tsx`-at-runtime for stdio install — **the big one**
Initial mermaid-app config pointed Claude Desktop at `tsx main.ts --stdio`. **First call worked, every call after EPERM'd.**

```
Error: EPERM: operation not permitted, open '.../node_modules/tsx/dist/cli.mjs'
Server transport closed unexpectedly
```

Claude Desktop's macOS sandbox blocks the tsx loader-worker fork on subsequent module reads under `~/Documents`. User-visible symptom: "connector not found" toasts; Developer settings still shows the server as `running`.

**Fix:** pre-bundle `main.ts` + `server.ts` into a single self-contained `dist/index.js` with esbuild, point Claude Desktop at `node /…/dist/index.js --stdio`. **Always pre-bundle for stdio install.** tsx is fine for `npm run dev` HTTP transport — never for the stdio config entry. Codified in `~/.claude/projects/-Users-pierregallet/memory/feedback_mcp_stdio_bundle.md`.

### `cloudflared` named tunnel with non-Cloudflare DNS
Created a named tunnel `mcp-app` with CNAME `mcp-app.brandiron.co.za → cfb8e181-….cfargotunnel.com` on HostServ DNS. Tunnel registered all 4 edge connections cleanly, but DNS unreachable end-to-end. **Why:** `cfargotunnel.com` is a Cloudflare-private hostname that only resolves through Cloudflare's authoritative DNS. brandiron.co.za is on HostServ → public resolvers can't follow the CNAME.

**Fix:** use `cloudflared tunnel --url http://localhost:3001` quick tunnel instead (random `*.trycloudflare.com`, ephemeral). To get a stable vanity URL would require migrating the zone (or subdomain) to Cloudflare DNS. Codified in `~/.claude/projects/-Users-pierregallet/memory/feedback_cloudflared_named_tunnel_dns.md`.

### Saying "from mermaid-app" in chat prompts
Triggers Claude.ai's connector-marketplace search. Claude looks up "mermaid-app" as a published connector, finds nothing matching, suggests Mermaid Chart instead. **Once you click "None of these" the chat refuses local stdio routing too.**

**Fix:** in chat, name the **tool** directly (e.g. *"call render_mermaid with source: …"*). Don't name the server. Tool-direct prompts route to local stdio MCP without the marketplace detour.

### `<innerHTML>` for mermaid SVG output
First write blocked by safety hook. Even with mermaid `securityLevel: "strict"`, the project-level safety hook flags `innerHTML` uses.

**Fix:** parse with `DOMParser` and append the `<svg>` node. Pattern is in `mermaid-app-mcp/src/mcp-app.ts` `mountSvg()`.

### Inventing API fields from memory
Listed `preferredFrameSize` as a polish item before checking the spec. It doesn't exist. **Always read `/tmp/mcp-ext-apps/src/spec.types.ts` before promising API surface.** The skill's "Read JSDoc documentation directly from `/tmp/mcp-ext-apps/src/`" guidance is load-bearing.

### Skipping the official skill check before scaffolding
Started writing a hand-rolled express + ESM-CDN scaffold in JS before noticing the `mcp-apps` plugin exists. **Always run** `gh api repos/<spec-org>/<repo>/contents/.claude-plugin` before scaffolding from scratch.

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| **In-tree workspace package** (`packages/weave-mcp-app`), not a separate repo | Weave is "API may change through B5" — workspace coupling tracks it automatically, no version-pin churn |
| **Keep existing `weave-mcp-server` (HTTP-only) untouched** | Different audience (non-Claude hosts). The MCP-App is additive, not a replacement |
| **Stdio for Claude Desktop install** | No tunnel dependency, fastest dev loop, sandbox-safe with esbuild bundle |
| **Vanilla View vs React-based View** | React. Weave's renderer (`<Weave>` in `weave-primitives`) IS a React component — no point re-implementing in vanilla. Use `mcp-apps` skill's `basic-server-react` template |
| **Start with `render_dashboard` view, then unlock the other 4** | The renderer is a single recursive dispatcher — one View bundle covers all 5 tools at zero marginal cost |

## Also Completed This Session: Claude Code / Codex Project Scaffolding (2026-07-06)

Unrelated tangent, requested directly — weave had zero Claude-Code-specific config (no `CLAUDE.md`, `AGENTS.md`, or `.claude/`). Set up the "essential core" tier adapted from Pierre's personal reference project at `/Users/pierregallet/Documents/Claude Code Best Practise V2`.

**Added:**
- `CLAUDE.md`, `AGENTS.md` (repo root) — purpose, commands, verification, architecture, style, environment, CI/CD, repo etiquette, empty Gotchas section (N= ratchet).
- `.claude/settings.json` — Stop hook → `.claude/scripts/sync-memory.sh`.
- `.claude/scripts/sync-memory.sh` — mirrors Claude Code session memory (`type: project`/`feedback` entries) into `.claude/context/` at every session end, so Codex (via `AGENTS.md`) can read decisions/gotchas Claude records. **Adapted, not copy-pasted**: the reference template's default memory-dir guess (`~/Library/Application Support/Claude/local-agent-mode-sessions`) doesn't match this CLI setup. Real path is `~/.claude/projects/<cwd with / replaced by ->/memory` — rewrote the detection logic accordingly. Test-ran it directly (2026-07-06): correctly found `~/.claude/projects/-Users-pierregallet-Documents-weave/memory/`, synced 0 entries (none existed yet), rebuilt `INDEX.md`. Confirmed working.
- `.claude/context/INDEX.md` — auto-generated, committed (not gitignored) for team + Codex visibility. Contains no secrets, just synced memory notes — gitignore it instead if a future entry ever needs to stay private.
- `.gitignore` — added `CLAUDE.local.md`, `.claude/settings.local.json`.

**Skipped** (essential-core scope, chosen over full scaffold): `soul.md`, `user.md`, `.claude/{rules,agents,commands,skills,plans}` — no real content yet; add only when something earns its place.

**Verification run 2026-07-06**: `pnpm typecheck` — pass (8/8 tasks). `pnpm test` — pass (43 tests across weave-skill, weave-mcp-server, weave-primitives). `pnpm lint` (biome check) — **fails, 44 pre-existing errors** (mostly import-order/formatting in `weave-primitives`, e.g. `src/index.ts` export ordering, `src/layouts/Grid.tsx` conditional formatting), unrelated to this scaffolding work. Flagged as a separate task (`task_399c4fcd`, prompt: run `pnpm format` then hand-fix what's left) — **user has started this in a separate, isolated worktree/session, running concurrently.** Don't start overlapping lint/format work on `weave-primitives` until it finishes or you've checked its status.

Left untouched: `.memsearch/` (a separate, already-active memory-index plugin — different system, out of scope) and the existing `docs/future-directions/` convention.

## Current State

**Working**: `mermaid-app-mcp` (reference impl) — runs via stdio in Claude Desktop, full toolbar UI, polish complete. Verified 2026-05-02. Last log entry shows a clean shutdown 2026-05-03 20:07. Claude Code / Codex project scaffolding (above) — verified working 2026-07-06.

**Broken**: Nothing in the MCP App wrap — hasn't been started yet. Separately, `pnpm lint` has 44 pre-existing errors; a fix is running concurrently (see above) — check its status before assuming lint is clean.

**Uncommitted Changes**: None outstanding as of this update — the scaffolding above, the pre-existing `README.md`/`docs/future-directions/` future-direction note, and this `HANDOFF.md` were all committed together on 2026-07-06. `mermaid-app-mcp` is **not** under git (oversight — should be `git init`'d before further changes).

## Files to Know

| File | Why It Matters |
|------|----------------|
| `~/Documents/mcp-servers/mermaid-app-mcp/` | **Reference implementation.** Mirror this shape for weave-mcp-app. |
| `~/Documents/mcp-servers/mermaid-app-mcp/main.ts` | Stdio + HTTP transport setup (per-request `McpServer` rebuild) |
| `~/Documents/mcp-servers/mermaid-app-mcp/server.ts` | `registerAppTool` + `registerAppResource` pattern with `_meta.ui.resourceUri` and `_meta.ui.prefersBorder` |
| `~/Documents/mcp-servers/mermaid-app-mcp/src/mcp-app.ts` | View lifecycle: handlers BEFORE `app.connect()`, `app.ontoolresult`, `app.sendMessage`, `app.requestDisplayMode` |
| `~/Documents/mcp-servers/mermaid-app-mcp/package.json` | Build scripts — note `build:server` uses esbuild bundle (not tsx), `serve:stdio` runs the bundled output |
| `~/Documents/mcp-servers/mermaid-app-mcp/start-dev.sh` | Local HTTP + cloudflared quick tunnel orchestrator |
| `~/Documents/weave/packages/weave-mcp-server/src/tools.ts` | Existing 5 tool descriptors to import + extend with `_meta.ui.resourceUri` |
| `~/Documents/weave/packages/weave-mcp-server/src/mcp.ts` | Current HTTP MCP wiring — pattern to mirror for stdio |
| `~/Documents/weave/packages/weave-primitives/src/renderer/Weave.tsx` | The recursive renderer — import this directly into the View bundle |
| `~/Documents/weave/packages/weave-primitives/src/schemas/` | Zod schemas — already wired to JSON-schema via `zod-to-json-schema` |
| `~/Documents/weave/packages/weave-tokens/tokens.css` | Theme tokens — load in the View HTML for visual consistency |
| `~/Documents/weave/packages/weave-skill/SKILL.md` | Composition guide — expose via `get_skill` MCP tool |
| `~/Library/Application Support/Claude/claude_desktop_config.json` | Where the new `weave-mcp-app` entry lives. Backups at `*.bak.*` |
| `~/Library/Logs/Claude/mcp-server-<name>.log` | **Always check this first when debugging.** Shows full JSON-RPC traffic + crash reasons |
| `/tmp/mcp-ext-apps/` | Cloned ext-apps SDK source — read JSDoc here for API surface |
| `CLAUDE.md` / `AGENTS.md` (repo root) | Project scaffolding, added 2026-07-06 — commands, architecture, verification, gotchas. Read before starting any weave work. |
| `.claude/context/INDEX.md` | Auto-synced project/feedback memory (via the new stop hook) — check for prior decisions/gotchas. |

## Code Context

**Server registration pattern (the `_meta.ui.resourceUri` link is the load-bearing part):**

```typescript
// from mermaid-app-mcp/server.ts
const resourceUri = "ui://render-mermaid/mcp-app.html";

registerAppTool(server, "render_mermaid", {
  title: "Render Mermaid Diagram",
  description: "...",
  inputSchema: { source: z.string() },
  outputSchema: z.object({ source: z.string() }),
  _meta: { ui: { resourceUri } },        // ← links tool to view
}, async ({ source }) => ({
  content: [{ type: "text", text: "```mermaid\n" + source + "\n```" }], // text fallback
  structuredContent: { source },          // ← passed to View via app.ontoolresult
}));

registerAppResource(server, resourceUri, resourceUri,
  { mimeType: RESOURCE_MIME_TYPE },
  async () => ({
    contents: [{
      uri: resourceUri,
      mimeType: RESOURCE_MIME_TYPE,
      text: html,
      _meta: { ui: { prefersBorder: true } },  // ← _meta on contents[], NOT on config
    }],
  }),
);
```

**View lifecycle (handlers BEFORE `connect()` is mandatory):**

```typescript
// from mermaid-app-mcp/src/mcp-app.ts
const app = new App({ name: "Mermaid App", version: "0.1.0" });

app.onerror = console.error;
app.onhostcontextchanged = handleHostContextChanged;
app.onteardown = async () => ({});
app.ontoolresult = (result) => {
  const src = (result.structuredContent as { source?: string })?.source;
  if (src) render(src);
};

await app.connect();  // ← only AFTER all handlers registered
```

**Stdio config entry that survives the sandbox:**

```json
{
  "mcpServers": {
    "weave-mcp-app": {
      "command": "/usr/local/bin/node",
      "args": [
        "/Users/pierregallet/Documents/weave/packages/weave-mcp-app/dist/index.js",
        "--stdio"
      ]
    }
  }
}
```

**esbuild bundle command (with `createRequire` banner for transitive CJS deps):**

```bash
esbuild main.ts --bundle --platform=node --format=esm --target=node20 \
  --outfile=dist/index.js \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
```

## Resume Instructions

1. **Start in the weave repo:**
   ```bash
   cd ~/Documents/weave
   ```

2. **Use the official skill — don't hand-roll.** Trigger `mcp-apps:create-mcp-app` skill via the `Skill` tool. Tell it: *"Create a new workspace package `packages/weave-mcp-app` that wraps the existing 5 `render_*` tools with `ui://` resources. Framework: React (existing renderer is React). Reference implementation: `~/Documents/mcp-servers/mermaid-app-mcp/`. Stdio transport for Claude Desktop install. Pre-bundle with esbuild to `dist/index.js` (not tsx-at-runtime — see HANDOFF.md Failed Approaches)."*
   - Expected: skill clones `/tmp/mcp-ext-apps/`, points at `examples/basic-server-react/` template, scaffolds the package
   - If the skill suggests `tsx` for the stdio entry: override. The HANDOFF lesson supersedes the skill's default.

3. **Phase 1 verification — get the empty server connecting:**
   ```bash
   cd ~/Documents/weave
   pnpm install
   pnpm --filter weave-mcp-app build
   # Add the entry to ~/Library/Application Support/Claude/claude_desktop_config.json
   # Restart Claude Desktop
   tail -f ~/Library/Logs/Claude/mcp-server-weave-mcp-app.log
   ```
   - Expected log: `Server started and connected successfully`, then `tools/list` returning the 5 render tools
   - If EPERM on `tsx/dist/cli.mjs`: the bundle wasn't used. Re-check the config command points at `node dist/index.js`, not `tsx`.

4. **Phase 2 verification — real render:**
   In a **fresh** Claude Desktop chat (don't reuse old chats), prompt:
   > *"Call render_dashboard with this spec: {kind: 'dashboard', children: [{kind: 'metric_band', metrics: [{label: 'Revenue', value: '$10k', tone: 'good'}]}]}"*
   - Expected: inline view appears with the Weave-rendered metric band, not just JSON
   - Don't say "from weave-mcp-app" or "use the weave connector" — that triggers connector marketplace search

5. **Bisect by phase.** Don't batch all four phases into one rebuild. Each phase = its own commit + Claude Desktop restart + manual verification.

## Setup Required

- **Node ≥22** (weave already requires this; mermaid-app uses `/usr/local/bin/node` — verify in `claude_desktop_config.json`)
- **pnpm 10.33** (weave monorepo manager)
- **Claude Desktop** must be restarted whenever the bundled `dist/index.js` changes (stdio servers spawn fresh per session)
- **No env vars required** for stdio mode. HTTP mode only needs `WEAVE_MCP_PORT` and `WEAVE_MCP_CORS_ORIGIN`
- **`mcp-apps` plugin** must be installed in Claude Code: `/plugin marketplace add modelcontextprotocol/ext-apps` then `/plugin install mcp-apps@modelcontextprotocol-ext-apps` (already installed for current user — confirm via `ls ~/.claude/plugins/marketplaces/mcp-apps/`)

## Edge Cases & Error Handling

- **What if Claude Desktop sandbox EPERMs on a workspace import path?** → Likely cause: bundling didn't inline a workspace dep. Re-run `esbuild` with `--bundle` and verify `dist/index.js` is self-contained (`grep -c "require(" dist/index.js` should be ~0).
- **What if the View renders blank?** → Check `~/Library/Logs/Claude/mcp-server-weave-mcp-app.log` for the `resources/read` response. The `text` field must contain the full HTML. Confirm `dist/<view>.html` exists and `server.ts` reads from the correct path (use `import.meta.dirname` resolution like mermaid-app's `DIST_DIR`).
- **What if `app.sendMessage` doesn't push edits back to chat?** → Check `app.connect()` resolved successfully, and that handler was registered BEFORE `connect()`. Ordering is mandatory.
- **What if recharts blows up the bundle past 2MB?** → Tree-shake aggressively. Only import the variants weave actually uses (`LineChart`, `BarChart`, etc.) from `recharts/lib/`.

## Warnings

- **`mermaid-app-mcp` is not under git.** Initialize before further changes (`cd ~/Documents/mcp-servers/mermaid-app-mcp && git init && git add . && git commit -m "initial: working mermaid MCP App"`).
- **The dev server (HTTP) and Claude Desktop's stdio process are independent.** `tsx --watch main.ts` (HTTP, port 3001) doesn't auto-restart the stdio process Claude Desktop spawned. After server.ts edits, rebuild + restart Claude Desktop.
- **Three pre-existing MCP servers fail to connect** in this user's Claude Desktop (`pencil`, `n8n-mcp`, `_MCP_DOCKER`). Those errors are unrelated — ignore them in the disconnected-server toasts.
- **`vite-plugin-singlefile` builds for the browser**, NOT node. The View bundle (`dist/<view>.html`) and the server bundle (`dist/index.js`) are two separate build targets — keep their configs distinct.
- **Don't migrate `brandiron.co.za` DNS to Cloudflare without warning the user.** Mail records on HostServ. Migration touches MX. Out of scope for this handoff.
- **Weave's API stability:** "may change through B5". Treat the workspace import as the supported coupling. Don't fork weave internals into the MCP-App package.
- **The `auto memory` system is per-CWD**, scoped to the directory Claude Code was launched from. Lessons from this session (`feedback_mcp_stdio_bundle.md`, `feedback_cloudflared_named_tunnel_dns.md`) live at `~/.claude/projects/-Users-pierregallet/memory/` and only load when launched from `/Users/pierregallet`. Consider adding a pointer to `~/Documents/mcp-servers/CLAUDE.md` so future sessions there pick them up.
- **New (2026-07-06)**: `.claude/scripts/sync-memory.sh` runs on every session Stop event for the weave project specifically and mirrors `type: project`/`feedback` memory into `.claude/context/`, which **is committed to git** (deliberate, for team + Codex visibility). If a future entry is ever sensitive, gitignore `.claude/context/` instead of assuming it'll stay private.
- **A lint-cleanup pass may still be running** in a separate worktree/session (`task_399c4fcd`, started 2026-07-06). Check its status before doing unrelated formatting work on `weave-primitives`.
