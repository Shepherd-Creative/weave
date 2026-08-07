import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findIntroduced, parseUnifiedDiff } from "../lib/biome-diff.mjs";

/**
 * The gate's identity rules, exercised without running Biome or git.
 *
 * The scenarios below are written as real `git diff -U0` text so the parser is
 * tested against the format git actually emits (including the short `@@ -150
 * +150 @@` form git uses when a hunk covers exactly one line).
 */

const KEY_RULE = "lint/suspicious/noArrayIndexKey";
const KEY_MESSAGE = "Avoid using the index of an array as key property in an element.";

/** A Biome diagnostic as the JSON reporter emits it. */
function diag(file, line, category = KEY_RULE, message = KEY_MESSAGE) {
  return {
    severity: "error",
    message,
    category,
    location: { path: file, start: { line, column: 5 }, end: { line, column: 20 } },
  };
}

const introducedLines = (result) => result.map((d) => d.location.start.line);

describe("parseUnifiedDiff", () => {
  it("reads paths and hunks, including git's single-line short form", () => {
    const diffs = parseUnifiedDiff(
      [
        "diff --git a/src/Chart.tsx b/src/Chart.tsx",
        "index 1111111..2222222 100644",
        "--- a/src/Chart.tsx",
        "+++ b/src/Chart.tsx",
        "@@ -150 +150 @@",
        "-        key={i}",
        "+        key={cell.id}",
        "@@ -300,0 +301,2 @@",
        "+  {rows.map((r, i) => (",
        "+    <li key={i}>{r}</li>",
      ].join("\n"),
    );

    assert.equal(diffs.size, 1);
    const entry = diffs.get("src/Chart.tsx");
    assert.equal(entry.basePath, "src/Chart.tsx");
    assert.deepEqual(entry.hunks, [
      { baseStart: 150, baseLines: 1, headStart: 150, headLines: 1 },
      { baseStart: 300, baseLines: 0, headStart: 301, headLines: 2 },
    ]);
  });

  it("records an added file as having no base counterpart, and drops deletions", () => {
    const diffs = parseUnifiedDiff(
      [
        "diff --git a/src/New.tsx b/src/New.tsx",
        "new file mode 100644",
        "--- /dev/null",
        "+++ b/src/New.tsx",
        "@@ -0,0 +1,3 @@",
        "+const a = 1;",
        "diff --git a/src/Gone.tsx b/src/Gone.tsx",
        "deleted file mode 100644",
        "--- a/src/Gone.tsx",
        "+++ /dev/null",
        "@@ -1,3 +0,0 @@",
        "-const b = 2;",
      ].join("\n"),
    );

    assert.equal(diffs.get("src/New.tsx").basePath, null);
    // A deleted file has no head side, so it can carry no head diagnostics.
    assert.deepEqual([...diffs.keys()], ["src/New.tsx"]);
  });

  it("decodes the C-quoted paths git emits for non-ASCII filenames", () => {
    const diffs = parseUnifiedDiff(
      [
        'diff --git "a/src/caf\\303\\251.tsx" "b/src/caf\\303\\251.tsx"',
        '--- "a/src/caf\\303\\251.tsx"',
        '+++ "b/src/caf\\303\\251.tsx"',
        "@@ -1 +1 @@",
        "-const a = 1;",
        "+const a = 2;",
      ].join("\n"),
    );

    assert.deepEqual([...diffs.keys()], ["src/café.tsx"]);
    assert.equal(diffs.get("src/café.tsx").basePath, "src/café.tsx");
  });

  it("does not mistake diff body content for a file header", () => {
    // A deleted line whose own text is `-- a/x.ts` renders as `--- a/x.ts`.
    const diffs = parseUnifiedDiff(
      [
        "diff --git a/docs/notes.md b/docs/notes.md",
        "--- a/docs/notes.md",
        "+++ b/docs/notes.md",
        "@@ -4 +4 @@",
        "--- a/impostor.ts",
        "+++ b/impostor.ts",
      ].join("\n"),
    );

    assert.deepEqual([...diffs.keys()], ["docs/notes.md"]);
  });
});

describe("findIntroduced", () => {
  it("REPRO: a baseline finding removed here and reintroduced there is NOT consumed", () => {
    // The bypass: the base carries one noArrayIndexKey at line 150. The change
    // deletes it and introduces the same rule and message at line 301 of the
    // same file. File + category + message are identical, so any identity that
    // ignores position sees a clean swap and reports nothing.
    const diffText = [
      "diff --git a/src/Chart.tsx b/src/Chart.tsx",
      "--- a/src/Chart.tsx",
      "+++ b/src/Chart.tsx",
      "@@ -150 +150 @@",
      "-        key={i}",
      "+        key={cell.id}",
      "@@ -300,0 +301,2 @@",
      "+  {rows.map((r, i) => (",
      "+    <li key={i}>{r}</li>",
    ].join("\n");

    const introduced = findIntroduced({
      baseDiagnostics: [diag("src/Chart.tsx", 150)],
      headDiagnostics: [diag("src/Chart.tsx", 301)],
      fileDiffs: parseUnifiedDiff(diffText),
    });

    assert.deepEqual(introducedLines(introduced), [301]);
  });

  it("REPRO: relocation is caught even when the file is otherwise untouched", () => {
    // Same swap, expressed as one rewritten line and one appended block.
    const diffText = [
      "diff --git a/src/List.tsx b/src/List.tsx",
      "--- a/src/List.tsx",
      "+++ b/src/List.tsx",
      "@@ -10 +10 @@",
      "-  <li key={i}>",
      "+  <li key={row.id}>",
      "@@ -40,0 +41 @@",
      "+  <li key={i}>",
    ].join("\n");

    const introduced = findIntroduced({
      baseDiagnostics: [diag("src/List.tsx", 10)],
      headDiagnostics: [diag("src/List.tsx", 41)],
      fileDiffs: parseUnifiedDiff(diffText),
    });

    assert.deepEqual(introducedLines(introduced), [41]);
  });

  it("tolerates a pre-existing finding shifted by an edit above it", () => {
    const diffText = [
      "diff --git a/src/Chart.tsx b/src/Chart.tsx",
      "--- a/src/Chart.tsx",
      "+++ b/src/Chart.tsx",
      "@@ -9,0 +10,5 @@",
      "+// five",
      "+// new",
      "+// lines",
      "+// of",
      "+// comment",
    ].join("\n");

    const introduced = findIntroduced({
      baseDiagnostics: [diag("src/Chart.tsx", 150)],
      headDiagnostics: [diag("src/Chart.tsx", 155)],
      fileDiffs: parseUnifiedDiff(diffText),
    });

    assert.deepEqual(introduced, []);
  });

  it("tolerates a pre-existing finding on a line the change itself edited", () => {
    // The gate exists so a PR is not blocked by debt in the region it touched:
    // the finding survives inside the rewritten hunk, so it stays pre-existing.
    const diffText = [
      "diff --git a/src/Chart.tsx b/src/Chart.tsx",
      "--- a/src/Chart.tsx",
      "+++ b/src/Chart.tsx",
      "@@ -148,4 +148,4 @@",
      "-  const rows = props.rows;",
      "-  return rows.map((r, i) => <li key={i}>{r.name}</li>);",
      "-  // trailing",
      "-  // comment",
      "+  const rows = props.data;",
      "+  return rows.map((r, i) => <li key={i}>{r.label}</li>);",
      "+  // trailing",
      "+  // comment",
    ].join("\n");

    const introduced = findIntroduced({
      baseDiagnostics: [diag("src/Chart.tsx", 149)],
      headDiagnostics: [diag("src/Chart.tsx", 149)],
      fileDiffs: parseUnifiedDiff(diffText),
    });

    assert.deepEqual(introduced, []);
  });

  it("carries a pre-existing finding across a rename", () => {
    const diffText = [
      "diff --git a/src/Old.tsx b/src/New.tsx",
      "similarity index 98%",
      "rename from src/Old.tsx",
      "rename to src/New.tsx",
      "--- a/src/Old.tsx",
      "+++ b/src/New.tsx",
    ].join("\n");

    const introduced = findIntroduced({
      baseDiagnostics: [diag("src/Old.tsx", 10)],
      headDiagnostics: [diag("src/New.tsx", 10)],
      fileDiffs: parseUnifiedDiff(diffText),
    });

    assert.deepEqual(introduced, []);
  });

  it("keeps file-level format findings pre-existing when the file is edited", () => {
    // Biome reports `format` once per file, at line 0.
    const diffText = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -5,2 +5,3 @@",
      "-const a = 1;",
      "-const b = 2;",
      "+const a = 1;",
      "+const b = 2;",
      "+const c = 3;",
    ].join("\n");
    const format = (file) => ({
      severity: "error",
      message: "Formatter would have printed the following content:",
      category: "format",
      location: { path: file, start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
    });

    const introduced = findIntroduced({
      baseDiagnostics: [format("src/app.ts")],
      headDiagnostics: [format("src/app.ts")],
      fileDiffs: parseUnifiedDiff(diffText),
    });

    assert.deepEqual(introduced, []);
  });

  it("reports a finding added to a file with no baseline finding", () => {
    const introduced = findIntroduced({
      baseDiagnostics: [],
      headDiagnostics: [diag("src/Fresh.tsx", 12)],
      fileDiffs: parseUnifiedDiff(
        [
          "diff --git a/src/Fresh.tsx b/src/Fresh.tsx",
          "new file mode 100644",
          "--- /dev/null",
          "+++ b/src/Fresh.tsx",
          "@@ -0,0 +1,20 @@",
          "+const a = 1;",
        ].join("\n"),
      ),
    });

    assert.deepEqual(introducedLines(introduced), [12]);
  });

  it("reports a second copy of a finding that already existed once", () => {
    const diffText = [
      "diff --git a/src/Chart.tsx b/src/Chart.tsx",
      "--- a/src/Chart.tsx",
      "+++ b/src/Chart.tsx",
      "@@ -200,0 +201 @@",
      "+  {rows.map((r, i) => <li key={i}>{r}</li>)}",
    ].join("\n");

    const introduced = findIntroduced({
      baseDiagnostics: [diag("src/Chart.tsx", 150)],
      headDiagnostics: [diag("src/Chart.tsx", 150), diag("src/Chart.tsx", 201)],
      fileDiffs: parseUnifiedDiff(diffText),
    });

    assert.deepEqual(introducedLines(introduced), [201]);
  });

  it("treats a file absent from the diff as unchanged, and holds that line strictly", () => {
    // No diff entry means git says the file did not change, so its baseline
    // findings keep their exact lines. A finding somewhere else in such a file
    // cannot be pre-existing, and must not be absorbed.
    const unchanged = findIntroduced({
      baseDiagnostics: [diag("src/Chart.tsx", 150)],
      headDiagnostics: [diag("src/Chart.tsx", 150)],
      fileDiffs: parseUnifiedDiff(""),
    });
    assert.deepEqual(unchanged, []);

    const moved = findIntroduced({
      baseDiagnostics: [diag("src/Chart.tsx", 150)],
      headDiagnostics: [diag("src/Chart.tsx", 900)],
      fileDiffs: parseUnifiedDiff(""),
    });
    assert.deepEqual(introducedLines(moved), [900]);
  });
});
