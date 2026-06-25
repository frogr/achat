import React from 'react';
import { Box, Text } from 'ink';
import type { User } from '../types.js';
import { nickColor } from '../lib/colors.js';

export interface UsersPanelProps {
  users: User[];
  ownNick: string;
  focused: boolean;
  selectedIndex: number;
  width: number;
  height: number;
}

const PREFIX_COLOR: Record<string, string> = {
  '~': 'red',
  '&': 'red',
  '@': 'yellow',
  '%': 'green',
  '+': 'cyan',
};

/** Right panel: nick list for the active channel, sorted by the service. */
export function UsersPanel({
  users,
  ownNick,
  focused,
  selectedIndex,
  width,
  height,
}: UsersPanelProps): React.ReactElement {
  const inner = Math.max(1, height - 3);
  const start = Math.max(0, Math.min(selectedIndex - inner + 1, users.length - inner));
  const visible = users.slice(Math.max(0, start), Math.max(0, start) + inner);

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      borderStyle="round"
      borderColor={focused ? 'green' : 'gray'}
      paddingX={1}
      flexShrink={0}
    >
      <Box justifyContent="space-between">
        <Text bold color={focused ? 'green' : undefined} wrap="truncate-end">
          Users [3]
        </Text>
        <Text dimColor>{users.length}</Text>
      </Box>
      {visible.map((u, i) => {
        const realIndex = Math.max(0, start) + i;
        const isSelected = focused && realIndex === selectedIndex;
        const isSelf = u.nick.toLowerCase() === ownNick.toLowerCase();
        return (
          <Box key={u.nick}>
            <Text color={u.prefix ? PREFIX_COLOR[u.prefix] : undefined}>{u.prefix || ' '}</Text>
            <Text
              color={isSelf ? 'green' : nickColor(u.nick)}
              bold={isSelf || isSelected}
              underline={isSelected}
              wrap="truncate-end"
            >
              {u.nick}
              {isSelf ? ' (you)' : ''}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}
