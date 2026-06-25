import React from 'react';
import { Box, Text } from 'ink';

export interface InputLineProps {
  value: string;
  cursor: number;
  focused: boolean;
  /** label shown before the prompt, e.g. the active target */
  target: string;
  placeholder?: string;
}

/**
 * Presentational input line. All key handling lives in App's single global
 * useInput so navigation vs. typing never conflict; this just renders the
 * value with a block cursor.
 */
export function InputLine({
  value,
  cursor,
  focused,
  target,
  placeholder = 'type a message or /command…',
}: InputLineProps): React.ReactElement {
  const showPlaceholder = focused && value.length === 0;
  const before = value.slice(0, cursor);
  const at = value.slice(cursor, cursor + 1) || ' ';
  const after = value.slice(cursor + 1);

  return (
    <Box borderStyle="round" borderColor={focused ? 'green' : 'gray'} paddingX={1} flexShrink={0}>
      <Text color={focused ? 'green' : 'gray'} bold>
        {target}{' '}
      </Text>
      <Text color={focused ? 'green' : 'gray'}>❯ </Text>
      {showPlaceholder ? (
        <Text dimColor>{placeholder}</Text>
      ) : (
        <Text>
          {before}
          <Text inverse={focused}>{at}</Text>
          {after}
        </Text>
      )}
    </Box>
  );
}
