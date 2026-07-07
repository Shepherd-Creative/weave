import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { knownVarsFromManifest, validateThemeCss } from "@shepherd-creative/weave-tokens/validate";
import type { CoverageBucket } from "../coverage.js";
import { computeCoverage } from "../coverage.js";
import type { JsonRecord } from "../desktop-config.js";
import {
  DEFAULT_SERVER_NAME,
  DesktopConfigError,
  defaultDesktopConfigPath,
  locateServerEntry,
  readConfig,
} from "../desktop-config.js";
import { listThemeNames, resolveThemesDir, ThemesDirNotFoundError } from "../themes-dir.js";

function usage(): string {
  return [
    "Usage: weave-theme list [options]",
    "",
    "Enumerates theme directories (any directory containing weave-theme.css) and",
    "shows a coverage summary, drop-report presence, and which one (if any) is",
    "wired up in Claude Desktop's config.",
    "",
    "Options:",
    "  --themes-dir <dir>   Directory containing theme subdirectories",
    "                       (default: <repo root>/examples/themes, found by walking",
    "                       up from cwd for pnpm-workspace.yaml; or $WEAVE_THEMES_DIR)",
    "  --config <path>      Claude Desktop config path",
    "                       (default: ~/Library/Application Support/Claude/claude_desktop_config.json)",
    "  --server <name>      mcpServers entry name to check (default: weave)",
    "  --json                Emit a JSON array to stdout instead of a human-readable table",
  ].join("\n");
}

export type ThemeListEntry = {
  name: string;
  dir: string;
  /** Enforced buckets only (structural, tone, palette), in canonical order. */
  coverage: Array<{ name: string; set: number; total: number }>;
  /** e.g. "structural 20/20 · tone 8/8 · palette 8/8" */
  summary: string;
  hasDropReport: boolean;
  active: boolean;
};

function summarizeCoverage(themeDir: string): {
  coverage: ThemeListEntry["coverage"];
  summary: string;
} {
  const cssPath = join(themeDir, "weave-theme.css");
  const source = existsSync(cssPath) ? readFileSync(cssPath, "utf8") : "";
  const validation = validateThemeCss(source, knownVarsFromManifest());
  const applied = new Set(validation.applied);
  const buckets: CoverageBucket[] = computeCoverage(applied).filter((b) => b.enforced);
  const coverage = buckets.map((b) => ({ name: b.name, set: b.set, total: b.total }));
  const summary = coverage.map((b) => `${b.name} ${b.set}/${b.total}`).join(" · ");
  return { coverage, summary };
}

/** Best-effort realpath: falls back to the plain resolved path (e.g. a
 * configured file that no longer exists) rather than throwing, since a
 * broken/stale WEAVE_THEME_CSS_PATH must not crash `list`. */
function realpathOrSelf(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

type ActiveLookup = { cssPath?: string; note?: string };

/**
 * Best-effort: any failure to read the config, parse it, or find the server
 * entry is NOT an error for `list`; it just means there's nothing to mark
 * active, reported as a short `note` instead of aborting the command.
 */
function resolveActiveCssPath(configPath: string, serverName: string): ActiveLookup {
  let config: JsonRecord;
  try {
    config = readConfig(configPath);
  } catch (err) {
    if (err instanceof DesktopConfigError)
      return { note: `${err.message}; showing no active theme` };
    throw err;
  }

  let located: ReturnType<typeof locateServerEntry>;
  try {
    located = locateServerEntry(config, serverName);
  } catch (err) {
    if (err instanceof DesktopConfigError)
      return { note: `${err.message}; showing no active theme` };
    throw err;
  }

  const env = located.entry.env;
  const cssPath =
    typeof env === "object" && env !== null && !Array.isArray(env)
      ? (env as Record<string, unknown>).WEAVE_THEME_CSS_PATH
      : undefined;
  if (typeof cssPath !== "string" || cssPath.length === 0) {
    return { note: `no theme configured for "${serverName}"; default theme active` };
  }
  return { cssPath };
}

export function runList(args: string[]): number {
  let parsed: ReturnType<
    typeof parseArgs<{
      options: {
        "themes-dir": { type: "string" };
        config: { type: "string" };
        server: { type: "string" };
        json: { type: "boolean" };
      };
      allowPositionals: true;
    }>
  >;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        "themes-dir": { type: "string" },
        config: { type: "string" },
        server: { type: "string" },
        json: { type: "boolean", default: false },
      },
    });
  } catch (err) {
    process.stderr.write(`weave-theme list: ${(err as Error).message}\n\n${usage()}\n`);
    return 2;
  }

  if (parsed.positionals.length > 0) {
    process.stderr.write(
      `weave-theme list: unexpected argument "${parsed.positionals[0]}"\n\n${usage()}\n`,
    );
    return 2;
  }

  let themesDir: string;
  try {
    themesDir = resolveThemesDir(parsed.values["themes-dir"]);
  } catch (err) {
    if (err instanceof ThemesDirNotFoundError) {
      process.stderr.write(`weave-theme list: ${err.message}\n`);
      return 2;
    }
    throw err;
  }
  if (!existsSync(themesDir)) {
    process.stderr.write(`weave-theme list: themes directory ${themesDir} does not exist\n`);
    return 2;
  }

  const serverName = parsed.values.server ?? DEFAULT_SERVER_NAME;
  const configPath = parsed.values.config
    ? resolve(parsed.values.config)
    : defaultDesktopConfigPath();
  const { cssPath: activeCssPath, note } = resolveActiveCssPath(configPath, serverName);
  const activeResolved = activeCssPath !== undefined ? realpathOrSelf(activeCssPath) : undefined;

  const names = listThemeNames(themesDir);
  const entries: ThemeListEntry[] = names.map((name) => {
    const dir = join(themesDir, name);
    const { coverage, summary } = summarizeCoverage(dir);
    const hasDropReport = existsSync(join(dir, "drop-report.json"));
    const ownCssResolved = realpathOrSelf(join(dir, "weave-theme.css"));
    const active = activeResolved !== undefined && ownCssResolved === activeResolved;
    return { name, dir, coverage, summary, hasDropReport, active };
  });

  if (parsed.values.json) {
    process.stdout.write(`${JSON.stringify(entries)}\n`);
    if (note) process.stderr.write(`${note}\n`);
    return 0;
  }

  const lines: string[] = [];
  lines.push(`Themes in ${themesDir}:`);
  lines.push("");
  if (entries.length === 0) {
    lines.push("  (none found)");
  } else {
    const nameWidth = Math.max(...entries.map((e) => e.name.length));
    const summaryWidth = Math.max(...entries.map((e) => e.summary.length));
    for (const e of entries) {
      const marker = e.active ? "*" : " ";
      const dropReport = e.hasDropReport ? "drop-report present" : "drop-report absent";
      lines.push(
        `${marker} ${e.name.padEnd(nameWidth)}  ${e.summary.padEnd(summaryWidth)}  ${dropReport}`,
      );
    }
  }
  lines.push("");
  if (note) lines.push(note);
  const activeEntry = entries.find((e) => e.active);
  lines.push(`Active theme: ${activeEntry ? activeEntry.name : "default (no theme configured)"}`);
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}
