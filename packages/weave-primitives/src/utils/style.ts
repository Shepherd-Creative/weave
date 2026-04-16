import type { Size } from "../schemas/tokens.js";

/**
 * Font size for Number / KPI value rendering. `xl` uses CSS clamp so it
 * scales with viewport for hero numbers.
 */
export function numberFontSize(size: Size | undefined): string {
  switch (size) {
    case "xs":
      return "0.75rem";
    case "sm":
      return "0.875rem";
    case "md":
      return "1.5rem";
    case "lg":
      return "2.25rem";
    case "xl":
      return "clamp(2.5rem, 5vw, 4rem)";
    default:
      return "1.5rem";
  }
}

/** Font size for Label atom and caption/body copy. */
export function labelFontSize(size: Size | undefined, role?: string): string {
  if (role === "display") return "clamp(2rem, 4vw, 3rem)";
  if (role === "overline") return "0.6875rem";
  if (role === "caption") return "0.75rem";
  switch (size) {
    case "xs":
      return "0.75rem";
    case "sm":
      return "0.875rem";
    case "lg":
      return "1.125rem";
    case "xl":
      return "1.25rem";
    case "md":
    default:
      return "1rem";
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
      return "0.5rem";
    case "lg":
      return "1.5rem";
    case "md":
    default:
      return "1rem";
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
      return "0.5rem";
    case "spacious":
      return "1.5rem";
    case "comfortable":
    default:
      return "1rem";
  }
}

/**
 * Role → CSS font-weight / letter-spacing tweaks for Label.
 */
export function labelRoleStyle(role: string | undefined): {
  fontWeight: number;
  letterSpacing?: string;
  textTransform?: "uppercase" | "none";
} {
  switch (role) {
    case "display":
      return { fontWeight: 700, letterSpacing: "-0.025em" };
    case "title":
      return { fontWeight: 600 };
    case "overline":
      return { fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" };
    case "caption":
      return { fontWeight: 500 };
    case "body":
    default:
      return { fontWeight: 400 };
  }
}
