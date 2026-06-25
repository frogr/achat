import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

export interface InputLineProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  focused: boolean;
  /** label shown before the prompt, e.g. the active target */
  target: string;
}

/** Bottom input line. The `>` prompt turns green when the input is focused. */
export function InputLine({ value, onChange, onSubmit, focused, target }: InputLineProps): React.ReactElement {
  return (
    <Box borderStyle="round" borderColor={focused ? 'green' : 'gray'} paddingX={1} flexShrink={0}>
      <Text color={focused ? 'green' : 'gray'} bold>
        {target}{' '}
      </Text>
      <Text color={focused ? 'green' : 'gray'}>❯ </Text>
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        focus={focused}
        placeholder="type a message or /command…"
        showCursor
      />
    </Box>
  );
}
