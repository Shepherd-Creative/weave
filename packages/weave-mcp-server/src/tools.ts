import {
  assertDocumentStructuralLimits,
  assertPayloadWithinLimit,
  ChartCardSchema,
  MetricBandSchema,
  NoteCardSchema,
  RootSpecSchema,
  TableCardSchema,
  validateWeaveDocument,
  WEAVE_DOCUMENT_VERSION,
  WeaveDocumentError,
  type WeaveDocumentV1,
} from "@shepherd-creative/weave-primitives/schemas";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Tool registry. Each entry:
 * - `description`: what the tool does (surfaced to the LLM)
 * - `inputSchema`: the ADVERTISED shape of the tool args. It is a projection
 *                  for discovery; the runtime authority is
 *                  `validateWeaveDocument` (see `invokeTool`).
 * - `specType`: the `type` discriminator prepended to the args to form the
 *               document root (undefined for `render_dashboard`, whose args
 *               carry the root themselves)
 */
export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: z.AnyZodObject;
  specType?: string;
};

/**
 * `render_dashboard`'s bounded object gateway.
 *
 * F8: this tool used to advertise `SpecSchema` directly — a `z.lazy()` union
 * with no `.shape`. The MCP App SDK normalises a tool's input schema through
 * `.shape` and falls back to an EMPTY schema when there is none, so the one
 * tool that composes everything else was undiscoverable on that surface.
 *
 * Wrapping the union in an object fixes that without weakening anything: the
 * gateway is a real `ZodObject`, so every surface can project it, and the
 * runtime path still validates through the canonical document contract.
 * Restricting it to `RootSpecSchema` also means the advertised schema now
 * describes exactly what a document may be rooted in, rather than the whole
 * primitive union — the projection and the contract say the same thing.
 */
export const DashboardGatewaySchema = z.object({
  root: RootSpecSchema.describe(
    "The document root: a layout (Grid, Stack) or a display organism (MetricBand, ChartCard, TableCard, NoteCard). Atoms and molecules compose INSIDE a layout; they are not documents on their own.",
  ),
});

export const TOOLS: ToolDescriptor[] = [
  {
    name: "render_metric_band",
    description:
      'Render a horizontal strip of 1–8 KPIs. Use for the top-of-dashboard "at a glance" row. Pass the KPI items; the tool returns a MetricBand document. Prefer this over a prose list of figures whenever an answer carries three or more KPIs, even if a dashboard was not requested.',
    inputSchema: MetricBandSchema.omit({ type: true, id: true }),
    specType: "MetricBand",
  },
  {
    name: "render_chart_card",
    description:
      "Render a titled chart card. Use for time-series, categorical, or share-of-whole visualisations. Requires a Chart sub-spec with a variant and data. Reach for this whenever you describe a trend over time, not only when a chart is explicitly requested.",
    inputSchema: ChartCardSchema.omit({ type: true, id: true }),
    specType: "ChartCard",
  },
  {
    name: "render_table_card",
    description:
      "Render a tabular breakdown with typed cells (text, number, badge, delta, sparkline). Use for ≤40 rows and ≤7 columns; every row needs exactly one cell per header. Prefer filtering + summary for longer datasets. Use this instead of writing a markdown table.",
    inputSchema: TableCardSchema.omit({ type: true, id: true }),
    specType: "TableCard",
  },
  {
    name: "render_note_card",
    description:
      "Render a commentary note. Use for explaining the why, surfacing caveats, or recommending a next action — not for restating numbers. When a rendered dashboard needs a caveat or the reason behind the numbers, annotate it here rather than adding a separate prose paragraph.",
    inputSchema: NoteCardSchema.omit({ type: true, id: true }),
    specType: "NoteCard",
  },
  {
    name: "render_dashboard",
    description:
      "Render a full dashboard composition. Pass `root`: a Grid or Stack whose children hold organisms (MetricBand, ChartCard, TableCard, NoteCard) or further Grid/Stack nodes. Use for any multi-dimensional status or health summary, even when the user did not ask for a dashboard.",
    inputSchema: DashboardGatewaySchema,
    specType: undefined,
  },
];

/** Runtime lookup: tool name → descriptor. */
export const TOOLS_BY_NAME: Record<string, ToolDescriptor> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

/**
 * URI of the composition skill as an MCP resource, registered by `mcp.ts`.
 *
 * A custom scheme, not a URL: MCP resource URIs are opaque handles the server
 * resolves itself, so this names something a client can act on without knowing
 * where the server is deployed.
 */
export const SKILL_RESOURCE_URI = "weave://skill.md";

/**
 * Where a model reading THIS package's surfaces can fetch the composition
 * skill. Both surfaces are the same Hono app: it serves the skill at
 * `GET /skill.md` (see packages/weave-mcp-server/src/app.ts) and registers it
 * as the `weave://skill.md` MCP resource (see
 * packages/weave-mcp-server/src/mcp.ts).
 *
 * Both channels are named because a client can only follow one of them. A
 * client speaking JSON-RPC to `/mcp` has no base URL and cannot act on a
 * relative route, so pointing it at `GET /skill.md` alone would be advice it
 * cannot take; a REST caller reading the `/tools` manifest cannot issue
 * `resources/read`. Each statement is true of this server either way.
 *
 * The descriptions in `TOOLS` are deliberately surface-neutral: the array is
 * also imported by the MCP App, which is stdio-only (it serves neither the
 * route nor this resource) and registers its own `get_skill` tool instead. A
 * pointer baked into the shared descriptor would be false on whichever surface
 * it was not written for — which is exactly how the old `call get_skill`
 * instruction came to advertise a tool this server never registered.
 */
export const SKILL_ENDPOINT_HINT = ` The full composition guide is available from this server: MCP clients can read the resource \`${SKILL_RESOURCE_URI}\`; over HTTP it is served at \`GET /skill.md\`.`;

/** A tool's description as advertised by this package's REST and MCP surfaces. */
export function describeForHttpSurface(tool: ToolDescriptor): string {
  return tool.name === "render_dashboard"
    ? tool.description + SKILL_ENDPOINT_HINT
    : tool.description;
}

/** Convert each tool's Zod schema to JSON Schema for the `/tools` endpoint. */
export function toolsJsonManifest() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: describeForHttpSurface(t),
    inputSchema: zodToJsonSchema(t.inputSchema, { target: "jsonSchema7" }),
  }));
}

/**
 * Validate args for a tool and return the resulting **document**.
 *
 * The advertised `inputSchema` is not what runs here. Every tool builds a
 * candidate `WeaveDocumentV1` from its raw args and hands it to the canonical
 * validator, so a document rejected by the React renderer is rejected here for
 * the same reason with the same message — which is the whole point of having
 * one contract rather than one per transport.
 *
 * Order matters. The structural walk runs first because it is the only step
 * that is safe on unbounded input: it aborts on the first breach, so a
 * pathological payload is never fully traversed, and only once it has passed
 * is the document known to be small enough to serialise for the payload check.
 *
 * @throws {z.ZodError} shape, bounds or cross-field rule breach
 * @throws {WeaveDocumentError} payload/depth/node/nesting policy breach
 */
export function invokeTool(name: string, args: unknown): WeaveDocumentV1 {
  const tool = TOOLS_BY_NAME[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }

  const record = args !== null && typeof args === "object" ? (args as Record<string, unknown>) : {};

  // A fixed tool does not take a `type` argument, so being sent one is an
  // error — never something to reconcile.
  //
  // This has now been wrong in both directions. Built as
  // `{ type: tool.specType, ...record }`, a caller-supplied `type` won the
  // spread and `render_note_card` returned whatever root it was handed.
  // Stamping it LAST stopped the retyping but replaced it with a quieter
  // fault: the conflicting key was silently overwritten, so
  // `{ type: "Stack", body: "ok" }` — valid but for that key — came back 200
  // as a NoteCard, while `/mcp` refused the identical request because the SDK
  // actually runs the advertised `…omit({ type, id })` schema. Two surfaces,
  // two answers, and the surface that disagreed was the one nobody could see.
  //
  // Neither overwriting nor ignoring it is a contract. The advertised schema
  // omits `type`, so the key is unrecognised whether or not it AGREES with the
  // discriminator — which is exactly what the SDK raises for both cases. This
  // raises the same issue from the shared path, so every surface answers the
  // same request the same way, including the ones that never run the
  // advertised schema at all.
  //
  // Cheap enough to run first: an own-property test walks nothing, so it
  // cannot be the step that traverses an unbounded input.
  if (tool.specType && Object.hasOwn(record, "type")) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.unrecognized_keys,
        keys: ["type"],
        path: [],
        message: `Unrecognized key(s) in object: 'type'. ${name} always renders a ${tool.specType}; its \`type\` is not a caller argument.`,
      },
    ]);
  }

  const root = tool.specType ? { ...record, type: tool.specType } : record.root;
  const candidate = { weave: WEAVE_DOCUMENT_VERSION, root };

  assertDocumentStructuralLimits(candidate);
  // Safe to serialise now: the walk above bounded both node count and nesting.
  // This is the payload guard for surfaces that never expose the raw body —
  // MCP JSON-RPC and the MCP App both hand us an already-parsed object.
  assertPayloadWithinLimit(JSON.stringify(candidate));

  return validateWeaveDocument(candidate);
}

export { WeaveDocumentError };
