import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

/**
 * Per-bucket variable coverage for a theme.
 *
 * Buckets come from tokens.json's `category` field, with one split: the
 * manifest's `chart` category covers both the 8-colour series palette
 * (`--chart-1`..`--chart-8`) and the chart *treatment* variables (grid,
 * axis, tooltip, stroke width, ...). Those have very different fidelity
 * expectations: a brand with a two-colour palette is a legitimate design
 * choice, but a missing chart grid colour is just an oversight, so they're
 * reported as separate buckets: `palette` and `chart-treatment`.
 */
export type CoverageBucket = {
  name: string;
  total: number;
  set: number;
  missing: string[];
  /** Enforced buckets turn a missing variable into a COVERAGE_INCOMPLETE finding. */
  enforced: boolean;
};

const PALETTE_RE = /^--chart-[1-8]$/;

// Buckets where a Weave theme must supply every variable. Anything else
// (typography, spacing, surface, chart-treatment) is report-only: partial
// coverage there is a legitimate brand choice (e.g. a monospace-only theme
// has nothing to say about `--font-display`), not an authoring mistake.
const ENFORCED_BUCKETS: ReadonlySet<string> = new Set(["structural", "tone", "palette"]);

// Deterministic, human-sensible ordering for the coverage table / JSON output.
const BUCKET_ORDER = [
  "structural",
  "tone",
  "palette",
  "chart-treatment",
  "typography",
  "spacing",
  "surface",
];

function bucketFor(category: string, name: string): string {
  if (category !== "chart") return category;
  return PALETTE_RE.test(name) ? "palette" : "chart-treatment";
}

type TokensManifest = { version: number; variables: Array<{ name: string; category: string }> };

let cachedManifest: TokensManifest | null = null;

/**
 * Loads the shipped tokens.json manifest via `require.resolve` against the
 * installed package, mirroring how contrast.ts resolves tokens.css.
 *
 * Deliberately NOT a static `import tokens from ".../tokens.json"`: that
 * form typechecks fine (resolveJsonModule + moduleResolution: bundler) and
 * even survives tsup's bundling with @shepherd-creative/weave-tokens marked
 * external, but fails at actual `node dist/cli.js` runtime: Node's ESM
 * loader requires a `with { type: "json" }` import attribute on a bare JSON
 * import, which an externalised import specifier doesn't carry. Resolving
 * and JSON.parse-ing at runtime sidesteps that entirely.
 */
function loadManifest(): TokensManifest {
  if (cachedManifest) return cachedManifest;
  const require = createRequire(import.meta.url);
  const manifestPath = require.resolve("@shepherd-creative/weave-tokens/tokens.json");
  cachedManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as TokensManifest;
  return cachedManifest;
}

/** Splits tokens.json's manifest into coverage buckets, keyed by variable name. */
function manifestBuckets(): Map<string, string[]> {
  const buckets = new Map<string, string[]>();
  for (const variable of loadManifest().variables) {
    const bucket = bucketFor(variable.category, variable.name);
    const names = buckets.get(bucket) ?? [];
    names.push(variable.name);
    buckets.set(bucket, names);
  }
  return buckets;
}

/**
 * Computes per-bucket coverage over a theme's APPLIED variables (i.e. the
 * names `validateThemeCss` accepted; stripped/rejected declarations don't
 * count as "set", by design: they never reach the rendered CSS).
 */
export function computeCoverage(applied: ReadonlySet<string>): CoverageBucket[] {
  const buckets = manifestBuckets();
  const result: CoverageBucket[] = [];
  for (const [name, names] of buckets) {
    const missing = names.filter((n) => !applied.has(n));
    result.push({
      name,
      total: names.length,
      set: names.length - missing.length,
      missing,
      enforced: ENFORCED_BUCKETS.has(name),
    });
  }
  result.sort((a, b) => bucketRank(a.name) - bucketRank(b.name));
  return result;
}

/**
 * Sort rank for a bucket, with unknown buckets (a future tokens.json
 * category this list hasn't caught up with) sinking to the end of the table
 * instead of indexOf's -1 floating them to the top.
 */
function bucketRank(name: string): number {
  const index = BUCKET_ORDER.indexOf(name);
  return index === -1 ? BUCKET_ORDER.length : index;
}
