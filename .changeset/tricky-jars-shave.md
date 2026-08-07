---
"@shepherd-creative/weave-primitives": minor
"@shepherd-creative/weave-skill": minor
"@shepherd-creative/weave-mcp-server": minor
---

Wave 0: make the public claims true, and guard them with tests.

- **Removed the misleading `0.0.0` version constants.** `WEAVE_PRIMITIVES_VERSION`,
  `WEAVE_SKILL_VERSION` and `WEAVE_MCP_SERVER_VERSION` were hard-coded literals
  that never tracked the published package versions (0.2.0, 0.2.0 and 0.1.2 at
  the time of removal). They are gone rather than re-derived: package metadata
  is already the source of truth, and a constant that restates it only drifts.
  Read `version` from `package.json` if you need it.
- **`weave-skill`: no primitive is recommended that does not exist.** The
  two-KPI guidance recommended a `Comparison` primitive that was never built;
  it now recommends the `Stack` of two `KPI`s that actually works. The
  forthcoming list drops `Divider` and `Comparison` and keeps only `Sparkline`,
  `ProgressBar` and `Badge`.
- **`weave-mcp-server`: no tool is advertised that this surface does not
  register.** `render_dashboard`'s description told models to "call get_skill",
  a tool only the MCP App registers. The REST and MCP JSON-RPC surfaces now
  point at `GET /skill.md`, which this server really serves, and the shared
  `TOOLS` descriptors stay transport-neutral so embedders cannot inherit a
  false pointer. New exports: `SKILL_ENDPOINT_HINT` and
  `describeForHttpSurface`.
- **Documentation reconciled with the code.** The primitives README claimed
  "12 of 18 primitives" against a Spec union of 13. Catalogue, count and
  roadmap claims are now asserted against the union and package metadata by
  tests, so they fail loudly instead of rotting.
