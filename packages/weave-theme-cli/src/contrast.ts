import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { knownVarsFromManifest, validateThemeCss } from "@shepherd-creative/weave-tokens/validate";
import type { RGBA } from "./color.js";
import { compositeOver, contrastRatio, parseColor } from "./color.js";
import type { Finding, LintCode } from "./types.js";

export type ContrastCheckEntry = {
  fg: string;
  bg: string;
  /** The resolved colour value the foreground side was compared as (e.g. "#ede3cc"). */
  fgValue: string;
  /** The resolved colour value the background side was compared as. */
  bgValue: string;
  ratio: number;
  /**
   * The threshold the ratio was judged against for the reported `status`:
   * the pair's error floor when status is "error", otherwise the pair's
   * warning target (which an "ok" entry met and a "warning" entry missed).
   */
  threshold: number;
  status: "ok" | "warning" | "error";
};

export type SkippedContrastEntry = {
  fg: string;
  bg: string;
  reason: string;
};

export type ContrastResult = {
  findings: Finding[];
  checked: ContrastCheckEntry[];
  skipped: SkippedContrastEntry[];
};

type VarResolution =
  | { kind: "value"; value: string }
  | { kind: "unset" }
  | { kind: "unparseable"; reason: string };

const VAR_REF_RE = /^var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([\s\S]+?)\s*)?\)$/i;

/**
 * Resolves a theme variable's value one level deep: `--name` is looked up in
 * the theme, then the defaults map. If that value is itself
 * `var(--other[, fallback])`, `--other` is looked up the same way (theme,
 * then defaults, then the var()'s own fallback literal), but if THAT value
 * is *also* `var(...)`, resolution stops and reports unparseable.
 *
 * The depth-1 cap is a deliberate spec choice, not a shortcut: chasing
 * indirection indefinitely both complicates the tool and risks looping on a
 * theme that (accidentally or not) defines a var() cycle. One hop covers the
 * realistic case, a theme setting `--primary-foreground: var(--background)`,
 * without open-ended graph traversal.
 */
export function resolveVar(
  name: string,
  theme: ReadonlyMap<string, string>,
  defaults: ReadonlyMap<string, string>,
): VarResolution {
  const raw = theme.get(name) ?? defaults.get(name);
  if (raw === undefined) return { kind: "unset" };

  const ref = raw.match(VAR_REF_RE);
  if (!ref) return { kind: "value", value: raw };

  const otherName = ref[1];
  const fallback = ref[2];
  if (!otherName) return { kind: "unparseable", reason: `${name}: malformed var()` };

  const otherRaw = theme.get(otherName) ?? defaults.get(otherName);
  if (otherRaw !== undefined) {
    if (VAR_REF_RE.test(otherRaw)) {
      return {
        kind: "unparseable",
        reason: `${name} resolves to ${otherName}, which is itself var() (depth > 1)`,
      };
    }
    return { kind: "value", value: otherRaw };
  }
  if (fallback !== undefined) {
    if (VAR_REF_RE.test(fallback)) {
      return {
        kind: "unparseable",
        reason: `${name} var() fallback is itself var() (depth > 1)`,
      };
    }
    return { kind: "value", value: fallback };
  }
  return { kind: "unparseable", reason: `${name} references undefined ${otherName}` };
}

/** Parses the `--name: value;` lines out of a sanitised `:root { ... }` block (validateThemeCss's `css` output). */
export function parseVarMap(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const match of css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    const name = match[1];
    const value = match[2]?.trim();
    if (name && value !== undefined) map.set(name, value);
  }
  return map;
}

let cachedDefaults: Map<string, string> | null = null;

/**
 * The shipped default theme (`@shepherd-creative/weave-tokens/tokens.css`),
 * parsed into a name -> value map: the fallback side of any contrast pair
 * the brand theme only half-overrides. Resolved via `require.resolve`
 * against the installed package (a real dependency of this package) rather
 * than a relative path. Runtime filesystem access is fine here; this is a
 * Node CLI, not the sandboxed MCP App render path.
 */
export function loadDefaultVarMap(): Map<string, string> {
  if (cachedDefaults) return cachedDefaults;
  const require = createRequire(import.meta.url);
  const cssPath = require.resolve("@shepherd-creative/weave-tokens/tokens.css");
  const source = readFileSync(cssPath, "utf8");
  // tokens.css is the same restricted subset a brand theme is: running it
  // through the identical validator both sanitises it and gives us the
  // exact `--name: value;` text parseVarMap already knows how to read.
  const result = validateThemeCss(source, knownVarsFromManifest());
  if (!result.ok) {
    // Invariant violation, not a user error: the package's own shipped
    // default stylesheet must always pass its own validator. Failing loud
    // (cli.ts's top-level catch maps this to exit 2) beats silently linting
    // against an empty defaults map, which would quietly skip every
    // half-themed contrast pair.
    throw new Error(
      `weave-theme-cli: shipped tokens.css failed validation: ${result.errors.join("; ")}`,
    );
  }
  cachedDefaults = parseVarMap(result.css);
  return cachedDefaults;
}

type PairSpec = {
  bg: string;
  fg: string;
  errorThreshold?: number;
  warnThreshold: number;
  errorCode?: LintCode;
  warnCode: LintCode;
};

const TEXT_PAIR_NAMES: ReadonlyArray<readonly [bg: string, fg: string]> = [
  ["--background", "--foreground"],
  ["--card", "--card-foreground"],
  ["--popover", "--popover-foreground"],
  ["--primary", "--primary-foreground"],
  ["--secondary", "--secondary-foreground"],
  ["--destructive", "--destructive-foreground"],
];

const TONE_NAMES = ["--tone-positive", "--tone-negative", "--tone-warning", "--tone-info"];

// Thresholds, named for what they mean rather than repeated as bare numbers.
// Text pairs get both a hard floor (error) and a WCAG AA target (warning);
// non-text roles (muted text, tone accents) get the 3:1 large-text/graphics
// target as a warning only; chart series just need to be visibly present.
const TEXT_CONTRAST_FLOOR = 3.0;
const TEXT_CONTRAST_TARGET = 4.5;
const NON_TEXT_TARGET = 3.0;
const CHART_VISIBILITY_FLOOR = 1.5;

function buildPairs(): PairSpec[] {
  const textPairs: PairSpec[] = TEXT_PAIR_NAMES.map(([bg, fg]) => ({
    bg,
    fg,
    errorThreshold: TEXT_CONTRAST_FLOOR,
    warnThreshold: TEXT_CONTRAST_TARGET,
    errorCode: "CONTRAST_FAIL",
    warnCode: "CONTRAST_LOW",
  }));

  const mutedPairs: PairSpec[] = ["--background", "--card"].map((bg) => ({
    bg,
    fg: "--muted-foreground",
    warnThreshold: NON_TEXT_TARGET,
    warnCode: "CONTRAST_LOW",
  }));

  const tonePairs: PairSpec[] = TONE_NAMES.flatMap((fg) =>
    ["--background", "--card"].map((bg) => ({
      bg,
      fg,
      warnThreshold: NON_TEXT_TARGET,
      warnCode: "CONTRAST_LOW" as const,
    })),
  );

  // --chart-3..8 are deliberately unchecked: a series-capped brand (e.g. an
  // editorial theme with a one- or two-colour palette) legitimately lets the
  // palette tail fade toward invisibility on its own surface; compositions
  // built for that brand are expected to cap series count too (that's a
  // DESIGN.md guidance concern, not a theme-CSS one). Only the first two
  // series, which every chart uses regardless of brand, are checked.
  const chartPairs: PairSpec[] = ["--chart-1", "--chart-2"].map((fg) => ({
    bg: "--card",
    fg,
    warnThreshold: CHART_VISIBILITY_FLOOR,
    warnCode: "CHART_INVISIBLE",
  }));

  return [...textPairs, ...mutedPairs, ...tonePairs, ...chartPairs];
}

const PAIRS = buildPairs();

/** Human-readable reason a single side of a pair couldn't be evaluated, or null if it's fine. */
function sideSkipReason(varName: string, res: VarResolution, color: RGBA | null): string | null {
  if (res.kind === "unparseable") return res.reason;
  if (res.kind === "unset") return `${varName}: no value in theme or defaults`;
  if (!color) return `${varName}: unparseable colour value "${res.value}"`;
  return null;
}

/**
 * Runs every contrast-pair check against a theme's applied variables.
 *
 * `theme` is the linted theme's own name -> value map (APPLIED vars only;
 * see parseVarMap / validateThemeCss). `defaults` is the shipped default
 * theme, used to fill in whichever side of a pair the brand theme didn't
 * touch. A pair where NEITHER side is themed is skipped outright: the
 * defaults are pre-reviewed, so re-checking the stock pairing on every lint
 * run would just be noise.
 */
export function runContrastChecks(
  theme: ReadonlyMap<string, string>,
  defaults: ReadonlyMap<string, string>,
): ContrastResult {
  const findings: Finding[] = [];
  const checked: ContrastCheckEntry[] = [];
  const skipped: SkippedContrastEntry[] = [];

  for (const pair of PAIRS) {
    const themed = theme.has(pair.bg) || theme.has(pair.fg);
    if (!themed) continue;

    const bgRes = resolveVar(pair.bg, theme, defaults);
    const fgRes = resolveVar(pair.fg, theme, defaults);
    const bgColor = bgRes.kind === "value" ? parseColor(bgRes.value) : null;
    const fgColor = fgRes.kind === "value" ? parseColor(fgRes.value) : null;

    const bgReason = sideSkipReason(pair.bg, bgRes, bgColor);
    const fgReason = sideSkipReason(pair.fg, fgRes, fgColor);
    if (bgReason || fgReason || !bgColor || !fgColor) {
      skipped.push({
        fg: pair.fg,
        bg: pair.bg,
        reason: [bgReason, fgReason].filter((r): r is string => r !== null).join("; "),
      });
      continue;
    }

    // A translucent background has no single effective colour; what the
    // reader actually sees depends on whatever surface sits beneath it,
    // which this tool cannot know. compositeOver's opaque-base assumption
    // only holds for genuinely opaque backgrounds, so computing a ratio
    // here would report a number that may be badly wrong in situ. Skip,
    // with the reason on record.
    if (bgColor.a < 1) {
      skipped.push({
        fg: pair.fg,
        bg: pair.bg,
        reason: `${pair.bg}: translucent background; effective colour depends on the surface beneath`,
      });
      continue;
    }

    const fgValue = fgRes.kind === "value" ? fgRes.value : "";
    const bgValue = bgRes.kind === "value" ? bgRes.value : "";
    const base = { r: bgColor.r, g: bgColor.g, b: bgColor.b };
    const compositedFg = compositeOver(fgColor, base);
    const ratio = contrastRatio(compositedFg, base);
    const pairLabel = `${pair.fg} (${fgValue}) on ${pair.bg} (${bgValue})`;

    let status: "ok" | "warning" | "error" = "ok";
    let threshold = pair.warnThreshold;
    if (pair.errorThreshold !== undefined && ratio < pair.errorThreshold) {
      status = "error";
      threshold = pair.errorThreshold;
      findings.push({
        severity: "error",
        code: pair.errorCode ?? "CONTRAST_FAIL",
        message: `${pairLabel}: contrast ${ratio.toFixed(2)}:1 is below the ${pair.errorThreshold}:1 floor`,
        context: { fg: pair.fg, bg: pair.bg, fgValue, bgValue, ratio },
      });
    } else if (ratio < pair.warnThreshold) {
      status = "warning";
      findings.push({
        severity: "warning",
        code: pair.warnCode,
        message: `${pairLabel}: contrast ${ratio.toFixed(2)}:1 is below the ${pair.warnThreshold}:1 target`,
        context: { fg: pair.fg, bg: pair.bg, fgValue, bgValue, ratio },
      });
    }
    checked.push({ fg: pair.fg, bg: pair.bg, fgValue, bgValue, ratio, threshold, status });
  }

  return { findings, checked, skipped };
}
