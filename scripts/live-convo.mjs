// Real two-way conversation against irc.austn.net via the App + a peer client.
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../dist/ui/App.js';
import { IrcService } from '../dist/irc/service.js';

const rand = Math.floor(Math.random() * 9000 + 1000);
const chan = `#achat-test-${rand}`;
const config = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  nick: `aclient${rand}`,
  realname: 'achat client',
  username: 'achat',
  channels: [],
};

const { stdin, lastFrame } = render(React.createElement(App, { config }));
const typeLine = (s) => {
  stdin.write(s);
  setTimeout(() => stdin.write('\r'), 120);
};

setTimeout(() => stdin.write('3'), 400); // guest
setTimeout(() => typeLine(`/join ${chan}`), 2500);

let peerStarted = false;
const peer = new IrcService({ ...config, nick: `peer${rand}` }, (e) => {
  if (e.type === 'registered') peer.join(chan);
  // guard: the server also auto-joins #general, so join/isSelf fires twice
  if (e.type === 'join' && e.isSelf && e.channel === chan && !peerStarted) {
    peerStarted = true;
    setTimeout(() => peer.say(chan, 'message one from peer'), 800);
    setTimeout(() => peer.say(chan, 'message two from peer'), 5500);
  }
});
setTimeout(() => peer.connect(), 4000);

setTimeout(() => typeLine('reply from achat'), 7000);

setTimeout(() => {
  console.log('=== LIVE CONVERSATION (real irc.austn.net) ===');
  console.log(lastFrame());
  try { peer.disconnect('done'); } catch {}
  process.exit(0);
}, 10000);
