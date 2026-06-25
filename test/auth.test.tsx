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
  const calls = {
    connect: 0,
    disconnect: 0,
    register: [] as Array<[string, string | undefined]>,
    join: [] as string[],
    part: [] as string[],
    say: [] as Array<[string, string]>,
    action: [] as Array<[string, string]>,
    changeNick: [] as string[],
    whois: [] as string[],
  };
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
      join(ch: string) {
        calls.join.push(ch);
      },
      part(ch: string) {
        calls.part.push(ch);
      },
      say(t: string, m: string) {
        calls.say.push([t, m]);
      },
      action(t: string, m: string) {
        calls.action.push([t, m]);
      },
      notice() {},
      changeNick(n: string) {
        calls.changeNick.push(n);
        nick = n;
      },
      whois(n: string) {
        calls.whois.push(n);
      },
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

async function bootGuest(fake: ReturnType<typeof makeFake>) {
  const r = render(<App config={base} autoConnect={false} createService={fake.factory} />);
  await tick();
  r.stdin.write('3');
  await tick();
  fake.emit({ type: 'registered', nick: 'austin' });
  await tick();
  return r;
}

function type(stdin: { write: (s: string) => void }, s: string) {
  stdin.write(s);
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

test('navigation: focus channels, select, Enter switches active channel', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = render(
    <App config={base} autoConnect={false} createService={fake.factory} />,
  );
  await tick();
  stdin.write('3'); // guest
  await tick();
  fake.emit({ type: 'registered', nick: 'austin' });
  fake.emit({ type: 'join', channel: '#aaa', nick: 'austin', isSelf: true });
  fake.emit({ type: 'join', channel: '#bbb', nick: 'austin', isSelf: true });
  await tick();
  // active is #bbb (latest self-join); messages title reflects it
  assert.match(lastFrame() ?? '', /#bbb \[2\]/);

  stdin.write('1'); // focus channels (input empty)
  await tick();
  stdin.write('k'); // move selection up: #bbb -> #aaa
  await tick();
  stdin.write('\r'); // activate selection
  await tick();
  assert.match(lastFrame() ?? '', /#aaa \[2\]/);
  unmount();
});

test('navigation: typing then digit does not switch focus', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = render(
    <App config={base} autoConnect={false} createService={fake.factory} />,
  );
  await tick();
  stdin.write('3');
  await tick();
  fake.emit({ type: 'registered', nick: 'austin' });
  fake.emit({ type: 'join', channel: '#aaa', nick: 'austin', isSelf: true });
  await tick();
  stdin.write('hi'); // start typing
  await tick();
  stdin.write('1'); // should be literal, not a focus jump
  await tick();
  assert.match(lastFrame() ?? '', /hi1/);
  unmount();
});

test('navigation: Users panel Enter opens a query buffer', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = render(
    <App config={base} autoConnect={false} createService={fake.factory} />,
  );
  await tick();
  stdin.write('3'); // guest
  await tick();
  fake.emit({ type: 'registered', nick: 'austin' });
  fake.emit({ type: 'join', channel: '#aaa', nick: 'austin', isSelf: true });
  fake.emit({
    type: 'names',
    channel: '#aaa',
    users: [
      { nick: 'austin', prefix: '@' },
      { nick: 'zelda', prefix: '' },
    ],
  });
  await tick();
  stdin.write('3'); // focus users (input empty)
  await tick();
  stdin.write('j'); // select second user (zelda)
  await tick();
  stdin.write('\r'); // open query
  await tick();
  assert.match(lastFrame() ?? '', /zelda \[2\]/);
  unmount();
});

test('command /join joins and activates a channel', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = await bootGuest(fake);
  type(stdin, '/join #cats');
  await tick();
  stdin.write('\r');
  await tick();
  assert.deepEqual(fake.calls.join, ['#cats']);
  assert.match(lastFrame() ?? '', /#cats \[2\]/);
  unmount();
});

test('command /me sends an action; /nick changes nick; unknown errors', async () => {
  const fake = makeFake();
  const { stdin, lastFrame, unmount } = await bootGuest(fake);
  fake.emit({ type: 'join', channel: '#aaa', nick: 'austin', isSelf: true });
  await tick();
  type(stdin, '/me waves hello');
  await tick();
  stdin.write('\r');
  await tick();
  assert.deepEqual(fake.calls.action, [['#aaa', 'waves hello']]);

  type(stdin, '/nick bob');
  await tick();
  stdin.write('\r');
  await tick();
  assert.deepEqual(fake.calls.changeNick, ['bob']);

  type(stdin, '/bogus');
  await tick();
  stdin.write('\r');
  await tick();
  assert.match(lastFrame() ?? '', /Unknown command/);
  unmount();
});

test('plain text sends to the active channel; // escapes a slash', async () => {
  const fake = makeFake();
  const { stdin, unmount } = await bootGuest(fake);
  fake.emit({ type: 'join', channel: '#aaa', nick: 'austin', isSelf: true });
  await tick();
  type(stdin, 'hello world');
  await tick();
  stdin.write('\r');
  await tick();
  type(stdin, '//slashed');
  await tick();
  stdin.write('\r');
  await tick();
  assert.deepEqual(fake.calls.say, [
    ['#aaa', 'hello world'],
    ['#aaa', '/slashed'],
  ]);
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
