import { z } from "zod";
import {
  AlignSchema,
  IconNameSchema,
  NumberFormatSchema,
  SizeSchema,
  ToneSchema,
} from "./tokens.js";

// --- Number ----------------------------------------------------------

export const NumberSchema = z.object({
  type: z.literal("Number"),
  value: z.number(),
  format: NumberFormatSchema.optional(),
  precision: z.number().int().min(0).max(10).optional(),
  currency: z.string().length(3).optional(),
  locale: z.string().optional(),
  size: SizeSchema.optional(),
  tone: ToneSchema.optional(),
  showSign: z.boolean().optional(),
});
export type NumberSpec = z.infer<typeof NumberSchema>;

// --- Label -----------------------------------------------------------

export const LabelRoleSchema = z.enum([
  "display",
  "title",
  "body",
  "caption",
  "overline",
]);

export const LabelSchema = z.object({
  type: z.literal("Label"),
  text: z.string(),
  role: LabelRoleSchema.optional(),
  size: SizeSchema.optional(),
  tone: ToneSchema.optional(),
  align: AlignSchema.optional(),
});
export type LabelSpec = z.infer<typeof LabelSchema>;

// --- Icon ------------------------------------------------------------

export const IconSchema = z.object({
  type: z.literal("Icon"),
  name: IconNameSchema,
  size: z.enum(["xs", "sm", "md", "lg"]).optional(),
  tone: ToneSchema.optional(),
});
export type IconSpec = z.infer<typeof IconSchema>;
