import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Buffer, Line } from '../types.js';
import { nickColor } from '../lib/colors.js';
import { kindColor, timeStr, wrapText } from '../lib/format.js';
import { SERVER_BUFFER } from '../state/appState.js';

export interface MessagesPanelProps {
  buffer: Buffer;
  focused: boolean;
  /** total panel height incl. border + title */
  height: number;
  /** total panel width (flex-resolved) used to wrap text */
  width: number;
  /** lines scrolled up from the bottom; 0 == latest */
  scroll: number;
  showTimestamps: boolean;
}

interface VisualRow {
  key: string;
  ts: string;
  prefix?: { text: string; color?: string; bold?: boolean };
  body: string;
  bodyColor?: string;
  dim?: boolean;
}

const TS_WIDTH = 6; // "HH:MM "

function buildRows(line: Line, innerWidth: number, showTs: boolean): VisualRow[] {
  const tsText = showTs ? timeStr(line.ts).padEnd(TS_WIDTH - 1) + ' ' : '';
  const tsCols = showTs ? TS_WIDTH : 0;

  let prefix: VisualRow['prefix'];
  let bodyColor: string | undefined;
  let dim = false;
  let body = line.text;

  if (line.kind === 'message') {
    const isSelf = Boolean(line.self);
    prefix = { text: `<${line.from ?? '?'}> `, color: nickColor(line.from ?? '?'), bold: isSelf };
  } else if (line.kind === 'action') {
    prefix = { text: '* ', color: nickColor(line.from ?? '?') };
    body = `${line.from ?? '?'} ${line.text}`;
  } else if (line.kind === 'notice') {
    prefix = { text: `-${line.from ?? 'notice'}- `, color: 'cyan' };
    bodyColor = 'cyan';
  } else {
    // event / system / motd / error lines
    prefix = { text: '» ', color: kindColor(line.kind) };
    bodyColor = kindColor(line.kind);
    if (line.kind === 'motd') dim = true;
  }

  const prefixCols = prefix ? prefix.text.length : 0;
  const bodyWidth = Math.max(8, innerWidth - tsCols - prefixCols);
  const wrapped = wrapText(body, bodyWidth);

  return wrapped.map((seg, i) => ({
    key: `${line.id}:${i}`,
    ts: i === 0 ? tsText : ' '.repeat(tsCols),
    prefix: i === 0 ? prefix : { text: ' '.repeat(prefixCols) },
    body: seg,
    bodyColor,
    dim,
  }));
}

export function MessagesPanel({
  buffer,
  focused,
  height,
  width,
  scroll,
  showTimestamps,
}: MessagesPanelProps): React.ReactElement {
  const innerWidth = Math.max(10, width - 4); // border(2) + paddingX(2)
  const innerHeight = Math.max(1, height - 3); // border(2) + title(1)

  // expand all lines to visual rows (only when the buffer/size changes, not on
  // every scroll/focus re-render)
  const rows = useMemo(() => {
    const r: VisualRow[] = [];
    for (const line of buffer.lines) r.push(...buildRows(line, innerWidth, showTimestamps));
    return r;
  }, [buffer.lines, innerWidth, showTimestamps]);

  // Clamp scroll to the visual-row count so the window always stays full at the
  // top (the reducer clamps against line count, not wrapped-row count).
  const total = rows.length;
  const maxScroll = Math.max(0, total - innerHeight);
  const effScroll = Math.min(Math.max(0, scroll), maxScroll);
  const end = total - effScroll;
  const start = Math.max(0, end - innerHeight);
  const visible = rows.slice(start, end);

  const title = buffer.name === SERVER_BUFFER ? 'Server' : buffer.name;
  const topic = buffer.topic ? ` — ${buffer.topic}` : '';
  const scrolledUp = effScroll > 0;

  return (
    <Box
      flexDirection="column"
      height={height}
      flexGrow={1}
      borderStyle="round"
      borderColor={focused ? 'green' : 'gray'}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Text bold color={focused ? 'green' : undefined} wrap="truncate-end">
          {title} [2]
          <Text dimColor>{topic}</Text>
        </Text>
        {scrolledUp ? <Text color="yellow">↑ scrolled ({effScroll})</Text> : null}
      </Box>
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((r) => (
          <Text key={r.key} wrap="truncate-end">
            {r.ts ? <Text dimColor>{r.ts}</Text> : null}
            {r.prefix ? (
              <Text color={r.prefix.color} bold={r.prefix.bold}>
                {r.prefix.text}
              </Text>
            ) : null}
            <Text color={r.bodyColor} dimColor={r.dim}>
              {r.body}
            </Text>
          </Text>
        ))}
      </Box>
    </Box>
  );
}
