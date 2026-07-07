/**
 * Resolve a CSS custom property to its current computed hex/color string.
 *
 * Used by Recharts (and other libraries that don't accept `var(...)` in
 * specific props) — reads the host app's CSS variable at render time.
 * Safe in SSR: returns the fallback when `window` is unavailable.
 *
 * @param varName  Custom property name including the leading `--`, e.g. `--chart-1`.
 * @param fallback Colour to return if the variable isn't defined.
 */
export function resolveCSSVar(varName: string, fallback = "#888888"): string {
  if (typeof window === "undefined") return fallback;
  const root = document.documentElement;
  const value = getComputedStyle(root).getPropertyValue(varName).trim();
  return value.length > 0 ? value : fallback;
}

/**
 * Map tone → CSS var reference (for inline style usage).
 * Returns `var(--foreground)` for `default`, and tone-specific vars otherwise.
 */
export function toneToColorVar(
  tone: "default" | "muted" | "positive" | "negative" | "warning" | "info" | undefined,
): string {
  switch (tone) {
    case "muted":
      return "var(--muted-foreground)";
    case "positive":
      return "var(--tone-positive)";
    case "negative":
      return "var(--tone-negative)";
    case "warning":
      return "var(--tone-warning)";
    case "info":
      return "var(--tone-info)";
    case "default":
    case undefined:
      return "var(--foreground)";
  }
}

/**
 * Map tone → muted-background CSS var (for soft-variant fills).
 */
export function toneToMutedBgVar(
  tone: "default" | "muted" | "positive" | "negative" | "warning" | "info" | undefined,
): string {
  switch (tone) {
    case "positive":
      return "var(--tone-positive-muted)";
    case "negative":
      return "var(--tone-negative-muted)";
    case "warning":
      return "var(--tone-warning-muted)";
    case "info":
      return "var(--tone-info-muted)";
    case "default":
    case "muted":
    case undefined:
      return "var(--muted)";
  }
}

/**
 * Map an integer 0..7 (or higher wrapping) to `var(--chart-N)`.
 */
export function chartVarForIndex(i: number): string {
  const n = (i % 8) + 1;
  return `var(--chart-${n})`;
}

/**
 * Same as `chartVarForIndex` but resolves to a computed colour string.
 * Use inside Recharts props that don't accept CSS vars (fill/stroke).
 */
export function resolveChartColor(i: number, fallback = "#10b981"): string {
  const n = (i % 8) + 1;
  return resolveCSSVar(`--chart-${n}`, fallback);
}

/** Resolve the first defined CSS variable in the list, else the fallback. SSR-safe. */
export function resolveFirstVar(varNames: string[], fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const rootStyle = getComputedStyle(document.documentElement);
  for (const name of varNames) {
    const v = rootStyle.getPropertyValue(name).trim();
    if (v.length > 0) return v;
  }
  return fallback;
}
