import type { Size } from "../schemas/tokens.js";

/**
 * Font size for Number / KPI value rendering. `xl` uses CSS clamp with
 * container-query units (`cqi` = 1% of the nearest sized container's inline-size)
 * so hero numbers scale with their card, not the viewport. The containing
 * element (e.g. KPI root) must declare `container-type: inline-size`.
 */
export function numberFontSize(size: Size | undefined): string {
  switch (size) {
    case "xs":
      return "var(--weave-font-size-xs, 0.75rem)";
    case "sm":
      return "var(--weave-font-size-sm, 0.875rem)";
    case "md":
      return "var(--weave-font-size-number-md, 1.5rem)";
    case "lg":
      return "var(--weave-font-size-number-lg, 2.25rem)";
    case "xl":
      return "var(--weave-font-size-number-xl, clamp(1.75rem, 8cqi, 3.25rem))";
    default:
      return "var(--weave-font-size-number-md, 1.5rem)";
  }
}

/** Font size for Label atom and caption/body copy. */
export function labelFontSize(size: Size | undefined, role?: string): string {
  if (role === "display") return "var(--weave-font-size-display, clamp(1.5rem, 6cqi, 2.5rem))";
  if (role === "overline") return "var(--weave-font-size-overline, 0.6875rem)";
  if (role === "caption") return "var(--weave-font-size-xs, 0.75rem)";
  switch (size) {
    case "xs":
      return "var(--weave-font-size-xs, 0.75rem)";
    case "sm":
      return "var(--weave-font-size-sm, 0.875rem)";
    case "lg":
      return "var(--weave-font-size-lg, 1.125rem)";
    case "xl":
      return "var(--weave-font-size-xl, 1.25rem)";
    case "md":
    default:
      return "var(--weave-font-size-md, 1rem)";
  }
}

/** Icon pixel size. */
export function iconPixelSize(size: "xs" | "sm" | "md" | "lg" | undefined): number {
  switch (size) {
    case "xs":
      return 12;
    case "sm":
      return 16;
    case "lg":
      return 24;
    case "md":
    default:
      return 20;
  }
}

/** Grid / Stack gap → CSS gap string. */
export function gapValue(gap: "sm" | "md" | "lg" | undefined): string {
  switch (gap) {
    case "sm":
      return "var(--weave-space-sm, 0.5rem)";
    case "lg":
      return "var(--weave-space-xl, 1.5rem)";
    case "md":
    default:
      return "var(--weave-space-lg, 1rem)";
  }
}

/** Chart container height by semantic size. */
export function chartHeight(h: "sm" | "md" | "lg" | undefined): number {
  switch (h) {
    case "sm":
      return 160;
    case "lg":
      return 360;
    case "md":
    default:
      return 240;
  }
}

/** Density → internal padding. */
export function densityPadding(
  density: "compact" | "comfortable" | "spacious" | undefined,
): string {
  switch (density) {
    case "compact":
      return "var(--weave-density-compact, 0.5rem)";
    case "spacious":
      return "var(--weave-density-spacious, 1.5rem)";
    case "comfortable":
    default:
      return "var(--weave-density-comfortable, 1rem)";
  }
}

/**
 * Role → CSS font-weight / letter-spacing tweaks for Label.
 */
export function labelRoleStyle(role: string | undefined): {
  fontWeight: string;
  letterSpacing?: string;
  textTransform?: "uppercase" | "none";
} {
  switch (role) {
    case "display":
      return {
        fontWeight: "var(--weave-font-weight-bold, 700)",
        letterSpacing: "var(--weave-letter-spacing-tight, -0.025em)",
      };
    case "title":
      return { fontWeight: "var(--weave-font-weight-semibold, 600)" };
    case "overline":
      return {
        fontWeight: "var(--weave-font-weight-medium, 500)",
        letterSpacing: "var(--weave-letter-spacing-overline, 0.08em)",
        textTransform: "uppercase",
      };
    case "caption":
      return { fontWeight: "var(--weave-font-weight-medium, 500)" };
    case "body":
    default:
      return { fontWeight: "var(--weave-font-weight-normal, 400)" };
  }
}
