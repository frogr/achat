import React from 'react';
import { Box, Text } from 'ink';
import type { ConnectionStatus } from '../types.js';

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  idle: 'gray',
  connecting: 'yellow',
  registered: 'green',
  guest: 'cyan',
  reconnecting: 'yellow',
  disconnected: 'red',
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  idle: 'idle',
  connecting: 'connecting…',
  registered: 'registered',
  guest: 'guest',
  reconnecting: 'reconnecting…',
  disconnected: 'disconnected',
};

export function TopBar({
  host,
  nick,
  status,
  statusDetail,
  account,
}: {
  host: string;
  nick: string;
  status: ConnectionStatus;
  statusDetail?: string;
  account?: string;
}): React.ReactElement {
  return (
    <Box justifyContent="space-between" paddingX={1} flexShrink={0}>
      <Box>
        <Text color="green" bold>
          achat
        </Text>
        <Text dimColor> {host}</Text>
      </Box>
      <Box>
        <Text>
          <Text color="yellow">{nick}</Text>
          {account ? <Text dimColor> ({account})</Text> : null}
          <Text dimColor> · </Text>
          <Text color={STATUS_COLOR[status]}>
            {STATUS_LABEL[status]}
            {statusDetail ? ` ${statusDetail}` : ''}
          </Text>
        </Text>
      </Box>
    </Box>
  );
}

export function HintBar({ text }: { text: string }): React.ReactElement {
  return (
    <Box paddingX={1} flexShrink={0}>
      <Text dimColor wrap="truncate-end">
        {text}
      </Text>
    </Box>
  );
}
