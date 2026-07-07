import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * A parsed JSON object. Deliberately untyped beyond "is a plain object":
 * Claude Desktop's config schema isn't ours to own, and this module's core
 * invariant is a lossless parse/serialise round-trip for every key we don't
 * explicitly touch. Narrowing further (e.g. a zod schema) would risk
 * silently dropping fields a stricter shape doesn't know about.
 */
export type JsonRecord = Record<string, unknown>;

/** Base class for every typed error this module throws, so callers that want
 * to treat "config unreadable in some way" as one soft-fail case (e.g. `list`)
 * can catch this instead of enumerating every subclass. */
export abstract class DesktopConfigError extends Error {}

export class ConfigNotFoundError extends DesktopConfigError {
  constructor(readonly path: string) {
    super(
      `no Claude Desktop config found at ${path} — install the weave MCP server first, see packages/weave-mcp-app/README.md`,
    );
    this.name = "ConfigNotFoundError";
  }
}

/** Any read failure other than "file doesn't exist" (permissions, EISDIR, ...). */
export class ConfigUnreadableError extends DesktopConfigError {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`could not read ${path}: ${reason}`);
    this.name = "ConfigUnreadableError";
  }
}

export class ConfigParseError extends DesktopConfigError {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`${path} is corrupt (${reason}) — refusing to touch it`);
    this.name = "ConfigParseError";
  }
}

export class ServerEntryNotFoundError extends DesktopConfigError {
  constructor(readonly serverName: string) {
    super(
      `no "${serverName}" entry in mcpServers (and no entry whose args point at weave-mcp-app/dist/index.js) — install the weave MCP server first, see packages/weave-mcp-app/README.md for the config block to add`,
    );
    this.name = "ServerEntryNotFoundError";
  }
}

/** The mcpServers key `list`/`use` operate on when `--server` isn't given. */
export const DEFAULT_SERVER_NAME = "weave";

/** The suffix `locateServerEntry`'s fallback scan matches against each
 * candidate entry's `args` array (normalised to forward slashes first, so it
 * also matches a Windows-style path). */
const WEAVE_MCP_APP_ENTRYPOINT_SUFFIX = "weave-mcp-app/dist/index.js";

/**
 * Claude Desktop's config path on macOS. Pure path construction — no
 * filesystem access — so it's safe to call and assert on in tests without
 * ever touching the real file. `--config` overrides this everywhere it's
 * used; this function only supplies the default.
 */
export function defaultDesktopConfigPath(): string {
  return join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
}

function isPlainObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads and strictly parses a Claude Desktop config file.
 *
 * Never repairs, never guesses: a missing file throws `ConfigNotFoundError`,
 * an unreadable file throws `ConfigUnreadableError`, and invalid JSON (or a
 * non-object JSON root) throws `ConfigParseError`. Every failure mode is a
 * distinct typed error so callers can decide per-command whether "can't read
 * the config" is fatal (`use`, which must not guess at what to write) or a
 * soft "no active theme to report" (`list`).
 */
export function readConfig(path: string): JsonRecord {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new ConfigNotFoundError(path);
    throw new ConfigUnreadableError(path, (err as Error).message);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ConfigParseError(path, `invalid JSON: ${(err as Error).message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new ConfigParseError(path, "root is not a JSON object");
  }
  return parsed;
}

export type LocatedServerEntry = {
  /** The mcpServers key the entry was found under — may differ from the
   * requested `serverName` when found via the args-suffix fallback. */
  name: string;
  entry: JsonRecord;
};

function argsMatchWeaveMcpApp(args: unknown): boolean {
  if (!Array.isArray(args)) return false;
  return args.some(
    (a) => typeof a === "string" && a.replace(/\\/g, "/").endsWith(WEAVE_MCP_APP_ENTRYPOINT_SUFFIX),
  );
}

/**
 * Finds the weave MCP server's entry in a parsed config: `mcpServers[serverName]`
 * first, falling back to the entry (under any key) whose `args` contains a
 * string ending `weave-mcp-app/dist/index.js` — covers a renamed key. Throws
 * `ServerEntryNotFoundError` when neither matches.
 */
export function locateServerEntry(
  config: JsonRecord,
  serverName: string = DEFAULT_SERVER_NAME,
): LocatedServerEntry {
  const servers = isPlainObject(config.mcpServers) ? config.mcpServers : {};

  const direct = servers[serverName];
  if (isPlainObject(direct)) {
    return { name: serverName, entry: direct };
  }

  for (const [name, entry] of Object.entries(servers)) {
    if (isPlainObject(entry) && argsMatchWeaveMcpApp(entry.args)) {
      return { name, entry };
    }
  }

  throw new ServerEntryNotFoundError(serverName);
}

/** "2026-07-07T16:15:00.000Z" -> "20260707T161500Z" (ISO 8601 basic, no separators, no millis). */
function isoBasic(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/**
 * Backs up the existing file (if present) to `<path>.bak-<isoBasic>`, then
 * writes `config` as pretty-printed JSON (two-space indent, trailing
 * newline). Returns the backup path.
 *
 * Generic on purpose: this function does not know about `mcpServers` or
 * theme env vars, it just backs up and serialises whatever `JsonRecord`
 * it's handed. Callers (`use`) are responsible for mutating only the two
 * theme env keys before calling this — everything else in `config` survives
 * because it's the same object the caller read back from `readConfig`,
 * mutated in place rather than reconstructed. JSON has no comments to lose,
 * and key order is preserved (existing keys keep their position; a newly
 * added key lands at the end).
 *
 * `now` is injectable so tests can assert an exact backup filename instead
 * of pattern-matching a moving timestamp; real callers never pass it.
 *
 * Two writes within the same second (e.g. `use <name>` immediately followed
 * by `use --default`, or a script looping `use` calls) would otherwise
 * compute the identical `<path>.bak-<isoBasic>` name and the second write
 * would silently clobber the first backup — exactly the data loss a backup
 * exists to prevent. On a collision, a numeric suffix (`-2`, `-3`, ...) is
 * appended so every write keeps its own backup; the common case (writes
 * seconds or more apart) still gets the plain documented name.
 */
export function writeConfig(path: string, config: JsonRecord, now: Date = new Date()): string {
  let backupPath = `${path}.bak-${isoBasic(now)}`;
  if (existsSync(path)) {
    let suffix = 2;
    while (existsSync(backupPath)) {
      backupPath = `${path}.bak-${isoBasic(now)}-${suffix}`;
      suffix += 1;
    }
    copyFileSync(path, backupPath);
  }
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return backupPath;
}

export type ThemeEnvChange = {
  themeCssPath: string;
  /** null when no DESIGN.md was found for the theme (guidance path not set). */
  guidancePath: string | null;
  /** true when a previous WEAVE_DESIGN_GUIDANCE_PATH value existed and was removed. */
  guidanceRemoved: boolean;
};

/**
 * Sets `env.WEAVE_THEME_CSS_PATH` (always) and `env.WEAVE_DESIGN_GUIDANCE_PATH`
 * (only when `guidancePath` is given) on a server entry, mutating in place.
 * Creates `entry.env` if it didn't already exist. When `guidancePath` is
 * omitted, any existing guidance key is removed rather than left stale.
 */
export function setThemeEnv(
  entry: JsonRecord,
  themeCssPath: string,
  guidancePath: string | undefined,
): ThemeEnvChange {
  const env: Record<string, unknown> = isPlainObject(entry.env) ? entry.env : {};
  const hadGuidance = Object.hasOwn(env, "WEAVE_DESIGN_GUIDANCE_PATH");

  env.WEAVE_THEME_CSS_PATH = themeCssPath;
  let guidanceRemoved = false;
  if (guidancePath) {
    env.WEAVE_DESIGN_GUIDANCE_PATH = guidancePath;
  } else {
    delete env.WEAVE_DESIGN_GUIDANCE_PATH;
    guidanceRemoved = hadGuidance;
  }
  entry.env = env;

  return { themeCssPath, guidancePath: guidancePath ?? null, guidanceRemoved };
}

/**
 * Removes both theme env keys from a server entry (restoring the packaged
 * default theme), deleting `entry.env` entirely if it becomes empty. Returns
 * whether either key was actually present to remove.
 */
export function clearThemeEnv(entry: JsonRecord): { removed: boolean } {
  if (!isPlainObject(entry.env)) return { removed: false };
  const env = entry.env;
  const had =
    Object.hasOwn(env, "WEAVE_THEME_CSS_PATH") || Object.hasOwn(env, "WEAVE_DESIGN_GUIDANCE_PATH");
  delete env.WEAVE_THEME_CSS_PATH;
  delete env.WEAVE_DESIGN_GUIDANCE_PATH;
  if (Object.keys(env).length === 0) {
    delete entry.env;
  }
  return { removed: had };
}
