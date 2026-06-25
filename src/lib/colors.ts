/**
 * Deterministic per-nick colors: hash a nick to a stable entry in a curated
 * palette so each person keeps the same color across the session.
 */

// A curated palette that reads well on both dark and light terminals.
const PALETTE = [
  '#ff6b6b',
  '#f06595',
  '#cc5de8',
  '#845ef7',
  '#5c7cfa',
  '#339af0',
  '#22b8cf',
  '#20c997',
  '#51cf66',
  '#94d82d',
  '#fcc419',
  '#ff922b',
  '#ffa8a8',
  '#e599f7',
  '#74c0fc',
  '#63e6be',
];

function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return h >>> 0;
}

/** Stable color (hex) for a nick. Case-insensitive. */
export function nickColor(nick: string): string {
  const key = nick.toLowerCase();
  return PALETTE[hash(key) % PALETTE.length]!;
}
