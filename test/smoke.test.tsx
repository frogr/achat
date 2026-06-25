import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/ui/App.js';
import type { Config } from '../src/types.js';

const base: Config = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  nick: 'tester',
  realname: 'achat user',
  username: 'achat',
  channels: ['#general'],
};

test('with no account, App shows the first-run chooser', () => {
  const { lastFrame, unmount } = render(<App config={base} autoConnect={false} />);
  const frame = lastFrame() ?? '';
  assert.match(frame, /achat/);
  assert.match(frame, /Log in/);
  assert.match(frame, /guest/i);
  unmount();
});

test('with an account, App goes straight to the main view header', () => {
  const cfg: Config = { ...base, account: 'austin', password: 'secret' };
  const { lastFrame, unmount } = render(<App config={cfg} autoConnect={false} />);
  const frame = lastFrame() ?? '';
  assert.match(frame, /achat/);
  assert.match(frame, /irc\.austn\.net/);
  assert.match(frame, /6697/);
  unmount();
});
