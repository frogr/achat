import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { ClientView } from '../src/ui/ClientView.js';
import { initialState, applyEvent, type AppState } from '../src/state/appState.js';

function placeholder(): AppState {
  let s = initialState({ nick: 'austin', host: 'irc.austn.net', port: 6697 });
  s = applyEvent(s, { type: 'status', status: 'registered', detail: 'as austin' });
  s = applyEvent(s, { type: 'join', channel: '#general', nick: 'austin', isSelf: true });
  s = applyEvent(s, {
    type: 'names',
    channel: '#general',
    users: [
      { nick: 'austin', prefix: '@' },
      { nick: 'bob', prefix: '' },
      { nick: 'carol', prefix: '+' },
    ],
  });
  s = applyEvent(s, { type: 'topic', channel: '#general', topic: 'welcome to general' });
  s = applyEvent(s, { type: 'message', target: '#general', from: 'bob', text: 'yo austin, how goes', isAction: false, isNotice: false });
  return s;
}

test('ClientView renders the three panels and content', () => {
  const s = placeholder();
  const { lastFrame, unmount } = render(
    <ClientView state={s} inputValue="" onInputChange={() => {}} onInputSubmit={() => {}} />,
  );
  const frame = lastFrame() ?? '';
  assert.match(frame, /Channels \[1\]/);
  assert.match(frame, /\[2\]/); // messages title
  assert.match(frame, /Users \[3\]/);
  assert.match(frame, /#general/);
  assert.match(frame, /bob/);
  assert.match(frame, /carol/);
  assert.match(frame, /austin/);
  unmount();
});
