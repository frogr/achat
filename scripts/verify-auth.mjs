// End-to-end auth verification against the live server:
//   1. connect as guest, register a fresh account via NickServ
//   2. disconnect, reconnect via SASL with those credentials
//   3. confirm the server logs us in (account confirmed)
import { IrcService } from '../dist/irc/service.js';

const rand = Math.floor(Math.random() * 1e6).toString(36);
const nick = `achatbot${rand}`;
const password = `Achat-${rand}-${Math.floor(Math.random() * 1e6)}`;
const email = `${nick}@example.com`;

const baseCfg = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  realname: 'achat auth test',
  username: 'achat',
  channels: [],
};

const log = (...a) => console.log(...a);

function step1Register() {
  return new Promise((resolve) => {
    let done = false;
    const cfg = { ...baseCfg, nick };
    const svc = new IrcService(cfg, (e) => {
      if (e.type === 'registered') {
        log(`[1] on server as guest nick=${e.nick}; registering account…`);
        svc.register(password, email);
      }
      if (e.type === 'notice') {
        log(`[1][notice] ${e.from ?? 'server'}: ${e.text}`);
      }
      if (e.type === 'message') {
        log(`[1][message from ${e.from} notice=${e.isNotice} target=${e.target}] ${e.text}`);
      }
      if (e.type === 'error') log(`[1][error] ${e.text}`);
    });
    svc.connect();
    setTimeout(() => {
      if (done) return;
      done = true;
      svc.disconnect('reg done');
      setTimeout(resolve, 800);
    }, 7000);
  });
}

function step2Sasl() {
  return new Promise((resolve) => {
    let loggedIn = false;
    let account = null;
    const cfg = { ...baseCfg, nick, account: nick, password };
    const svc = new IrcService(cfg, (e) => {
      if (e.type === 'status') log(`[2][status] ${e.status}${e.detail ? ' — ' + e.detail : ''}`);
      if (e.type === 'notice') log(`[2][notice] ${e.text}`);
      if (e.type === 'registered') {
        account = e.account ?? null;
        log(`[2] registered nick=${e.nick} account=${e.account ?? '(none/guest)'}`);
      }
      if (e.type === 'error') log(`[2][error] ${e.text}`);
    });
    svc.connect();
    setTimeout(() => {
      svc.disconnect('sasl done');
      setTimeout(() => resolve({ loggedIn, account }), 500);
    }, 6000);
  });
}

log(`Using nick/account=${nick}`);
await step1Register();
log('--- reconnecting with SASL ---');
const res = await step2Sasl();
log('\n=== RESULT ===');
log('SASL account confirmed by server:', res.account);
log(res.account && res.account.toLowerCase() === nick.toLowerCase() ? 'PASS ✅' : 'CHECK ⚠️ (see notices above)');
process.exit(0);
