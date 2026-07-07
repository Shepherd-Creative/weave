import { z } from "zod";

// Tone, size, density, icon vocabularies. See primitive-taxonomy.md §4.

export const ToneSchema = z.enum(["default", "muted", "positive", "negative", "warning", "info"]);
export type Tone = z.infer<typeof ToneSchema>;

export const SizeSchema = z.enum(["xs", "sm", "md", "lg", "xl"]);
export type Size = z.infer<typeof SizeSchema>;

export const SizeSmLgSchema = z.enum(["sm", "md", "lg"]);
export const SizeLgXlSchema = z.enum(["lg", "xl"]);

export const DensitySchema = z.enum(["compact", "comfortable", "spacious"]);
export type Density = z.infer<typeof DensitySchema>;

export const AlignSchema = z.enum(["start", "center", "end"]);
export const JustifySchema = z.enum(["start", "center", "end", "between"]);

export const NumberFormatSchema = z
  .enum(["int", "decimal", "currency", "percent", "compact"])
  .describe(
    'How the value renders. IMPORTANT: "percent" treats the value as a fraction of 1 — 0.034 renders as "3.4%", so 3.4 would render as "340%".',
  );
export type NumberFormat = z.infer<typeof NumberFormatSchema>;

// Curated icon set. Fixed list — the LLM cannot invent icon names.
// Any additions require a library release.
export const ICON_NAMES = [
  "trend-up",
  "trend-down",
  "trend-flat",
  "arrow-up",
  "arrow-down",
  "arrow-right",
  "check",
  "x",
  "info",
  "alert",
  "warning",
  "spark",
  "lightning",
  "clock",
  "calendar",
  "user",
  "users",
  "target",
  "flag",
  "chart-line",
  "chart-bar",
  "chart-pie",
  "grid",
  "list",
  "external-link",
  "filter",
  "search",
] as const;

export const IconNameSchema = z.enum(ICON_NAMES);
export type IconName = z.infer<typeof IconNameSchema>;

export const ChartVariantSchema = z.enum(["line", "bar", "horizontal-bar", "area", "pie", "donut"]);
export type ChartVariant = z.infer<typeof ChartVariantSchema>;
