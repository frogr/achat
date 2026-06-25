/**
 * Tiny fuzzy subsequence matcher for the command palette. Returns a score
 * (higher is better) or null when `query` is not a subsequence of `text`.
 * Bonuses for consecutive matches and word-boundary / start matches.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (q.length === 0) return 1;

  let qi = 0;
  let score = 0;
  let prevMatch = -2;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      let bonus = 1;
      if (ti === prevMatch + 1) bonus += 3; // consecutive
      if (ti === 0 || /[\s/_-]/.test(t[ti - 1] ?? '')) bonus += 2; // word start
      score += bonus;
      prevMatch = ti;
      qi++;
    }
  }
  if (qi < q.length) return null;
  // prefer shorter targets slightly
  return score - t.length * 0.01;
}

/** Filter + rank items by a query against their `label`. */
export function fuzzyFilter<T extends { label: string }>(query: string, items: T[]): T[] {
  if (query.trim().length === 0) return items;
  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const s = fuzzyScore(query, item.label);
    if (s !== null) scored.push({ item, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}
