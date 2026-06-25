import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, hasAccount, generateGuestNick } from '../src/config.js';

test('loadConfig applies defaults when no file and no flags', () => {
  const cfg = loadConfig({ config: '/nonexistent/achat-test-config.json' });
  assert.equal(cfg.host, 'irc.austn.net');
  assert.equal(cfg.port, 6697);
  assert.equal(cfg.tls, true);
  assert.ok(cfg.nick.length > 0, 'nick should be auto-filled');
});

test('CLI flags override defaults', () => {
  const cfg = loadConfig({
    config: '/nonexistent/achat-test-config.json',
    host: 'irc.libera.chat',
    port: 7000,
    tls: false,
    nick: 'austin',
  });
  assert.equal(cfg.host, 'irc.libera.chat');
  assert.equal(cfg.port, 7000);
  assert.equal(cfg.tls, false);
  assert.equal(cfg.nick, 'austin');
});

test('hasAccount requires both account and password', () => {
  assert.equal(hasAccount({ ...base(), account: 'a' }), false);
  assert.equal(hasAccount({ ...base(), account: 'a', password: 'p' }), true);
  assert.equal(hasAccount(base()), false);
});

test('generateGuestNick produces guest-XXXX', () => {
  assert.match(generateGuestNick(), /^guest-[0-9a-f]{4}$/);
});

function base() {
  return {
    host: 'h',
    port: 1,
    tls: true,
    nick: 'n',
    realname: 'r',
    username: 'u',
    channels: [],
  };
}
