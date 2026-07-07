import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export class ThemesDirNotFoundError extends Error {
  constructor() {
    super(
      "could not locate examples/themes/ automatically (no pnpm-workspace.yaml found walking up from the current directory); pass --themes-dir or set WEAVE_THEMES_DIR",
    );
    this.name = "ThemesDirNotFoundError";
  }
}

/** Walks up from `startDir` looking for a `pnpm-workspace.yaml`, the repo-root marker. */
function findRepoRoot(startDir: string): string | undefined {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined; // reached the filesystem root
    dir = parent;
  }
}

/**
 * Resolves the themes directory: explicit `--themes-dir` first, then
 * `WEAVE_THEMES_DIR`, then `<repoRoot>/examples/themes` found by walking up
 * from `cwd` for `pnpm-workspace.yaml`. Throws `ThemesDirNotFoundError` when
 * none apply: running outside this repo with neither flag nor env var set.
 *
 * `cwd` defaults to `process.cwd()` but is injectable so tests can assert
 * the "not found" path deterministically without depending on wherever the
 * test runner happens to be invoked from.
 */
export function resolveThemesDir(explicit?: string, cwd: string = process.cwd()): string {
  if (explicit) return resolve(explicit);
  const envDir = process.env.WEAVE_THEMES_DIR;
  if (envDir) return resolve(envDir);
  const repoRoot = findRepoRoot(cwd);
  if (!repoRoot) throw new ThemesDirNotFoundError();
  return join(repoRoot, "examples", "themes");
}

/** A theme directory is any directory containing `weave-theme.css`. */
export function isThemeDir(dir: string): boolean {
  return existsSync(join(dir, "weave-theme.css"));
}

/** Immediate subdirectories of `themesDir` that are theme directories, sorted for deterministic output. */
export function listThemeNames(themesDir: string): string[] {
  if (!existsSync(themesDir)) return [];
  return readdirSync(themesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isThemeDir(join(themesDir, d.name)))
    .map((d) => d.name)
    .sort();
}
