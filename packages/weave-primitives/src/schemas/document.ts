import { z } from "zod";
import { LIMITS } from "./bounds.js";
import type { GridSpec, StackSpec } from "./layouts.js";
import type { ChartCardSpec, MetricBandSpec, NoteCardSpec, TableCardSpec } from "./organisms.js";
import { ChartCardSchema, MetricBandSchema, NoteCardSchema, TableCardSchema } from "./organisms.js";
import { GridSchema, StackSchema } from "./spec.js";

/**
 * WeaveDocumentV1 — the versioned boundary between a generated spec and
 * anything that renders it.
 *
 * ## Why an envelope
 *
 * Before Wave 1 a "dashboard" was any member of the Spec union, so a bare
 * `Label` was a legal dashboard, a `DataRow` rendered a `<tr>` with no table
 * around it (F2), and there was no version to negotiate on. A document is now
 * explicitly `{ weave: 1, root }`: self-describing, so a consumer can tell a
 * v1 document from a v2 one and from a legacy bare spec without guessing.
 *
 * ## Where each rule lives, and why
 *
 * - **Structural bounds** (array lengths, string lengths, finite numbers,
 *   enums) live in the leaf schemas, so they apply wherever a schema is used.
 * - **Cost policy** (payload bytes, container depth, object count, raw
 *   nesting) is checked here, BEFORE Zod sees the input — the point is to not
 *   walk a hostile tree twice.
 * - **Cross-field rules** (one cell per header, chart keys matching the
 *   declared series, document-wide unique ids) are checked here too, as Zod
 *   issues on the envelope. They cannot live in the leaf schemas: Zod 3's
 *   `discriminatedUnion` requires every member to be a `ZodObject`, and
 *   `.superRefine()` yields a `ZodEffects`, which the union rejects at
 *   construction time (measured on zod 3.25.76 — it throws
 *   `TypeError: Cannot read properties of undefined (reading 'type')`).
 *
 * `validateWeaveDocument` is therefore the single gate, and every path — the
 * React renderer, HTTP REST, MCP JSON-RPC and the MCP App — goes through it.
 * A renderer must not assume a transport protected it.
 */

/** The document format this build implements. */
export const WEAVE_DOCUMENT_VERSION = 1 as const;

/**
 * What a document may be rooted in: a layout, or an organism that is a
 * complete answer on its own.
 *
 * Atoms (`Number`, `Label`, `Icon`) and molecules (`KPI`, `Stat`, `Chart`) are
 * building blocks, not documents — a bare `Chart` has no title, which the
 * composition skill's §6 forbids outright. `DataRow` is table-internal. All of them remain legal
 * *inside* a layout; only the root is restricted.
 */
export type RootSpec =
  | GridSpec
  | StackSpec
  | MetricBandSpec
  | ChartCardSpec
  | TableCardSpec
  | NoteCardSpec;

export type WeaveDocumentV1 = {
  weave: typeof WEAVE_DOCUMENT_VERSION;
  root: RootSpec;
};

export const RootSpecSchema: z.ZodType<RootSpec> =
  // Same variance cast as SpecSchema: GridSchema/StackSchema are type-erased
  // through z.lazy(), so TS cannot prove they are ZodDiscriminatedUnionOptions,
  // while at runtime both still carry `type: z.literal(...)`.
  z.discriminatedUnion("type", [
    GridSchema as unknown as typeof NoteCardSchema,
    StackSchema as unknown as typeof NoteCardSchema,
    MetricBandSchema as unknown as typeof NoteCardSchema,
    ChartCardSchema as unknown as typeof NoteCardSchema,
    TableCardSchema as unknown as typeof NoteCardSchema,
    NoteCardSchema,
  ]) as unknown as z.ZodType<RootSpec>;

/** Root `type` values, in declaration order. Used by the drift guards. */
export const ROOT_SPEC_TYPES = [
  "Grid",
  "Stack",
  "MetricBand",
  "ChartCard",
  "TableCard",
  "NoteCard",
] as const;

// --- cost policy --------------------------------------------------------

export type WeaveDocumentErrorCode =
  | "payload"
  | "malformed"
  | "depth"
  | "nodes"
  | "nesting"
  | "already-versioned"
  | "missing-input";

/**
 * A document rejected for a reason the validator detects itself, rather than
 * a shape failure (which is a `ZodError`). Both are input errors: every
 * transport maps them to the same 400-class response.
 */
export class WeaveDocumentError extends Error {
  readonly code: WeaveDocumentErrorCode;

  constructor(code: WeaveDocumentErrorCode, message: string) {
    super(message);
    this.name = "WeaveDocumentError";
    this.code = code;
  }
}

/**
 * Reject an oversized raw payload before anything parses it.
 *
 * UTF-8 bytes, not string length: "€" is one UTF-16 code unit and three bytes,
 * so a length check would let a payload three times the cap through. The
 * length check is kept as a cheap pre-filter — UTF-8 byte length is never less
 * than UTF-16 code-unit length, so `length > cap` already proves `bytes > cap`
 * without allocating an encoded copy of a hostile string.
 */
export function assertPayloadWithinLimit(raw: string): void {
  const overLimit =
    raw.length > LIMITS.payloadBytes || new TextEncoder().encode(raw).length > LIMITS.payloadBytes;
  if (overLimit) {
    throw new WeaveDocumentError(
      "payload",
      `Document payload exceeds the ${LIMITS.payloadBytes}-byte limit.`,
    );
  }
}

/**
 * Walk the raw input once, cheaply, refusing anything that would make the real
 * parse expensive. Aborts on the first breach, so a hostile tree is never
 * fully traversed.
 *
 * `depth` counts nested Grid/Stack containers — the contract cap, unchanged
 * from the shipped `render_dashboard` limit. `nesting` counts raw object and
 * array levels and exists only to stop the walk itself overflowing the JS
 * stack: without it a chain of 20,000 ordinary objects raises a `RangeError`
 * that escapes as a 500 instead of a clean rejection.
 */
export function assertDocumentStructuralLimits(input: unknown): void {
  let objects = 0;

  const visit = (node: unknown, containers: number, nesting: number): void => {
    if (nesting > LIMITS.nesting) {
      throw new WeaveDocumentError(
        "nesting",
        `Document nests more than ${LIMITS.nesting} levels deep.`,
      );
    }
    if (node === null || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const item of node) visit(item, containers, nesting + 1);
      return;
    }

    objects += 1;
    if (objects > LIMITS.nodes) {
      throw new WeaveDocumentError("nodes", `Document contains more than ${LIMITS.nodes} nodes.`);
    }

    const type = (node as { type?: unknown }).type;
    const nextContainers = type === "Grid" || type === "Stack" ? containers + 1 : containers;
    if (nextContainers > LIMITS.depth) {
      throw new WeaveDocumentError(
        "depth",
        `Nested Grid/Stack depth exceeds the ${LIMITS.depth}-container limit. Flatten the composition.`,
      );
    }

    for (const value of Object.values(node)) visit(value, nextContainers, nesting + 1);
  };

  visit(input, 0, 0);
}

// --- cross-field rules ---------------------------------------------------

type Path = (string | number)[];
type Node = Record<string, unknown>;

/**
 * Every node in a parsed document, with its path.
 *
 * Generic rather than a switch on `type` so a primitive added in a later wave
 * is covered without anyone remembering to update this. The one exception is a
 * Chart's `data`: those records are caller-supplied key/value pairs, not
 * nodes, and a series legitimately named `id` or `type` would otherwise be
 * read as node identity. Chart data has its own rule below.
 */
function eachNode(value: unknown, path: Path, visit: (node: Node, path: Path) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      eachNode(item, [...path, i], visit);
    });
    return;
  }
  if (value === null || typeof value !== "object") return;

  const node = value as Node;
  visit(node, path);

  const skipData = node.type === "Chart";
  for (const [key, child] of Object.entries(node)) {
    if (skipData && key === "data") continue;
    eachNode(child, [...path, key], visit);
  }
}

function addSemanticIssues(document: WeaveDocumentV1, ctx: z.RefinementCtx): void {
  const seenIds = new Set<string>();

  eachNode(document.root, ["root"], (node, path) => {
    // Document-wide id uniqueness. Only typed nodes carry identity; a bare
    // object (a table header, a chart record) does not.
    if (typeof node.type === "string" && typeof node.id === "string") {
      if (seenIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [...path, "id"],
          message: `Duplicate node id "${node.id}". Ids must be unique across the whole document.`,
        });
      } else {
        seenIds.add(node.id);
      }
    }

    // Exactly one cell per header.
    if (node.type === "TableCard") {
      const headers = node.headers as unknown[];
      const rows = node.rows as Array<{ cells?: unknown[] }>;
      rows.forEach((row, i) => {
        const cells = row.cells?.length ?? 0;
        if (cells !== headers.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, "rows", i, "cells"],
            message: `Row ${i} has ${cells} cells but the table declares ${headers.length} headers. Every row needs exactly one cell per header.`,
          });
        }
      });
    }

    // Chart data keys must be fields the chart actually declared. An
    // undeclared key is payload the chart will never plot.
    if (node.type === "Chart") {
      const categoryKey = node.categoryKey as string | undefined;
      const valueKeys = node.valueKeys as string[] | undefined;
      if (categoryKey === undefined && valueKeys === undefined) return;

      const declared = new Set<string>(valueKeys ?? []);
      if (categoryKey !== undefined) declared.add(categoryKey);

      const data = (node.data ?? []) as Array<Record<string, unknown>>;
      data.forEach((datum, i) => {
        for (const key of Object.keys(datum)) {
          if (declared.has(key)) continue;
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, "data", i, key],
            message: `Chart data key "${key}" is neither the categoryKey nor a declared series. Declare it in valueKeys or remove it.`,
          });
        }
      });
    }
  });
}

// --- the document schema and its entry points ---------------------------

/**
 * The envelope. `.strict()` is deliberate: an unrecognised top-level key is a
 * caller who believes this format does something it does not, and silently
 * dropping it hides that.
 */
export const WeaveDocumentV1Schema = z
  .object({
    weave: z.literal(WEAVE_DOCUMENT_VERSION),
    root: RootSpecSchema,
  })
  .strict()
  .superRefine(addSemanticIssues) as unknown as z.ZodType<WeaveDocumentV1>;

/**
 * The canonical gate. Applies cost policy, then shape, then cross-field rules.
 *
 * @throws {WeaveDocumentError} payload/depth/node/nesting policy breach
 * @throws {z.ZodError} shape, bounds or cross-field rule breach
 */
export function validateWeaveDocument(input: unknown): WeaveDocumentV1 {
  assertDocumentStructuralLimits(input);
  return WeaveDocumentV1Schema.parse(input);
}

/**
 * The same gate for a transport holding raw text: size is checked before the
 * JSON is parsed, so an oversized body is refused without materialising it.
 */
export function parseWeaveDocumentJson(raw: string): WeaveDocumentV1 {
  assertPayloadWithinLimit(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new WeaveDocumentError("malformed", "Document payload is not valid JSON.");
  }
  return validateWeaveDocument(parsed);
}

/**
 * Wrap a pre-Wave-1 bare spec in a v1 envelope.
 *
 * @deprecated Emit a `WeaveDocumentV1` directly. This adapter exists for the
 * documented migration period and will be removed once consumers have moved;
 * see `docs/specs/weave-document-v1.md`.
 *
 * It **wraps, it does not repair**. A legacy spec that was accepted by the old
 * permissive union but is not a valid document — a bare atom, a bare
 * `DataRow`, a ragged table — is rejected here rather than reinterpreted into
 * something that renders. Silently making malformed input render is how a
 * contract stops being one.
 */
export function legacySpecToDocumentV1(spec: unknown): WeaveDocumentV1 {
  if (spec !== null && typeof spec === "object" && !Array.isArray(spec) && "weave" in spec) {
    throw new WeaveDocumentError(
      "already-versioned",
      "This value is already a versioned Weave document; pass it to validateWeaveDocument instead of the legacy adapter.",
    );
  }
  return validateWeaveDocument({ weave: WEAVE_DOCUMENT_VERSION, root: spec });
}
