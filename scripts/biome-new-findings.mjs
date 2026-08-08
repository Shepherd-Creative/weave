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
 * and fail only on diagnostics the base did not already have.
 *
 * "Already have" is decided against `git diff -U0` between the two trees, not
 * against a position-blind fingerprint. A baseline finding is claimable by a
 * head finding in exactly two ways:
 *
 *   1. the code holding it was not touched, so git's hunks give it one known
 *      head line, and the head finding sits exactly there;
 *   2. the change rewrote the region holding it, AND the offending source line
 *      is byte-identical (trimmed) on both sides, AND that line pairs the two
 *      findings ONE TO ONE — the head finding has exactly one such candidate
 *      and that candidate has exactly one suitor.
 *
 * Sharing a rewritten hunk is NOT enough, and neither is a matching source line
 * on its own: a `-U0` hunk deletes every base line and adds every head line,
 * and two identical lines are identical evidence, so an anchor appearing twice
 * in one hunk identifies a set rather than a finding.
 *
 * Anchors are compared TRIMMED, so leading and trailing whitespace never count
 * as a difference: a pure re-indent of a uniquely-anchored finding is still
 * claimed. Whitespace inside the line is not stripped and does change it.
 *
 * The contract is therefore FAIL CLOSED: wherever identity cannot be proven —
 * unreadable source, an anchor line whose trimmed text changed, or an ambiguous
 * anchor — the finding is REPORTED AS INTRODUCED. That reports some debt
 * you merely carried through a rewrite; a false positive costs a fix, while a
 * false negative is a silent pass. See scripts/lib/biome-diff.mjs for the rules
 * in full and every trade-off they carry.
 *
 * Usage:   node scripts/biome-new-findings.mjs <base-ref>
 * Example: node scripts/biome-new-findings.mjs origin/main
 *
 * Exit codes:
 *   0 - no new findings (pre-existing ones are reported, not failed on)
 *   1 - new findings introduced, OR carried through a change that makes their
 *       identity unprovable (see the fail-closed contract above)
 *   2 - the gate itself could not run (never confused with a clean pass)
 *
 * Note: a PR that tightens biome.json runs the base with the base config and
 * the head with the new config, so findings unlocked by the new rule count as
 * new. That is deliberate: you enabled the rule, you own its findings.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnosticFile, findIntroduced, parseUnifiedDiff } from "./lib/biome-diff.mjs";

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
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
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

const baseRef = process.argv[2];
if (!baseRef) die("no base ref given (usage: biome-new-findings.mjs <base-ref>)");

let baseSha;
try {
  baseSha = git(["rev-parse", "--verify", `${baseRef}^{commit}`]);
} catch (err) {
  die(`could not resolve base ref ${baseRef}`, err?.stderr ?? err);
}

// Positional evidence for the comparison. Without it the gate cannot tell a
// shifted finding from a relocated one, so a failure here is exit 2, never a
// pass. `-U0` keeps hunks minimal (no context lines), which keeps the
// "the change rewrote this region" window as tight as git can make it.
let fileDiffs;
try {
  fileDiffs = parseUnifiedDiff(
    git(["-c", "core.quotePath=false", "diff", "-U0", "-M", baseSha, "--"]),
  );
} catch (err) {
  die(`could not diff ${baseRef} against the working tree`, err?.stderr ?? err);
}

/**
 * Full text of every file carrying a diagnostic, so the matcher can compare
 * the offending source line across the two trees. An unreadable file is simply
 * absent, which the matcher treats as "identity unknown" — it never claims on
 * a missing anchor.
 */
function sourcesFor(root, diagnostics) {
  const sources = new Map();
  for (const d of diagnostics) {
    const file = diagnosticFile(d);
    if (sources.has(file)) continue;
    try {
      sources.set(file, readFileSync(path.join(root, file), "utf-8"));
    } catch {
      /* unreadable on this side: the matcher falls back to reporting */
    }
  }
  return sources;
}

const workdir = mkdtempSync(path.join(tmpdir(), "biome-base-"));
const baseTree = path.join(workdir, "tree");
let baseDiagnostics;
let baseSources;
try {
  git(["worktree", "add", "--detach", baseTree, baseSha]);
  baseDiagnostics = biomeDiagnostics(baseTree, "base");
  // Read before the worktree goes away in `finally`.
  baseSources = sourcesFor(baseTree, baseDiagnostics);
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

const baseTotal = baseDiagnostics.length;
const headTotal = headDiagnostics.length;

const introduced = findIntroduced({
  baseDiagnostics,
  headDiagnostics,
  fileDiffs,
  baseSources,
  headSources: sourcesFor(REPO_ROOT, headDiagnostics),
});

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
console.error(
  "\nA finding is claimed as pre-existing only on an untouched line, or on a\n" +
    "source line whose TRIMMED text is byte-identical on both sides and pairs\n" +
    "one-to-one inside the hunk that rewrote it. This gate fails closed: if your\n" +
    "change altered the trimmed text of the line carrying a finding, or rewrote a\n" +
    "region holding two identical offending lines, its identity cannot be proven\n" +
    "and it is reported here even though you did not introduce it.\n" +
    "\n" +
    "Leading and trailing whitespace are stripped before that comparison, so a\n" +
    "pure re-indent of a uniquely-anchored finding is still claimed and is NOT\n" +
    "why you are seeing this. Whitespace INSIDE the line is not stripped, so\n" +
    "changing it does change the anchor. Fix the finding rather than loosening\n" +
    "the gate.",
);
process.exit(1);
