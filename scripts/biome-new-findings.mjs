#!/usr/bin/env node
/**
 * Biome gate that fails only on NEWLY introduced findings.
 *
 * The repository carries a known baseline of formatting and import-order
 * findings, concentrated in the files the primitive-portfolio waves will edit
 * most. A plain `biome check .` in CI would therefore block every PR on debt
 * it did not create, and `--changed` is not the answer either: it still fails
 * a PR for pre-existing findings inside a file the PR merely touched.
 *
 * So: run the SAME Biome binary over the base ref and over the working tree,
 * fingerprint every diagnostic, and fail only on fingerprints the base did not
 * already have.
 *
 * Usage:   node scripts/biome-new-findings.mjs <base-ref>
 * Example: node scripts/biome-new-findings.mjs origin/main
 *
 * Exit codes:
 *   0 - no new findings (pre-existing ones are reported, not failed on)
 *   1 - new findings introduced
 *   2 - the gate itself could not run (never confused with a clean pass)
 *
 * Note: a PR that tightens biome.json runs the base with the base config and
 * the head with the new config, so findings unlocked by the new rule count as
 * new. That is deliberate: you enabled the rule, you own its findings.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BIOME_BIN = path.join(REPO_ROOT, "node_modules", "@biomejs", "biome", "bin", "biome");
const MAX_DIAGNOSTICS = "10000";

/** Hard failure of the gate itself. Never exits 0, never looks like a pass. */
function die(message, detail) {
  console.error(`\nbiome-new-findings: ${message}`);
  if (detail) console.error(String(detail).slice(0, 4000));
  process.exit(2);
}

function git(args, cwd = REPO_ROOT) {
  return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

/**
 * Run `biome check` in `cwd` and return its diagnostics.
 * Biome exits non-zero whenever diagnostics exist, so the exit code carries no
 * information here - stdout does. Unparseable stdout means the tool failed to
 * run, which must never be read as "no findings".
 */
function biomeDiagnostics(cwd, label) {
  let stdout = "";
  try {
    stdout = execFileSync(
      process.execPath,
      [BIOME_BIN, "check", ".", "--reporter=json", `--max-diagnostics=${MAX_DIAGNOSTICS}`],
      { cwd, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (err) {
    // Diagnostics present -> non-zero exit with JSON still on stdout.
    stdout = err?.stdout ?? "";
    if (!stdout) {
      die(`Biome produced no output for the ${label} tree`, err?.stderr ?? err);
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    die(`Biome output for the ${label} tree was not JSON - the gate could not run`, stdout);
  }
  if (!Array.isArray(parsed.diagnostics)) {
    die(`Biome JSON for the ${label} tree has no diagnostics array`, stdout.slice(0, 1000));
  }
  return parsed.diagnostics;
}

function diagnosticFile(d) {
  const p = d.location?.path;
  if (typeof p === "string") return p;
  return typeof p?.file === "string" ? p.file : "<unknown>";
}

/**
 * Line and column are deliberately excluded: unrelated edits shift them, and a
 * shifted pre-existing finding is not a new finding.
 */
function fingerprint(d) {
  const message = typeof d.message === "string" ? d.message : JSON.stringify(d.message ?? null);
  return [diagnosticFile(d), d.category ?? "<none>", message].join(" :: ");
}

function tally(diagnostics) {
  const counts = new Map();
  for (const d of diagnostics) {
    const key = fingerprint(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

const baseRef = process.argv[2];
if (!baseRef) die("no base ref given (usage: biome-new-findings.mjs <base-ref>)");

let baseSha;
try {
  baseSha = git(["rev-parse", "--verify", `${baseRef}^{commit}`]);
} catch (err) {
  die(`could not resolve base ref ${baseRef}`, err?.stderr ?? err);
}

const workdir = mkdtempSync(path.join(tmpdir(), "biome-base-"));
const baseTree = path.join(workdir, "tree");
let baseCounts;
try {
  git(["worktree", "add", "--detach", baseTree, baseSha]);
  baseCounts = tally(biomeDiagnostics(baseTree, "base"));
} finally {
  // Removed from the repo root, never from inside the worktree being removed.
  try {
    git(["worktree", "remove", "--force", baseTree]);
  } catch {
    /* best effort; the temp dir goes next regardless */
  }
  rmSync(workdir, { recursive: true, force: true });
}

const headDiagnostics = biomeDiagnostics(REPO_ROOT, "head");

const baseTotal = [...baseCounts.values()].reduce((a, b) => a + b, 0);
const headTotal = headDiagnostics.length;

// Each head diagnostic consumes one occurrence of its fingerprint from the
// baseline budget. Anything left once the budget is spent is new.
const budget = new Map(baseCounts);
const introduced = [];
for (const d of headDiagnostics) {
  const key = fingerprint(d);
  const left = budget.get(key) ?? 0;
  if (left > 0) {
    budget.set(key, left - 1);
    continue;
  }
  introduced.push(d);
}

console.log(`Biome baseline (${baseRef} @ ${baseSha.slice(0, 8)}): ${baseTotal} diagnostics`);
console.log(`Biome head: ${headTotal} diagnostics`);

if (introduced.length === 0) {
  console.log(`\nNo new Biome findings. ${baseTotal} pre-existing finding(s) left untouched.`);
  process.exit(0);
}

console.error(`\n${introduced.length} NEW Biome finding(s) introduced by this change:\n`);
for (const d of introduced) {
  const line = d.location?.start?.line ? `:${d.location.start.line}` : "";
  console.error(`  ${diagnosticFile(d)}${line}  [${d.category}] ${d.message}`);
}
console.error("\nRun `pnpm format` and re-check, or fix the reported rule violations.");
process.exit(1);
