// Render the ClientView to a static ASCII frame for visual inspection.
import React from 'react';
import { render } from 'ink-testing-library';
import { ClientView } from '../dist/ui/ClientView.js';
import { initialState, applyEvent } from '../dist/state/appState.js';

let s = initialState({ nick: 'austin', host: 'irc.austn.net', port: 6697 });
s = applyEvent(s, { type: 'status', status: 'registered', detail: 'as austin' });
s = applyEvent(s, { type: 'registered', nick: 'austin', account: 'austin' });
s = applyEvent(s, { type: 'join', channel: '#general', nick: 'austin', isSelf: true });
s = applyEvent(s, { type: 'join', channel: '#dev', nick: 'austin', isSelf: true });
s = applyEvent(s, { type: 'join', channel: '#random', nick: 'austin', isSelf: true });
s = applyEvent(s, {
  type: 'names',
  channel: '#random',
  users: [
    { nick: 'austin', prefix: '@' },
    { nick: 'bob', prefix: '' },
    { nick: 'carol', prefix: '+' },
    { nick: 'dave', prefix: '' },
  ],
});
s = applyEvent(s, { type: 'topic', channel: '#random', topic: 'anything goes here' });
s = applyEvent(s, { type: 'message', target: '#random', from: 'alice', text: 'hey', isAction: false, isNotice: false });
s = applyEvent(s, { type: 'message', target: '#random', from: 'bob', text: 'yo austin, how goes the terminal client?', isAction: false, isNotice: false });
s = applyEvent(s, { type: 'self-message', target: '#random', text: 'going great, almost done', isAction: false });
s = applyEvent(s, { type: 'message', target: '#dev', from: 'eve', text: 'ping', isAction: false, isNotice: false });

const { lastFrame } = render(
  React.createElement(ClientView, { state: s, inputValue: 'hello world', onInputChange: () => {}, onInputSubmit: () => {} }),
);
console.log(lastFrame());
process.exit(0);
