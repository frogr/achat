import type { Line, LineKind } from '../types.js';

/** HH:MM timestamp for a line. */
export function timeStr(ts: number): string {
  if (!ts) return '--:--';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Color for a system/event line by kind (chat lines color by nick elsewhere). */
export function kindColor(kind: LineKind): string | undefined {
  switch (kind) {
    case 'join':
      return 'green';
    case 'part':
    case 'quit':
    case 'kick':
      return 'magenta';
    case 'nick':
    case 'mode':
    case 'topic':
      return 'blue';
    case 'notice':
      return 'cyan';
    case 'system':
      return 'yellow';
    case 'error':
      return 'red';
    case 'motd':
      return 'gray';
    default:
      return undefined;
  }
}

/** True for non-chat event lines that are styled distinctly. */
export function isEventLine(line: Line): boolean {
  return !(line.kind === 'message' || line.kind === 'action');
}

/**
 * Word-wrap `text` to `width` columns, returning the visual rows. Long words
 * that exceed the width are hard-split. Always returns at least one row.
 */
export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const rows: string[] = [];
  for (const rawLine of text.split('\n')) {
    let line = rawLine;
    if (line.length === 0) {
      rows.push('');
      continue;
    }
    const words = line.split(' ');
    let cur = '';
    const flush = () => {
      if (cur.length > 0) {
        rows.push(cur);
        cur = '';
      }
    };
    for (let word of words) {
      // hard-split a word longer than the width
      while (word.length > width) {
        flush();
        rows.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (cur.length === 0) cur = word;
      else if (cur.length + 1 + word.length <= width) cur += ' ' + word;
      else {
        flush();
        cur = word;
      }
    }
    flush();
  }
  return rows.length > 0 ? rows : [''];
}
