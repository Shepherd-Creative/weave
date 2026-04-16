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

export const SpecSchema: z.ZodType<Spec> = z.lazy(() =>
  z.union([
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
  ]),
);
