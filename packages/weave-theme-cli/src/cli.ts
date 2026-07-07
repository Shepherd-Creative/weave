#!/usr/bin/env node
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { lintThemeDir } from "./lint.js";
import { formatHuman, formatJson } from "./output.js";

// Dispatch is a plain switch on argv[2], each subcommand parsing its own
// remaining args with node:util's parseArgs — no framework. `lint` is the
// only subcommand today; `list` and `use` (the design-source adapter stage)
// drop in the same way: another case, another `run<Name>(rest): number`.

function usage(): string {
  return [
    "Usage: weave-theme <command> [options]",
    "",
    "Commands:",
    "  lint <themeDir>   Lint a Weave theme directory",
    "",
    "lint options:",
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
    process.stderr.write(`weave-theme lint: ${(err as Error).message}\n\n${usage()}\n`);
    return 2;
  }

  const dir = parsed.positionals[0];
  if (!dir) {
    process.stderr.write(`weave-theme lint: missing <themeDir>\n\n${usage()}\n`);
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

  // Under --json, ONLY the JSON blob reaches stdout — human output (and any
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
    default:
      process.stderr.write(
        `weave-theme: unknown command ${command ? `"${command}"` : "(none given)"}\n\n${usage()}\n`,
      );
      return 2;
  }
}

process.exit(main());
