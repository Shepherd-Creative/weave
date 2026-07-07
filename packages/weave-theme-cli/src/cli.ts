#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { runList } from "./commands/list.js";
import { runUse } from "./commands/use.js";
import { lintThemeDir } from "./lint.js";
import { formatHuman, formatJson } from "./output.js";

// Dispatch is a plain switch on argv[2], each subcommand parsing its own
// remaining args with node:util's parseArgs, no framework. Each subcommand
// owns its full usage text (lintUsage() below; commands/list.ts and
// commands/use.ts each export nothing but keep a local usage() the same
// way); this file's usage() is just the top-level command directory shown
// by --help and on an unknown/missing command.

function usage(): string {
  return [
    "Usage: weave-theme <command> [options]",
    "",
    "Commands:",
    "  lint <themeDir>    Lint a Weave theme directory",
    "  list               List theme directories, coverage and which one is active",
    "  use <name|path>    Point Claude Desktop's weave server at a theme",
    "  use --default      Restore the packaged default theme",
    "",
    "Run a command with no arguments (or a bad flag) to see its full option list.",
  ].join("\n");
}

function lintUsage(): string {
  return [
    "Usage: weave-theme lint <themeDir> [options]",
    "",
    "Options:",
    "  --json                  Emit a single JSON report to stdout instead of human-readable text",
    "  --allow-partial         Downgrade incomplete structural/tone/palette coverage from error to warning",
    "  --require-drop-report   Treat a missing drop-report.json as an error instead of a warning",
  ].join("\n");
}

function runLint(args: string[]): number {
  let parsed: ReturnType<
    typeof parseArgs<{
      options: {
        json: { type: "boolean" };
        "allow-partial": { type: "boolean" };
        "require-drop-report": { type: "boolean" };
      };
      allowPositionals: true;
    }>
  >;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      options: {
        json: { type: "boolean", default: false },
        "allow-partial": { type: "boolean", default: false },
        "require-drop-report": { type: "boolean", default: false },
      },
    });
  } catch (err) {
    process.stderr.write(`weave-theme lint: ${(err as Error).message}\n\n${lintUsage()}\n`);
    return 2;
  }

  const dir = parsed.positionals[0];
  if (!dir) {
    process.stderr.write(`weave-theme lint: missing <themeDir>\n\n${lintUsage()}\n`);
    return 2;
  }

  const resolvedDir = resolve(dir);
  if (!existsSync(resolvedDir) || !statSync(resolvedDir).isDirectory()) {
    process.stderr.write(`weave-theme lint: ${dir} is not a directory\n`);
    return 2;
  }

  const asJson = Boolean(parsed.values.json);
  const result = lintThemeDir(resolvedDir, {
    allowPartial: Boolean(parsed.values["allow-partial"]),
    requireDropReport: Boolean(parsed.values["require-drop-report"]),
  });

  // Under --json, ONLY the JSON blob reaches stdout; human output (and any
  // future incidental notes) goes to stderr instead, so `weave-theme lint
  // <dir> --json | jq .` never has to skip over prose.
  if (asJson) {
    process.stdout.write(`${formatJson(result)}\n`);
  } else {
    process.stdout.write(`${formatHuman(result)}\n`);
  }

  return result.ok ? 0 : 1;
}

function main(): number {
  const command = process.argv[2];
  const rest = process.argv.slice(3);
  switch (command) {
    case "lint":
      return runLint(rest);
    case "list":
      return runList(rest);
    case "use":
      return runUse(rest);
    // Asking for help is a successful interaction, not a usage error: usage
    // goes to stdout with exit 0, unlike the unknown-command path below
    // (stderr, exit 2).
    case "help":
    case "--help":
    case "-h":
      process.stdout.write(`${usage()}\n`);
      return 0;
    default:
      process.stderr.write(
        `weave-theme: unknown command ${command ? `"${command}"` : "(none given)"}\n\n${usage()}\n`,
      );
      return 2;
  }
}

// Top-level safety net: lintThemeDir only guards the failure modes it knows
// about (missing/oversized files, invalid CSS, invalid JSON). An unexpected
// filesystem error it doesn't anticipate (e.g. `weave-theme.css` existing
// as a directory, or a permissions problem) would otherwise surface as a
// raw Node stack trace and the process's default (non-2) crash exit code.
// Converting that into the same "2 = usage/IO failure" contract every other
// bad-input path already uses keeps the exit-code contract honest.
try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`weave-theme: unexpected error: ${(err as Error).message}\n`);
  process.exit(2);
}
