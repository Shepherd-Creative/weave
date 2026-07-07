import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runList } from "../commands/list.js";
import { runUse } from "../commands/use.js";
import type { JsonRecord } from "../desktop-config.js";
import {
  ConfigNotFoundError,
  ConfigParseError,
  clearThemeEnv,
  defaultDesktopConfigPath,
  locateServerEntry,
  readConfig,
  ServerEntryNotFoundError,
  setThemeEnv,
  writeConfig,
} from "../desktop-config.js";
import { resolveThemesDir, ThemesDirNotFoundError } from "../themes-dir.js";

// packages/weave-theme-cli/src/__tests__/use.test.ts -> repo root is four
// levels up, matching lint.test.ts's REPO_ROOT computation. Resolved from
// the file's own URL (not cwd) so this is stable regardless of what
// directory the test runner was invoked from.
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const THEMES_DIR = join(REPO_ROOT, "examples", "themes");

const tempDirs: string[] = [];

function makeTempDir(prefix = "weave-theme-cli-use-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  let dir: string | undefined;
  // biome-ignore lint/suspicious/noAssignInExpressions: tidy drain loop
  while ((dir = tempDirs.pop())) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- stdout/stderr capture -------------------------------------------------
// runUse/runList write directly to process.stdout/stderr (same convention as
// runLint in cli.ts). Spying both captures text for assertions AND keeps the
// vitest run's own console quiet.

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
});

function stdoutText(): string {
  return stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
}
function stderrText(): string {
  return stderrSpy.mock.calls.map((c) => String(c[0])).join("");
}

// --- fixture config ----------------------------------------------------

/** An unrelated second server entry with distinctive nested values, so a
 * lossy round-trip (schema-narrowing, shallow clone, key reordering as
 * "equality") would be caught. */
function unrelatedServerEntry() {
  return {
    command: "python",
    args: ["-m", "another_server"],
    env: { FOO: "bar" },
    extra: { nested: { deeply: ["x", "y", { z: 1 }] } },
  };
}

/** The weave entry deliberately has NO `env` key, so a clean `use --default`
 * after `use <name>` should restore the file to byte-for-byte the same
 * parsed shape, not just "the two keys are gone but env: {} lingers". */
function fixtureConfig(): JsonRecord {
  return {
    mcpServers: {
      weave: {
        command: "node",
        args: ["/opt/weave-mcp-app/dist/index.js", "--stdio"],
      },
      "another-server": unrelatedServerEntry(),
    },
    topLevelField: "preserved",
  };
}

function writeFixtureConfig(dir: string, config: unknown): string {
  const configPath = join(dir, "claude_desktop_config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
  return configPath;
}

function backupFiles(dir: string): string[] {
  return readdirSync(dir).filter((f) => f.includes(".bak-"));
}

// A full 36-var coverage set (structural + tone + palette) with bg==fg, so
// lint fails on CONTRAST_FAIL alone, not also on COVERAGE_INCOMPLETE.
// Deliberately not imported from lint.test.ts (test files stay
// self-contained, matching the rest of this suite).
const FULL_COVERAGE_BG_EQ_FG_CSS = `:root {
  --background: #111111;
  --foreground: #111111;
  --card: #ffffff;
  --card-foreground: #111111;
  --popover: #ffffff;
  --popover-foreground: #111111;
  --primary: #1e3a8a;
  --primary-foreground: #ffffff;
  --secondary: #eeeeee;
  --secondary-foreground: #111111;
  --muted: #eeeeee;
  --muted-foreground: #555555;
  --accent: #eeeeee;
  --accent-foreground: #1e3a8a;
  --destructive: #b91c1c;
  --destructive-foreground: #ffffff;
  --border: #dddddd;
  --input: #dddddd;
  --ring: #1e3a8a;
  --radius: 0.5rem;
  --tone-positive: #15803d;
  --tone-positive-muted: #e3f4e9;
  --tone-negative: #b91c1c;
  --tone-negative-muted: #fbe7e7;
  --tone-warning: #a16207;
  --tone-warning-muted: #f9f0dc;
  --tone-info: #1d4ed8;
  --tone-info-muted: #e4ebfb;
  --chart-1: #7c9cd6;
  --chart-2: #8fbf9f;
  --chart-3: #d6a97c;
  --chart-4: #b78fc9;
  --chart-5: #7cc0d6;
  --chart-6: #d68f9c;
  --chart-7: #a9c97c;
  --chart-8: #c9b27c;
}
`;

function makeBrokenThemesDir(): string {
  const themesDir = makeTempDir("weave-theme-cli-broken-themes-");
  const themeDir = join(themesDir, "bad-theme");
  mkdirSync(themeDir, { recursive: true });
  writeFileSync(join(themeDir, "weave-theme.css"), FULL_COVERAGE_BG_EQ_FG_CSS, "utf8");
  return themesDir;
}

describe("runUse: round trip (set then --default)", () => {
  it("use terminal-dense sets both env keys; use --default removes them; config round-trips byte-identical", () => {
    const dir = makeTempDir();
    const original = fixtureConfig();
    const configPath = writeFixtureConfig(dir, original);

    const setExit = runUse(["terminal-dense", "--themes-dir", THEMES_DIR, "--config", configPath]);
    expect(setExit).toBe(0);

    const afterSet = JSON.parse(readFileSync(configPath, "utf8"));
    expect(afterSet.mcpServers.weave.env).toEqual({
      WEAVE_THEME_CSS_PATH: resolve(THEMES_DIR, "terminal-dense", "weave-theme.css"),
      WEAVE_DESIGN_GUIDANCE_PATH: resolve(THEMES_DIR, "terminal-dense", "DESIGN.md"),
    });
    // The unrelated entry and any top-level field byte-survive.
    expect(afterSet.mcpServers["another-server"]).toEqual(unrelatedServerEntry());
    expect(afterSet.topLevelField).toBe("preserved");

    const defaultExit = runUse(["--default", "--config", configPath]);
    expect(defaultExit).toBe(0);

    const afterDefault = JSON.parse(readFileSync(configPath, "utf8"));
    expect(afterDefault).toEqual(original);
    expect(afterDefault.mcpServers["another-server"]).toEqual(unrelatedServerEntry());
  });

  it("creates one backup file per write, named <config>.bak-<ISO8601 basic>", () => {
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, fixtureConfig());

    expect(runUse(["terminal-dense", "--themes-dir", THEMES_DIR, "--config", configPath])).toBe(0);
    expect(backupFiles(dir)).toHaveLength(1);

    expect(runUse(["--default", "--config", configPath])).toBe(0);
    // Two writes in a row can land in the same wall-clock second (see the
    // writeConfig collision test below), so this only pins the *shape* of
    // each backup name, not that it's collision-free within a second.
    expect(backupFiles(dir)).toHaveLength(2);

    for (const f of backupFiles(dir)) {
      expect(f).toMatch(/^claude_desktop_config\.json\.bak-\d{8}T\d{6}Z(-\d+)?$/);
    }
  });

  it("prints the exact restart reminder line on success", () => {
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, fixtureConfig());
    runUse(["terminal-dense", "--themes-dir", THEMES_DIR, "--config", configPath]);
    expect(stdoutText()).toContain(
      "Restart Claude Desktop to apply (the config is read at launch only).",
    );
  });

  it("use --default with no theme configured proceeds without error and still restores the default state", () => {
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, fixtureConfig());
    expect(runUse(["--default", "--config", configPath])).toBe(0);
    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.mcpServers.weave.env).toBeUndefined();
  });
});

describe("runUse: corrupt config", () => {
  it("refuses with a typed message, leaves the file untouched, and writes no backup", () => {
    const dir = makeTempDir();
    const configPath = join(dir, "claude_desktop_config.json");
    const corrupt = '{ "mcpServers": { "weave": {';
    writeFileSync(configPath, corrupt, "utf8");

    const exit = runUse(["terminal-dense", "--themes-dir", THEMES_DIR, "--config", configPath]);

    expect(exit).toBe(2);
    expect(readFileSync(configPath, "utf8")).toBe(corrupt);
    expect(backupFiles(dir)).toEqual([]);
    expect(stderrText()).toContain("corrupt");
  });
});

describe("runUse: missing server entry", () => {
  it("exits 2 with a message pointing at weave-mcp-app/README.md", () => {
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, {
      mcpServers: { unrelated: { command: "node", args: ["some-other-thing.js"] } },
    });

    const exit = runUse(["terminal-dense", "--themes-dir", THEMES_DIR, "--config", configPath]);

    expect(exit).toBe(2);
    expect(stderrText()).toContain("weave-mcp-app/README");
  });
});

describe("runUse: lint refusal", () => {
  it("a theme with lint errors is refused (exit 1), leaving the config untouched with no backup", () => {
    const brokenThemesDir = makeBrokenThemesDir();
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, fixtureConfig());
    const before = readFileSync(configPath, "utf8");

    const exit = runUse(["bad-theme", "--themes-dir", brokenThemesDir, "--config", configPath]);

    expect(exit).toBe(1);
    expect(readFileSync(configPath, "utf8")).toBe(before);
    expect(backupFiles(dir)).toEqual([]);
    expect(stdoutText()).toContain("CONTRAST_FAIL");
  });

  it("--force overrides the refusal and proceeds to write", () => {
    const brokenThemesDir = makeBrokenThemesDir();
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, fixtureConfig());

    const exit = runUse([
      "bad-theme",
      "--themes-dir",
      brokenThemesDir,
      "--config",
      configPath,
      "--force",
    ]);

    expect(exit).toBe(0);
    const after = JSON.parse(readFileSync(configPath, "utf8"));
    expect(after.mcpServers.weave.env.WEAVE_THEME_CSS_PATH).toBe(
      resolve(brokenThemesDir, "bad-theme", "weave-theme.css"),
    );
    expect(backupFiles(dir)).toHaveLength(1);
  });
});

describe("runUse: usage errors", () => {
  it("missing <name|path> (and no --default) is a usage error, exit 2", () => {
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, fixtureConfig());
    expect(runUse(["--config", configPath])).toBe(2);
    expect(stderrText()).toContain("Usage: weave-theme use");
  });

  it("a theme name together with --default is a usage error, exit 2", () => {
    expect(runUse(["terminal-dense", "--default"])).toBe(2);
    expect(stderrText()).toContain("cannot combine");
  });

  it("a nonexistent theme name is a usage error, exit 2", () => {
    expect(runUse(["does-not-exist", "--themes-dir", THEMES_DIR])).toBe(2);
  });
});

describe("runList: active marker", () => {
  it("marks the theme whose weave-theme.css matches the config's WEAVE_THEME_CSS_PATH as active", () => {
    const dir = makeTempDir();
    const configPath = writeFixtureConfig(dir, {
      mcpServers: {
        weave: {
          command: "node",
          args: ["/opt/weave-mcp-app/dist/index.js"],
          env: {
            WEAVE_THEME_CSS_PATH: resolve(THEMES_DIR, "corporate-light", "weave-theme.css"),
          },
        },
      },
    });

    const exit = runList(["--themes-dir", THEMES_DIR, "--config", configPath, "--json"]);
    expect(exit).toBe(0);

    const entries = JSON.parse(stdoutText());
    expect(Array.isArray(entries)).toBe(true);
    const byName = Object.fromEntries(
      entries.map((e: { name: string; active: boolean }) => [e.name, e]),
    );
    expect(byName["corporate-light"].active).toBe(true);
    expect(byName["brand-iron"].active).toBe(false);
    expect(byName["terminal-dense"].active).toBe(false);
  });

  it("a missing config file is not an error: no active marker, exit 0", () => {
    const dir = makeTempDir();
    const configPath = join(dir, "does-not-exist.json");

    const exit = runList(["--themes-dir", THEMES_DIR, "--config", configPath, "--json"]);
    expect(exit).toBe(0);

    const entries = JSON.parse(stdoutText());
    expect(entries.every((e: { active: boolean }) => e.active === false)).toBe(true);
  });

  it("human output ends with an Active theme line, defaulting when nothing is configured", () => {
    const dir = makeTempDir();
    const configPath = join(dir, "does-not-exist.json");
    runList(["--themes-dir", THEMES_DIR, "--config", configPath]);
    expect(stdoutText().trim().endsWith("Active theme: default (no theme configured)")).toBe(true);
  });

  it("missing themes dir exits 2 with a clear message", () => {
    const exit = runList(["--themes-dir", join(REPO_ROOT, "nonexistent-themes-xyz")]);
    expect(exit).toBe(2);
    expect(stderrText()).toContain("does not exist");
  });
});

describe("desktop-config: defaultDesktopConfigPath", () => {
  it("returns the macOS path under the real home directory, as pure path construction (never reads it)", () => {
    const expected = join(
      homedir(),
      "Library",
      "Application Support",
      "Claude",
      "claude_desktop_config.json",
    );
    expect(defaultDesktopConfigPath()).toBe(expected);
  });
});

describe("desktop-config: readConfig", () => {
  it("throws ConfigNotFoundError for a missing file", () => {
    const dir = makeTempDir();
    expect(() => readConfig(join(dir, "nope.json"))).toThrow(ConfigNotFoundError);
  });

  it("throws ConfigParseError for invalid JSON", () => {
    const dir = makeTempDir();
    const p = join(dir, "bad.json");
    writeFileSync(p, "{ not json", "utf8");
    expect(() => readConfig(p)).toThrow(ConfigParseError);
  });

  it("throws ConfigParseError when the JSON root is not an object", () => {
    const dir = makeTempDir();
    const p = join(dir, "array.json");
    writeFileSync(p, "[1, 2, 3]", "utf8");
    expect(() => readConfig(p)).toThrow(ConfigParseError);
  });

  it("returns the parsed object for valid JSON", () => {
    const dir = makeTempDir();
    const p = join(dir, "good.json");
    writeFileSync(p, JSON.stringify({ a: 1 }), "utf8");
    expect(readConfig(p)).toEqual({ a: 1 });
  });
});

describe("desktop-config: locateServerEntry", () => {
  it("finds the entry by exact name", () => {
    const config = { mcpServers: { weave: { command: "node", args: [] } } };
    expect(locateServerEntry(config, "weave").name).toBe("weave");
  });

  it("falls back to scanning args for a weave-mcp-app/dist/index.js suffix under a renamed key", () => {
    const config = {
      mcpServers: { "my-weave": { command: "node", args: ["/x/weave-mcp-app/dist/index.js"] } },
    };
    expect(locateServerEntry(config, "weave").name).toBe("my-weave");
  });

  it("throws ServerEntryNotFoundError pointing at the README when nothing matches", () => {
    const config = { mcpServers: { other: { command: "node", args: ["other.js"] } } };
    expect(() => locateServerEntry(config, "weave")).toThrow(ServerEntryNotFoundError);
    expect(() => locateServerEntry(config, "weave")).toThrow(/weave-mcp-app\/README/);
  });
});

describe("desktop-config: writeConfig backup naming", () => {
  it("names the backup <path>.bak-<ISO8601 basic>, with an injected date for determinism", () => {
    const dir = makeTempDir();
    const configPath = join(dir, "cfg.json");
    writeFileSync(configPath, JSON.stringify({ a: 1 }), "utf8");

    const backupPath = writeConfig(configPath, { a: 2 }, new Date("2026-07-07T16:15:00.000Z"));

    expect(backupPath).toBe(`${configPath}.bak-20260707T161500Z`);
    expect(readFileSync(backupPath, "utf8")).toBe(JSON.stringify({ a: 1 }));
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ a: 2 });
  });

  it("disambiguates with a numeric suffix instead of clobbering when two writes land in the same second", () => {
    const dir = makeTempDir();
    const configPath = join(dir, "cfg.json");
    const sameSecond = new Date("2026-07-07T16:15:00.000Z");
    writeFileSync(configPath, JSON.stringify({ a: 0 }), "utf8");

    const first = writeConfig(configPath, { a: 1 }, sameSecond);
    const second = writeConfig(configPath, { a: 2 }, sameSecond);

    expect(first).toBe(`${configPath}.bak-20260707T161500Z`);
    expect(second).toBe(`${configPath}.bak-20260707T161500Z-2`);
    // Each backup still holds the state it was taken from, not a copy
    // clobbered by the later write.
    expect(JSON.parse(readFileSync(first, "utf8"))).toEqual({ a: 0 });
    expect(JSON.parse(readFileSync(second, "utf8"))).toEqual({ a: 1 });
    expect(JSON.parse(readFileSync(configPath, "utf8"))).toEqual({ a: 2 });
  });

  it("skips the backup when there is no existing file to copy", () => {
    const dir = makeTempDir();
    const configPath = join(dir, "cfg.json");
    writeConfig(configPath, { a: 1 }, new Date("2026-07-07T16:15:00.000Z"));
    expect(backupFiles(dir)).toEqual([]);
  });
});

describe("desktop-config: setThemeEnv / clearThemeEnv", () => {
  it("setThemeEnv creates env if absent and sets both keys", () => {
    const entry: JsonRecord = { command: "node" };
    const change = setThemeEnv(entry, "/abs/css.css", "/abs/DESIGN.md");
    expect(entry.env).toEqual({
      WEAVE_THEME_CSS_PATH: "/abs/css.css",
      WEAVE_DESIGN_GUIDANCE_PATH: "/abs/DESIGN.md",
    });
    expect(change).toEqual({
      themeCssPath: "/abs/css.css",
      guidancePath: "/abs/DESIGN.md",
      guidanceRemoved: false,
    });
  });

  it("setThemeEnv without a guidance path removes any existing guidance key and reports it", () => {
    const entry: JsonRecord = { env: { WEAVE_DESIGN_GUIDANCE_PATH: "/old/DESIGN.md", OTHER: "x" } };
    const change = setThemeEnv(entry, "/abs/css.css", undefined);
    expect(entry.env).toEqual({ OTHER: "x", WEAVE_THEME_CSS_PATH: "/abs/css.css" });
    expect(change.guidancePath).toBeNull();
    expect(change.guidanceRemoved).toBe(true);
  });

  it("clearThemeEnv deletes the env object entirely once both keys are gone and nothing else remains", () => {
    const entry: JsonRecord = {
      env: { WEAVE_THEME_CSS_PATH: "x", WEAVE_DESIGN_GUIDANCE_PATH: "y" },
    };
    expect(clearThemeEnv(entry)).toEqual({ removed: true });
    expect(entry.env).toBeUndefined();
  });

  it("clearThemeEnv keeps env when other keys remain", () => {
    const entry: JsonRecord = { env: { WEAVE_THEME_CSS_PATH: "x", OTHER: "keep" } };
    expect(clearThemeEnv(entry)).toEqual({ removed: true });
    expect(entry.env).toEqual({ OTHER: "keep" });
  });

  it("clearThemeEnv on an entry with no env is a no-op reporting removed:false", () => {
    const entry: JsonRecord = { command: "node" };
    expect(clearThemeEnv(entry)).toEqual({ removed: false });
    expect(entry.env).toBeUndefined();
  });
});

describe("themes-dir: resolveThemesDir", () => {
  const originalEnv = process.env.WEAVE_THEMES_DIR;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.WEAVE_THEMES_DIR;
    else process.env.WEAVE_THEMES_DIR = originalEnv;
  });

  it("returns an explicit themes dir verbatim (already absolute)", () => {
    expect(resolveThemesDir(THEMES_DIR)).toBe(THEMES_DIR);
  });

  it("falls back to WEAVE_THEMES_DIR when no explicit dir is given", () => {
    delete process.env.WEAVE_THEMES_DIR;
    process.env.WEAVE_THEMES_DIR = THEMES_DIR;
    expect(resolveThemesDir(undefined, "/nonexistent/cwd/for/this/test")).toBe(THEMES_DIR);
  });

  it("walks up from cwd to find pnpm-workspace.yaml and resolves examples/themes from there", () => {
    delete process.env.WEAVE_THEMES_DIR;
    expect(resolveThemesDir(undefined, REPO_ROOT)).toBe(THEMES_DIR);
    expect(resolveThemesDir(undefined, join(REPO_ROOT, "packages", "weave-theme-cli", "src"))).toBe(
      THEMES_DIR,
    );
  });

  it("throws ThemesDirNotFoundError when no pnpm-workspace.yaml is found walking up from cwd", () => {
    delete process.env.WEAVE_THEMES_DIR;
    const outsideDir = makeTempDir("weave-theme-cli-outside-");
    expect(() => resolveThemesDir(undefined, outsideDir)).toThrow(ThemesDirNotFoundError);
  });
});
