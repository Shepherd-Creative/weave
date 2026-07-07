/**
 * Levenshtein edit distance and nearest-match lookup, used to power
 * "did you mean --tone-positive?" suggestions for unknown theme variables.
 *
 * Hand-rolled rather than a dependency: the alphabet is tiny (CSS custom
 * property names) and the inputs are short, so a classic two-row dynamic
 * program is plenty fast and keeps the dependency surface minimal.
 */

/** Classic edit distance (insertions, deletions, substitutions all cost 1). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // deletion
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n] ?? 0;
}

/**
 * Nearest candidate to `name` within `maxDistance` edits, or `undefined` when
 * nothing qualifies. Ties keep the first candidate encountered (candidate
 * iteration order), which is stable for a `Set`/array of known variable names.
 */
export function suggestNearest(
  name: string,
  candidates: Iterable<string>,
  maxDistance = 3,
): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = levenshtein(name, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= maxDistance ? best : undefined;
}
