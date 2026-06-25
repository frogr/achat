import { IrcService } from '../dist/irc/service.js';

const rand = Math.floor(Math.random() * 9000 + 1000);
const chan = `#dupchk${rand}`;
const base = { host: 'irc.austn.net', port: 6697, tls: true, realname: 'x', username: 'achat', channels: [] };

let count = 0;
const a = new IrcService({ ...base, nick: `a${rand}` }, (e) => {
  if (e.type === 'registered') a.join(chan);
  if (e.type === 'message') {
    count++;
    console.log(`A msg event #${count}: <${e.from}> ${e.text} (target=${e.target})`);
  }
  if (e.type === 'raw' && /single message/.test(e.line)) {
    console.log(`A RAW: ${e.line}`);
  }
  if (e.type === 'raw' && /JOIN|^:?\S* 001|away|BATCH/i.test(e.line) && /general/i.test(e.line)) {
    console.log(`A RAW(general): ${e.line}`);
  }
});
a.connect();

const b = new IrcService({ ...base, nick: `b${rand}` }, (e) => {
  if (e.type === 'registered') b.join(chan);
  if (e.type === 'join' && e.isSelf) setTimeout(() => b.say(chan, 'single message'), 800);
});
setTimeout(() => b.connect(), 2500);

setTimeout(() => {
  console.log(`\nTOTAL 'message' events at A: ${count} (expect 1)`);
  a.disconnect();
  b.disconnect();
  process.exit(0);
}, 7000);
