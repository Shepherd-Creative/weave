import { z } from "zod";
import { FiniteNumberSchema, LocaleSchema, NodeIdentity, TextSchema } from "./bounds.js";
import {
  AlignSchema,
  IconNameSchema,
  NumberFormatSchema,
  SizeSchema,
  ToneSchema,
} from "./tokens.js";

// --- Number ----------------------------------------------------------

export const NumberSchema = z
  .object({
    ...NodeIdentity,
    type: z.literal("Number"),
    value: FiniteNumberSchema,
    format: NumberFormatSchema.optional(),
    precision: z.number().int().min(0).max(10).optional(),
    currency: z.string().length(3).optional(),
    locale: LocaleSchema.optional(),
    size: SizeSchema.optional(),
    tone: ToneSchema.optional(),
    showSign: z.boolean().optional(),
  })
  .strict();
export type NumberSpec = z.infer<typeof NumberSchema>;

// --- Label -----------------------------------------------------------

export const LabelRoleSchema = z.enum(["display", "title", "body", "caption", "overline"]);

export const LabelSchema = z
  .object({
    ...NodeIdentity,
    type: z.literal("Label"),
    text: TextSchema,
    role: LabelRoleSchema.optional(),
    size: SizeSchema.optional(),
    tone: ToneSchema.optional(),
    align: AlignSchema.optional(),
  })
  .strict();
export type LabelSpec = z.infer<typeof LabelSchema>;

// --- Icon ------------------------------------------------------------

export const IconSchema = z
  .object({
    ...NodeIdentity,
    type: z.literal("Icon"),
    name: IconNameSchema,
    size: z.enum(["xs", "sm", "md", "lg"]).optional(),
    tone: ToneSchema.optional(),
  })
  .strict();
export type IconSpec = z.infer<typeof IconSchema>;
