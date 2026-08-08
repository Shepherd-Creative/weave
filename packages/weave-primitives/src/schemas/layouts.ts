import { z } from "zod";
import { LIMITS, NodeIdentity } from "./bounds.js";
import { AlignSchema, JustifySchema } from "./tokens.js";

// Forward-declared SpecSchema (defined in spec.ts) is needed as the child
// type for Grid/Stack. We declare a lazy placeholder here and the caller
// wires it up in spec.ts. Typed as z.ZodTypeAny intentionally to avoid the
// dependency cycle; the runtime discriminator on each child's `.type` is
// what actually validates. Full type safety is enforced at the SpecSchema
// level in spec.ts.

export type LayoutChild = { type: string; [key: string]: unknown };

export const makeGridSchema = (childSchema: z.ZodTypeAny) =>
  z.object({
    ...NodeIdentity,
    type: z.literal("Grid"),
    cols: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal("auto")])
      .optional(),
    gap: z.enum(["sm", "md", "lg"]).optional(),
    children: z.array(childSchema).max(LIMITS.layoutChildren),
  });

export const makeStackSchema = (childSchema: z.ZodTypeAny) =>
  z.object({
    ...NodeIdentity,
    type: z.literal("Stack"),
    direction: z.enum(["vertical", "horizontal"]).optional(),
    gap: z.enum(["sm", "md", "lg"]).optional(),
    align: z.enum(["start", "center", "end", "stretch"]).optional(),
    justify: JustifySchema.optional(),
    children: z.array(childSchema).max(LIMITS.layoutChildren),
  });

// Exported inferred types (static shape — layouts are recursive via children).
export type GridSpec = {
  id?: string;
  type: "Grid";
  cols?: 1 | 2 | 3 | 4 | "auto";
  gap?: "sm" | "md" | "lg";
  children: LayoutChild[];
};

export type StackSpec = {
  id?: string;
  type: "Stack";
  direction?: "vertical" | "horizontal";
  gap?: "sm" | "md" | "lg";
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
  children: LayoutChild[];
};

// Re-export AlignSchema for symmetry with other schema modules.
export { AlignSchema };
