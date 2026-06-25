// Headless verification of the IRC service: connect, collect events, report.
// Usage: node scripts/verify-irc.mjs [--account NAME --password PW]
import { IrcService } from '../dist/irc/service.js';

const args = process.argv.slice(2);
const get = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};

const cfg = {
  host: get('--host') ?? 'irc.austn.net',
  port: Number(get('--port') ?? 6697),
  tls: true,
  nick: get('--nick') ?? `achat-v${Math.floor(Math.random() * 9000) + 1000}`,
  account: get('--account'),
  password: get('--password'),
  realname: 'achat verifier',
  username: 'achat',
  channels: [],
};

const joinChan = get('--join');
const counts = {};
let registered = false;
let gotMotd = false;
let loggedIn = false;
let names = 0;

const svc = new IrcService(cfg, (e) => {
  counts[e.type] = (counts[e.type] ?? 0) + 1;
  if (e.type === 'status') console.log(`[status] ${e.status}${e.detail ? ' — ' + e.detail : ''}`);
  if (e.type === 'registered') {
    registered = true;
    console.log(`[registered] nick=${e.nick} account=${e.account ?? '(guest)'}`);
    if (joinChan) setTimeout(() => svc.join(joinChan), 500);
  }
  if (e.type === 'motd') gotMotd = true;
  if (e.type === 'notice' && /logged in/i.test(e.text)) loggedIn = true;
  if (e.type === 'notice') console.log(`[notice] ${e.text}`);
  if (e.type === 'names') {
    names++;
    console.log(`[names] ${e.channel}: ${e.users.length} users (${e.users.slice(0, 5).map((u) => u.prefix + u.nick).join(', ')}${e.users.length > 5 ? ', …' : ''})`);
  }
  if (e.type === 'error') console.log(`[error] ${e.text}`);
});

svc.connect();

const dur = Number(get('--seconds') ?? 10) * 1000;
setTimeout(() => {
  console.log('\n=== SUMMARY ===');
  console.log('event counts:', JSON.stringify(counts));
  console.log('registered:', registered, '| motd:', gotMotd, '| loggedIn:', loggedIn, '| namesLists:', names);
  svc.disconnect('verify done');
  setTimeout(() => process.exit(0), 500);
}, dur);
