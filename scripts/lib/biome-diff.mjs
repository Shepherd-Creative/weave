/**
 * Matching logic for the new-findings-only Biome gate.
 *
 * Split out of `scripts/biome-new-findings.mjs` so the decision "is this head
 * diagnostic new?" can be tested directly, without running Biome or git.
 */

/** Biome reports file-level diagnostics (`format`) at line 0. */
export const FILE_LEVEL = 0;

export function diagnosticFile(d) {
  const p = d.location?.path;
  if (typeof p === "string") return p;
  return typeof p?.file === "string" ? p.file : "<unknown>";
}

export function diagnosticLine(d) {
  const line = d.location?.start?.line;
  return typeof line === "number" ? line : FILE_LEVEL;
}

/**
 * What a diagnostic *is*, independent of where it sits: file, rule, message.
 * Position is not part of it — position is matched separately, against the
 * diff, by `findIntroduced`.
 */
export function fingerprint(d, file = diagnosticFile(d)) {
  const message = typeof d.message === "string" ? d.message : JSON.stringify(d.message ?? null);
  return [file, d.category ?? "<none>", message].join(" :: ");
}

/**
 * Decode the C-quoted path form git uses for non-ASCII or control characters:
 * `"a/src/caf\303\251.tsx"`. Octal escapes are UTF-8 bytes, so they are
 * collected and decoded as bytes rather than as code units.
 */
function unquoteGitPath(raw) {
  if (!raw.startsWith('"')) return raw;
  const body = raw.slice(1, raw.endsWith('"') ? -1 : undefined);
  const simple = { n: 10, t: 9, r: 13, b: 8, f: 12, v: 11, a: 7, '"': 34, "\\": 92 };
  const bytes = [];
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "\\") {
      bytes.push(...Buffer.from(body[i], "utf8"));
      continue;
    }
    const next = body[++i];
    if (next >= "0" && next <= "7") {
      bytes.push(Number.parseInt(body.slice(i, i + 3), 8));
      i += 2;
    } else if (next in simple) {
      bytes.push(simple[next]);
    } else {
      bytes.push(...Buffer.from(next ?? "", "utf8"));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

/** Strip git's `a/` / `b/` prefix; `/dev/null` means the side does not exist. */
function diffHeaderPath(raw) {
  const decoded = unquoteGitPath(raw.trim());
  if (decoded === "/dev/null") return null;
  return decoded.replace(/^[ab]\//, "");
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/**
 * Parse `git diff -U0` output into per-file hunks, keyed by the file's HEAD
 * path (so renames are followed).
 *
 * Body lines are never mistaken for headers: `---` / `+++` are only read
 * immediately after a `diff --git` line, before the first hunk. That matters
 * because a deleted line whose own text is `-- a/x` renders as `--- a/x`.
 */
export function parseUnifiedDiff(text) {
  const files = new Map();
  let current = null;
  let inHeader = false;

  const flush = () => {
    // A deleted file has no head side and so can carry no head diagnostics.
    if (current?.headPath) {
      files.set(current.headPath, { basePath: current.basePath, hunks: current.hunks });
    }
    current = null;
  };

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      current = { basePath: null, headPath: null, hunks: [] };
      inHeader = true;
      continue;
    }
    if (!current) continue;

    if (inHeader && line.startsWith("--- ")) {
      current.basePath = diffHeaderPath(line.slice(4));
      continue;
    }
    if (inHeader && line.startsWith("+++ ")) {
      current.headPath = diffHeaderPath(line.slice(4));
      continue;
    }

    const hunk = HUNK.exec(line);
    if (hunk) {
      inHeader = false;
      current.hunks.push({
        baseStart: Number(hunk[1]),
        baseLines: hunk[2] === undefined ? 1 : Number(hunk[2]),
        headStart: Number(hunk[3]),
        headLines: hunk[4] === undefined ? 1 : Number(hunk[4]),
      });
    }
  }
  flush();

  return files;
}

/**
 * Translate a base line number into its head line number, using the hunks git
 * reported for that file.
 *
 * Returns `{ line }` when the line survived the change untouched (shifted by
 * the net insertions above it), or `{ line: null, hunk }` when the change
 * rewrote the line itself, in which case the hunk records where the rewritten
 * region landed on the head side.
 */
function lineMapper(hunks) {
  const sorted = [...hunks].sort((a, b) => a.baseStart - b.baseStart);
  return (line) => {
    let offset = 0;
    for (const h of sorted) {
      // A pure insertion (`@@ -10,0 +11,3 @@`) goes AFTER base line 10, so
      // line 10 itself is still untouched.
      const insertionOnly = h.baseLines === 0;
      const firstChanged = insertionOnly ? h.baseStart + 1 : h.baseStart;
      if (line < firstChanged) return { line: line + offset, hunk: null };
      if (!insertionOnly && line <= h.baseStart + h.baseLines - 1) {
        return { line: null, hunk: h };
      }
      offset += h.headLines - h.baseLines;
    }
    return { line: line + offset, hunk: null };
  };
}

const withinHeadSide = (hunk, line) =>
  line >= hunk.headStart && line <= hunk.headStart + hunk.headLines - 1;

/**
 * Reads the offending source line for a diagnostic — the only identity
 * evidence available, since Biome's JSON reporter carries no source text and
 * no stable diagnostic id (its `advices` are another position plus generic
 * prose).
 *
 * Trimmed, so re-indenting a line does not make it a different finding.
 * Returns null whenever the line cannot be read, which callers must treat as
 * "identity unknown" and never as a match.
 */
function anchorReader(sources) {
  const cache = new Map();
  return (file, line) => {
    if (!(line >= 1)) return null;
    let lines = cache.get(file);
    if (lines === undefined) {
      const text = sources.get(file);
      lines = typeof text === "string" ? text.split("\n") : null;
      cache.set(file, lines);
    }
    const raw = lines?.[line - 1];
    return typeof raw === "string" ? raw.trim() : null;
  };
}

/**
 * Head diagnostics the base did not already have.
 *
 * Identity is file + rule + message + *evidence that this is the same
 * finding*. A baseline finding can be claimed by a head finding in exactly two
 * ways:
 *
 *  1. the code holding it was not touched, so git's hunks say the finding
 *     simply shifted to a known new line — matched there, exactly;
 *  2. the change rewrote the region holding it, AND the offending source line
 *     is byte-identical (after trimming) on both sides, AND that line pairs the
 *     two findings ONE TO ONE — the same code, moved within the region it was
 *     rewritten in, with nothing else it could equally well have been.
 *
 * Anything else is new. Sharing a rewritten hunk is explicitly NOT enough: a
 * `-U0` hunk deletes every base line and adds every head line, so a baseline
 * finding deleted at line 10 and an identical one introduced at line 12 of the
 * same rewritten hunk are indistinguishable by position alone. Neither is a
 * matching source line enough on its own: two identical lines are identical
 * evidence, so when the same anchor appears twice in one rewritten hunk the
 * evidence maps each head finding to SEVERAL baseline findings and proves none
 * of them. Consuming one arbitrarily would be a guess wearing the costume of
 * evidence — so rule 2 claims only where the pairing is unique in both
 * directions. Where identity cannot be proven the gate fails closed and reports
 * the finding, because a false positive costs a fix while a false negative is a
 * silent pass.
 *
 * Trade-offs, deliberately taken:
 * - Sensitivity: edit the very line carrying a pre-existing finding and, if
 *   the finding survives, it is reported as new. That is the cost of rule 2's
 *   evidence requirement, and the remedy is cheap — fix the finding on the
 *   line you were already editing. It is far narrower than `--changed`, which
 *   fails a PR for any pre-existing finding anywhere in a file it touched.
 * - Duplicate anchors: rewrite a hunk holding two identical offending lines and
 *   both findings are reported, even if the change merely preserved them, or
 *   removed one of them. Pre-existing debt then has to be cleaned up rather
 *   than carried. Chosen deliberately: the alternative is claiming on a coin
 *   toss, which is exactly the hole this rule closes.
 * - Uniqueness is judged pairwise, not by search: a head finding claims only
 *   its sole candidate, and only when it is that candidate's sole suitor. No
 *   attempt is made to resolve a larger tangle into some best global pairing —
 *   more claims would mean more inference, and inference is what fails open.
 * - Residual: a SINGLE offending line moved verbatim inside a rewritten hunk is
 *   still treated as the same finding. The bytes are identical, so no evidence
 *   distinguishes "survived a reshuffle" from "removed and retyped", and
 *   calling identical code a new finding would flag pure reorderings.
 * - Raw line equality is never used on its own. Line numbers are only ever
 *   compared after being mapped through the diff, so an unrelated edit above a
 *   finding shifts it without flagging it.
 * - Anchors are trimmed, so re-indentation does not manufacture new findings.
 * - Biome emits one file-level `format` diagnostic per file (line 0), so this
 *   gate cannot distinguish "already unformatted" from "made worse" inside a
 *   file that was already failing `format`. Out of this gate's reach: the fix
 *   is to format the file.
 *
 * `baseSources` / `headSources` map a file path to its full text on that side.
 * Omitting them is safe but maximally conservative: with no source to compare,
 * rule 2 can never apply.
 */
export function findIntroduced({
  baseDiagnostics,
  headDiagnostics,
  fileDiffs = new Map(),
  baseSources = new Map(),
  headSources = new Map(),
}) {
  const baseAnchor = anchorReader(baseSources);
  const headAnchor = anchorReader(headSources);
  // Renames: base diagnostics belong to the file's head path.
  const headPathOf = new Map();
  for (const [headPath, entry] of fileDiffs) {
    if (entry.basePath && entry.basePath !== headPath) headPathOf.set(entry.basePath, headPath);
  }

  const mappers = new Map();
  const mapperFor = (headPath) => {
    let mapper = mappers.get(headPath);
    if (!mapper) {
      mapper = lineMapper(fileDiffs.get(headPath)?.hunks ?? []);
      mappers.set(headPath, mapper);
    }
    return mapper;
  };

  /** fingerprint -> claimable baseline findings, in base order. */
  const claimable = new Map();
  for (const d of baseDiagnostics) {
    const basePath = diagnosticFile(d);
    const headPath = headPathOf.get(basePath) ?? basePath;
    const baseLine = diagnosticLine(d);
    const placed = mapperFor(headPath)(baseLine);
    const key = fingerprint(d, headPath);
    const pool = claimable.get(key);
    const candidate = {
      line: placed.line,
      hunk: placed.hunk,
      // Only rule 2 needs the anchor, and only rule 2 pays to read it.
      anchor: placed.hunk === null ? null : baseAnchor(basePath, baseLine),
      claimed: false,
    };
    if (pool) pool.push(candidate);
    else claimable.set(key, [candidate]);
  }

  // Rule 1, first: the code was untouched, so the finding has exactly one
  // known head line. A same-fingerprint head finding sitting on it IS that
  // finding — there is nothing to choose between, so this pass needs no
  // uniqueness test.
  const unresolved = [];
  for (const d of headDiagnostics) {
    const pool = claimable.get(fingerprint(d)) ?? [];
    const line = diagnosticLine(d);
    const shifted = pool.find((c) => !c.claimed && c.line === line);
    if (shifted) {
      shifted.claimed = true;
      continue;
    }
    unresolved.push({ d, line, pool, candidates: [] });
  }

  // Rule 2, in two steps, because arbitrary choice is the failure mode being
  // designed out. First record every pairing the source evidence permits, and
  // how many head findings each baseline finding attracts...
  for (const entry of unresolved) {
    const anchor = headAnchor(diagnosticFile(entry.d), entry.line);
    // `anchor === null` means the head line could not be read, so identity is
    // unknown: no pairing is possible and the finding is reported.
    if (anchor === null) continue;
    entry.candidates = entry.pool.filter(
      (c) =>
        !c.claimed && c.hunk !== null && withinHeadSide(c.hunk, entry.line) && c.anchor === anchor,
    );
    for (const c of entry.candidates) c.suitors = (c.suitors ?? 0) + 1;
  }

  // ...then claim only where that pairing is one to one. Two candidates for one
  // head finding, or two head findings for one candidate, is unproven identity.
  const introduced = [];
  for (const entry of unresolved) {
    const [only] = entry.candidates;
    if (entry.candidates.length === 1 && only.suitors === 1) {
      only.claimed = true;
      continue;
    }
    introduced.push(entry.d);
  }
  return introduced;
}
