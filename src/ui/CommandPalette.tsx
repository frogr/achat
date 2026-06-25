import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { fuzzyFilter } from '../lib/fuzzy.js';

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  items: PaletteItem[];
  onClose: () => void;
}

const MAX_VISIBLE = 10;

/** Ctrl-K command palette: fuzzy-filter a list of actions and run one. */
export function CommandPalette({ items, onClose }: CommandPaletteProps): React.ReactElement {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);

  const filtered = useMemo(() => fuzzyFilter(query, items), [query, items]);
  const clampedIndex = Math.min(index, Math.max(0, filtered.length - 1));

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (key.return) {
      const item = filtered[clampedIndex];
      onClose();
      item?.run();
      return;
    }
    if (key.upArrow) {
      setIndex((i) => Math.max(0, Math.min(i, filtered.length - 1) - 1));
      return;
    }
    if (key.downArrow) {
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((qq) => qq.slice(0, -1));
      setIndex(0);
      return;
    }
    if (input && !key.ctrl && !key.meta && !key.tab) {
      setQuery((qq) => qq + input);
      setIndex(0);
    }
  });

  // window the list around the selection
  const start = Math.max(0, Math.min(clampedIndex - MAX_VISIBLE + 1, filtered.length - MAX_VISIBLE));
  const visible = filtered.slice(Math.max(0, start), Math.max(0, start) + MAX_VISIBLE);

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box flexDirection="column" borderStyle="round" borderColor="green" paddingX={2} paddingY={1} width={64}>
        <Box>
          <Text color="green" bold>
            ⌘ palette{' '}
          </Text>
          <Text>❯ </Text>
          <Text>{query}</Text>
          <Text inverse> </Text>
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {visible.length === 0 ? (
            <Text dimColor>no matches</Text>
          ) : (
            visible.map((item) => {
              const active = item.id === filtered[clampedIndex]?.id;
              return (
                <Text key={item.id} wrap="truncate-end">
                  <Text color={active ? 'green' : undefined} bold={active}>
                    {active ? '❯ ' : '  '}
                    {item.label}
                  </Text>
                  {item.hint ? <Text dimColor>  ·  {item.hint}</Text> : null}
                </Text>
              );
            })
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>↑/↓ select · Enter run · Esc close</Text>
        </Box>
      </Box>
    </Box>
  );
}
