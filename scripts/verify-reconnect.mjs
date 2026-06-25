// Verify real auto-reconnect: connect, drop the socket, observe recovery.
import { IrcService } from '../dist/irc/service.js';

const rand = Math.floor(Math.random() * 9000 + 1000);
const cfg = {
  host: 'irc.austn.net',
  port: 6697,
  tls: true,
  nick: `arecon${rand}`,
  realname: 'achat reconnect test',
  username: 'achat',
  channels: [],
};

let registrations = 0;
let sawReconnecting = false;
let dropped = false;

const svc = new IrcService(cfg, (e) => {
  if (e.type === 'status') {
    console.log(`[status] ${e.status}${e.detail ? ' — ' + e.detail : ''}`);
    if (e.status === 'reconnecting') sawReconnecting = true;
  }
  if (e.type === 'registered') {
    registrations++;
    console.log(`[registered #${registrations}] nick=${e.nick}`);
    if (registrations === 1) {
      // irc-framework only auto-reconnects if we were "safely registered"
      // (>5s), to avoid aKill loops — so drop after 6s.
      setTimeout(() => {
        console.log('--- dropping socket to simulate a network failure ---');
        dropped = true;
        svc.__debugDropSocket();
      }, 6000);
    }
  }
});

svc.connect();

setTimeout(() => {
  console.log('\n=== RESULT ===');
  console.log('registrations:', registrations, '| sawReconnecting:', sawReconnecting, '| dropped:', dropped);
  console.log(registrations >= 2 && sawReconnecting ? 'PASS ✅ recovered after drop' : 'CHECK ⚠️');
  svc.disconnect('done');
  setTimeout(() => process.exit(0), 500);
}, 28000);
