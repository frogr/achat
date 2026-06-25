// Render the REAL App against the live server (guest) and print a frame after
// a few seconds — an end-to-end visual proof that live data reaches the UI.
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../dist/ui/App.js';
import { IrcService } from '../dist/irc/service.js';

const rand = Math.floor(Math.random() * 9000 + 1000);
const config = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  nick: `achatlive${rand}`,
  realname: 'achat live',
  username: 'achat',
  channels: ['#general'],
};

const { stdin, lastFrame } = render(React.createElement(App, { config }));

setTimeout(() => stdin.write('3'), 300); // choose "guest"

// A second client joins #general and says hello, to prove incoming messages render.
const other = new IrcService(
  { ...config, nick: `peer${rand}`, channels: [] },
  (e) => {
    if (e.type === 'registered') other.join('#general');
    if (e.type === 'join' && e.isSelf) setTimeout(() => other.say('#general', `hello from peer${rand}!`), 600);
  },
);
setTimeout(() => other.connect(), 3500);

setTimeout(() => {
  console.log('=== LIVE FRAME (real irc.austn.net, guest) ===');
  console.log(lastFrame());
  try { other.disconnect('done'); } catch {}
  process.exit(0);
}, 9000);
