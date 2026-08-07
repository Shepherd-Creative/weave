import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// F9 drift guard, mirroring the one in weave-primitives. Comments in this
// package cite evidence for the limits they justify (the depth cap, the
// skill's own examples). A citation that no longer resolves reads as
// provenance while pointing at nothing.
//
// A cited file must resolve either next to the citing file or from the
// repository root. A bare filename that is neither is unresolvable, which is
// exactly the defect this guard catches.

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

/** Path-like citations to markdown or source files. */
function citations(commentText: string): string[] {
  const pattern = /(?:^|[\s(`])([A-Za-z0-9._-][A-Za-z0-9._/-]*\.(?:md|ts|tsx))/g;
  return [...commentText.matchAll(pattern)].map((m) => m[1] as string);
}

function resolves(cited: string, citingFile: string): boolean {
  return (
    existsSync(path.join(REPO_ROOT, cited)) ||
    existsSync(path.join(path.dirname(citingFile), cited))
  );
}

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
