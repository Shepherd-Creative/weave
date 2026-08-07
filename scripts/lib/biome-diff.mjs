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
 * Head diagnostics the base did not already have.
 *
 * Identity is file + rule + message + *position tracked through the diff*. A
 * baseline finding can be claimed by a head finding in exactly two ways:
 *
 *  1. the code holding it was not touched, so git's hunks say the finding
 *     simply shifted to a known new line — matched there, exactly;
 *  2. the change rewrote the very region holding it, so its line has no image
 *     — matched anywhere inside the head side of that same hunk.
 *
 * Anything else is new. That is the point: a baseline finding deleted at line
 * 150 cannot be spent on a finding introduced at line 301, because 301 is
 * neither its mapped line nor inside the hunk that removed it — even though
 * file, rule and message are identical.
 *
 * Trade-offs, deliberately taken:
 * - Rule 2 is bounded by the hunk, not by the file. A change that rewrites a
 *   whole file in one hunk therefore does degrade to file-level matching; that
 *   is the honest limit of positional evidence, and such a diff is loud in
 *   review.
 * - Raw line equality is never used on its own. Line numbers are only ever
 *   compared after being mapped through the diff, so an unrelated edit above a
 *   finding shifts it without flagging it.
 * - Biome emits one file-level `format` diagnostic per file (line 0), so this
 *   gate cannot distinguish "already unformatted" from "made worse" inside a
 *   file that was already failing `format`. Unchanged from before, and out of
 *   this gate's reach: the fix is to format the file.
 */
export function findIntroduced({ baseDiagnostics, headDiagnostics, fileDiffs = new Map() }) {
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
    const headPath = headPathOf.get(diagnosticFile(d)) ?? diagnosticFile(d);
    const placed = mapperFor(headPath)(diagnosticLine(d));
    const key = fingerprint(d, headPath);
    const pool = claimable.get(key);
    const candidate = { line: placed.line, hunk: placed.hunk, claimed: false };
    if (pool) pool.push(candidate);
    else claimable.set(key, [candidate]);
  }

  const introduced = [];
  for (const d of headDiagnostics) {
    const pool = claimable.get(fingerprint(d)) ?? [];
    const line = diagnosticLine(d);
    const match =
      pool.find((c) => !c.claimed && c.line === line) ??
      pool.find((c) => !c.claimed && c.hunk !== null && withinHeadSide(c.hunk, line));
    if (match) {
      match.claimed = true;
      continue;
    }
    introduced.push(d);
  }
  return introduced;
}
