import { readFileSync } from "node:fs";
import path from "node:path";
import { SpecSchema } from "@shepherd-creative/weave-primitives/schemas";
import { loadSkill } from "@shepherd-creative/weave-skill";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { SKILL_RESOURCE_URI, TOOLS, TOOLS_BY_NAME, toolsJsonManifest } from "../tools.js";

// F6/F9 drift guards for the model-facing surface this package serves.
//
// This is the one package that already depends on BOTH weave-primitives and
// weave-skill, so it is where the cross-package claim is checked: the skill
// catalogue the model reads must name exactly the primitives the Spec union
// accepts, and no tool description may point the model at a tool this surface
// does not register.

const SKILL = loadSkill("skill");

/**
 * Runtime discriminator keys of the Spec union — the source of truth for
 * "which primitives exist". SpecSchema is `z.lazy(() =>
 * z.discriminatedUnion(...))`, so members live behind the lazy getter on
 * Zod-internal `_def`. That is private API: this THROWS if the shape moves,
 * so the guard can never pass by measuring nothing.
 */
function specUnionMembers(): string[] {
  const lazyDef = (SpecSchema as unknown as { _def?: { getter?: () => unknown } })._def;
  const inner = typeof lazyDef?.getter === "function" ? lazyDef.getter() : SpecSchema;
  const optionsMap = (inner as { _def?: { optionsMap?: Map<string, unknown> } })._def?.optionsMap;
  if (!optionsMap || optionsMap.size === 0) {
    throw new Error(
      "Could not enumerate the Spec union via Zod internals (_def.optionsMap). " +
        "Zod's internal shape changed — update this guard rather than deleting it.",
    );
  }
  return [...optionsMap.keys()];
}

/** Backticked primitive names in the catalogue section of packages/weave-skill/SKILL.md. */
function skillCatalogueNames(): string[] {
  const start = SKILL.indexOf("## 9. Catalogue reference");
  expect(start, "SKILL.md must carry a numbered catalogue section").toBeGreaterThan(-1);
  const rest = SKILL.slice(start + 1);
  const end = rest.indexOf("\n## ");
  const section = end === -1 ? rest : rest.slice(0, end);
  const shippedLines = section
    .split("\n")
    .filter((l) => /Atoms:|Molecules:|Organisms:|Layouts:/.test(l))
    .join("\n");
  return [...shippedLines.matchAll(/`([A-Z][A-Za-z]*)`/g)].map((m) => m[1] as string);
}

describe("skill catalogue matches the Spec union", () => {
  it("names exactly the primitives the Spec union accepts", () => {
    expect(skillCatalogueNames().slice().sort()).toEqual(specUnionMembers().slice().sort());
  });
});

describe("tool descriptions advertise only what this surface registers", () => {
  // Tool names are snake_case; ordinary prose in these descriptions is not.
  // Any snake_case token in a description is therefore a tool reference, and
  // must resolve to a tool this server actually registers.
  const SNAKE_CASE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g;

  it("references no tool that is not in the registry", () => {
    const registered = new Set(Object.keys(TOOLS_BY_NAME));
    expect(registered.size).toBeGreaterThan(0);

    const dangling: string[] = [];
    for (const tool of TOOLS) {
      for (const match of tool.description.matchAll(SNAKE_CASE)) {
        const token = match[0];
        if (!registered.has(token)) dangling.push(`${tool.name} → ${token}`);
      }
    }
    expect(dangling).toEqual([]);
  });

  it("keeps the shared descriptors surface-neutral", () => {
    // `TOOLS` is also imported by the MCP App, which is stdio-only and has no
    // HTTP route. A transport-specific pointer therefore belongs on the
    // surface that owns it, never in the shared descriptor.
    for (const tool of TOOLS) {
      expect(tool.description, `${tool.name} bakes in a transport-specific pointer`).not.toContain(
        "/skill.md",
      );
      // The MCP resource is registered by this package's `/mcp` transport only,
      // so naming it in the shared descriptor would promise the stdio MCP App a
      // resource it does not serve.
      expect(tool.description, `${tool.name} bakes in this server's resource URI`).not.toContain(
        SKILL_RESOURCE_URI,
      );
    }
  });

  it("carries the skill-endpoint pointer on the advertised JSON manifest", () => {
    const manifest = toolsJsonManifest();
    expect(manifest.length).toBe(TOOLS.length);
    const dashboard = manifest.find((t) => t.name === "render_dashboard");
    expect(dashboard).toBeDefined();
    // `GET /skill.md` is served by this package's Hono app, see
    // packages/weave-mcp-server/src/app.ts. The `get_skill` MCP tool exists
    // only in the MCP App package, so nothing here may name it.
    expect((dashboard as { description: string }).description).toContain("/skill.md");
    // Both channels this server actually serves, so a REST reader and an MCP
    // client each find one they can follow.
    expect((dashboard as { description: string }).description).toContain(SKILL_RESOURCE_URI);
    expect((dashboard as { description: string }).description).not.toContain("get_skill");
  });

  it("carries the same pointer over MCP JSON-RPC tools/list", async () => {
    const res = await createApp().request("/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result?: { tools?: Array<{ name: string; description?: string }> };
    };
    const tools = body.result?.tools ?? [];
    expect(tools.length).toBe(TOOLS.length);
    const dashboard = tools.find((t) => t.name === "render_dashboard");
    expect(dashboard).toBeDefined();
    expect((dashboard as { description: string }).description).toContain("/skill.md");
    for (const tool of tools) {
      expect(tool.description ?? "", `${tool.name} advertises an unavailable tool`).not.toContain(
        "get_skill",
      );
    }
  });
});

describe("public version claims track package metadata", () => {
  const PKG_DIR = path.resolve(__dirname, "..", "..");
  const PKG = JSON.parse(readFileSync(path.join(PKG_DIR, "package.json"), "utf-8")) as {
    version: string;
  };
  // packages/weave-mcp-server/src/server.ts is the package entry point. It is
  // not imported here: importing it binds a real listener. The source text is
  // the thing under guard anyway.
  const ENTRY_SRC = readFileSync(path.join(PKG_DIR, "src", "server.ts"), "utf-8");

  it("hard-codes no version literal in the package entry point", () => {
    // Non-vacuity floor: prove we actually read the entry source.
    expect(ENTRY_SRC).toContain("createApp");
    expect(ENTRY_SRC).not.toMatch(/_VERSION\s*(?::[^=]+)?=\s*["'`]/);
  });

  it("has a package version to be checked against", () => {
    expect(PKG.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
