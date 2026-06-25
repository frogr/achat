import React from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { Config } from '../types.js';
import { hasAccount } from '../config.js';

export interface AppProps {
  config: Config;
}

/**
 * Phase 0 placeholder app: renders a banner + resolved connection target and
 * quits on Ctrl-C (handled by Ink) or `q`. Later phases replace the body with
 * the real three-pane client.
 */
export function App({ config }: AppProps): React.ReactElement {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
    }
  });

  const mode = hasAccount(config) ? `SASL as ${config.account}` : 'guest';

  return (
    <Box flexDirection="column" padding={1}>
      <Box>
        <Text color="green" bold>
          achat
        </Text>
        <Text dimColor> — terminal IRC client</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text>
          Server: <Text color="cyan">{config.host}</Text>:
          <Text color="cyan">{config.port}</Text> {config.tls ? '(TLS)' : '(plaintext)'}
        </Text>
        <Text>
          Nick: <Text color="yellow">{config.nick}</Text> · Auth:{' '}
          <Text color="magenta">{mode}</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press q or Ctrl-C to quit.</Text>
      </Box>
    </Box>
  );
}
