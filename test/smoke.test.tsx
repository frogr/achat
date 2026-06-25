import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/ui/App.js';
import type { Config } from '../src/types.js';

const cfg: Config = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  nick: 'tester',
  realname: 'achat user',
  username: 'achat',
  channels: ['#general'],
};

test('App renders the achat banner and connection target', () => {
  const { lastFrame, unmount } = render(<App config={cfg} />);
  const frame = lastFrame() ?? '';
  assert.match(frame, /achat/);
  assert.match(frame, /irc\.austn\.net/);
  assert.match(frame, /6697/);
  unmount();
});
