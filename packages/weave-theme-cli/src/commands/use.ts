import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { JsonRecord, LocatedServerEntry } from "../desktop-config.js";
import {
  clearThemeEnv,
  DEFAULT_SERVER_NAME,
  DesktopConfigError,
  defaultDesktopConfigPath,
  locateServerEntry,
  readConfig,
  setThemeEnv,
  writeConfig,
} from "../desktop-config.js";
import { lintThemeDir } from "../lint.js";
import { resolveThemesDir, ThemesDirNotFoundError } from "../themes-dir.js";

function usage(): string {
  return [
    "Usage: weave-theme use <name|path> [options]",
    "       weave-theme use --default [options]",
    "",
    "Points Claude Desktop's weave MCP server at a theme (or back at the",
    "packaged default) by editing its env block. Lints the theme first and",
    "refuses to switch on lint errors unless --force is given.",
    "",
    "<name|path>: a bare name (e.g. corporate-light) is looked up in the themes",
    "directory; anything containing a slash is used as a directory path directly.",
    "",
    "Options:",
    "  --themes-dir <dir>   Directory containing theme subdirectories",
    "                       (default: <repo root>/examples/themes, found by walking",
    "                       up from cwd for pnpm-workspace.yaml; or $WEAVE_THEMES_DIR)",
    "  --config <path>      Claude Desktop config path",
    "                       (default: ~/Library/Application Support/Claude/claude_desktop_config.json)",
    "  --server <name>      mcpServers entry name to edit (default: weave)",
    "  --force               Proceed even if the theme fails lint",
    "  --default              Restore the packaged default theme (removes",
    "                          WEAVE_THEME_CSS_PATH / WEAVE_DESIGN_GUIDANCE_PATH)",
  ].join("\n");
}

// Exact text required by the design: printed as the last line on every
// successful write, since a stdio MCP server only reads its config at
// launch — nothing short of a restart makes a `use` call take effect.
const RESTART_REMINDER = "Restart Claude Desktop to apply (the config is read at launch only).";

/** A path with a slash is used as-is; a bare name is looked up in the themes dir. */
function resolveThemeDirArg(nameOrPath: string, themesDirFlag: string | undefined): string {
  if (nameOrPath.includes("/")) return resolve(nameOrPath);
  const themesDir = resolveThemesDir(themesDirFlag);
  return join(themesDir, nameOrPath);
}

type LoadResult = { ok: true; config: JsonRecord; located: LocatedServerEntry } | { ok: false };

/** Reads the config and locates the server entry, printing (to stderr) and
 * returning `{ ok: false }` on any typed failure so the caller can exit 2
 * without duplicating this error handling in both the `use <name>` and
 * `use --default` paths. */
function loadServerEntry(configPath: string, serverName: string): LoadResult {
  let config: JsonRecord;
  try {
    config = readConfig(configPath);
  } catch (err) {
    if (err instanceof DesktopConfigError) {
      process.stderr.write(`weave-theme use: ${err.message}\n`);
      return { ok: false };
    }
    throw err;
  }

  try {
    const located = locateServerEntry(config, serverName);
    return { ok: true, config, located };
  } catch (err) {
    if (err instanceof DesktopConfigError) {
      process.stderr.write(`weave-theme use: ${err.message}\n`);
      return { ok: false };
    }
    throw err;
  }
}

export function runUse(args: string[]): number {
  let parsed: ReturnType<
    typeof parseArgs<{
      options: {
        "themes-dir": { type: "string" };
        config: { type: "string" };
        server: { type: "string" };
        force: { type: "boolean" };
        default: { type: "boolean" };
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
        force: { type: "boolean", default: false },
        default: { type: "boolean", default: false },
      },
    });
  } catch (err) {
    process.stderr.write(`weave-theme use: ${(err as Error).message}\n\n${usage()}\n`);
    return 2;
  }

  if (parsed.positionals.length > 1) {
    process.stderr.write(
      `weave-theme use: unexpected extra argument "${parsed.positionals[1]}"\n\n${usage()}\n`,
    );
    return 2;
  }

  const nameOrPath = parsed.positionals[0];
  const useDefault = Boolean(parsed.values.default);
  const force = Boolean(parsed.values.force);
  const serverName = parsed.values.server ?? DEFAULT_SERVER_NAME;
  const configPath = parsed.values.config
    ? resolve(parsed.values.config)
    : defaultDesktopConfigPath();

  // Resolve + lint BEFORE ever touching the config file: a refused switch
  // (lint errors, no --force) must leave the config completely untouched —
  // not read, not backed up, not written. This block also owns all the
  // <name|path>/--default usage validation.
  let themeDir: string | undefined;
  if (useDefault) {
    if (nameOrPath) {
      process.stderr.write(
        `weave-theme use: cannot combine --default with a theme name\n\n${usage()}\n`,
      );
      return 2;
    }
  } else {
    if (!nameOrPath) {
      process.stderr.write(
        `weave-theme use: missing <name|path> (or pass --default)\n\n${usage()}\n`,
      );
      return 2;
    }

    try {
      themeDir = resolveThemeDirArg(nameOrPath, parsed.values["themes-dir"]);
    } catch (err) {
      if (err instanceof ThemesDirNotFoundError) {
        process.stderr.write(`weave-theme use: ${err.message}\n`);
        return 2;
      }
      throw err;
    }

    if (!existsSync(join(themeDir, "weave-theme.css"))) {
      process.stderr.write(
        `weave-theme use: theme "${nameOrPath}" not found (looked for ${join(themeDir, "weave-theme.css")})\n`,
      );
      return 2;
    }

    const lintResult = lintThemeDir(themeDir);
    if (lintResult.errors.length > 0) {
      process.stdout.write(
        `weave-theme use: "${nameOrPath}" has ${lintResult.errors.length} lint error(s):\n`,
      );
      for (const e of lintResult.errors) process.stdout.write(`  [${e.code}] ${e.message}\n`);
      if (!force) {
        process.stdout.write("\nRefusing to switch — fix the theme, or re-run with --force.\n");
        return 1;
      }
      process.stdout.write("\n--force: proceeding despite the errors above.\n");
    }
    if (lintResult.warnings.length > 0) {
      process.stdout.write(`${lintResult.warnings.length} lint warning(s) (not blocking).\n`);
    }
  }

  const loaded = loadServerEntry(configPath, serverName);
  if (!loaded.ok) return 2;
  const { config, located } = loaded;

  if (useDefault) {
    const { removed } = clearThemeEnv(located.entry);
    const backupPath = writeConfig(configPath, config);
    process.stdout.write(
      removed
        ? `Removed WEAVE_THEME_CSS_PATH / WEAVE_DESIGN_GUIDANCE_PATH from "${located.name}" — default theme restored.\n`
        : `"${located.name}" had no theme configured — already on the default theme.\n`,
    );
    process.stdout.write(`Backup: ${backupPath}\n`);
    process.stdout.write(`${RESTART_REMINDER}\n`);
    return 0;
  }

  if (!themeDir) {
    // Unreachable: the !useDefault branch above always sets themeDir before
    // falling through (every early-return path takes place inside it). A
    // runtime guard here is honest about that instead of an `as string` cast.
    throw new Error("weave-theme use: internal error — themeDir unset for a non-default run");
  }

  const themeCssPath = resolve(join(themeDir, "weave-theme.css"));
  const guidanceCandidate = resolve(join(themeDir, "DESIGN.md"));
  const hasGuidance = existsSync(guidanceCandidate);
  const change = setThemeEnv(
    located.entry,
    themeCssPath,
    hasGuidance ? guidanceCandidate : undefined,
  );
  const backupPath = writeConfig(configPath, config);

  process.stdout.write(`Set WEAVE_THEME_CSS_PATH -> ${change.themeCssPath}\n`);
  if (change.guidancePath) {
    process.stdout.write(`Set WEAVE_DESIGN_GUIDANCE_PATH -> ${change.guidancePath}\n`);
  } else {
    process.stdout.write(
      `No DESIGN.md in ${themeDir} — WEAVE_DESIGN_GUIDANCE_PATH not set${
        change.guidanceRemoved ? " (previous value removed)" : ""
      }.\n`,
    );
  }
  process.stdout.write(`Updated "${located.name}" in ${configPath}\n`);
  process.stdout.write(`Backup: ${backupPath}\n`);
  process.stdout.write(`${RESTART_REMINDER}\n`);
  return 0;
}
