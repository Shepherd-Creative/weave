import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

// F9 drift guard. Comments in this package cite evidence — design docs, spec
// sections, the regression test that proves a performance claim. A citation
// that no longer resolves is worse than no citation: it reads as provenance
// while pointing at nothing, and the next reader cannot tell which.
//
// A cited file must resolve either next to the citing file (a sibling module)
// or from the repository root (anything further away), and must land INSIDE
// this repository. A bare filename that is neither is unresolvable, which is
// exactly the defect this guard catches; an absolute path or a `../` climb out
// of the checkout is worse, because it can resolve on the author's machine and
// nowhere else.

const SRC = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

const SOURCE_EXTENSIONS = [".ts", ".tsx"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (SOURCE_EXTENSIONS.includes(path.extname(full))) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Comment text only. Citations live in comments; HTTP routes and import
 * specifiers live in string literals, and scanning those would flag the
 * skill-serving endpoint (a route, not a file) as missing.
 */
function comments(source: string): string {
  const spans: string[] = [];
  for (const m of source.matchAll(/\/\*[\s\S]*?\*\//g)) spans.push(m[0]);
  for (const m of source.matchAll(/(^|[^:"'`\\])\/\/[^\n]*/g)) spans.push(m[0]);
  return spans.join("\n");
}

/**
 * Path-like citations to markdown or source files, in the forms comments
 * actually write them: bare, backticked, parenthesised, quoted, bracketed,
 * angled, and Markdown link targets.
 *
 * Bare absolute-looking tokens are deliberately NOT harvested: in prose
 * `/skill.md` is an HTTP route far more often than a file, and this repository
 * really does serve one. An absolute path that reaches `resolves` by another
 * route — a Markdown link target, say — is rejected there instead.
 *
 * The extension must end the path, and `TRAILING` keeps whatever follows it
 * attached to the citation rather than stopping at the extension and resolving
 * against a shorter file the comment never cited.
 *
 * That suffix grammar is stated as what ENDS a citation, never as a list of
 * characters a suffix may contain. The direction is the whole point: an
 * allowlist admits only the suffixes someone thought of and silently truncates
 * every other one, and each truncation is a stale citation that resolves for
 * the wrong reason. Stated the other way round it is closed by construction —
 * anything not named below continues the path, so an unanticipated suffix stays
 * attached and gets reported.
 *
 * A citation ends at `BREAK`, which is three named groups and nothing else:
 *
 *  - ASCII: whitespace, the delimiters a comment wraps a citation in, the `:`
 *    of a `path:line` reference, and prose separators a citation never spans;
 *  - typographic: the quotes and guillemets that stand in for those ASCII
 *    wrappers, the dash family, and the ellipsis — marks that belong to prose
 *    and never to a path;
 *  - `TAIL_ONLY`: `.` and `!`, legal inside a path but never last, so a
 *    citation closing a sentence still stops before the full stop.
 *
 * The typographic group is the counterweight to the suffix rule above, and
 * needs stating separately because it pulls the other way. A real suffix stays
 * attached because it is part of the path; a typographic mark must not, because
 * it never is. Keeping one attached turns ordinary prose into an unresolved
 * filename — a false report, and the same damage as a truncated citation
 * arriving from the opposite direction.
 *
 * Written as `\\uXXXX` escapes so the two mirrored copies of this scanner stay
 * byte-identical and the class is legible without a font that distinguishes
 * the dashes.
 */
const BREAK =
  "\\s()\\[\\]{}<>\"'`,;:|\\\\?*" +
  // “ ” ‘ ’ „ ‚ « » ‹ ›
  "\\u201C\\u201D\\u2018\\u2019\\u201E\\u201A\\u00AB\\u00BB\\u2039\\u203A" +
  // ‒ – — ― …
  "\\u2012\\u2013\\u2014\\u2015\\u2026";
const TAIL_ONLY = ".!";
const TRAILING = new RegExp(`(?:[^${BREAK}]*[^${BREAK}${TAIL_ONLY}])?`).source;

function citations(commentText: string): string[] {
  const inline = new RegExp(
    `(?:^|[\\s([{<"'\`])([A-Za-z0-9._-][A-Za-z0-9._/-]*\\.(?:md|ts|tsx)${TRAILING})`,
    "g",
  );
  const markdownLink = new RegExp(`\\]\\(([^)\\s]+\\.(?:md|ts|tsx)${TRAILING})\\)`, "g");
  const found = new Set<string>();
  for (const m of commentText.matchAll(inline)) found.add(m[1] as string);
  for (const m of commentText.matchAll(markdownLink)) found.add(m[1] as string);
  return [...found];
}

/** Is `candidate` a path inside this repository? */
function insideRepo(candidate: string): boolean {
  const rel = path.relative(REPO_ROOT, candidate);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Cited evidence must be a real file INSIDE this repository, addressed
 * relatively — from the repository root, or next to the citing file.
 *
 * Absolute paths are rejected even when they exist: they are one machine's
 * layout, not evidence a reader of this checkout can follow. Traversal that
 * climbs out of the repository is rejected for the same reason, and matters
 * more — `existsSync` alone would happily confirm a file the repository does
 * not contain, which is a citation that resolves for the wrong reason.
 */
function resolves(cited: string, citingFile: string): boolean {
  if (path.isAbsolute(cited)) return false;
  return [path.resolve(REPO_ROOT, cited), path.resolve(path.dirname(citingFile), cited)].some(
    (candidate) => insideRepo(candidate) && existsSync(candidate),
  );
}

// A citing file used only to anchor sibling-relative resolution in the
// grammar tests below.
const CITING = path.join(SRC, "__tests__", "doc-citations.test.ts");
const MISSING = "docs/definitely-missing-evidence.md";

describe("citation grammar", () => {
  it("harvests bare, backticked and parenthesised citations", () => {
    expect(citations("// see docs/a.md for the rationale")).toContain("docs/a.md");
    expect(citations("// see `docs/b.md`")).toContain("docs/b.md");
    expect(citations("// see (docs/c.md)")).toContain("docs/c.md");
  });

  it("harvests double-quoted and single-quoted citations", () => {
    expect(citations('// evidence: "docs/quoted.md"')).toContain("docs/quoted.md");
    expect(citations("// evidence: 'docs/single.md'")).toContain("docs/single.md");
  });

  it("harvests bracketed citations", () => {
    expect(citations("// evidence: [docs/bracketed.md]")).toContain("docs/bracketed.md");
    expect(citations("// evidence: <docs/angled.md>")).toContain("docs/angled.md");
  });

  it("harvests Markdown link targets", () => {
    expect(citations("// see [the plan](docs/linked.md) for why")).toContain("docs/linked.md");
    expect(citations("// see [the guide](../weave-skill/SKILL.md)")).toContain(
      "../weave-skill/SKILL.md",
    );
  });

  it("harvests paths containing underscores", () => {
    expect(citations("// see docs/design_notes.md")).toContain("docs/design_notes.md");
  });

  it("does not truncate a suffix-bearing path to a shorter real file", () => {
    // A path carrying a suffix after its extension is not the shorter path.
    // Truncating it resolves the citation against a file the comment never
    // cited, so a stale citation passes while looking checked — the exact
    // shape this guard exists to catch. (The examples live in string literals,
    // not in this comment, because this scanner reads comments.)
    expect(citations("// see README.md.bak for the old copy")).not.toContain("README.md");
    expect(citations("// see [the readme](README.md.bak)")).not.toContain("README.md");
  });

  it("harvests the whole suffix-bearing path, so it is reported rather than ignored", () => {
    expect(citations("// see README.md.bak for the old copy")).toContain("README.md.bak");
    expect(citations("// see [the readme](README.md.bak)")).toContain("README.md.bak");
    expect(resolves("README.md.bak", CITING)).toBe(false);
  });

  it("does not truncate an editor-backup suffix to a shorter real file", () => {
    // The tilde suffix an editor leaves behind is the canonical case: the
    // shorter path really exists, so truncating produces a citation that
    // resolves to a file the comment never named. (Examples live in string
    // literals — this scanner reads comments.)
    expect(citations("// see README.md~ for the old copy")).not.toContain("README.md");
    expect(citations("// see [the readme](README.md~)")).not.toContain("README.md");
  });

  it("harvests the whole backup-suffixed path, so it is reported rather than ignored", () => {
    expect(citations("// see README.md~ for the old copy")).toContain("README.md~");
    expect(citations("// see [the readme](README.md~)")).toContain("README.md~");
    expect(resolves("README.md~", CITING)).toBe(false);
  });

  it("keeps any non-delimiter suffix attached, not only the anticipated ones", () => {
    // The suffix grammar is defined by what ENDS a citation, not by a list of
    // characters a suffix may contain. An allowlist silently truncates every
    // suffix nobody thought of, and each truncation is a stale citation that
    // passes while looking checked.
    for (const suffix of ["~", "#", "%", "+", "@", "=", "&", "^", "$", "-old", ".orig", "!x"]) {
      expect(citations(`// see README.md${suffix} in passing`)).toContain(`README.md${suffix}`);
      expect(citations(`// see [it](README.md${suffix})`)).toContain(`README.md${suffix}`);
    }
  });

  it("still ends a citation at every delimiter it may be wrapped in", () => {
    // The other half of the same grammar: these characters terminate a path,
    // so widening the suffix must not swallow them.
    expect(citations("// evidence: (docs/paren.md)")).toContain("docs/paren.md");
    expect(citations("// evidence: [docs/bracket.md]")).toContain("docs/bracket.md");
    expect(citations("// evidence: {docs/brace.md}")).toContain("docs/brace.md");
    expect(citations("// evidence: <docs/angle.md>")).toContain("docs/angle.md");
    expect(citations("// evidence: `docs/tick.md`")).toContain("docs/tick.md");
    expect(citations('// evidence: "docs/quote.md"')).toContain("docs/quote.md");
    expect(citations("// evidence: 'docs/apos.md'")).toContain("docs/apos.md");
  });

  it("ends a citation at typographic sentence punctuation", () => {
    // The mirror image of the suffix rule, and it needs stating separately: a
    // real suffix stays attached because it is part of the path, while a
    // typographic mark never is. Keeping one attached turns ordinary prose into
    // an unresolved filename, which is a false report — the same damage as a
    // truncated citation, from the opposite direction.
    expect(citations("// see README.md… for the rest")).toEqual(["README.md"]);
    expect(citations("// see [the readme](README.md…)")).toEqual(["README.md"]);
    expect(citations("// see README.md—the old copy")).toEqual(["README.md"]);
    expect(citations("// the file README.md’s header")).toEqual(["README.md"]);
  });

  it("treats every mark in the typographic terminator class as an ending", () => {
    // Pins the documented class so a future edit cannot quietly drop a member.
    // Ellipsis, the dash family, and the typographic quotes and guillemets that
    // stand in for the ASCII wrappers already in BREAK.
    const marks = "…‒–—―“”‘’„‚«»‹›";
    for (const mark of marks) {
      expect(citations(`// see README.md${mark}tail`)).toEqual(["README.md"]);
    }
  });

  it("still stops a citation before a line reference", () => {
    // `path:line` is how comments point at a specific line; the colon ends the
    // path, so the citation still resolves to the file.
    expect(citations("// proved at doc-citations.test.ts:12")).toContain("doc-citations.test.ts");
  });

  it("still ends a citation at sentence and delimiter punctuation", () => {
    expect(citations("// the guide is packages/weave-skill/SKILL.md.")).toContain(
      "packages/weave-skill/SKILL.md",
    );
    expect(citations("// see spec.ts, then tokens.ts;")).toContain("spec.ts");
    expect(citations("// see spec.ts, then tokens.ts;")).toContain("tokens.ts");
    expect(citations("// evidence in app.test.ts proves it")).toContain("app.test.ts");
  });

  it("does not harvest an HTTP route as a file citation", () => {
    // Routes and file paths are indistinguishable once written as `/x.md`, and
    // this server really does serve one. Bare absolute-looking tokens are
    // therefore left alone; absolute paths are rejected at resolution instead.
    expect(citations("// the skill is served at `GET /skill.md`")).toEqual([]);
  });
});

describe("citation containment", () => {
  it("resolves real evidence from the repo root and from the citing file", () => {
    expect(resolves("README.md", CITING)).toBe(true);
    expect(resolves("doc-citations.test.ts", CITING)).toBe(true);
  });

  it("rejects a citation that resolves nowhere", () => {
    expect(resolves(MISSING, CITING)).toBe(false);
  });

  it("rejects an absolute path even when the file exists", () => {
    const absolute = path.join(REPO_ROOT, "README.md");
    // Non-vacuity: the target must exist, so the rejection is about the form
    // of the citation and not about a missing file.
    expect(existsSync(absolute)).toBe(true);
    expect(citations(`// see [the readme](${absolute})`)).toContain(absolute);
    expect(resolves(absolute, CITING)).toBe(false);
  });

  it("rejects traversal that escapes the repository", () => {
    const outside = mkdtempSync(path.join(tmpdir(), "weave-citation-"));
    try {
      const evidence = path.join(outside, "evidence.md");
      writeFileSync(evidence, "# outside the repository\n");
      const escaping = path.relative(path.dirname(CITING), evidence);

      // Non-vacuity: the escaping citation really does point at a real file,
      // so a `false` here can only come from the containment check.
      expect(escaping.startsWith("..")).toBe(true);
      expect(existsSync(path.resolve(path.dirname(CITING), escaping))).toBe(true);
      expect(resolves(escaping, CITING)).toBe(false);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("allows traversal that stays inside the repository", () => {
    // `../` is not itself the defect — leaving the repository is.
    // __tests__ -> src -> weave-primitives -> packages -> repository root.
    expect(resolves("../../../../README.md", CITING)).toBe(true);
  });
});

describe("cited documentation resolves", () => {
  const files = sourceFiles(SRC);

  it("scans this package's sources", () => {
    // Non-vacuity floor: an empty scan must never read as a clean pass.
    expect(files.length).toBeGreaterThan(10);
  });

  it("every file cited in a comment exists", () => {
    const broken: string[] = [];
    let citationCount = 0;

    for (const file of files) {
      for (const cited of citations(comments(readFileSync(file, "utf-8")))) {
        citationCount++;
        if (!resolves(cited, file)) {
          broken.push(`${path.relative(REPO_ROOT, file)} cites missing ${cited}`);
        }
      }
    }

    // Non-vacuity floor: this package does cite evidence; zero matches means
    // the scanner broke, not that every citation resolved.
    expect(citationCount).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });
});
