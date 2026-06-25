import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/ui/App.js';
import type { Config, IrcEvent, ServiceFactory } from '../src/types.js';

const base: Config = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  nick: 'tester',
  realname: 'achat user',
  username: 'achat',
  channels: [],
};

const tick = () => new Promise((r) => setTimeout(r, 15));

function makeFake() {
  const calls = { connect: 0, disconnect: 0, register: [] as Array<[string, string | undefined]> };
  let handler: ((e: IrcEvent) => void) | null = null;
  let nick = '';
  const factory: ServiceFactory = (cfg, h) => {
    handler = h;
    nick = cfg.nick;
    return {
      connect() {
        calls.connect++;
      },
      disconnect() {
        calls.disconnect++;
      },
      join() {},
      part() {},
      say() {},
      action() {},
      notice() {},
      changeNick() {},
      whois() {},
      raw() {},
      getNick: () => nick,
      register(pw: string, email?: string) {
        calls.register.push([pw, email]);
      },
      identify() {},
    };
  };
  return { factory, calls, emit: (e: IrcEvent) => handler?.(e) };
}

test('guest flow: choosing guest connects without an account', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = render(
    <App config={base} autoConnect={false} createService={fake.factory} />,
  );
  await tick();
  stdin.write('3'); // 3 = Continue as guest
  await tick();
  assert.equal(fake.calls.connect, 1, 'should connect once');
  fake.emit({ type: 'registered', nick: 'guest-ab12' });
  await tick();
  assert.match(lastFrame() ?? '', /guest/i);
  unmount();
});

test('wiring: live events render channel, messages, and users', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = render(
    <App config={base} autoConnect={false} createService={fake.factory} />,
  );
  await tick();
  stdin.write('3'); // guest
  await tick();
  fake.emit({ type: 'registered', nick: 'austin' });
  await tick();
  fake.emit({ type: 'join', channel: '#general', nick: 'austin', isSelf: true });
  fake.emit({
    type: 'names',
    channel: '#general',
    users: [
      { nick: 'austin', prefix: '@' },
      { nick: 'bob', prefix: '' },
    ],
  });
  fake.emit({ type: 'message', target: '#general', from: 'bob', text: 'hey there austin', isAction: false, isNotice: false });
  await tick();
  const frame = lastFrame() ?? '';
  assert.match(frame, /#general/);
  assert.match(frame, /Users \[3\]/);
  assert.match(frame, /bob/);
  assert.match(frame, /hey there austin/);
  unmount();
});

test('register flow: submits form, calls NickServ, detects success', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = render(
    <App config={base} autoConnect={false} createService={fake.factory} />,
  );
  await tick();
  stdin.write('2'); // 2 = Register
  await tick();
  // nick field is prefilled with config.nick; advance through the fields.
  stdin.write('\r'); // submit nick -> password
  await tick();
  stdin.write('hunter2'); // password
  await tick();
  stdin.write('\r'); // submit password -> email
  await tick();
  stdin.write('\r'); // submit email (optional) -> submit form
  await tick();
  assert.equal(fake.calls.connect, 1, 'register should start a connection');

  // Server registers us as a guest first; App should fire NickServ REGISTER.
  fake.emit({ type: 'registered', nick: 'tester' });
  await tick();
  assert.deepEqual(fake.calls.register[0], ['hunter2', '']);

  // NickServ confirms (arrives as a NOTICE from a nick => message event).
  fake.emit({
    type: 'message',
    target: 'NickServ',
    from: 'NickServ',
    text: 'Account created',
    isAction: false,
    isNotice: true,
  });
  await tick();
  const frame = lastFrame() ?? '';
  assert.match(frame, /registered/i);
  assert.match(frame, /Ctrl-S/);
  unmount();
});
