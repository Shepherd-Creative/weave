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
      'Render a horizontal strip of 1–8 KPIs. Use for the top-of-dashboard "at a glance" row. Pass the KPI items; the tool returns a MetricBand spec.',
    inputSchema: MetricBandSchema.omit({ type: true }),
    specType: "MetricBand",
  },
  {
    name: "render_chart_card",
    description:
      "Render a titled chart card. Use for time-series, categorical, or share-of-whole visualisations. Requires a Chart sub-spec with a variant and data.",
    inputSchema: ChartCardSchema.omit({ type: true }),
    specType: "ChartCard",
  },
  {
    name: "render_table_card",
    description:
      "Render a tabular breakdown with typed cells (text, number, badge, delta, sparkline). Use for ≤40 rows; prefer filtering + summary for longer datasets.",
    inputSchema: TableCardSchema.omit({ type: true }),
    specType: "TableCard",
  },
  {
    name: "render_note_card",
    description:
      "Render a commentary note. Use for explaining the why, surfacing caveats, or recommending a next action — not for restating numbers.",
    inputSchema: NoteCardSchema.omit({ type: true }),
    specType: "NoteCard",
  },
  {
    name: "render_dashboard",
    description:
      "Render a full dashboard composition — a Grid or Stack tree containing organisms. Use when you need more than one organism arranged together. Input is a Grid or Stack node with a children array of organism specs; call get_skill for the full schema.",
    // Full spec; the LLM supplies its own type discriminator here.
    inputSchema: SpecSchema,
    specType: undefined,
  },
];

/** Runtime lookup: tool name → descriptor. */
export const TOOLS_BY_NAME: Record<string, ToolDescriptor> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

/** Convert each tool's Zod schema to JSON Schema for the `/tools` endpoint. */
export function toolsJsonManifest() {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
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
 * Depth here counts nested Grid/Stack containers. The SKILL.md examples cap
 * at depth 3; anything beyond 6 is almost certainly an LLM hallucination
 * and existed as an F1 OOM vector (see a5-mcp-stress-test-results.md) before
 * SpecSchema switched to z.discriminatedUnion. Kept as belt-and-braces
 * against future Zod version regressions and misbehaving clients.
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
