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

// F9 drift guard, mirroring the one in weave-primitives. Comments in this
// package cite evidence for the limits they justify (the depth cap, the
// skill's own examples). A citation that no longer resolves reads as
// provenance while pointing at nothing.
//
// A cited file must resolve either next to the citing file or from the
// repository root, and must land INSIDE this repository. A bare filename that
// is neither is unresolvable, which is exactly the defect this guard catches;
// an absolute path or a `../` climb out of the checkout is worse, because it
// can resolve on the author's machine and nowhere else.

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
 * Comment text only. Citations live in comments; the skill-serving HTTP route
 * and import specifiers live in string literals, and scanning those would flag
 * a route as a missing file.
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
 * The extension must end the path. `TRAILING` keeps any suffix that follows it
 * — a backup copy, an editor swap file — attached to the citation, instead of
 * stopping at the extension and resolving against a shorter file the comment
 * never cited. It cannot end on a `.`, so a citation at the end of a sentence
 * still stops before the full stop.
 */
const TRAILING = /(?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?/.source;

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
    // __tests__ -> src -> weave-mcp-server -> packages -> repository root.
    expect(resolves("../../../../README.md", CITING)).toBe(true);
  });
});

describe("cited documentation resolves", () => {
  const files = sourceFiles(SRC);

  it("scans this package's sources", () => {
    // Non-vacuity floor: an empty scan must never read as a clean pass.
    expect(files.length).toBeGreaterThan(3);
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
