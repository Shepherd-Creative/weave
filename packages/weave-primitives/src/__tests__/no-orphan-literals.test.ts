import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the contract-v2 sweep: every themeable inline-style literal in the 13
// component sources must live inside a `var(--weave-*, fallback)` reference or
// a resolve*/tone* helper call. A bare `#hex` or px/rem/em dimension outside
// those spans is an orphan the theming contract can't reach.

const SRC = path.resolve(__dirname, "..");

const COMPONENT_FILES = [
  "atoms/Icon.tsx",
  "atoms/Label.tsx",
  "atoms/Number.tsx",
  "molecules/Chart.tsx",
  "molecules/DataRow.tsx",
  "molecules/KPI.tsx",
  "molecules/Stat.tsx",
  "organisms/ChartCard.tsx",
  "organisms/MetricBand.tsx",
  "organisms/NoteCard.tsx",
  "organisms/TableCard.tsx",
  "layouts/Grid.tsx",
  "layouts/Stack.tsx",
];

// Structural / documented-orphan values that are intentionally not tokenised.
const ALLOWLIST: Record<string, string[]> = {
  "layouts/Grid.tsx": ["240px"], // minmax() responsive breakpoint, structural
  "organisms/MetricBand.tsx": ["180px"], // minmax() responsive breakpoint, structural
  "organisms/NoteCard.tsx": ["0.0625rem"], // inline-code hairline pad, intentionally untokenised
};

// Call-like spans whose arguments are theme-aware by construction (fallbacks
// passed to runtime var resolution) and so may legitimately contain literals.
const THEME_CALLS = ["var", "resolveCSSVar", "resolveFirstVar", "resolveChartColor", "toneToColor"];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/** Remove every `name( ... )` span (balanced parens, so nested calls like
 *  `var(--x, clamp(1rem, 8cqi, 3rem))` are consumed whole). */
function stripCallSpans(source: string, name: string): string {
  let out = "";
  let i = 0;
  const marker = `${name}(`;
  while (i < source.length) {
    const start = source.indexOf(marker, i);
    // Skip matches that are a suffix of a longer identifier (e.g. `chartVar(`).
    if (start > 0 && /[\w$]/.test(source[start - 1] as string)) {
      out += source.slice(i, start + marker.length);
      i = start + marker.length;
      continue;
    }
    if (start === -1) {
      out += source.slice(i);
      break;
    }
    out += source.slice(i, start);
    let depth = 0;
    let j = start;
    for (; j < source.length; j++) {
      if (source[j] === "(") depth++;
      else if (source[j] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    i = j + 1; // past the balanced close paren (or EOF if unbalanced)
  }
  return out;
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const DIMENSION_RE = /(?<![\w.-])\d[\d.]*(?:px|rem|em)\b/g;

describe("no orphan style literals outside the theming contract", () => {
  it.each(COMPONENT_FILES)("%s", (file) => {
    const raw = readFileSync(path.join(SRC, file), "utf8");
    let stripped = stripComments(raw);
    for (const call of THEME_CALLS) {
      stripped = stripCallSpans(stripped, call);
    }
    const allowed = new Set(ALLOWLIST[file] ?? []);
    const orphans = [
      ...(stripped.match(HEX_RE) ?? []),
      ...(stripped.match(DIMENSION_RE) ?? []),
    ].filter((lit) => !allowed.has(lit));
    expect(orphans, `un-tokenised literals in ${file}`).toEqual([]);
  });
});
