import React from 'react';
import { Box, useStdout } from 'ink';
import type { AppState } from '../state/appState.js';
import { activeBuffer } from '../state/appState.js';
import { TopBar, HintBar } from './Bars.js';
import { ChannelsPanel } from './ChannelsPanel.js';
import { MessagesPanel } from './MessagesPanel.js';
import { UsersPanel } from './UsersPanel.js';
import { InputLine } from './InputLine.js';

export interface ClientViewProps {
  state: AppState;
  inputValue: string;
  onInputChange: (v: string) => void;
  onInputSubmit: (v: string) => void;
  hint?: string;
}

const DEFAULT_HINT =
  'Tab/1-2-3 focus · Enter act · ↑↓ select · PgUp/PgDn scroll · Ctrl-K palette · /help · Ctrl-C quit';

export function ClientView({
  state,
  inputValue,
  onInputChange,
  onInputSubmit,
  hint,
}: ClientViewProps): React.ReactElement {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const cols = stdout?.columns ?? 80;

  const channelsW = clamp(Math.floor(cols * 0.18), 16, 26);
  const usersW = clamp(Math.floor(cols * 0.16), 14, 24);
  const messagesW = Math.max(20, cols - channelsW - usersW);
  const midHeight = Math.max(5, rows - 1 - 3 - 1); // topbar(1) + input(3) + hint(1)

  const buf = activeBuffer(state);
  const inputFocused = state.focus === 'messages';

  return (
    <Box flexDirection="column" height={rows} width={cols}>
      <TopBar
        host={`${state.host}:${state.port}`}
        nick={state.nick}
        status={state.status}
        statusDetail={state.statusDetail}
        account={state.account}
      />
      <Box flexDirection="row" height={midHeight}>
        <ChannelsPanel
          buffers={state.buffers}
          active={state.active}
          focused={state.focus === 'channels'}
          selectedIndex={state.channelIndex}
          width={channelsW}
          height={midHeight}
        />
        <MessagesPanel
          buffer={buf}
          focused={state.focus === 'messages'}
          height={midHeight}
          width={messagesW}
          scroll={state.scroll}
          showTimestamps={state.showTimestamps}
        />
        <UsersPanel
          users={buf.users}
          ownNick={state.nick}
          focused={state.focus === 'users'}
          selectedIndex={state.userIndex}
          width={usersW}
          height={midHeight}
        />
      </Box>
      <InputLine
        value={inputValue}
        onChange={onInputChange}
        onSubmit={onInputSubmit}
        focused={inputFocused}
        target={buf.name === '*server*' ? '[server]' : buf.name}
      />
      <HintBar text={hint ?? DEFAULT_HINT} />
    </Box>
  );
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
