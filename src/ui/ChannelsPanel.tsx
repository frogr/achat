import React from 'react';
import { Box, Text } from 'ink';
import type { Buffer } from '../types.js';
import { SERVER_BUFFER } from '../state/appState.js';

export interface ChannelsPanelProps {
  buffers: Buffer[];
  active: string;
  focused: boolean;
  selectedIndex: number;
  width: number;
  height: number;
}

function label(b: Buffer): string {
  if (b.type === 'server') return '*server*';
  return b.name;
}

/** Left panel: the list of buffers (server, channels, queries) with unread badges. */
export function ChannelsPanel({
  buffers,
  active,
  focused,
  selectedIndex,
  width,
  height,
}: ChannelsPanelProps): React.ReactElement {
  const inner = Math.max(1, height - 3); // borders (2) + title (1)
  // keep the selection in view
  const start = Math.max(0, Math.min(selectedIndex - inner + 1, buffers.length - inner));
  const visible = buffers.slice(Math.max(0, start), Math.max(0, start) + inner);

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
      <Text bold color={focused ? 'green' : undefined} wrap="truncate-end">
        Channels [1]
      </Text>
      {visible.map((b) => {
        const isActive = b.name.toLowerCase() === active.toLowerCase();
        const isSelected = focused && buffers[selectedIndex]?.name === b.name;
        const badge = b.hasMention ? '@' : b.unread > 0 ? (b.unread > 9 ? '9+' : String(b.unread)) : '';
        const badgeColor = b.hasMention ? 'red' : 'yellow';
        const name = label(b);
        const marker = isActive ? '▸' : ' ';
        return (
          <Box key={b.name} justifyContent="space-between">
            <Text
              color={isActive ? 'green' : isSelected ? 'cyan' : b.name === SERVER_BUFFER ? 'gray' : undefined}
              bold={isActive || isSelected}
              wrap="truncate-end"
            >
              {marker} {name}
            </Text>
            {badge ? <Text color={badgeColor} bold>{badge}</Text> : null}
          </Box>
        );
      })}
    </Box>
  );
}
