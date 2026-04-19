import { z } from "zod";
import { IconSchema, LabelSchema, NumberSchema } from "./atoms.js";
import {
  ChartSchema,
  DataRowSchema,
  KPISchema,
  StatSchema,
} from "./molecules.js";
import {
  ChartCardSchema,
  MetricBandSchema,
  NoteCardSchema,
  TableCardSchema,
} from "./organisms.js";
import {
  type GridSpec,
  type StackSpec,
  makeGridSchema,
  makeStackSchema,
} from "./layouts.js";
import type {
  ChartSpec,
  DataRowSpec,
  KPISpec,
  StatSpec,
} from "./molecules.js";
import type {
  ChartCardSpec,
  MetricBandSpec,
  NoteCardSpec,
  TableCardSpec,
} from "./organisms.js";
import type { IconSpec, LabelSpec, NumberSpec } from "./atoms.js";

/**
 * Spec: the full discriminated union of every primitive the LLM may emit.
 *
 * Grid and Stack are recursive — their children can be any Spec, including
 * other Grid/Stack. We model this with `z.lazy()` wiring the layout schemas
 * to the full SpecSchema at construction time.
 */
export type Spec =
  | NumberSpec
  | LabelSpec
  | IconSpec
  | KPISpec
  | StatSpec
  | DataRowSpec
  | ChartSpec
  | MetricBandSpec
  | ChartCardSpec
  | TableCardSpec
  | NoteCardSpec
  | GridSpec
  | StackSpec;

// Lazy reference resolves to SpecSchema below. This is what layouts consume.
const LazySpecSchema: z.ZodType<Spec> = z.lazy(() => SpecSchema);

export const GridSchema: z.ZodType<GridSpec> = makeGridSchema(
  LazySpecSchema,
) as z.ZodType<GridSpec>;
export const StackSchema: z.ZodType<StackSpec> = makeStackSchema(
  LazySpecSchema,
) as z.ZodType<StackSpec>;

// `z.discriminatedUnion("type", [...])` collapses parse cost from O(13^N) to
// O(N) on deeply-nested Grid/Stack trees by branching on the `type` literal
// instead of trying every member. Every member schema below declares
// `type: z.literal(...)` so the discriminator is present in all branches.
//
// The variance cast below is needed because `GridSchema` / `StackSchema` are
// declared as `z.ZodType<...>` (type-erased through `z.lazy()`), which Zod's
// `discriminatedUnion` signature does not statically recognise as
// `ZodDiscriminatedUnionOption`. At runtime both schemas still carry the
// `type: z.literal(...)` shape the union needs, so the cast is sound.
//
// See docs/plans/a5-mcp-stress-test-results.md §F1 — depth-20 specs used to
// OOM the Node process at ~29 s; with the discriminator, depth-20 specs
// parse in <1 ms.
export const SpecSchema: z.ZodType<Spec> = z.lazy(() =>
  // GridSchema / StackSchema are `z.ZodType<...>` (type-erased through
  // z.lazy), so TS can't prove they satisfy ZodDiscriminatedUnionOption<"type">.
  // At runtime every member still has `type: z.literal(...)`, which is all
  // discriminatedUnion needs to branch correctly.
  // @ts-expect-error — variance on the members tuple; see comment above
  z.discriminatedUnion("type", [
    NumberSchema,
    LabelSchema,
    IconSchema,
    KPISchema,
    StatSchema,
    DataRowSchema,
    ChartSchema,
    MetricBandSchema,
    ChartCardSchema,
    TableCardSchema,
    NoteCardSchema,
    GridSchema,
    StackSchema,
  ]) as unknown as z.ZodType<Spec>,
);
