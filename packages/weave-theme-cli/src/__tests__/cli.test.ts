import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// packages/weave-theme-cli/src/__tests__/cli.test.ts -> dist/cli.js is two
// levels up, then into dist/. Requires a build (turbo's test task
// dependsOn ^build, so `pnpm test` at the repo root always has it; running
// this package's `vitest run` standalone before a build does not).
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI_PATH = join(PACKAGE_ROOT, "dist", "cli.js");
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const THEMES_DIR = join(REPO_ROOT, "examples", "themes");

const hasDist = existsSync(CLI_PATH);

type CliResult = { status: number; stdout: string; stderr: string };

function runCli(args: string[]): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status: number | null; stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

describe.skipIf(!hasDist)(
  "weave-theme lint (spawned CLI — requires `pnpm --filter @shepherd-creative/weave-theme-cli build`)",
  () => {
    it("exits 0 for a clean theme, with a human-readable coverage table on stdout", () => {
      const result = runCli(["lint", join(THEMES_DIR, "corporate-light")]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("structural");
      expect(result.stdout).toContain("✓ ok");
    });

    it("exits 1 and reports brand-iron's known CONTRAST_FAIL", () => {
      const result = runCli(["lint", join(THEMES_DIR, "brand-iron")]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain("CONTRAST_FAIL");
    });

    it("--json emits ONLY a parseable JSON object on stdout", () => {
      const result = runCli(["lint", join(THEMES_DIR, "corporate-light"), "--json"]);
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed).toMatchObject({ ok: true });
      expect(parsed).toHaveProperty("errors");
      expect(parsed).toHaveProperty("warnings");
      expect(parsed).toHaveProperty("coverage");
      expect(parsed).toHaveProperty("contrast.checked");
      expect(parsed).toHaveProperty("contrast.skipped");
      expect(parsed).toHaveProperty("dropReport.present");
    });

    it("--allow-partial and --require-drop-report reach the linter (empty theme dir)", () => {
      // No fixture directory needed beyond an existing empty one: an empty
      // dir has no weave-theme.css at all, so this exercises argument
      // plumbing (flags parsed, forwarded) rather than the flags'
      // downstream effect — see lint.test.ts for the effect itself.
      const result = runCli([
        "lint",
        join(THEMES_DIR, "corporate-light"),
        "--allow-partial",
        "--require-drop-report",
        "--json",
      ]);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.errors.some((e: { code: string }) => e.code === "DROP_REPORT_MISSING")).toBe(
        true,
      );
    });

    it("exits 2 with usage text on stderr for a missing <themeDir>", () => {
      const result = runCli(["lint"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("Usage: weave-theme");
      expect(result.stdout).toBe("");
    });

    it("exits 2 for an unknown subcommand", () => {
      const result = runCli(["bogus"]);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("unknown command");
    });

    it("exits 2 for a themeDir that does not exist", () => {
      const result = runCli(["lint", join(REPO_ROOT, "nonexistent-theme-dir-xyz")]);
      expect(result.status).toBe(2);
    });
  },
);

if (!hasDist) {
  // Vitest still needs at least one test in the file to not report it as
  // empty; this one always runs and prints exactly why the suite above was
  // skipped instead of silently vanishing from the summary.
  it.skip(`skipped: ${CLI_PATH} not built — run pnpm --filter @shepherd-creative/weave-theme-cli build`, () => {});
}
