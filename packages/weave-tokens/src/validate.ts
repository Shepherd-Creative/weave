import tokens from "../tokens.json";

export type ThemeValidation = {
  ok: boolean;
  /** sanitised CSS (empty when !ok) */
  css: string;
  /** variable names kept */
  applied: string[];
  /** unknown variable names removed */
  stripped: string[];
  /** hard-reject reasons */
  errors: string[];
};

const DECLARATION = /^(--[a-z0-9-]+)\s*:\s*([^;{}]+)$/i;
// Reject dangerous value tokens. The final `\\` alternative rejects ANY CSS
// ident-escape (backslash), which is load-bearing for security: without it the
// literal-token denylist above is trivially bypassed — e.g. `\75rl(...)`
// (`\75` = "u") is a valid url() token that the `url\s*\(` branch does not
// match, so it would pass validation and be re-emitted verbatim into the
// injected <style>, letting recharts pull the remote URL into an SVG fill via
// getComputedStyle (live exfiltration). `expr\65 ssion(...)` defeats the
// expression( branch the same way. No legitimate Weave theme token value needs
// CSS ident-escapes, so rejecting the backslash outright closes the whole class.
//
// NOTE: comment-collapsing (`/* */` -> space) above is NOT a security property —
// it is only a convenience so brand stylesheets may carry comments. Safety comes
// from this backslash reject plus the clean-reconstruction model (we re-emit only
// name/value pairs we have positively matched, never the raw source). Do not lean
// on the space-break behaviour of comment collapsing as if it sanitised anything.
const FORBIDDEN_VALUE = /(url\s*\(|expression\s*\(|javascript:|<|>|\\)/i;

/**
 * Deterministic restricted-subset validator for brand theme CSS.
 *
 * Accepts only comments and `:root { --custom-property: value; }` declarations.
 * Anything else (at-rules, other selectors, dangerous values) is a hard reject.
 * Unknown custom properties (not in `knownVars`) are silently stripped rather
 * than rejected, since a superset of variables from a brand stylesheet is
 * expected and not a security concern on its own.
 *
 * No CSS parser dependency: this is a restricted-subset grammar, not general
 * CSS parsing, so a hand-rolled regex pass is sufficient and keeps behaviour
 * fully deterministic.
 */
export function validateThemeCss(source: string, knownVars: ReadonlySet<string>): ThemeValidation {
  const errors: string[] = [];
  const noComments = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  const blockRe = /:root\s*\{([^{}]*)\}/g;
  const rest = noComments.replace(blockRe, " ").trim();
  if (rest.length > 0)
    errors.push(`unsupported content outside :root blocks: "${rest.slice(0, 80)}"`);

  const applied: string[] = [];
  const stripped: string[] = [];
  const kept: string[] = [];
  for (const block of noComments.matchAll(blockRe)) {
    const body = block[1] ?? "";
    for (const raw of body.split(";")) {
      const decl = raw.trim();
      if (!decl) continue;
      const m = decl.match(DECLARATION);
      if (!m) {
        errors.push(`not a custom-property declaration: "${decl.slice(0, 80)}"`);
        continue;
      }
      const name = m[1];
      const value = m[2];
      if (!name || value === undefined) {
        errors.push(`not a custom-property declaration: "${decl.slice(0, 80)}"`);
        continue;
      }
      if (FORBIDDEN_VALUE.test(value)) {
        errors.push(`forbidden value for ${name}`);
        continue;
      }
      if (!knownVars.has(name)) {
        stripped.push(name);
        continue;
      }
      applied.push(name);
      kept.push(`  ${name}: ${value.trim()};`);
    }
  }
  if (errors.length > 0) return { ok: false, css: "", applied: [], stripped, errors };
  return {
    ok: true,
    css: kept.length ? `:root {\n${kept.join("\n")}\n}` : "",
    applied,
    stripped,
    errors,
  };
}

// Size caps guard against a hostile or misconfigured host feeding a huge file
// into the render loop. The theme is a small :root block; the guidance is a
// short prose brief. Both caps are generous for legitimate content.
export const THEME_CSS_MAX_BYTES = 64 * 1024;
export const GUIDANCE_MAX_BYTES = 16 * 1024;

/**
 * Builds the set of known theme variable names from this package's own
 * `tokens.json` manifest (the current contract). Callers validating brand
 * theme CSS against the shipped token contract should use this rather than
 * re-deriving the set themselves.
 */
export function knownVarsFromManifest(): ReadonlySet<string> {
  return new Set(tokens.variables.map((v) => v.name));
}
