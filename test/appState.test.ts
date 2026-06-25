import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  reducer,
  applyEvent,
  activeBuffer,
  findBuffer,
  mentions,
  SERVER_BUFFER,
  type AppState,
} from '../src/state/appState.js';

function fresh(): AppState {
  return initialState({ nick: 'austin', host: 'irc.austn.net', port: 6697 });
}

const irc = (s: AppState, event: Parameters<typeof applyEvent>[1]) => reducer(s, { type: 'irc', event });

test('starts with only the server buffer, active', () => {
  const s = fresh();
  assert.equal(s.buffers.length, 1);
  assert.equal(s.active, SERVER_BUFFER);
});

test('self-join creates and activates the channel buffer', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#general', nick: 'austin', isSelf: true });
  assert.equal(s.active, '#general');
  const b = findBuffer(s, '#general')!;
  assert.equal(b.type, 'channel');
  assert.equal(b.joined, true);
  assert.equal(b.lines.length, 1);
});

test('message to a non-active channel bumps unread and detects mention', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#general', nick: 'austin', isSelf: true });
  // make server buffer active so #general is not active
  s = reducer(s, { type: 'setActive', name: SERVER_BUFFER });
  s = irc(s, { type: 'message', target: '#general', from: 'bob', text: 'hello austin!', isAction: false, isNotice: false });
  const b = findBuffer(s, '#general')!;
  assert.equal(b.unread, 1);
  assert.equal(b.hasMention, true);
});

test('messages to the active buffer do not increment unread', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#general', nick: 'austin', isSelf: true });
  s = irc(s, { type: 'message', target: '#general', from: 'bob', text: 'yo', isAction: false, isNotice: false });
  assert.equal(findBuffer(s, '#general')!.unread, 0);
});

test('setActive clears unread + mention', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#general', nick: 'austin', isSelf: true });
  s = reducer(s, { type: 'setActive', name: SERVER_BUFFER });
  s = irc(s, { type: 'message', target: '#general', from: 'bob', text: 'austin?', isAction: false, isNotice: false });
  s = reducer(s, { type: 'setActive', name: '#general' });
  const b = findBuffer(s, '#general')!;
  assert.equal(b.unread, 0);
  assert.equal(b.hasMention, false);
});

test('private message opens a query buffer', () => {
  let s = fresh();
  s = irc(s, { type: 'message', target: 'carol', from: 'carol', text: 'hi', isAction: false, isNotice: false });
  const b = findBuffer(s, 'carol')!;
  assert.equal(b.type, 'query');
});

test('names populates the user list; userlist-change replaces it', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#dev', nick: 'austin', isSelf: true });
  s = irc(s, { type: 'names', channel: '#dev', users: [{ nick: 'austin', prefix: '@' }, { nick: 'bob', prefix: '' }] });
  assert.equal(findBuffer(s, '#dev')!.users.length, 2);
  s = irc(s, { type: 'userlist-change', channel: '#dev', users: [{ nick: 'austin', prefix: '@' }] });
  assert.equal(findBuffer(s, '#dev')!.users.length, 1);
});

test('own nick change updates state.nick', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#g', nick: 'austin', isSelf: true });
  s = irc(s, { type: 'nick', oldNick: 'austin', newNick: 'austin2', isSelf: true, channels: ['#g'] });
  assert.equal(s.nick, 'austin2');
});

test('cycleFocus rotates channels -> messages -> users', () => {
  let s = fresh();
  s = reducer(s, { type: 'setFocus', focus: 'channels' });
  s = reducer(s, { type: 'cycleFocus', dir: 1 });
  assert.equal(s.focus, 'messages');
  s = reducer(s, { type: 'cycleFocus', dir: 1 });
  assert.equal(s.focus, 'users');
  s = reducer(s, { type: 'cycleFocus', dir: 1 });
  assert.equal(s.focus, 'channels');
});

test('channels selection + activateSelection switches active', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#a', nick: 'austin', isSelf: true });
  s = irc(s, { type: 'join', channel: '#b', nick: 'austin', isSelf: true });
  s = reducer(s, { type: 'setActive', name: SERVER_BUFFER });
  s = reducer(s, { type: 'setFocus', focus: 'channels' });
  // buffers: [server, #a, #b]; move selection to #a (index 1)
  s = reducer(s, { type: 'moveSelection', dir: 1 });
  assert.equal(s.channelIndex, 1);
  s = reducer(s, { type: 'activateSelection' });
  assert.equal(s.active, '#a');
});

test('scroll clamps to >= 0 and scrollToLatest resets', () => {
  let s = fresh();
  s = irc(s, { type: 'join', channel: '#g', nick: 'austin', isSelf: true });
  for (let i = 0; i < 5; i++) s = irc(s, { type: 'message', target: '#g', from: 'b', text: `m${i}`, isAction: false, isNotice: false });
  s = reducer(s, { type: 'scroll', delta: 3 });
  assert.equal(s.scroll, 3);
  s = reducer(s, { type: 'scroll', delta: -100 });
  assert.equal(s.scroll, 0);
  s = reducer(s, { type: 'scroll', delta: 2 });
  s = reducer(s, { type: 'scrollToLatest' });
  assert.equal(s.scroll, 0);
});

test('closeBuffer removes a query and moves active', () => {
  let s = fresh();
  s = irc(s, { type: 'message', target: 'carol', from: 'carol', text: 'hi', isAction: false, isNotice: false });
  s = reducer(s, { type: 'setActive', name: 'carol' });
  s = reducer(s, { type: 'closeBuffer', name: 'carol' });
  assert.equal(findBuffer(s, 'carol'), undefined);
  assert.notEqual(s.active, 'carol');
});

test('server buffer cannot be closed', () => {
  let s = fresh();
  s = reducer(s, { type: 'closeBuffer', name: SERVER_BUFFER });
  assert.ok(findBuffer(s, SERVER_BUFFER));
});

test('self-message to a new target creates a query buffer (not server)', () => {
  let s = fresh();
  s = irc(s, { type: 'self-message', target: 'dave', text: 'hello', isAction: false });
  const b = findBuffer(s, 'dave');
  assert.ok(b, 'query buffer should be created');
  assert.equal(b!.type, 'query');
  assert.equal(b!.lines.length, 1);
  assert.equal(findBuffer(s, SERVER_BUFFER)!.lines.length, 0);
});

test('renaming the active query buffer on NICK keeps it active', () => {
  let s = fresh();
  s = irc(s, { type: 'message', target: 'Bob', from: 'Bob', text: 'hi', isAction: false, isNotice: false });
  s = reducer(s, { type: 'setActive', name: 'Bob' });
  s = irc(s, { type: 'nick', oldNick: 'Bob', newNick: 'bobby', isSelf: false, channels: [] });
  assert.ok(findBuffer(s, 'bobby'), 'buffer renamed');
  assert.equal(s.active, 'bobby', 'active follows the rename');
  // activeBuffer should resolve to the renamed query, not fall back to server
  assert.equal(activeBuffer(s).name, 'bobby');
});

test('mentions() matches whole words case-insensitively', () => {
  assert.equal(mentions('hey austin!', 'austin'), true);
  assert.equal(mentions('AUSTIN: hi', 'austin'), true);
  assert.equal(mentions('austinx is not me', 'austin'), false);
  assert.equal(mentions('no mention here', 'austin'), false);
});

test('activeBuffer falls back to first buffer', () => {
  const s = fresh();
  assert.equal(activeBuffer(s).name, SERVER_BUFFER);
});
