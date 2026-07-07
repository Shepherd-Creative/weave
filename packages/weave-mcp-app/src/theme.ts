import { readFileSync, statSync } from "node:fs";
import {
  GUIDANCE_MAX_BYTES,
  knownVarsFromManifest,
  THEME_CSS_MAX_BYTES,
  validateThemeCss,
} from "@shepherd-creative/weave-tokens/validate";

export { validateThemeCss };

// Built once from the shipped token manifest. The manifest is inlined at build
// time (tsup inlines tokens.json into the weave-tokens dist, which esbuild
// bundles into the server), so this needs no filesystem access at runtime.
const KNOWN_THEME_VARS: ReadonlySet<string> = knownVarsFromManifest();

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
