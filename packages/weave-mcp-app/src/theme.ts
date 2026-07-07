import { readFileSync, statSync } from "node:fs";
import tokens from "@shepherd-creative/weave-tokens/tokens.json";

export type ThemeValidation = {
  ok: boolean;
  css: string; // sanitised CSS (empty when !ok)
  applied: string[]; // variable names kept
  stripped: string[]; // unknown variable names removed
  errors: string[]; // hard-reject reasons
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
const THEME_CSS_MAX_BYTES = 64 * 1024;
const GUIDANCE_MAX_BYTES = 16 * 1024;

// Built once from the shipped token manifest. esbuild inlines tokens.json into
// the server bundle, so this needs no filesystem access at runtime.
const KNOWN_THEME_VARS: ReadonlySet<string> = new Set(tokens.variables.map((v) => v.name));

export type DesignSources = {
  themeCss: string | null;
  guidance: string | null;
  diagnostics: string[];
};

/**
 * Loads the optional host-configured design sources from the environment.
 *
 * `WEAVE_THEME_CSS_PATH` points at a restricted-subset brand stylesheet; it is
 * size-capped, then validated by validateThemeCss and reduced to only known
 * token variables. `WEAVE_DESIGN_GUIDANCE_PATH` points at a plain-text brand
 * composition brief, appended to the skill.
 *
 * Every failure is non-fatal: on any problem the corresponding output is null
 * and a human-readable diagnostic is pushed. This NEVER throws — the app must
 * boot with default theming even when the host misconfigures a path. Diagnostics
 * are for the caller to route to stderr; they must never reach stdout in stdio
 * mode (that is the JSON-RPC channel).
 */
export function loadDesignSources(env: NodeJS.ProcessEnv): DesignSources {
  const diagnostics: string[] = [];

  let themeCss: string | null = null;
  const themePath = env.WEAVE_THEME_CSS_PATH;
  if (themePath) {
    try {
      const bytes = statSync(themePath).size;
      if (bytes > THEME_CSS_MAX_BYTES) {
        diagnostics.push(
          `${themePath}: theme CSS is ${bytes} bytes, over the ${THEME_CSS_MAX_BYTES}-byte cap; falling back to default`,
        );
      } else {
        const source = readFileSync(themePath, "utf-8");
        const result = validateThemeCss(source, KNOWN_THEME_VARS);
        if (!result.ok) {
          diagnostics.push(
            `${themePath}: invalid theme CSS (${result.errors.slice(0, 3).join("; ")}); falling back to default`,
          );
        } else {
          themeCss = result.css;
          if (result.stripped.length > 0) {
            // Non-fatal: unknown vars are dropped but the theme is still applied.
            diagnostics.push(
              `${themePath}: stripped unknown variables (${result.stripped.join(", ")})`,
            );
          }
        }
      }
    } catch (err) {
      themeCss = null;
      diagnostics.push(`${themePath}: ${(err as Error).message}; falling back to default`);
    }
  }

  let guidance: string | null = null;
  const guidancePath = env.WEAVE_DESIGN_GUIDANCE_PATH;
  if (guidancePath) {
    try {
      const bytes = statSync(guidancePath).size;
      if (bytes > GUIDANCE_MAX_BYTES) {
        diagnostics.push(
          `${guidancePath}: guidance is ${bytes} bytes, over the ${GUIDANCE_MAX_BYTES}-byte cap; falling back to default`,
        );
      } else {
        guidance = readFileSync(guidancePath, "utf-8");
      }
    } catch (err) {
      guidance = null;
      diagnostics.push(`${guidancePath}: ${(err as Error).message}; falling back to default`);
    }
  }

  return { themeCss, guidance, diagnostics };
}

// The exact serialised form vite/singlefile emitted into dist/mcp-app.html.
// Verified with `grep -o '<style id="weave-brand-theme"[^>]*></style>'`.
const THEME_SLOT = '<style id="weave-brand-theme"></style>';

/**
 * Injects validated brand CSS into the built view's placeholder <style> slot.
 *
 * When themeCss is null the HTML is returned unchanged (the empty slot stays,
 * so the base tokens.css cascade wins). The absent-placeholder case throws: a
 * missing slot means the built HTML drifted from what this code expects, which
 * is a build regression we want to fail loud on, not silently no-op.
 */
export function injectTheme(html: string, themeCss: string | null): string {
  if (!html.includes(THEME_SLOT)) {
    throw new Error(
      "weave view: theme placeholder <style id=weave-brand-theme> missing from built HTML",
    );
  }
  if (!themeCss) return html;
  return html.replace(THEME_SLOT, `<style id="weave-brand-theme">\n${themeCss}\n</style>`);
}
