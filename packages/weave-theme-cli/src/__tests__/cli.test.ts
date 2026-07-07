import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// packages/weave-theme-cli/src/__tests__/cli.test.ts -> dist/cli.js is two
// levels up, then into dist/. Requires a build: this package's own
// turbo.json declares test dependsOn ["^build", "build"], so any turbo run
// (root `pnpm test` included) builds this package's dist before its tests
// run. Only a bare `vitest run` in this package with no prior build lacks
// dist — hence the skipIf guard below rather than a hard failure.
const PACKAGE_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const CLI_PATH = join(PACKAGE_ROOT, "dist", "cli.js");
const REPO_ROOT = fileURLToPath(new URL("../../../..", import.meta.url));
const THEMES_DIR = join(REPO_ROOT, "examples", "themes");

const hasDist = existsSync(CLI_PATH);

const fixtureDirs: string[] = [];

afterAll(() => {
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true });
});

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

    it("exits 1 and reports CONTRAST_FAIL for a same-colour text pair", () => {
      // Fixture, not a shipped theme: shipped themes are conformance
      // fixtures that must lint clean (see lint.test.ts), so the exit-1
      // path is exercised with a deliberately broken bg==fg pair.
      const dir = mkdtempSync(join(tmpdir(), "weave-theme-cli-spawn-"));
      fixtureDirs.push(dir);
      writeFileSync(
        join(dir, "weave-theme.css"),
        ":root { --background: #111111; --foreground: #111111; }\n",
        "utf8",
      );
      const result = runCli(["lint", dir]);
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

    it("--allow-partial and --require-drop-report are forwarded to the linter", () => {
      // Flag-plumbing check against a real shipped theme: corporate-light
      // has no drop-report.json, so DROP_REPORT_MISSING landing in errors
      // (not warnings) proves --require-drop-report was parsed and
      // forwarded. The flags' full downstream behaviour is covered in
      // lint.test.ts; this only proves the CLI wiring.
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
