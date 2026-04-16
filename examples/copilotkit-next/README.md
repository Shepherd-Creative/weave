# Weave × CopilotKit Next.js example

Minimal Next.js 15 + CopilotKit v2 example wiring Weave primitives end-to-end.

> **Status:** stub during B3. The ad-agency-ai-assistant-V2 host app is the B3 integration test bed; this example gets populated progressively through B3 → B5 once the library is stable enough for external consumers.

Once populated, this example will demonstrate:
1. Running `@shepherd-creative/weave-mcp-server` alongside Next dev
2. Concatenating the SKILL content into the agent's system prompt
3. Registering the 5 render tools via CopilotKit's `useCopilotAction`
4. Rendering returned specs with `<Weave spec={...} />`
5. Survive-refresh behaviour (pending assistant-message-sync fix in host app A4)

Build / dev scripts are no-ops during B3.
