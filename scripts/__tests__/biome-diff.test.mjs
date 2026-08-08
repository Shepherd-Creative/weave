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

  describe("inside a rewritten hunk", () => {
    // A `-U0` hunk deletes every base line and adds every head line, so sharing
    // one proves nothing on its own. The only identity evidence available is
    // the offending source line itself: Biome's JSON reporter carries no source
    // text and no stable diagnostic id (its `advices` are another position plus
    // generic prose), so the gate reads both trees and compares.
    const REWRITE = [
      "diff --git a/src/List.tsx b/src/List.tsx",
      "--- a/src/List.tsx",
      "+++ b/src/List.tsx",
      "@@ -10,3 +10,3 @@",
      "-  <li key={i}>",
      "-  <span>a</span>",
      "-  <span>b</span>",
      "+  <li key={row.id}>",
      "+  <span>a</span>",
      "+  <em>{items.map((x, i) => <b key={i}>{x}</b>)}</em>",
    ].join("\n");

    /** A file whose line `n` holds `text`; the rest is filler. */
    const fileWith = (n, text) =>
      Array.from({ length: n + 5 }, (_, i) => (i + 1 === n ? text : `// line ${i + 1}`)).join("\n");

    it("REPRO: does NOT claim a baseline finding merely for sharing the hunk", () => {
      // The reviewer's exact call: a three-line replacement that deletes the
      // baseline finding at line 10 and introduces an identical one at line 12,
      // with no source available. Without evidence the two are the same
      // finding, the gate must fail closed and report it.
      const introduced = findIntroduced({
        baseDiagnostics: [diag("src/List.tsx", 10)],
        headDiagnostics: [diag("src/List.tsx", 12)],
        fileDiffs: parseUnifiedDiff(REWRITE),
      });

      assert.deepEqual(introducedLines(introduced), [12]);
    });

    it("REPRO: reports an in-hunk replacement when the offending line differs", () => {
      const introduced = findIntroduced({
        baseDiagnostics: [diag("src/List.tsx", 10)],
        headDiagnostics: [diag("src/List.tsx", 12)],
        fileDiffs: parseUnifiedDiff(REWRITE),
        baseSources: new Map([["src/List.tsx", fileWith(10, "  <li key={i}>")]]),
        headSources: new Map([
          ["src/List.tsx", fileWith(12, "  <em>{items.map((x, i) => <b key={i}>{x}</b>)}</em>")],
        ]),
      });

      assert.deepEqual(introducedLines(introduced), [12]);
    });

    it("claims a finding that moved inside the hunk on a byte-identical line", () => {
      // The one case where identity IS proven in a rewritten region: the
      // offending source line is unchanged, so this is the same finding.
      const introduced = findIntroduced({
        baseDiagnostics: [diag("src/List.tsx", 10)],
        headDiagnostics: [diag("src/List.tsx", 12)],
        fileDiffs: parseUnifiedDiff(REWRITE),
        baseSources: new Map([["src/List.tsx", fileWith(10, "  <li key={i}>")]]),
        headSources: new Map([["src/List.tsx", fileWith(12, "  <li key={i}>")]]),
      });

      assert.deepEqual(introduced, []);
    });

    it("claims a uniquely-anchored finding through a whitespace-only re-indent", () => {
      // Pins the documented boundary, which the runner's failure text and the
      // handoff both state: anchors are compared TRIMMED, so re-indenting the
      // line carrying a finding is not an edit to its identity. Without this,
      // reformatting a block would report every finding inside it.
      const introduced = findIntroduced({
        baseDiagnostics: [diag("src/List.tsx", 10)],
        headDiagnostics: [diag("src/List.tsx", 12)],
        fileDiffs: parseUnifiedDiff(REWRITE),
        baseSources: new Map([["src/List.tsx", fileWith(10, "  <li key={i}>")]]),
        headSources: new Map([["src/List.tsx", fileWith(12, "        <li key={i}>")]]),
      });

      assert.deepEqual(introduced, []);
    });

    it("reports a finding whose anchor changed only in INTERIOR whitespace", () => {
      // The other side of that boundary, and the reason the documentation says
      // "trimmed text" rather than "whitespace-only": `trim()` strips the ends,
      // not the middle, so respacing inside the line does change the anchor.
      const introduced = findIntroduced({
        baseDiagnostics: [diag("src/List.tsx", 10)],
        headDiagnostics: [diag("src/List.tsx", 12)],
        fileDiffs: parseUnifiedDiff(REWRITE),
        baseSources: new Map([["src/List.tsx", fileWith(10, "  <li  key={i}>")]]),
        headSources: new Map([["src/List.tsx", fileWith(12, "  <li key={i}>")]]),
      });

      assert.deepEqual(introducedLines(introduced), [12]);
    });

    it("reports a finding whose own line the change edited (fail closed)", () => {
      // The sensitivity cost of the rule above: edit the line carrying a
      // pre-existing finding and the finding is reported, because nothing
      // proves the head finding is the base one. Fixing it is the remedy.
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
        baseSources: new Map([
          [
            "src/Chart.tsx",
            fileWith(149, "  return rows.map((r, i) => <li key={i}>{r.name}</li>);"),
          ],
        ]),
        headSources: new Map([
          [
            "src/Chart.tsx",
            fileWith(149, "  return rows.map((r, i) => <li key={i}>{r.label}</li>);"),
          ],
        ]),
      });

      assert.deepEqual(introducedLines(introduced), [149]);
    });

    describe("when the same anchor appears more than once", () => {
      // Identical source lines are identical evidence. Two of them in one
      // rewritten hunk cannot be told apart, so no head diagnostic can prove
      // WHICH baseline finding it is. The gate fails closed: it claims only
      // where the anchor establishes a one-to-one pairing, and reports
      // everything ambiguous.
      const DUP = "  <li key={i}/>";

      /** A file whose numbered lines hold the given text; the rest is filler. */
      const fileOf = (lines, length = 20) =>
        Array.from({ length }, (_, i) => lines[i + 1] ?? `// line ${i + 1}`).join("\n");

      // Base 10-12 rewritten into head 10-12. Lines 10 and 12 are the same
      // duplicated element on both sides; line 11 is the only visible change.
      const REWRITE_3 = [
        "diff --git a/src/List.tsx b/src/List.tsx",
        "--- a/src/List.tsx",
        "+++ b/src/List.tsx",
        "@@ -10,3 +10,3 @@",
        `-${DUP}`,
        "-  <span>a</span>",
        `-${DUP}`,
        `+${DUP}`,
        "+  <span>b</span>",
        `+${DUP}`,
      ].join("\n");

      it("REPRO: two identical anchors in one hunk are ambiguous, so neither is claimed", () => {
        // The third reviewer's exact call: two baseline and two head
        // noArrayIndexKey diagnostics on identical `<li key={i}/>` lines in one
        // -U0 hunk. Modelling base line 10 as removed and head line 12 as newly
        // introduced is indistinguishable from "both survived" — the anchors are
        // byte-identical, so the evidence maps each head finding to BOTH
        // baseline findings. Previously the matcher consumed the first unclaimed
        // candidate and returned []; that is arbitrary, not proof.
        const introduced = findIntroduced({
          baseDiagnostics: [diag("src/List.tsx", 10), diag("src/List.tsx", 12)],
          headDiagnostics: [diag("src/List.tsx", 10), diag("src/List.tsx", 12)],
          fileDiffs: parseUnifiedDiff(REWRITE_3),
          baseSources: new Map([
            ["src/List.tsx", fileOf({ 10: DUP, 11: "  <span>a</span>", 12: DUP })],
          ]),
          headSources: new Map([
            ["src/List.tsx", fileOf({ 10: DUP, 11: "  <span>b</span>", 12: DUP })],
          ]),
        });

        assert.deepEqual(introducedLines(introduced), [10, 12]);
      });

      it("does not arbitrarily claim one baseline finding for two head suitors", () => {
        // One baseline anchor, two head findings on identical lines inside the
        // hunk. Exactly one of them is new and nothing says which, so both are
        // reported rather than picking a winner.
        const diffText = [
          "diff --git a/src/List.tsx b/src/List.tsx",
          "--- a/src/List.tsx",
          "+++ b/src/List.tsx",
          "@@ -10,2 +10,3 @@",
          `-${DUP}`,
          "-  <span>a</span>",
          `+${DUP}`,
          "+  <span>a</span>",
          `+${DUP}`,
        ].join("\n");

        const introduced = findIntroduced({
          baseDiagnostics: [diag("src/List.tsx", 10)],
          headDiagnostics: [diag("src/List.tsx", 10), diag("src/List.tsx", 12)],
          fileDiffs: parseUnifiedDiff(diffText),
          baseSources: new Map([["src/List.tsx", fileOf({ 10: DUP, 11: "  <span>a</span>" })]]),
          headSources: new Map([
            ["src/List.tsx", fileOf({ 10: DUP, 11: "  <span>a</span>", 12: DUP })],
          ]),
        });

        assert.deepEqual(introducedLines(introduced), [10, 12]);
      });

      it("ACCEPTED COST: removing one of two duplicates reports the survivor", () => {
        // The false positive this policy buys. The change deleted one of two
        // identical findings and introduced nothing, yet the survivor is
        // reported: two baseline candidates fit it equally well, so its identity
        // is unproven. Debt that was merely preserved must be cleaned up rather
        // than claimed on a coin toss. Chosen deliberately — a false positive
        // costs a fix, a false negative is a silent pass.
        const diffText = [
          "diff --git a/src/List.tsx b/src/List.tsx",
          "--- a/src/List.tsx",
          "+++ b/src/List.tsx",
          "@@ -10,3 +10,2 @@",
          `-${DUP}`,
          "-  <span>a</span>",
          `-${DUP}`,
          `+${DUP}`,
          "+  <span>a</span>",
        ].join("\n");

        const introduced = findIntroduced({
          baseDiagnostics: [diag("src/List.tsx", 10), diag("src/List.tsx", 12)],
          headDiagnostics: [diag("src/List.tsx", 10)],
          fileDiffs: parseUnifiedDiff(diffText),
          baseSources: new Map([
            ["src/List.tsx", fileOf({ 10: DUP, 11: "  <span>a</span>", 12: DUP })],
          ]),
          headSources: new Map([["src/List.tsx", fileOf({ 10: DUP, 11: "  <span>a</span>" })]]),
        });

        assert.deepEqual(introducedLines(introduced), [10]);
      });

      it("still claims two DISTINCT anchors that moved within the hunk", () => {
        // The retained case: each anchor pairs with exactly one baseline
        // finding, in both directions, so the reordering is proven and neither
        // finding is reported. Fail-closed must not mean fail-always.
        const first = "  <li key={i}/>";
        const second = "  <ul>{xs.map((x, i) => <b key={i}>{x}</b>)}</ul>";
        const diffText = [
          "diff --git a/src/List.tsx b/src/List.tsx",
          "--- a/src/List.tsx",
          "+++ b/src/List.tsx",
          "@@ -10,3 +10,3 @@",
          `-${first}`,
          "-  <span>a</span>",
          `-${second}`,
          `-${second}`.replace("-", "+"),
          "+  <span>a</span>",
          `+${first}`,
        ].join("\n");

        const introduced = findIntroduced({
          baseDiagnostics: [diag("src/List.tsx", 10), diag("src/List.tsx", 12)],
          headDiagnostics: [diag("src/List.tsx", 10), diag("src/List.tsx", 12)],
          fileDiffs: parseUnifiedDiff(diffText),
          baseSources: new Map([
            ["src/List.tsx", fileOf({ 10: first, 11: "  <span>a</span>", 12: second })],
          ]),
          headSources: new Map([
            ["src/List.tsx", fileOf({ 10: second, 11: "  <span>a</span>", 12: first })],
          ]),
        });

        assert.deepEqual(introduced, []);
      });

      it("scopes ambiguity to one fingerprint, not the whole hunk", () => {
        // A different rule sharing the hunk is a different pool, so it cannot
        // make an otherwise-unique anchor ambiguous.
        const other = "  const x = a == b;";
        const diffText = [
          "diff --git a/src/List.tsx b/src/List.tsx",
          "--- a/src/List.tsx",
          "+++ b/src/List.tsx",
          "@@ -10,2 +10,2 @@",
          `-${DUP}`,
          `-${other}`,
          `-${other}`.replace("-", "+"),
          `+${DUP}`,
        ].join("\n");
        const eq = (line) =>
          diag("src/List.tsx", line, "lint/suspicious/noDoubleEquals", "Use === instead of ==.");

        const introduced = findIntroduced({
          baseDiagnostics: [diag("src/List.tsx", 10), eq(11)],
          headDiagnostics: [eq(10), diag("src/List.tsx", 11)],
          fileDiffs: parseUnifiedDiff(diffText),
          baseSources: new Map([["src/List.tsx", fileOf({ 10: DUP, 11: other })]]),
          headSources: new Map([["src/List.tsx", fileOf({ 10: other, 11: DUP })]]),
        });

        assert.deepEqual(introduced, []);
      });

      it("fails closed when the BASE source is unavailable", () => {
        // No base anchor means no evidence at all, so the head finding cannot
        // be paired with anything — reported, never claimed on position.
        const introduced = findIntroduced({
          baseDiagnostics: [diag("src/List.tsx", 10)],
          headDiagnostics: [diag("src/List.tsx", 12)],
          fileDiffs: parseUnifiedDiff(REWRITE_3),
          baseSources: new Map(),
          headSources: new Map([["src/List.tsx", fileOf({ 12: DUP })]]),
        });

        assert.deepEqual(introducedLines(introduced), [12]);
      });

      it("fails closed when the HEAD source is unavailable", () => {
        const introduced = findIntroduced({
          baseDiagnostics: [diag("src/List.tsx", 10)],
          headDiagnostics: [diag("src/List.tsx", 12)],
          fileDiffs: parseUnifiedDiff(REWRITE_3),
          baseSources: new Map([["src/List.tsx", fileOf({ 10: DUP })]]),
          headSources: new Map(),
        });

        assert.deepEqual(introducedLines(introduced), [12]);
      });
    });

    it("keeps claiming a multi-line finding whose anchor line is untouched", () => {
      // organizeImports spans the whole import block but starts at the first
      // import. Adding an import lower down rewrites the block without moving
      // that anchor, so the finding stays pre-existing.
      const organize = (line) => ({
        severity: "error",
        message: "The imports and exports are not sorted.",
        category: "assist/source/organizeImports",
        location: { path: "src/app.ts", start: { line, column: 1 }, end: { line: 30, column: 1 } },
      });
      const diffText = [
        "diff --git a/src/app.ts b/src/app.ts",
        "--- a/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -1,3 +1,4 @@",
        '-import { a } from "./a.js";',
        '-import { b } from "./b.js";',
        '-import { c } from "./c.js";',
        '+import { a } from "./a.js";',
        '+import { b } from "./b.js";',
        '+import { c } from "./c.js";',
        '+import { d } from "./d.js";',
      ].join("\n");

      const introduced = findIntroduced({
        baseDiagnostics: [organize(1)],
        headDiagnostics: [organize(1)],
        fileDiffs: parseUnifiedDiff(diffText),
        baseSources: new Map([["src/app.ts", fileWith(1, 'import { a } from "./a.js";')]]),
        headSources: new Map([["src/app.ts", fileWith(1, 'import { a } from "./a.js";')]]),
      });

      assert.deepEqual(introduced, []);
    });
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
