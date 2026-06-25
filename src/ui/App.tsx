import React, { useEffect, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { Config, IrcEvent } from '../types.js';
import { hasAccount } from '../config.js';
import { IrcService } from '../irc/service.js';

export interface AppProps {
  config: Config;
  /** Set false in tests to avoid opening a real socket. */
  autoConnect?: boolean;
}

interface LogLine {
  id: number;
  text: string;
  color?: string;
  dim?: boolean;
}

/**
 * Phase 1 app: connect to the server and render incoming events as a raw
 * scrolling log. The three-pane UI replaces this body in later phases.
 */
export function App({ config, autoConnect = true }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [lines, setLines] = useState<LogLine[]>([]);
  const [status, setStatus] = useState<string>('connecting');
  const [nick, setNick] = useState<string>(config.nick);
  const idRef = useRef(0);
  const serviceRef = useRef<IrcService | null>(null);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit();
  });

  useEffect(() => {
    const push = (text: string, opts: { color?: string; dim?: boolean } = {}) => {
      setLines((prev) => {
        const next = [...prev, { id: idRef.current++, text, ...opts }];
        return next.length > 1000 ? next.slice(next.length - 1000) : next;
      });
    };

    const onEvent = (event: IrcEvent) => {
      switch (event.type) {
        case 'raw':
          push(event.line, { dim: true });
          break;
        case 'status':
          setStatus(event.detail ? `${event.status} — ${event.detail}` : event.status);
          push(`* ${event.status}${event.detail ? ` (${event.detail})` : ''}`, { color: 'yellow' });
          break;
        case 'registered':
          setNick(event.nick);
          push(`* registered as ${event.nick}${event.account ? ` [${event.account}]` : ' [guest]'}`, {
            color: 'green',
          });
          break;
        case 'motd':
          for (const l of event.text.split('\n')) push(l, { dim: true });
          break;
        case 'notice':
          push(`-${event.from ?? 'server'}- ${event.text}`, { color: 'cyan' });
          break;
        case 'message':
          push(`<${event.from}> ${event.text} → ${event.target}`);
          break;
        case 'join':
          push(`→ ${event.nick} joined ${event.channel}`, { color: 'green' });
          break;
        case 'part':
          push(`← ${event.nick} left ${event.channel}`, { color: 'magenta' });
          break;
        case 'quit':
          push(`← ${event.nick} quit (${event.reason ?? ''})`, { color: 'magenta' });
          break;
        case 'error':
          push(`!! ${event.text}`, { color: 'red' });
          break;
        default:
          break;
      }
    };

    if (!autoConnect) return;

    const service = new IrcService(config, onEvent);
    serviceRef.current = service;
    service.connect();

    return () => {
      try {
        service.disconnect('achat closing');
      } catch {
        /* ignore */
      }
    };
  }, [config]);

  const rows = stdout?.rows ?? 24;
  const visible = Math.max(5, rows - 5);
  const shown = lines.slice(Math.max(0, lines.length - visible));
  const mode = hasAccount(config) ? `SASL ${config.account}` : 'guest';

  return (
    <Box flexDirection="column" height={rows}>
      <Box borderStyle="round" borderColor="green" paddingX={1} flexShrink={0}>
        <Text color="green" bold>
          achat{' '}
        </Text>
        <Text dimColor>
          {config.host}:{config.port} · {nick} · {mode} · {status}
        </Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {shown.map((l) => (
          <Text key={l.id} color={l.color} dimColor={l.dim} wrap="truncate-end">
            {l.text}
          </Text>
        ))}
      </Box>
      <Box flexShrink={0} paddingX={1}>
        <Text dimColor>Phase 1: raw event log · q or Ctrl-C to quit</Text>
      </Box>
    </Box>
  );
}
