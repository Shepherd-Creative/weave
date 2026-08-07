import {
  ChartCardSchema,
  MetricBandSchema,
  NoteCardSchema,
  SpecSchema,
  TableCardSchema,
} from "@shepherd-creative/weave-primitives/schemas";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

/**
 * Tool registry. Each entry:
 * - `description`: what the tool does (surfaced to the LLM)
 * - `inputSchema`: Zod schema validating the tool args
 * - `specType`: the `type` discriminator prepended to the validated spec
 *               (undefined for `render_dashboard` — input carries its own type)
 */
export type ToolDescriptor = {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  specType?: string;
};

export const TOOLS: ToolDescriptor[] = [
  {
    name: "render_metric_band",
    description:
      'Render a horizontal strip of 1–8 KPIs. Use for the top-of-dashboard "at a glance" row. Pass the KPI items; the tool returns a MetricBand spec. Prefer this over a prose list of figures whenever an answer carries three or more KPIs, even if a dashboard was not requested.',
    inputSchema: MetricBandSchema.omit({ type: true }),
    specType: "MetricBand",
  },
  {
    name: "render_chart_card",
    description:
      "Render a titled chart card. Use for time-series, categorical, or share-of-whole visualisations. Requires a Chart sub-spec with a variant and data. Reach for this whenever you describe a trend over time, not only when a chart is explicitly requested.",
    inputSchema: ChartCardSchema.omit({ type: true }),
    specType: "ChartCard",
  },
  {
    name: "render_table_card",
    description:
      "Render a tabular breakdown with typed cells (text, number, badge, delta, sparkline). Use for ≤40 rows; prefer filtering + summary for longer datasets. Use this instead of writing a markdown table.",
    inputSchema: TableCardSchema.omit({ type: true }),
    specType: "TableCard",
  },
  {
    name: "render_note_card",
    description:
      "Render a commentary note. Use for explaining the why, surfacing caveats, or recommending a next action — not for restating numbers. When a rendered dashboard needs a caveat or the reason behind the numbers, annotate it here rather than adding a separate prose paragraph.",
    inputSchema: NoteCardSchema.omit({ type: true }),
    specType: "NoteCard",
  },
  {
    name: "render_dashboard",
    description:
      "Render a full dashboard composition — a Grid or Stack tree containing organisms. Use when you need more than one organism arranged together. Input is a Grid or Stack node whose children array holds organism specs (MetricBand, ChartCard, TableCard, NoteCard) or further Grid/Stack nodes. Use for any multi-dimensional status or health summary, even when the user did not ask for a dashboard.",
    // Full spec; the LLM supplies its own type discriminator here.
    inputSchema: SpecSchema,
    specType: undefined,
  },
];

/** Runtime lookup: tool name → descriptor. */
export const TOOLS_BY_NAME: Record<string, ToolDescriptor> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

/**
 * Where a model reading THIS package's surfaces can fetch the composition
 * skill. Both surfaces are the same Hono app, which serves the skill at
 * `GET /skill.md` (see packages/weave-mcp-server/src/app.ts).
 *
 * The descriptions in `TOOLS` are deliberately surface-neutral: the array is
 * also imported by the MCP App, which is stdio-only (no HTTP route to point
 * at) and registers its own `get_skill` tool instead. A pointer baked into the
 * shared descriptor would be false on whichever surface it was not written
 * for — which is exactly how the old `call get_skill` instruction came to
 * advertise a tool this server never registered.
 */
export const SKILL_ENDPOINT_HINT =
  " The full composition guide is served by this server at `GET /skill.md`.";

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
 * Thrown by `invokeTool` when `render_dashboard` input exceeds the depth
 * cap. Handlers should surface this as HTTP 400 / MCP input-validation error.
 */
export class DepthLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DepthLimitError";
  }
}

/**
 * Max recursion depth allowed on `render_dashboard` inputs.
 * Depth here counts nested Grid/Stack containers. The worked examples in
 * packages/weave-skill/SKILL.md cap at depth 3; anything beyond 6 is almost
 * certainly an LLM hallucination and was an F1 OOM vector before SpecSchema
 * switched to z.discriminatedUnion. Kept as belt-and-braces against future
 * Zod version regressions and misbehaving clients.
 *
 * Evidence for the OOM claim now lives in the repository, not in an external
 * design doc: the "parses depth-20 specs fast via discriminatedUnion"
 * regression test in packages/weave-mcp-server/src/__tests__/app.test.ts, and
 * the 0.1.1 entry in packages/weave-mcp-server/CHANGELOG.md.
 */
const MAX_DASHBOARD_DEPTH = 6;

/**
 * Depth of the deepest Grid/Stack chain in a raw spec payload.
 * Walks children arrays without parsing — cheap and allocation-light.
 */
function specContainerDepth(spec: unknown, seen = 0): number {
  if (!spec || typeof spec !== "object") return seen;
  const obj = spec as { type?: unknown; children?: unknown };
  const isContainer = obj.type === "Grid" || obj.type === "Stack";
  const nextDepth = isContainer ? seen + 1 : seen;
  if (!Array.isArray(obj.children)) return nextDepth;
  let max = nextDepth;
  for (const child of obj.children) {
    const childDepth = specContainerDepth(child, nextDepth);
    if (childDepth > max) max = childDepth;
  }
  return max;
}

/**
 * Validate args for a tool, return the full spec.
 * Throws z.ZodError on invalid args — handler translates to HTTP 400.
 * For `render_dashboard`, applies a depth cap before parsing so pathological
 * payloads never reach Zod.
 */
export function invokeTool(name: string, args: unknown): unknown {
  const tool = TOOLS_BY_NAME[name];
  if (!tool) {
    throw new Error(`Unknown tool: ${name}`);
  }
  if (name === "render_dashboard") {
    const depth = specContainerDepth(args);
    if (depth > MAX_DASHBOARD_DEPTH) {
      throw new DepthLimitError(
        `render_dashboard: nested Grid/Stack depth ${depth} exceeds the ${MAX_DASHBOARD_DEPTH}-container limit. Flatten the composition.`,
      );
    }
  }
  const validated = tool.inputSchema.parse(args);
  if (tool.specType) {
    return { type: tool.specType, ...(validated as Record<string, unknown>) };
  }
  return validated;
}
